"""Background poller đồng bộ bình luận Facebook, tự kiểm duyệt và soạn sẵn nháp AI cho hội thoại cần trả lời.

- Chạy một luồng nền duy nhất từ `server.py` (tắt hoàn toàn khi `VPOST_COMMENT_SYNC_SECONDS=0`).
- Mỗi lượt (tick):
    1. Giữ khoá tư vấn PostgreSQL (`pg_try_advisory_lock`) để chỉ một instance chạy tại một thời điểm.
    2. Đồng bộ bình luận + tự kiểm duyệt qua `vpost_api.run_comment_sync` (gọi hàm trực tiếp, không gọi HTTP).
    3. Soạn sẵn nháp AI cho tối đa `VPOST_AUTO_DRAFT_MAX_PER_TICK` hội thoại cần trả lời mà chưa có nháp mới hơn
       tin nhắn khách gần nhất. KHÔNG BAO GIỜ tự gửi trả lời lên Facebook.
- Khi gặp `RATE_LIMITED`: nhân đôi chu kỳ chờ (tối đa 15 phút), đặt lại chu kỳ gốc khi một lượt thành công.
- Mọi ngoại lệ đều được ghi log theo kiểu `comment_*` (không ghi nội dung tin nhắn hay token) và không làm chết luồng.
"""
from __future__ import annotations

import atexit
from contextlib import contextmanager
import logging
import os
import threading
from typing import Optional

import psycopg

import agent_runs
import auto_reply
import store
import vpost_api

log = logging.getLogger("vpost.comments")

DEFAULT_SYNC_SECONDS = 60
DEFAULT_AUTO_DRAFT_MAX_PER_TICK = 10
MAX_BACKOFF_SECONDS = 15 * 60
LOCK_NAME = "comment_poller"

_state_lock = threading.Lock()
_thread: Optional[threading.Thread] = None
_stop_event: Optional[threading.Event] = None
_tls = threading.local()


def sync_interval_seconds() -> int:
    raw = (os.environ.get("VPOST_COMMENT_SYNC_SECONDS") or "").strip()
    if not raw:
        return DEFAULT_SYNC_SECONDS
    try:
        val = int(raw)
    except ValueError:
        log.warning("comment_poller_invalid_config key=VPOST_COMMENT_SYNC_SECONDS")
        return DEFAULT_SYNC_SECONDS
    return max(0, val)


def auto_draft_max_per_tick() -> int:
    raw = (os.environ.get("VPOST_AUTO_DRAFT_MAX_PER_TICK") or "").strip()
    if not raw:
        return DEFAULT_AUTO_DRAFT_MAX_PER_TICK
    try:
        val = int(raw)
    except ValueError:
        log.warning("comment_poller_invalid_config key=VPOST_AUTO_DRAFT_MAX_PER_TICK")
        return DEFAULT_AUTO_DRAFT_MAX_PER_TICK
    return max(0, val)


def next_interval(current_interval: float, base_interval: float, rate_limited: bool) -> float:
    base = max(1.0, float(base_interval))
    if rate_limited:
        cur = max(base, float(current_interval))
        return min(float(MAX_BACKOFF_SECONDS), cur * 2.0)
    return base


def _lock_key() -> str:
    return "%s:%s" % (store.schema_name(), LOCK_NAME)


@contextmanager
def _advisory_lock():
    """Giữ khoá tư vấn mức phiên PostgreSQL không chặn để tránh nhiều tiến trình chạy trùng tick."""
    key = _lock_key()
    conn = None
    locked = False
    try:
        conn = psycopg.connect(store._dsn(), connect_timeout=store.CONNECT_TIMEOUT, autocommit=True)
        row = conn.execute("select pg_try_advisory_lock(hashtextextended(%s, 0))", (key,)).fetchone()
        locked = bool(row and row[0])
        yield locked
    finally:
        if conn is not None:
            if locked:
                try:
                    conn.execute("select pg_advisory_unlock(hashtextextended(%s, 0))", (key,))
                except Exception:
                    pass
            try:
                conn.close()
            except Exception:
                pass


