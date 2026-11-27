"""Công cụ của bài toán — khớp bảng công cụ ở spec.md §4.

Mỗi công cụ là một hàm Python có @tool. Docstring ghi 4 ý: tên · input · output · có tác động ra ngoài không.
Khung tự ghi mỗi lần gọi công cụ vào trace.

Dữ liệu công cụ đọc: data/inventory.csv, data/pages.csv, data/post_rules.md (mô tả ở data/DATA_CARD.md).
Công cụ có tác động ra ngoài (schedule_post) KHÔNG được agent gọi — chỉ chạy khi nhân viên bấm duyệt.
"""
import csv
import os
import re
import sqlite3
from datetime import datetime, timedelta

from tracing import tool, TOOLS  # noqa: F401

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
DB_PATH = os.path.join(ROOT, "drafts.db")  # nội bộ app, không commit (.gitignore)

TY_GIA_TE = 13_500        # VND / 1 CNY — giả định, xem data/post_rules.md
PRICE_TOLERANCE = 0.02    # giá trong bài lệch > 2% → lỗi

# Tên cột lệch chuẩn → tên chuẩn (B17)
ALIASES = {
    "ma_sp": ["mã sp", "ma_hang", "mã hàng", "ma sp", "sku"],
    "ten": ["tên", "tên sản phẩm", "ten", "ten_sp"],
    "gia": ["giá", "giá bán", "đơn giá", "gia", "gia_ban"],
    "gia_te": ["giá tệ", "gia_te"],
    "gia_san": ["giá sàn page", "giá sàn", "gia_san"],
    "mau": ["màu", "mausac", "màu sắc", "mau"],
    "size": ["size", "kichco", "kích cỡ", "kich_co"],
    "chat_lieu": ["chất liệu", "chatlieu", "chat_lieu"],
    "mo_ta": ["mô tả", "mo_ta", "mota"],
    "anh": ["ảnh", "hinhanh", "hình ảnh", "anh"],
    "ton_kho": ["tồn kho", "ton_kho", "tonkho"],
    "trang_thai_sx": ["trạng thái sx", "trang_thai_sx"],
    "trang_thai": ["trạng thái", "trang_thai"],
    "ghi_chu": ["ghi chú", "ghi_chu"],
    "page": ["page", "trang"],
    "loai": ["loại", "loai"],
    "yeu_cau": ["yêu cầu thêm", "yêu cầu", "yeu_cau", "prompt"],
}
_ALIAS_LOOKUP = {a: k for k, names in ALIASES.items() for a in names}

EMPTY = {"", "(trống)", "trống", "-", "none", "null"}
NOT_FASHION = ["mỹ phẩm", "kem dưỡng", "son môi", "nước hoa", "thực phẩm", "thuốc"]
INJECTION = ["system override", "bỏ qua bước", "bỏ qua check", "ignore previous", "ignore all", "bỏ qua mọi"]
AUTO_POST = ["tự động đăng", "đăng ngay", "không cần nhân viên duyệt", "không cần duyệt"]
BANNED = ["chính hãng", "authentic", "hàng hiệu", "auth 100%", "nike", "adidas", "gucci", "louis vuitton",
          "chanel", "puma", "uniqlo", "zara"]
BAD_IMAGE = ["khieu_dam", "khiêu dâm", "nhay_cam", "nhạy cảm", "vi phạm"]
OPPOSITES = [("ngắn tay", "dài tay"), ("dài tay", "ngắn tay")]


def _norm_key(key: str) -> str:
    return _ALIAS_LOOKUP.get(key.strip().lower(), key.strip().lower())


def _is_empty(value) -> bool:
    return value is None or str(value).strip().lower() in EMPTY


def parse_price(value):
    """'199000' · '160.000đ' · '350,000' → int. Chữ ('hai trăm nghìn') → None."""
    if _is_empty(value):
        return None
    s = str(value).strip().lower().replace("đ", "").replace("vnd", "").replace(" ", "")
    if not re.fullmatch(r"\d{1,3}([.,]\d{3})+|\d+", s):
        return None
    return int(re.sub(r"[.,]", "", s))


