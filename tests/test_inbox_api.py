"""Tests for inbox_store.py, inbox_api.py, facebook.like_comment, and tools.like_fb_comment."""
from __future__ import annotations

import inspect
import json
import logging
import os
import re
import sys
import tempfile
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from typing import Optional

import httpx
import pytest
from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.testclient import TestClient
from starlette.exceptions import HTTPException as StarletteHTTPException

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "codebase"))

import store  # noqa: E402

_pg_skip = os.environ.get("_VPOST_PG_UNAVAILABLE")
if _pg_skip is None:
    _ok, _pg_err = store.check_connection()
    _pg_skip = "" if _ok else _pg_err
if _pg_skip:
    pytest.skip("PostgreSQL unreachable (%s)" % _pg_skip, allow_module_level=True)

import facebook  # noqa: E402
import inbox_api  # noqa: E402
import inbox_store  # noqa: E402
import moderation_api  # noqa: E402
import moderation_store  # noqa: E402
import tools  # noqa: E402
import tracing  # noqa: E402
import vpost_api  # noqa: E402

if "server" not in sys.modules:
    tools.UPLOADS = tempfile.mkdtemp()

PAGE_A = "123"
CHANNEL_A = "fb-123"
TOKEN_A = "EAAG_SECRET_INBOX_TOKEN_A"
PAGE_B = "456"
CHANNEL_B = "fb-456"
TOKEN_B = "EAAG_SECRET_INBOX_TOKEN_B"
OTHER_TENANT = "11111111-1111-4111-8111-111111111111"
Z_RE = re.compile(r"^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$")

_ERROR_CODES = {
    400: "INVALID_INPUT",
    404: "NOT_FOUND",
    405: "INVALID_INPUT",
    409: "CONFLICT",
    413: "INVALID_INPUT",
    422: "INVALID_INPUT",
    502: "UPSTREAM_ERROR",
}


def _build_test_app() -> FastAPI:
    app = FastAPI(title="VPOST Inbox Extras Test")
    app.include_router(inbox_api.router)
    app.include_router(moderation_api.router)
    app.include_router(vpost_api.router)

    @app.exception_handler(StarletteHTTPException)
    async def http_error(request, exc):
        d = exc.detail
        body = (
            dict(d)
            if isinstance(d, dict) and "code" in d
            else {"code": _ERROR_CODES.get(exc.status_code, "ERROR"), "message": str(d or "Lỗi")}
        )
        body["detail"] = body["message"]
        return JSONResponse(body, status_code=exc.status_code)

    @app.exception_handler(RequestValidationError)
    async def validation_error(request, exc):
        issues = [
            {"path": ".".join(str(p) for p in e["loc"] if p not in ("body", "query", "path")), "message": e["msg"]}
            for e in exc.errors()
        ]
        msg = "Dữ liệu gửi lên không hợp lệ: " + "; ".join("%s %s" % (i["path"], i["message"]) for i in issues)
        return JSONResponse({"code": "INVALID_INPUT", "message": msg, "issues": issues, "detail": msg}, status_code=400)

    return app


app = _build_test_app()
client = TestClient(app)

_ORIG_FB_LIKE = facebook.like_comment
_ORIG_LIKE_TOOL = tools.like_fb_comment


class FakeResp:
    def __init__(self, status_code: int, payload):
        self.status_code = status_code
        self._payload = payload
        self.text = json.dumps(payload, ensure_ascii=False) if isinstance(payload, dict) else str(payload)

    def json(self):
        if isinstance(self._payload, Exception):
            raise self._payload
        return self._payload


def iso_ago(*, hours=0, days=0, minutes=0, seconds=0) -> str:
    dt = datetime.now(timezone.utc) - timedelta(days=days, hours=hours, minutes=minutes, seconds=seconds)
    return dt.strftime("%Y-%m-%dT%H:%M:%S.000Z")


def seed_pages():
    store.save_fb_pages(
        [
            {"id": PAGE_A, "name": "Dịu Mây Boutique", "access_token": TOKEN_A},
            {"id": PAGE_B, "name": "Phố Nhỏ Studio", "access_token": TOKEN_B},
        ],
        "UTOKEN",
        iso_ago(),
    )


def seed_post_job(
    job_id: str = "job-1",
    *,
    channel_id: str = CHANNEL_A,
    fb_post_id: str = "123_1001",
    caption: str = "Đầm Voan Hoa G1 màu đen, size S-L, giá 890.000đ",
):
    ts = iso_ago(hours=5)
    store.create_post_batch(
        {"id": "batch-" + job_id, "product_code": "G1", "color": "Đen", "format": "image_post", "created_at": ts},
        [
            {
                "id": job_id,
                "batch_id": "batch-" + job_id,
                "product_code": "G1",
                "color": "Đen",
                "format": "image_post",
                "channel_id": channel_id,
                "caption": caption,
                "media": [],
                "status": "published",
                "scheduled_at": None,
                "fb_post_id": fb_post_id,
                "published_url": "https://www.facebook.com/" + fb_post_id,
                "published_at": ts,
                "error_code": None,
                "user_message": "",
                "attempt_count": 1,
                "created_at": ts,
                "updated_at": ts,
            }
        ],
    )


