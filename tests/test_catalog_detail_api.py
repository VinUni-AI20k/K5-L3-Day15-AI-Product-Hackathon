import json
import os
import re
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "codebase"))

import pytest  # noqa: E402
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

import rules  # noqa: E402
import server  # noqa: E402
import vpost_api  # noqa: E402

IMG1 = "https://lh3.googleusercontent.com/d/1MUVT72VF7VJnXhCSR0hfZ5Snme2qS-zh"
IMG2 = "https://lh3.googleusercontent.com/d/1JmvL58m8zCOHzdtM1MOwk7VwrVWA_cFu"
IMG3 = "https://lh3.googleusercontent.com/d/1czGJhSWJ-pwF1UJ9fNpUX3vNgTFxTr5U"
OTHER_TENANT = "11111111-1111-4111-8111-111111111111"

ROWS = [
    {
        "ma_sp": "IN1",
        "ten_sp": "Đầm voan dáng dài",
        "loai": "Váy",
        "gia_ban": "1.250.000đ",
        "gia_te": "80",
        "size": "S-L",
        "mau": "Đen, Trắng",
        "chat_lieu": "Voan",
        "mo_ta": "Váy 2 lớp, khoá kéo sau lưng.",
        "anh": "\n".join([IMG1, IMG1, IMG2, IMG3, IMG2]),
        "page": "thanh-lich",
        "prompt": "Viết nhẹ nhàng, hợp đi làm",
    },
    {
        "ma_sp": "COMBO1",
        "ten_sp": "",
        "loai": "Váy",
        "gia_ban": "1.190.000đ",
        "gia_te": "",
        "size": "S-L",
        "mau": "Đen, Trắng, Hồng",
        "chat_lieu": "Cotton",
        "mo_ta": "",
        "anh": IMG1,
        "page": "nang-tho",
        "prompt": "Nêu rõ size và màu",
    },
    {
        "ma_sp": "BLK1",
        "ten_sp": "",
        "loai": "Váy",
        "gia_ban": "",
        "gia_te": "",
        "size": "M-L",
        "mau": "Kaki, Xanh lá",
        "chat_lieu": "",
        "mo_ta": "",
        "anh": "",
        "page": "diu-may",
        "prompt": "",
    },
    {
        "ma_sp": "OOS1",
        "ten_sp": "",
        "loai": "Váy",
        "gia_ban": "890.000đ",
        "gia_te": "",
        "size": "S-M",
        "mau": "Đen",
        "chat_lieu": "Polyester",
        "mo_ta": "",
        "anh": IMG1,
        "page": "",
        "prompt": "",
    },
    {
        "ma_sp": "FREE1",
        "ten_sp": "",
        "loai": "Váy",
        "gia_ban": "890.000đ",
        "gia_te": "",
        "size": "F",
        "mau": "Đen, Be",
        "chat_lieu": "",
        "mo_ta": "",
        "anh": IMG2,
        "page": "diu-may",
        "prompt": "",
    },
    {
        "ma_sp": "BADPRICE",
        "ten_sp": "",
        "loai": "Váy",
        "gia_ban": "liên hệ",
        "gia_te": "",
        "size": "S-M",
        "mau": "Đen",
        "chat_lieu": "Cotton",
        "mo_ta": "",
        "anh": IMG1,
        "page": "thanh-lich",
        "prompt": "",
    },
]

