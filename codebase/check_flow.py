"""Kiểm 3 ca ghép luồng qua web API đang chạy: ảnh rõ → Chốt; ảnh mờ → Cần đọc lại; chụp trùng → không cộng trùng.

Chạy server với sổ tạm (không đụng CSDL/ thật), rồi gọi script này, ví dụ:
    SKYBILL_STORAGE_DIR=/tmp/csdl-thu SKYBILL_NO_BROWSER=1 python run.py &
    python codebase/check_flow.py http://127.0.0.1:8080 data/receipts/images/mcocr_public_145013tupze.jpg
"""
import base64
import io
import json
import sys
import urllib.error
import urllib.request

from PIL import Image, ImageFilter

BASE, IMG = sys.argv[1].rstrip("/"), sys.argv[2]
def call(path, body=None):
    req = urllib.request.Request(BASE + path, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req) as r: return r.status, json.load(r)
    except urllib.error.HTTPError as e: return e.code, json.load(e)
def data_url(raw): return "data:image/jpeg;base64," + base64.b64encode(raw).decode()
def day_total(d): return call(f"/api/summary/day?date={d}")[1]["total_spend"]
clear = open(IMG, "rb").read()
buf = io.BytesIO(); Image.open(IMG).filter(ImageFilter.GaussianBlur(6)).save(buf, "JPEG"); blurred = buf.getvalue()
print("health:", call("/api/health")[1]["ocr"]["engine_version"], "· sổ:", call("/api/health")[1]["receipts_count"], "khoản")
# Ca 1
st, scan = call("/api/receipts/scan", {"image_data_url": data_url(clear), "receipt_date": "2026-11-28", "source_mode": "upload"})
d = scan["draft"]; assert st == 200 and scan["validation"]["valid"], scan
before = day_total(d["date"])
print(f"[1] Xem nhanh: ngày {d['date']} ({d['date_source']}) · {d['merchant']} · {d['printed_total']}đ · nhóm {d['category']} · OCR {scan['ocr_engine']}")
st, conf = call("/api/receipts/confirm", {"draft_id": d["draft_id"], "total": d["printed_total"], "category": d["category"], "date": d["date"], "merchant": d["merchant"]})
after = day_total(d["date"])
print(f"[1] Chốt: duplicate={conf['duplicate']} · tổng ngày {before} → {after}")
assert not conf["duplicate"] and after == before + d["printed_total"]
# Ca 2
total_before = sum(r["total"] for r in call("/api/receipts")[1]["receipts"])
st, scan2 = call("/api/receipts/scan", {"image_data_url": data_url(blurred), "receipt_date": "2026-11-28", "source_mode": "upload"})
q = scan2.get("quality_report") or {}
print(f"[2] Ảnh mờ: valid={scan2['validation']['valid']} · draft={scan2['draft']} · chất lượng={q.get('quality_status')} {q.get('reasons')} · thiếu={scan2['validation']['missing_fields']}")
assert not scan2["validation"]["valid"] and scan2["draft"] is None
assert sum(r["total"] for r in call("/api/receipts")[1]["receipts"]) == total_before
print("[2] Tổng sổ không đổi:", total_before)
# Ca 3
st, scan3 = call("/api/receipts/scan", {"image_data_url": data_url(clear), "receipt_date": "2026-11-28", "source_mode": "upload"})
print(f"[3] Chụp lại cùng ảnh: duplicate_flag={scan3['validation']['duplicate_flag']} · cảnh báo={scan3['validation']['warnings']}")
st, conf3 = call("/api/receipts/confirm", {"draft_id": scan3["draft"]["draft_id"], "total": scan3["draft"]["printed_total"]})
print(f"[3] Chốt lần 2: duplicate={conf3['duplicate']} · tổng ngày vẫn {day_total(d['date'])}")
assert conf3["duplicate"] and day_total(d["date"]) == after
print("ĐẠT cả 3 ca")
