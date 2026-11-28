"""Regression tests verifying writing style wiring across vpost_api endpoints and comment_poller."""
from __future__ import annotations

import json
import os
import sys
import tempfile
import uuid
from datetime import datetime, timedelta, timezone

import httpx
import pytest
from fastapi.testclient import TestClient

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "codebase"))

import store  # noqa: E402

_pg_skip = os.environ.get("_VPOST_PG_UNAVAILABLE")
if _pg_skip is None:
    _ok, _pg_err = store.check_connection()
    _pg_skip = "" if _ok else _pg_err
if _pg_skip:
    pytest.skip("PostgreSQL unreachable (%s)" % _pg_skip, allow_module_level=True)

import comment_poller  # noqa: E402
import facebook  # noqa: E402
import inbox_store  # noqa: E402
import moderation_store  # noqa: E402
import tools  # noqa: E402
import vpost_api  # noqa: E402
import writing_style  # noqa: E402

if "server" not in sys.modules:
    tools.UPLOADS = tempfile.mkdtemp()
import server  # noqa: E402

IMG = "https://lh3.googleusercontent.com/d/ws_test_img"
PAGE_ID_A = "123"
CHANNEL_A = "fb-123"
PAGE_ID_B = "456"
CHANNEL_B = "fb-456"

ROW_G1 = {
    "ma_sp": "G1",
    "ten_sp": "Đầm Voan Hoa G1",
    "loai": "Váy",
    "gia_ban": "890.000đ",
    "gia_te": "50",
    "size": "S-L",
    "mau": "Đen",
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
POST_REPLY = {
    "decision": "write",
    "flag_reasons": [],
    "hook": "Đầm voan hoa nhẹ nhàng cho buổi dạo phố.",
    "body": "Đầm Voan Hoa G1 dáng xoè 2 lớp, chất voan, màu đen, đủ size S, M, L. Giá bán 890.000đ.",
    "cta": "Nhắn tin cho tiệm để tư vấn size chuẩn nhé.",
    "hashtags": ["damvoan", "vayxoe"],
    "facts_used": ["F1", "F3", "F4", "F5"],
}
COMMENT_REPLY = {
    "decision": "reply",
    "flag_reasons": [],
    "reply": "Dạ Đầm Voan Hoa G1 giá 890.000đ, hiện còn màu đen size S, M, L ạ!",
    "facts_used": ["F1", "F3", "F4"],
}

client = TestClient(server.app)

_ORIG_INVENTORY = tools.inventory
_ORIG_VPOST_MODEL = vpost_api.MODEL
_ORIG_FB_LIST = facebook.list_comments
_ORIG_FB_REPLY = facebook.reply_comment


class CapturingModel:
    def __init__(self, reply):
        self.reply = reply
        self.calls = []

    def __call__(self, system, user, schema=None):
        self.calls.append({"system": system, "user": user, "schema": schema})
        return {
            "text": json.dumps(self.reply, ensure_ascii=False),
            "model": "fake-ws-wiring",
            "tokens_in": 120,
            "tokens_out": 45,
        }


def iso_ago(hours=0, minutes=0):
    dt = datetime.now(timezone.utc) - timedelta(hours=hours, minutes=minutes)
    return dt.strftime("%Y-%m-%dT%H:%M:%S.000Z")


def seed_pages_and_post(job_id="job-a", fb_post_id="123_1001", channel_id=CHANNEL_A, product_code="G1"):
    store.save_fb_pages(
        [
            {"id": PAGE_ID_A, "name": "Dịu Mây Boutique", "access_token": "EAAG_TOKEN_A"},
            {"id": PAGE_ID_B, "name": "Phố Nhỏ Studio", "access_token": "EAAG_TOKEN_B"},
        ],
        "UTOKEN",
        iso_ago(),
    )
    ts = iso_ago(hours=2)
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
            "published_at": iso_ago(hours=1),
            "error_code": None,
            "user_message": "",
            "attempt_count": 1,
            "created_at": ts,
            "updated_at": ts,
        }],
    )