def run_tick(stop_event: Optional[threading.Event] = None) -> dict:
    """Chạy một lượt đồng bộ + tự kiểm duyệt + soạn nháp AI + pipeline tự động trả lời (chỉ gửi trên Page đã bật live)."""
    ev = stop_event if stop_event is not None else getattr(_tls, "stop_event", None)
    summary = {
        "locked": False,
        "syncedPosts": 0,
        "newComments": 0,
        "updatedComments": 0,
        "draftsCreated": 0,
        "draftsFlagged": 0,
        "draftErrors": 0,
        "autoReplied": 0,
        "autoWouldSend": 0,
        "autoTagged": 0,
        "autoFailed": 0,
        "rateLimited": False,
    }
    with _advisory_lock() as acquired:
        if not acquired:
            log.info("comment_poller_lock_busy tenant=%s", vpost_api.TENANT_ID)
            return summary
        summary["locked"] = True

        new_customer_ids: list[str] = []
        sync_res, rate_limited = vpost_api.run_comment_sync(include_meta=True, out_new_ids=new_customer_ids)
        summary["syncedPosts"] = int(sync_res.get("syncedPosts", 0))
        summary["newComments"] = int(sync_res.get("newComments", 0))
        summary["updatedComments"] = int(sync_res.get("updatedComments", 0))
        summary["rateLimited"] = bool(rate_limited)

        # Tìm bình luận <24h từng bị bỏ qua duy nhất vì Page chưa bật tự động trả lời để đánh giá lại đúng 1 lần
        now_dt = vpost_api.now()
        retry_disabled_ids: list[str] = []
        if not (ev is not None and ev.is_set()):
            try:
                retry_disabled_ids = auto_reply.find_retryable_disabled_comments(
                    vpost_api.TENANT_ID,
                    now_dt=now_dt,
                )
            except Exception as e:
                summary["autoFailed"] += 1
                log.warning(
                    "comment_poller_auto_reply_retry_scan_error tenant=%s err=%s",
                    vpost_api.TENANT_ID,
                    type(e).__name__,
                )

        auto_reply_ids = list(dict.fromkeys(list(new_customer_ids) + list(retry_disabled_ids)))

        # Chạy auto-reply TRƯỚC bước soạn nháp AI để thu hẹp cửa sổ đua với nhân viên
        # và không gọi LLM lãng phí cho hội thoại vừa được tự động trả lời.
        if auto_reply_ids and not (ev is not None and ev.is_set()):
            try:
                ar_res = auto_reply.run_auto_reply(
                    vpost_api.TENANT_ID,
                    auto_reply_ids,
                    stop_event=ev,
                    now_dt=now_dt,
                )
                summary["autoReplied"] = int(ar_res.get("sent", 0))
                summary["autoWouldSend"] = int(ar_res.get("wouldSend", 0))
                summary["autoTagged"] = int(ar_res.get("tagged", 0))
                summary["autoFailed"] = int(ar_res.get("failed", 0))
                if ar_res.get("rateLimited"):
                    summary["rateLimited"] = True
            except Exception as e:
                summary["autoFailed"] += 1
                log.warning(
                    "comment_poller_auto_reply_error tenant=%s err=%s",
                    vpost_api.TENANT_ID,
                    type(e).__name__,
                )

        max_drafts = auto_draft_max_per_tick()
        if max_drafts > 0 and not (ev is not None and ev.is_set()):
            candidate_ids = vpost_api.threads_needing_auto_draft(max_drafts)
            for thread_id in candidate_ids:
                if ev is not None and ev.is_set():
                    log.info("comment_poller_tick_interrupted tenant=%s", vpost_api.TENANT_ID)
                    break
                try:
                    status, _err = vpost_api.generate_thread_draft(thread_id)
                    if status == "draft":
                        summary["draftsCreated"] += 1
                    elif status == "flagged":
                        summary["draftsFlagged"] += 1
                except Exception as e:
                    summary["draftErrors"] += 1
                    log.warning(
                        "comment_poller_draft_error tenant=%s thread_id=%s err=%s",
                        vpost_api.TENANT_ID,
                        thread_id,
                        type(e).__name__,
                    )

        if not (ev is not None and ev.is_set()):
            try:
                now_dt = vpost_api.now()
                agent_runs.recover_stale_runs(tenant_id=vpost_api.TENANT_ID, now_dt=now_dt)
                pruned_runs = agent_runs.cleanup_old_runs(tenant_id=vpost_api.TENANT_ID, now_dt=now_dt)
                if pruned_runs:
                    log.info(
                        "comment_poller_agent_runs_pruned tenant=%s deleted=%d",
                        vpost_api.TENANT_ID,
                        pruned_runs,
                    )
            except Exception as e:
                log.warning(
                    "comment_poller_agent_runs_cleanup_error tenant=%s err=%s",
                    vpost_api.TENANT_ID,
                    type(e).__name__,
                )

        log.info(
            "comment_poller_tick tenant=%s synced_posts=%d new_comments=%d updated_comments=%d "
            "drafts_created=%d drafts_flagged=%d draft_errors=%d auto_replied=%d auto_would_send=%d "
            "auto_tagged=%d auto_failed=%d rate_limited=%s",
            vpost_api.TENANT_ID,
            summary["syncedPosts"],
            summary["newComments"],
            summary["updatedComments"],
            summary["draftsCreated"],
            summary["draftsFlagged"],
            summary["draftErrors"],
            summary["autoReplied"],
            summary["autoWouldSend"],
            summary["autoTagged"],
            summary["autoFailed"],
            summary["rateLimited"],
        )
    return summary


