"""Luồng xử lý AI chính của SkyBill khớp spec.md §4 (Track E — Tài chính cá nhân).

`python run.py`, `python run.py eval` và `python run.py simulate` đều gọi answer(UserInputText).
Luồng cố định có rẽ nhánh:
    Bước 4: Bộ lọc phạm vi & an toàn bằng code (từ chối đầu tư, OTP/số thẻ, dữ liệu người khác).
    Bước 5: Gọi công cụ chỉ đọc tính 100% bằng code từ CSDL/receipts.json.
    Bước 6: Gọi call_model(SystemPrompt, UserPrompt) diễn giải xu hướng trung lập từ JSON công cụ.
    Bước 7: Hậu kiểm khớp số học với output công cụ và che thông tin nhạy cảm.
"""

import calendar
import datetime
import json
import os
import re
import sys

BaseCodeDirectory = os.path.dirname(os.path.abspath(__file__))
if BaseCodeDirectory not in sys.path:
    sys.path.insert(0, BaseCodeDirectory)

from ai import call_model
import tools as ReceiptTools
from tracing import note

MaxSteps = 5

SystemPrompt = (
    "Bạn là trợ lý phân tích chi tiêu cá nhân SkyBill (Track E).\n"
    "Quy tắc bắt buộc:\n"
    "1. Mọi con số phải lấy chính xác 100% từ dữ liệu JSON do công cụ tính toán cung cấp; tuyệt đối không tự cộng trừ hay bịa số.\n"
    "2. Nếu kỳ được hỏi chưa có hoá đơn (receipt_count == 0), trả lời rõ là chưa có dữ liệu (G10), không tự ước lượng.\n"
    "3. Diễn giải xu hướng trung lập, không phán xét; trích dẫn cụ thể tên danh mục và khoản chi từ công cụ (G11).\n"
    "4. Không tư vấn đầu tư, không hỏi hay lặp lại OTP, mật khẩu, số thẻ đầy đủ; không trả lời dữ liệu của người khác."
)

OutOfScopeInvestmentPattern = re.compile(
    r"(cổ\s*phiếu|chứng\s*khoán|crypto|bitcoin|tiền\s*ảo|đầu\s*tư|trái\s*phiếu|lãi\s*suất|vay\s*tiền|ngoại\s*hối)",
    re.IGNORECASE,
)
SensitiveCredentialPattern = re.compile(
    r"(\botp\b|mật\s*khẩu|mã\s*pin|số\s*thẻ|\bcvv\b|\bcvc\b)",
    re.IGNORECASE,
)
OtherPersonPattern = re.compile(
    r"(người\s*khác|của\s*bạn\s*tôi|của\s*sếp|của\s*anh\s*ấy|của\s*chị\s*ấy|người\s*khác\s*tiêu)",
    re.IGNORECASE,
)
LongCardDigitsPattern = re.compile(r"\b\d{12,19}\b")
IsoDateInTextPattern = re.compile(r"\b(\d{4}-\d{2}-\d{2})\b")
SlashDateInTextPattern = re.compile(r"\b(\d{1,2})/(\d{1,2})/(\d{4})\b")
MonthYearInTextPattern = re.compile(r"tháng\s*(\d{1,2})(?:\s*/\s*|\s+năm\s+)(\d{4})", re.IGNORECASE)
MonthOnlyInTextPattern = re.compile(r"tháng\s*(\d{1,2})\b", re.IGNORECASE)
YearInTextPattern = re.compile(r"năm\s*(\d{4})\b", re.IGNORECASE)


def _FormatVndText(AmountValue: int) -> str:
    """Định dạng số nguyên VND có dấu chấm phân cách hàng nghìn."""
    return "{:,}".format(int(AmountValue)).replace(",", ".") + " đ"


def _PreviousMonthKey(YearValue: int, MonthValue: int) -> str:
    """Trả về YYYY-MM của tháng liền trước."""
    if MonthValue == 1:
        return "%04d-12" % (YearValue - 1)
    return "%04d-%02d" % (YearValue, MonthValue - 1)


