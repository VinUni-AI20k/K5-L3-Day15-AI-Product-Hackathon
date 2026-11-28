"""Ghi vết từng bước chạy của bot (auto-reply và soạn nháp AI) vào bảng `agent_run`.

Hợp đồng: `.swarm/specs/agent-run-trace.md`.
- Mỗi bước commit ngay trong một giao dịch ngắn độc lập để giao diện polling thấy trạng thái `running` theo thời gian thực.
- `detail` tối đa 200 ký tự, luôn lọc PII (SĐT/email qua `rules.scrub_pii`) và token trước khi lưu.
- Phục hồi sau sự cố: run kẹt ở trạng thái `running` quá 5 phút được hiển thị (và thu hồi) là `error`.
- Lưu trữ 7 ngày: poller định kỳ xoá các run cũ hơn 7 ngày qua `cleanup_old_runs`.
"""
from __future__ import annotations

import json
import re
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Iterable, Optional

import rules
import schedule
import store

VALID_KINDS = ("auto_reply", "draft")
_VALID_KIND_SET = frozenset(VALID_KINDS)

VALID_RUN_STATUSES = ("running", "done", "error")
_VALID_RUN_STATUS_SET = frozenset(VALID_RUN_STATUSES)

VALID_OUTCOMES = ("sent", "would_send", "can_ban", "draft_saved", "failed")
_VALID_OUTCOME_SET = frozenset(VALID_OUTCOMES)

VALID_STEP_STATUSES = ("running", "ok", "blocked", "skipped", "error")
_VALID_STEP_STATUS_SET = frozenset(VALID_STEP_STATUSES)

STEP_LABELS = {
    "read": "Đọc bình luận",
    "safety": "Kiểm tra an toàn",
    "intent": "Phân loại câu hỏi",
    "facts": "Tra dữ liệu sản phẩm",
    "compose": "Soạn câu trả lời",
    "output_check": "Kiểm tra đầu ra",
    "action": "Hành động",
}

STALE_RUNNING_SECONDS = 5 * 60
DEFAULT_RETENTION_DAYS = 7
MAX_DETAIL_CHARS = 200
MAX_LABEL_CHARS = 120

_TOKEN_PATTERNS = (
    # Tham số hoặc header dạng access_token=..., token: ..., api_key=..., secret=...
    re.compile(
        r"(?i)\b(?:access_token|page_token|user_token|refresh_token|auth_token|"
        r"api_key|apikey|client_secret|app_secret|token)\s*[:=]\s*['\"]?[^\s&'\",;}{]+['\"]?"
    ),
    # Authorization Bearer token
    re.compile(r"(?i)\bbearer\s+[A-Za-z0-9._~+/=-]{8,}"),
    # Facebook Graph token (EAA...)
    re.compile(r"\bEAA[A-Za-z0-9_-]{8,}\b"),
    # Khoá API phổ biến & JWT
    re.compile(
        r"\b(?:sk-[A-Za-z0-9_-]{12,}|AIza[0-9A-Za-z_-]{20,}|gh[pousr]_[A-Za-z0-9_]{16,}|"
        r"eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,})\b"
    ),
)


def init_agent_runs() -> None:
    """Đảm bảo bảng `agent_run` và các chỉ mục đã sẵn sàng (idempotent)."""
    store.init()


def _now() -> datetime:
    import vpost_api
    return vpost_api.now()


def _parse_utc(value: Any) -> Optional[datetime]:
    return store._parse_utc_ts(value)


def _iso_z(dt_or_str: Any) -> str:
    if isinstance(dt_or_str, datetime):
        dt = dt_or_str
    else:
        dt = _parse_utc(dt_or_str)
        if dt is None:
            dt = _now()
    return schedule.iso_z(dt)


def _scrub_tokens(text: str) -> str:
    out = text
    for rx in _TOKEN_PATTERNS:
        out = rx.sub("[đã ẩn]", out)
    return out


