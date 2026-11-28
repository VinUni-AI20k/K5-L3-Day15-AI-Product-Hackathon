"""API tests for writing_style_api.py and server.py integration (no network calls)."""
from __future__ import annotations

import json
import os
import re
import sys
import tempfile
from datetime import datetime, timezone

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

import facebook  # noqa: E402
import tools  # noqa: E402
import vpost_api  # noqa: E402
import writing_style  # noqa: E402
import writing_style_api  # noqa: E402

if "server" not in sys.modules:
    tools.UPLOADS = tempfile.mkdtemp()
import server  # noqa: E402

PAGE_A = "123"
CHANNEL_A = "fb-123"
PAGE_B = "456"
CHANNEL_B = "fb-456"
OTHER_TENANT = "11111111-1111-4111-8111-111111111111"
Z_RE = re.compile(r"^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$")

INV = {"T1": [{"mau": "Đen", "size": s, "ton": 3, "trang_thai": "Còn hàng"} for s in "SML"]}
CATALOG_ROW = {
    "ma_sp": "T1",
    "ten_sp": "Đầm Voan Hoa",
    "loai": "Váy xoè",
    "gia_ban": "890.000đ",
    "gia_te": "50",
    "size": "S-L",
    "mau": "Đen",
    "chat_lieu": "Voan",
    "mo_ta": "Váy xoè 2 lớp, kéo khoá sau.",
    "anh": "https://example.com/t1.jpg",
    "page": "diu-may",
    "prompt": "Viết nhẹ nhàng",
}
GOOD_REPLY = {
    "decision": "write",
    "flag_reasons": [],
    "hook": "Chiếc đầm voan dịu dàng cho ngày cuối tuần.",
    "body": "Đầm Voan Hoa dáng xoè 2 lớp, màu đen, size S, M, L. Giá 890.000đ.",
    "cta": "Nhắn tin hoặc bình luận size để em tư vấn nhé.",
    "hashtags": ["damvoan", "thoitrang"],
    "facts_used": ["F1", "F3"],
}

client = TestClient(server.app)

_ORIG_INVENTORY = tools.inventory
_ORIG_SCHEDULE_POST = tools.schedule_post
_ORIG_WS_MODEL = writing_style_api.MODEL
_ORIG_VPOST_MODEL = vpost_api.MODEL
_ORIG_SERVER_MODEL = server.MODEL
_ORIG_SERVER_SYNC = server.SYNC
_ORIG_MONOTONIC = writing_style_api._monotonic


class FakeModel:
    def __init__(self, reply=None, *, tokens_in=150, tokens_out=60):
        self.reply = reply or GOOD_REPLY
        self.tokens_in = tokens_in
        self.tokens_out = tokens_out
        self.calls = []

    def __call__(self, system, user, schema=None):
        self.calls.append({"system": system, "user": user, "schema": schema})
        return {
            "text": json.dumps(self.reply, ensure_ascii=False),
            "model": "fake-preview",
            "tokens_in": self.tokens_in,
            "tokens_out": self.tokens_out,
        }


def _now_z() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")


def seed_data():
    store.save_fb_pages(
        [
            {"id": PAGE_A, "name": "Dịu Mây Boutique", "access_token": "EAAG_TOKEN_A"},
            {"id": PAGE_B, "name": "Phố Nhỏ Studio", "access_token": "EAAG_TOKEN_B"},
        ],
        "UTOKEN",
        _now_z(),
    )
    store.replace_catalog([CATALOG_ROW])


def setup_function(_):
    store.init()
    writing_style.init_writing_style()
    for k in ("FB_APP_ID", "FB_APP_SECRET", "FB_PAGE_ID", "FB_PAGE_TOKEN"):
        os.environ.pop(k, None)
    tools.inventory = lambda: INV
    tools.schedule_post = _ORIG_SCHEDULE_POST
    writing_style_api.MODEL = FakeModel()
    writing_style_api._monotonic = _ORIG_MONOTONIC
    writing_style_api.reset_rate_limit()
    server.SYNC = True
    seed_data()
    client.cookies.clear()


