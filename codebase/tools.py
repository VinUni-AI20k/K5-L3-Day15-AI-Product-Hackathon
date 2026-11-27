"""Công cụ cho ứng dụng AI nhận diện hóa đơn, lưu note ngày theo ngày và phân tích chi tiêu.

Mỗi công cụ có @tool và docstring 4 ý: tên · input · output · tác động ra ngoài.
Mọi phép cộng trừ tổng tiền theo ngày/tháng chạy bằng code Python, không để model tự nhẩm.
"""
from contextlib import closing
from datetime import date, timedelta
import calendar
import hashlib
import json
import os
import re
import sqlite3
from pathlib import Path
from collections import defaultdict

from tracing import tool, TOOLS  # noqa: F401

DATA_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "expenses.json")

CATEGORY_KEYWORDS = {
    "Ăn uống": ("highlands", "cà phê", "ca phe", "phin", "trà sữa", "tra sua", "cơm", "com", "phở", "pho", "bún", "bun", "bánh", "banh", "ăn", "an", "bach hoa xanh", "nước", "nuoc"),
    "Di chuyển": ("grab", "xanh sm", "be ", "xăng", "xang", "xe ", "taxi", "gửi xe", "gui xe", "cuốc", "cuoc"),
    "Mua sắm": ("circle k", "siêu thị", "sieu thi", "áo", "ao", "quần", "quan", "giày", "giay", "shopee", "lazada", "nồi", "noi"),
    "Hóa đơn & Nhà ở": ("tiền trọ", "tien tro", "tiền phòng", "tien phong", "điện", "dien", "nước sinh hoạt", "internet", "wifi"),
    "Sức khỏe": ("thuốc", "thuoc", "khám", "kham", "vitamin", "bệnh viện", "benh vien", "nhà thuốc", "nha thuoc"),
    "Giải trí": ("phim", "rạp", "rap", "sách", "sach", "vé", "ve ", "game", "nhạc", "nhac"),
}


def _load_base_records() -> list:
    if not os.path.exists(DATA_PATH):
        return []
    with open(DATA_PATH, encoding="utf-8") as f:
        data = json.load(f)
    return list(data.get("records") or [])


def _connect_journal(path):
    if path is not None:
        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(str(path) if path is not None else ":memory:")
    connection.execute("CREATE TABLE IF NOT EXISTS receipts (id TEXT PRIMARY KEY, payload TEXT NOT NULL)")
    return connection


def _all_records(journal_path=None) -> list:
    base = _load_base_records()
    if journal_path is None or not Path(journal_path).is_file():
        return base
    with closing(_connect_journal(journal_path)) as connection:
        return base + [json.loads(row[0]) for row in connection.execute("SELECT payload FROM receipts ORDER BY rowid")]


def parse_vnd_amount(token: str) -> int | None:
    """Chuyển chuỗi tiền Việt ('45.000đ', '38k', '70000') thành số nguyên VND."""
    s = (token or "").strip().lower().replace(" ", "")
    m = re.match(r"^(\d+(?:[.,]\d{3})*)(k|nghin|ngan)?(?:d|đ|vnd)?$", s)
    if not m:
        return None
    raw_num = m.group(1).replace(".", "").replace(",", "")
    if not raw_num.isdigit():
        return None
    val = int(raw_num)
    if m.group(2):
        val *= 1000
    return val


def _infer_category(text: str) -> str:
    low = (text or "").lower()
    for cat, kws in CATEGORY_KEYWORDS.items():
        if any(re.search(r'(?<!\w)' + re.escape(k.strip()) + r'(?!\w)', low) for k in kws):
            return cat
    return "không rõ"