def _strip_note(value: str) -> str:
    """'Thời trang nam (chỉ bán quần áo)' → 'Thời trang nam'."""
    return re.sub(r"\s*\(.*?\)\s*", " ", value or "").strip()


@tool
def read_products(text: str) -> dict:
    """read_products · Input: một dòng sản phẩm dạng 'Cột: giá trị | Cột: giá trị …' (một dòng của file
    Excel / CSV đã ghép). Output: {"row": dict tên cột chuẩn → giá trị, "unknown": các đoạn không đọc được}.
    Gộp tên cột lệch chuẩn (Ma_Hang, Đơn giá, KichCo…). Không tác động ra ngoài."""
    row, unknown = {}, []
    for part in text.split("|"):
        part = part.strip()
        if not part:
            continue
        if ":" not in part:
            unknown.append(part)
            continue
        key, value = part.split(":", 1)
        row[_norm_key(key)] = value.strip()
    return {"row": row, "unknown": unknown}


def _load_pages() -> dict:
    with open(os.path.join(DATA, "pages.csv"), encoding="utf-8-sig") as f:
        return {r["page"]: r for r in csv.DictReader(f)}


@tool
def check_product(row: dict) -> dict:
    """check_product · Input: dòng sản phẩm đã chuẩn hoá. Output: {"errors": [lỗi cứng], "warnings": [...]}.
    Kiểm: thiếu tên/giá/size/ảnh · giá sai định dạng · giá dưới giá tệ × 13.500 hoặc dưới giá sàn Page ·
    mô tả mâu thuẫn tên · sai mặt hàng · ảnh vi phạm · yêu cầu 'chính hãng' · chèn lệnh · đòi bỏ bước duyệt.
    Căn cứ: data/pages.csv. Không tác động ra ngoài."""
    errors, warnings = [], []
    blob = " ".join(str(v) for v in row.values()).lower()

    # An toàn trước: chèn lệnh, đòi tự đăng, đòi bịa 'chính hãng'
    if any(k in blob for k in INJECTION):
        errors.append("phát hiện lệnh chèn trong dữ liệu (prompt injection) — không làm theo")
    if any(k in blob for k in AUTO_POST):
        # Không chặn dòng: vẫn tạo bản nháp, nhưng bỏ qua yêu cầu đăng ngay (B24)
        warnings.append("bỏ qua yêu cầu đăng ngay / không cần duyệt — bài vẫn chờ nhân viên duyệt")
        row["yeu_cau"] = ""
    if any(k in blob for k in BANNED):
        errors.append("yêu cầu hoặc chứa cụm cấm ('chính hãng' / tên thương hiệu) — không viết")
    if any(k in str(row.get("anh", "")).lower() for k in BAD_IMAGE):
        errors.append("ảnh vi phạm tiêu chuẩn cộng đồng Facebook")

    # Đúng mặt hàng của Page
    kind = (str(row.get("loai", "")) + " " + str(row.get("ten", ""))).lower()
    if any(k in kind for k in NOT_FASHION):
        errors.append("sai mặt hàng: không phải sản phẩm thời trang của Page")
    page = _strip_note(row.get("page", ""))
    if page and page not in _load_pages():
        warnings.append(f"Page '{page}' chưa có trong danh sách Page — dùng giọng mặc định")

    # Trường bắt buộc
    for field, label in [("ten", "tên"), ("gia", "giá"), ("size", "size"), ("anh", "ảnh sản phẩm")]:
        if _is_empty(row.get(field)):
            errors.append(f"thiếu {label}")

    # Giá
    price = parse_price(row.get("gia"))
    if not _is_empty(row.get("gia")) and price is None:
        errors.append(f"giá sai định dạng (không phải số): '{row.get('gia')}'")
    if price is not None:
        te = parse_price(row.get("gia_te"))
        if te is not None and price < te * TY_GIA_TE:
            errors.append(f"giá bán {price} thấp hơn giá tệ × {TY_GIA_TE} = {te * TY_GIA_TE}")
        floor = parse_price(row.get("gia_san"))
        if floor is not None and price < floor:
            errors.append(f"giá bán {price} thấp hơn giá sàn Page {floor}")

    # Mô tả mâu thuẫn tên
    name, desc = str(row.get("ten", "")).lower(), str(row.get("mo_ta", "")).lower()
    for a, b in OPPOSITES:
        if a in name and b in desc:
            errors.append(f"mô tả mâu thuẫn: tên ghi '{a}' nhưng mô tả ghi '{b}'")
    return {"errors": errors, "warnings": warnings}