def seed_comment(
    cid: str,
    *,
    tenant_id: Optional[str] = None,
    page_id: str = PAGE_A,
    channel_id: Optional[str] = None,
    post_job_id: str = "job-1",
    fb_post_id: str = "123_1001",
    parent_id: str = "",
    from_id: str = "u1",
    from_name: str = "Lan Anh",
    is_from_page: int = 0,
    message: str = "Mẫu này còn size M không shop?",
    created_time: Optional[str] = None,
    status: str = "unreplied",
    is_hidden: int = 0,
    can_comment: int = 1,
):
    ts = created_time or iso_ago(hours=1)
    store.upsert_fb_comment(
        tenant_id or vpost_api.TENANT_ID,
        {
            "id": cid,
            "channel_id": channel_id if channel_id is not None else ("fb-" + page_id),
            "page_id": page_id,
            "post_job_id": post_job_id,
            "fb_post_id": fb_post_id,
            "product_code": "G1",
            "parent_id": parent_id,
            "from_id": from_id,
            "from_name": from_name,
            "is_from_page": is_from_page,
            "message": message,
            "permalink_url": "https://www.facebook.com/%s?comment_id=%s" % (fb_post_id, cid),
            "is_hidden": is_hidden,
            "can_comment": can_comment,
            "created_time": ts,
            "status": status,
            "synced_at": ts,
            "updated_at": ts,
        },
    )


def _block_network(*args, **kwargs):
    raise AssertionError("Tests must never call the network!")


def setup_function(_):
    store.init()
    moderation_store.init_moderation()
    inbox_store.init_inbox()
    for k in ("FB_APP_ID", "FB_APP_SECRET", "FB_PAGE_ID", "FB_PAGE_TOKEN"):
        os.environ.pop(k, None)
    with store.connect() as c:
        for t in (
            "comment_like",
            "quick_reply",
            "customer_tag_link",
            "customer_tag",
            "customer_note",
            "fb_comment",
            "comment_draft",
            "comment_sync",
            "fb_page",
            "fb_user",
            "channel_status",
            "post_job",
            "post_batch",
        ):
            c.execute("delete from %s" % t)
    facebook.like_comment = _ORIG_FB_LIKE
    tools.like_fb_comment = _ORIG_LIKE_TOOL
    seed_pages()
    client.cookies.clear()


def teardown_function(_):
    facebook.like_comment = _ORIG_FB_LIKE
    tools.like_fb_comment = _ORIG_LIKE_TOOL
    client.cookies.clear()


@pytest.fixture(autouse=True)
def _no_network(monkeypatch):
    monkeypatch.setattr(httpx, "get", _block_network)
    monkeypatch.setattr(httpx, "post", _block_network)
    monkeypatch.setattr(httpx, "delete", _block_network)


# ---------------- 1. Schema idempotency & batch queries ----------------

def test_init_inbox_idempotent_and_creates_all_tables():
    inbox_store.init_inbox()
    inbox_store.init_inbox()
    with store.connect() as c:
        tables = {
            r["table_name"]
            for r in c.execute(
                "select table_name from information_schema.tables where table_schema = current_schema()"
            ).fetchall()
        }
    assert {"comment_like", "quick_reply", "customer_tag", "customer_tag_link", "customer_note"} <= tables


