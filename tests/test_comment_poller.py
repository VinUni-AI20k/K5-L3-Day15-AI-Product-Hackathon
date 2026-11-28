"""Tests for background comment poller (sync -> auto-moderation -> AI draft, backoff, advisory lock, lifecycle)."""
from __future__ import annotations

import json
import logging
import os
import sys
import tempfile
import threading
from datetime import datetime, timedelta, timezone

import psycopg
from psycopg import sql
import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "codebase"))

import store  # noqa: E402

_pg_skip = os.environ.get("_VPOST_PG_UNAVAILABLE")
if _pg_skip is None:
    _ok, _pg_err = store.check_connection()
    _pg_skip = "" if _ok else _pg_err
if _pg_skip:
    pytest.skip("PostgreSQL unreachable (%s)" % _pg_skip, allow_module_level=True)

import tools  # noqa: E402

if "server" not in sys.modules:
    tools.UPLOADS = tempfile.mkdtemp()

from fastapi.testclient import TestClient  # noqa: E402

import comment_poller  # noqa: E402
import facebook  # noqa: E402
import inbox_store  # noqa: E402
import moderation_api  # noqa: E402
import moderation_store  # noqa: E402
import server  # noqa: E402
import vpost_api  # noqa: E402

client = TestClient(server.app)
IMG = "https://lh3.googleusercontent.com/d/abc123"
PAGE_ID = "123"
CHANNEL_ID = "fb-123"
PAGE_TOKEN = "EAAG_SECRET_POLLER_TOKEN_NEVER_LOG"

ROW_G1 = {
    "ma_sp": "G1",
    "ten_sp": "Đầm Voan Hoa G1",
    "loai": "Váy",
    "gia_ban": "890.000đ",
    "gia_te": "50",
    "size": "S-L",
    "mau": "Đen, Trắng",
    "chat_lieu": "Voan",
    "mo_ta": "Váy xoè 2 lớp, kéo khoá sau.",
    "anh": IMG,
    "page": "diu-may",
    "prompt": "",
}
INV_DEFAULT = {
    "G1": [
        {"mau": "Đen", "size": "S", "ton": 3, "trang_thai": "Còn hàng"},
        {"mau": "Đen", "size": "M", "ton": 3, "trang_thai": "Còn hàng"},
        {"mau": "Đen", "size": "L", "ton": 3, "trang_thai": "Còn hàng"},
    ]
}

_ORIG_FB_LIST = facebook.list_comments
_ORIG_FB_REPLY = facebook.reply_comment
_ORIG_FB_HIDE = facebook.hide_comment
_ORIG_VPOST_MODEL = vpost_api.MODEL


def iso_ago(hours=0, minutes=0, seconds=0):
    dt = datetime.now(timezone.utc) - timedelta(hours=hours, minutes=minutes, seconds=seconds)
    return dt.strftime("%Y-%m-%dT%H:%M:%S.000Z")


def seed_page_and_post(fb_post_id="123_1001", job_id="job-1"):
    store.save_fb_pages([{"id": PAGE_ID, "name": "WorkHardToday", "access_token": PAGE_TOKEN}], "UTOKEN", iso_ago())
    pub = iso_ago(hours=2)
    ts = iso_ago(hours=3)
    store.create_post_batch(
        {"id": "batch-" + job_id, "product_code": "G1", "color": "Đen", "format": "image_post", "created_at": ts},
        [{
            "id": job_id,
            "batch_id": "batch-" + job_id,
            "product_code": "G1",
            "color": "Đen",
            "format": "image_post",
            "channel_id": CHANNEL_ID,
            "caption": "Đầm Voan Hoa G1 giá 890.000đ",
            "media": [IMG],
            "status": "published",
            "scheduled_at": None,
            "fb_post_id": fb_post_id,
            "published_url": "https://www.facebook.com/" + fb_post_id,
            "published_at": pub,
            "error_code": None,
            "user_message": "",
            "attempt_count": 1,
            "created_at": ts,
            "updated_at": ts,
        }],
    )