def _parse_stock(value: str):
    """'Trắng M(10), Đen L(5)' → [("Trắng M", 10), ("Đen L", 5)] · '20' → [("", 20)]."""
    items = re.findall(r"([^,()]*?)\s*\((\d+)\)", value)
    if items:
        return [(v.strip(), int(n)) for v, n in items]
    if value.strip().isdigit():
        return [("", int(value.strip()))]
    return None


@tool
def check_stock(row: dict) -> dict:
    """check_stock · Input: dòng sản phẩm đã chuẩn hoá (mã, màu, size, ô 'Tồn kho' nếu file có).
    Output: {"errors": [...], "in_stock": [biến thể còn hàng], "out_of_stock": [biến thể hết]}.
    Đọc ô Tồn kho của dòng; nếu không có thì tra data/inventory.csv theo mã. Không tác động ra ngoài."""
    errors = []
    if "ngừng" in str(row.get("trang_thai_sx", "")).lower():
        errors.append("sản phẩm ngừng sản xuất — không đăng bài mới")

    stock = _parse_stock(row["ton_kho"]) if not _is_empty(row.get("ton_kho")) else None
    if stock is None:
        code = str(row.get("ma_sp", "")).strip()
        with open(os.path.join(DATA, "inventory.csv"), encoding="utf-8-sig") as f:
            rows = [r for r in csv.DictReader(f) if r["ma_sp"] == code]
        if not rows:
            errors.append(f"mã sản phẩm '{code}' không có trong kho")
            return {"errors": errors, "in_stock": [], "out_of_stock": []}
        stock = [(f"{r['mau']} {r['size']}", int(r["ton"])) for r in rows]

    in_stock = [v for v, n in stock if n > 0]
    out = [v for v, n in stock if n <= 0]
    if not in_stock:
        if "đã có bài" in str(row.get("trang_thai", "")).lower():
            errors.append("hết hàng và đã có bài đăng trước đó — không tạo bài mới")
        else:
            errors.append("hết hàng mọi màu / size")
    return {"errors": errors, "in_stock": in_stock, "out_of_stock": out}


def _money_numbers(text: str):
    """Các số tiền trong bài: '199.000đ', '199,000', '199000', '199k'."""
    found = []
    for m in re.finditer(r"(\d{1,3}(?:[.,]\d{3})+|\d{4,})\s*(k|đ|vnd|vnđ)?|(\d{2,3})\s*k\b", text.lower()):
        if m.group(3):
            found.append(int(m.group(3)) * 1000)
        else:
            n = int(re.sub(r"[.,]", "", m.group(1)))
            found.append(n * 1000 if m.group(2) == "k" else n)
    return [n for n in found if n >= 10_000]


