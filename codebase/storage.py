"""Quản lý thư mục CSDL cục bộ cho SkyBill (lưu ảnh hoá đơn và dữ liệu JSON dễ đọc)."""

import base64
import copy
import datetime
import json
import os
import re
import uuid

BaseCodeDirectory = os.path.dirname(os.path.abspath(__file__))
ProjectRootDirectory = os.path.dirname(BaseCodeDirectory)
StorageRootDirectory = os.path.join(ProjectRootDirectory, "CSDL")
ImagesRootDirectory = os.path.join(StorageRootDirectory, "images")
ReceiptsFilePath = os.path.join(StorageRootDirectory, "receipts.json")
DraftsFilePath = os.path.join(StorageRootDirectory, "drafts.json")

SeedReceiptRecords = [
    {
        "id": "HD-1001",
        "user_id": "default_user",
        "date": "2026-10-04",
        "time": "08:30",
        "merchant": "Tiệm Bánh Mẫu Sáng",
        "category": "Ăn uống",
        "source": "camera",
        "note": "Bữa sáng và cà phê",
        "image_path": "",
        "items": [
            {"name": "Bánh mì kẹp", "price": 35000},
            {"name": "Cà phê sữa đá", "price": 29000},
        ],
        "total": 64000,
    },
    {
        "id": "HD-1002",
        "user_id": "default_user",
        "date": "2026-10-10",
        "time": "19:15",
        "merchant": "Siêu Thị Xanh Mẫu",
        "category": "Mua sắm",
        "source": "upload",
        "note": "Đồ dùng cá nhân tháng 10",
        "image_path": "",
        "items": [
            {"name": "Nước giặt 2L", "price": 145000},
            {"name": "Khăn giấy & đồ bếp", "price": 95000},
        ],
        "total": 240000,
    },
    {
        "id": "HD-1003",
        "user_id": "default_user",
        "date": "2026-10-15",
        "time": "09:05",
        "merchant": "Điện Lực Mẫu Khu A",
        "category": "Hoá đơn & Tiện ích",
        "source": "upload",
        "note": "Hoá đơn điện tháng 10",
        "image_path": "",
        "items": [{"name": "Tiền điện sinh hoạt", "price": 420000}],
        "total": 420000,
    },
    {
        "id": "HD-1004",
        "user_id": "default_user",
        "date": "2026-10-21",
        "time": "18:40",
        "merchant": "Xe Công Nghệ Mẫu",
        "category": "Đi lại",
        "source": "upload",
        "note": "Đi học nhóm",
        "image_path": "",
        "items": [{"name": "Cước xe 2 chiều", "price": 88000}],
        "total": 88000,
    },
    {
        "id": "HD-1005",
        "user_id": "default_user",
        "date": "2026-10-27",
        "time": "20:00",
        "merchant": "Rạp Chiếu Phim Mẫu",
        "category": "Giải trí",
        "source": "camera",
        "note": "Xem phim cuối tháng",
        "image_path": "",
        "items": [
            {"name": "Vé xem phim", "price": 95000},
            {"name": "Nước suối", "price": 20000},
        ],
        "total": 115000,
    },
    {
        "id": "HD-1006",
        "user_id": "default_user",
        "date": "2026-10-30",
        "time": "12:20",
        "merchant": "Cơm Trưa Văn Phòng Mẫu",
        "category": "Ăn uống",
        "source": "camera",
        "note": "Ăn trưa",
        "image_path": "",
        "items": [{"name": "Cơm phần + canh", "price": 52000}],
        "total": 52000,
    },
    {
        "id": "HD-1101",
        "user_id": "default_user",
        "date": "2026-11-03",
        "time": "12:15",
        "merchant": "Bếp Cơm Mẫu 01",
        "category": "Ăn uống",
        "source": "camera",
        "note": "Cơm trưa",
        "image_path": "",
        "items": [{"name": "Suất cơm trưa", "price": 48000}],
        "total": 48000,
    },
    {
        "id": "HD-1102",
        "user_id": "default_user",
        "date": "2026-11-08",
        "time": "17:20",
        "merchant": "Nhà Thuốc Mẫu An Tâm",
        "category": "Sức khoẻ",
        "source": "camera",
        "note": "Mua vitamin & khẩu trang",
        "image_path": "",
        "items": [
            {"name": "Vitamin C", "price": 85000},
            {"name": "Hộp khẩu trang", "price": 45000},
        ],
        "total": 130000,
    },
    {
        "id": "HD-1103",
        "user_id": "default_user",
        "date": "2026-11-15",
        "time": "10:10",
        "merchant": "Internet & Điện Mẫu",
        "category": "Hoá đơn & Tiện ích",
        "source": "upload",
        "note": "Thanh toán từ app ngân hàng",
        "image_path": "",
        "items": [
            {"name": "Tiền điện tháng 11", "price": 390000},
            {"name": "Cước Internet", "price": 180000},
        ],
        "total": 570000,
    },
    {
        "id": "HD-1104",
        "user_id": "default_user",
        "date": "2026-11-20",
        "time": "08:15",
        "merchant": "Quán Cà Phê Bầu Trời",
        "category": "Ăn uống",
        "source": "camera",
        "note": "Cà phê sáng",
        "image_path": "",
        "items": [{"name": "Bạc xỉu đá", "price": 39000}],
        "total": 39000,
    },
    {
        "id": "HD-1105",
        "user_id": "default_user",
        "date": "2026-11-20",
        "time": "19:45",
        "merchant": "Siêu Thị Mini Mẫu B",
        "category": "Mua sắm",
        "source": "upload",
        "note": "Mua thêm đồ dùng cuối tuần",
        "image_path": "",
        "items": [
            {"name": "Sữa tươi 1L", "price": 38000},
            {"name": "Bình giữ nhiệt", "price": 195000},
        ],
        "total": 233000,
    },
    {
        "id": "HD-1106",
        "user_id": "default_user",
        "date": "2026-11-23",
        "time": "12:30",
        "merchant": "Quán Bún Mẫu Hà Nội",
        "category": "Ăn uống",
        "source": "camera",
        "note": "Ăn trưa",
        "image_path": "",
        "items": [{"name": "Bún chả đặc biệt", "price": 55000}],
        "total": 55000,
    },
    {
        "id": "HD-1107",
        "user_id": "default_user",
        "date": "2026-11-24",
        "time": "08:05",
        "merchant": "Xe Bus & Metro Mẫu",
        "category": "Đi lại",
        "source": "upload",
        "note": "Nạp vé tháng",
        "image_path": "",
        "items": [{"name": "Vé đi lại tuần", "price": 110000}],
        "total": 110000,
    },
    {
        "id": "HD-1108",
        "user_id": "default_user",
        "date": "2026-11-25",
        "time": "20:10",
        "merchant": "Lẩu Nướng Mẫu Nhóm",
        "category": "Ăn uống",
        "source": "camera",
        "note": "Liên hoan nhóm học",
        "image_path": "",
        "items": [
            {"name": "Phần ăn chia nhóm", "price": 185000},
            {"name": "Trà chanh", "price": 25000},
        ],
        "total": 210000,
    },
    {
        "id": "HD-1109",
        "user_id": "default_user",
        "date": "2026-11-26",
        "time": "09:15",
        "merchant": "Tiệm Trà Mẫu Sáng",
        "category": "Ăn uống",
        "source": "camera",
        "note": "Đồ uống sáng",
        "image_path": "",
        "items": [{"name": "Trà sữa ít đường", "price": 42000}],
        "total": 42000,
    },
    {
        "id": "HD-1110",
        "user_id": "default_user",
        "date": "2026-11-26",
        "time": "18:30",
        "merchant": "Nhà Sách Mẫu Tri Thức",
        "category": "Mua sắm",
        "source": "upload",
        "note": "Mua sổ ghi chép và bút",
        "image_path": "",
        "items": [
            {"name": "Sổ tay bìa cứng", "price": 78000},
            {"name": "Bộ bút xanh", "price": 42000},
        ],
        "total": 120000,
    },
    {
        "id": "HD-1111",
        "user_id": "default_user",
        "date": "2026-11-27",
        "time": "12:05",
        "merchant": "Quán Cơm Gà Mẫu",
        "category": "Ăn uống",
        "source": "camera",
        "note": "Ăn trưa hôm nay",
        "image_path": "",
        "items": [
            {"name": "Cơm gà xé", "price": 48000},
            {"name": "Nước cam ép", "price": 22000},
        ],
        "total": 70000,
    },
]

