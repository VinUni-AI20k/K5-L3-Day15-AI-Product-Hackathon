"""Cầu nối cho codebase/app.py trỏ tới module backend.ocr_engine (đặt trọng số tại backend/weights/)."""

import os
import sys

BaseCodeDirectory = os.path.dirname(os.path.abspath(__file__))
ProjectRootDirectory = os.path.dirname(BaseCodeDirectory)
if ProjectRootDirectory not in sys.path:
    sys.path.insert(0, ProjectRootDirectory)

from backend.ocr_engine import (  # noqa: E402,F401
    AssessReceiptQuality,
    DefaultWeightsDirectory,
    ExtractOcrLinesFromBytes,
    GetOcrEnvironmentStatus,
    MeasureReceiptBlur,
    MeasureReceiptGlare,
    ParseReceiptFromOcrLines,
    PostprocessDetectionBoxes,
    PreprocessDetectionImage,
    PreprocessRecognitionCrop,
    ScanReceiptImageBytes,
    ScanReceiptImageFile,
    SuppressRedOverlay,
    DecodeCtcGreedy,
)