def seed_comment(cid, *, channel_id=CHANNEL_A, page_id=PAGE_ID_A, post_job_id="job-a", fb_post_id="123_1001", product_code="G1"):
    ts = iso_ago(minutes=10)
    store.upsert_fb_comment(
        vpost_api.TENANT_ID,
        {
            "id": cid,
            "channel_id": channel_id,
            "page_id": page_id,
            "post_job_id": post_job_id,
            "fb_post_id": fb_post_id,
            "product_code": product_code,
            "parent_id": "",
            "from_id": "u1",
            "from_name": "Lan Anh",
            "is_from_page": 0,
            "message": "Mẫu này giá bao nhiêu và còn size M không?",
            "permalink_url": f"https://www.facebook.com/{fb_post_id}?comment_id={cid}",
            "is_hidden": 0,
            "can_comment": 1,
            "created_time": ts,
            "status": "unreplied",
            "synced_at": ts,
            "updated_at": ts,
        },
    )


def setup_function(_):
    comment_poller.stop()
    store.init()
    writing_style.init_writing_style()
    moderation_store.init_moderation()
    inbox_store.init_inbox()
    tools.inventory = lambda: {k: [dict(v) for v in vs] for k, vs in INV_DEFAULT.items()}
    vpost_api.load_catalog([dict(ROW_G1)])
    seed_pages_and_post()
    vpost_api.MODEL = _ORIG_VPOST_MODEL
    facebook.list_comments = _ORIG_FB_LIST
    facebook.reply_comment = _ORIG_FB_REPLY
    client.cookies.clear()


def teardown_function(_):
    comment_poller.stop()
    tools.inventory = _ORIG_INVENTORY
    vpost_api.MODEL = _ORIG_VPOST_MODEL
    facebook.list_comments = _ORIG_FB_LIST
    facebook.reply_comment = _ORIG_FB_REPLY
    client.cookies.clear()


@pytest.fixture(autouse=True)
def _no_network(monkeypatch):
    def _boom(*args, **kwargs):
        raise AssertionError("Tests must never call the network!")

    monkeypatch.setattr(httpx, "get", _boom)
    monkeypatch.setattr(httpx, "post", _boom)
    monkeypatch.setattr(httpx, "delete", _boom)


def test_captions_applies_company_default_and_per_page_writing_style():
    # 1. Backward compatible when no writing style is configured
    m0 = CapturingModel(POST_REPLY)
    vpost_api.MODEL = m0
    req_legacy = {
        "product": {"name": "Đầm Voan Hoa G1", "description": "", "category": "Váy", "season": ""},
        "channels": ["facebook"],
    }
    r0 = client.post("/api/posts/captions", json=req_legacy)
    assert r0.status_code == 200, r0.text
    assert r0.json()["failed"] == []
    assert "<PHONG_CACH>" not in m0.calls[0]["system"]

    # 2. Configure company default style -> legacy CaptionsIn (no channelId) uses company default
    assert client.put(
        "/api/writing-style",
        json={
            "style": {
                "voice": "Thanh lịch chuẩn công sở tối giản",
                "xungHo": "chị đẹp",
                "selfReference": "tiệm em",
                "hashtags": {"fixed": ["#CongTyDefault"], "maxExtra": 1},
                "footer": "🌸 Chân bài công ty",
            }
        },
    ).status_code == 200

    m1 = CapturingModel(POST_REPLY)
    vpost_api.MODEL = m1
    r1 = client.post("/api/posts/captions", json=req_legacy)
    assert r1.status_code == 200, r1.text
    sys1 = m1.calls[0]["system"]
    assert "<PHONG_CACH>" in sys1
    assert "Thanh lịch chuẩn công sở tối giản" in sys1
    assert 'Xưng hô với khách: "chị đẹp"' in sys1
    assert 'Shop tự xưng: "tiệm em"' in sys1
    post1 = r1.json()["generated"][0]["text"]
    assert "#CongTyDefault" in post1
    assert "🌸 Chân bài công ty" in post1

    # 3. Configure per-Page override for CHANNEL_A -> CaptionsIn with channelId merges default + override
    assert client.put(
        f"/api/writing-style/{CHANNEL_A}",
        json={
            "style": {
                "xungHo": "nàng thơ",
                "hashtags": {"fixed": ["#PageARieng"], "maxExtra": 1},
                "footer": "🌷 Chân bài riêng Page A",
            }
        },
    ).status_code == 200

    m2 = CapturingModel(POST_REPLY)
    vpost_api.MODEL = m2
    r2 = client.post("/api/posts/captions", json=dict(req_legacy, channelId=CHANNEL_A))
    assert r2.status_code == 200, r2.text
    sys2 = m2.calls[0]["system"]
    assert "Thanh lịch chuẩn công sở tối giản" in sys2  # inherited from company default
    assert 'Xưng hô với khách: "nàng thơ"' in sys2      # overridden by CHANNEL_A
    post2 = r2.json()["generated"][0]["text"]
    assert "#PageARieng" in post2
    assert "🌷 Chân bài riêng Page A" in post2

    # 4. Also resolves per-Page override when a single known channelId is passed in `channels`
    m3 = CapturingModel(POST_REPLY)
    vpost_api.MODEL = m3
    r3 = client.post("/api/posts/captions", json=dict(req_legacy, channels=[CHANNEL_A]))
    assert r3.status_code == 200, r3.text
    assert 'Xưng hô với khách: "nàng thơ"' in m3.calls[0]["system"]


