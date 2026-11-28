"""Các công cụ nghiệp vụ của SkyBill khớp spec.md §4 (bản chạy thử Track E).

Mỗi công cụ đều dùng @tool từ tracing.py và có docstring đủ 4 ý:
    tên · input · output · có tác động ra ngoài không.
Toàn bộ phép cộng, lọc, tổng hợp, so sánh kỳ chạy 100% bằng code trên CSDL/receipts.json.
"""

import calendar
import datetime
import uuid

import storage as StorageModule
from tracing import tool, TOOLS  # noqa: F401

StandardCategories = [
    "Ăn uống",
    "Đi lại",
    "Mua sắm",
    "Hoá đơn & Tiện ích",
    "Giải trí",
    "Sức khoẻ",
    "Khác",
]


def _CalculateWeekBounds(AnchorDateIso: str) -> tuple:
    """Tính ngày đầu tuần (Thứ Hai) và cuối tuần (Chủ Nhật) cho mốc ngày YYYY-MM-DD."""
    AnchorDateObj = datetime.date.fromisoformat(AnchorDateIso)
    WeekdayOffset = AnchorDateObj.weekday()
    StartDateObj = AnchorDateObj - datetime.timedelta(days=WeekdayOffset)
    EndDateObj = StartDateObj + datetime.timedelta(days=6)
    return StartDateObj.isoformat(), EndDateObj.isoformat()


def _ResolvePeriodBounds(PeriodType: str, PeriodKey: str) -> tuple:
    """Quy đổi (PeriodType, PeriodKey) thành (StartIso, EndIso, PeriodLabel)."""
    NormalizedType = str(PeriodType or "month").strip().lower()
    CleanKey = str(PeriodKey or "").strip()

    if NormalizedType == "week":
        AnchorDate = CleanKey if len(CleanKey) == 10 else datetime.date.today().isoformat()
        StartIso, EndIso = _CalculateWeekBounds(AnchorDate)
        return StartIso, EndIso, "Tuần %s → %s" % (StartIso, EndIso)

    if NormalizedType == "year":
        TargetYear = int(CleanKey[:4]) if len(CleanKey) >= 4 and CleanKey[:4].isdigit() else datetime.date.today().year
        return "%04d-01-01" % TargetYear, "%04d-12-31" % TargetYear, "Năm %04d" % TargetYear

    # Mặc định: month (chấp nhận YYYY-MM hoặc YYYY-MM-DD)
    if len(CleanKey) >= 7 and CleanKey[:4].isdigit() and CleanKey[5:7].isdigit():
        TargetYear = int(CleanKey[:4])
        TargetMonth = int(CleanKey[5:7])
    else:
        TodayDate = datetime.date.today()
        TargetYear = TodayDate.year
        TargetMonth = TodayDate.month
    LastDayOfMonth = calendar.monthrange(TargetYear, TargetMonth)[1]
    StartIso = "%04d-%02d-01" % (TargetYear, TargetMonth)
    EndIso = "%04d-%02d-%02d" % (TargetYear, TargetMonth, LastDayOfMonth)
    return StartIso, EndIso, "Tháng %02d/%04d" % (TargetMonth, TargetYear)


