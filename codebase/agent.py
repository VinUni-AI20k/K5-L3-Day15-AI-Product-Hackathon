"""Luồng chính của ứng dụng AI nhận hóa đơn, lưu note ngày theo ngày và phân tích chi tiêu.

Hình dạng: Workflow cố định có bước chặn an toàn bằng code + phân luồng công cụ + gọi AI tổng hợp.
Mọi con số đều được tính trước bằng code trong codebase/tools.py; model không tự cộng trừ hay bịa số.
"""
import re

from ai import call_model
from tools import (
    CATEGORY_KEYWORDS,
    aggregate_period,
    compare_periods,
    draft_save_receipt,
    get_day_summary,
    parse_receipt_text,
    parse_vnd_amount,
    previous_period,
    save_daily_note,
    validate_receipt,
)
from tracing import note

SYSTEM = (
    "Bạn là trợ lý tài chính cá nhân giúp người dùng nhận diện hóa đơn, lưu note chi tiêu hằng ngày theo ngày "
    "và phân tích chi tiêu ngày/tháng. "
    "Quy tắc bắt buộc: (1) Chỉ dùng đúng các con số từ phần Căn cứ công cụ, không tự cộng trừ hay bịa số; "
    "(2) Nếu thiếu ngày, thiếu tổng tiền hoặc hóa đơn mờ thì hỏi lại đúng thông tin thiếu; "
    "(3) Nếu chưa có dữ liệu của ngày/tháng được hỏi thì nói rõ chưa có dữ liệu; "
    "(4) Từ chối tư vấn đầu tư/cổ phiếu/coin, từ chối xem dữ liệu người khác và từ chối ghi khống số tiền."
)


def _fmt_vnd(amount: int) -> str:
    return f"{int(amount):,}".replace(",", ".") + "đ"


def _check_safety_or_scope(text: str) -> str | None:
    """Chặn yêu cầu ngoài phạm vi, prompt injection hoặc ép ghi khống số liệu bằng code."""
    low = (text or "").lower()
    # Chặn OTP, mật khẩu, CVV hoặc dãy số thẻ dài (13-19 chữ số) — tuyệt đối không lặp lại thông tin nhạy cảm
    has_long_card = bool(re.search(r"\b(?:\d[ -]?){13,19}\b", text or ""))
    if has_long_card or any(k in low for k in ("otp", "mật khẩu", "mat khau", "cvv", "số thẻ", "so the", "mã pin", "ma pin")):
        return (
            "Từ chối xử lý và không lưu/lặp lại thông tin nhạy cảm (OTP, mật khẩu, số thẻ hoặc mã PIN). "
            "Ứng dụng chỉ nhận hóa đơn mua hàng thông thường, vui lòng che hoặc xóa các thông tin bảo mật ngân hàng trước khi gửi."
        )
    if any(k in low for k in ("cổ phiếu", "co phieu", "chứng khoán", "chung khoan", "coin", "crypto", "đầu tư", "dau tu")):
        return (
            "Từ chối tư vấn đầu tư: ứng dụng chỉ hỗ trợ nhận hóa đơn, lưu note chi tiêu hằng ngày và phân tích chi tiêu cá nhân, "
            "không tư vấn mua cổ phiếu, coin hay kênh đầu tư. Bạn có muốn xem tổng hợp các khoản chi tháng này để cân đối lại không?"
        )
    if any(k in low for k in ("người dùng khác", "nguoi dung khac", "người khác", "nguoi khac", "bỏ qua mọi quy tắc", "bo qua moi quy tac", "xuất toàn bộ", "xuat toan bo")):
        return (
            "Từ chối yêu cầu: hệ thống không truy cập hoặc xuất dữ liệu chi tiêu của người dùng khác và không bỏ qua quy tắc bảo mật dữ liệu cá nhân."
        )
    if ("thành 0đ" in low or "thanh 0d" in low or "0 đồng" in low) and any(k in low for k in ("ép", "ep", "giả", "gia", "vượt", "vuot", "sai sự thật")):
        return (
            "Từ chối ghi khống số liệu: hệ thống không chỉnh hóa đơn thành 0đ sai sự thật. "
            "Vui lòng nhập đúng số tiền thực chi trên hóa đơn để lưu vào nhật ký ngày."
        )
    return None


def _extract_dates_and_months(text: str):
    dates = re.findall(r"(20\d{2}-\d{2}-\d{2})", text)
    if not dates:
        for d, m, y in re.findall(r"\b(\d{1,2})/(\d{1,2})/(20\d{2})\b", text):
            dates.append(f"{y}-{int(m):02d}-{int(d):02d}")
    months = re.findall(r"\b(20\d{2}-\d{2})\b(?!-\d{2})", text)
    if not months:
        for m, y in re.findall(r"tháng\s*(\d{1,2})\s*[/-]\s*(20\d{2})", text.lower()):
            months.append(f"{y}-{int(m):02d}")
    return dates, months