def teardown_function(_):
    tools.inventory = _ORIG_INVENTORY
    tools.schedule_post = _ORIG_SCHEDULE_POST
    writing_style_api.MODEL = _ORIG_WS_MODEL
    vpost_api.MODEL = _ORIG_VPOST_MODEL
    server.MODEL = _ORIG_SERVER_MODEL
    server.SYNC = _ORIG_SERVER_SYNC
    writing_style_api._monotonic = _ORIG_MONOTONIC
    writing_style_api.reset_rate_limit()
    client.cookies.clear()


@pytest.fixture(autouse=True)
def _no_network(monkeypatch):
    def _boom(*args, **kwargs):
        raise AssertionError("Tests must never call the network!")

    monkeypatch.setattr(httpx, "get", _boom)
    monkeypatch.setattr(httpx, "post", _boom)
    monkeypatch.setattr(httpx, "delete", _boom)


# ---------------- 1. Company default GET & PUT ----------------

def test_get_and_put_company_default():
    r0 = client.get("/api/writing-style")
    assert r0.status_code == 200, r0.text
    b0 = r0.json()
    assert b0["tenantId"] == vpost_api.TENANT_ID
    assert b0["default"] == {}
    assert b0["overrides"] == []
    assert b0["updatedAt"] is None
    eff0 = b0["effectiveDefault"]
    assert eff0["industry"] == "thời trang nữ"
    assert eff0["voice"] == tools.PAGES[tools.DEFAULT_PAGE]["gu"]
    assert eff0["xungHo"] == tools.PAGES[tools.DEFAULT_PAGE]["xung_ho"]
    assert eff0["maxEmoji"] == tools.PAGES[tools.DEFAULT_PAGE]["max_emoji"]
    assert eff0["length"] == "medium"
    assert eff0["hashtags"] == {"fixed": [], "maxExtra": 3}
    assert eff0["footer"] == tools.GLOB["footer"]
    assert eff0["mentionShopName"] is False

    payload = {
        "style": {
            "shopName": "Mây Boutique",
            "mentionShopName": False,
            "industry": "thời trang công sở",
            "audience": "Nữ văn phòng 25–38 tuổi",
            "voice": "Thanh lịch, súc tích, không phô trương.",
            "xungHo": "chị",
            "selfReference": "em",
            "maxEmoji": 2,
            "length": "short",
            "ctaStyle": "Nhắn tin để em tư vấn size chuẩn",
            "hashtags": {"fixed": ["#MayBoutique"], "maxExtra": 2},
            "footer": "🌸 Kiểm hàng trước khi thanh toán",
            "extraBanned": ["xả kho", "siêu hời"],
            "dos": ["Nêu phom dáng rõ ràng"],
            "donts": ["Không dùng từ ngữ giật gân"],
            "examples": ["Thiết kế tối giản cho ngày đầu tuần tự tin."],
        }
    }
    r1 = client.put("/api/writing-style", json=payload)
    assert r1.status_code == 200, r1.text
    b1 = r1.json()
    assert b1["tenantId"] == vpost_api.TENANT_ID
    assert b1["default"]["shopName"] == "Mây Boutique"
    assert b1["default"]["hashtags"] == {"fixed": ["#MayBoutique"], "maxExtra": 2}
    assert b1["effectiveDefault"]["industry"] == "thời trang công sở"
    assert b1["effectiveDefault"]["xungHo"] == "chị"
    assert Z_RE.match(b1["updatedAt"])

    # Subsequent GET matches PUT
    r2 = client.get("/api/writing-style")
    assert r2.status_code == 200
    assert r2.json() == b1


# ---------------- 2. Per-channel GET / PUT / DELETE & unknown channel 404 ----------------