def _DetectOutOfScopeReason(UserInputText: str) -> str:
    """Bước 4: Bộ lọc phạm vi & an toàn bằng code trước khi tra dữ liệu hoặc gọi LLM."""
    CleanText = str(UserInputText or "")
    if OutOfScopeInvestmentPattern.search(CleanText):
        return (
            "Ngoài phạm vi hỗ trợ (Track E): SkyBill chỉ tổng hợp và giải thích chi tiêu từ hoá đơn bạn đã lưu, "
            "không tư vấn đầu tư, chứng khoán, tiền ảo hay vay vốn."
        )
    if SensitiveCredentialPattern.search(CleanText) or LongCardDigitsPattern.search(CleanText):
        return (
            "Cảnh báo bảo mật (Track E): Hệ thống không thu thập, xử lý hay lặp lại mã OTP, mật khẩu, "
            "mã PIN hoặc số thẻ ngân hàng đầy đủ. Vui lòng không gửi thông tin này."
        )
    if OtherPersonPattern.search(CleanText):
        return (
            "Ngoài phạm vi quyền riêng tư: SkyBill chỉ tra cứu và phân tích lịch sử hoá đơn của chính bạn, "
            "không truy cập dữ liệu chi tiêu của người khác."
        )
    return ""


def _ExtractTargetDateIso(UserInputText: str) -> str:
    """Tìm ngày cụ thể trong câu hỏi (nếu người dùng hỏi chi tiết 1 ngày)."""
    IsoMatch = IsoDateInTextPattern.search(UserInputText)
    if IsoMatch:
        return IsoMatch.group(1)
    SlashMatch = SlashDateInTextPattern.search(UserInputText)
    if SlashMatch:
        DayPart = int(SlashMatch.group(1))
        MonthPart = int(SlashMatch.group(2))
        YearPart = int(SlashMatch.group(3))
        if 1 <= MonthPart <= 12 and 1 <= DayPart <= 31:
            return "%04d-%02d-%02d" % (YearPart, MonthPart, DayPart)
    return ""


def _ComputePeriodQueryPlan(UserInputText: str) -> dict:
    """Xác định công cụ và tham số kỳ thời gian phù hợp từ câu hỏi người dùng."""
    TodayDate = datetime.date.today()
    LowerText = str(UserInputText or "").lower()

    SpecificDate = _ExtractTargetDateIso(UserInputText)
    if SpecificDate and ("ngày" in LowerText or "hôm" in LowerText or "/" in UserInputText or "-" in UserInputText):
        return {"query_kind": "day", "target_date": SpecificDate}

    if "hôm nay" in LowerText:
        return {"query_kind": "day", "target_date": TodayDate.isoformat()}
    if "hôm qua" in LowerText:
        YesterdayDate = TodayDate - datetime.timedelta(days=1)
        return {"query_kind": "day", "target_date": YesterdayDate.isoformat()}

    if "tuần trước" in LowerText:
        LastWeekAnchor = (TodayDate - datetime.timedelta(days=7)).isoformat()
        TwoWeeksAgoAnchor = (TodayDate - datetime.timedelta(days=14)).isoformat()
        return {"query_kind": "compare", "period_type": "week", "current_key": LastWeekAnchor, "previous_key": TwoWeeksAgoAnchor}
    if "tuần" in LowerText:
        CurrentWeekAnchor = TodayDate.isoformat()
        PreviousWeekAnchor = (TodayDate - datetime.timedelta(days=7)).isoformat()
        return {"query_kind": "compare", "period_type": "week", "current_key": CurrentWeekAnchor, "previous_key": PreviousWeekAnchor}

    YearMatch = YearInTextPattern.search(UserInputText)
    if YearMatch and "tháng" not in LowerText:
        TargetYear = int(YearMatch.group(1))
        return {"query_kind": "compare", "period_type": "year", "current_key": str(TargetYear), "previous_key": str(TargetYear - 1)}
    if "năm nay" in LowerText:
        return {"query_kind": "compare", "period_type": "year", "current_key": str(TodayDate.year), "previous_key": str(TodayDate.year - 1)}

    MonthYearMatch = MonthYearInTextPattern.search(UserInputText)
    if MonthYearMatch:
        TargetMonth = min(12, max(1, int(MonthYearMatch.group(1))))
        TargetYear = int(MonthYearMatch.group(2))
        CurrentKey = "%04d-%02d" % (TargetYear, TargetMonth)
        return {"query_kind": "compare", "period_type": "month", "current_key": CurrentKey, "previous_key": _PreviousMonthKey(TargetYear, TargetMonth)}

    MonthOnlyMatch = MonthOnlyInTextPattern.search(UserInputText)
    if MonthOnlyMatch:
        TargetMonth = min(12, max(1, int(MonthOnlyMatch.group(1))))
        CurrentKey = "%04d-%02d" % (TodayDate.year, TargetMonth)
        return {"query_kind": "compare", "period_type": "month", "current_key": CurrentKey, "previous_key": _PreviousMonthKey(TodayDate.year, TargetMonth)}

    if "tháng trước" in LowerText:
        PrevMonthKey = _PreviousMonthKey(TodayDate.year, TodayDate.month)
        PrevYear = int(PrevMonthKey[:4])
        PrevMonth = int(PrevMonthKey[5:7])
        return {"query_kind": "compare", "period_type": "month", "current_key": PrevMonthKey, "previous_key": _PreviousMonthKey(PrevYear, PrevMonth)}

    CurrentMonthKey = "%04d-%02d" % (TodayDate.year, TodayDate.month)
    return {
        "query_kind": "compare",
        "period_type": "month",
        "current_key": CurrentMonthKey,
        "previous_key": _PreviousMonthKey(TodayDate.year, TodayDate.month),
    }