@tool
def parse_receipt_text(raw_input: str, capture_date: str | None = None) -> dict:
    """Kiểm văn bản hóa đơn mô phỏng OCR; nhận chuỗi và ngày chụp, trả ngày, tiền, nhóm và lỗi. Chỉ đọc."""
    text = raw_input.strip()
    low = text.lower()
    receipt_date = None
    capture_id = re.search(r"(?:mã lượt chụp|capture_id)\s*:\s*([\w-]+)", text, flags=re.IGNORECASE)
    capture_marker = re.search(r"ngày chụp\s*:\s*(20\d{2}-\d{2}-\d{2})", low)
    receipt_text = re.sub(r"ngày chụp\s*:\s*20\d{2}-\d{2}-\d{2}", "", text, flags=re.IGNORECASE)
    iso = re.search(r"20\d{2}-\d{2}-\d{2}", receipt_text)
    dmy = re.search(r"\b(\d{1,2})/(\d{1,2})/(20\d{2})\b", receipt_text)
    if iso:
        receipt_date = iso.group()
    elif dmy:
        d, m, y = dmy.groups()
        receipt_date = f"{y}-{int(m):02d}-{int(d):02d}"

    chosen_date = receipt_date or (capture_marker.group(1) if capture_marker else capture_date)
    if chosen_date:
        try:
            chosen_date = date.fromisoformat(chosen_date).isoformat()
        except ValueError:
            chosen_date = None

    merchant = re.sub(
        r"^(?:chụp|gửi ảnh)?\s*hóa đơn(?: bị [^:]+)?\s*:\s*",
        "", text.split("|", 1)[0].splitlines()[0] if text else "", flags=re.IGNORECASE,
    ).strip()
    if not merchant or merchant.lower().startswith(("tổng", "ngày", "gửi ảnh hóa đơn", "hóa đơn")):
        merchant = "Không rõ"

    amounts = {
        parse_vnd_amount(match.group(1))
        for match in re.finditer(
            r"(?:tổng cộng|tổng thanh toán|tổng phải trả|thực trả|phải trả)\s*:?\s*"
            r"(\d+(?:[.,]\d{3})*\s*(?:k|nghin|ngan|vnd|đ|d)?)(?![\d.,])",
            low,
        )
    }
    total = next(iter(amounts)) if len(amounts) == 1 else None
    if "chưa rõ thực trả" in low or "nhiều mức tổng chưa rõ" in low:
        total = None
    return {
        "merchant": merchant,
        "capture_id": capture_id.group(1).upper() if capture_id else None,
        "date": chosen_date,
        "date_source": "hóa đơn" if receipt_date else "ngày chụp",
        "total": total,
        "category": _infer_category(receipt_text),
    }


@tool
def validate_receipt(receipt: dict):
    """Kiểm ngày và số tiền thực trả trước khi cho xem bản nháp có thể chốt. Chỉ đọc."""
    missing = []
    if not receipt["date"]:
        missing.append("ngày hợp lệ")
    total = receipt["total"]
    if total is None or total <= 0:
        missing.append("số tiền thực trả")
    return missing


@tool
def draft_save_receipt(receipt: dict, raw_input: str):
    """Tạo dữ liệu xem nhanh trong phiên; chỉ thao tác Chốt mới ghi sổ."""
    return {"receipt": receipt, "capture_text": raw_input}


@tool
def save_daily_note(receipt: dict, raw_input: str, journal_path=None) -> dict:
    """Ghi một khoản VND vào sổ cục bộ của CLI, hoặc sổ tạm khi đánh giá. Trả khoản và trạng thái trùng."""
    capture_id = receipt["capture_id"]
    identity = "capture:" + capture_id if capture_id else (
        "receipt:" + hashlib.sha256(" ".join(raw_input.split()).casefold().encode("utf-8")).hexdigest()
    )
    base = _load_base_records()
    previous = next((row for row in base if capture_id and row.get("capture_id") == capture_id), None)
    if previous:
        same_day = [row for row in _all_records(journal_path) if row["date"] == previous["date"]]
        return {"record": previous, "duplicate": True, "new_day_total": sum(row["total"] for row in same_day), "new_day_count": len(same_day)}
    record = {
        "id": identity, "date": receipt["date"], "time": "",
        "merchant": receipt["merchant"], "total": receipt["total"],
        "category": receipt["category"], "date_source": receipt["date_source"], "capture_id": capture_id,
    }
    with closing(_connect_journal(journal_path)) as connection, connection:
        cursor = connection.execute(
            "INSERT OR IGNORE INTO receipts (id, payload) VALUES (?, ?)",
            (identity, json.dumps(record, ensure_ascii=False)),
        )
        duplicate = cursor.rowcount == 0
        if duplicate:
            record = json.loads(connection.execute("SELECT payload FROM receipts WHERE id = ?", (identity,)).fetchone()[0])
    if journal_path is None:
        records = _load_base_records() + [record]
    else:
        records = _all_records(journal_path)
    same_day = [row for row in records if row["date"] == record["date"]]
    return {"record": record, "duplicate": duplicate, "new_day_total": sum(row["total"] for row in same_day), "new_day_count": len(same_day)}