def _is_receipt_input(text: str) -> bool:
    low = text.casefold().replace("hoá", "hóa")
    return low.startswith(("chụp hóa đơn", "chup hoa don", "hóa đơn:", "hoa don:", "gửi ảnh", "gui anh"))


def _receipt_details(receipt):
    date_label = " (ngày chụp)" if receipt.get("date_source") == "ngày chụp" else ""
    return (
        f"ngày {receipt['date']}{date_label}: {receipt['merchant']} · "
        f"{_fmt_vnd(receipt['total'])} · nhóm {receipt['category']}."
    )


def _preview_receipt(text, capture_date):
    receipt = parse_receipt_text(text, capture_date)
    missing = validate_receipt(receipt)
    if missing:
        missing = ", ".join(missing)
        note("dừng: thiếu trường hóa đơn")
        return f"Cần đọc lại hóa đơn: {missing}. Chưa ghi khoản chi. Hãy chụp lại rõ phần cần đọc.", None
    return (
        f"Xem nhanh {_receipt_details(receipt)} Chưa ghi khoản chi. Chọn Chốt để lưu.",
        draft_save_receipt(receipt, text),
    )


def _edit_receipt(pending, field, value):
    if pending is None:
        return {"output": "Chưa có bản xem nhanh để sửa."}
    receipt = pending["receipt"].copy()
    if field == "tiền":
        amount = parse_vnd_amount(value)
        if amount is None or amount <= 0:
            return {"output": "Số tiền chưa hợp lệ. Nhập theo mẫu Sửa tiền: 55.000đ."}
        receipt["total"] = amount
    else:
        categories = (*CATEGORY_KEYWORDS, "không rõ")
        category = next((option for option in categories if option.casefold() == value.casefold()), None)
        if category is None:
            return {"output": "Chọn một nhóm chi: " + ", ".join(categories) + "."}
        receipt["category"] = category
    return {
        "output": f"Đã sửa bản xem nhanh {_receipt_details(receipt)} Chọn Chốt để lưu.",
        "pending_receipt": {**pending, "receipt": receipt},
    }


def _confirm_receipt(pending_receipt, journal_path):
    if pending_receipt is None:
        return "Chưa có hóa đơn để chốt."
    saved = save_daily_note(pending_receipt["receipt"], pending_receipt["capture_text"], journal_path)
    record = saved["record"]
    status = "Khoản đã có, không ghi trùng" if saved["duplicate"] else "Đã chốt và lưu khoản chi"
    return (
        f"{status} {_receipt_details(record)} "
        f"Tổng chi ngày {record['date']}: {_fmt_vnd(saved['new_day_total'])} ({saved['new_day_count']} khoản)."
    )


def _build_context(text: str, journal_path=None) -> tuple[str, str]:
    """Dựng dữ liệu tra cứu và tổng chi từ các khoản đã lưu."""
    dates, months = _extract_dates_and_months(text)
    weeks = re.findall(r"\b20\d{2}-W\d{2}\b", text.upper())
    years = re.findall(r"(?:năm|nam)\s+(20\d{2})\b", text.lower())
    if weeks or months or (years and not dates):
        kind, keys = ("week", weeks) if weeks else ("month", months) if months else ("year", years)
        try:
            if len(keys) == 1 and "kỳ trước" in text.lower():
                keys.append(previous_period(kind, keys[0]))
            return _period_report(kind, keys, journal_path)
        except ValueError:
            return "Kỳ không hợp lệ.", "Mốc tuần, tháng hoặc năm chưa hợp lệ."

    if dates:
        d = dates[0]
        day_info = get_day_summary(d, journal_path)
        if day_info["count"] == 0:
            note("ngày chưa có dữ liệu")
            summary = f"Ngày {d} trên lịch chưa ghi nhận khoản chi nào (0đ)."
            return f"get_day_summary={day_info}", summary
        lines = [f"- {it['time']} | {it['merchant']} ({it['category']}): {_fmt_vnd(it['total'])}" for it in day_info["items"]]
        extra = ""
        if day_info["unknown_items"]:
            unk = ", ".join(f"{u['merchant']} ({_fmt_vnd(u['total'])})" for u in day_info["unknown_items"])
            extra = f" Lưu ý: có khoản gắn nhãn 'không rõ' ({unk}), bạn có thể bổ sung nhóm chi."
        note("trả chi tiết ngày theo ngày")
        summary = f"Chi tiêu ngày {d}: tổng {_fmt_vnd(day_info['total'])} ({day_info['count']} khoản):\n" + "\n".join(lines) + extra
        return f"get_day_summary={day_info}", summary

    note("dừng: câu hỏi thiếu mốc ngày hoặc tháng")
    summary = "Câu hỏi chưa rõ ngày hoặc tháng cần xem. Cho biết ngày (YYYY-MM-DD), tuần ISO (YYYY-WNN), tháng (YYYY-MM) hoặc năm."
    return "Thiếu tham số ngày/tháng hoặc hóa đơn.", summary