def test_liked_ids_and_tags_for_are_single_batch_queries(monkeypatch):
    tid = vpost_api.TENANT_ID
    inbox_store.set_comment_like(tid, "c1", True, liked_at=iso_ago())
    inbox_store.set_comment_like(tid, "c2", True, liked_at=iso_ago())
    inbox_store.set_comment_like(OTHER_TENANT, "c3", True, liked_at=iso_ago())

    t_vip = inbox_store.create_customer_tag(tid, name="VIP", color="yellow", created_at=iso_ago())
    t_new = inbox_store.create_customer_tag(tid, name="Mới", color="blue", created_at=iso_ago())
    t_other = inbox_store.create_customer_tag(OTHER_TENANT, name="VIP", color="red", created_at=iso_ago())
    inbox_store.replace_customer_tags(tid, "u1", [t_vip["id"], t_new["id"]], created_at=iso_ago())
    inbox_store.replace_customer_tags(tid, "u2", [t_vip["id"]], created_at=iso_ago())
    inbox_store.replace_customer_tags(OTHER_TENANT, "u1", [t_other["id"]], created_at=iso_ago())

    orig_connect = store.connect
    exec_counts: list[int] = []

    class CountingConn:
        def __init__(self, conn):
            self._conn = conn

        def execute(self, *a, **kw):
            exec_counts.append(1)
            return self._conn.execute(*a, **kw)

        def __getattr__(self, name):
            return getattr(self._conn, name)

    @contextmanager
    def counting_connect():
        with orig_connect() as conn:
            yield CountingConn(conn)

    monkeypatch.setattr(store, "connect", counting_connect)

    # Empty inputs -> 0 queries
    assert inbox_store.liked_ids(tid, []) == set()
    assert inbox_store.tags_for(tid, []) == {}
    assert len(exec_counts) == 0

    # Batch liked_ids -> exactly 1 query
    got_likes = inbox_store.liked_ids(tid, ["c1", "c2", "c3", "c4", "c1"])
    assert got_likes == {"c1", "c2"}
    assert len(exec_counts) == 1

    # Batch tags_for -> exactly 1 query
    exec_counts.clear()
    got_tags = inbox_store.tags_for(tid, ["u1", "u2", "u3", "u1"])
    assert len(exec_counts) == 1
    assert set(got_tags.keys()) == {"u1", "u2"}
    assert [t["name"] for t in got_tags["u1"]] == ["Mới", "VIP"]
    assert got_tags["u2"] == [{"id": t_vip["id"], "name": "VIP", "color": "yellow"}]


# ---------------- 2. Facebook like_comment & tools.like_fb_comment ----------------

def test_facebook_like_and_unlike_token_placement_and_errors(monkeypatch):
    seen_post = []
    seen_del = []

    def fake_post(url, data=None, **kw):
        seen_post.append((url, dict(data or {}), kw))
        return FakeResp(200, {"success": True})

    def fake_del(url, headers=None, **kw):
        seen_del.append((url, dict(headers or {}), kw))
        return FakeResp(200, {"success": True})

    monkeypatch.setattr(httpx, "post", fake_post)
    monkeypatch.setattr(httpx, "delete", fake_del)

    assert facebook.like_comment("123_999", True, TOKEN_A) is True
    assert len(seen_post) == 1
    url, data, _ = seen_post[0]
    assert url.endswith("/123_999/likes")
    assert TOKEN_A not in url
    assert data.get("access_token") == TOKEN_A

    assert facebook.like_comment("123_999", False, TOKEN_A) is True
    assert len(seen_del) == 1
    d_url, d_headers, d_kw = seen_del[0]
    assert d_url.endswith("/123_999/likes")
    assert TOKEN_A not in d_url
    assert not d_kw.get("params")
    assert d_headers.get("Authorization") == "Bearer %s" % TOKEN_A

    # Graph errors on both POST and DELETE map properly and never leak token
    for code, expected in ((190, "TOKEN_INVALID"), (200, "PERMISSION_MISSING"), (4, "RATE_LIMITED"), (368, "POSTING_TOO_FAST"), (100, "GRAPH_ERROR")):
        monkeypatch.setattr(httpx, "post", lambda *a, _c=code, **kw: FakeResp(400, {"error": {"code": _c, "message": "err"}}))
        monkeypatch.setattr(httpx, "delete", lambda *a, _c=code, **kw: FakeResp(400, {"error": {"code": _c, "message": "err"}}))
        for liked_val in (True, False):
            with pytest.raises(facebook.FacebookError) as exc_info:
                facebook.like_comment("c1", liked_val, TOKEN_A)
            assert exc_info.value.code == expected
            assert TOKEN_A not in exc_info.value.user_message

    # Network failure -> UPSTREAM_ERROR without token
    def boom(*a, **kw):
        raise httpx.TimeoutException("timeout")

    monkeypatch.setattr(httpx, "post", boom)
    monkeypatch.setattr(httpx, "delete", boom)
    for liked_val in (True, False):
        with pytest.raises(facebook.FacebookError) as exc_info:
            facebook.like_comment("c1", liked_val, TOKEN_A)
        assert exc_info.value.code == "UPSTREAM_ERROR"
        assert TOKEN_A not in exc_info.value.user_message


def test_like_fb_comment_tool_contract_and_tracing(monkeypatch):
    assert "like_fb_comment" in tracing.TOOLS
    doc = tools.like_fb_comment.__doc__ or ""
    assert "like_fb_comment" in doc and "input:" in doc and "output:" in doc and "tác động ra ngoài" in doc
    for param in inspect.signature(tools.like_fb_comment).parameters:
        assert "token" not in param.lower()

    calls = []
    monkeypatch.setattr(facebook, "like_comment", lambda cid, liked, tok: (calls.append((cid, liked, tok)), True)[1])

    tracing.begin("test-like-tool")
    assert tools.like_fb_comment("c1", True, CHANNEL_A) is True
    _, events = tracing.end()
    assert calls == [("c1", True, TOKEN_A)]
    assert any(e["kind"] == "tool" and e["name"] == "like_fb_comment" for e in events)
    assert all(TOKEN_A not in json.dumps(e, ensure_ascii=False) for e in events)

    with pytest.raises(facebook.FacebookError) as exc_info:
        tools.like_fb_comment("c1", True, "fb-missing")
    assert exc_info.value.code == "TOKEN_INVALID"