@tool
def get_day_summary(date: str, journal_path=None) -> dict:
    """Xem chi tiết chi tiêu của một ngày trong tháng khi người dùng ấn vào ngày trên lịch ngày.
    Input: date ('YYYY-MM-DD'). Output: dict gồm date, total, count, by_category, unknown_items, items. Không tác động ra ngoài."""
    items = [r for r in _all_records(journal_path) if r.get("date") == date]
    by_cat = defaultdict(int)
    unknown = []
    for r in items:
        by_cat[r["category"]] += int(r["total"])
        if r["category"] == "không rõ":
            unknown.append({"id": r["id"], "merchant": r["merchant"], "total": r["total"], "note": r.get("note", "")})
    return {
        "date": date,
        "total": sum(int(r["total"]) for r in items),
        "count": len(items),
        "by_category": dict(sorted(by_cat.items(), key=lambda x: -x[1])),
        "unknown_items": unknown,
        "items": [
            {"id": r["id"], "time": r["time"], "merchant": r["merchant"], "category": r["category"], "total": r["total"]}
            for r in items
        ],
    }


@tool
def get_month_calendar(year_month: str, journal_path=None) -> dict:
    """Lấy lưới tổng chi từng ngày trong tháng (dữ liệu cho màn hình lịch tháng).
    Input: year_month ('YYYY-MM'). Output: dict gồm year_month, total, active_days, top_day, days. Không tác động ra ngoài."""
    items = [r for r in _all_records(journal_path) if (r.get("date") or "").startswith(year_month)]
    daily = defaultdict(int)
    counts = defaultdict(int)
    for r in items:
        daily[r["date"]] += int(r["total"])
        counts[r["date"]] += 1
    top_day = max(daily.items(), key=lambda x: x[1]) if daily else None
    return {
        "year_month": year_month,
        "total": sum(daily.values()),
        "active_days": len(daily),
        "top_day": {"date": top_day[0], "total": top_day[1]} if top_day else None,
        "days": [{"date": d, "total": daily[d], "count": counts[d]} for d in sorted(daily)],
    }


def period_bounds(kind, key):
    if kind == "week":
        year, week = key.split("-W")
        start = date.fromisocalendar(int(year), int(week), 1)
        return start, start + timedelta(days=6)
    if kind == "month":
        year, month = map(int, key.split("-"))
        return date(year, month, 1), date(year, month, calendar.monthrange(year, month)[1])
    if kind == "year":
        year = int(key)
        return date(year, 1, 1), date(year, 12, 31)
    raise ValueError("Kỳ không hợp lệ")


def previous_period(kind, key):
    start, _ = period_bounds(kind, key)
    day_before = start - timedelta(days=1)
    if kind == "week":
        year, week, _ = day_before.isocalendar()
        return f"{year}-W{week:02}"
    return day_before.isoformat()[:7 if kind == "month" else 4]


@tool
def aggregate_period(kind, key, journal_path=None):
    """Tính tổng, nhóm và ngày cao nhất của một tuần ISO, tháng hoặc năm. Chỉ đọc."""
    start, end = (bound.isoformat() for bound in period_bounds(kind, key))
    items = [row for row in _all_records(journal_path) if start <= row["date"] <= end]
    if not items:
        return {"period": key, "has_data": False, "total": 0, "count": 0}

    by_cat = defaultdict(int)
    daily = defaultdict(int)
    unknown_count = 0
    for r in items:
        by_cat[r["category"]] += int(r["total"])
        daily[r["date"]] += int(r["total"])
        if r["category"] == "không rõ":
            unknown_count += 1

    total = sum(by_cat.values())
    top_day = max(daily.items(), key=lambda x: x[1])
    sorted_cats = [{"category": k, "total": v, "pct": round(100.0 * v / total, 2)} for k, v in sorted(by_cat.items(), key=lambda x: -x[1])]

    res = {
        "period": key,
        "has_data": True,
        "total": total,
        "count": len(items),
        "active_days": len(daily),
        "avg_per_active_day": round(total / len(daily)),
        "top_day": {"date": top_day[0], "total": top_day[1]},
        "by_category": sorted_cats,
        "unknown_count": unknown_count,
    }

    return res


@tool
def compare_periods(kind, current, previous, journal_path=None):
    """Tính chênh lệch và phần trăm giữa hai kỳ cùng loại; trả căn cứ theo nhóm. Chỉ đọc."""
    current_summary = aggregate_period(kind, current, journal_path)
    previous_summary = aggregate_period(kind, previous, journal_path)
    result = {"current": current_summary, "previous": previous_summary}
    if not (current_summary["has_data"] and previous_summary["has_data"]):
        return result
    diff = current_summary["total"] - previous_summary["total"]
    previous_total = previous_summary["total"]
    result.update(diff=diff, pct_diff=round(100 * diff / previous_total, 2) if previous_total else None)
    return result