@tool
def validate_receipt(ReceiptPayload: dict) -> dict:
    """validate_receipt: Kiểm tra số học, trường thiếu và trùng lặp của hoá đơn trích xuất.
    Input: ReceiptPayload (dict). Output: dict {valid, missing_fields, total_mismatch, duplicate_flag, warnings, calculated_total}. Không tác động ra ngoài."""
    MissingFields = []
    WarningsList = []

    MerchantName = str(ReceiptPayload.get("merchant") or "").strip()
    ReceiptDate = str(ReceiptPayload.get("date") or "").strip()
    LineItems = ReceiptPayload.get("items") or []
    PrintedTotal = int(round(float(ReceiptPayload.get("printed_total") or 0)))

    if not MerchantName or MerchantName == "không rõ":
        MissingFields.append("merchant")
    if not ReceiptDate:
        MissingFields.append("date")
    if not isinstance(LineItems, list) or len(LineItems) == 0:
        MissingFields.append("items")

    CalculatedTotal = 0
    HasUnclearItem = False
    for LineItem in LineItems:
        ItemName = str(LineItem.get("name") or "").strip()
        ItemPrice = int(round(float(LineItem.get("price") or 0)))
        CalculatedTotal += ItemPrice
        if not ItemName or "không rõ" in ItemName.lower() or ItemPrice <= 0:
            HasUnclearItem = True

    if HasUnclearItem:
        MissingFields.append("item_details")
        WarningsList.append("Có dòng món hoặc số tiền bị mờ/chưa rõ (G10 — cần người dùng kiểm tra).")

    TotalMismatch = False
    if PrintedTotal > 0 and CalculatedTotal > 0 and abs(PrintedTotal - CalculatedTotal) > 1000:
        TotalMismatch = True
        WarningsList.append(
            "Tổng các món (%s đ) lệch với tổng in trên hoá đơn (%s đ)."
            % (format(CalculatedTotal, ","), format(PrintedTotal, ","))
        )

    QualityReport = ReceiptPayload.get("quality_report") or {}
    if QualityReport.get("quality_status") == "fail":
        WarningsList.append(
            "Ảnh hoá đơn chưa đạt chất lượng (%s) — khuyến nghị kiểm tra hoặc chụp lại."
            % ", ".join(QualityReport.get("reasons") or ["LOW_QUALITY"])
        )

    ExistingReceipts = StorageModule.LoadReceiptRecords(str(ReceiptPayload.get("user_id") or "default_user"))
    DuplicateFlag = False
    for ExistingItem in ExistingReceipts:
        SameDate = ExistingItem.get("date") == ReceiptDate
        SameMerchant = str(ExistingItem.get("merchant") or "").strip().lower() == MerchantName.lower()
        SameTotal = int(ExistingItem.get("total") or 0) == CalculatedTotal and CalculatedTotal > 0
        if SameDate and SameMerchant and SameTotal:
            DuplicateFlag = True
            WarningsList.append("Đã có hoá đơn trùng cửa hàng, ngày và số tiền trong CSDL.")
            break

    IsValid = bool(len(MissingFields) == 0 and CalculatedTotal > 0 and not TotalMismatch)
    return {
        "valid": IsValid,
        "missing_fields": MissingFields,
        "total_mismatch": TotalMismatch,
        "duplicate_flag": DuplicateFlag,
        "warnings": WarningsList,
        "calculated_total": CalculatedTotal,
        "printed_total": PrintedTotal,
    }


@tool
def draft_save_receipt(UserId: str, ReceiptDate: str, ReceiptPayload: dict) -> dict:
    """draft_save_receipt: Tạo bản nháp hoá đơn chờ người dùng xác nhận lưu vào sổ ngày.
    Input: UserId (str), ReceiptDate (str YYYY-MM-DD), ReceiptPayload (dict). Output: dict bản nháp DRAFT_PENDING_USER. Chỉ tạo bản nháp chờ người duyệt."""
    DraftId = str(ReceiptPayload.get("draft_id") or ("DRAFT-" + uuid.uuid4().hex[:8].upper()))
    LineItems = ReceiptPayload.get("items") or []
    CalculatedTotal = sum(int(round(float(LineItem.get("price") or 0))) for LineItem in LineItems)
    QualityReport = ReceiptPayload.get("quality_report") or {}

    DraftRecord = {
        "draft_id": DraftId,
        "status": "DRAFT_PENDING_USER",
        "requires_user_approval": True,
        "user_id": UserId or "default_user",
        "date": ReceiptDate,
        "merchant": str(ReceiptPayload.get("merchant") or "không rõ").strip(),
        "category": str(ReceiptPayload.get("category") or "Khác").strip(),
        "source": str(ReceiptPayload.get("source") or "camera"),
        "note": str(ReceiptPayload.get("note") or "").strip(),
        "image_path": str(ReceiptPayload.get("image_path") or ""),
        "items": [
            {
                "name": str(LineItem.get("name") or "").strip(),
                "price": int(round(float(LineItem.get("price") or 0))),
            }
            for LineItem in LineItems
        ],
        "calculated_total": CalculatedTotal,
        "printed_total": int(round(float(ReceiptPayload.get("printed_total") or 0))),
        "ocr_engine": str(ReceiptPayload.get("ocr_engine") or ""),
        "quality_score": QualityReport.get("overall_score"),
        "created_at": datetime.datetime.now().isoformat(timespec="seconds"),
    }
    StorageModule.UpsertDraftRecord(DraftRecord)
    return DraftRecord