class FakeModel:
    def __init__(self, reply_text="Dạ Đầm Voan Hoa G1 giá 890.000đ còn màu đen size S, M, L bạn nhé!"):
        self.reply_text = reply_text
        self.calls = []

    def __call__(self, system, user, schema=None):
        self.calls.append({"system": system, "user": user, "schema": schema})
        return {
            "text": json.dumps({
                "decision": "reply",
                "flag_reasons": [],
                "reply": self.reply_text,
                "facts_used": ["F1", "F3", "F4", "F5"],
            }, ensure_ascii=False),
            "model": "gpt-poller-test",
            "tokens_in": 90,
            "tokens_out": 35,
        }


def setup_function(_):
    comment_poller.stop()
    store.init()
    moderation_store.init_moderation()
    inbox_store.init_inbox()
    with store.connect() as c:
        tables = [
            r["tablename"]
            for r in c.execute("select tablename from pg_tables where schemaname = current_schema()")
        ]
        for t in tables:
            c.execute(sql.SQL("delete from {}").format(sql.Identifier(t)))
    facebook.list_comments = _ORIG_FB_LIST
    facebook.reply_comment = _ORIG_FB_REPLY
    facebook.hide_comment = _ORIG_FB_HIDE
    vpost_api.MODEL = _ORIG_VPOST_MODEL
    tools.inventory = lambda: {k: [dict(v) for v in vs] for k, vs in INV_DEFAULT.items()}
    vpost_api.load_catalog([dict(ROW_G1)])
    client.cookies.clear()


def teardown_function(_):
    comment_poller.stop()
    facebook.list_comments = _ORIG_FB_LIST
    facebook.reply_comment = _ORIG_FB_REPLY
    facebook.hide_comment = _ORIG_FB_HIDE
    vpost_api.MODEL = _ORIG_VPOST_MODEL
    client.cookies.clear()


def test_poller_tick_syncs_drafts_updates_drafts_ready_and_never_sends(caplog, monkeypatch):
    # Isolate auto-draft assertions from default-on AI moderation calls
    monkeypatch.setenv("VPOST_AUTO_MODERATION_DISABLED", "1")
    seed_page_and_post()
    secret_msg = "UNIQUE_CUSTOMER_SECRET_TEXT_999 mẫu này giá bao nhiêu ạ?"

    # Starting updates cursor before tick
    cur0 = client.get("/api/comments/updates").json()["cursor"]

    send_calls = []
    facebook.reply_comment = lambda *a, **kw: (send_calls.append(a), "never")[1]
    facebook.list_comments = lambda fb_post_id, token, since=None: [
        {
            "id": "c_poll_1",
            "message": secret_msg,
            "created_time": iso_ago(minutes=5),
            "from": {"id": "u1", "name": "Lan Anh"},
            "permalink_url": "https://www.facebook.com/123_1001?comment_id=c_poll_1",
            "is_hidden": False,
            "can_comment": True,
        }
    ]
    model = FakeModel()
    vpost_api.MODEL = model
    caplog.set_level(logging.INFO, logger="vpost.comments")

    res1 = comment_poller.run_tick()
    assert res1["locked"] is True
    assert res1["syncedPosts"] == 1
    assert res1["newComments"] == 1
    assert res1["draftsCreated"] == 1
    assert res1["rateLimited"] is False
    # Poller NEVER sends replies
    assert send_calls == []
    assert len(model.calls) == 1

    # Appears in updates items AND draftsReady
    u1 = client.get(f"/api/comments/updates?since={cur0}").json()
    assert [i["messageId"] for i in u1["items"]] == ["c_poll_1"]
    assert u1["draftsReady"] == ["c_poll_1"]

    # Thread has the pre-generated AI draft
    th = client.get("/api/comments/threads/c_poll_1").json()["thread"]
    assert th["draft"] is not None and th["draft"]["status"] == "draft"
    assert "890.000đ" in th["draft"]["text"]

    # Logs follow comment_* style and never leak message text or tokens
    assert any("comment_poller_tick" in rec.message for rec in caplog.records)
    for rec in caplog.records:
        assert PAGE_TOKEN not in rec.message
        assert "UNIQUE_CUSTOMER_SECRET_TEXT_999" not in rec.message

    # Second tick with no new customer message does NOT re-draft
    res2 = comment_poller.run_tick()
    assert res2["draftsCreated"] == 0
    assert len(model.calls) == 1

    # Newer follow-up customer message triggers a fresh draft with whole thread history
    future_ts = (datetime.now(timezone.utc) + timedelta(seconds=10)).strftime("%Y-%m-%dT%H:%M:%S+0000")
    facebook.list_comments = lambda fb_post_id, token, since=None: [
        {
            "id": "c_poll_2",
            "message": "Còn size M màu đen không shop?",
            "created_time": future_ts,
            "from": {"id": "u1", "name": "Lan Anh"},
            "parent": {"id": "c_poll_1"},
        }
    ]
    res3 = comment_poller.run_tick()
    assert res3["newComments"] == 1 and res3["draftsCreated"] == 1
    assert len(model.calls) == 2
    assert "Còn size M màu đen không shop?" in model.calls[1]["user"]
    assert secret_msg in model.calls[1]["user"]
    assert send_calls == []


