"""Kiểm tra chất lượng ảnh hoá đơn (Quality Gate) và OCR tiếng Việt bằng ONNX Runtime.

Kế thừa trực tiếp thuật toán từ P-163 (quality.py + ocr.py) với trọng số:
- det.onnx (PaddleOCR PP-OCRv3 DBNet)
- viesvtr_v7.onnx (VieSVTR v7 CTC trên bảng chữ cái VietOCR 229 ký tự)
"""

import io
import math
import os
import re
import threading
import unicodedata

try:
    import cv2 as OpenCvLib
    import numpy as NumpyLib
    import onnxruntime as OnnxRuntime
    from PIL import Image
    OcrDependenciesAvailable = True
    OcrImportErrorMessage = ""
except Exception as ImportException:
    OpenCvLib = None
    NumpyLib = None
    OnnxRuntime = None
    Image = None
    OcrDependenciesAvailable = False
    OcrImportErrorMessage = "%s: %s" % (type(ImportException).__name__, ImportException)

DefaultWeightsDirectory = os.environ.get(
    "SKYBILL_OCR_WEIGHTS_DIR",
    r"E:\Personal_BuildPhase\P-163\data\weights\ocr-1\ppocrv3-viesvtr-v7",
)

# Bảng chữ cái VietOCR 229 ký tự (index 0 là CTC blank, ký tự thật bắt đầu từ index 1)
VietOcrVocabulary = (
    "aAàÀảẢãÃáÁạẠăĂằẰẳẲẵẴắẮặẶâÂầẦẩẨẫẪấẤậẬbBcCdDđĐeEèÈẻẺẽẼéÉẹẸêÊềỀểỂễỄếẾệỆ"
    "fFgGhHiIìÌỉỈĩĨíÍịỊjJkKlLmMnNoOòÒỏỎõÕóÓọỌôÔồỒổỔỗỖốỐộỘơƠờỜởỞỡỠớỚợỢpPqQrR"
    "sStTuUùÙủỦũŨúÚụỤưƯừỪửỬữỮứỨựỰvVwWxXyYỳỲỷỶỹỸýÝỵỴzZ0123456789"
    "!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~ "
)

# Tham số Quality Gate (từ P-163 quality.py, thích nghi tỉ lệ ảnh hoá đơn dọc/ngang)
QualityCanonicalMaxSide = 960
BlurSaturationVariance = 250.0
MaxGlareAreaRatio = 0.05
MinGlareBlobShare = 0.004
GlareAboveMedianLuminance = 12.0
MinReadableSidePixels = 200
QualityPassThreshold = 0.35

# Tham số PP-OCRv3 DBNet & VieSVTR v7 (từ P-163 ocr.py)
DetectionMaxSide = 960
DetectionBinaryThreshold = 0.3
DetectionBoxThreshold = 0.5
DetectionUnclipRatio = 1.65
RecognitionHeight = 64
RecognitionWidthStride = 4
RecognitionWidthMin = 32
RecognitionWidthMax = 1600

SessionLock = threading.Lock()
CachedDetectionSession = None
CachedRecognitionSession = None
CachedSessionError = ""

# Regex phân tích hoá đơn tiếng Việt
PriceTokenPattern = re.compile(
    r"(?:(?<!\d)(\d{1,3}(?:[.,]\d{3})+|\d{4,7})\s*(?:đ|vnđ|vnd|d)?\b)",
    re.IGNORECASE,
)
DateValuePattern = re.compile(r"(?<!\d)(\d{2}/\d{2}/\d{4}|\d{4}-\d{2}-\d{2})(?!\d)")
TotalKeywordPattern = re.compile(
    r"(tong\s*cong|tong\s*tien|tong\s*thanh\s*toan|thanh\s*toan|cong\s*tien|total|grand\s*total|\btong\b)",
    re.IGNORECASE,
)
IgnoreLinePattern = re.compile(
    r"(tien\s*khach|tien\s*thua|tien\s*mat|tra\s*lai|change|cash|cam\s*on|xin\s*cam\s*on|"
    r"hen\s*gap|wifi|mat\s*khau|hotline|dia\s*chi|sdt|dien\s*thoai|ngay[:\s]|gio[:\s]|ma\s*hd|^[-=*_.]{3,}$)",
    re.IGNORECASE,
)