def sanitize_detail(detail: Optional[str], *, max_len: int = MAX_DETAIL_CHARS) -> Optional[str]:
    """Lọc SĐT, email (`rules.scrub_pii`), token và cắt tối đa `max_len` (200) ký tự."""
    if detail is None:
        return None
    s = re.sub(r"\s+", " ", str(detail)).strip()
    if not s:
        return None
    s = rules.scrub_pii(s)
    s = _scrub_tokens(s)
    s = re.sub(r"\s+", " ", s).strip()
    if not s:
        return None
    if len(s) > max_len:
        if max_len <= 1:
            return s[:max_len]
        s = s[: max_len - 1].rstrip() + "…"
    return s


def _sanitize_label(label: Optional[str], key: str) -> str:
    cleaned = sanitize_detail(label, max_len=MAX_LABEL_CHARS) if label is not None else None
    if cleaned:
        return cleaned
    return STEP_LABELS.get(key, str(key))


def _decode_steps(raw: Any) -> list[dict]:
    if isinstance(raw, list):
        items = raw
    elif isinstance(raw, str) and raw.strip():
        try:
            parsed = json.loads(raw)
            items = parsed if isinstance(parsed, list) else []
        except ValueError:
            items = []
    else:
        items = []
    out: list[dict] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        key = str(item.get("key") or "").strip()
        if not key:
            continue
        status = str(item.get("status") or "ok").strip()
        if status not in _VALID_STEP_STATUS_SET:
            status = "error"
        out.append({
            "key": key,
            "label": _sanitize_label(item.get("label"), key),
            "status": status,
            "detail": sanitize_detail(item.get("detail")),
            "at": _iso_z(item.get("at")),
        })
    return out


def _is_stale_running(row: dict, ref_dt: datetime) -> bool:
    if str(row.get("status") or "") != "running":
        return False
    started_dt = _parse_utc(row.get("started_at"))
    if started_dt is None:
        return True
    return (ref_dt - started_dt) > timedelta(seconds=STALE_RUNNING_SECONDS)


def _mark_running_steps_error(steps: list[dict]) -> list[dict]:
    out: list[dict] = []
    for st in steps:
        copy = dict(st)
        if copy.get("status") == "running":
            copy["status"] = "error"
            base = (copy.get("detail") or "").rstrip("….").strip()
            copy["detail"] = sanitize_detail(
                ("%s — quá thời gian chờ" % base) if base else "Quá thời gian chờ xử lý"
            )
        out.append(copy)
    return out


def _serialize_run(row: dict, *, ref_dt: datetime) -> dict:
    steps = _decode_steps(row.get("steps"))
    stale = _is_stale_running(row, ref_dt)
    if stale:
        status = "error"
        outcome = (row.get("outcome") or "").strip() or "failed"
        steps = _mark_running_steps_error(steps)
    else:
        status = str(row.get("status") or "error")
        if status not in _VALID_RUN_STATUS_SET:
            status = "error"
        raw_outcome = (row.get("outcome") or "").strip()
        outcome = raw_outcome if raw_outcome in _VALID_OUTCOME_SET else None

    finished_raw = (row.get("finished_at") or "").strip()
    finished_at = _iso_z(finished_raw) if finished_raw else None
    comment_raw = (row.get("comment_id") or "").strip()

    return {
        "id": str(row["id"]),
        "threadId": str(row["thread_id"]),
        "commentId": comment_raw or None,
        "kind": str(row["kind"]),
        "status": status,
        "outcome": outcome,
        "steps": steps,
        "startedAt": _iso_z(row.get("started_at")),
        "finishedAt": finished_at,
    }