def test_poller_respects_max_drafts_per_tick(monkeypatch):
    # Isolate auto-draft cap assertions from default-on AI moderation calls
    monkeypatch.setenv("VPOST_AUTO_MODERATION_DISABLED", "1")
    seed_page_and_post()
    monkeypatch.setenv("VPOST_AUTO_DRAFT_MAX_PER_TICK", "2")
    facebook.list_comments = lambda fb_post_id, token, since=None: [
        {"id": f"c_{i}", "message": f"Hỏi giá {i}?", "created_time": iso_ago(minutes=20 - i), "from": {"id": f"u{i}", "name": f"K{i}"}}
        for i in range(5)
    ]
    model = FakeModel()
    vpost_api.MODEL = model

    r1 = comment_poller.run_tick()
    assert r1["newComments"] == 5 and r1["draftsCreated"] == 2
    assert len(model.calls) == 2

    facebook.list_comments = lambda fb_post_id, token, since=None: []
    r2 = comment_poller.run_tick()
    assert r2["draftsCreated"] == 2
    assert len(model.calls) == 4


def test_poller_disabled_when_sync_seconds_zero_and_single_thread_lifecycle(monkeypatch):
    monkeypatch.setenv("VPOST_COMMENT_SYNC_SECONDS", "0")
    assert comment_poller.start() is None
    assert comment_poller.is_running() is False

    # Server lifespan also starts nothing when VPOST_COMMENT_SYNC_SECONDS=0
    with TestClient(server.app):
        assert comment_poller.is_running() is False

    # Non-zero starts exactly one daemon thread; repeated start() returns the same thread
    monkeypatch.setenv("VPOST_COMMENT_SYNC_SECONDS", "300")
    t1 = comment_poller.start()
    assert t1 is not None and t1.is_alive() and t1.daemon is True
    t2 = comment_poller.start()
    assert t2 is t1
    assert comment_poller.is_running() is True

    comment_poller.stop()
    assert comment_poller.is_running() is False


def test_poller_rate_limit_backoff_and_reset():
    # Pure backoff progression: 60 -> 120 -> 240 -> 480 -> 900 -> 900, reset -> 60
    base = 60
    cur = 60
    seq = []
    for _ in range(6):
        cur = comment_poller.next_interval(cur, base, rate_limited=True)
        seq.append(cur)
    assert seq == [120.0, 240.0, 480.0, 900.0, 900.0, 900.0]
    assert comment_poller.next_interval(cur, base, rate_limited=False) == 60.0

    # End-to-end tick reports rateLimited=True on Facebook RATE_LIMITED and False on recovery
    seed_page_and_post()
    facebook.list_comments = lambda *a, **kw: (_ for _ in ()).throw(
        facebook.FacebookError("RATE_LIMITED", "Quá giới hạn")
    )
    r_rl = comment_poller.run_tick()
    assert r_rl["locked"] is True and r_rl["rateLimited"] is True

    facebook.list_comments = lambda *a, **kw: []
    r_ok = comment_poller.run_tick()
    assert r_ok["locked"] is True and r_ok["rateLimited"] is False


