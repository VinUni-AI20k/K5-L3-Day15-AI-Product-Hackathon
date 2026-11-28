# Data Card · Nhật ký chi tiêu từ ảnh (`synthetic`)

> Điền ở guide bước 2.4 (bản đầu ở CP2, đủ ở CP3). Ôn lại: ngày 6 · lab ngày 6. Chấm ở rubric R4.
> Dữ liệu chạy thử đặt trong thư mục `data/`. Không dùng sao kê, hóa đơn thật hoặc thông tin cá nhân thật của bất kỳ ai.
> Bằng chứng người dùng nằm ở [evidence/summary.md](../evidence/summary.md).

## Tổng quan luồng dữ liệu thử nghiệm

| Mục | Nội dung đã dựng |
|---|---|
| Mục đích | Thử luồng chụp hóa đơn, xem nhanh và chỉ ghi sau thao tác Chốt, báo **Cần đọc lại** khi dữ liệu chưa chắc, chống cộng trùng theo mã lượt chụp, và tổng hợp theo ngày/tháng trên lịch kiểu Locket |
| Nguồn | Nhóm tự dựng bộ dữ liệu tiếng Việt giả lập có `seed = 42` ([seed_expenses.py](seed_expenses.py) → [expenses.json](expenses.json)), tên cửa hàng dựng và đơn vị `VND` |
| Ca thử | Hóa đơn rõ, ảnh mờ/bị cắt, nhiều mức tổng chưa phân biệt thực trả, thiếu ngày, xử lý lại cùng mã lượt chụp (`capture_id`), ngày không chi tiêu (`0đ`), ngoài phạm vi (đầu tư, OTP/số thẻ) |
| Nhãn dữ liệu | `id`, `capture_id`, `date` (kèm `date_source`), `merchant`, `category` (6 nhóm + `không rõ`), `items`, `total` (VND nguyên), `note`, `source_type` |
| Phiên bản | v1.1 · đồng bộ CP2 ngày 27/11/2026 (`seed = 42`) |
| Giới hạn | Dữ liệu `synthetic` chỉ dùng chạy thử kỹ thuật (**KHÔNG tính là bằng chứng pain**); ở bản CP2 ảnh hóa đơn mô phỏng qua text/OCR đầu vào, bộ ảnh chụp mẫu dự kiến bổ sung ở `data/receipts/` |

## Dataset 1 · Nhật ký hóa đơn & chi tiêu giả lập (`data/expenses.json`)

| | |
|---|---|
| Dùng để làm gì | Dữ liệu nền cho `codebase/tools.py` (`get_day_summary`, `aggregate_period`, `compare_periods`, `save_daily_note`) và đối chiếu đáp án `eval/benchmark.csv`. |
| Từ đâu | Sinh có `seed = 42` từ [data/seed_expenses.py](seed_expenses.py) theo ngữ cảnh Track E (Tài chính). |
| Xử lý những bước gì | Sinh 2 tháng (`2026-10` và `2026-11`), gắn `capture_id` (`CAP-001`..`CAP-085`), tên cửa hàng dựng (`HIGHLANDS*Q1`, `Circle K Mẫu`, `BACH HOA XANH M1`, `Grab*Bike`…), chừa ngày `0đ`, chèn ca chi lớn `2026-11-11` và ca `không rõ` (`2026-11-20`, `2026-11-22`). Không chứa SĐT, STK, OTP hay tên người thật. |
| Số dòng / số đoạn | **85** bản ghi (`EXP-001`..`EXP-085`), phủ **6** nhóm chi tiêu + `không rõ`. |
| Kiểm tra thủ công | Chạy `python data/seed_expenses.py`: tổng `2026-10` = `7.994.000 VND`, `2026-11` = `8.384.000 VND`, ngày `2026-11-15` = `516.000 VND` (`3` khoản). |

## Dataset 2 · Bộ câu thử (`eval/benchmark.csv`)

| | |
|---|---|
| Dùng để làm gì | Đo chất lượng qua `python run.py eval`. |
| Từ đâu | Kết hợp tình huống tự viết, seed 42 và 7 tình huống chuyển thể từ [review công khai](../evidence/data-mining.md). Số tiền, mốc ngày và mã lượt chụp trong benchmark là dữ liệu mẫu. |
| Số dòng | **20** câu thử CP2 (`thuong`: 8 · `kho`: 8 · `tu_choi`: 4, gồm 2 câu tấn công + ca OTP/số thẻ). |
| Giới hạn | Hiện có 7/20 tình huống chuyển thể từ review. CP3 cần kiểm lại các câu trên ảnh chụp hóa đơn giả lập hoặc dữ liệu mẫu phù hợp, đồng thời duy trì tỷ lệ nguồn thật ít nhất 1/3. |

## Lưu trong bản chạy thử

Web và CLI lưu hóa đơn sau khi người dùng Chốt vào `CSDL/receipts.json` (khởi tạo từ `data/expenses.json`, không commit; đổi thư mục bằng `SKYBILL_STORAGE_DIR`). Mỗi câu eval/simulate dùng sổ tạm riêng là bản sao `data/expenses.json` để ổn định đáp án.