def _period_report(kind, keys, journal_path):
    label = {"week": "tuần", "month": "tháng", "year": "năm"}[kind]
    current = keys[0]
    if len(keys) >= 2:
        result = compare_periods(kind, current, keys[1], journal_path)
        main, former = result["current"], result["previous"]
        if not main["has_data"]:
            return result, f"Chưa có dữ liệu chi tiêu {label} {current}."
        if not former["has_data"]:
            return result, (
                f"{label.title()} {current} tổng chi {_fmt_vnd(main['total'])}. "
                f"Chưa có dữ liệu {label} {keys[1]} để so sánh."
            )
        ratio = "" if result["pct_diff"] is None else f", {result['pct_diff']:+}%"
        sign = "+" if result["diff"] >= 0 else ""
        biggest = main["by_category"][0]
        return result, (
            f"So sánh {current} với {keys[1]}: {current} chi {_fmt_vnd(main['total'])}, "
            f"{keys[1]} chi {_fmt_vnd(former['total'])} "
            f"(chênh lệch {sign}{_fmt_vnd(result['diff'])}{ratio}). "
            f"Nhóm cao nhất {current}: {biggest['category']} ({_fmt_vnd(biggest['total'])})."
        )

    data = aggregate_period(kind, current, journal_path)
    if not data["has_data"]:
        return data, f"Chưa có dữ liệu chi tiêu trong {label} {current}."
    top = data["top_day"]
    categories = ", ".join(
        f"{cat['category']}: {_fmt_vnd(cat['total'])} ({cat['pct']}%)"
        for cat in data["by_category"][:4]
    )
    return data, (
        f"Phân tích {label} {current}: tổng chi {_fmt_vnd(data['total'])} qua {data['count']} khoản "
        f"({data['active_days']} ngày có chi tiêu). Các nhóm chính: {categories}. "
        f"Ngày chi cao nhất: {top['date']} ({_fmt_vnd(top['total'])})."
    )


def answer(text: str, *, journal_path=None, capture_date=None, pending_receipt=None) -> dict:
    """CLI giữ bản xem nhanh giữa hai lượt. Eval mô phỏng nút Chốt bằng dòng riêng."""
    text = text.strip()
    if text.casefold() == "chốt":
        return {"output": _confirm_receipt(pending_receipt, journal_path), "pending_receipt": None}

    receipt_text, separator, action = text.rpartition("\n")
    confirm_in_eval = journal_path is None and separator and action.strip().casefold() == "chốt"
    if confirm_in_eval:
        text = receipt_text.strip()

    blocked = _check_safety_or_scope(text)
    if blocked:
        note("chặn bởi luật an toàn/phạm vi")
        output = {"output": blocked}
        if _is_receipt_input(text):
            output["pending_receipt"] = None
        return output

    edit = re.fullmatch(r"sửa\s+(tiền|nhóm)\s*:\s*(.+)", text, flags=re.IGNORECASE)
    if edit:
        return _edit_receipt(pending_receipt, edit.group(1).casefold(), edit.group(2).strip())

    if _is_receipt_input(text):
        preview, draft = _preview_receipt(text, capture_date)
        reply = call_model(SYSTEM, f"Thông tin đọc được từ OCR:\n{preview}")
        prefix = "[AI giả - CP2] " if reply["model"] == "fake" else ""
        if confirm_in_eval and draft is not None:
            result = _confirm_receipt(draft, journal_path)
            return {"output": f"{prefix}{preview}\n{result}", "pending_receipt": None}
        return {"output": prefix + preview, "pending_receipt": draft}

    context, summary = _build_context(text, journal_path)
    reply = call_model(SYSTEM, f"Căn cứ từ công cụ:\n{context}\n\nTóm tắt số liệu đã kiểm chứng:\n{summary}\n\nĐầu vào của người dùng:\n{text}")
    if reply["model"] == "fake":
        return {"output": f"[AI giả - CP2] {summary}"}
    # Số liệu hiển thị đến từ công cụ. Không dùng đoạn diễn giải nếu chưa hậu kiểm được.
    return {"output": summary}