# ---------------- 3. POST /api/comments/{commentId}/like ----------------

def test_like_route_happy_path_errors_and_no_pii_or_token_in_logs(monkeypatch, caplog):
    secret_msg = "Khách bí mật gọi 0912345678 mua váy G1"
    seed_comment("c1", message=secret_msg)
    seed_comment("c_page", is_from_page=1, from_id=PAGE_A, message="Dạ shop cảm ơn ạ")
    seed_comment("c_del", status="deleted", message="Đã xoá")
    seed_comment("c_other", tenant_id=OTHER_TENANT, message="Khác tenant")
    seed_comment("c_noconf", channel_id="diu-may", page_id="", message="Kênh mẫu")

    fb_calls = []
    monkeypatch.setattr(facebook, "like_comment", lambda cid, liked, tok: (fb_calls.append((cid, liked, tok)), True)[1])

    # Like calls Facebook once and records state
    r1 = client.post("/api/comments/c1/like", json={"liked": True})
    assert r1.status_code == 200, r1.text
    assert r1.json() == {"tenantId": vpost_api.TENANT_ID, "commentId": "c1", "liked": True}
    assert fb_calls == [("c1", True, TOKEN_A)]
    assert inbox_store.liked_ids(vpost_api.TENANT_ID, ["c1"]) == {"c1"}

    # Unlike calls Facebook once and clears state
    r2 = client.post("/api/comments/c1/like", json={"liked": False})
    assert r2.status_code == 200, r2.text
    assert r2.json() == {"tenantId": vpost_api.TENANT_ID, "commentId": "c1", "liked": False}
    assert fb_calls == [("c1", True, TOKEN_A), ("c1", False, TOKEN_A)]
    assert inbox_store.liked_ids(vpost_api.TENANT_ID, ["c1"]) == set()

    # Facebook failure does NOT update comment_like and logs no customer text or token
    def fail_rate(*a, **kw):
        raise facebook.FacebookError("RATE_LIMITED", "Facebook giới hạn tốc độ")

    monkeypatch.setattr(facebook, "like_comment", fail_rate)
    with caplog.at_level(logging.WARNING, logger="vpost.inbox"):
        r_rl = client.post("/api/comments/c1/like", json={"liked": True})
    assert r_rl.status_code == 429 and r_rl.json()["code"] == "RATE_LIMITED"
    assert inbox_store.liked_ids(vpost_api.TENANT_ID, ["c1"]) == set()
    log_blob = "\n".join(rec.getMessage() for rec in caplog.records)
    assert secret_msg not in log_blob and "0912345678" not in log_blob and TOKEN_A not in log_blob

    # Facebook returning False -> 502 and does not record like
    monkeypatch.setattr(facebook, "like_comment", lambda *a, **kw: False)
    r_false = client.post("/api/comments/c1/like", json={"liked": True})
    assert r_false.status_code == 502 and r_false.json()["code"] == "UPSTREAM_ERROR"
    assert inbox_store.liked_ids(vpost_api.TENANT_ID, ["c1"]) == set()

    # Unknown / deleted / other-tenant comment -> 404
    fb_calls.clear()
    monkeypatch.setattr(facebook, "like_comment", lambda *a, **kw: (fb_calls.append(a), True)[1])
    for cid in ("unknown", "c_del", "c_other"):
        resp = client.post(f"/api/comments/{cid}/like", json={"liked": True})
        assert resp.status_code == 404 and resp.json()["code"] == "NOT_FOUND", (cid, resp.text)

    # Page's own comment -> 400 INVALID_INPUT
    r_page = client.post("/api/comments/c_page/like", json={"liked": True})
    assert r_page.status_code == 400 and r_page.json()["code"] == "INVALID_INPUT"

    # Unconfigured channel -> 409 CHANNEL_NOT_CONFIGURED
    r_nc = client.post("/api/comments/c_noconf/like", json={"liked": True})
    assert r_nc.status_code == 409 and r_nc.json()["code"] == "CHANNEL_NOT_CONFIGURED"
    assert fb_calls == []

    # Strict payload validation -> 400 INVALID_INPUT
    for bad in ({}, {"liked": "true"}, {"liked": 1}, {"liked": True, "extra": 1}):
        resp = client.post("/api/comments/c1/like", json=bad)
        assert resp.status_code == 400 and resp.json()["code"] == "INVALID_INPUT", (bad, resp.text)