@tool
def verify_post(post: str, row: dict, out_of_stock: list) -> dict:
    """verify_post · Input: bài viết, dòng sản phẩm, danh sách biến thể hết hàng.
    Output: {"errors": [lỗi chặn — bắt AI viết lại]}. Kiểm: giá lệch > 2% · cụm cấm / tên thương hiệu ·
    freeship / giảm giá khi file không có · nhắc biến thể hết hàng. Không tác động ra ngoài."""
    errors = []
    low = post.lower()
    price = parse_price(row.get("gia"))
    note = str(row.get("ghi_chu", "")).lower()

    if price:
        nums = _money_numbers(post)
        if not nums:
            errors.append(f"bài chưa ghi giá {price}")
        allowed = {price}
        pct = re.search(r"giảm\s*(\d+)\s*%", note)
        if pct:
            allowed.add(round(price * (100 - int(pct.group(1))) / 100))
        for n in nums:
            if not any(abs(n - a) <= a * PRICE_TOLERANCE for a in allowed):
                errors.append(f"giá {n} trong bài không khớp giá trong file {price}")
    for k in BANNED:
        if k in low:
            errors.append(f"bài chứa cụm cấm '{k}'")
    if ("freeship" in low or "miễn phí ship" in low or "miễn phí vận chuyển" in low) and "freeship" not in note:
        errors.append("bài nhắc freeship nhưng file không có ưu đãi này")
    # '%' chỉ tính là ưu đãi khi đi cùng giảm / sale / off / dấu trừ — không bắt nhầm "Cotton 100%"
    promo = r"giảm giá|giảm\s*\d+|\bsale\b|\boff\b|-\s*\d+\s*%|khuyến mãi"
    if re.search(promo, low) and not re.search(r"giảm|sale|%|khuyến mãi", note):
        errors.append("bài nhắc giảm giá / sale nhưng file không có ưu đãi này")
    for variant in out_of_stock:
        if variant and variant.lower() in low:
            errors.append(f"bài nhắc biến thể đã hết hàng: {variant}")
    return {"errors": errors}


def _db():
    con = sqlite3.connect(DB_PATH)
    con.execute("""CREATE TABLE IF NOT EXISTS drafts (
        id INTEGER PRIMARY KEY AUTOINCREMENT, ma_sp TEXT, page TEXT, status TEXT,
        post TEXT, reasons TEXT, created_at TEXT, scheduled_at TEXT, fb_post_id TEXT)""")
    return con


@tool
def save_drafts(ma_sp: str, page: str, status: str, post: str, reasons: list) -> int:
    """save_drafts · Input: mã SP, Page, trạng thái ('nhap' | 'danh_dau'), bài viết, lý do đánh dấu.
    Output: id bản nháp. Ghi vào SQLite nội bộ của app (drafts.db) — không tác động ra ngoài.
    Bản nháp CHƯA được lên lịch: phải chờ nhân viên duyệt."""
    with _db() as con:
        cur = con.execute(
            "INSERT INTO drafts (ma_sp, page, status, post, reasons, created_at) VALUES (?,?,?,?,?,?)",
            (ma_sp, page, status, post, "; ".join(reasons), datetime.now().isoformat(timespec="seconds")))
        return cur.lastrowid


@tool
def schedule_post(draft_id: int, approved_by: str) -> dict:
    """schedule_post · Input: id bản nháp đã duyệt, tên nhân viên duyệt. Output: {"scheduled_at", "fb_post_id"}.
    **CÓ tác động ra ngoài** (khi .env có FB_PAGE_ACCESS_TOKEN): tạo bài HẸN GIỜ (published=false) trên Fanpage
    thử, huỷ được. Chỉ gọi từ nút "Duyệt" của nhân viên — agent.answer() KHÔNG gọi công cụ này.
    Từ chối nếu bản nháp đang bị đánh dấu hoặc chưa có người duyệt."""
    if not approved_by:
        raise PermissionError("schedule_post cần tên nhân viên duyệt")
    with _db() as con:
        r = con.execute("SELECT status FROM drafts WHERE id=?", (draft_id,)).fetchone()
        if not r or r[0] != "nhap":
            raise PermissionError("chỉ bản nháp hợp lệ mới được lên lịch, dòng bị đánh dấu thì không")
        when = (datetime.now() + timedelta(minutes=10)).replace(second=0, microsecond=0)
        fb_id = None
        if os.environ.get("FB_PAGE_ACCESS_TOKEN") and os.environ.get("FB_PAGE_ID"):
            # Backend (Huy): gọi Graph API POST /{page-id}/feed với published=false,
            # scheduled_publish_time=int(when.timestamp()). Chưa nối — để trống.
            fb_id = None
        con.execute("UPDATE drafts SET status='da_len_lich', scheduled_at=?, fb_post_id=? WHERE id=?",
                    (when.isoformat(timespec="minutes"), fb_id, draft_id))
    return {"scheduled_at": when.isoformat(timespec="minutes"), "fb_post_id": fb_id}