def start_run(
    tenant_id: str,
    thread_id: str,
    kind: str,
    *,
    comment_id: Optional[str] = None,
    run_id: Optional[str] = None,
    now_dt: Optional[datetime] = None,
) -> str:
    """Tạo bản ghi `agent_run` trạng thái `running` và commit ngay trong giao dịch riêng."""
    if kind not in _VALID_KIND_SET:
        raise ValueError("kind không hợp lệ: %r" % (kind,))
    rid = (str(run_id).strip() if run_id else "") or str(uuid.uuid4())
    ts = _iso_z(now_dt or _now())
    cid = str(comment_id or "").strip()
    with store.connect() as c:
        c.execute(
            """insert into agent_run(
                 id, tenant_id, thread_id, comment_id, reply_message_id,
                 kind, status, outcome, steps, started_at, updated_at, finished_at
               ) values(%s,%s,%s,%s,'',%s,'running','','[]'::jsonb,%s,%s,'')""",
            (rid, str(tenant_id), str(thread_id), cid, kind, ts, ts),
        )
    return rid


def add_step(
    tenant_id: str,
    run_id: str,
    key: str,
    status: str,
    *,
    label: Optional[str] = None,
    detail: Optional[str] = None,
    now_dt: Optional[datetime] = None,
) -> dict:
    """Ghi một bước xử lý và commit ngay trong giao dịch ngắn riêng để client polling thấy tiến độ.

    Nếu bước cuối cùng đang có cùng `key` và `status == 'running'`, cập nhật tại chỗ thay vì nhân đôi.
    """
    clean_key = str(key or "").strip()
    if not clean_key:
        raise ValueError("step key không được để trống")
    if status not in _VALID_STEP_STATUS_SET:
        raise ValueError("step status không hợp lệ: %r" % (status,))

    ts = _iso_z(now_dt or _now())
    step = {
        "key": clean_key,
        "label": _sanitize_label(label, clean_key),
        "status": status,
        "detail": sanitize_detail(detail),
        "at": ts,
    }
    with store.connect() as c:
        row = c.execute(
            "select steps from agent_run where tenant_id=%s and id=%s for update",
            (str(tenant_id), str(run_id)),
        ).fetchone()
        if not row:
            return step
        steps = _decode_steps(row.get("steps"))
        if steps and steps[-1].get("key") == clean_key and steps[-1].get("status") == "running":
            steps[-1] = step
        else:
            steps.append(step)
        c.execute(
            "update agent_run set steps=%s::jsonb, updated_at=%s where tenant_id=%s and id=%s",
            (json.dumps(steps, ensure_ascii=False), ts, str(tenant_id), str(run_id)),
        )
    return step


def finish_run(
    tenant_id: str,
    run_id: str,
    *,
    status: str = "done",
    outcome: Optional[str] = None,
    reply_message_id: Optional[str] = None,
    now_dt: Optional[datetime] = None,
) -> Optional[dict]:
    """Kết thúc một run (`done` hoặc `error`) và commit ngay trong giao dịch riêng."""
    if status not in ("done", "error"):
        raise ValueError("finish status chỉ nhận 'done' hoặc 'error': %r" % (status,))
    if outcome is not None and outcome not in _VALID_OUTCOME_SET:
        raise ValueError("outcome không hợp lệ: %r" % (outcome,))

    ref_dt = now_dt or _now()
    ts = _iso_z(ref_dt)
    out_val = str(outcome or "")
    rep_id = str(reply_message_id or "").strip()

    with store.connect() as c:
        row = c.execute(
            "select * from agent_run where tenant_id=%s and id=%s for update",
            (str(tenant_id), str(run_id)),
        ).fetchone()
        if not row:
            return None
        steps = _decode_steps(row.get("steps"))
        if status == "error":
            steps = _mark_running_steps_error(steps)
        updated = c.execute(
            """update agent_run
               set status=%s,
                   outcome=%s,
                   reply_message_id=case when %s != '' then %s else reply_message_id end,
                   steps=%s::jsonb,
                   updated_at=%s,
                   finished_at=%s
               where tenant_id=%s and id=%s
               returning *""",
            (
                status,
                out_val,
                rep_id,
                rep_id,
                json.dumps(steps, ensure_ascii=False),
                ts,
                ts,
                str(tenant_id),
                str(run_id),
            ),
        ).fetchone()
    return _serialize_run(updated, ref_dt=ref_dt) if updated else None


