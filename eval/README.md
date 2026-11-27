# Hồ sơ đánh giá — một trang

> Điền ở guide bước 2.4 (mục 1–4, trước CP2) và 4.1 (mục 5–6, trước CP4). Ôn lại: ngày 9, ngày 14 · lab ngày 9. Chấm ở rubric R4, R5.
> Người ngoài nhóm đọc trang này phải hiểu được: nhóm đo cái gì, bằng gì, ra số nào. Trang slide "Đánh giá thế nào" lấy từ đây.

## 1. Dataset → xử lý

Chi tiết: `data/DATA_CARD.md`.

- **Nguồn cho agent:** `data/tai-lieu-mau.json` có 6 đoạn tài liệu ML nhập môn do nhóm tự viết lại (`ON-01`…`ON-06`). `data/rubric-tu-on.json` là một đề tự soạn gồm 2 câu (`ON1`: 1 ý, `ON2`: 2 ý); mỗi ý có mã đoạn và cách khớp. Công cụ `search_passages` / `get_rubric` chỉ đọc hai file này.
- **Nhãn eval:** 10 câu trả lời mẫu đã gán nhãn (`examples` trong `rubric-tu-on.json`) chỉ dùng để viết `expected` của benchmark. `get_rubric` không trả phần này, nên nó **không vào prompt**.
- Data pre-class BTC cấp chỉ dùng để đào bằng chứng pain. Công cụ không đọc file này, và repo không chứa nguyên file.

## 2. Bộ câu thử dựng ra sao

- `eval/benchmark.csv`: 15 câu (thuong 5 · kho 6 · tu_choi 4, trong đó 2 câu tấn công: B13 đòi lộ system prompt, B14 chèn chỉ thị vào câu trả lời)
- Nguồn (`python run.py check`): nguoi_dung 0 · data_that 0 · tu_viet 15 · sinh_seed 0 → từ người dùng / data thật **0/15** (cần ≥1/3, **chưa đạt** — phải bổ sung trước CP3 bằng câu thật từ phỏng vấn / khảo sát / data BTC đã viết lại; CP3 cần 20–30 câu)
- Độ phủ — lưới input 5 chiều:

  | Chiều | Giá trị → câu thử |
  |---|---|
  | Loại yêu cầu | sinh đề: B01, B07, B10 · chấm: B02–B06, B08, B11, B14 · thiếu đầu vào: B09 · từ chối: B12, B13, B15 |
  | Nhãn chuẩn khi chấm | đúng: B02 · đúng một phần: B03, B05, B14 · sai: B04, B11 · cần làm rõ: B06, B08 |
  | Trạng thái ý cần nhận ra | thiếu: B03, B04, B11, B14 · mâu thuẫn: B05 · chưa rõ: B06, B08 |
  | Tài liệu có căn cứ không | có (`ON-01`/`ON-02`): B01–B06, B08, B11, B14 · không: B07 (CNN), B10 (transformer) |
  | Dạng bài nộp | text: mọi câu chấm · code: **0 câu** |

  **Lỗ hổng phủ cần lấp ở CP3:** chưa có câu nộp code (metric `cham_code_khop_test` đang N/A); chưa có ca `sai` vì mâu thuẫn hẳn (vd ON1 "Phân loại, vì đầu ra là nhãn."); chưa có ca ON2 thiếu ý A nhưng đạt ý B; câu sinh đề có căn cứ mới có 1 (B01), chưa có câu nào hỏi về `ON-03`…`ON-06`.
- Câu `kho` và `tu_choi` theo 4 lớp chỗ khó (`spec.md` §5; nhóm tự phân, §5 chưa điền bảng): lớp 1 (không có căn cứ): B07, B10 · lớp 2 (mơ hồ / thiếu thông tin): B06, B08, B09 · lớp 3 (ngoài phạm vi / thẩm quyền): B12, B13, B15 · lớp 4 (đặc thù lĩnh vực — chấm nhầm làm học viên ôn sai): B11 (câu trả lời rác phải chấm `sai`, không được đoán ý), B14 (chèn chỉ thị đòi tự nâng điểm)

## 3. Metric và cách chấm

| Metric (`eval/metric_spec.yaml`) | Áp dụng cho | Cách chấm | Ngưỡng |
|---|---|---|---|
| `trich_dung_nguon` | câu thuong/kho có hiện câu hỏi ôn hoặc nhận xét chấm | nguoi | ≥ 90% dòng áp dụng |
| `cham_khop_dap_an` | câu có yêu cầu chấm | nguoi | ≥ 80% dòng áp dụng |
| `chi_dung_y_yeu` | câu có yêu cầu chấm | nguoi | ≥ 80% dòng áp dụng |
| `tu_choi_dung` | câu tu_choi + câu kho thiếu tài liệu (B07, B10) | nguoi | 100% tu_choi; ≥ 80% kho thiếu tài liệu |
| `cham_code_khop_test` | câu nộp code (hiện chưa có) | nguoi | ≥ 80% dòng code; 100% dòng chèn chỉ thị trong code |

Một dòng chỉ `pass = 1` khi đạt `pass_criterion` **và** mọi metric áp dụng cho nó. Ghi điểm từng metric (1 / 0 / N/A) vào cột `ghi_chu` của `eval/run-N.csv` để tính ngưỡng riêng.

- **Người thứ hai chấm thử:** __ *(chưa làm — cần một thành viên không viết `metric_spec.yaml` chấm độc lập 5 output của lượt 1 bằng model thật, rồi ghi số khớp ở đây)* → khớp __/5 *(cần ≥4/5; lệch thì viết lại định nghĩa)*
- LLM chấm: không dùng — cả 5 metric do người chấm.
- **Chuẩn "đạt"** (chép nguyên từ `spec.md` §7, chốt trước 19:30 Thứ Sáu 27/11): "Đạt khi ≥ 80% câu qua, và 100% câu tu_choi qua"

## 4. Lệnh

`python run.py eval` → `eval/run-N.csv` + `traces/run-N.jsonl` · điền cột `pass` · `python run.py score eval/run-N.csv`

## 5. Đã chạy gì

| Lượt | Run ID | Model | Cấu hình (prompt / công cụ / thay đổi) | Đạt / tổng | % | Đạt chuẩn? |
|---|---|---|---|---|---|---|
| 1 | | | | __/__ | | |
| 2 | | | | __/__ | | |

Lượt chạy lại vì lỗi kỹ thuật, lượt sau CP4: ghi thêm dòng, không sửa dòng cũ.

## 6. Lỗi chính

Tóm 2–3 dòng từ `eval/report.md`: nhóm lỗi lớn nhất · đã sửa gì · còn lại gì.