# ---------------- 4. Quick replies CRUD ----------------

def test_quick_replies_crud_sorting_validation_and_conflicts():
    # Empty list
    r0 = client.get("/api/quick-replies")
    assert r0.status_code == 200
    assert r0.json() == {"tenantId": vpost_api.TENANT_ID, "items": []}

    # Create two items out of alphabetical order
    r_ship = client.post(
        "/api/quick-replies",
        json={"shortcut": "ship_hn", "title": "Phí ship Hà Nội", "text": "Chào {ten_khach}, phí ship nội thành 25k ạ!"},
    )
    assert r_ship.status_code == 200, r_ship.text
    ship = r_ship.json()["item"]
    assert r_ship.json()["tenantId"] == vpost_api.TENANT_ID
    assert ship["shortcut"] == "ship_hn"
    assert ship["title"] == "Phí ship Hà Nội"
    assert ship["text"] == "Chào {ten_khach}, phí ship nội thành 25k ạ!"
    assert Z_RE.match(ship["updatedAt"])

    r_gia = client.post(
        "/api/quick-replies",
        json={"shortcut": "gia-sp", "title": "Báo giá", "text": "Dạ {ten_khach} xem giá trên ảnh giúp shop ạ."},
    )
    assert r_gia.status_code == 200
    gia = r_gia.json()["item"]

    # Seed same shortcut in another tenant -> allowed and isolated
    other_qr = inbox_store.create_quick_reply(
        OTHER_TENANT, shortcut="gia-sp", title="Other", text="Other tenant", updated_at=iso_ago()
    )

    # GET sorted by shortcut ascending, isolated to active tenant
    r_list = client.get("/api/quick-replies")
    assert r_list.status_code == 200
    assert [i["shortcut"] for i in r_list.json()["items"]] == ["gia-sp", "ship_hn"]

    # Duplicate shortcut -> 409 CONFLICT
    r_dup = client.post("/api/quick-replies", json={"shortcut": "gia-sp", "title": "Trùng", "text": "Nội dung"})
    assert r_dup.status_code == 409 and r_dup.json()["code"] == "CONFLICT"

    # PATCH partial fields (title only, same shortcut as self, empty subset)
    r_p1 = client.patch(f"/api/quick-replies/{gia['id']}", json={"title": "Báo giá mới"})
    assert r_p1.status_code == 200
    assert r_p1.json()["item"]["title"] == "Báo giá mới"
    assert r_p1.json()["item"]["shortcut"] == "gia-sp"
    assert r_p1.json()["item"]["text"] == gia["text"]

    r_p_same = client.patch(f"/api/quick-replies/{gia['id']}", json={"shortcut": "gia-sp"})
    assert r_p_same.status_code == 200

    r_p_empty = client.patch(f"/api/quick-replies/{gia['id']}", json={})
    assert r_p_empty.status_code == 200 and r_p_empty.json()["item"]["id"] == gia["id"]

    # PATCH shortcut collision -> 409 CONFLICT
    r_p_dup = client.patch(f"/api/quick-replies/{gia['id']}", json={"shortcut": "ship_hn"})
    assert r_p_dup.status_code == 409 and r_p_dup.json()["code"] == "CONFLICT"

    # PATCH / DELETE unknown or other-tenant id -> 404 NOT_FOUND
    for target in ("missing-id", other_qr["id"]):
        assert client.patch(f"/api/quick-replies/{target}", json={"title": "X"}).status_code == 404
        assert client.delete(f"/api/quick-replies/{target}").status_code == 404

    # Validation errors -> 400 INVALID_INPUT
    bad_creates = [
        {"shortcut": "", "title": "T", "text": "X"},
        {"shortcut": "UPPER", "title": "T", "text": "X"},
        {"shortcut": "has space", "title": "T", "text": "X"},
        {"shortcut": "/gia", "title": "T", "text": "X"},
        {"shortcut": "a" * 25, "title": "T", "text": "X"},
        {"shortcut": "ok", "title": "   ", "text": "X"},
        {"shortcut": "ok", "title": "t" * 81, "text": "X"},
        {"shortcut": "ok", "title": "T", "text": "   "},
        {"shortcut": "ok", "title": "T", "text": "x" * 2001},
        {"shortcut": "ok", "title": "T", "text": "X", "extra": 1},
        {"shortcut": 123, "title": "T", "text": "X"},
    ]
    for payload in bad_creates:
        resp = client.post("/api/quick-replies", json=payload)
        assert resp.status_code == 400 and resp.json()["code"] == "INVALID_INPUT", (payload, resp.text)

    bad_patches = [
        {"shortcut": None},
        {"title": None},
        {"text": None},
        {"shortcut": "BAD!"},
        {"title": ""},
        {"text": "x" * 2001},
        {"unknown": "v"},
    ]
    for payload in bad_patches:
        resp = client.patch(f"/api/quick-replies/{gia['id']}", json=payload)
        assert resp.status_code == 400 and resp.json()["code"] == "INVALID_INPUT", (payload, resp.text)

    # DELETE success
    r_del = client.delete(f"/api/quick-replies/{ship['id']}")
    assert r_del.status_code == 200
    assert r_del.json() == {"tenantId": vpost_api.TENANT_ID, "id": ship["id"]}
    assert [i["id"] for i in client.get("/api/quick-replies").json()["items"]] == [gia["id"]]
    # Deleting again -> 404
    assert client.delete(f"/api/quick-replies/{ship['id']}").status_code == 404