def get_run(
    tenant_id: str,
    run_id: str,
    *,
    now_dt: Optional[datetime] = None,
) -> Optional[dict]:
    """Đọc một `AgentRun` theo `(tenant_id, run_id)` (áp dụng crash recovery > 5 phút)."""
    if not run_id:
        return None
    ref_dt = now_dt or _now()
    with store.connect() as c:
        row = c.execute(
            "select * from agent_run where tenant_id=%s and id=%s",
            (str(tenant_id), str(run_id)),
        ).fetchone()
    return _serialize_run(row, ref_dt=ref_dt) if row else None


def list_thread_runs(
    tenant_id: str,
    thread_id: str,
    *,
    limit: int = 10,
    now_dt: Optional[datetime] = None,
) -> list[dict]:
    """Danh sách run của một hội thoại, mới nhất trước (tối đa `limit`)."""
    lim = max(1, min(int(limit), 100))
    ref_dt = now_dt or _now()
    with store.connect() as c:
        rows = c.execute(
            "select * from agent_run where tenant_id=%s and thread_id=%s "
            "order by started_at desc, seq desc limit %s",
            (str(tenant_id), str(thread_id), lim),
        ).fetchall()
    return [_serialize_run(r, ref_dt=ref_dt) for r in rows]


def latest_runs_for_threads(
    tenant_id: str,
    thread_ids: Iterable[str],
    *,
    now_dt: Optional[datetime] = None,
) -> dict[str, dict]:
    """Trả dict `thread_id -> AgentRun` mới nhất cho danh sách hội thoại trong 1 truy vấn."""
    ids = list(dict.fromkeys(str(x).strip() for x in (thread_ids or ()) if str(x).strip()))
    if not ids:
        return {}
    ref_dt = now_dt or _now()
    with store.connect() as c:
        rows = c.execute(
            """select distinct on (thread_id) *
               from agent_run
               where tenant_id=%s and thread_id = any(%s)
               order by thread_id, started_at desc, seq desc""",
            (str(tenant_id), ids),
        ).fetchall()
    return {str(r["thread_id"]): _serialize_run(r, ref_dt=ref_dt) for r in rows}


def running_thread_ids(
    tenant_id: str,
    *,
    now_dt: Optional[datetime] = None,
) -> list[str]:
    """Danh sách `threadId` đang có run ở trạng thái `running` (bỏ run quá 5 phút do crash)."""
    ref_dt = now_dt or _now()
    with store.connect() as c:
        rows = c.execute(
            "select thread_id, status, started_at from agent_run "
            "where tenant_id=%s and status='running' "
            "order by started_at desc, seq desc",
            (str(tenant_id),),
        ).fetchall()
    seen: set[str] = set()
    out: list[str] = []
    for r in rows:
        if _is_stale_running(r, ref_dt):
            continue
        tid = str(r["thread_id"])
        if tid and tid not in seen:
            seen.add(tid)
            out.append(tid)
    return out