def test_poller_advisory_lock_prevents_concurrent_instances():
    seed_page_and_post()
    fb_calls = []
    facebook.list_comments = lambda *a, **kw: (fb_calls.append(a), [])[1]

    # Hold the exact Postgres session advisory lock on an independent connection
    key = comment_poller._lock_key()
    with psycopg.connect(store._dsn(), connect_timeout=store.CONNECT_TIMEOUT, autocommit=True) as holder:
        got = holder.execute("select pg_try_advisory_lock(hashtextextended(%s, 0))", (key,)).fetchone()
        assert got and got[0] is True
        try:
            r_skipped = comment_poller.run_tick()
            assert r_skipped["locked"] is False
            assert fb_calls == []
        finally:
            holder.execute("select pg_advisory_unlock(hashtextextended(%s, 0))", (key,))

    # After release, poller acquires the lock and runs
    r_ran = comment_poller.run_tick()
    assert r_ran["locked"] is True
    assert len(fb_calls) == 1


def test_poller_loop_survives_exceptions(monkeypatch):
    ticks = []
    done = threading.Event()
    stop_ev = threading.Event()

    def flaky_tick():
        ticks.append(len(ticks) + 1)
        if len(ticks) == 1:
            raise RuntimeError("transient db error")
        done.set()
        stop_ev.set()
        return {"locked": True, "rateLimited": False}

    monkeypatch.setattr(comment_poller, "run_tick", flaky_tick)
    # Use a tiny interval so two ticks run quickly
    t = threading.Thread(target=comment_poller._loop, args=(0.01, stop_ev), daemon=True)
    t.start()
    assert done.wait(timeout=5)
    t.join(timeout=5)
    assert ticks == [1, 2]


def test_finding14_auto_draft_no_clock_skew_loop_and_drafts_late_synced_replies(monkeypatch):
    """#14: Auto-draft freshness tracks covered customer comment id (immune to clock skew and late-synced replies)."""
    # Isolate auto-draft freshness assertions from default-on live auto-reply and auto-moderation
    monkeypatch.setenv("VPOST_AUTO_REPLY_DISABLED", "1")
    monkeypatch.setenv("VPOST_AUTO_MODERATION_DISABLED", "1")
    seed_page_and_post()
    send_calls = []
    facebook.reply_comment = lambda *a, **kw: (send_calls.append(a), "never")[1]

    # Part A: Server clock lags 5 minutes behind Facebook's clock -> must NOT regenerate draft on tick 2
    t_fb_1 = "2026-11-28T12:00:00+0000"
    t_server_lag = datetime(2026, 11, 28, 11, 55, 0, tzinfo=timezone.utc)
    clock = [t_server_lag]
    monkeypatch.setattr(vpost_api, "now", lambda: clock[0])

    # Ensure post published_at is within lookback of mocked clock
    with store.connect() as c:
        c.execute(
            "update post_job set published_at=%s, created_at=%s where id='job-1'",
            ("2026-11-28T10:00:00.000Z", "2026-11-28T09:00:00.000Z"),
        )

    facebook.list_comments = lambda fb_post_id, token, since=None: [
        {
            "id": "c_skew_1",
            "message": "Mẫu này giá bao nhiêu ạ?",
            "created_time": t_fb_1,
            "from": {"id": "u1", "name": "Lan Anh"},
        }
    ]
    model = FakeModel()
    vpost_api.MODEL = model

    r1 = comment_poller.run_tick()
    assert r1["draftsCreated"] == 1
    assert len(model.calls) == 1

    # Tick 2 with same lagging server clock: draft already covers c_skew_1 -> NO loop!
    facebook.list_comments = lambda fb_post_id, token, since=None: []
    r2 = comment_poller.run_tick()
    assert r2["draftsCreated"] == 0
    assert len(model.calls) == 1

    # Part B: Late-synced follow-up reply whose Facebook created_time is OLDER than draft.created_at
    # Draft 1 had created_at = 11:55:00Z; advance server clock to 12:05:00Z, sync c_late_2 at 11:54:30Z
    # Wait: make c_late_2 strictly newer than c_skew_1 (12:00:00Z) AND older than draft_2's clock!
    # First create a fresh thread at 10:00:00Z while server clock is 10:00:30Z
    clock[0] = datetime(2026, 11, 28, 10, 0, 30, tzinfo=timezone.utc)
    facebook.list_comments = lambda fb_post_id, token, since=None: [
        {
            "id": "c_late_root",
            "message": "Cho mình hỏi mẫu G1?",
            "created_time": "2026-11-28T10:00:00+0000",
            "from": {"id": "u2", "name": "Ngọc"},
        }
    ]
    r3 = comment_poller.run_tick()
    assert r3["draftsCreated"] == 1
    assert len(model.calls) == 2

    # Now follow-up reply posted at 10:00:25Z (BEFORE draft created_at 10:00:30Z!) syncs at 10:01:00Z
    clock[0] = datetime(2026, 11, 28, 10, 1, 0, tzinfo=timezone.utc)
    facebook.list_comments = lambda fb_post_id, token, since=None: [
        {
            "id": "c_late_reply",
            "parent": {"id": "c_late_root"},
            "message": "Còn màu đen size M không shop?",
            "created_time": "2026-11-28T10:00:25+0000",
            "from": {"id": "u2", "name": "Ngọc"},
        }
    ]
    r4 = comment_poller.run_tick()
    assert r4["newComments"] == 1
    assert r4["draftsCreated"] == 1
    assert len(model.calls) == 3
    assert "Còn màu đen size M không shop?" in model.calls[2]["user"]

    # Next tick with no new replies does NOT re-draft c_late_root
    facebook.list_comments = lambda fb_post_id, token, since=None: []
    r5 = comment_poller.run_tick()
    assert r5["draftsCreated"] == 0
    assert len(model.calls) == 3
    assert send_calls == []