SafeDatePattern = re.compile(r"^\d{4}-\d{2}-\d{2}$")
DataUrlPattern = re.compile(r"^data:image/([a-zA-Z0-9+.-]+);base64,(.+)$", re.DOTALL)


def _WriteJsonAtomic(TargetFilePath: str, PayloadData: object) -> None:
    """Ghi file JSON UTF-8 định dạng dễ đọc qua file tạm để tránh hỏng dữ liệu."""
    TempFilePath = TargetFilePath + ".tmp"
    with open(TempFilePath, "w", encoding="utf-8") as OutputStream:
        json.dump(PayloadData, OutputStream, ensure_ascii=False, indent=2)
    os.replace(TempFilePath, TargetFilePath)


def _ReadJsonList(TargetFilePath: str) -> list:
    """Đọc danh sách JSON từ file; trả về [] nếu lỗi hoặc không phải list."""
    if not os.path.exists(TargetFilePath):
        return []
    try:
        with open(TargetFilePath, "r", encoding="utf-8") as InputStream:
            ParsedData = json.load(InputStream)
        return ParsedData if isinstance(ParsedData, list) else []
    except Exception:
        return []


def EnsureStorageLayout() -> None:
    """Tạo thư mục CSDL/, CSDL/images/ và các file JSON mặc định nếu chưa có."""
    os.makedirs(ImagesRootDirectory, exist_ok=True)
    if not os.path.exists(ReceiptsFilePath):
        _WriteJsonAtomic(ReceiptsFilePath, copy.deepcopy(SeedReceiptRecords))
    if not os.path.exists(DraftsFilePath):
        _WriteJsonAtomic(DraftsFilePath, [])