INV = {
    "IN1": [
        {"mau": "Đen", "size": "S", "ton": 4, "trang_thai": "Còn hàng"},
        {"mau": "Đen", "size": "M", "ton": 5, "trang_thai": "Còn hàng"},
        {"mau": "Đen", "size": "L", "ton": 3, "trang_thai": "Còn hàng"},
        {"mau": "Trắng", "size": "S", "ton": 2, "trang_thai": "Còn hàng"},
        {"mau": "Trắng", "size": "M", "ton": 6, "trang_thai": "Còn hàng"},
        {"mau": "Trắng", "size": "L", "ton": 1, "trang_thai": "Còn hàng"},
    ],
    # COMBO1:
    # - Đen/S in stock, Đen/M explicit qty=0 ("HẾT HÀNG"), Đen/L missing from inventory (qty=None)
    # - Trắng/S,M in stock, Trắng/L qty=0 (so size L is completely out of stock!)
    # - Hồng all qty=0 (so color Hồng is completely out of stock!)
    "COMBO1": [
        {"mau": "Đen", "size": "S", "ton": 5, "trang_thai": "Còn hàng"},
        {"mau": "Đen", "size": "M", "ton": 0, "trang_thai": "HẾT HÀNG"},
        {"mau": "Trắng", "size": "S", "ton": 3, "trang_thai": "Còn hàng"},
        {"mau": "Trắng", "size": "M", "ton": 4, "trang_thai": "Còn hàng"},
        {"mau": "Trắng", "size": "L", "ton": 0, "trang_thai": "HẾT HÀNG"},
        {"mau": "Hồng", "size": "S", "ton": 0, "trang_thai": "HẾT HÀNG"},
        {"mau": "Hồng", "size": "M", "ton": 0, "trang_thai": "HẾT HÀNG"},
        {"mau": "Hồng", "size": "L", "ton": 0, "trang_thai": "HẾT HÀNG"},
    ],
    # BLK1 is invalid (missing price + missing image) yet still has inventory rows
    "BLK1": [
        {"mau": "Kaki", "size": "M", "ton": 3, "trang_thai": "Còn hàng"},
        {"mau": "Kaki", "size": "L", "ton": 2, "trang_thai": "Còn hàng"},
        {"mau": "Xanh lá", "size": "M", "ton": 4, "trang_thai": "Còn hàng"},
        {"mau": "Xanh lá", "size": "L", "ton": 0, "trang_thai": "HẾT HÀNG"},
    ],
    "OOS1": [
        {"mau": "Đen", "size": "S", "ton": 0, "trang_thai": "HẾT HÀNG"},
        {"mau": "Đen", "size": "M", "ton": 0, "trang_thai": "HẾT HÀNG"},
    ],
    "FREE1": [
        {"mau": "Đen", "size": "Freesize", "ton": 4, "trang_thai": "Còn hàng"},
        {"mau": "Be", "size": "Freesize", "ton": 2, "trang_thai": "Còn hàng"},
    ],
}

GOOD_REPLY = {
    "decision": "write",
    "flag_reasons": [],
    "hook": "Chiếc đầm voan nhẹ nhàng cho ngày đi làm.",
    "body": "Đầm voan dáng dài màu đen, trắng, size S, M, L. Giá 1.250.000đ.",
    "cta": "Inbox để shop tư vấn chọn size nhé.",
    "hashtags": [],
    "facts_used": ["F1", "F2", "F3"],
}


@pytest.fixture(autouse=True)
def _catalog_fixture(monkeypatch):
    monkeypatch.setattr(tools, "inventory", lambda: INV)
    monkeypatch.setattr(tools, "check_images", lambda urls: {"ok": list(urls), "broken": []})
    vpost_api.load_catalog([dict(r) for r in ROWS])


def _client(tenant_cookie=None):
    c = TestClient(server.app)
    if tenant_cookie is not None:
        c.cookies.set(vpost_api.TENANT_COOKIE, tenant_cookie)
    return c


def test_full_detail_in_stock_product():
    r = _client().get("/api/catalog/products/IN1")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["tenantId"] == vpost_api.TENANT_ID

    p = body["product"]
    assert p["code"] == "IN1"
    assert p["name"] == "Đầm voan dáng dài"
    assert p["category"] == "Váy"
    assert p["pageId"] == "thanh-lich"
    assert p["pageName"] == "Thanh Lịch U40"
    assert p["fields"] == {
        "giaBan": "1.250.000đ",
        "giaBanVnd": 1250000,
        "giaTe": "80",
        "size": "S-L",
        "mau": "Đen, Trắng",
        "chatLieu": "Voan",
        "moTa": "Váy 2 lớp, khoá kéo sau lưng.",
        "prompt": "Viết nhẹ nhàng, hợp đi làm",
    }
    assert p["images"] == [IMG1, IMG2, IMG3]

    stock = p["stock"]
    assert stock["sizes"] == ["S", "M", "L"]
    assert stock["colors"] == ["Đen", "Trắng"]
    assert stock["inStockSizes"] == ["S", "M", "L"]
    assert stock["inStockColors"] == ["Đen", "Trắng"]
    assert stock["totalQty"] == 21
    assert len(stock["cells"]) == 6
    assert stock["cells"] == [
        {"color": "Đen", "size": "S", "qty": 4, "status": "Còn hàng", "inStock": True},
        {"color": "Đen", "size": "M", "qty": 5, "status": "Còn hàng", "inStock": True},
        {"color": "Đen", "size": "L", "qty": 3, "status": "Còn hàng", "inStock": True},
        {"color": "Trắng", "size": "S", "qty": 2, "status": "Còn hàng", "inStock": True},
        {"color": "Trắng", "size": "M", "qty": 6, "status": "Còn hàng", "inStock": True},
        {"color": "Trắng", "size": "L", "qty": 1, "status": "Còn hàng", "inStock": True},
    ]

    assert p["aiFacts"] == [
        {"id": "F1", "field": "ten_sp", "text": "Tên: Đầm voan dáng dài"},
        {"id": "F2", "field": "loai", "text": "Loại: Váy"},
        {"id": "F3", "field": "gia_ban", "text": "Giá bán: 1.250.000đ"},
        {"id": "F4", "field": "size", "text": "Size còn hàng: S, M, L"},
        {"id": "F5", "field": "mau", "text": "Màu còn hàng: Đen, Trắng"},
        {"id": "F6", "field": "chat_lieu", "text": "Chất liệu: Voan"},
        {"id": "F7", "field": "mo_ta", "text": "Mô tả: Váy 2 lớp, khoá kéo sau lưng."},
    ]
    assert p["warnings"] == []
    assert p["blocking"] == []
    assert p["composable"] is True