# ---------------- 5. Customer tags CRUD & assignment ----------------

def test_customer_tags_crud_validation_conflicts_and_assignment():
    colors = ("gray", "red", "orange", "yellow", "green", "blue", "purple")
    created = {}
    for idx, color in enumerate(colors):
        r = client.post("/api/customer-tags", json={"name": f"Tag {idx} {color}", "color": color})
        assert r.status_code == 200, (color, r.text)
        body = r.json()
        assert body["tenantId"] == vpost_api.TENANT_ID
        assert body["item"]["color"] == color
        created[color] = body["item"]

    # Duplicate exact and case-insensitive -> 409 CONFLICT
    assert client.post("/api/customer-tags", json={"name": "Tag 0 gray", "color": "blue"}).status_code == 409
    assert client.post("/api/customer-tags", json={"name": "tag 0 GRAY", "color": "blue"}).status_code == 409

    # Same name in other tenant allowed and isolated
    other_tag = inbox_store.create_customer_tag(OTHER_TENANT, name="Tag 0 gray", color="red", created_at=iso_ago())
    all_tags = client.get("/api/customer-tags").json()["items"]
    assert len(all_tags) == len(colors)
    assert other_tag["id"] not in {t["id"] for t in all_tags}

    # Validation errors -> 400 INVALID_INPUT
    for bad in (
        {"name": "", "color": "red"},
        {"name": "   ", "color": "red"},
        {"name": "n" * 41, "color": "red"},
        {"name": "Valid", "color": "pink"},
        {"name": "Valid", "color": "RED"},
        {"name": "Valid", "color": "red", "extra": True},
    ):
        resp = client.post("/api/customer-tags", json=bad)
        assert resp.status_code == 400 and resp.json()["code"] == "INVALID_INPUT", (bad, resp.text)

    # PUT customer tags replaces set and deduplicates repeated ids
    r_put1 = client.put(
        "/api/customers/u1/tags",
        json={"tagIds": [created["red"]["id"], created["blue"]["id"], created["red"]["id"]]},
    )
    assert r_put1.status_code == 200, r_put1.text
    assert r_put1.json()["tenantId"] == vpost_api.TENANT_ID
    assert {t["id"] for t in r_put1.json()["tags"]} == {created["red"]["id"], created["blue"]["id"]}

    # Unknown or other-tenant tag id -> 400 INVALID_INPUT and leaves existing set untouched
    for bad_id in ("no-such-tag", other_tag["id"]):
        r_bad = client.put("/api/customers/u1/tags", json={"tagIds": [created["green"]["id"], bad_id]})
        assert r_bad.status_code == 400 and r_bad.json()["code"] == "INVALID_INPUT"
    assert {t["id"] for t in inbox_store.tags_for(vpost_api.TENANT_ID, ["u1"])["u1"]} == {
        created["red"]["id"],
        created["blue"]["id"],
    }

    # >20 tagIds or invalid types -> 400 INVALID_INPUT
    assert client.put("/api/customers/u1/tags", json={"tagIds": ["t"] * 21}).status_code == 400
    assert client.put("/api/customers/u1/tags", json={"tagIds": [""]}).status_code == 400
    assert client.put("/api/customers/u1/tags", json={"tagIds": [123]}).status_code == 400
    assert client.put("/api/customers/u1/tags", json={"tagIds": [], "extra": 1}).status_code == 400

    # Replace with one tag
    r_put2 = client.put("/api/customers/u1/tags", json={"tagIds": [created["purple"]["id"]]})
    assert r_put2.status_code == 200
    assert [t["id"] for t in r_put2.json()["tags"]] == [created["purple"]["id"]]

    # Deleting a tag cascades from customer_tag_link; unknown / other-tenant tag -> 404
    assert client.delete("/api/customer-tags/missing").status_code == 404
    assert client.delete(f"/api/customer-tags/{other_tag['id']}").status_code == 404
    r_del = client.delete(f"/api/customer-tags/{created['purple']['id']}")
    assert r_del.status_code == 200 and r_del.json() == {"tenantId": vpost_api.TENANT_ID, "id": created["purple"]["id"]}
    assert inbox_store.tags_for(vpost_api.TENANT_ID, ["u1"]) == {}

    # PUT empty list clears tags
    client.put("/api/customers/u1/tags", json={"tagIds": [created["green"]["id"]]})
    r_clear = client.put("/api/customers/u1/tags", json={"tagIds": []})
    assert r_clear.status_code == 200 and r_clear.json() == {"tenantId": vpost_api.TENANT_ID, "tags": []}