CategoryKeywordMap = {
    "Ăn uống": ("ca phe", "cafe", "coffee", "tra", "tra sua", "banh", "com", "bun", "pho", "lau", "nuong", "quan", "an", "uong", "nha hang", "bep"),
    "Đi lại": ("grab", "be ", "xanh sm", "taxi", "xe", "xang", "gui xe", "ve", "bus", "metro", "cuoc"),
    "Mua sắm": ("sieu thi", "mart", "bach hoa", "sach", "nha sach", "quan", "ao", "giay", "my pham", "dien may", "mua"),
    "Hoá đơn & Tiện ích": ("dien luc", "tien dien", "tien nuoc", "internet", "wifi", "vien thong", "cuoc", "tien ich", "chung cu"),
    "Giải trí": ("rap", "phim", "cinema", "cgv", "lotte", "ve xem", "game", "du lich", "karaoke"),
    "Sức khoẻ": ("thuoc", "nha thuoc", "benh vien", "phong kham", "kham", "y te", "vitamin", "nha khoa"),
}


def _StripVietnameseAccents(SourceText: str) -> str:
    """Chuyển tiếng Việt có dấu sang không dấu viết thường để đối chiếu từ khoá OCR ổn định."""
    ReplacedText = str(SourceText or "").replace("đ", "d").replace("Đ", "D")
    Decomposed = unicodedata.normalize("NFD", ReplacedText)
    StrippedChars = [CharItem for CharItem in Decomposed if unicodedata.category(CharItem) != "Mn"]
    return "".join(StrippedChars).lower()


def GetOcrEnvironmentStatus() -> dict:
    """Kiểm tra trạng thái thư viện và file trọng số ONNX trên thiết bị hiện tại."""
    DetectionModelPath = os.path.join(DefaultWeightsDirectory, "det.onnx")
    RecognitionModelPath = os.path.join(DefaultWeightsDirectory, "viesvtr_v7.onnx")
    DetectionWeightExists = os.path.isfile(DetectionModelPath)
    RecognitionWeightExists = os.path.isfile(RecognitionModelPath)
    return {
        "dependencies_available": OcrDependenciesAvailable,
        "import_error": OcrImportErrorMessage,
        "weights_directory": DefaultWeightsDirectory,
        "det_model_exists": DetectionWeightExists,
        "rec_model_exists": RecognitionWeightExists,
        "engine_ready": bool(OcrDependenciesAvailable and DetectionWeightExists and RecognitionWeightExists),
        "engine_version": "ppocrv3-viesvtr-v7",
    }


def _GetOnnxSessions() -> tuple:
    """Nạp và lưu cache singleton cho 2 mô hình ONNX trên CPU."""
    global CachedDetectionSession, CachedRecognitionSession, CachedSessionError
    if not OcrDependenciesAvailable:
        raise RuntimeError("Thiếu thư viện OCR/CV: %s" % OcrImportErrorMessage)
    with SessionLock:
        if CachedDetectionSession is not None and CachedRecognitionSession is not None:
            return CachedDetectionSession, CachedRecognitionSession
        DetectionModelPath = os.path.join(DefaultWeightsDirectory, "det.onnx")
        RecognitionModelPath = os.path.join(DefaultWeightsDirectory, "viesvtr_v7.onnx")
        if not os.path.isfile(DetectionModelPath) or not os.path.isfile(RecognitionModelPath):
            raise FileNotFoundError(
                "Không tìm thấy trọng số det.onnx hoặc viesvtr_v7.onnx tại: %s" % DefaultWeightsDirectory
            )
        SessionOptions = OnnxRuntime.SessionOptions()
        SessionOptions.graph_optimization_level = OnnxRuntime.GraphOptimizationLevel.ORT_ENABLE_ALL
        CachedDetectionSession = OnnxRuntime.InferenceSession(
            DetectionModelPath, sess_options=SessionOptions, providers=["CPUExecutionProvider"]
        )
        CachedRecognitionSession = OnnxRuntime.InferenceSession(
            RecognitionModelPath, sess_options=SessionOptions, providers=["CPUExecutionProvider"]
        )
        CachedSessionError = ""
        return CachedDetectionSession, CachedRecognitionSession