def _loop(base_interval: int, stop_event: threading.Event) -> None:
    interval = float(base_interval)
    _tls.stop_event = stop_event
    try:
        while not stop_event.wait(timeout=interval):
            try:
                res = run_tick()
                if res.get("locked"):
                    interval = next_interval(interval, base_interval, bool(res.get("rateLimited")))
            except Exception as e:
                log.warning(
                    "comment_poller_error tenant=%s err=%s",
                    vpost_api.TENANT_ID,
                    type(e).__name__,
                )
    finally:
        _tls.stop_event = None


def is_running() -> bool:
    with _state_lock:
        return bool(_thread is not None and _thread.is_alive())


def start() -> Optional[threading.Thread]:
    """Khởi chạy luồng nền poller (idempotent). Trả None nếu VPOST_COMMENT_SYNC_SECONDS=0."""
    global _thread, _stop_event
    with _state_lock:
        if _thread is not None and _thread.is_alive():
            return _thread
        interval = sync_interval_seconds()
        if interval <= 0:
            log.info("comment_poller_disabled tenant=%s", vpost_api.TENANT_ID)
            return None
        stop_ev = threading.Event()
        t = threading.Thread(
            target=_loop,
            args=(interval, stop_ev),
            name="vpost-comment-poller",
            daemon=True,
        )
        _stop_event = stop_ev
        _thread = t
        t.start()
        log.info(
            "comment_poller_started tenant=%s interval_sec=%d max_drafts=%d",
            vpost_api.TENANT_ID,
            interval,
            auto_draft_max_per_tick(),
        )
        return t


def stop(timeout: float = 5.0) -> None:
    """Dừng luồng nền poller an toàn."""
    global _thread, _stop_event
    with _state_lock:
        ev = _stop_event
        t = _thread
        _stop_event = None
        _thread = None
    if ev is not None:
        ev.set()
    if t is not None and t.is_alive() and t is not threading.current_thread():
        t.join(timeout=timeout)


atexit.register(stop)
