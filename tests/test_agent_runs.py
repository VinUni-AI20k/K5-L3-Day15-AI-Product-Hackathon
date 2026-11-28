"""Tests for agent run trace recording, API serialization, live progress, crash recovery, PII scrubbing, retention, and tenant isolation."""
from __future__ import annotations

import json
import os
import re
import sys
import tempfile
import threading
import uuid
from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient
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
import agent_runs  # noqa: E402
import auto_reply  # noqa: E402
import comment_poller  # noqa: E402
import facebook  # noqa: E402
import inbox_store  # noqa: E402
import moderation_store  # noqa: E402
import vpost_api  # noqa: E402
import writing_style  # noqa: E402


class _LazyClient:
    """Trì hoãn `import server` tới lúc chạy test (tránh kích hoạt khi pytest inspect module trước `test_api.py`)."""

    def __init__(self):
        self._tc = None

    def _ensure(self):
        if self._tc is None:
            if "server" not in sys.modules:
                tools.UPLOADS = tempfile.mkdtemp()
            import server  # noqa: E402
            self._tc = TestClient(server.app)
        return self._tc

    @property
    def cookies(self):
        return self._ensure().cookies

    def get(self, *args, **kwargs):
        return self._ensure().get(*args, **kwargs)

    def post(self, *args, **kwargs):
        return self._ensure().post(*args, **kwargs)

    def put(self, *args, **kwargs):
        return self._ensure().put(*args, **kwargs)

    def patch(self, *args, **kwargs):
        return self._ensure().patch(*args, **kwargs)

    def delete(self, *args, **kwargs):
        return self._ensure().delete(*args, **kwargs)

    def request(self, *args, **kwargs):
        return self._ensure().request(*args, **kwargs)


client = _LazyClient()
IMG = "https://lh3.googleusercontent.com/d/abc123"
PAGE_ID = "123"
CHANNEL_ID = "fb-123"
PAGE_TOKEN = "EAAG_SECRET_AGENT_RUN_TOKEN_987654321"
OTHER_TENANT = "11111111-1111-4111-8111-111111111111"
Z = re.compile(r"^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$")
STEP_ORDER = ("read", "safety", "intent", "facts", "compose", "output_check", "action")

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
        {"mau": "Trắng", "size": "S", "ton": 0, "trang_thai": "HẾT HÀNG"},
        {"mau": "Trắng", "size": "M", "ton": 0, "trang_thai": "HẾT HÀNG"},
        {"mau": "Trắng", "size": "L", "ton": 0, "trang_thai": "HẾT HÀNG"},
    ]
}

_ORIG_FB_LIST = facebook.list_comments
_ORIG_FB_REPLY = facebook.reply_comment
_ORIG_FB_HIDE = facebook.hide_comment
_ORIG_VPOST_MODEL = vpost_api.MODEL


def iso_ago(days=0, hours=0, minutes=0, seconds=0):
    dt = datetime.now(timezone.utc) - timedelta(days=days, hours=hours, minutes=minutes, seconds=seconds)
    return dt.strftime("%Y-%m-%dT%H:%M:%S.000Z")


def seed_page(page_id=PAGE_ID, name="WorkHardToday", token=PAGE_TOKEN):
    store.save_fb_pages([{"id": page_id, "name": name, "access_token": token}], "UTOKEN", iso_ago())


