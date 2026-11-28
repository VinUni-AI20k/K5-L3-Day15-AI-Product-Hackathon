"""Kiểm OCR cục bộ trên tệp ảnh, không ghi sổ hoặc in nội dung nhận diện cá nhân."""

import argparse
import collections
import csv
import datetime
import json
import re
from pathlib import Path

from document_ocr import GetOcrEnvironmentStatus, ScanReceiptImageBytes


def main():
    parser = argparse.ArgumentParser(description="Đọc ảnh hóa đơn và kiểm trạng thái Cần đọc lại")
    parser.add_argument("--capture-date", type=datetime.date.fromisoformat, default=datetime.date.today())
    parser.add_argument("--truth", type=Path, help="CSV nhãn MC-OCR (img_id,total_cost) để đối chiếu tổng tiền")
    parser.add_argument("images", nargs="+", type=Path)
    args = parser.parse_args()
    truth = {}
    if args.truth:
        with args.truth.open(encoding="utf-8-sig") as handle:
            for row in csv.DictReader(handle):
                truth[row["img_id"]] = {int(re.sub(r"\D", "", n)) for n in re.findall(r"\d{1,3}(?:[., ]\d{3}(?!\d))+|\d{4,}", row["total_cost"])}
    summary = collections.Counter()
    environment = GetOcrEnvironmentStatus()
    print(json.dumps({
        "ocr": environment["engine_version"],
        "onnx_detection": environment["det_model_exists"],
        "onnx_recognition": environment["rec_model_exists"],
    }, ensure_ascii=False))
    for path in args.images:
        try:
            result = ScanReceiptImageBytes(path.read_bytes(), args.capture_date.isoformat(), SourceMode="upload")
        except (OSError, ValueError) as error:
            print(json.dumps({"image": path.name, "error": str(error)}, ensure_ascii=False))
            continue
        quality = result.get("quality_report", {})
        if result.get("blocked"):
            status = "Từ chối thông tin bảo mật"
        elif not result.get("ocr_engine_available"):
            status = "OCR chưa sẵn sàng"
        elif result.get("is_uncertain"):
            status = "Cần đọc lại"
        else:
            status = "Xem nhanh"
        paid = result.get("printed_total") or None
        match = None
        if path.name in truth and status == "Xem nhanh":
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