@tool
def get_day_summary(UserId: str, TargetDate: str) -> dict:
    """get_day_summary: Đọc và tổng kết hoá đơn của một ngày cụ thể từ CSDL bằng code.
    Input: UserId (str), TargetDate (str YYYY-MM-DD). Output: dict số hoá đơn, danh sách chi tiết, tổng tiền và bảng theo danh mục. Không tác động ra ngoài."""
    AllReceipts = StorageModule.LoadReceiptRecords(UserId)
    DayReceipts = [ReceiptItem for ReceiptItem in AllReceipts if ReceiptItem.get("date") == TargetDate]
    DayTotal = sum(int(ReceiptItem.get("total") or 0) for ReceiptItem in DayReceipts)

    CategoryTotals = {}
    for ReceiptItem in DayReceipts:
        CategoryName = str(ReceiptItem.get("category") or "Khác")
        CategoryTotals[CategoryName] = CategoryTotals.get(CategoryName, 0) + int(ReceiptItem.get("total") or 0)

    CategoryBreakdown = [
        {
            "category": CategoryName,
            "amount": AmountValue,
            "share_pct": round((AmountValue / float(DayTotal)) * 100.0, 1) if DayTotal > 0 else 0.0,
        }
        for CategoryName, AmountValue in sorted(CategoryTotals.items(), key=lambda PairItem: PairItem[1], reverse=True)
    ]

    return {
        "date": TargetDate,
        "receipt_count": len(DayReceipts),
        "total_spend": DayTotal,
        "category_breakdown": CategoryBreakdown,
        "receipts": DayReceipts,
    }


