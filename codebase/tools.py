"""Công cụ cho ứng dụng AI nhận diện hóa đơn, lưu note ngày kiểu Locket và phân tích chi tiêu.

Mỗi công cụ có @tool và docstring 4 ý: tên · input · output · tác động ra ngoài.
Mọi phép cộng trừ tổng tiền theo ngày/tháng chạy bằng code Python, không để model tự nhẩm.
"""
import json
import os
import re
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


def _all_records() -> list:
    return _load_base_records()


def _parse_vnd_amount(token: str) -> int | None:
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
        if any(k in low for k in kws):
            return cat
    return "không rõ"


@tool
def parse_receipt_text(raw_input: str) -> dict:
    """Bóc tách thông tin hóa đơn (cửa hàng, ngày, tổng thực trả, nhóm chi, mã lượt chụp) từ ảnh/văn bản hóa đơn.
    Input: chuỗi mô tả/OCR hóa đơn (str). Output: dict gồm capture_id, merchant, date, date_source, total, category, ambiguous_totals, blurry, duplicate_of, status, missing_fields. Không tác động ra ngoài."""
    text = (raw_input or "").strip()
    low = text.lower()

    cap_m = re.search(r"(?:mã\s*lượt\s*chụp|capture_id)\s*[:\-]?\s*([A-Za-z0-9_-]+)", text, flags=re.IGNORECASE)
    capture_id = cap_m.group(1).upper() if cap_m else None
    duplicate_of = None
    if capture_id:
        for existing in _all_records():
            if (existing.get("capture_id") or "").upper() == capture_id:
                duplicate_of = existing.get("id")
                break

    blurry = any(k in low for k in ("mờ", "nhòe", "nhoe", "không đọc được", "ko doc duoc", "bị che", "bi che"))
    date_m = re.search(r"(20\d{2}-\d{2}-\d{2})", text)
    if not date_m:
        dmy = re.search(r"\b(\d{1,2})/(\d{1,2})/(20\d{2})\b", text)
        date_str = f"{dmy.group(3)}-{int(dmy.group(2)):02d}-{int(dmy.group(1)):02d}" if dmy else None
    else:
        date_str = date_m.group(1)
    date_source = "receipt" if date_str else "missing"

    merchant = None
    if ":" in text and "|" in text:
        parts = [p.strip() for p in text.split("|")]
        first = re.sub(r"^(?:chụp\s*)?hóa\s*đơn(?:\s*(?:bị\s*[^:]+))?\s*:\s*", "", parts[0], flags=re.IGNORECASE).strip()
        if first and "ngày" not in first.lower() and "mã lượt chụp" not in first.lower():
            merchant = first
    if not merchant:
        for line in text.splitlines():
            clean = re.sub(
                r"^(?:gửi\s*ảnh|chụp)?\s*hóa\s*đơn(?:\s*(?:chỉ\s*ghi|bị\s*[^:]+))?\s*:\s*",
                "",
                line.strip(),
                flags=re.IGNORECASE,
            ).strip()
            if clean and not clean.lower().startswith(("ngày", "tổng", "mã lượt")):
                merchant = clean.split("(")[0].strip()[:60]
                break

    # Tìm tổng thực trả tường minh; nếu có nhiều mức tổng mâu thuẫn nhau mà không rõ thực trả -> Cần đọc lại
    total = None
    ambiguous_totals = False
    paid_m = re.findall(
        r"(?:thực\s*trả|thanh\s*toán|tổng\s*cộng|tổng\s*tiền|total)\s*[:\-]?\s*(\d+(?:[.,]\d{3})*\s*(?:k|nghin|ngan|đ|d|vnd)?)",
        low,
    )
    paid_vals = [_parse_vnd_amount(v) for v in paid_m]
    paid_vals = [v for v in paid_vals if v is not None]

    # Bắt thêm các nhãn dễ gây nhầm nhiều mức tổng (tạm tính / tổng hàng / tổng bill)
    other_totals = re.findall(
        r"(?:tạm\s*tính|tổng\s*(?:tạm|hàng|bill))\s*[:\-]?\s*(\d+(?:[.,]\d{3})*\s*(?:k|nghin|ngan|đ|d|vnd)?)",
        low,
    )
    other_vals = [v for v in (_parse_vnd_amount(v) for v in other_totals) if v is not None]

    explicit_paid = re.search(
        r"(?:thực\s*trả|khách\s*trả)\s*[:\-]?\s*(\d+(?:[.,]\d{3})*\s*(?:k|nghin|ngan|đ|d|vnd)?)",
        low,
    )
    if explicit_paid:
        total = _parse_vnd_amount(explicit_paid.group(1))
    elif len(set(paid_vals)) > 1 or (other_vals and paid_vals and set(other_vals) != set(paid_vals) and "chưa rõ" in low):
        ambiguous_totals = True
    elif len(set(paid_vals)) == 1 and not (other_vals and ("chưa rõ" in low or "nhiều mức tổng" in low)):
        total = paid_vals[0]
    elif len(other_vals) > 1 or ("nhiều mức tổng" in low and not explicit_paid):
        ambiguous_totals = True
    elif not blurry:
        amounts = []
        for m in re.finditer(r"(\d+(?:[.,]\d{3})+\s*(?:đ|d|vnd)?|\b\d+\s*k\b)", low):
            val = _parse_vnd_amount(m.group(1))
            if val is not None and val >= 1000:
                amounts.append(val)
        if amounts:
            total = sum(amounts)

    missing = []
    if not date_str:
        missing.append("ngày (YYYY-MM-DD)")
    if ambiguous_totals:
        total = None
        missing.append("xác nhận số thực trả (do có nhiều mức tổng)")
    elif total is None or (blurry and not paid_vals and not explicit_paid):
        total = None
        missing.append("tổng tiền (VND)")
    if not merchant:
        missing.append("tên cửa hàng/khoản chi")

    status = "duplicate" if duplicate_of else ("Cần đọc lại" if missing else "ready")
    category = _infer_category(text)
    return {
        "capture_id": capture_id,
        "duplicate_of": duplicate_of,
        "merchant": merchant or "không rõ",
        "date": date_str,
        "date_source": date_source,
        "total": total,
        "category": category,
        "blurry": blurry,
        "ambiguous_totals": ambiguous_totals,
        "status": status,
        "missing_fields": missing,
    }