def LoadReceiptRecords(UserId: str = "default_user") -> list:
    """Nạp toàn bộ hoá đơn đã xác nhận từ CSDL/receipts.json theo UserId."""
    EnsureStorageLayout()
    AllRecords = _ReadJsonList(ReceiptsFilePath)
    if not UserId:
        return AllRecords
    FilteredRecords = [
        ReceiptItem
        for ReceiptItem in AllRecords
        if ReceiptItem.get("user_id", "default_user") == UserId
    ]
    return FilteredRecords


def SaveReceiptRecords(ReceiptList: list) -> None:
    """Lưu toàn bộ danh sách hoá đơn vào CSDL/receipts.json."""
    EnsureStorageLayout()
    _WriteJsonAtomic(ReceiptsFilePath, ReceiptList)


def ResetDemoReceiptRecords() -> list:
    """Khôi phục dữ liệu mẫu synthetic trong CSDL/receipts.json."""
    EnsureStorageLayout()
    FreshRecords = copy.deepcopy(SeedReceiptRecords)
    _WriteJsonAtomic(ReceiptsFilePath, FreshRecords)
    return FreshRecords


def LoadDraftRecords() -> list:
    """Nạp danh sách bản nháp từ CSDL/drafts.json."""
    EnsureStorageLayout()
    return _ReadJsonList(DraftsFilePath)


def SaveDraftRecords(DraftList: list) -> None:
    """Lưu danh sách bản nháp vào CSDL/drafts.json."""
    EnsureStorageLayout()
    _WriteJsonAtomic(DraftsFilePath, DraftList)


def SaveBase64ReceiptImage(ImageDataUrl: str, TargetDate: str, RecordId: str) -> tuple:
    """Giải mã ảnh base64 từ giao diện và lưu vào CSDL/images/YYYY-MM-DD/<RecordId>.<ext>."""
    EnsureStorageLayout()
    SafeDate = TargetDate if SafeDatePattern.match(str(TargetDate or "")) else datetime.date.today().isoformat()
    SafeRecordId = re.sub(r"[^A-Za-z0-9_-]", "", str(RecordId or "")) or uuid.uuid4().hex[:10]

    MatchResult = DataUrlPattern.match(str(ImageDataUrl or "").strip())
    if MatchResult:
        ImageSubtype = MatchResult.group(1).lower()
        Base64Body = MatchResult.group(2)
    else:
        ImageSubtype = "jpeg"
        Base64Body = str(ImageDataUrl or "").strip()

    ExtensionMap = {"jpeg": "jpg", "jpg": "jpg", "png": "png", "webp": "webp"}
    FileExtension = ExtensionMap.get(ImageSubtype, "jpg")
    ImageRawBytes = base64.b64decode(Base64Body)

    DateDirectory = os.path.join(ImagesRootDirectory, SafeDate)
    os.makedirs(DateDirectory, exist_ok=True)
    FileName = "%s.%s" % (SafeRecordId, FileExtension)
    TargetAbsolutePath = os.path.join(DateDirectory, FileName)
    with open(TargetAbsolutePath, "wb") as ImageOutputStream:
        ImageOutputStream.write(ImageRawBytes)

    RelativeImagePath = "%s/%s" % (SafeDate, FileName)
    return RelativeImagePath, ImageRawBytes


def UpsertDraftRecord(DraftRecord: dict) -> dict:
    """Lưu hoặc cập nhật một bản nháp vào CSDL/drafts.json."""
    DraftList = LoadDraftRecords()
    DraftId = DraftRecord.get("draft_id")
    UpdatedList = [Item for Item in DraftList if Item.get("draft_id") != DraftId]
    UpdatedList.append(DraftRecord)
    SaveDraftRecords(UpdatedList)
    return DraftRecord