def _ResizeKeepAspectMaxSide(RgbImageArray, MaxSidePixels: int):
    """Đưa cạnh lớn nhất của ảnh về tối đa MaxSidePixels để đo độ nét/loá đồng nhất."""
    OriginalHeight, OriginalWidth = RgbImageArray.shape[:2]
    LongestSide = max(OriginalHeight, OriginalWidth)
    if LongestSide <= MaxSidePixels or LongestSide == 0:
        return RgbImageArray
    ScaleFactor = float(MaxSidePixels) / float(LongestSide)
    NewWidth = max(1, int(round(OriginalWidth * ScaleFactor)))
    NewHeight = max(1, int(round(OriginalHeight * ScaleFactor)))
    return OpenCvLib.resize(RgbImageArray, (NewWidth, NewHeight), interpolation=OpenCvLib.INTER_AREA)


def MeasureReceiptBlur(GrayImageArray) -> tuple:
    """Đo độ nét qua phương sai Laplacian (P-163 quality.py), trả về (BlurScore, LaplacianVariance)."""
    LaplacianArray = OpenCvLib.Laplacian(GrayImageArray, OpenCvLib.CV_64F)
    LaplacianVariance = float(LaplacianArray.var())
    RawBlurScore = min(1.0, LaplacianVariance / BlurSaturationVariance)
    ClippedBlurScore = float(NumpyLib.clip(RawBlurScore, 0.0, 1.0))
    return ClippedBlurScore, LaplacianVariance


def MeasureReceiptGlare(RgbImageArray) -> tuple:
    """Đo vùng loá sáng cục bộ bằng HSV + connected components (P-163 quality.py)."""
    HsvImageArray = OpenCvLib.cvtColor(RgbImageArray, OpenCvLib.COLOR_RGB2HSV)
    ValueChannel = HsvImageArray[:, :, 2].astype(NumpyLib.float32)
    SaturationChannel = HsvImageArray[:, :, 1].astype(NumpyLib.float32)
    MinChannelArray = RgbImageArray.min(axis=2).astype(NumpyLib.float32)

    MedianValue = float(NumpyLib.median(ValueChannel))
    MedianMinChannel = float(NumpyLib.median(MinChannelArray))
    ValueCutoff = max(248.0, MedianValue + GlareAboveMedianLuminance)
    MinChannelCutoff = max(240.0, MedianMinChannel + GlareAboveMedianLuminance * 0.8)

    RawGlareMask = (
        (ValueChannel >= ValueCutoff)
        & (MinChannelArray >= MinChannelCutoff)
        & (SaturationChannel <= 25.0)
    ).astype(NumpyLib.uint8)

    TotalPixelCount = int(ValueChannel.size)
    if not NumpyLib.any(RawGlareMask):
        return 1.0, 0.0

    ComponentCount, UnusedLabels, ComponentStats, UnusedCentroids = OpenCvLib.connectedComponentsWithStats(
        RawGlareMask, connectivity=8
    )
    MinBlobPixels = max(16, int(round(MinGlareBlobShare * TotalPixelCount)))
    GlarePixelCount = 0
    for ComponentIndex in range(1, ComponentCount):
        ComponentArea = int(ComponentStats[ComponentIndex, OpenCvLib.CC_STAT_AREA])
        if ComponentArea >= MinBlobPixels:
            GlarePixelCount += ComponentArea

    GlareRatio = float(GlarePixelCount / max(1, TotalPixelCount))
    RawGlareScore = max(0.0, 1.0 - (GlareRatio / MaxGlareAreaRatio))
    ClippedGlareScore = float(NumpyLib.clip(RawGlareScore, 0.0, 1.0))
    return ClippedGlareScore, GlareRatio