# ---------------- 6. Customer profile & note ----------------

def test_customer_profile_aggregation_contacts_recent_limit_and_note():
    # Unknown customer -> 404
    r_missing = client.get("/api/customers/u_unknown")
    assert r_missing.status_code == 404 and r_missing.json()["code"] == "NOT_FOUND"

    # Customer with only other-tenant / Page / deleted comments -> 404
    seed_comment("c_other_only", tenant_id=OTHER_TENANT, from_id="u_other", message="0909111222")
    seed_comment("c_page_only", is_from_page=1, from_id=PAGE_A, message="0909333444")
    seed_comment("c_del_only", from_id="u_deleted", status="deleted", message="0909555666")
    for fid in ("u_other", PAGE_A, "u_deleted"):
        assert client.get(f"/api/customers/{fid}").status_code == 404

    seed_post_job("job-1", channel_id=CHANNEL_A, caption="Đầm Voan Hoa G1")
    seed_post_job("job-2", channel_id=CHANNEL_B, fb_post_id="456_2002", caption="Áo Sơ Mi Lụa S2")

    # Seed 25 comments for u1 across 2 posts (including replies and a hidden PII comment)
    # Chronological oldest -> newest: i=0 (oldest, 30h ago) .. i=24 (newest, 6h ago)
    t_first = iso_ago(hours=30)
    t_second = iso_ago(hours=29)
    t_last = iso_ago(hours=6)

    seed_comment(
        "c_00",
        from_id="u1",
        from_name="Lan Anh cũ",
        post_job_id="job-1",
        page_id=PAGE_A,
        message="Giữ size M gọi 0912 345 678 hoặc Lan.Anh@Shop.VN nhé",
        created_time=t_first,
        is_hidden=1,  # hidden comment still aggregated!
    )
    seed_comment(
        "c_01",
        from_id="u1",
        from_name="Lan Anh",
        post_job_id="job-2",
        page_id=PAGE_B,
        parent_id="root_99",
        message="Số khác +84 912.345.678 và 0987-654-321, mail lan.anh@shop.vn hoặc second@example.com",
        created_time=t_second,
    )
    for i in range(2, 24):
        seed_comment(
            f"c_{i:02d}",
            from_id="u1",
            from_name="Lan Anh",
            post_job_id="job-1",
            page_id=PAGE_A,
            parent_id="c_00" if i % 2 == 1 else "",
            message=f"Bình luận thứ {i}",
            created_time=iso_ago(hours=30 - i),
        )
    seed_comment(
        "c_24",
        from_id="u1",
        from_name="Lan Anh VIP",
        post_job_id="job-2",
        page_id=PAGE_B,
        parent_id="root_latest",
        message="Chốt đơn nhanh nhé shop!",
        created_time=t_last,
    )

    # Noise that MUST NOT leak into u1's profile:
    seed_comment("c_other_tenant_u1", tenant_id=OTHER_TENANT, from_id="u1", message="0933 000 111 leak@other.vn")
    seed_comment("c_other_user", from_id="u2", from_name="Minh", message="0944 000 222 u2@shop.vn")
    seed_comment("c_page_reply", parent_id="c_00", is_from_page=1, from_id="u1", message="0955 000 333 page@shop.vn")
    seed_comment("c_deleted_u1", from_id="u1", status="deleted", message="0966 000 444 del@shop.vn")

    # Add tag & note for u1
    tag = client.post("/api/customer-tags", json={"name": "VIP", "color": "yellow"}).json()["item"]
    client.put("/api/customers/u1/tags", json={"tagIds": [tag["id"]]})
    r_note = client.put("/api/customers/u1/note", json={"text": "  Khách hay đặt size M, giao giờ hành chính  "})
    assert r_note.status_code == 200, r_note.text
    note_body = r_note.json()
    assert note_body["tenantId"] == vpost_api.TENANT_ID
    assert note_body["note"]["text"] == "Khách hay đặt size M, giao giờ hành chính"
    assert Z_RE.match(note_body["note"]["updatedAt"])

    # Fetch profile
    r = client.get("/api/customers/u1")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["tenantId"] == vpost_api.TENANT_ID
    cust = body["customer"]
    assert cust["id"] == "u1"
    assert cust["name"] == "Lan Anh VIP"
    assert cust["phones"] == ["0912 345 678", "0987-654-321"]
    assert cust["emails"] == ["Lan.Anh@Shop.VN", "second@example.com"]
    assert cust["firstSeenAt"] == t_first
    assert cust["lastSeenAt"] == t_last
    assert cust["commentCount"] == 25
    assert cust["tags"] == [tag]
    assert cust["note"] == note_body["note"]

    recent = cust["recentComments"]
    assert len(recent) == 20
    # Newest first: c_24 down to c_05
    assert [c["id"] for c in recent[:3]] == ["c_24", "c_23", "c_22"]
    assert recent[-1]["id"] == "c_05"
    # Reply threadId = parent_id; root threadId = own id
    assert recent[0] == {
        "id": "c_24",
        "threadId": "root_latest",
        "text": "Chốt đơn nhanh nhé shop!",
        "createdAt": t_last,
        "postCaption": "Áo Sơ Mi Lụa S2",
        "channelName": "Phố Nhỏ Studio",
    }
    assert recent[2]["threadId"] == "c_22"
    assert recent[2]["postCaption"] == "Đầm Voan Hoa G1"
    assert recent[2]["channelName"] == "Dịu Mây Boutique"

    # Empty / whitespace note clears
    r_clear = client.put("/api/customers/u1/note", json={"text": "   "})
    assert r_clear.status_code == 200
    assert r_clear.json() == {"tenantId": vpost_api.TENANT_ID, "note": None}
    assert client.get("/api/customers/u1").json()["customer"]["note"] is None

    # Note validation
    assert client.put("/api/customers/u1/note", json={"text": "a" * 2001}).status_code == 400
    assert client.put("/api/customers/u1/note", json={"text": 123}).status_code == 400
    assert client.put("/api/customers/u1/note", json={"text": "ok", "extra": 1}).status_code == 400

    # Customer with blank from_name -> name is null
    seed_comment("c_anon", from_id="u_anon", from_name="", message="Inbox giúp mình")
    assert client.get("/api/customers/u_anon").json()["customer"]["name"] is None