def test_out_of_stock_combo_and_dropped_color_size():
    r = _client().get("/api/catalog/products/COMBO1")
    assert r.status_code == 200, r.text
    p = r.json()["product"]
    assert p["name"] == "Váy COMBO1"
    assert p["composable"] is True
    assert p["blocking"] == []
    assert any("Hồng" in w and "L" in w for w in p["warnings"])

    stock = p["stock"]
    assert stock["colors"] == ["Đen", "Trắng", "Hồng"]
    assert stock["sizes"] == ["S", "M", "L"]
    assert stock["inStockColors"] == ["Đen", "Trắng"]
    assert stock["inStockSizes"] == ["S", "M"]
    assert stock["totalQty"] == 12
    assert len(stock["cells"]) == 9

    by_key = {(c["color"], c["size"]): c for c in stock["cells"]}
    assert by_key[("Đen", "S")] == {"color": "Đen", "size": "S", "qty": 5, "status": "Còn hàng", "inStock": True}
    assert by_key[("Đen", "M")] == {"color": "Đen", "size": "M", "qty": 0, "status": "HẾT HÀNG", "inStock": False}
    assert by_key[("Đen", "L")] == {"color": "Đen", "size": "L", "qty": None, "status": None, "inStock": False}
    assert by_key[("Hồng", "S")] == {"color": "Hồng", "size": "S", "qty": 0, "status": "HẾT HÀNG", "inStock": False}
    assert by_key[("Trắng", "L")] == {"color": "Trắng", "size": "L", "qty": 0, "status": "HẾT HÀNG", "inStock": False}

    # AI facts must only expose in-stock sizes (S, M) and in-stock colors (Đen, Trắng)
    facts_by_field = {f["field"]: f for f in p["aiFacts"]}
    assert facts_by_field["size"]["text"] == "Size còn hàng: S, M"
    assert facts_by_field["mau"]["text"] == "Màu còn hàng: Đen, Trắng"


def test_blocked_products_expose_blocking_list_and_stock():
    # Multi-reason block: missing price + missing images, still shows inventory matrix
    r = _client().get("/api/catalog/products/BLK1")
    assert r.status_code == 200, r.text
    p = r.json()["product"]
    assert p["composable"] is False
    codes = [b["code"] for b in p["blocking"]]
    assert codes == ["ROW_DATA_INVALID", "MEDIA_NOT_FOUND"]
    assert all(b["message"] for b in p["blocking"])
    assert p["fields"]["giaBan"] is None
    assert p["fields"]["giaBanVnd"] is None
    assert p["images"] == []
    assert p["stock"]["totalQty"] == 9
    assert p["stock"]["inStockColors"] == ["Kaki", "Xanh lá"]
    assert p["stock"]["inStockSizes"] == ["M", "L"]

    # Out-of-stock block: totalQty == 0, empty inStock lists, aiFacts must not claim in-stock size/color
    r_oos = _client().get("/api/catalog/products/OOS1")
    assert r_oos.status_code == 200, r_oos.text
    p_oos = r_oos.json()["product"]
    assert p_oos["composable"] is False
    assert [b["code"] for b in p_oos["blocking"]] == ["OUT_OF_STOCK"]
    assert p_oos["pageId"] == tools.DEFAULT_PAGE
    assert p_oos["pageName"] == tools.PAGES[tools.DEFAULT_PAGE]["name"]
    assert p_oos["stock"]["totalQty"] == 0
    assert p_oos["stock"]["inStockColors"] == []
    assert p_oos["stock"]["inStockSizes"] == []
    assert all(c["qty"] == 0 and c["inStock"] is False for c in p_oos["stock"]["cells"])
    oos_fact_fields = [f["field"] for f in p_oos["aiFacts"]]
    assert "size" not in oos_fact_fields and "mau" not in oos_fact_fields
    assert oos_fact_fields == ["loai", "gia_ban", "chat_lieu"]

    # Unparseable price + missing from inventory: totalQty is None, cells qty/status are None
    r_bad = _client().get("/api/catalog/products/BADPRICE")
    assert r_bad.status_code == 200, r_bad.text
    p_bad = r_bad.json()["product"]
    assert p_bad["composable"] is False
    assert p_bad["fields"]["giaBan"] == "liên hệ"
    assert p_bad["fields"]["giaBanVnd"] is None
    assert p_bad["stock"]["totalQty"] is None
    assert all(c["qty"] is None and c["status"] is None and c["inStock"] is False for c in p_bad["stock"]["cells"])
    assert "gia_ban" not in [f["field"] for f in p_bad["aiFacts"]]