def AssessReceiptQuality(ImageBytes: bytes) -> dict:
    """Đánh giá chất lượng ảnh hoá đơn (độ phân giải, độ nét, độ loá sáng)."""
    if not OcrDependenciesAvailable:
        return {
            "available": False,
            "quality_status": "unavailable",
            "overall_score": None,
            "blur_score": None,
            "laplacian_var": None,
            "glare_score": None,
            "glare_ratio": None,
            "image_width": None,
            "image_height": None,
            "reasons": ["QUALITY_DEPENDENCIES_MISSING"],
        }

    PilImage = Image.open(io.BytesIO(ImageBytes)).convert("RGB")
    ImageWidth, ImageHeight = PilImage.size
    RgbOriginal = NumpyLib.asarray(PilImage, dtype=NumpyLib.uint8)
    RgbCanonical = _ResizeKeepAspectMaxSide(RgbOriginal, QualityCanonicalMaxSide)
    GrayCanonical = OpenCvLib.cvtColor(RgbCanonical, OpenCvLib.COLOR_RGB2GRAY)

    MinSide = min(ImageWidth, ImageHeight)
    ResolutionScore = 1.0 if MinSide >= MinReadableSidePixels else float(NumpyLib.clip(MinSide / float(MinReadableSidePixels), 0.0, 0.45))
    BlurScore, LaplacianVariance = MeasureReceiptBlur(GrayCanonical)
    GlareScore, GlareRatio = MeasureReceiptGlare(RgbCanonical)

    OverallScore = float(min(ResolutionScore, BlurScore, GlareScore))
    FailureReasons = []
    if ResolutionScore < QualityPassThreshold:
        FailureReasons.append("LOW_RESOLUTION")
    if BlurScore < QualityPassThreshold:
        FailureReasons.append("RECEIPT_BLURRED")
    if GlareScore < QualityPassThreshold:
        FailureReasons.append("GLARE_DETECTED")

    QualityStatus = "pass" if OverallScore >= QualityPassThreshold else "fail"
    return {
        "available": True,
        "quality_status": QualityStatus,
        "overall_score": round(OverallScore, 4),
        "blur_score": round(BlurScore, 4),
        "laplacian_var": round(LaplacianVariance, 2),
        "glare_score": round(GlareScore, 4),
        "glare_ratio": round(GlareRatio, 4),
        "image_width": int(ImageWidth),
        "image_height": int(ImageHeight),
        "reasons": FailureReasons,
    }


def SuppressRedOverlay(RgbImageArray):
    """Lọc nhiễu dấu đỏ/watermark đè lên chữ tối (từ P-163 ocr.py)."""
    RedChannel = RgbImageArray[:, :, 0].astype(NumpyLib.int16)
    GreenChannel = RgbImageArray[:, :, 1].astype(NumpyLib.int16)
    BlueChannel = RgbImageArray[:, :, 2].astype(NumpyLib.int16)
    RedMask = (RedChannel - NumpyLib.maximum(GreenChannel, BlueChannel) > 35) & (RedChannel > 130)
    if not NumpyLib.any(RedMask):
        return RgbImageArray
    CleanedRgb = RgbImageArray.copy()
    CleanedRgb[RedMask, 1] = CleanedRgb[RedMask, 0]
    CleanedRgb[RedMask, 2] = CleanedRgb[RedMask, 0]
    return CleanedRgb


def PreprocessDetectionImage(RgbImageArray) -> tuple:
    """Chuẩn hoá ảnh RGB thành tensor BGR (1, 3, H, W) cho PP-OCRv3 DBNet."""
    DetectionMean = NumpyLib.array([0.485, 0.456, 0.406], dtype=NumpyLib.float32)
    DetectionStd = NumpyLib.array([0.229, 0.224, 0.225], dtype=NumpyLib.float32)
    OriginalHeight, OriginalWidth = RgbImageArray.shape[:2]
    ScaleRatio = min(1.0, DetectionMaxSide / float(max(OriginalHeight, OriginalWidth)))
    TargetHeight = max(32, int(round(OriginalHeight * ScaleRatio / 32.0)) * 32)
    TargetWidth = max(32, int(round(OriginalWidth * ScaleRatio / 32.0)) * 32)
    ResizedRgb = OpenCvLib.resize(RgbImageArray, (TargetWidth, TargetHeight), interpolation=OpenCvLib.INTER_LINEAR)
    BgrImage = ResizedRgb[:, :, ::-1]
    NormalizedImage = (BgrImage.astype(NumpyLib.float32) / 255.0 - DetectionMean) / DetectionStd
    TensorBlob = NumpyLib.ascontiguousarray(NormalizedImage.transpose(2, 0, 1)[NumpyLib.newaxis, ...])
    ScaleX = OriginalWidth / float(TargetWidth)
    ScaleY = OriginalHeight / float(TargetHeight)
    return TensorBlob, ScaleX, ScaleY