@tool
def aggregate_period(UserId: str, PeriodType: str, PeriodKey: str) -> dict:
    """aggregate_period: Tổng hợp chi tiêu theo tuần, tháng hoặc năm bằng code từ CSDL.
    Input: UserId (str), PeriodType ('week'|'month'|'year'), PeriodKey (str). Output: dict tổng chi, số hoá đơn, tỷ trọng danh mục và top khoản chi. Không tác động ra ngoài."""
    StartIso, EndIso, PeriodLabel = _ResolvePeriodBounds(PeriodType, PeriodKey)
    AllReceipts = StorageModule.LoadReceiptRecords(UserId)
    PeriodReceipts = [
        ReceiptItem
        for ReceiptItem in AllReceipts
        if StartIso <= str(ReceiptItem.get("date") or "") <= EndIso
    ]

    TotalSpend = sum(int(ReceiptItem.get("total") or 0) for ReceiptItem in PeriodReceipts)
    ActiveDates = sorted({str(ReceiptItem.get("date") or "") for ReceiptItem in PeriodReceipts if ReceiptItem.get("date")})

    CategoryTotals = {CategoryName: 0 for CategoryName in StandardCategories}
    for ReceiptItem in PeriodReceipts:
        CategoryName = str(ReceiptItem.get("category") or "Khác")
        if CategoryName not in CategoryTotals:
            CategoryTotals[CategoryName] = 0
        CategoryTotals[CategoryName] += int(ReceiptItem.get("total") or 0)

    CategorySummary = [
        {
            "category": CategoryName,
            "amount": AmountValue,
            "share_pct": round((AmountValue / float(TotalSpend)) * 100.0, 1) if TotalSpend > 0 else 0.0,
        }
        for CategoryName, AmountValue in sorted(CategoryTotals.items(), key=lambda PairItem: PairItem[1], reverse=True)
        if AmountValue > 0
    ]

    TopExpenses = sorted(PeriodReceipts, key=lambda ReceiptItem: int(ReceiptItem.get("total") or 0), reverse=True)[:3]
    TopExpensesCompact = [
        {
            "id": ExpenseItem.get("id"),
            "date": ExpenseItem.get("date"),
            "merchant": ExpenseItem.get("merchant"),
            "category": ExpenseItem.get("category"),
            "total": ExpenseItem.get("total"),
        }
        for ExpenseItem in TopExpenses
    ]

    DailyAverage = int(round(TotalSpend / float(len(ActiveDates)))) if ActiveDates else 0
    return {
        "period_type": PeriodType,
        "period_key": PeriodKey,
        "period_label": PeriodLabel,
        "start_date": StartIso,
        "end_date": EndIso,
        "receipt_count": len(PeriodReceipts),
        "active_days": len(ActiveDates),
        "total_spend": TotalSpend,
        "daily_average": DailyAverage,
        "categories": CategorySummary,
        "top_expenses": TopExpensesCompact,
    }


@tool
def compare_periods(UserId: str, PeriodType: str, CurrentKey: str, PreviousKey: str) -> dict:
    """compare_periods: So sánh chi tiêu giữa kỳ hiện tại và kỳ trước đó bằng code.
    Input: UserId (str), PeriodType ('week'|'month'|'year'), CurrentKey (str), PreviousKey (str). Output: dict chênh lệch tổng tiền, % tăng/giảm và biến động theo từng danh mục. Không tác động ra ngoài."""
    CurrentSummary = aggregate_period(UserId, PeriodType, CurrentKey)
    PreviousSummary = aggregate_period(UserId, PeriodType, PreviousKey)

    CurrentTotal = int(CurrentSummary["total_spend"])
    PreviousTotal = int(PreviousSummary["total_spend"])
    DeltaAmount = CurrentTotal - PreviousTotal
    DeltaPct = round((DeltaAmount / float(PreviousTotal)) * 100.0, 1) if PreviousTotal > 0 else None

    CurrentCategoryMap = {Row["category"]: Row["amount"] for Row in CurrentSummary["categories"]}
    PreviousCategoryMap = {Row["category"]: Row["amount"] for Row in PreviousSummary["categories"]}
    AllCategoryNames = sorted(set(CurrentCategoryMap.keys()) | set(PreviousCategoryMap.keys()))

    CategoryDeltas = []
    for CategoryName in AllCategoryNames:
        CurrentAmount = int(CurrentCategoryMap.get(CategoryName, 0))
        PreviousAmount = int(PreviousCategoryMap.get(CategoryName, 0))
        CategoryDeltas.append(
            {
                "category": CategoryName,
                "current_amount": CurrentAmount,
                "previous_amount": PreviousAmount,
                "delta_amount": CurrentAmount - PreviousAmount,
            }
        )
    CategoryDeltas.sort(key=lambda DeltaRow: abs(DeltaRow["delta_amount"]), reverse=True)

    StrongestShift = CategoryDeltas[0] if CategoryDeltas else None
    return {
        "period_type": PeriodType,
        "current": CurrentSummary,
        "previous": PreviousSummary,
        "delta_amount": DeltaAmount,
        "delta_pct": DeltaPct,
        "category_deltas": CategoryDeltas,
        "strongest_shift": StrongestShift,
    }