@tool
def save_daily_note(date: str, merchant: str, total: int, category: str, note: str = "", capture_id: str = "") -> dict:
    """Tạo bản ghi chú khoản chi từ hóa đơn cho nhật ký ngày (kiểu Locket), chống cộng trùng theo mã lượt chụp.
    Input: date (YYYY-MM-DD), merchant (str), total (int > 0), category (str), note (str), capture_id (str). Output: bản nháp note để lưu và tổng ngày mới. Không ghi đè file dữ liệu gốc (an toàn, đảo được)."""
    if not date or total is None or total <= 0:
        return {"saved": False, "reason": "Thiếu ngày hoặc tổng tiền không hợp lệ (> 0)."}
    if capture_id:
        for r in _all_records():
            if (r.get("capture_id") or "").upper() == capture_id.upper():
                day_recs = [x for x in _all_records() if x.get("date") == r.get("date")]
                return {
                    "saved": False,
                    "duplicate": True,
                    "existing_id": r["id"],
                    "capture_id": capture_id.upper(),
                    "day_total": sum(int(x["total"]) for x in day_recs),
                    "reason": f"Mã lượt chụp {capture_id.upper()} đã tồn tại ({r['id']}), không cộng trùng.",
                }
    existing = [r for r in _all_records() if r.get("date") == date]
    new_total = sum(int(r["total"]) for r in existing) + int(total)
    rec = {
        "id": f"NOTE-{date}",
        "capture_id": capture_id.upper() if capture_id else None,
        "date": date,
        "time": "12:00",
        "merchant": merchant,
        "category": category or "không rõ",
        "items": [{"name": note or merchant, "amount": int(total)}],
        "total": int(total),
        "note": note or f"Lưu từ hóa đơn {merchant}",
        "source_type": "draft_receipt_note",
    }
    return {"saved": True, "record": rec, "new_day_total": new_total, "new_day_count": len(existing) + 1}


@tool
def get_day_summary(date: str) -> dict:
    """Xem chi tiết chi tiêu của một ngày trong tháng khi người dùng ấn vào ngày trên lịch Locket.
    Input: date ('YYYY-MM-DD'). Output: dict gồm date, total, count, by_category, unknown_items, items. Không tác động ra ngoài."""
    items = [r for r in _all_records() if r.get("date") == date]
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
def get_month_calendar(year_month: str) -> dict:
    """Lấy lưới tổng chi từng ngày trong tháng (dữ liệu cho màn hình lịch kiểu Locket).
    Input: year_month ('YYYY-MM'). Output: dict gồm year_month, total, active_days, top_day, days. Không tác động ra ngoài."""
    items = [r for r in _all_records() if (r.get("date") or "").startswith(year_month)]
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


@tool
def analyze_spending(period: str, compare_with: str = "") -> dict:
    """Phân tích chi tiêu theo tháng (hoặc so sánh 2 tháng) dựa trên hóa đơn đã lưu bằng code.
    Input: period ('YYYY-MM'), compare_with ('YYYY-MM' tùy chọn). Output: dict tổng chi, phân bổ nhóm, ngày cao nhất, khoản 'không rõ' và chênh lệch so sánh. Không tác động ra ngoài."""
    items = [r for r in _all_records() if (r.get("date") or "").startswith(period)]
    if not items:
        return {"period": period, "has_data": False, "total": 0, "count": 0}

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
        "period": period,
        "has_data": True,
        "total": total,
        "count": len(items),
        "active_days": len(daily),
        "avg_per_active_day": round(total / len(daily)),
        "top_day": {"date": top_day[0], "total": top_day[1]},
        "by_category": sorted_cats,
        "unknown_count": unknown_count,
    }

    if compare_with:
        prev_items = [r for r in _all_records() if (r.get("date") or "").startswith(compare_with)]
        if prev_items:
            prev_total = sum(int(r["total"]) for r in prev_items)
            diff = total - prev_total
            pct_diff = round(100.0 * diff / prev_total, 2) if prev_total else None
            res["comparison"] = {
                "other_period": compare_with,
                "other_total": prev_total,
                "diff": diff,
                "pct_diff": pct_diff,
            }
        else:
            res["comparison"] = {"other_period": compare_with, "has_data": False}
    return res