def ConfirmDraftToLedger(ConfirmPayload: dict) -> dict:
    """Chuyển bản nháp đã được người dùng duyệt thành hoá đơn chính thức trong CSDL/receipts.json."""
    EnsureStorageLayout()
    AllRecords = _ReadJsonList(ReceiptsFilePath)
    DraftList = LoadDraftRecords()

    DraftId = str(ConfirmPayload.get("draft_id") or "").strip()
    MatchedDraft = None
    if DraftId:
        for DraftItem in DraftList:
            if DraftItem.get("draft_id") == DraftId:
                MatchedDraft = DraftItem
                break

    RawItems = ConfirmPayload.get("items") or (MatchedDraft.get("items") if MatchedDraft else []) or []
    NormalizedItems = []
    CalculatedTotal = 0
    for ItemEntry in RawItems:
        ItemName = str(ItemEntry.get("name") or "").strip()
        ItemPrice = int(round(float(ItemEntry.get("price") or 0)))
        if ItemName:
            NormalizedItems.append({"name": ItemName, "price": ItemPrice})
            CalculatedTotal += ItemPrice

    TargetDate = str(ConfirmPayload.get("date") or (MatchedDraft.get("date") if MatchedDraft else "") or datetime.date.today().isoformat())
    CurrentTimeStr = datetime.datetime.now().strftime("%H:%M")
    ImagePath = str(ConfirmPayload.get("image_path") or (MatchedDraft.get("image_path") if MatchedDraft else "") or "")

    NewReceiptId = "HD-" + uuid.uuid4().hex[:6].upper()
    NewReceipt = {
        "id": NewReceiptId,
        "user_id": str(ConfirmPayload.get("user_id") or "default_user"),
        "date": TargetDate,
        "time": str(ConfirmPayload.get("time") or CurrentTimeStr),
        "merchant": str(ConfirmPayload.get("merchant") or "Chưa rõ cửa hàng").strip(),
        "category": str(ConfirmPayload.get("category") or "Khác").strip(),
        "source": str(ConfirmPayload.get("source") or (MatchedDraft.get("source") if MatchedDraft else "camera")),
        "note": str(ConfirmPayload.get("note") or "").strip(),
        "image_path": ImagePath,
        "items": NormalizedItems,
        "total": CalculatedTotal,
        "ocr_engine": (MatchedDraft or {}).get("ocr_engine", ""),
        "quality_score": (MatchedDraft or {}).get("quality_score"),
        "created_at": datetime.datetime.now().isoformat(timespec="seconds"),
    }

    AllRecords.append(NewReceipt)
    SaveReceiptRecords(AllRecords)

    if DraftId:
        RemainingDrafts = [DraftItem for DraftItem in DraftList if DraftItem.get("draft_id") != DraftId]
        SaveDraftRecords(RemainingDrafts)

    return NewReceipt


def UpdateReceiptRecord(ReceiptId: str, UpdatePayload: dict) -> dict | None:
    """Cập nhật danh mục hoặc ghi chú của một hoá đơn trong CSDL/receipts.json."""
    EnsureStorageLayout()
    AllRecords = _ReadJsonList(ReceiptsFilePath)
    UpdatedRecord = None
    for ReceiptItem in AllRecords:
        if ReceiptItem.get("id") == ReceiptId:
            if "category" in UpdatePayload and UpdatePayload["category"]:
                ReceiptItem["category"] = str(UpdatePayload["category"]).strip()
            if "note" in UpdatePayload:
                ReceiptItem["note"] = str(UpdatePayload["note"] or "").strip()
            UpdatedRecord = ReceiptItem
            break
    if UpdatedRecord is not None:
        SaveReceiptRecords(AllRecords)
    return UpdatedRecord


def DeleteReceiptRecord(ReceiptId: str) -> bool:
    """Xoá một hoá đơn khỏi CSDL/receipts.json theo ReceiptId."""
    EnsureStorageLayout()
    AllRecords = _ReadJsonList(ReceiptsFilePath)
    RemainingRecords = [ReceiptItem for ReceiptItem in AllRecords if ReceiptItem.get("id") != ReceiptId]
    if len(RemainingRecords) == len(AllRecords):
        return False
    SaveReceiptRecords(RemainingRecords)
    return True


def ResolveImageAbsolutePath(RelativePath: str) -> str | None:
    """Chuyển đổi đường dẫn tương đối thành đường dẫn tuyệt đối an toàn bên trong CSDL/images/."""
    CleanRelative = str(RelativePath or "").lstrip("/\\")
    if not CleanRelative:
        return None
    CandidatePath = os.path.abspath(os.path.join(ImagesRootDirectory, CleanRelative))
    ImagesRootAbsolute = os.path.abspath(ImagesRootDirectory)
    if not CandidatePath.startswith(ImagesRootAbsolute + os.sep):
        return None
    return CandidatePath if os.path.isfile(CandidatePath) else None
