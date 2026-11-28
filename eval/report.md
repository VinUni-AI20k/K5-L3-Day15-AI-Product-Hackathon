# Báo cáo đánh giá — lượt 1 → một cải tiến → lượt 2

> Điền ở guide bước 4.1. Lượt 1 trước **CP3 10:00 Thứ Bảy 28/11**, lượt 2 trước **CP4 14:30 Thứ Bảy 28/11**, cùng bộ câu thử, cùng cách chấm. Chấm ở rubric R5.
> Số lấy từ `python run.py score eval/run-1.csv` (và `run-2.csv`) sau khi điền cột `pass`. **Kết quả thấp ghi thật vẫn đủ điểm.**
> Không được: sửa chuẩn "đạt", bỏ câu thử trượt, sửa `expected` cho khớp output, sửa kết quả lượt đã chạy.

## 1. Kết quả

| Lượt | Run ID | Đạt / tổng | % | thuong | kho | tu_choi | So với chuẩn "đạt" |
|---|---|---|---|---|---|---|---|
| 1 | `run-1@20261128-095527` | 20/20 | 100% | 8/8 | 8/8 | 4/4 | đạt (chuẩn ≥85%) |
| 2 | | __/__ | | __/__ | __/__ | __/__ | đạt / chưa |

Kết quả từng câu: `eval/run-1.csv`, `eval/run-2.csv`. Trace: `traces/run-1.jsonl`, `traces/run-2.jsonl`.

**Phép đo bổ sung ngoài bộ 20 câu thử (40 ảnh MC-OCR có nhãn, `data/receipts/mcocr_sample_40.csv`):**
- Đường cơ sở Tesseract một mình (`eval/image-check-tesseract.jsonl`): **6/40 đúng** (7 `Xem nhanh`: 6 đúng, 1 sai; 33 `Cần đọc lại`).
- Trước cải tiến — Tesseract + model đọc ảnh `gpt-5.4-nano` (`eval/image-check-before.jsonl`): **25/40 đúng** (27 `Xem nhanh`: 25 đúng, 2 sai; **13 `Cần đọc lại`**; `44,816` token vào / `1,314` token ra).

## 2. Lỗi lượt 1 — gom thành nhóm có tên

> Lượt 1 trên bộ 20 câu chữ đạt 20/20 (0 lỗi). Theo hướng đã chốt cho CP4, các lỗi và nhóm lỗi dưới đây lấy từ **phép đo 40 ảnh MC-OCR** (`eval/image-check-before.jsonl`, đo ngoài bộ câu thử).

| Nhóm lỗi | Số ảnh | Ảnh |
|---|---|---|
| 1. Cần đọc lại oan (OCR cục bộ mất số / không khớp kiểm chéo dù ảnh có tổng) | 11 | `cllbf`, `uexmk`, `ghudu`, `jixhn`, `mppzy`, `pevvt`, `pkgap`, `tzbvy`, `uzdqt` (9 ảnh OCR không ra tổng/không có token khớp) + `skwtp`, `lukeo` (2 ảnh mâu thuẫn OCR–model) |
| 2. Mâu thuẫn giữa tổng OCR cục bộ và model (bị đẩy về Cần đọc lại) | 3 | `skwtp` (OCR đúng `139.200`, model lệch), `lukeo` (OCR sai `28.000` vs `25.000`), `cllbf` (OCR sai `253.000.000` vs `253.000`) |
| 3. Đọc sai chữ số nhưng lọt kiểm chéo (`Xem nhanh` sai) | 2 | `niqeq` (`60.582` thay vì `60.500`), `zxdlo` (`510.760` — nhãn CSV dính `UHD510510.760` nên bị tính `510.510`) |

*(2 ảnh `Cần đọc lại` còn lại là `hpikq` và `wbtei`: nhãn `mcocr_sample_40.csv` không có số tiền tổng nên giữ `Cần đọc lại` là hợp lý.)*

**≥3 lỗi cụ thể:**

| Ảnh | Input | Output | Vì sao sai |
|---|---|---|---|
| `mcocr_public_145014pevvt.jpg` | Ảnh hóa đơn MINIMART ANAN (`thuong`, quality `0.8424`, truth `Tổng cộng \| 75,500`) | `paid_total_vnd: null`, `status: "Cần đọc lại"` | Ảnh rõ nhưng Tesseract không bắt được đúng dòng/token `75500` nên `read_paid_total()` trả `0` và kiểm chéo `_digits_seen_in_ocr()` chặn kết quả model. |
| `mcocr_public_145014lukeo.jpg` | Ảnh hóa đơn MINIMART ANAN (`thuong`, quality `0.7879`, truth `Tổng cộng: \| 25,000`) | `paid_total_vnd: null`, `status: "Cần đọc lại"` (Tesseract một mình ra `28,000`) | Tesseract đọc nhầm `25,000` thành `28,000`; `agent.py` thấy số model đọc khác `ocr_total` (`28000`) nên đánh mâu thuẫn và ép `Cần đọc lại`. |
| `mcocr_public_145013skwtp.jpg` | Ảnh hóa đơn MINIMART ANAN (`thuong`, quality `0.8039`, truth `Tổng cộng: \| 139,200`) | `paid_total_vnd: null`, `status: "Cần đọc lại"` (Tesseract một mình ra `139,200`) | Tesseract đọc đúng `139,200`, nhưng model đọc nhầm sang số khác (vd tiền khách đưa `500,000`) nên bị luật kiểm chéo `total == ocr_total` chặn về `Cần đọc lại`. |
| `mcocr_public_145013niqeq.jpg` | Ảnh hóa đơn VinCommerce (`kho`, quality `0.4410`, truth `TỔNG TIỀN PHẢI T.TOÁN \| 60,500`) | `paid_total_vnd: 60582`, `status: "Xem nhanh"` (`truth_match: false`) | Tesseract và model cùng đọc nhầm chữ số cuối (`60.582` thay vì `60.500`), nên lọt qua kiểm chéo `_digits_seen_in_ocr()` và hiện sai ở `Xem nhanh`. |

## 3. Một lần cải tiến

- Nhắm vào nhóm lỗi: **Nhóm 1 — Cần đọc lại oan** (11/40 ảnh có nhãn tổng rõ nhưng bị ép `Cần đọc lại`) — vì sao là nhóm **đau nhất với người dùng**: chiếm tỉ lệ lỗi lớn nhất (11/13 ca `Cần đọc lại`), xảy ra ngay cả trên 5 ảnh rõ (`thuong`, quality 0.79–0.84) và làm hỏng trải nghiệm cốt lõi "chụp một lần, xem nhanh rồi Chốt".
- Đã sửa gì (có thể vài thay đổi cùng nhắm nhóm lỗi đó): __
- Kết quả: nhóm lỗi đó __/__ → __/__ · tổng __% → __%
- Câu nào **tệ đi** sau khi sửa: __

## 4. Còn lại

- Lỗi chưa sửa + nguy hiểm thế nào: __
- Nếu có thêm 1 tuần: __