def test_comment_draft_thread_draft_and_poller_use_configured_writing_style():
    # Company default + per-Page override for CHANNEL_A
    assert client.put(
        "/api/writing-style",
        json={
            "style": {
                "voice": "Tư vấn nhẹ nhàng, đi thẳng vào câu hỏi",
                "xungHo": "chị",
                "selfReference": "em",
                "extraBanned": ["xả kho"],
            }
        },
    ).status_code == 200
    assert client.put(
        f"/api/writing-style/{CHANNEL_A}",
        json={
            "style": {
                "voice": "Giọng riêng ngọt ngào của Dịu Mây Boutique",
                "xungHo": "nàng",
            }
        },
    ).status_code == 200

    seed_comment("c_ws_1", channel_id=CHANNEL_A, page_id=PAGE_ID_A)
    seed_comment("c_ws_b", channel_id=CHANNEL_B, page_id=PAGE_ID_B, post_job_id="job-a", fb_post_id="456_2001")

    # 1. Legacy POST /api/comments/{id}/draft receives Page A override + inherited selfReference & extraBanned
    m_legacy = CapturingModel(COMMENT_REPLY)
    vpost_api.MODEL = m_legacy
    r_leg = client.post("/api/comments/c_ws_1/draft")
    assert r_leg.status_code == 200, r_leg.text
    sys_leg = m_legacy.calls[0]["system"]
    assert "<PHONG_CACH>" in sys_leg
    assert "Giọng riêng ngọt ngào của Dịu Mây Boutique" in sys_leg
    assert 'Xưng hô với khách: "nàng"' in sys_leg
    assert 'Shop tự xưng: "em"' in sys_leg
    assert "xả kho" in sys_leg

    # 2. Thread POST /api/comments/threads/{id}/draft receives Page B company default (no Page B override)
    m_thread_b = CapturingModel(COMMENT_REPLY)
    vpost_api.MODEL = m_thread_b
    r_tb = client.post("/api/comments/threads/c_ws_b/draft")
    assert r_tb.status_code == 200, r_tb.text
    sys_tb = m_thread_b.calls[0]["system"]
    assert "Tư vấn nhẹ nhàng, đi thẳng vào câu hỏi" in sys_tb
    assert 'Xưng hô với khách: "chị"' in sys_tb
    assert 'Shop tự xưng: "em"' in sys_tb

    # 3. Thread POST /api/comments/threads/{id}/draft on Page A receives Page A override
    m_thread_a = CapturingModel(COMMENT_REPLY)
    vpost_api.MODEL = m_thread_a
    r_ta = client.post("/api/comments/threads/c_ws_1/draft")
    assert r_ta.status_code == 200, r_ta.text
    sys_ta = m_thread_a.calls[0]["system"]
    assert "Giọng riêng ngọt ngào của Dịu Mây Boutique" in sys_ta
    assert 'Xưng hô với khách: "nàng"' in sys_ta

    # 4. Background comment_poller.run_tick() auto-draft also uses configured writing style
    m_poller = CapturingModel(COMMENT_REPLY)
    vpost_api.MODEL = m_poller
    facebook.list_comments = lambda fb_post_id, token, since=None: [
        {
            "id": "c_poll_ws",
            "message": "Mẫu G1 còn màu đen size L không?",
            "created_time": iso_ago(minutes=2),
            "from": {"id": "u5", "name": "Hà My"},
        }
    ]
    res_tick = comment_poller.run_tick()
    assert res_tick["draftsCreated"] == 1
    assert len(m_poller.calls) == 1
    sys_poll = m_poller.calls[0]["system"]
    assert "Giọng riêng ngọt ngào của Dịu Mây Boutique" in sys_poll
    assert 'Xưng hô với khách: "nàng"' in sys_poll


