"""Luồng chính của ứng dụng AI nhận hóa đơn, lưu note ngày theo ngày và phân tích chi tiêu.

Hình dạng: Workflow cố định có bước chặn an toàn bằng code + phân luồng công cụ + gọi AI tổng hợp.
Mọi con số đều được tính trước bằng code trong codebase/tools.py; model không tự cộng trừ hay bịa số.
"""
import re

from ai import call_model
from tools import (
    analyze_spending,
    get_day_summary,
    get_month_calendar,
    parse_receipt_text,
    save_daily_note,
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
    low = (text or "").lower()
    return any(k in low for k in ("chụp hóa đơn", "chup hoa don", "hóa đơn", "hoa don", "tổng cộng", "tong cong", "gửi ảnh", "gui anh"))


def _build_context(text: str, journal_path=None, capture_date=None) -> tuple[str, str]:
    """Chạy công cụ theo luồng cố định, trả về (context_for_model, deterministic_summary)."""
    if _is_receipt_input(text):
        parsed = parse_receipt_text(text, capture_date)
        if parsed["missing_fields"]:
            missing = ", ".join(parsed["missing_fields"])
            note("dừng: thiếu trường hóa đơn (%s)" % missing)
            summary = f"Cần đọc lại hóa đơn: {missing}. Chưa ghi khoản chi. Hãy chụp lại rõ phần cần đọc."
            return f"Kết quả parse_receipt_text: {parsed}", summary

        saved = save_daily_note(parsed, text, journal_path)
        record = saved["record"]
        status = "Khoản đã có, không ghi trùng" if saved["duplicate"] else "Đã tự lưu khoản chi"
        date_label = " (ngày chụp)" if record.get("date_source") == "ngày chụp" else ""
        summary = (
            f"{status} ngày {record['date']}{date_label}: {record['merchant']} · "
            f"{_fmt_vnd(record['total'])} · nhóm {record['category']}. "
            f"Tổng chi ngày {record['date']}: {_fmt_vnd(saved['new_day_total'])} ({saved['new_day_count']} khoản)."
        )
        return f"parse_receipt_text={parsed}\nsave_daily_note={saved}", summary

    dates, months = _extract_dates_and_months(text)
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

    if len(months) >= 2:
        m1, m2 = months[0], months[1]
        analysis = analyze_spending(m1, compare_with=m2, journal_path=journal_path)
        if not analysis.get("has_data"):
            note("chưa có dữ liệu tháng chính")
            return f"analyze_spending={analysis}", f"Chưa có dữ liệu chi tiêu cho tháng {m1}."
        comp = analysis.get("comparison") or {}
        if not comp.get("other_total") and comp.get("has_data") is False:
            summary = f"Tháng {m1} tổng chi {_fmt_vnd(analysis['total'])}, nhưng chưa có dữ liệu tháng {m2} để so sánh."
        else:
            sign = "+" if comp["diff"] >= 0 else ""
            summary = (
                f"So sánh {m1} với {m2}: {m1} chi {_fmt_vnd(analysis['total'])}, "
                f"{m2} chi {_fmt_vnd(comp['other_total'])} "
                f"(chênh lệch {sign}{_fmt_vnd(comp['diff'])}, {sign}{comp['pct_diff']}%). "
                f"Nhóm cao nhất {m1}: {analysis['by_category'][0]['category']} ({_fmt_vnd(analysis['by_category'][0]['total'])})."
            )
        note("so sánh 2 tháng")
        return f"analyze_spending={analysis}", summary

    if len(months) == 1:
        ym = months[0]
        cal = get_month_calendar(ym, journal_path)
        analysis = analyze_spending(ym, journal_path=journal_path)
        if not analysis.get("has_data"):
            note("tháng chưa có dữ liệu")
            return f"get_month_calendar={cal}\nanalyze_spending={analysis}", f"Chưa có dữ liệu chi tiêu trong tháng {ym}."
        cats = ", ".join(f"{c['category']}: {_fmt_vnd(c['total'])} ({c['pct']}%)" for c in analysis["by_category"][:4])
        top = analysis["top_day"]
        note("phân tích chi tiêu tháng")
        summary = (
            f"Phân tích tháng {ym}: tổng chi {_fmt_vnd(analysis['total'])} qua {analysis['count']} khoản "
            f"({analysis['active_days']} ngày có chi tiêu). Các nhóm chính: {cats}. "
            f"Ngày chi cao nhất: {top['date']} ({_fmt_vnd(top['total'])})."
        )
        return f"get_month_calendar={cal}\nanalyze_spending={analysis}", summary

    note("dừng: câu hỏi thiếu mốc ngày hoặc tháng")
    summary = "Câu hỏi chưa rõ ngày hoặc tháng cần xem. Vui lòng cho biết cụ thể ngày (YYYY-MM-DD), tháng (YYYY-MM) hoặc gửi nội dung hóa đơn."
    return "Thiếu tham số ngày/tháng hoặc hóa đơn.", summary


def answer(text: str, *, journal_path=None, capture_date=None) -> dict:
    """Điểm vào duy nhất cho run.py, run.py eval và run.py simulate."""
    blocked = _check_safety_or_scope(text)
    if blocked:
        note("chặn bởi luật an toàn/phạm vi")
        return {"output": blocked}

    context, summary = _build_context(text, journal_path, capture_date)
    reply = call_model(SYSTEM, f"Căn cứ từ công cụ:\n{context}\n\nTóm tắt số liệu đã kiểm chứng:\n{summary}\n\nĐầu vào của người dùng:\n{text}")
    if reply["model"] == "fake":
        return {"output": f"[AI giả - CP2] {summary}"}
    return {"output": reply["text"]}