def test_channel_override_crud_and_unknown_channel_404():
    # Company default first
    assert client.put(
        "/api/writing-style",
        json={
            "style": {
                "voice": "Giọng công ty",
                "xungHo": "chị",
                "extraBanned": ["cấm chung"],
                "dos": ["Nên 1"],
            }
        },
    ).status_code == 200

    # GET before override -> empty override, effective inherits default
    r_get0 = client.get(f"/api/writing-style/{CHANNEL_A}")
    assert r_get0.status_code == 200, r_get0.text
    g0 = r_get0.json()
    assert g0["tenantId"] == vpost_api.TENANT_ID
    assert g0["channelId"] == CHANNEL_A
    assert g0["style"] == {}
    assert g0["effective"]["voice"] == "Giọng công ty"
    assert g0["effective"]["xungHo"] == "chị"

    # PUT override for CHANNEL_A
    r_put = client.put(
        f"/api/writing-style/{CHANNEL_A}",
        json={
            "style": {
                "xungHo": "nàng",
                "maxEmoji": 4,
                "extraBanned": ["cấm riêng"],
                "dos": ["Nên riêng page A"],
            }
        },
    )
    assert r_put.status_code == 200, r_put.text
    p = r_put.json()
    assert p["channelId"] == CHANNEL_A
    assert p["style"] == {
        "xungHo": "nàng",
        "maxEmoji": 4,
        "extraBanned": ["cấm riêng"],
        "dos": ["Nên riêng page A"],
    }
    assert p["effective"]["voice"] == "Giọng công ty"
    assert p["effective"]["xungHo"] == "nàng"
    assert p["effective"]["maxEmoji"] == 4
    assert p["effective"]["dos"] == ["Nên riêng page A"]
    assert p["effective"]["extraBanned"] == ["cấm chung", "cấm riêng"]

    # Company GET lists override with channelName from vpost_api.channels_list()
    r_list = client.get("/api/writing-style")
    assert r_list.status_code == 200
    overrides = r_list.json()["overrides"]
    assert len(overrides) == 1
    assert overrides[0]["channelId"] == CHANNEL_A
    assert overrides[0]["channelName"] == "Dịu Mây Boutique"
    assert overrides[0]["style"]["xungHo"] == "nàng"
    assert Z_RE.match(overrides[0]["updatedAt"])

    # DELETE removes override and reverts effective to company default
    r_del = client.delete(f"/api/writing-style/{CHANNEL_A}")
    assert r_del.status_code == 200, r_del.text
    d = r_del.json()
    assert d["style"] == {}
    assert d["effective"]["xungHo"] == "chị"
    assert client.get("/api/writing-style").json()["overrides"] == []

    # Built-in pages.json channel works too
    r_builtin = client.get("/api/writing-style/nang-tho")
    assert r_builtin.status_code == 200
    assert r_builtin.json()["channelId"] == "nang-tho"

    # Unknown channels and reserved "default" scope return 404
    for bad_ch in ("no-such-channel", "fb-999999", "default"):
        assert client.get(f"/api/writing-style/{bad_ch}").status_code == 404
        assert client.put(f"/api/writing-style/{bad_ch}", json={"style": {}}).status_code == 404
        assert client.delete(f"/api/writing-style/{bad_ch}").status_code == 404


# ---------------- 3. Validation errors -> 400 INVALID_INPUT with fields ----------------

def test_validation_returns_400_invalid_input_with_fields():
    bad_bodies = [
        ({}, "style"),
        ({"style": {}, "extra": 1}, "extra"),
        ({"style": {"voice": "v" * 401}}, "voice"),
        ({"style": {"maxEmoji": 99}}, "maxEmoji"),
        ({"style": {"hashtags": {"fixed": ["#bad tag!"]}}}, "hashtags.fixed"),
        ({"style": {"hashtags": {"maxExtra": 6}}}, "hashtags.maxExtra"),
        ({"style": {"extraBanned": ["x"] * 31}}, "extraBanned"),
        ({"style": {"examples": ["e" * 1201]}}, "examples"),
        ({"style": {"length": "huge"}}, "length"),
        ({"style": {"unknownField": "abc"}}, "unknownField"),
    ]
    for body, field in bad_bodies:
        r = client.put("/api/writing-style", json=body)
        assert r.status_code == 400, (body, r.text)
        data = r.json()
        assert data["code"] == "INVALID_INPUT"
        assert isinstance(data.get("fields"), list) and data["fields"]
        assert any(f["field"] == field and f.get("message") for f in data["fields"]), (field, data["fields"])

    # Channel PUT also returns 400 INVALID_INPUT with fields
    r_ch = client.put(f"/api/writing-style/{CHANNEL_A}", json={"style": {"xungHo": "a" * 21}})
    assert r_ch.status_code == 400
    assert r_ch.json()["code"] == "INVALID_INPUT"
    assert r_ch.json()["fields"][0]["field"] == "xungHo"