def test_poller_checks_stop_event_between_auto_draft_calls(monkeypatch):
    """Suspicion: comment_poller checks stop_event between auto-draft calls for fast shutdown."""
    # Isolate stop_event check in the auto-draft loop from default-on AI moderation calls
    monkeypatch.setenv("VPOST_AUTO_MODERATION_DISABLED", "1")
    seed_page_and_post()
    monkeypatch.setenv("VPOST_AUTO_DRAFT_MAX_PER_TICK", "5")
    facebook.list_comments = lambda fb_post_id, token, since=None: [
        {
            "id": f"c_stop_{i}",
            "message": f"Váy G1 giá sao {i}?",
            "created_time": iso_ago(minutes=20 - i),
            "from": {"id": f"u{i}", "name": f"Khách {i}"},
        }
        for i in range(5)
    ]

    stop_ev = threading.Event()
    calls = []

    def stopping_model(system, user, schema=None):
        calls.append(user)
        # Signal shutdown during the very first auto-draft call
        stop_ev.set()
        return {
            "text": json.dumps({
                "decision": "reply",
                "flag_reasons": [],
                "reply": "Dạ Đầm Voan Hoa G1 giá 890.000đ còn màu đen size S, M, L bạn nhé!",
                "facts_used": ["F1"],
            }, ensure_ascii=False),
            "model": "gpt-stop-test",
            "tokens_in": 50,
            "tokens_out": 20,
        }

    vpost_api.MODEL = stopping_model
    res = comment_poller.run_tick(stop_event=stop_ev)
    assert res["newComments"] == 5
    # Stopped right after the 1st draft instead of running all 5 sequential LLM calls
    assert res["draftsCreated"] == 1
    assert len(calls) == 1

    # Also verify via background _loop + stop_event: exits cleanly after stopping mid-batch
    calls.clear()
    loop_stop = threading.Event()
    entered_first = threading.Event()
    release_first = threading.Event()

    def slow_first_model(system, user, schema=None):
        calls.append(user)
        entered_first.set()
        assert release_first.wait(timeout=5)
        return {
            "text": json.dumps({
                "decision": "reply",
                "flag_reasons": [],
                "reply": "Dạ Đầm Voan Hoa G1 giá 890.000đ còn màu đen size S, M, L bạn nhé!",
                "facts_used": ["F1"],
            }, ensure_ascii=False),
            "model": "gpt-stop-test",
            "tokens_in": 50,
            "tokens_out": 20,
        }

    facebook.list_comments = lambda fb_post_id, token, since=None: []
    vpost_api.MODEL = slow_first_model
    th = threading.Thread(target=comment_poller._loop, args=(0.01, loop_stop), daemon=True)
    th.start()
    assert entered_first.wait(timeout=5)
    loop_stop.set()
    release_first.set()
    th.join(timeout=5)
    assert not th.is_alive()
    # Only drafted 1 of the remaining 4 threads before stopping
    assert len(calls) == 1