def test_not_found_returns_404_product_not_found():
    r = _client().get("/api/catalog/products/DOES_NOT_EXIST")
    assert r.status_code == 404
    body = r.json()
    assert body["code"] == "PRODUCT_NOT_FOUND"
    assert body["message"]


def test_tenant_guard():
    r_forbidden = _client(OTHER_TENANT).get("/api/catalog/products/IN1")
    assert r_forbidden.status_code == 403
    assert r_forbidden.json()["code"] == "FORBIDDEN"

    r_same = _client(vpost_api.TENANT_ID).get("/api/catalog/products/IN1")
    assert r_same.status_code == 200
    assert r_same.json()["tenantId"] == vpost_api.TENANT_ID

    r_no_cookie = _client().get("/api/catalog/products/IN1")
    assert r_no_cookie.status_code == 200


def test_ai_facts_match_caption_prompt_builder_and_allowed_facts_call(monkeypatch):
    captured_prompts: dict[str, str] = {}
    allowed_calls: list[dict] = []
    orig_allowed_facts = rules.allowed_facts

    def spy_allowed_facts(row, stock, page, glob):
        res = orig_allowed_facts(row, stock, page, glob)
        allowed_calls.append({"code": row.get("ma_sp"), "page_id": page["id"], "allowed": res})
        return res

    def spy_model(system, user, schema=None):
        captured_prompts["last"] = user
        return {
            "text": json.dumps(GOOD_REPLY, ensure_ascii=False),
            "model": "fake",
            "tokens_in": 1,
            "tokens_out": 1,
        }

    monkeypatch.setattr(rules, "allowed_facts", spy_allowed_facts)
    monkeypatch.setattr(vpost_api, "MODEL", spy_model)

    for code, display in (("IN1", "Đầm voan dáng dài"), ("COMBO1", "Váy COMBO1")):
        allowed_calls.clear()
        captured_prompts.clear()

        detail_resp = _client().get(f"/api/catalog/products/{code}")
        assert detail_resp.status_code == 200, detail_resp.text
        detail_product = detail_resp.json()["product"]
        assert len(allowed_calls) == 1
        detail_allowed_call = allowed_calls[0]

        allowed_calls.clear()
        cap_resp = _client().post(
            "/api/posts/captions",
            json={
                "product": {"name": display, "description": "", "category": "Váy", "season": ""},
                "channels": ["facebook"],
            },
        )
        assert cap_resp.status_code == 200, cap_resp.text
        assert len(allowed_calls) == 1
        caption_allowed_call = allowed_calls[0]

        # Same allowed_facts call & same page resolution
        assert detail_allowed_call["page_id"] == caption_allowed_call["page_id"] == detail_product["pageId"]
        assert detail_allowed_call["allowed"] == caption_allowed_call["allowed"]

        # Exact <DU_LIEU> lines fed to the LLM equal detail.product.aiFacts
        m = re.search(r"<DU_LIEU>\n(.*?)\n</DU_LIEU>", captured_prompts["last"], re.S)
        assert m is not None
        prompt_lines = m.group(1).splitlines()
        detail_lines = [f"[{f['id']}] {f['text']}" for f in detail_product["aiFacts"]]
        assert detail_lines == prompt_lines


def test_freesize_and_catalog_list_additive_keys():
    r_free = _client().get("/api/catalog/products/FREE1")
    assert r_free.status_code == 200, r_free.text
    p_free = r_free.json()["product"]
    assert p_free["fields"]["size"] == "F"
    assert p_free["stock"]["sizes"] == ["Freesize"]
    assert p_free["stock"]["inStockSizes"] == ["Freesize"]
    assert p_free["stock"]["totalQty"] == 6

    r_list = _client().get("/api/catalog/products")
    assert r_list.status_code == 200, r_list.text
    items = {i["code"]: i for i in r_list.json()["items"]}

    assert items["IN1"]["price"] == "1.250.000đ"
    assert items["IN1"]["sizes"] == "S-L"
    assert items["IN1"]["colors"] == "Đen, Trắng"
    assert items["IN1"]["material"] == "Voan"

    assert items["BLK1"]["price"] is None
    assert items["BLK1"]["sizes"] == "M-L"
    assert items["BLK1"]["colors"] == "Kaki, Xanh lá"
    assert items["BLK1"]["material"] is None

    assert items["BADPRICE"]["price"] == "liên hệ"
    assert items["BADPRICE"]["material"] == "Cotton"