def _FormatDeterministicToolAnswer(QueryPlan: dict, ToolResult: dict) -> str:
    """Tổng hợp câu trả lời chính xác 100% từ output công cụ (dùng khi model giả hoặc làm nền đối chiếu)."""
    if QueryPlan["query_kind"] == "day":
        DayCount = int(ToolResult.get("receipt_count") or 0)
        DayTotal = int(ToolResult.get("total_spend") or 0)
        TargetDate = ToolResult.get("date")
        if DayCount == 0:
            return "Ngày %s chưa có hoá đơn nào được lưu trong CSDL (G10 — không tự ước lượng)." % TargetDate
        CategoryLines = [
            "- %s: %s (%s%%)" % (Row["category"], _FormatVndText(Row["amount"]), Row["share_pct"])
            for Row in ToolResult.get("category_breakdown", [])
        ]
        ReceiptLines = [
            "- %s (%s): %s" % (Item.get("merchant"), Item.get("category"), _FormatVndText(Item.get("total", 0)))
            for Item in ToolResult.get("receipts", [])
        ]
        return (
            "Tổng kết ngày %s: có %d hoá đơn, tổng chi %s.\n"
            "Bảng theo danh mục:\n%s\n"
            "Chi tiết hoá đơn:\n%s"
            % (TargetDate, DayCount, _FormatVndText(DayTotal), "\n".join(CategoryLines), "\n".join(ReceiptLines))
        )

    CurrentData = ToolResult["current"]
    PreviousData = ToolResult["previous"]
    CurrentCount = int(CurrentData.get("receipt_count") or 0)
    CurrentTotal = int(CurrentData.get("total_spend") or 0)
    PreviousTotal = int(PreviousData.get("total_spend") or 0)
    DeltaAmount = int(ToolResult.get("delta_amount") or 0)
    DeltaPct = ToolResult.get("delta_pct")

    if CurrentCount == 0:
        return (
            "Trong %s chưa có hoá đơn nào được lưu trong CSDL (G10 — hệ thống không tự ước lượng số liệu)."
            % CurrentData.get("period_label")
        )

    CategoriesList = CurrentData.get("categories") or []
    TopCategoryLine = (
        "%s (%s, chiếm %s%%)" % (CategoriesList[0]["category"], _FormatVndText(CategoriesList[0]["amount"]), CategoriesList[0]["share_pct"])
        if CategoriesList
        else "chưa xác định"
    )

    if int(PreviousData.get("receipt_count") or 0) > 0:
        DirectionWord = "tăng" if DeltaAmount > 0 else ("giảm" if DeltaAmount < 0 else "giữ nguyên")
        ComparisonLine = "So với %s (%s): %s %s (%s%%)." % (
            PreviousData.get("period_label"),
            _FormatVndText(PreviousTotal),
            DirectionWord,
            _FormatVndText(abs(DeltaAmount)),
            DeltaPct if DeltaPct is not None else 0,
        )
    else:
        ComparisonLine = "Kỳ trước (%s) chưa có dữ liệu hoá đơn để so sánh tăng/giảm." % PreviousData.get("period_label")

    StrongestShift = ToolResult.get("strongest_shift")
    ShiftLine = ""
    if StrongestShift and int(StrongestShift.get("delta_amount") or 0) != 0 and int(PreviousData.get("receipt_count") or 0) > 0:
        ShiftAmount = int(StrongestShift["delta_amount"])
        ShiftLine = "\nBiến động rõ nhất: nhóm %s (%s %s)." % (
            StrongestShift["category"],
            "tăng" if ShiftAmount > 0 else "giảm",
            _FormatVndText(abs(ShiftAmount)),
        )

    TopExpensesLines = [
        "- %s (%s): %s" % (Item.get("merchant"), Item.get("date"), _FormatVndText(Item.get("total", 0)))
        for Item in (CurrentData.get("top_expenses") or [])
    ]

    return (
        "Tổng kết %s: có %d hoá đơn trên %d ngày chi tiêu, tổng chi %s.\n"
        "Khoản chi lớn nhất: %s.\n"
        "%s%s\n"
        "Các hoá đơn nổi bật:\n%s"
        % (
            CurrentData.get("period_label"),
            CurrentCount,
            int(CurrentData.get("active_days") or 0),
            _FormatVndText(CurrentTotal),
            TopCategoryLine,
            ComparisonLine,
            ShiftLine,
            "\n".join(TopExpensesLines) if TopExpensesLines else "- Chưa có",
        )
    )