def PostprocessDetectionBoxes(
    ProbabilityMap, ScaleX: float, ScaleY: float, OriginalWidth: int, OriginalHeight: int
) -> list:
    """Tách khung chữ từ bản đồ xác suất DBNet và sắp xếp theo thứ tự đọc."""
    ProbArray = NumpyLib.asarray(ProbabilityMap, dtype=NumpyLib.float32)
    while ProbArray.ndim > 2:
        ProbArray = ProbArray[0]
    BinaryMap = (ProbArray > DetectionBinaryThreshold).astype(NumpyLib.uint8)
    ContourList, UnusedHierarchy = OpenCvLib.findContours(BinaryMap, OpenCvLib.RETR_LIST, OpenCvLib.CHAIN_APPROX_SIMPLE)

    MaxLineHeight = max(60, int(round(0.20 * OriginalHeight)))
    RawBoxes = []
    for ContourItem in ContourList:
        if len(ContourItem) < 3:
            continue
        BoxX, BoxY, BoxWidth, BoxHeight = OpenCvLib.boundingRect(ContourItem)
        if BoxWidth < 4 or BoxHeight < 4:
            continue
        RoiMask = NumpyLib.zeros((BoxHeight, BoxWidth), dtype=NumpyLib.uint8)
        ShiftedContour = ContourItem - NumpyLib.array([[[BoxX, BoxY]]])
        OpenCvLib.fillPoly(RoiMask, [ShiftedContour], 1)
        RoiProb = ProbArray[BoxY : BoxY + BoxHeight, BoxX : BoxX + BoxWidth]
        MeanBoxScore = float(OpenCvLib.mean(RoiProb, mask=RoiMask)[0])
        if MeanBoxScore < DetectionBoxThreshold:
            continue

        ContourArea = float(OpenCvLib.contourArea(ContourItem))
        ContourPerimeter = float(OpenCvLib.arcLength(ContourItem, True))
        if ContourPerimeter < 1.0:
            continue
        ExpandDistance = ContourArea * DetectionUnclipRatio / ContourPerimeter
        PadX = max(2.0, ExpandDistance * 0.9)
        PadY = max(3.0, ExpandDistance * 1.15)
        LeftX = max(0, int(math.floor((BoxX - PadX) * ScaleX)))
        TopY = max(0, int(math.floor((BoxY - PadY) * ScaleY)))
        RightX = min(OriginalWidth, int(math.ceil((BoxX + BoxWidth + PadX) * ScaleX)))
        BottomY = min(OriginalHeight, int(math.ceil((BoxY + BoxHeight + PadY) * ScaleY)))
        if RightX - LeftX >= 8 and 8 <= (BottomY - TopY) <= MaxLineHeight:
            RawBoxes.append((LeftX, TopY, RightX, BottomY))

    if not RawBoxes:
        return []

    BoxHeights = [BoxTuple[3] - BoxTuple[1] for BoxTuple in RawBoxes]
    RowTolerance = max(8.0, 0.5 * float(NumpyLib.median(BoxHeights)))
    RawBoxes.sort(key=lambda BoxTuple: (BoxTuple[1], BoxTuple[0]))

    VisualRows = []
    for BoxTuple in RawBoxes:
        CenterY = 0.5 * (BoxTuple[1] + BoxTuple[3])
        WasPlaced = False
        for ExistingRow in VisualRows:
            RowMeanY = float(NumpyLib.mean([0.5 * (MemberBox[1] + MemberBox[3]) for MemberBox in ExistingRow]))
            if abs(CenterY - RowMeanY) <= RowTolerance:
                ExistingRow.append(BoxTuple)
                WasPlaced = True
                break
        if not WasPlaced:
            VisualRows.append([BoxTuple])

    OrderedBoxes = []
    for VisualRow in sorted(VisualRows, key=lambda RowList: min(MemberBox[1] for MemberBox in RowList)):
        VisualRow.sort(key=lambda MemberBox: MemberBox[0])
        OrderedBoxes.extend(VisualRow)
    return OrderedBoxes


