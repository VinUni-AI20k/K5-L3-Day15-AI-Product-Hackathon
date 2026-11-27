"""Web server và CLI cho SkyBill: phục vụ giao diện web, lưu trữ CSDL/, Quality Gate & ONNX OCR.

Chạy mặc định qua: python run.py
"""

import argparse
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
import mimetypes
import os
import socket
import sys
import threading
import urllib.parse
import uuid
import webbrowser

for StreamObject in (sys.stdout, sys.stderr, sys.stdin):
    try:
        StreamObject.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

BaseCodeDirectory = os.path.dirname(os.path.abspath(__file__))
FrontendDirectory = os.path.join(BaseCodeDirectory, "frontend")
if BaseCodeDirectory not in sys.path:
    sys.path.insert(0, BaseCodeDirectory)

import document_ocr as DocumentOcrModule
import storage as StorageModule
import tools as ReceiptTools


def _WhereFailed(ErrorObject):
    """Tìm tên file trong codebase/ gây lỗi khi import."""
    import traceback

    FilePath = getattr(ErrorObject, "filename", None) or (
        traceback.extract_tb(ErrorObject.__traceback__)[-1].filename if ErrorObject.__traceback__ else ""
    )
    if not FilePath:
        return "codebase/"
    AbsolutePath = os.path.abspath(FilePath)
    ProjectBase = os.path.dirname(BaseCodeDirectory)
    return os.path.relpath(AbsolutePath, ProjectBase).replace(os.sep, "/") if AbsolutePath.startswith(ProjectBase) else FilePath