def seed_post_job(job_id="job-1", fb_post_id="123_1001", product_code="G1", channel_id=CHANNEL_ID):
    pub = iso_ago(hours=2)
    ts = iso_ago(hours=3)
    store.create_post_batch(
        {"id": "batch-" + job_id, "product_code": product_code, "color": "Đen", "format": "image_post", "created_at": ts},
        [{
            "id": job_id,
            "batch_id": "batch-" + job_id,
            "product_code": product_code,
            "color": "Đen",
            "format": "image_post",
            "channel_id": channel_id,
            "caption": "Đầm Voan Hoa G1 màu đen, size S-L, giá 890.000đ",
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


def seed_comment(
    cid,
    *,
    tenant_id=None,
    channel_id=CHANNEL_ID,
    page_id=PAGE_ID,
    post_job_id="job-1",
    fb_post_id="123_1001",
    product_code="G1",
    parent_id="",
    from_id="u1",
    from_name="Lan Anh",
    is_from_page=0,
    message="Giá bao nhiêu ạ?",
    created_time=None,
    status="unreplied",
    can_comment=1,
    is_hidden=0,
):
    ts = created_time or iso_ago(minutes=10)
    tid = tenant_id or vpost_api.TENANT_ID
    store.upsert_fb_comment(
        tid,
        {
            "id": cid,
            "channel_id": channel_id,
            "page_id": page_id,
            "post_job_id": post_job_id,
            "fb_post_id": fb_post_id,
            "product_code": product_code,
            "parent_id": parent_id,
            "from_id": from_id,
            "from_name": from_name,
            "is_from_page": is_from_page,
            "message": message,
            "permalink_url": f"https://www.facebook.com/{fb_post_id}?comment_id={cid}",
            "is_hidden": is_hidden,
            "can_comment": can_comment,
            "created_time": ts,
            "status": status,
            "synced_at": ts,
            "updated_at": ts,
        },
    )
    return store.get_comment(tid, cid)


def enable_page(page_id=PAGE_ID, *, mode="live", intents=("price", "size", "color"), hourly_cap=30, daily_cap=200):
    store.upsert_auto_reply_setting(
        vpost_api.TENANT_ID,
        page_id,
        enabled=True,
        mode=mode,
        intents=list(intents),
        hourly_cap=hourly_cap,
        daily_cap=daily_cap,
    )


class FakeModel:
    def __init__(self, payload=None, *, on_call=None):
        self.payload = payload or {
            "decision": "reply",
            "flag_reasons": [],
            "reply": "Dạ Đầm Voan Hoa G1 giá 890.000đ còn màu đen size S, M, L bạn nhé!",
            "facts_used": ["F1", "F3", "F4"],
        }
        self.on_call = on_call
        self.calls = []

    def __call__(self, system, user, schema=None):
        self.calls.append({"system": system, "user": user, "schema": schema})
        if self.on_call is not None:
            self.on_call(system, user, schema)
        if isinstance(self.payload, Exception):
            raise self.payload
        return {
            "text": json.dumps(self.payload, ensure_ascii=False),
            "model": "gpt-trace-test",
            "tokens_in": 80,
            "tokens_out": 30,
        }


def assert_steps_in_contract_order(steps):
    assert steps, "steps must not be empty"
    indices = [STEP_ORDER.index(s["key"]) for s in steps]
    assert indices == sorted(indices) and len(set(indices)) == len(indices), (
        f"steps out of order or duplicated: {[s['key'] for s in steps]}"
    )
    for s in steps:
        assert set(s.keys()) == {"key", "label", "status", "detail", "at"}
        assert isinstance(s["label"], str) and s["label"].strip()
        assert s["status"] in ("running", "ok", "blocked", "skipped", "error")
        assert s["detail"] is None or (isinstance(s["detail"], str) and len(s["detail"]) <= 200)
        assert Z.match(s["at"])


def assert_run_contract_shape(run):
    assert set(run.keys()) == {
        "id", "threadId", "commentId", "kind", "status", "outcome",
        "steps", "startedAt", "finishedAt",
    }
    assert run["id"] and run["threadId"]
    assert run["kind"] in ("auto_reply", "draft")
    assert run["status"] in ("running", "done", "error")
    assert run["outcome"] in (None, "sent", "would_send", "can_ban", "draft_saved", "failed")
    assert Z.match(run["startedAt"])
    assert run["finishedAt"] is None or Z.match(run["finishedAt"])
    assert_steps_in_contract_order(run["steps"])


def setup_function(_):
    comment_poller.stop()
    store.init()
    moderation_store.init_moderation()
    inbox_store.init_inbox()
    writing_style.init_writing_style()
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
    os.environ.pop("VPOST_AUTO_REPLY_DISABLED", None)
    tools.inventory = lambda: {k: [dict(v) for v in vs] for k, vs in INV_DEFAULT.items()}
    vpost_api.load_catalog([dict(ROW_G1)])
    seed_page()
    seed_post_job()
    client.cookies.clear()


def teardown_function(_):
    comment_poller.stop()
    facebook.list_comments = _ORIG_FB_LIST
    facebook.reply_comment = _ORIG_FB_REPLY
    facebook.hide_comment = _ORIG_FB_HIDE
    vpost_api.MODEL = _ORIG_VPOST_MODEL
    os.environ.pop("VPOST_AUTO_REPLY_DISABLED", None)
    client.cookies.clear()


# ---------------- 1. Auto-reply happy path: steps in order, thread.agentRun, message.agentRunId, runs route ----------------

def test_auto_reply_live_sent_records_ordered_steps_and_links_messages():
    enable_page(mode="live", intents=("price", "size", "color"))
    facebook.reply_comment = lambda target, msg, tok: "fb_rep_live_1"

    c = seed_comment("c_live_1", message="Giá bao nhiêu và còn size gì ạ?")
    res = auto_reply.process_comment(vpost_api.TENANT_ID, c)
    assert res["action"] == "sent"
    run_id = res["agentRunId"]
    assert run_id

    # Thread detail: agentRun + message.agentRunId on customer & bot Page message
    det = client.get("/api/comments/threads/c_live_1")
    assert det.status_code == 200, det.text
    body = det.json()

    run = body["thread"]["agentRun"]
    assert run is not None
    assert_run_contract_shape(run)
    assert run["id"] == run_id
    assert run["threadId"] == "c_live_1"
    assert run["commentId"] == "c_live_1"
    assert run["kind"] == "auto_reply"
    assert run["status"] == "done"
    assert run["outcome"] == "sent"
    assert run["finishedAt"] is not None
    assert [s["key"] for s in run["steps"]] == [
        "read", "safety", "intent", "facts", "compose", "output_check", "action"
    ]
    assert all(s["status"] == "ok" for s in run["steps"])
    assert "giá" in run["steps"][2]["detail"].lower() and "size" in run["steps"][2]["detail"].lower()
    assert "890.000đ" in run["steps"][3]["detail"]

    # Both the processed customer message and bot-produced Page reply link to run_id
    msgs = body["messages"]
    assert len(msgs) == 2
    assert msgs[0]["id"] == "c_live_1" and msgs[0]["fromPage"] is False
    assert msgs[0]["agentRunId"] == run_id
    assert msgs[1]["id"] == "fb_rep_live_1" and msgs[1]["fromPage"] is True
    assert msgs[1]["sentBy"] == "auto"
    assert msgs[1]["agentRunId"] == run_id

    # Operator follow-up reply has agentRunId = None
    facebook.reply_comment = lambda target, msg, tok: "fb_rep_op_2"
    r_op = client.post(
        "/api/comments/threads/c_live_1/reply",
        json={"text": "Dạ cảm ơn bạn đã quan tâm Đầm Voan Hoa G1 ạ!", "clientId": str(uuid.uuid4())},
    )
    assert r_op.status_code == 200, r_op.text
    assert r_op.json()["message"]["agentRunId"] is None
    det2 = client.get("/api/comments/threads/c_live_1").json()
    by_mid = {m["id"]: m for m in det2["messages"]}
    assert by_mid["c_live_1"]["agentRunId"] == run_id
    assert by_mid["fb_rep_live_1"]["agentRunId"] == run_id
    assert by_mid["fb_rep_op_2"]["agentRunId"] is None

    # Thread list also carries thread.agentRun
    lst = client.get("/api/comments/threads?filter=all").json()
    t_row = next(t for t in lst["items"] if t["id"] == "c_live_1")
    assert t_row["agentRun"]["id"] == run_id
    assert t_row["agentRun"]["outcome"] == "sent"

    # Runs route returns newest first
    runs_resp = client.get("/api/comments/threads/c_live_1/runs?limit=10")
    assert runs_resp.status_code == 200, runs_resp.text
    rb = runs_resp.json()
    assert rb["tenantId"] == vpost_api.TENANT_ID
    assert [x["id"] for x in rb["items"]] == [run_id]


def test_auto_reply_default_live_ignores_legacy_dry_run_row_and_records_sent():
    # Legacy row with enabled=0, mode='dry_run' is ignored; auto-reply runs live and records outcome='sent'
    with store.connect() as conn:
        conn.execute(
            """insert into auto_reply_setting(
                 tenant_id, page_id, enabled, mode, intents, hourly_cap, daily_cap, updated_by, updated_at
               ) values(%s,%s,0,'dry_run','["price"]',30,200,'legacy','2026-01-01T00:00:00.000Z')""",
            (vpost_api.TENANT_ID, PAGE_ID),
        )
    fb_calls = []
    facebook.reply_comment = lambda target, msg, tok: (fb_calls.append((target, msg)), "fb_rep_legacy_1")[1]
    c = seed_comment("c_dry_1", message="Giá bao nhiêu ạ?")
    res = auto_reply.process_comment(vpost_api.TENANT_ID, c)
    assert res["action"] == "sent"
    assert len(fb_calls) == 1

    run = client.get("/api/comments/threads/c_dry_1").json()["thread"]["agentRun"]
    assert_run_contract_shape(run)
    assert run["kind"] == "auto_reply"
    assert run["status"] == "done"
    assert run["outcome"] == "sent"
    assert [s["key"] for s in run["steps"]] == [
        "read", "safety", "intent", "facts", "compose", "output_check", "action"
    ]
    assert run["steps"][-1]["label"] == "Gửi"
    assert run["steps"][-1]["status"] == "ok"


# ---------------- 2. Early stop on can_ban at safety / intent / facts / action ----------------

def test_early_stop_on_can_ban_at_each_stage():
    enable_page(mode="live", intents=("price", "size", "color"))

    # A) Blocked at safety (URL) -> stops before intent/facts/compose/output_check
    c_url = seed_comment("c_cb_safety", from_id="u1", message="Xem link https://evil.example/shop giá bn?")
    r_url = auto_reply.process_comment(vpost_api.TENANT_ID, c_url)
    assert r_url["tagged"] is True
    det_url = client.get("/api/comments/threads/c_cb_safety").json()
    run_safety = det_url["thread"]["agentRun"]
    assert_run_contract_shape(run_safety)
    assert run_safety["outcome"] == "can_ban"
    assert run_safety["status"] == "done"
    assert [s["key"] for s in run_safety["steps"]] == ["read", "safety", "action"]
    assert run_safety["steps"][0]["status"] == "ok"
    assert run_safety["steps"][1]["status"] == "blocked"
    assert "URL" in (run_safety["steps"][1]["detail"] or "")
    assert run_safety["steps"][2]["status"] == "ok" and run_safety["steps"][2]["label"] == "Cần bạn"
    assert det_url["messages"][0]["agentRunId"] == run_safety["id"]

    # B) Blocked at intent (non-allowlisted question) -> stops before facts/compose/output_check
    c_int = seed_comment("c_cb_intent", from_id="u2", message="Ship về Hà Nội bao nhiêu ạ?")
    r_int = auto_reply.process_comment(vpost_api.TENANT_ID, c_int)
    assert r_int["tagged"] is True
    run_intent = client.get("/api/comments/threads/c_cb_intent").json()["thread"]["agentRun"]
    assert_run_contract_shape(run_intent)
    assert run_intent["outcome"] == "can_ban"
    assert [s["key"] for s in run_intent["steps"]] == ["read", "safety", "intent", "action"]
    assert [s["status"] for s in run_intent["steps"]] == ["ok", "ok", "blocked", "ok"]

    # C) Blocked at facts (unknown product code) -> stops before compose/output_check
    c_facts = seed_comment("c_cb_facts", from_id="u3", product_code="NOPE999", message="Giá bao nhiêu ạ?")
    r_facts = auto_reply.process_comment(vpost_api.TENANT_ID, c_facts)
    assert r_facts["tagged"] is True
    run_facts = client.get("/api/comments/threads/c_cb_facts").json()["thread"]["agentRun"]
    assert_run_contract_shape(run_facts)
    assert run_facts["outcome"] == "can_ban"
    assert [s["key"] for s in run_facts["steps"]] == ["read", "safety", "intent", "facts", "action"]
    assert [s["status"] for s in run_facts["steps"]] == ["ok", "ok", "ok", "blocked", "ok"]
    assert "nope999" in (run_facts["steps"][3]["detail"] or "").lower()

    # D) Blocked at action (hourly cap = 1 reached)
    enable_page(mode="live", intents=("price",), hourly_cap=1, daily_cap=10)
    facebook.reply_comment = lambda target, msg, tok: f"fb_cap_{target}"
    c_ok = seed_comment("c_cap_1", from_id="u4", message="Giá bao nhiêu ạ?")
    assert auto_reply.process_comment(vpost_api.TENANT_ID, c_ok)["action"] == "sent"
    c_cap = seed_comment("c_cap_2", from_id="u5", message="Giá bao nhiêu ạ?")
    assert auto_reply.process_comment(vpost_api.TENANT_ID, c_cap)["tagged"] is True
    run_cap = client.get("/api/comments/threads/c_cap_2").json()["thread"]["agentRun"]
    assert_run_contract_shape(run_cap)
    assert run_cap["outcome"] == "can_ban"
    assert [s["key"] for s in run_cap["steps"]] == [
        "read", "safety", "intent", "facts", "compose", "output_check", "action"
    ]
    assert run_cap["steps"][-1]["status"] == "blocked"
    assert "trần" in (run_cap["steps"][-1]["detail"] or "").lower()


def test_auto_reply_facebook_failure_marks_run_error_failed():
    enable_page(mode="live", intents=("price",))

    def fail_fb(target, msg, tok):
        raise facebook.FacebookError("RATE_LIMITED", f"Rate limit token={PAGE_TOKEN}")

    facebook.reply_comment = fail_fb
    c = seed_comment("c_fb_err", message="Giá bao nhiêu ạ?")
    res = auto_reply.process_comment(vpost_api.TENANT_ID, c)
    assert res["action"] == "failed"

    run = client.get("/api/comments/threads/c_fb_err").json()["thread"]["agentRun"]
    assert_run_contract_shape(run)
    assert run["status"] == "error"
    assert run["outcome"] == "failed"
    assert run["steps"][-1]["key"] == "action"
    assert run["steps"][-1]["status"] == "error"
    assert PAGE_TOKEN not in json.dumps(run, ensure_ascii=False)


# ---------------- 3. AI Draft runs (API + Poller auto-draft loop) ----------------

def test_draft_run_via_api_and_poller_auto_draft_loop():
    seed_comment("c_draft_1", message="Váy này mặc đi tiệc có hợp không shop?")
    vpost_api.MODEL = FakeModel()

    r = client.post("/api/comments/threads/c_draft_1/draft")
    assert r.status_code == 200, r.text
    th = r.json()["thread"]
    run = th["agentRun"]
    assert run is not None
    assert_run_contract_shape(run)
    assert run["kind"] == "draft"
    assert run["status"] == "done"
    assert run["outcome"] == "draft_saved"
    assert run["commentId"] == "c_draft_1"
    assert [s["key"] for s in run["steps"]] == [
        "read", "safety", "facts", "compose", "output_check", "action"
    ]
    assert all(s["status"] == "ok" for s in run["steps"])
    assert run["steps"][-1]["label"] == "Lưu nháp"

    # Message agentRunId points to the draft run on the customer comment
    det = client.get("/api/comments/threads/c_draft_1").json()
    assert det["messages"][0]["agentRunId"] == run["id"]

    # Poller auto-draft loop also creates a draft run and runs route lists newest first
    facebook.list_comments = lambda fb_post_id, token, since=None: [
        {
            "id": "c_poll_draft_1",
            "message": "Chất vải có mát không shop?",
            "created_time": iso_ago(minutes=2),
            "from": {"id": "u_poll", "name": "Hương"},
            "is_hidden": False,
            "can_comment": True,
        }
    ]
    tick = comment_poller.run_tick()
    assert tick["draftsCreated"] == 1
    runs_poll = client.get("/api/comments/threads/c_poll_draft_1/runs?limit=10").json()["items"]
    assert len(runs_poll) == 2  # newest: draft run; older: auto_reply run
    assert runs_poll[0]["kind"] == "draft" and runs_poll[0]["outcome"] == "draft_saved"
    assert runs_poll[1]["kind"] == "auto_reply" and runs_poll[1]["outcome"] == "can_ban"
    assert [s["key"] for s in runs_poll[0]["steps"]] == [
        "read", "safety", "facts", "compose", "output_check", "action"
    ]

    # Limit parameter respected
    runs_lim = client.get("/api/comments/threads/c_poll_draft_1/runs?limit=1").json()["items"]
    assert len(runs_lim) == 1 and runs_lim[0]["id"] == runs_poll[0]["id"]


def test_draft_run_early_stop_and_output_check_blocked():
    # Missing catalog row -> stops at facts
    seed_comment("c_no_cat", product_code="MISSING_99", message="Mẫu này còn không?")
    vpost_api.MODEL = FakeModel()
    assert client.post("/api/comments/threads/c_no_cat/draft").status_code == 200
    run_nc = client.get("/api/comments/threads/c_no_cat").json()["thread"]["agentRun"]
    assert_run_contract_shape(run_nc)
    assert run_nc["kind"] == "draft"
    assert run_nc["outcome"] == "can_ban"
    assert [s["key"] for s in run_nc["steps"]] == ["read", "safety", "facts", "action"]
    assert run_nc["steps"][2]["status"] == "blocked"

    # Output check fails (AI invents wrong price) -> output_check blocked
    seed_comment("c_bad_out", message="Mẫu này giá bao nhiêu?")
    vpost_api.MODEL = FakeModel({
        "decision": "reply",
        "flag_reasons": [],
        "reply": "Dạ mẫu này giá chỉ 199.000đ thôi ạ!",
        "facts_used": ["F1"],
    })
    assert client.post("/api/comments/threads/c_bad_out/draft").status_code == 200
    run_bo = client.get("/api/comments/threads/c_bad_out").json()["thread"]["agentRun"]
    assert_run_contract_shape(run_bo)
    assert run_bo["outcome"] == "can_ban"
    assert [s["key"] for s in run_bo["steps"]] == [
        "read", "safety", "facts", "compose", "output_check", "action"
    ]
    assert run_bo["steps"][4]["status"] == "blocked"

    # Model raises exception -> compose error, run status=error, outcome=failed
    seed_comment("c_mod_err", message="Mẫu này có co giãn không?")
    vpost_api.MODEL = FakeModel(RuntimeError("upstream timeout"))
    assert client.post("/api/comments/threads/c_mod_err/draft").status_code == 200
    run_me = client.get("/api/comments/threads/c_mod_err").json()["thread"]["agentRun"]
    assert_run_contract_shape(run_me)
    assert run_me["status"] == "error"
    assert run_me["outcome"] == "failed"
    assert [s["key"] for s in run_me["steps"]] == ["read", "safety", "facts", "compose", "action"]
    assert run_me["steps"][3]["status"] == "error"


# ---------------- 4. Live progress visible mid-run (separate short transactions) ----------------

def test_running_state_and_partial_steps_visible_mid_run():
    seed_comment("c_live_prog", message="Tư vấn giúp mình mẫu này nhé!")
    entered_model = threading.Event()
    release_model = threading.Event()

    def pause_in_model(_sys, _usr, _schema):
        entered_model.set()
        assert release_model.wait(timeout=10), "model release timed out"

    vpost_api.MODEL = FakeModel(on_call=pause_in_model)
    result_box = {}

    def run_draft():
        result_box["res"] = vpost_api.generate_thread_draft("c_live_prog")

    t = threading.Thread(target=run_draft, daemon=True)
    t.start()
    try:
        assert entered_model.wait(timeout=5), "draft did not reach model call"

        # Mid-run: reader immediately sees status="running", committed steps up to compose(running), and runningThreadIds
        det_mid = client.get("/api/comments/threads/c_live_prog").json()
        run_mid = det_mid["thread"]["agentRun"]
        assert run_mid is not None
        assert_run_contract_shape(run_mid)
        assert run_mid["status"] == "running"
        assert run_mid["outcome"] is None
        assert run_mid["finishedAt"] is None
        assert [s["key"] for s in run_mid["steps"]] == ["read", "safety", "facts", "compose"]
        assert [s["status"] for s in run_mid["steps"]] == ["ok", "ok", "ok", "running"]

        # Updates feed (both initial and incremental) reports runningThreadIds
        upd_init = client.get("/api/comments/updates").json()
        assert "c_live_prog" in upd_init["runningThreadIds"]
        upd_since = client.get(f"/api/comments/updates?since={upd_init['cursor']}").json()
        assert "c_live_prog" in upd_since["runningThreadIds"]

        # Thread list also exposes running agentRun
        lst_mid = client.get("/api/comments/threads?filter=all").json()
        row_mid = next(x for x in lst_mid["items"] if x["id"] == "c_live_prog")
        assert row_mid["agentRun"]["status"] == "running"
    finally:
        release_model.set()
        t.join(timeout=10)

    assert result_box["res"] == ("draft", None)

    # Post-run: compose updated in-place (not duplicated), run done, runningThreadIds empty
    det_end = client.get("/api/comments/threads/c_live_prog").json()
    run_end = det_end["thread"]["agentRun"]
    assert_run_contract_shape(run_end)
    assert run_end["status"] == "done"
    assert run_end["outcome"] == "draft_saved"
    assert run_end["finishedAt"] is not None
    assert [s["key"] for s in run_end["steps"]] == [
        "read", "safety", "facts", "compose", "output_check", "action"
    ]
    assert all(s["status"] == "ok" for s in run_end["steps"])

    upd_end = client.get("/api/comments/updates").json()
    assert upd_end["runningThreadIds"] == []


def test_auto_reply_running_visible_mid_facebook_send():
    enable_page(mode="live", intents=("price",))
    c = seed_comment("c_ar_mid", message="Giá bao nhiêu ạ?")
    entered_send = threading.Event()
    release_send = threading.Event()

    def slow_fb_reply(target, msg, tok):
        entered_send.set()
        assert release_send.wait(timeout=10), "fb send release timed out"
        return "fb_rep_mid_1"

    facebook.reply_comment = slow_fb_reply
    box = {}
    t = threading.Thread(
        target=lambda: box.setdefault("res", auto_reply.process_comment(vpost_api.TENANT_ID, c)),
        daemon=True,
    )
    t.start()
    try:
        assert entered_send.wait(timeout=5)
        upd = client.get("/api/comments/updates").json()
        assert "c_ar_mid" in upd["runningThreadIds"]
        run_mid = client.get("/api/comments/threads/c_ar_mid").json()["thread"]["agentRun"]
        assert run_mid["status"] == "running"
        assert run_mid["steps"][-1]["key"] == "action"
        assert run_mid["steps"][-1]["status"] == "running"
    finally:
        release_send.set()
        t.join(timeout=10)

    assert box["res"]["action"] == "sent"
    assert client.get("/api/comments/updates").json()["runningThreadIds"] == []
    run_done = client.get("/api/comments/threads/c_ar_mid").json()["thread"]["agentRun"]
    assert run_done["status"] == "done" and run_done["outcome"] == "sent"
    assert run_done["steps"][-1]["status"] == "ok"


# ---------------- 5. Crash recovery (> 5 minutes) ----------------

def test_stale_running_over_5_minutes_shown_as_error_and_excluded_from_running_ids(monkeypatch):
    t0 = datetime(2026, 11, 28, 12, 0, 0, tzinfo=timezone.utc)
    clock = [t0]
    monkeypatch.setattr(vpost_api, "now", lambda: clock[0])

    seed_comment("c_stale", message="Giá bao nhiêu ạ?", created_time="2026-11-28T11:50:00.000Z")
    run_id = agent_runs.start_run(vpost_api.TENANT_ID, "c_stale", "draft", comment_id="c_stale", now_dt=t0)
    agent_runs.add_step(vpost_api.TENANT_ID, run_id, "read", "ok", detail="Đã đọc", now_dt=t0)
    agent_runs.add_step(vpost_api.TENANT_ID, run_id, "compose", "running", detail="Đang gọi AI…", now_dt=t0)

    # At 4m59s: still running
    clock[0] = t0 + timedelta(minutes=4, seconds=59)
    det_ok = client.get("/api/comments/threads/c_stale").json()
    assert det_ok["thread"]["agentRun"]["status"] == "running"
    assert "c_stale" in client.get("/api/comments/updates").json()["runningThreadIds"]

    # At 5m01s: crash recovery turns status into "error", flips running step to "error", removes from runningThreadIds
    clock[0] = t0 + timedelta(minutes=5, seconds=1)
    det_err = client.get("/api/comments/threads/c_stale").json()
    run_err = det_err["thread"]["agentRun"]
    assert_run_contract_shape(run_err)
    assert run_err["status"] == "error"
    assert run_err["outcome"] == "failed"
    assert run_err["steps"][-1]["status"] == "error"
    assert client.get("/api/comments/updates").json()["runningThreadIds"] == []

    # Runs route also reflects status="error"
    runs_items = client.get("/api/comments/threads/c_stale/runs").json()["items"]
    assert runs_items[0]["status"] == "error"

    # recover_stale_runs persists recovery in DB
    recovered = agent_runs.recover_stale_runs(tenant_id=vpost_api.TENANT_ID, now_dt=clock[0])
    assert recovered == 1
    assert agent_runs.recover_stale_runs(tenant_id=vpost_api.TENANT_ID, now_dt=clock[0]) == 0


# ---------------- 6. PII & token scrubbing + 200-char cap ----------------

def test_detail_scrubs_pii_and_tokens_and_truncates_to_200_chars():
    seed_comment("c_pii", message="Gọi 0912 345 678 hoặc mail khach@example.com nhé")
    run_id = agent_runs.start_run(vpost_api.TENANT_ID, "c_pii", "auto_reply", comment_id="c_pii")

    secret_detail = (
        f"Khách gửi 0912 345 678, +84 987-654-321, mail khach.vip@shop.vn, "
        f"token {PAGE_TOKEN}, access_token=super_secret_val, Bearer eyJhbGciOiJIUzI1NiJ9.abcdef12.signature99, "
        f"key sk-secret1234567890"
    )
    step1 = agent_runs.add_step(vpost_api.TENANT_ID, run_id, "safety", "blocked", detail=secret_detail)
    long_detail = "Chi tiết dài " + ("a" * 350) + " 0912345678 khach@example.com " + PAGE_TOKEN
    step2 = agent_runs.add_step(vpost_api.TENANT_ID, run_id, "action", "ok", label="Cần bạn", detail=long_detail)
    agent_runs.finish_run(vpost_api.TENANT_ID, run_id, status="done", outcome="can_ban")

    fetched = agent_runs.get_run(vpost_api.TENANT_ID, run_id)
    assert fetched is not None
    serialized = json.dumps(fetched, ensure_ascii=False)
    for forbidden in (
        "0912 345 678",
        "0912345678",
        "987-654-321",
        "khach.vip@shop.vn",
        "khach@example.com",
        PAGE_TOKEN,
        "super_secret_val",
        "eyJhbGciOiJIUzI1NiJ9",
        "sk-secret1234567890",
    ):
        assert forbidden not in serialized, f"leaked {forbidden!r} in {serialized}"

    assert "[đã ẩn]" in step1["detail"]
    assert len(step1["detail"]) <= 200
    assert len(step2["detail"]) <= 200 and step2["detail"].endswith("…")

    # End-to-end auto-reply + draft on PII comment never leaks phone/email/token in any step
    enable_page(mode="live", intents=("price",))
    c_e2e = seed_comment("c_pii_e2e", message="Giá bn? SĐT 0912 345 678 email buyer@test.vn")
    auto_reply.process_comment(vpost_api.TENANT_ID, c_e2e)
    vpost_api.MODEL = FakeModel()
    assert client.post("/api/comments/threads/c_pii_e2e/draft").status_code == 200

    all_runs = client.get("/api/comments/threads/c_pii_e2e/runs?limit=10").json()["items"]
    assert len(all_runs) == 2
    blob = json.dumps(all_runs, ensure_ascii=False)
    assert "0912 345 678" not in blob and "0912345678" not in blob
    assert "buyer@test.vn" not in blob
    assert PAGE_TOKEN not in blob


# ---------------- 7. Retention (7 days via poller and helper) ----------------

def test_retention_7_days_pruned_by_poller(monkeypatch):
    t_now = datetime(2026, 11, 28, 12, 0, 0, tzinfo=timezone.utc)
    monkeypatch.setattr(vpost_api, "now", lambda: t_now)
    # Keep post within lookback window and avoid network call
    with store.connect() as c:
        c.execute(
            "update post_job set published_at=%s, created_at=%s where id='job-1'",
            ("2026-11-28T10:00:00.000Z", "2026-11-28T09:00:00.000Z"),
        )
    facebook.list_comments = lambda fb_post_id, token, since=None: []

    seed_comment("c_ret", message="Hỏi giá", created_time="2026-11-28T11:00:00.000Z", status="replied")
    seed_comment(
        "p_ret",
        parent_id="c_ret",
        from_id=PAGE_ID,
        from_name="WorkHardToday",
        is_from_page=1,
        message="Dạ giá 890.000đ ạ",
        created_time="2026-11-28T11:05:00.000Z",
        status="replied",
    )

    r_8d = agent_runs.start_run(vpost_api.TENANT_ID, "c_ret", "auto_reply", now_dt=t_now - timedelta(days=8))
    agent_runs.finish_run(vpost_api.TENANT_ID, r_8d, status="done", outcome="can_ban", now_dt=t_now - timedelta(days=8))

    r_7d1m = agent_runs.start_run(vpost_api.TENANT_ID, "c_ret", "auto_reply", now_dt=t_now - timedelta(days=7, minutes=1))
    agent_runs.finish_run(vpost_api.TENANT_ID, r_7d1m, status="done", outcome="can_ban", now_dt=t_now - timedelta(days=7, minutes=1))

    r_6d23h = agent_runs.start_run(vpost_api.TENANT_ID, "c_ret", "auto_reply", now_dt=t_now - timedelta(days=6, hours=23))
    agent_runs.finish_run(vpost_api.TENANT_ID, r_6d23h, status="done", outcome="sent", now_dt=t_now - timedelta(days=6, hours=23))

    r_fresh = agent_runs.start_run(vpost_api.TENANT_ID, "c_ret", "draft", now_dt=t_now - timedelta(hours=1))
    agent_runs.finish_run(vpost_api.TENANT_ID, r_fresh, status="done", outcome="draft_saved", now_dt=t_now - timedelta(hours=1))

    # Another tenant's 9-day run should NOT be deleted when poller cleans TENANT_ID
    r_other_old = agent_runs.start_run(OTHER_TENANT, "c_ret", "auto_reply", now_dt=t_now - timedelta(days=9))
    agent_runs.finish_run(OTHER_TENANT, r_other_old, status="done", outcome="can_ban", now_dt=t_now - timedelta(days=9))

    tick = comment_poller.run_tick()
    assert tick["locked"] is True

    remaining = agent_runs.list_thread_runs(vpost_api.TENANT_ID, "c_ret", limit=10, now_dt=t_now)
    assert [r["id"] for r in remaining] == [r_fresh, r_6d23h]
    assert agent_runs.get_run(vpost_api.TENANT_ID, r_8d, now_dt=t_now) is None
    assert agent_runs.get_run(vpost_api.TENANT_ID, r_7d1m, now_dt=t_now) is None
    # Other tenant untouched by TENANT_ID cleanup, then removed by unscoped cleanup
    assert agent_runs.get_run(OTHER_TENANT, r_other_old, now_dt=t_now) is not None
    assert agent_runs.cleanup_old_runs(now_dt=t_now) == 1
    assert agent_runs.get_run(OTHER_TENANT, r_other_old, now_dt=t_now) is None


# ---------------- 8. Tenant isolation & route validation ----------------

def test_tenant_isolation_and_runs_route_errors():
    seed_comment("t_shared", tenant_id=vpost_api.TENANT_ID, message="Giá bao nhiêu ạ?")
    seed_comment("t_shared", tenant_id=OTHER_TENANT, message="Giá bao nhiêu ạ?")
    seed_comment("t_only_other", tenant_id=OTHER_TENANT, message="Hỏi khác tenant")
    seed_comment("c_child", parent_id="t_shared", message="Trả lời con")

    # Seed running + done runs for OTHER_TENANT on the SAME thread_id ("t_shared") and "t_only_other"
    other_run_done = agent_runs.start_run(OTHER_TENANT, "t_shared", "auto_reply", comment_id="t_shared")
    agent_runs.add_step(OTHER_TENANT, other_run_done, "read", "ok", detail="Tenant B secret")
    agent_runs.finish_run(OTHER_TENANT, other_run_done, status="done", outcome="sent", reply_message_id="rep_other")

    other_run_running = agent_runs.start_run(OTHER_TENANT, "t_only_other", "draft", comment_id="t_only_other")
    agent_runs.add_step(OTHER_TENANT, other_run_running, "compose", "running", detail="Tenant B running")

    # TENANT_ID sees NO agentRun, NO agentRunId, NO runs, NO runningThreadIds from OTHER_TENANT
    det = client.get("/api/comments/threads/t_shared").json()
    assert det["thread"]["agentRun"] is None
    assert det["messages"][0]["agentRunId"] is None
    assert client.get("/api/comments/threads/t_shared/runs").json() == {
        "tenantId": vpost_api.TENANT_ID,
        "items": [],
    }
    assert client.get("/api/comments/updates").json()["runningThreadIds"] == []

    # Cross-tenant mutations are no-ops
    agent_runs.add_step(vpost_api.TENANT_ID, other_run_running, "action", "error", detail="hijack")
    assert agent_runs.finish_run(vpost_api.TENANT_ID, other_run_running, status="error", outcome="failed") is None
    still_other = agent_runs.get_run(OTHER_TENANT, other_run_running)
    assert still_other is not None and still_other["status"] == "running"
    assert [s["key"] for s in still_other["steps"]] == ["compose"]

    # Other-tenant thread, unknown thread, or child comment id -> 404 on /runs
    assert client.get("/api/comments/threads/t_only_other/runs").status_code == 404
    assert client.get("/api/comments/threads/nonexistent/runs").status_code == 404
    assert client.get("/api/comments/threads/c_child/runs").status_code == 404

    # Invalid limit -> 400
    assert client.get("/api/comments/threads/t_shared/runs?limit=0").status_code == 400
    assert client.get("/api/comments/threads/t_shared/runs?limit=101").status_code == 400

    # Wrong active tenant cookie -> 403
    client.cookies.set(vpost_api.TENANT_COOKIE, OTHER_TENANT)
    assert client.get("/api/comments/threads/t_shared/runs").status_code == 403