def PreprocessRecognitionCrop(CropRgbArray):
    """Chuẩn hoá crop dòng chữ về `(1, 3, 64, W)` trong dải `[-1, 1]` cho VieSVTR v7."""
    CropHeight, CropWidth = CropRgbArray.shape[:2]
    ScaledWidth = int(math.ceil(RecognitionHeight * float(CropWidth) / max(1.0, float(CropHeight))))
    AlignedWidth = int(math.ceil(ScaledWidth / RecognitionWidthStride) * RecognitionWidthStride)
    TargetWidth = max(RecognitionWidthMin, min(AlignedWidth, RecognitionWidthMax))
    InterpolationMode = OpenCvLib.INTER_AREA if CropHeight > RecognitionHeight else OpenCvLib.INTER_LINEAR
    ResizedCrop = OpenCvLib.resize(CropRgbArray, (TargetWidth, RecognitionHeight), interpolation=InterpolationMode)
    FloatTensor = ResizedCrop.astype(NumpyLib.float32).transpose(2, 0, 1)[NumpyLib.newaxis, ...] / 255.0
    return NumpyLib.ascontiguousarray((FloatTensor - 0.5) / 0.5)


def DecodeCtcGreedy(LogitsArray) -> tuple:
    """Giải mã CTC logits `(T, V)` của VieSVTR thành `(Text, MeanConfidence)`."""
    LogitsFloat = NumpyLib.asarray(LogitsArray, dtype=NumpyLib.float32)
    if LogitsFloat.ndim == 3:
        LogitsFloat = LogitsFloat[0]
    if LogitsFloat.ndim != 2 or LogitsFloat.shape[0] == 0:
        return "", 0.0
    ShiftedLogits = LogitsFloat - LogitsFloat.max(axis=-1, keepdims=True)
    ExpValues = NumpyLib.exp(ShiftedLogits)
    Probabilities = ExpValues / ExpValues.sum(axis=-1, keepdims=True)
    TokenIds = Probabilities.argmax(axis=-1)
    TokenConfs = Probabilities.max(axis=-1)

    DecodedChars = []
    PreviousToken = -1
    VocabLength = len(VietOcrVocabulary)
    for TokenId in TokenIds.tolist():
        if TokenId != PreviousToken and TokenId != 0 and 1 <= TokenId <= VocabLength:
            DecodedChars.append(VietOcrVocabulary[TokenId - 1])
        PreviousToken = TokenId

    NonBlankMask = TokenIds != 0
    MeanConfidence = float(TokenConfs[NonBlankMask].mean()) if bool(NumpyLib.any(NonBlankMask)) else 0.0
    NormalizedText = unicodedata.normalize("NFC", "".join(DecodedChars)).strip()
    return NormalizedText, float(NumpyLib.clip(MeanConfidence, 0.0, 1.0))


def ExtractOcrLinesFromBytes(ImageBytes: bytes) -> dict:
    """Chạy thật PP-OCRv3 DBNet + VieSVTR v7 trên ảnh hoá đơn và trả về danh sách dòng."""
    if not OcrDependenciesAvailable:
        return {
            "engine_available": False,
            "engine_version": "unavailable",
            "lines": [],
            "mean_confidence": 0.0,
            "error_message": OcrImportErrorMessage,
        }

    try:
        DetectionSession, RecognitionSession = _GetOnnxSessions()
        PilImage = Image.open(io.BytesIO(ImageBytes)).convert("RGB")
        RgbOriginal = SuppressRedOverlay(NumpyLib.asarray(PilImage, dtype=NumpyLib.uint8))
        OriginalHeight, OriginalWidth = RgbOriginal.shape[:2]

        DetectionBlob, ScaleX, ScaleY = PreprocessDetectionImage(RgbOriginal)
        DetectionInputName = DetectionSession.get_inputs()[0].name
        DetectionOutputs = DetectionSession.run(None, {DetectionInputName: DetectionBlob})
        ProbabilityMap = DetectionOutputs[0]
        DetectedBoxes = PostprocessDetectionBoxes(
            NumpyLib.asarray(ProbabilityMap), ScaleX, ScaleY, OriginalWidth, OriginalHeight
        )

        RecognitionInputName = RecognitionSession.get_inputs()[0].name
        RecognizedLines = []
        for BoxCoords in DetectedBoxes:
            LeftX, TopY, RightX, BottomY = BoxCoords
            LineCrop = RgbOriginal[TopY:BottomY, LeftX:RightX]
            if LineCrop.size == 0:
                continue
            RecognitionBlob = PreprocessRecognitionCrop(LineCrop)
            RecognitionOutputs = RecognitionSession.run(None, {RecognitionInputName: RecognitionBlob})
            LogitsTensor = RecognitionOutputs[0]
            LineText, LineConfidence = DecodeCtcGreedy(NumpyLib.asarray(LogitsTensor))
            if LineText:
                RecognizedLines.append(
                    {
                        "text": LineText,
                        "confidence": round(LineConfidence, 4),
                        "box": [int(LeftX), int(TopY), int(RightX), int(BottomY)],
                    }
                )

        MeanConf = (
            sum(LineItem["confidence"] for LineItem in RecognizedLines) / float(len(RecognizedLines))
            if RecognizedLines
            else 0.0
        )
        return {
            "engine_available": True,
            "engine_version": "ppocrv3-viesvtr-v7",
            "lines": RecognizedLines,
            "mean_confidence": round(MeanConf, 4),
            "error_message": "",
        }
    except Exception as RuntimeErrorDetail:
        return {
            "engine_available": False,
            "engine_version": "error",
            "lines": [],
            "mean_confidence": 0.0,
            "error_message": "%s: %s" % (type(RuntimeErrorDetail).__name__, RuntimeErrorDetail),
        }


