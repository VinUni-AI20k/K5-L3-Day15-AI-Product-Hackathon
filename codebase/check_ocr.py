"""Kiểm OCR cục bộ trên tệp ảnh, không ghi sổ hoặc in nội dung nhận diện cá nhân."""

import argparse
import collections
import csv
import datetime
import json
import re
from pathlib import Path

from document_ocr import GetOcrEnvironmentStatus, ScanReceiptImageBytes
import tracing


def truth_amounts(label: str) -> set[int]:
    """Các số tiền trong nhãn MC-OCR: 35,500 · 253.000 253.000 · 39 000 · UHD510510.760 (dính chữ/số phía trước)."""
    # Dò chồng lấn để tách số dính chữ số phía trước, nhưng mỗi điểm kết thúc chỉ giữ số dài nhất:
    # "60,500" là 60500, không chấm "đúng" cho mảnh đuôi 500 hay 0,500.
    longest = {}
    for match in re.finditer(r"(?=(\d{1,3}(?:[.,]\d{3})+)(?!\d))", label):
        longest.setdefault(match.end(1), match[1])
    formatted = list(longest.values())
    spaced = re.findall(r"(?<![\d.,])(\d{1,3} \d{3})(?![\d.,])", label)
    plain = re.findall(r"(?<![\d.,])(\d{4,9})(?![\d.,])", label)
    return {int(re.sub(r"\D", "", token)) for token in formatted + spaced + plain}


def main():
    parser = argparse.ArgumentParser(description="Đọc ảnh hóa đơn và kiểm trạng thái Cần đọc lại")
    parser.add_argument("--capture-date", type=datetime.date.fromisoformat, default=datetime.date.today())
    parser.add_argument("--truth", type=Path, help="CSV nhãn MC-OCR (img_id,total_cost) để đối chiếu tổng tiền")
    parser.add_argument("--model", action="store_true", help="Cho model đọc ảnh (agent.read_receipt_image) sau OCR cục bộ; cần .env")
    parser.add_argument("images", nargs="+", type=Path)
    args = parser.parse_args()
    truth = {}
    if args.truth:
        with args.truth.open(encoding="utf-8-sig") as handle:
            for row in csv.DictReader(handle):
                truth[row["img_id"]] = truth_amounts(row["total_cost"])
    summary = collections.Counter()
    if args.model:
        from agent import read_receipt_image
    environment = GetOcrEnvironmentStatus()
    print(json.dumps({
        "ocr": environment["engine_version"],
        "onnx_detection": environment["det_model_exists"],
        "onnx_recognition": environment["rec_model_exists"],
    }, ensure_ascii=False))
    for path in args.images:
        try:
            raw = path.read_bytes()
            result = ScanReceiptImageBytes(raw, args.capture_date.isoformat(), SourceMode="upload")
            if args.model:
                tracing.begin(path.name)
                result = read_receipt_image(result, raw, args.capture_date.isoformat())
                usage, _ = tracing.end()
                summary["tokens_in"] += usage["tokens_in"]
                summary["tokens_out"] += usage["tokens_out"]
        except (OSError, ValueError) as error:
            print(json.dumps({"image": path.name, "error": str(error)}, ensure_ascii=False))
            continue
        quality = result.get("quality_report", {})
        if result.get("blocked"):
            status = "Từ chối thông tin bảo mật"
        elif not result.get("ocr_engine_available"):
            status = "OCR chưa sẵn sàng"
        elif result.get("is_uncertain") or not result.get("printed_total"):
            status = "Cần đọc lại"
        else:
            status = "Xem nhanh"
        paid = result.get("printed_total") or None
        match = None
        if truth.get(path.name) and status == "Xem nhanh":  # ảnh thiếu nhãn tổng thì không chấm
            match = paid in truth[path.name]
            summary["xem_nhanh_dung" if match else "xem_nhanh_sai"] += 1
        summary[status] += 1
        print(json.dumps({
            "image": path.name,
            "ocr": result.get("ocr_engine"),
            "ocr_line_count": result.get("ocr_line_count"),
            "date": result.get("date"),
            "date_source": result.get("date_source"),
            "paid_total_vnd": paid,
            "quality": quality.get("quality_status"),
            "quality_reasons": quality.get("reasons"),
            "status": status,
            "truth_match": match,
        }, ensure_ascii=False))
    print(json.dumps({"summary": dict(summary), "total_images": len(args.images)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