def message_run_ids(
    tenant_id: str,
    thread_id: str,
    customer_comment_ids: Iterable[str] = (),
    page_message_ids: Iterable[str] = (),
) -> tuple[dict[str, str], dict[str, str]]:
    """Tra `agentRunId` mới nhất cho tin nhắn khách (`comment_id`) và tin nhắn Page bot gửi (`reply_message_id`)."""
    cust_ids = list(dict.fromkeys(str(x).strip() for x in (customer_comment_ids or ()) if str(x).strip()))
    page_ids = list(dict.fromkeys(str(x).strip() for x in (page_message_ids or ()) if str(x).strip()))
    if not cust_ids and not page_ids:
        return {}, {}
    clauses = []
    params: list[Any] = [str(tenant_id), str(thread_id)]
    if cust_ids:
        clauses.append("comment_id = any(%s)")
        params.append(cust_ids)
    if page_ids:
        clauses.append("reply_message_id = any(%s)")
        params.append(page_ids)
    query = (
        "select id, comment_id, reply_message_id from agent_run "
        "where tenant_id=%s and thread_id=%s and (" + " or ".join(clauses) + ") "
        "order by started_at desc, seq desc"
    )
    with store.connect() as c:
        rows = c.execute(query, tuple(params)).fetchall()

    cust_set = set(cust_ids)
    page_set = set(page_ids)
    by_comment: dict[str, str] = {}
    by_reply: dict[str, str] = {}
    for r in rows:
        rid = str(r["id"])
        cid = str(r.get("comment_id") or "").strip()
        rep_id = str(r.get("reply_message_id") or "").strip()
        if cid and cid in cust_set and cid not in by_comment:
            by_comment[cid] = rid
        if rep_id and rep_id in page_set and rep_id not in by_reply:
            by_reply[rep_id] = rid
    return by_comment, by_reply


def recover_stale_runs(
    *,
    tenant_id: Optional[str] = None,
    now_dt: Optional[datetime] = None,
) -> int:
    """Chuyển vĩnh viễn các run `running` quá 5 phút sang `error` trong DB; trả số lượng đã thu hồi."""
    ref_dt = now_dt or _now()
    ts = _iso_z(ref_dt)
    recovered = 0
    with store.connect() as c:
        if tenant_id is not None:
            rows = c.execute(
                "select id, tenant_id, status, outcome, steps, started_at from agent_run "
                "where tenant_id=%s and status='running' for update skip locked",
                (str(tenant_id),),
            ).fetchall()
        else:
            rows = c.execute(
                "select id, tenant_id, status, outcome, steps, started_at from agent_run "
                "where status='running' for update skip locked"
            ).fetchall()
        for r in rows:
            if not _is_stale_running(r, ref_dt):
                continue
            steps = _mark_running_steps_error(_decode_steps(r.get("steps")))
            outcome = (r.get("outcome") or "").strip() or "failed"
            cur = c.execute(
                "update agent_run set status='error', outcome=%s, steps=%s::jsonb, "
                "updated_at=%s, finished_at=%s "
                "where tenant_id=%s and id=%s and status='running'",
                (outcome, json.dumps(steps, ensure_ascii=False), ts, ts, r["tenant_id"], r["id"]),
            )
            recovered += cur.rowcount
    return recovered


def cleanup_old_runs(
    *,
    retention_days: int = DEFAULT_RETENTION_DAYS,
    tenant_id: Optional[str] = None,
    now_dt: Optional[datetime] = None,
) -> int:
    """Xoá các `agent_run` cũ hơn `retention_days` (mặc định 7 ngày). Trả số bản ghi đã xoá."""
    days = max(0, int(retention_days))
    ref_dt = now_dt or _now()
    cutoff_dt = ref_dt - timedelta(days=days)
    with store.connect() as c:
        if tenant_id is not None:
            rows = c.execute(
                "select id, started_at from agent_run where tenant_id=%s",
                (str(tenant_id),),
            ).fetchall()
        else:
            rows = c.execute("select id, started_at from agent_run").fetchall()
        stale_ids = []
        for r in rows:
            dt = _parse_utc(r.get("started_at"))
            if dt is not None and dt < cutoff_dt:
                stale_ids.append(r["id"])
        if not stale_ids:
            return 0
        if tenant_id is not None:
            cur = c.execute(
                "delete from agent_run where tenant_id=%s and id = any(%s)",
                (str(tenant_id), stale_ids),
            )
        else:
            cur = c.execute(
                "delete from agent_run where id = any(%s)",
                (stale_ids,),
            )
    return cur.rowcount