def _GroupOcrLinesIntoVisualRows(OcrLines: list) -> list:
    """Gộp các hộp văn bản nằm trên cùng một dòng ngang (tên món + giá tiền bên phải)."""
    if not OcrLines:
        return []
    SortedLines = sorted(OcrLines, key=lambda LineObj: (LineObj["box"][1], LineObj["box"][0]))
    Heights = [max(8, LineObj["box"][3] - LineObj["box"][1]) for LineObj in SortedLines]
    SortedHeights = sorted(Heights)
    MedianHeight = SortedHeights[len(SortedHeights) // 2]
    RowTolerance = max(10.0, 0.65 * float(MedianHeight))

    GroupedRows = []
    for LineObj in SortedLines:
        CenterY = 0.5 * (LineObj["box"][1] + LineObj["box"][3])
        PlacedInRow = False
        for RowBucket in GroupedRows:
            RowCenterY = sum(0.5 * (Member["box"][1] + Member["box"][3]) for Member in RowBucket) / float(len(RowBucket))
            if abs(CenterY - RowCenterY) <= RowTolerance:
                RowBucket.append(LineObj)
                PlacedInRow = True
                break
        if not PlacedInRow:
            GroupedRows.append([LineObj])

    JoinedRowTexts = []
    for RowBucket in GroupedRows:
        RowBucket.sort(key=lambda Member: Member["box"][0])
        CombinedText = " ".join(Member["text"] for Member in RowBucket).strip()
        MeanRowConf = sum(Member["confidence"] for Member in RowBucket) / float(len(RowBucket))
        if CombinedText:
            JoinedRowTexts.append({"text": CombinedText, "confidence": round(MeanRowConf, 4)})
    return JoinedRowTexts


def _ParseVietnameseMoneyToken(RawDigits: str) -> int:
    """Chuyển chuỗi số tiền VN (45.000 / 45,000 / 45000) thành số nguyên VND."""
    DigitsOnly = re.sub(r"[^\d]", "", str(RawDigits or ""))
    return int(DigitsOnly) if DigitsOnly else 0


def _InferCategoryFromText(FullText: str) -> str:
    """Suy luận danh mục chi tiêu từ tên cửa hàng và các món bằng bảng từ khoá."""
    NormalizedText = _StripVietnameseAccents(FullText)
    for CategoryLabel, KeywordTuple in CategoryKeywordMap.items():
        if any(KeywordItem in NormalizedText for KeywordItem in KeywordTuple):
            return CategoryLabel
    return "Khác"


def _NormalizeExtractedDate(RawDate: str, FallbackDate: str) -> str:
    """Chuẩn hoá DD/MM/YYYY hoặc YYYY-MM-DD về YYYY-MM-DD."""
    if not RawDate:
        return FallbackDate
    if "-" in RawDate and len(RawDate) == 10:
        return RawDate
    Parts = RawDate.split("/")
    if len(Parts) == 3:
        DayPart, MonthPart, YearPart = Parts
        return "%s-%s-%s" % (YearPart, MonthPart.zfill(2), DayPart.zfill(2))
    return FallbackDate


def ParseReceiptFromOcrLines(OcrLines: list, QualityReport: dict, FallbackDate: str) -> dict:
    """Phân tích các dòng OCR thành cấu trúc hoá đơn có kiểm tra G10 khi ảnh mờ/thiếu."""
    LogicalRows = _GroupOcrLinesIntoVisualRows(OcrLines)
    MerchantName = ""
    ExtractedDate = ""
    PrintedTotalVnd = 0
    ParsedItems = []

    for RowIndex, RowItem in enumerate(LogicalRows):
        RowText = RowItem["text"]
        NormalizedRowText = _StripVietnameseAccents(RowText)
        if not ExtractedDate:
            DateMatch = DateValuePattern.search(RowText)
            if DateMatch:
                ExtractedDate = _NormalizeExtractedDate(DateMatch.group(1), FallbackDate)

        if IgnoreLinePattern.search(NormalizedRowText):
            continue

        PriceMatches = list(PriceTokenPattern.finditer(RowText))
        if TotalKeywordPattern.search(NormalizedRowText):
            if PriceMatches:
                CandidateTotal = _ParseVietnameseMoneyToken(PriceMatches[-1].group(1))
                if CandidateTotal > 0:
                    PrintedTotalVnd = CandidateTotal
            continue

        if not PriceMatches:
            if RowIndex <= 2 and not MerchantName and len(RowText) >= 3:
                MerchantName = RowText
            continue

        LastMatch = PriceMatches[-1]
        ItemPrice = _ParseVietnameseMoneyToken(LastMatch.group(1))
        ItemLabel = RowText[: LastMatch.start()].strip(" .:-–0123456789")
        ItemLabel = re.sub(r"^\d+[.)]\s*", "", RowText[: LastMatch.start()]).strip(" .:-–")
        if ItemPrice >= 1000 and ItemLabel:
            ParsedItems.append({"name": ItemLabel, "price": ItemPrice})

    QualityStatus = QualityReport.get("quality_status", "unknown")
    MeanConfidence = (
        sum(LineItem["confidence"] for LineItem in LogicalRows) / float(len(LogicalRows))
        if LogicalRows
        else 0.0
    )

    IsUncertain = bool(
        QualityStatus == "fail"
        or len(LogicalRows) == 0
        or len(ParsedItems) == 0
        or MeanConfidence < 0.45
    )

    if not MerchantName:
        MerchantName = "không rõ" if IsUncertain else "Cửa hàng trên hoá đơn"
    if not ParsedItems:
        ParsedItems = [{"name": "không rõ (cần bạn nhập hoặc chụp lại rõ nét hơn)", "price": PrintedTotalVnd}]

    CombinedSearchText = " ".join([MerchantName] + [ItemObj["name"] for ItemObj in ParsedItems])
    SuggestedCategory = _InferCategoryFromText(CombinedSearchText)

    return {
        "merchant": MerchantName,
        "date": FallbackDate or ExtractedDate,
        "extracted_date_in_image": ExtractedDate,
        "category": SuggestedCategory,
        "items": ParsedItems,
        "printed_total": PrintedTotalVnd,
        "logical_rows": LogicalRows,
        "mean_confidence": round(MeanConfidence, 4),
        "is_uncertain": IsUncertain,
    }


def ScanReceiptImageBytes(
    ImageBytes: bytes,
    TargetDate: str,
    SourceMode: str = "camera",
    FileName: str = "",
) -> dict:
    """Chạy trọn bộ Quality Gate + ONNX OCR + Parser cho Luồng 1 trong spec.md §4."""
    QualityReport = AssessReceiptQuality(ImageBytes)
    OcrOutput = ExtractOcrLinesFromBytes(ImageBytes)
    ParsedReceipt = ParseReceiptFromOcrLines(OcrOutput.get("lines", []), QualityReport, TargetDate)
    ParsedReceipt["source"] = SourceMode
    ParsedReceipt["filename"] = FileName
    ParsedReceipt["quality_report"] = QualityReport
    ParsedReceipt["ocr_engine"] = OcrOutput.get("engine_version", "unavailable")
    ParsedReceipt["ocr_engine_available"] = OcrOutput.get("engine_available", False)
    ParsedReceipt["ocr_error"] = OcrOutput.get("error_message", "")
    ParsedReceipt["ocr_lines"] = OcrOutput.get("lines", [])
    return ParsedReceipt