# ---------------- 7. Tenant guard (403) & router coexistence ----------------

def test_other_tenant_cookie_returns_403_on_all_inbox_routes():
    seed_comment("c1", from_id="u1", message="Hỏi giá")
    qr = client.post("/api/quick-replies", json={"shortcut": "hi", "title": "Chào", "text": "Chào bạn"}).json()["item"]
    tag = client.post("/api/customer-tags", json={"name": "VIP", "color": "blue"}).json()["item"]

    other = TestClient(app)
    other.cookies.set(vpost_api.TENANT_COOKIE, OTHER_TENANT)

    requests_to_check = [
        ("POST", "/api/comments/c1/like", {"liked": True}),
        ("GET", "/api/quick-replies", None),
        ("POST", "/api/quick-replies", {"shortcut": "new", "title": "New", "text": "Text"}),
        ("PATCH", f"/api/quick-replies/{qr['id']}", {"title": "Hacked"}),
        ("DELETE", f"/api/quick-replies/{qr['id']}", None),
        ("GET", "/api/customer-tags", None),
        ("POST", "/api/customer-tags", {"name": "Hacked", "color": "red"}),
        ("DELETE", f"/api/customer-tags/{tag['id']}", None),
        ("GET", "/api/customers/u1", None),
        ("PUT", "/api/customers/u1/note", {"text": "Hacked"}),
        ("PUT", "/api/customers/u1/tags", {"tagIds": [tag["id"]]}),
    ]
    for method, path, payload in requests_to_check:
        resp = other.request(method, path, json=payload)
        assert resp.status_code == 403 and resp.json()["code"] == "FORBIDDEN", (method, path, resp.text)

    # Confirm nothing was mutated by forbidden requests
    assert len(client.get("/api/quick-replies").json()["items"]) == 1
    assert len(client.get("/api/customer-tags").json()["items"]) == 1
    assert client.get("/api/customers/u1").json()["customer"]["note"] is None


def test_inbox_router_coexists_with_vpost_and_moderation_routers(monkeypatch):
    seed_comment("c1", from_id="u1", message="Mẫu này còn không?")
    monkeypatch.setattr(facebook, "like_comment", lambda cid, liked, tok: True)

    assert client.post("/api/comments/c1/like", json={"liked": True}).status_code == 200
    assert client.get("/api/quick-replies").status_code == 200
    assert client.get("/api/customer-tags").status_code == 200
    assert client.get("/api/customers/u1").status_code == 200
    # Existing routes still work without shadowing
    assert client.get("/api/comments").status_code == 200
    assert client.get("/api/comments/moderation-settings").status_code == 200