# ---------------- 4. Preview: unsaved style, never saves, never publishes ----------------

def test_preview_uses_unsaved_style_never_saves_never_publishes(monkeypatch):
    publish_calls = []
    monkeypatch.setattr(tools, "schedule_post", lambda *a, **kw: publish_calls.append(("schedule_post", a)) or {})
    monkeypatch.setattr(facebook, "reply_comment", lambda *a, **kw: publish_calls.append(("reply", a)))

    # Save a company default first
    assert client.put(
        "/api/writing-style",
        json={"style": {"voice": "Giọng đã lưu", "xungHo": "chị"}},
    ).status_code == 200

    fake = FakeModel(GOOD_REPLY, tokens_in=321, tokens_out=89)
    writing_style_api.MODEL = fake

    # Preview on CHANNEL_A with unsaved override (inherits saved company voice, overrides xungHo & footer & fixed hashtag)
    r = client.post(
        "/api/writing-style/preview",
        json={
            "channelId": CHANNEL_A,
            "productCode": "T1",
            "style": {
                "xungHo": "nàng yêu",
                "selfReference": "tiệm",
                "hashtags": {"fixed": ["#PreviewOnly"], "maxExtra": 1},
                "footer": "🌸 Chân bài xem thử",
            },
        },
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["tenantId"] == vpost_api.TENANT_ID
    assert body["decision"] == "write"
    assert "#PreviewOnly" in body["post"]
    assert "🌸 Chân bài xem thử" in body["post"]
    assert body["reasons"] == []
    assert isinstance(body["warnings"], list)
    assert body["systemPromptChars"] == len(fake.calls[0]["system"])
    assert body["systemPromptChars"] > 0
    assert body["tokensIn"] == 321
    assert body["tokensOut"] == 89

    # System prompt sent to model carried both saved company voice and unsaved channel override
    sent_system = fake.calls[0]["system"]
    assert "<PHONG_CACH>" in sent_system
    assert "Giọng đã lưu" in sent_system
    assert 'Xưng hô với khách: "nàng yêu"' in sent_system
    assert 'Shop tự xưng: "tiệm"' in sent_system

    # Preview NEVER saved the unsaved style to DB
    assert client.get(f"/api/writing-style/{CHANNEL_A}").json()["style"] == {}
    assert client.get("/api/writing-style").json()["default"] == {"voice": "Giọng đã lưu", "xungHo": "chị"}

    # Preview NEVER published or created post_jobs
    assert publish_calls == []
    assert store.post_jobs() == []


def test_preview_flag_and_error_cases():
    # Flag decision from model returns reasons as [{field, issue}]
    flag_model = FakeModel(
        {
            "decision": "flag",
            "flag_reasons": [{"field": "prompt", "issue": "đòi freeship không có trong dữ liệu"}],
            "hook": "",
            "body": "",
            "cta": "",
            "hashtags": [],
            "facts_used": [],
        },
        tokens_in=100,
        tokens_out=25,
    )
    writing_style_api.MODEL = flag_model
    r = client.post("/api/writing-style/preview", json={"productCode": "T1"})
    assert r.status_code == 200
    data = r.json()
    assert data["decision"] == "flag"
    assert data["post"] == ""
    assert data["reasons"] == [{"field": "prompt", "issue": "đòi freeship không có trong dữ liệu"}]
    assert data["systemPromptChars"] > 0
    assert data["tokensIn"] == 100 and data["tokensOut"] == 25

    # Unknown product -> 404
    assert client.post("/api/writing-style/preview", json={"productCode": "UNKNOWN"}).status_code == 404
    # Unknown channel -> 404
    assert client.post("/api/writing-style/preview", json={"productCode": "T1", "channelId": "bad-ch"}).status_code == 404
    # Missing productCode -> 400 INVALID_INPUT with fields
    r_bad = client.post("/api/writing-style/preview", json={"style": {"voice": "ok"}})
    assert r_bad.status_code == 400 and r_bad.json()["code"] == "INVALID_INPUT"
    assert any(f["field"] == "productCode" for f in r_bad.json()["fields"])
    # Invalid unsaved style -> 400 INVALID_INPUT with fields
    r_bad_style = client.post("/api/writing-style/preview", json={"productCode": "T1", "style": {"maxEmoji": 99}})
    assert r_bad_style.status_code == 400 and r_bad_style.json()["code"] == "INVALID_INPUT"
    assert any(f["field"] == "maxEmoji" for f in r_bad_style.json()["fields"])


# ---------------- 5. Preview rate limit (10/min per tenant -> 429 RATE_LIMITED) ----------------

def test_preview_rate_limit_10_per_minute_per_tenant():
    clock = [1000.0]
    writing_style_api._monotonic = lambda: clock[0]
    fake = FakeModel(GOOD_REPLY)
    writing_style_api.MODEL = fake

    for i in range(10):
        r = client.post("/api/writing-style/preview", json={"productCode": "T1"})
        assert r.status_code == 200, (i, r.text)
    assert len(fake.calls) == 10

    # 11th request within the same 60s window -> 429 RATE_LIMITED without calling model
    r11 = client.post("/api/writing-style/preview", json={"productCode": "T1"})
    assert r11.status_code == 429, r11.text
    assert r11.json()["code"] == "RATE_LIMITED"
    assert len(fake.calls) == 10

    # Advancing clock past 60s restores quota
    clock[0] += 61.0
    r12 = client.post("/api/writing-style/preview", json={"productCode": "T1"})
    assert r12.status_code == 200
    assert len(fake.calls) == 11


# ---------------- 6. Tenant isolation ----------------

def test_tenant_isolation_cookie_guard_and_db_scope():
    # Seed a style for OTHER_TENANT directly in DB
    writing_style.upsert_scope(OTHER_TENANT, "default", {"voice": "Bí mật công ty khác"})
    writing_style.upsert_scope(OTHER_TENANT, CHANNEL_A, {"xungHo": "quý khách"})

    # Active tenant does NOT see OTHER_TENANT's styles
    r_own = client.get("/api/writing-style")
    assert r_own.status_code == 200
    assert r_own.json()["default"] == {}
    assert r_own.json()["overrides"] == []
    assert client.get(f"/api/writing-style/{CHANNEL_A}").json()["style"] == {}

    # Requests carrying OTHER_TENANT cookie are rejected with 403 FORBIDDEN on all routes
    client.cookies.set(vpost_api.TENANT_COOKIE, OTHER_TENANT)
    for resp in (
        client.get("/api/writing-style"),
        client.put("/api/writing-style", json={"style": {"voice": "x"}}),
        client.get(f"/api/writing-style/{CHANNEL_A}"),
        client.put(f"/api/writing-style/{CHANNEL_A}", json={"style": {"voice": "x"}}),
        client.delete(f"/api/writing-style/{CHANNEL_A}"),
        client.post("/api/writing-style/preview", json={"productCode": "T1"}),
    ):
        assert resp.status_code == 403
        assert resp.json()["code"] == "FORBIDDEN"


# ---------------- 7. Legacy server.py /api/batches path applies writing style ----------------

def test_legacy_server_batch_path_applies_writing_style():
    assert client.put(
        "/api/writing-style/diu-may",
        json={
            "style": {
                "voice": "Giọng riêng cho Dịu Mây qua batch",
                "hashtags": {"fixed": ["#DiuMayBatch"], "maxExtra": 1},
                "footer": "🌸 Chân bài riêng Dịu Mây",
            }
        },
    ).status_code == 200

    fake = FakeModel(GOOD_REPLY)
    server.MODEL = fake
    server.SYNC = True

    csv_bytes = (
        "ma_sp,ten_sp,gia_ban,gia_te,size,mau,chat_lieu,mo_ta,anh,page,prompt\n"
        "T1,Đầm Voan Hoa,890.000đ,50,S-L,Đen,Voan,Váy xoè 2 lớp,,diu-may,Viết nhẹ nhàng\n"
    ).encode("utf-8")

    r = client.post(
        "/api/batches",
        files={"file": ("p.csv", csv_bytes, "text/csv")},
        data={"default_page": "diu-may"},
    )
    assert r.status_code == 200, r.text
    batch = client.get("/api/batches/%d" % r.json()["id"]).json()
    row = batch["rows"][0]
    assert row["status"] == "written"
    assert len(fake.calls) == 1
    assert "Giọng riêng cho Dịu Mây qua batch" in fake.calls[0]["system"]
    assert "#DiuMayBatch" in row["post"]
    assert "🌸 Chân bài riêng Dịu Mây" in row["post"]


# ---------------- 8. Size chart storage & API ----------------

def test_size_chart_default_seed_update_category_override_reset_and_tenant_isolation():
    # Default GET returns seeded Vietnamese women's apparel chart ("Bảng size mẫu")
    r0 = client.get("/api/writing-style/size-chart")
    assert r0.status_code == 200, r0.text
    b0 = r0.json()
    assert b0["tenantId"] == vpost_api.TENANT_ID
    assert b0["category"] is None
    assert b0["isDefault"] is True
    assert b0["updatedAt"] is None
    assert b0["overrides"] == []
    assert "Váy xoè" in b0["categories"]  # discovered from catalog `loai`
    assert b0["chart"]["rows"] == [
        {"size": "S", "weightKg": [40, 46], "heightCm": [145, 155]},
        {"size": "M", "weightKg": [46, 52], "heightCm": [150, 160]},
        {"size": "L", "weightKg": [52, 58], "heightCm": [155, 165]},
        {"size": "XL", "weightKg": [58, 65], "heightCm": [158, 168]},
        {"size": "2XL", "weightKg": [65, 72], "heightCm": [160, 170]},
    ]
    assert b0["chart"]["note"] is None

    # PUT company default (direct SizeChart body)
    custom_default = {
        "rows": [
            {"size": "s", "weightKg": [42, 48], "heightCm": [148, 158]},
            {"size": "m", "weightKg": [48, 55], "heightCm": [155, 165]},
            {"size": "l", "weightKg": [55, 62], "heightCm": None},
        ],
        "note": "Form suông thoải mái",
    }
    r1 = client.put("/api/writing-style/size-chart", json=custom_default)
    assert r1.status_code == 200, r1.text
    b1 = r1.json()
    assert b1["isDefault"] is False
    assert Z_RE.match(b1["updatedAt"])
    assert b1["chart"] == {
        "rows": [
            {"size": "S", "weightKg": [42, 48], "heightCm": [148, 158]},
            {"size": "M", "weightKg": [48, 55], "heightCm": [155, 165]},
            {"size": "L", "weightKg": [55, 62], "heightCm": None},
        ],
        "note": "Form suông thoải mái",
    }

    # Category GET before override inherits company default
    rc0 = client.get("/api/writing-style/size-chart/Váy")
    assert rc0.status_code == 200, rc0.text
    bc0 = rc0.json()
    assert bc0["category"] == "Váy"
    assert bc0["chart"] is None
    assert bc0["isInherited"] is True
    assert bc0["effective"] == b1["chart"]
    assert bc0["updatedAt"] is None

    # PUT category override (also accepts wrapped `{chart: ...}`)
    vay_chart = {
        "chart": {
            "rows": [
                {"size": "S", "weightKg": [38, 45], "heightCm": [145, 155]},
                {"size": "M", "weightKg": [45, 51], "heightCm": [150, 160]},
            ],
            "note": "Váy ôm eo",
        }
    }
    rc1 = client.put("/api/writing-style/size-chart/Váy", json=vay_chart)
    assert rc1.status_code == 200, rc1.text
    bc1 = rc1.json()
    assert bc1["isInherited"] is False
    assert bc1["chart"]["note"] == "Váy ôm eo"
    assert bc1["effective"] == bc1["chart"]
    assert Z_RE.match(bc1["updatedAt"])

    # Case-insensitive lookup returns the same override
    assert client.get("/api/writing-style/size-chart/váy").json()["isInherited"] is False

    # Default GET lists the override
    r_list = client.get("/api/writing-style/size-chart").json()
    assert len(r_list["overrides"]) == 1
    assert r_list["overrides"][0]["category"] == "Váy"

    # DELETE category override reverts to company default
    rc_del = client.delete("/api/writing-style/size-chart/Váy")
    assert rc_del.status_code == 200
    assert rc_del.json()["isInherited"] is True
    assert rc_del.json()["chart"] is None
    assert rc_del.json()["effective"] == b1["chart"]

    # DELETE company default restores seeded default ("Khôi phục bảng mẫu")
    r_reset = client.delete("/api/writing-style/size-chart")
    assert r_reset.status_code == 200
    assert r_reset.json()["isDefault"] is True
    assert len(r_reset.json()["chart"]["rows"]) == 5

    # Tenant isolation
    writing_style.upsert_size_chart(
        OTHER_TENANT,
        {"rows": [{"size": "S", "weightKg": [40, 50], "heightCm": None}], "note": "Secret tenant"},
    )
    assert client.get("/api/writing-style/size-chart").json()["isDefault"] is True
    client.cookies.set(vpost_api.TENANT_COOKIE, OTHER_TENANT)
    for resp in (
        client.get("/api/writing-style/size-chart"),
        client.put("/api/writing-style/size-chart", json=custom_default),
        client.delete("/api/writing-style/size-chart"),
        client.get("/api/writing-style/size-chart/Váy"),
        client.put("/api/writing-style/size-chart/Váy", json=vay_chart),
        client.delete("/api/writing-style/size-chart/Váy"),
    ):
        assert resp.status_code == 403 and resp.json()["code"] == "FORBIDDEN"


@pytest.mark.parametrize(
    "payload,expected_field",
    [
        ({"rows": []}, "rows"),
        ({"rows": [{"size": f"S{i}", "weightKg": [40, 50], "heightCm": None} for i in range(13)]}, "rows"),
        ({"rows": [{"size": "S", "weightKg": [40, 46]}, {"size": "s", "weightKg": [46, 52]}]}, "rows[1].size"),
        ({"rows": [{"size": "XXL", "weightKg": [65, 72]}, {"size": "2XL", "weightKg": [72, 80]}]}, "rows[1].size"),
        ({"rows": [{"size": "S", "weightKg": [50, 50]}]}, "rows[0].weightKg"),
        ({"rows": [{"size": "S", "weightKg": [55, 45]}]}, "rows[0].weightKg"),
        ({"rows": [{"size": "S", "weightKg": [29, 45]}]}, "rows[0].weightKg"),
        ({"rows": [{"size": "S", "weightKg": [45, 151]}]}, "rows[0].weightKg"),
        ({"rows": [{"size": "S", "weightKg": [40, 46], "heightCm": [119, 155]}]}, "rows[0].heightCm"),
        ({"rows": [{"size": "S", "weightKg": [40, 46], "heightCm": [155, 211]}]}, "rows[0].heightCm"),
        ({"rows": [{"size": "S", "weightKg": [40, 46], "heightCm": [160, 155]}]}, "rows[0].heightCm"),
        ({"rows": [{"size": "S", "weightKg": [40, 46], "heightCm": [155, 155]}]}, "rows[0].heightCm"),
        ({"rows": [{"size": "", "weightKg": [40, 46]}]}, "rows[0].size"),
        ({"rows": [{"size": "S", "weightKg": [40, 46]}], "extra": 1}, "extra"),
        ({"rows": [{"size": "S", "weightKg": [40, 46]}], "note": "n" * 301}, "note"),
    ],
)
def test_size_chart_validation_errors_return_400(payload, expected_field):
    r = client.put("/api/writing-style/size-chart", json=payload)
    assert r.status_code == 400, (payload, r.text)
    data = r.json()
    assert data["code"] == "INVALID_INPUT"
    assert any(f["field"] == expected_field for f in data.get("fields", [])), (expected_field, data)

    rc = client.put("/api/writing-style/size-chart/Váy", json=payload)
    assert rc.status_code == 400 and rc.json()["code"] == "INVALID_INPUT"