def test_reply_checks_and_batch_warnings_enforce_extra_banned_and_max_emoji():
    assert client.put(
        "/api/writing-style",
        json={"style": {"extraBanned": ["xả kho"], "maxEmoji": 1}},
    ).status_code == 200
    assert client.put(
        f"/api/writing-style/{CHANNEL_A}",
        json={"style": {"extraBanned": ["săn deal"]}},
    ).status_code == 200

    # Comment WITH catalog row + comment WITHOUT catalog row
    seed_comment("c_with_row", channel_id=CHANNEL_A, page_id=PAGE_ID_A, product_code="G1")
    seed_comment("c_no_row", channel_id=CHANNEL_A, page_id=PAGE_ID_A, product_code="")

    # 1. PATCH and POST /reply block on both company extraBanned and per-Page extraBanned, with or without catalog row
    for cid in ("c_with_row", "c_no_row"):
        r_patch = client.patch(
            f"/api/comments/{cid}/draft",
            json={"text": "Dạ shop đang xả kho và săn deal mẫu này 🌸🌷"},
        )
        assert r_patch.status_code == 200, r_patch.text
        chk = r_patch.json()["check"]
        assert any("xả kho" in b for b in chk["block"]), chk
        assert any("săn deal" in b for b in chk["block"]), chk
        assert any("emoji" in w for w in chk["warn"]), chk

        r_reply = client.post(
            f"/api/comments/threads/{cid}/reply",
            json={"text": "Dạ mẫu này đang săn deal đó ạ", "clientId": str(uuid.uuid4())},
        )
        assert r_reply.status_code == 422 and r_reply.json()["code"] == "BLOCKED"
        assert any("săn deal" in x for x in r_reply.json()["reasons"])

        r_leg_reply = client.post(
            f"/api/comments/{cid}/reply",
            json={"text": "Dạ mẫu này đang xả kho ạ"},
        )
        assert r_leg_reply.status_code == 422 and r_leg_reply.json()["code"] == "BLOCKED"
        assert any("xả kho" in x for x in r_leg_reply.json()["reasons"])

    # Global banned words remain immutable
    r_glob = client.post(
        "/api/comments/threads/c_with_row/reply",
        json={"text": "Dạ mẫu này cam kết đẹp và freeship ạ", "clientId": str(uuid.uuid4())},
    )
    assert r_glob.status_code == 422 and r_glob.json()["code"] == "BLOCKED"

    # 2. POST /api/posts/batches checks per-channel extraBanned in publish warnings
    soon = (datetime.now(timezone.utc) + timedelta(hours=2)).strftime("%Y-%m-%dT%H:%M:%S.000Z")
    r_batch = client.post(
        "/api/posts/batches",
        json={
            "productCode": "G1",
            "color": "Đen",
            "format": "image_post",
            "scheduledAt": soon,
            "channelIds": ["diu-may"],
            "captionByChannel": {
                "diu-may": "Đầm Voan Hoa G1 màu đen size S, M, L giá 890.000đ đang xả kho ngay hôm nay!",
            },
            "media": [{"driveFileId": IMG}],
        },
    )
    assert r_batch.status_code == 200, r_batch.text
    assert any("xả kho" in w for w in r_batch.json()["warnings"]), r_batch.json()["warnings"]