def run_cli() -> int:
    """Chế độ dòng lệnh tối thiểu (chạy với --cli)."""
    try:
        import tracing
        from agent import answer
    except Exception as LoadError:
        print("Không nạp được codebase/ — lỗi ở %s: %s: %s" % (_WhereFailed(LoadError), type(LoadError).__name__, LoadError))
        print("Sửa lỗi rồi chạy lại. Cách nối model: docs/connect-model.md")
        return 1

    StorageModule.EnsureStorageLayout()
    print("Bản chạy thử CLI — gõ đầu vào rồi Enter. Thoát: Ctrl+C (hoặc Enter 2 lần với dòng trống).")
    BlankCount = 0
    while True:
        try:
            InputText = input("> ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            return 0
        if not InputText:
            BlankCount += 1
            if BlankCount >= 2:
                return 0
            continue
        BlankCount = 0
        tracing.begin("app")
        try:
            AnswerResult = answer(InputText)
        except NotImplementedError as NotImplError:
            tracing.end()
            print("Chưa nối model: %s" % NotImplError)
            return 1
        except Exception as RuntimeErr:
            tracing.end()
            print("[lỗi] %s: %s" % (type(RuntimeErr).__name__, RuntimeErr))
            continue
        TraceSummary, UnusedEvents = tracing.end()
        print(AnswerResult.get("output", "") if isinstance(AnswerResult, dict) else AnswerResult)
        print(
            "   (model: %s · gọi model %d lần · công cụ %d lần · token vào %d / ra %d)"
            % (
                ", ".join(TraceSummary["models"]) or "—",
                TraceSummary["model_calls"],
                TraceSummary["tool_calls"],
                TraceSummary["tokens_in"],
                TraceSummary["tokens_out"],
            )
        )


def _FindFreePort(PreferredPort: int) -> int:
    """Tìm cổng TCP trống bắt đầu từ PreferredPort trên 127.0.0.1."""
    for CandidatePort in range(PreferredPort, PreferredPort + 20):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as TestSocket:
            if TestSocket.connect_ex(("127.0.0.1", CandidatePort)) != 0:
                return CandidatePort
    return PreferredPort


def _CreateHttpHandler(TracingModule, AnswerFunction):
    class SkyBillHttpHandler(SimpleHTTPRequestHandler):
        def __init__(SelfInstance, *PositionalArgs, **KeywordArgs):
            super().__init__(*PositionalArgs, directory=FrontendDirectory, **KeywordArgs)

        def log_message(SelfInstance, LogFormat, *PositionalArgs):
            pass

        def _SendJsonResponse(SelfInstance, StatusCode: int, ResponsePayload: dict):
            EncodedBytes = json.dumps(ResponsePayload, ensure_ascii=False).encode("utf-8")
            SelfInstance.send_response(StatusCode)
            SelfInstance.send_header("Content-Type", "application/json; charset=utf-8")
            SelfInstance.send_header("Content-Length", str(len(EncodedBytes)))
            SelfInstance.end_headers()
            SelfInstance.wfile.write(EncodedBytes)

        def _ReadJsonBody(SelfInstance) -> dict:
            ContentLength = int(SelfInstance.headers.get("Content-Length", "0"))
            RawBody = SelfInstance.rfile.read(ContentLength).decode("utf-8") if ContentLength > 0 else "{}"
            ParsedPayload = json.loads(RawBody)
            return ParsedPayload if isinstance(ParsedPayload, dict) else {}

        def _ServeStoredImage(SelfInstance, RelativeUrlPath: str):
            AbsoluteImagePath = StorageModule.ResolveImageAbsolutePath(RelativeUrlPath)
            if not AbsoluteImagePath:
                SelfInstance._SendJsonResponse(404, {"error": "Không tìm thấy ảnh trong CSDL"})
                return
            MimeType, UnusedEncoding = mimetypes.guess_type(AbsoluteImagePath)
            with open(AbsoluteImagePath, "rb") as ImageStream:
                ImageBytes = ImageStream.read()
            SelfInstance.send_response(200)
            SelfInstance.send_header("Content-Type", MimeType or "image/jpeg")
            SelfInstance.send_header("Content-Length", str(len(ImageBytes)))
            SelfInstance.end_headers()
            SelfInstance.wfile.write(ImageBytes)

        def do_GET(SelfInstance):
            ParsedUrl = urllib.parse.urlparse(SelfInstance.path)
            RoutePath = ParsedUrl.path
            QueryParams = urllib.parse.parse_qs(ParsedUrl.query)

            if RoutePath.startswith("/csdl/images/"):
                RelativePath = urllib.parse.unquote(RoutePath[len("/csdl/images/") :])
                SelfInstance._ServeStoredImage(RelativePath)
                return

            if RoutePath == "/api/health":
                OcrStatus = DocumentOcrModule.GetOcrEnvironmentStatus()
                ReceiptCount = len(StorageModule.LoadReceiptRecords("default_user"))
                SelfInstance._SendJsonResponse(
                    200,
                    {
                        "status": "ok",
                        "storage_dir": StorageModule.StorageRootDirectory,
                        "receipts_count": ReceiptCount,
                        "ocr": OcrStatus,
                    },
                )
                return

            if RoutePath == "/api/receipts":
                ReceiptsList = StorageModule.LoadReceiptRecords("default_user")
                SelfInstance._SendJsonResponse(200, {"receipts": ReceiptsList})
                return

            if RoutePath == "/api/summary/day":
                TargetDate = (QueryParams.get("date") or [""])[0]
                if not TargetDate:
                    SelfInstance._SendJsonResponse(400, {"error": "Thiếu tham số date"})
                    return
                DaySummary = ReceiptTools.get_day_summary("default_user", TargetDate)
                SelfInstance._SendJsonResponse(200, DaySummary)
                return

            if RoutePath == "/api/summary/compare":
                PeriodType = (QueryParams.get("period") or ["month"])[0]
                CurrentKey = (QueryParams.get("current") or [""])[0]
                PreviousKey = (QueryParams.get("previous") or [""])[0]
                ComparisonResult = ReceiptTools.compare_periods("default_user", PeriodType, CurrentKey, PreviousKey)
                SelfInstance._SendJsonResponse(200, ComparisonResult)
                return

            super().do_GET()

        def do_POST(SelfInstance):
            ParsedUrl = urllib.parse.urlparse(SelfInstance.path)
            RoutePath = ParsedUrl.path

            try:
                RequestBody = SelfInstance._ReadJsonBody()
            except Exception as JsonError:
                SelfInstance._SendJsonResponse(400, {"error": "JSON không hợp lệ: %s" % JsonError})
                return

            if RoutePath == "/api/receipts/scan":
                ImageDataUrl = str(RequestBody.get("image_data_url") or "")
                TargetDate = str(RequestBody.get("receipt_date") or "").strip()
                SourceMode = str(RequestBody.get("source_mode") or "camera").strip()
                FileName = str(RequestBody.get("filename") or "").strip()

                if not ImageDataUrl or not TargetDate:
                    SelfInstance._SendJsonResponse(400, {"error": "Thiếu image_data_url hoặc receipt_date"})
                    return

                DraftId = "DRAFT-" + uuid.uuid4().hex[:8].upper()
                try:
                    RelativeImagePath, ImageRawBytes = StorageModule.SaveBase64ReceiptImage(
                        ImageDataUrl, TargetDate, DraftId
                    )
                except Exception as ImageError:
                    SelfInstance._SendJsonResponse(400, {"error": "Không đọc được dữ liệu ảnh: %s" % ImageError})
                    return

                ScanResult = DocumentOcrModule.ScanReceiptImageBytes(
                    ImageRawBytes, TargetDate, SourceMode=SourceMode, FileName=FileName
                )
                ScanResult["draft_id"] = DraftId
                ScanResult["image_path"] = RelativeImagePath
                ScanResult["user_id"] = "default_user"

                ValidationResult = ReceiptTools.validate_receipt(ScanResult)
                SavedDraft = ReceiptTools.draft_save_receipt("default_user", TargetDate, ScanResult)

                SelfInstance._SendJsonResponse(
                    200,
                    {
                        "draft": SavedDraft,
                        "validation": ValidationResult,
                        "quality_report": ScanResult.get("quality_report"),
                        "ocr_engine": ScanResult.get("ocr_engine"),
                        "ocr_engine_available": ScanResult.get("ocr_engine_available"),
                        "ocr_error": ScanResult.get("ocr_error"),
                        "ocr_lines": ScanResult.get("ocr_lines", []),
                    },
                )
                return

            if RoutePath == "/api/receipts/confirm":
                ConfirmedReceipt = StorageModule.ConfirmDraftToLedger(RequestBody)
                SelfInstance._SendJsonResponse(200, {"receipt": ConfirmedReceipt})
                return

            if RoutePath == "/api/receipts/reset-demo":
                FreshList = StorageModule.ResetDemoReceiptRecords()
                SelfInstance._SendJsonResponse(200, {"receipts": FreshList})
                return

            if RoutePath == "/api/analyze":
                InputText = str(RequestBody.get("text") or "").strip()
                if not InputText:
                    SelfInstance._SendJsonResponse(400, {"error": "Thiếu trường text"})
                    return
                TracingModule.begin("web")
                try:
                    AnswerResult = AnswerFunction(InputText)
                    TraceSummary, UnusedEvents = TracingModule.end()
                    OutputText = AnswerResult.get("output", "") if isinstance(AnswerResult, dict) else str(AnswerResult)
                    SelfInstance._SendJsonResponse(200, {"output": OutputText, "summary": TraceSummary})
                except Exception as AnalyzeError:
                    TracingModule.end()
                    SelfInstance._SendJsonResponse(500, {"error": "%s: %s" % (type(AnalyzeError).__name__, AnalyzeError)})
                return

            SelfInstance._SendJsonResponse(404, {"error": "Not found"})

        def do_PATCH(SelfInstance):
            ParsedUrl = urllib.parse.urlparse(SelfInstance.path)
            RoutePath = ParsedUrl.path
            if not RoutePath.startswith("/api/receipts/"):
                SelfInstance._SendJsonResponse(404, {"error": "Not found"})
                return
            ReceiptId = urllib.parse.unquote(RoutePath[len("/api/receipts/") :])
            try:
                RequestBody = SelfInstance._ReadJsonBody()
            except Exception as JsonError:
                SelfInstance._SendJsonResponse(400, {"error": "JSON không hợp lệ: %s" % JsonError})
                return
            UpdatedReceipt = StorageModule.UpdateReceiptRecord(ReceiptId, RequestBody)
            if UpdatedReceipt is None:
                SelfInstance._SendJsonResponse(404, {"error": "Không tìm thấy hoá đơn"})
                return
            SelfInstance._SendJsonResponse(200, {"receipt": UpdatedReceipt})

        def do_DELETE(SelfInstance):
            ParsedUrl = urllib.parse.urlparse(SelfInstance.path)
            RoutePath = ParsedUrl.path
            if not RoutePath.startswith("/api/receipts/"):
                SelfInstance._SendJsonResponse(404, {"error": "Not found"})
                return
            ReceiptId = urllib.parse.unquote(RoutePath[len("/api/receipts/") :])
            WasDeleted = StorageModule.DeleteReceiptRecord(ReceiptId)
            if not WasDeleted:
                SelfInstance._SendJsonResponse(404, {"error": "Không tìm thấy hoá đơn"})
                return
            SelfInstance._SendJsonResponse(200, {"deleted": True, "id": ReceiptId})

    return SkyBillHttpHandler


def run_web(PortNumber: int, OpenBrowser: bool) -> int:
    """Khởi động web server SkyBill và đồng bộ với thư mục CSDL/."""
    if not os.path.isdir(FrontendDirectory):
        print("Không tìm thấy thư mục giao diện: %s" % FrontendDirectory)
        return 1

    try:
        import tracing
        from agent import answer
    except Exception as LoadError:
        print("Không nạp được codebase/ — lỗi ở %s: %s: %s" % (_WhereFailed(LoadError), type(LoadError).__name__, LoadError))
        return 1

    StorageModule.EnsureStorageLayout()
    OcrStatus = DocumentOcrModule.GetOcrEnvironmentStatus()
    ChosenPort = _FindFreePort(PortNumber)
    WebServer = ThreadingHTTPServer(("127.0.0.1", ChosenPort), _CreateHttpHandler(tracing, answer))
    ServerUrl = "http://127.0.0.1:%d" % ChosenPort

    print("SkyBill Web UI đang chạy tại: %s" % ServerUrl)
    print("Thư mục lưu trữ CSDL: %s" % StorageModule.StorageRootDirectory)
    print("ONNX OCR (%s): %s" % (OcrStatus["engine_version"], "SẴN SÀNG" if OcrStatus["engine_ready"] else "CHƯA ĐỦ THƯ VIỆN/TRỌNG SỐ"))
    print("Nhấn Ctrl+C để dừng máy chủ.")

    if OpenBrowser:
        threading.Timer(0.4, lambda: webbrowser.open(ServerUrl)).start()

    try:
        WebServer.serve_forever()
    except KeyboardInterrupt:
        print("\nĐã dừng máy chủ SkyBill.")
    finally:
        WebServer.server_close()
    return 0


def main() -> int:
    ArgParser = argparse.ArgumentParser(description="Khởi chạy SkyBill")
    ArgParser.add_argument("--cli", action="store_true", help="Chạy ở chế độ dòng lệnh")
    ArgParser.add_argument("--port", type=int, default=8080, help="Cổng chạy web server (mặc định 8080)")
    ArgParser.add_argument("--no-browser", action="store_true", help="Không tự mở trình duyệt")
    ParsedArgs = ArgParser.parse_args()

    if ParsedArgs.cli:
        return run_cli()
    return run_web(ParsedArgs.port, not ParsedArgs.no_browser)


if __name__ == "__main__":
    sys.exit(main())