def _PostCheckResponse(RawResponseText: str, ExpectedTotalSpend: int, HasData: bool) -> str:
    """Bước 7: Hậu kiểm che chuỗi số nhạy cảm và đảm bảo tổng chi khớp output công cụ."""
    SanitizedText = LongCardDigitsPattern.sub("[đã ẩn dãy số nhạy cảm]", str(RawResponseText or ""))
    if HasData and ExpectedTotalSpend > 0:
        FormattedExpected = _FormatVndText(ExpectedTotalSpend)
        PlainDigits = str(ExpectedTotalSpend)
        if FormattedExpected not in SanitizedText and PlainDigits not in SanitizedText.replace(".", "").replace(",", ""):
            SanitizedText += "\n(Số liệu xác thực từ công cụ: Tổng chi %s.)" % FormattedExpected
    return SanitizedText


def answer(UserInputText: str) -> dict:
    """Điểm vào chính cho run.py, eval và web API /api/analyze."""
    RefusalMessage = _DetectOutOfScopeReason(UserInputText)
    if RefusalMessage:
        note("guardrail: out_of_scope_refused")
        return {"output": RefusalMessage}

    QueryPlan = _ComputePeriodQueryPlan(UserInputText)
    note("query_plan=%s" % json.dumps(QueryPlan, ensure_ascii=False))

    if QueryPlan["query_kind"] == "day":
        ToolResult = ReceiptTools.get_day_summary("default_user", QueryPlan["target_date"])
        HasData = int(ToolResult.get("receipt_count") or 0) > 0
        ExpectedTotal = int(ToolResult.get("total_spend") or 0)
    else:
        ToolResult = ReceiptTools.compare_periods(
            "default_user",
            QueryPlan["period_type"],
            QueryPlan["current_key"],
            QueryPlan["previous_key"],
        )
        HasData = int(ToolResult["current"].get("receipt_count") or 0) > 0
        ExpectedTotal = int(ToolResult["current"].get("total_spend") or 0)

    if not HasData:
        note("g10: empty_period_no_estimate")
        EmptyReply = _FormatDeterministicToolAnswer(QueryPlan, ToolResult)
        return {"output": EmptyReply}

    UserPrompt = (
        "Dữ liệu chi tiêu đã được tính chính xác 100%% bằng công cụ từ CSDL:\n"
        "%s\n\n"
        "Câu hỏi của người dùng: %s\n\n"
        "Hãy trả lời ngắn gọn, trung lập bằng tiếng Việt, nêu rõ các con số khớp với dữ liệu trên."
    ) % (json.dumps(ToolResult, ensure_ascii=False, indent=2), UserInputText)

    ModelReply = call_model(SystemPrompt, UserPrompt)
    if ModelReply.get("model") == "fake":
        DraftText = _FormatDeterministicToolAnswer(QueryPlan, ToolResult)
    else:
        DraftText = str(ModelReply.get("text") or "")

    FinalOutput = _PostCheckResponse(DraftText, ExpectedTotal, HasData)
    return {"output": FinalOutput}
