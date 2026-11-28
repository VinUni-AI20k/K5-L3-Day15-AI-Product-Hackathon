"""API tests for auto-reply settings, log, thread attention/autoReply/sentBy fields, clear route, updates feed, and tenant isolation."""
from __future__ import annotations

import os
import re
import sys
import tempfile
import uuid
from datetime import datetime, timedelta, timezone

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

import auto_reply  # noqa: E402
import comment_poller  # noqa: E402
import facebook  # noqa: E402
import inbox_store  # noqa: E402
import moderation_store  # noqa: E402
import server  # noqa: E402
import vpost_api  # noqa: E402
import writing_style  # noqa: E402

client = TestClient(server.app)
IMG = "https://lh3.googleusercontent.com/d/abc123"
PAGE_ID = "123"
CHANNEL_ID = "fb-123"
PAGE_TOKEN = "EAAG_SECRET_API_TOKEN"
PAGE2_ID = "456"
CHANNEL2_ID = "fb-456"
PAGE2_TOKEN = "EAAG_SECRET_API_TOKEN_2"
OTHER_TENANT = "11111111-1111-4111-8111-111111111111"
Z = re.compile(r"^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$")

ROW_G1 = {
    "ma_sp": "G1",
    "ten_sp": "Đầm Voan Hoa G1",
    "loai": "Váy",
    "gia_ban": "890.000đ",
    "gia_te": "50",
    "size": "S-L",
    "mau": "Đen, Trắng",
    "chat_lieu": "Voan",
    "mo_ta": "Váy xoè 2 lớp.",
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


def iso_ago(hours=0, minutes=0, seconds=0):
    dt = datetime.now(timezone.utc) - timedelta(hours=hours, minutes=minutes, seconds=seconds)
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
    store.upsert_fb_comment(
        tenant_id or vpost_api.TENANT_ID,
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
    os.environ.pop("VPOST_AUTO_REPLY_DISABLED", None)
    client.cookies.clear()


# ---------------- 1. Settings CRUD & CONFIRM_REQUIRED ----------------

def test_auto_reply_settings_defaults_validation_and_confirm_required():
    seed_page(page_id=PAGE2_ID, name="Page Two", token=PAGE2_TOKEN)

    r_get = client.get("/api/comments/auto-reply-settings")
    assert r_get.status_code == 200, r_get.text
    b = r_get.json()
    assert b["tenantId"] == vpost_api.TENANT_ID
    assert len(b["items"]) == 2
    p1 = next(x for x in b["items"] if x["pageId"] == PAGE_ID)
    assert p1 == {
        "pageId": PAGE_ID,
        "channelId": CHANNEL_ID,
        "pageName": "WorkHardToday",
        "enabled": False,
        "mode": "dry_run",
        "intents": ["price", "size", "color"],
        "hourlyCap": 30,
        "dailyCap": 200,
        "updatedAt": None,
    }

    # Enable in dry_run -> 200 without confirmLive
    r_dry = client.put(
        f"/api/comments/auto-reply-settings/{PAGE_ID}",
        json={"enabled": True, "mode": "dry_run", "intents": ["price", "size"], "hourlyCap": 20, "dailyCap": 150},
    )
    assert r_dry.status_code == 200, r_dry.text
    s_dry = r_dry.json()["setting"]
    assert s_dry["enabled"] is True and s_dry["mode"] == "dry_run"
    assert s_dry["intents"] == ["price", "size"]
    assert s_dry["hourlyCap"] == 20 and s_dry["dailyCap"] == 150
    assert Z.match(s_dry["updatedAt"])

    # Switching dry_run -> live without confirmLive -> 400 CONFIRM_REQUIRED
    r_no_conf = client.put(
        f"/api/comments/auto-reply-settings/{PAGE_ID}",
        json={"enabled": True, "mode": "live", "intents": ["price"]},
    )
    assert r_no_conf.status_code == 400 and r_no_conf.json()["code"] == "CONFIRM_REQUIRED"

    # confirmLive: false -> also 400 CONFIRM_REQUIRED
    r_false_conf = client.put(
        f"/api/comments/auto-reply-settings/{PAGE_ID}",
        json={"enabled": True, "mode": "live", "intents": ["price"], "confirmLive": False},
    )
    assert r_false_conf.status_code == 400 and r_false_conf.json()["code"] == "CONFIRM_REQUIRED"

    # confirmLive: true -> 200, preserves existing caps if omitted
    r_live = client.put(
        f"/api/comments/auto-reply-settings/{PAGE_ID}",
        json={"enabled": True, "mode": "live", "intents": ["price", "color"], "confirmLive": True},
    )
    assert r_live.status_code == 200, r_live.text
    s_live = r_live.json()["setting"]
    assert s_live["mode"] == "live" and s_live["hourlyCap"] == 20 and s_live["dailyCap"] == 150

    # Updating while already live does not require confirmLive again
    r_upd = client.put(
        f"/api/comments/auto-reply-settings/{PAGE_ID}",
        json={"enabled": True, "mode": "live", "intents": ["price"], "hourlyCap": 50},
    )
    assert r_upd.status_code == 200 and r_upd.json()["setting"]["hourlyCap"] == 50

    # Validation errors & 404
    assert client.put(
        f"/api/comments/auto-reply-settings/{PAGE_ID}",
        json={"enabled": True, "mode": "dry_run", "intents": ["bogus"]},
    ).status_code == 400
    assert client.put(
        f"/api/comments/auto-reply-settings/{PAGE_ID}",
        json={"enabled": True, "mode": "dry_run", "intents": ["price"], "hourlyCap": 201},
    ).status_code == 400
    assert client.put(
        f"/api/comments/auto-reply-settings/{PAGE_ID}",
        json={"enabled": True, "mode": "dry_run", "intents": ["price"], "dailyCap": 0},
    ).status_code == 400
    assert client.put(
        "/api/comments/auto-reply-settings/nonexistent",
        json={"enabled": False, "mode": "dry_run", "intents": ["price"]},
    ).status_code == 404


# ---------------- 2. Threads filter=can_ban, ordering, attention/autoReply/sentBy, clear, operator reply ----------------

def test_threads_can_ban_filter_floating_order_clear_and_operator_reply_clears_tag():
    # Enable live mode via API
    assert client.put(
        f"/api/comments/auto-reply-settings/{PAGE_ID}",
        json={"enabled": True, "mode": "live", "intents": ["price", "size", "color"], "confirmLive": True},
    ).status_code == 200

    fb_calls = []
    facebook.reply_comment = lambda target, msg, tok: (fb_calls.append((target, msg)), f"fb_rep_{len(fb_calls)}")[1]

    # t_old_tagged (older, will be tagged can_ban) -> must float ABOVE t_new_untagged in server order!
    seed_comment("t_old_tagged", from_id="u1", from_name="Khách A", message="Ship HN bao nhiêu?", created_time=iso_ago(minutes=40))
    # t_auto (qualifying price question -> auto-replied)
    seed_comment("t_auto", from_id="u2", from_name="Khách B", message="Giá bao nhiêu ạ?", created_time=iso_ago(minutes=30))
    # t_new_untagged (newest, not run through auto-reply yet -> no attention tag)
    seed_comment("t_new_untagged", from_id="u3", from_name="Khách C", message="Chờ mình xem thêm", created_time=iso_ago(minutes=5))

    auto_reply.run_auto_reply(vpost_api.TENANT_ID, ["t_old_tagged", "t_auto"])

    # In filter=all, t_old_tagged floats to the top ahead of t_new_untagged & t_auto!
    lst_all = client.get("/api/comments/threads?filter=all").json()
    assert lst_all["counts"]["canBan"] == 1
    assert lst_all["items"][0]["id"] == "t_old_tagged"
    assert lst_all["items"][0]["attention"]["tag"] == "can_ban"
    assert lst_all["items"][0]["attention"]["reason"]
    assert Z.match(lst_all["items"][0]["attention"]["since"])
    assert lst_all["items"][0]["autoReply"]["lastAction"] == "skipped"

    t_auto_item = next(x for x in lst_all["items"] if x["id"] == "t_auto")
    assert t_auto_item["attention"] is None
    assert t_auto_item["autoReply"]["lastAction"] == "sent"
    assert "890.000đ" in t_auto_item["autoReply"]["text"]

    # filter=can_ban returns only tagged threads
    lst_cb = client.get("/api/comments/threads?filter=can_ban").json()
    assert [x["id"] for x in lst_cb["items"]] == ["t_old_tagged"]

    # Pagination across tagged -> untagged boundary stays stable
    p1 = client.get("/api/comments/threads?filter=all&limit=1").json()
    assert [x["id"] for x in p1["items"]] == ["t_old_tagged"] and p1["nextCursor"]
    p2 = client.get(f"/api/comments/threads?filter=all&limit=1&cursor={p1['nextCursor']}").json()
    assert len(p2["items"]) == 1 and p2["items"][0]["id"] != "t_old_tagged"

    # Message sentBy on t_auto: customer=null, auto reply="auto"
    det_auto = client.get("/api/comments/threads/t_auto").json()
    assert det_auto["messages"][0]["fromPage"] is False and det_auto["messages"][0]["sentBy"] is None
    assert det_auto["messages"][1]["fromPage"] is True and det_auto["messages"][1]["sentBy"] == "auto"

    # Re-syncing the Page reply from Facebook must preserve sentBy="auto"
    auto_reply_id = det_auto["messages"][1]["id"]
    seed_comment(
        auto_reply_id,
        parent_id="t_auto",
        from_id=PAGE_ID,
        from_name="WorkHardToday",
        is_from_page=1,
        message=det_auto["messages"][1]["text"],
        status="replied",
    )
    det_after_resync = client.get("/api/comments/threads/t_auto").json()
    assert det_after_resync["messages"][1]["sentBy"] == "auto"

    # Manual clear route removes attention tag
    r_clr = client.post("/api/comments/threads/t_old_tagged/attention/clear")
    assert r_clr.status_code == 200, r_clr.text
    assert r_clr.json()["thread"]["attention"] is None
    assert client.get("/api/comments/threads?filter=can_ban").json()["counts"]["canBan"] == 0

    # Re-tag t_old_tagged, then operator reply automatically clears the tag and sets sentBy="operator"
    store.set_thread_attention(vpost_api.TENANT_ID, "t_old_tagged", "Hỏi phí ship")
    assert client.get("/api/comments/threads/t_old_tagged").json()["thread"]["attention"]["tag"] == "can_ban"

    r_op = client.post(
        "/api/comments/threads/t_old_tagged/reply",
        json={"text": "Dạ Đầm Voan Hoa G1 giá 890.000đ bạn nhé!", "clientId": str(uuid.uuid4())},
    )
    assert r_op.status_code == 200, r_op.text
    assert r_op.json()["thread"]["attention"] is None
    assert r_op.json()["message"]["sentBy"] == "operator"
    assert client.get("/api/comments/threads?filter=can_ban").json()["counts"]["canBan"] == 0


# ---------------- 3. Updates feed: needYou & autoReplied ----------------

def test_updates_feed_emits_need_you_and_auto_replied_monotonically():
    assert client.put(
        f"/api/comments/auto-reply-settings/{PAGE_ID}",
        json={"enabled": True, "mode": "live", "intents": ["price"], "confirmLive": True},
    ).status_code == 200

    facebook.reply_comment = lambda target, msg, tok: f"fb_upd_{target}"

    u0 = client.get("/api/comments/updates").json()
    assert u0["needYou"] == [] and u0["autoReplied"] == []
    cur0 = u0["cursor"]

    seed_comment("c_u_auto", from_id="u1", from_name="Minh", message="Giá bao nhiêu ạ?")
    seed_comment("c_u_need", from_id="u2", from_name="Hạnh", message="Đổi trả được không shop?")
    auto_reply.run_auto_reply(vpost_api.TENANT_ID, ["c_u_auto", "c_u_need"])

    u1 = client.get(f"/api/comments/updates?since={cur0}").json()
    assert u1["autoReplied"] == [{"threadId": "c_u_auto", "messageId": "fb_upd_c_u_auto"}]
    assert len(u1["needYou"]) == 1
    assert u1["needYou"][0]["threadId"] == "c_u_need"
    assert u1["needYou"][0]["customerName"] == "Hạnh"
    assert u1["needYou"][0]["reason"]

    # Next poll with updated cursor is empty
    u2 = client.get(f"/api/comments/updates?since={u1['cursor']}").json()
    assert u2["needYou"] == [] and u2["autoReplied"] == []


# ---------------- 4. Auto-reply log filters & pagination ----------------

def test_auto_reply_log_filtering_and_pagination():
    seed_page(page_id=PAGE2_ID, name="Page Two", token=PAGE2_TOKEN)
    t_base = datetime(2026, 11, 28, 12, 0, 0, tzinfo=timezone.utc)
    for i in range(5):
        store.append_auto_reply_log(
            vpost_api.TENANT_ID,
            page_id=PAGE_ID if i < 4 else PAGE2_ID,
            thread_id=f"t{i}",
            comment_id=f"c{i}",
            intents=["price"] if i % 2 == 0 else [],
            action="would_send" if i % 2 == 0 else "skipped",
            reason="" if i % 2 == 0 else "Hỏi phí ship",
            text=f"Dạ mẫu G1 giá 890.000đ ({i})" if i % 2 == 0 else "",
            created_at=(t_base + timedelta(minutes=i)).strftime("%Y-%m-%dT%H:%M:%S.000Z"),
        )

    p1 = client.get("/api/comments/auto-reply-log?limit=2").json()
    assert p1["tenantId"] == vpost_api.TENANT_ID
    assert [x["commentId"] for x in p1["items"]] == ["c4", "c3"]
    assert p1["nextCursor"] is not None

    p2 = client.get(f"/api/comments/auto-reply-log?limit=2&cursor={p1['nextCursor']}").json()
    assert [x["commentId"] for x in p2["items"]] == ["c2", "c1"]

    p3 = client.get(f"/api/comments/auto-reply-log?limit=2&cursor={p2['nextCursor']}").json()
    assert [x["commentId"] for x in p3["items"]] == ["c0"] and p3["nextCursor"] is None

    by_page = client.get(f"/api/comments/auto-reply-log?pageId={PAGE2_ID}").json()
    assert [x["commentId"] for x in by_page["items"]] == ["c4"]

    by_action = client.get("/api/comments/auto-reply-log?action=skipped").json()
    assert [x["commentId"] for x in by_action["items"]] == ["c3", "c1"]
    assert by_action["items"][0]["text"] is None and by_action["items"][0]["reason"] == "Hỏi phí ship"

    assert client.get("/api/comments/auto-reply-log?action=invalid").status_code == 400
    assert client.get("/api/comments/auto-reply-log?cursor=bad!!!").status_code == 400


# ---------------- 5. Tenant isolation ----------------

def test_auto_reply_tenant_isolation():
    # Seed data in OTHER_TENANT directly in DB
    store.upsert_auto_reply_setting(
        OTHER_TENANT, PAGE_ID, enabled=True, mode="live", intents=["price"], hourly_cap=5, daily_cap=10
    )
    seed_comment("t_other", tenant_id=OTHER_TENANT, message="Ship bn?")
    store.set_thread_attention(OTHER_TENANT, "t_other", "Hỏi ship")
    store.append_auto_reply_log(
        OTHER_TENANT, page_id=PAGE_ID, thread_id="t_other", comment_id="t_other", action="skipped", reason="Hỏi ship"
    )

    # Current tenant cannot see OTHER_TENANT's setting, logs, threads, or clear its attention
    s_cur = client.get("/api/comments/auto-reply-settings").json()["items"][0]
    assert s_cur["enabled"] is False and s_cur["mode"] == "dry_run"
    assert client.get("/api/comments/auto-reply-log").json()["items"] == []
    assert client.get("/api/comments/threads?filter=can_ban").json()["items"] == []
    assert client.post("/api/comments/threads/t_other/attention/clear").status_code == 404

    # Foreign tenant cookie -> 403 FORBIDDEN on every endpoint
    seed_comment("t_mine", message="Giá bn?")
    other = TestClient(server.app)
    other.cookies.set(vpost_api.TENANT_COOKIE, OTHER_TENANT)
    for method, path, payload in (
        ("GET", "/api/comments/auto-reply-settings", None),
        ("PUT", f"/api/comments/auto-reply-settings/{PAGE_ID}", {"enabled": False, "mode": "dry_run", "intents": ["price"]}),
        ("GET", "/api/comments/auto-reply-log", None),
        ("POST", "/api/comments/threads/t_mine/attention/clear", None),
    ):
        r = other.request(method, path, json=payload)
        assert r.status_code == 403 and r.json()["code"] == "FORBIDDEN", (method, path, r.text)


# ---------------- 6. Red-team regression tests (Findings 12–14) ----------------

def test_finding12_manual_sync_runs_auto_reply_and_tags_can_ban():
    """#12: Manual POST /api/comments/sync runs the auto-reply pipeline (auto-reply + can_ban tagging)."""
    assert client.put(
        f"/api/comments/auto-reply-settings/{PAGE_ID}",
        json={"enabled": True, "mode": "live", "intents": ["price", "size", "color"], "confirmLive": True},
    ).status_code == 200

    fb_calls = []
    facebook.reply_comment = lambda target, msg, tok: (fb_calls.append((target, msg)), f"fb_sync_{len(fb_calls)}")[1]
    facebook.list_comments = lambda fb_post_id, token, since=None: [
        {
            "id": "c_sync_ship",
            "message": "Ship HN bao nhiêu?",
            "created_time": iso_ago(minutes=2),
            "from": {"id": "u_s1", "name": "Mai"},
            "is_hidden": False,
            "can_comment": True,
        },
        {
            "id": "c_sync_price",
            "message": "Giá bao nhiêu ạ?",
            "created_time": iso_ago(minutes=3),
            "from": {"id": "u_s2", "name": "Linh"},
            "is_hidden": False,
            "can_comment": True,
        },
    ]

    r_sync = client.post("/api/comments/sync", json={})
    assert r_sync.status_code == 200, r_sync.text
    assert r_sync.json()["newComments"] == 2

    # Price question was auto-replied live; shipping question was tagged can_ban!
    assert len(fb_calls) == 1 and fb_calls[0][0] == "c_sync_price"
    assert "890.000đ" in fb_calls[0][1]
    atts = store.get_thread_attentions(vpost_api.TENANT_ID, ["c_sync_ship", "c_sync_price"])
    assert "c_sync_ship" in atts and atts["c_sync_ship"]["tag"] == "can_ban"
    assert "c_sync_price" not in atts

    # Subsequent poller tick does not duplicate the reply
    tick = comment_poller.run_tick()
    assert tick["autoReplied"] == 0
    assert len(fb_calls) == 1


def test_finding13_enabling_while_live_requires_confirm_live():
    """#13: Toggling enabled false -> true while mode='live' requires confirmLive=true."""
    # Save disabled + live with confirmLive=true
    r_init = client.put(
        f"/api/comments/auto-reply-settings/{PAGE_ID}",
        json={"enabled": False, "mode": "live", "intents": ["price"], "confirmLive": True},
    )
    assert r_init.status_code == 200, r_init.text
    assert r_init.json()["setting"]["enabled"] is False and r_init.json()["setting"]["mode"] == "live"

    # Attempting to enable while mode='live' WITHOUT confirmLive -> 400 CONFIRM_REQUIRED
    r_no_conf = client.put(
        f"/api/comments/auto-reply-settings/{PAGE_ID}",
        json={"enabled": True, "mode": "live", "intents": ["price"]},
    )
    assert r_no_conf.status_code == 400 and r_no_conf.json()["code"] == "CONFIRM_REQUIRED"

    # confirmLive=false -> also 400 CONFIRM_REQUIRED
    r_false = client.put(
        f"/api/comments/auto-reply-settings/{PAGE_ID}",
        json={"enabled": True, "mode": "live", "intents": ["price"], "confirmLive": False},
    )
    assert r_false.status_code == 400 and r_false.json()["code"] == "CONFIRM_REQUIRED"

    # confirmLive=true -> 200 and enabled=True
    r_ok = client.put(
        f"/api/comments/auto-reply-settings/{PAGE_ID}",
        json={"enabled": True, "mode": "live", "intents": ["price"], "confirmLive": True},
    )
    assert r_ok.status_code == 200 and r_ok.json()["setting"]["enabled"] is True

    # Disabling (true -> false) while live does not require confirmLive
    r_off = client.put(
        f"/api/comments/auto-reply-settings/{PAGE_ID}",
        json={"enabled": False, "mode": "live", "intents": ["price"]},
    )
    assert r_off.status_code == 200 and r_off.json()["setting"]["enabled"] is False


def test_finding14_operator_reply_rejects_auto_prefixed_client_id():
    """#14: Operator reply path rejects clientId starting with 'auto:' (HTTP route and internal send_thread_reply)."""
    seed_comment("c_f14", from_id="u_f14", message="Giá bao nhiêu ạ?")
    fb_calls = []
    facebook.reply_comment = lambda *a, **kw: (fb_calls.append(a), "fb_never")[1]

    for bad_cid in ("auto:c_f14", "AUTO:c_f14"):
        r_http = client.post(
            "/api/comments/threads/c_f14/reply",
            json={"text": "Dạ Đầm Voan Hoa G1 giá 890.000đ bạn nhé!", "clientId": bad_cid},
        )
        assert r_http.status_code == 400 and r_http.json()["code"] == "INVALID_INPUT", r_http.text

        with pytest.raises(vpost_api.ApiError) as exc_info:
            vpost_api.send_thread_reply(
                "c_f14",
                "Dạ Đầm Voan Hoa G1 giá 890.000đ bạn nhé!",
                bad_cid,
                sent_by="operator",
            )
        assert exc_info.value.status_code == 400
        assert exc_info.value.detail["code"] == "INVALID_INPUT"

    assert fb_calls == []
    assert store.has_sent_auto_reply_for_comment(vpost_api.TENANT_ID, "c_f14") is False



def test_n02_three_level_reply_tags_root_thread_visible_in_can_ban_api():
    """N2 API: 3-level reply (parent_id = page_reply_id) tags the true top-level root visible in GET /api/comments/threads?filter=can_ban."""
    assert client.put(
        f"/api/comments/auto-reply-settings/{PAGE_ID}",
        json={"enabled": True, "mode": "live", "intents": ["price", "size", "color"], "confirmLive": True},
    ).status_code == 200

    fb_calls = []
    facebook.reply_comment = lambda *a, **kw: (fb_calls.append(a), "fb_never")[1]

    seed_comment("c_api_3lvl", parent_id="", from_id="u1", from_name="Thu", message="Cho em hỏi chút", created_time=iso_ago(minutes=15))
    seed_comment("p_api_3lvl", parent_id="c_api_3lvl", from_id=PAGE_ID, from_name="WorkHardToday", is_from_page=1, message="Dạ chị cần tư vấn gì ạ?", created_time=iso_ago(minutes=10), status="replied")
    seed_comment("c_api_3lvl_q", parent_id="p_api_3lvl", from_id="u1", from_name="Thu", message="Giá bao nhiêu ạ?", created_time=iso_ago(minutes=5))

    res = auto_reply.run_auto_reply(vpost_api.TENANT_ID, ["c_api_3lvl_q"])
    assert res["sent"] == 0 and res["tagged"] == 1
    assert fb_calls == []

    # True root appears in filter=can_ban and thread detail includes the 3-level reply!
    lst = client.get("/api/comments/threads?filter=can_ban").json()
    assert [x["id"] for x in lst["items"]] == ["c_api_3lvl"]
    assert lst["counts"]["canBan"] == 1
    assert lst["items"][0]["attention"]["tag"] == "can_ban"

    det = client.get("/api/comments/threads/c_api_3lvl").json()
    assert [m["id"] for m in det["messages"]] == ["c_api_3lvl", "p_api_3lvl", "c_api_3lvl_q"]
