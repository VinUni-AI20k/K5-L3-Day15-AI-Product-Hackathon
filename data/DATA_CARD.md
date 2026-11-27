# Data card — dữ liệu bản chạy thử dùng

> Điền ở guide bước 2.4 (bản đầu ở CP2, đủ ở CP3). Ôn lại: ngày 6 · lab ngày 6. Chấm ở rubric R4.
> Một trang. Mỗi dataset một mục. Dữ liệu chạy thử đặt trong thư mục `data/`.
> Không dùng sao kê, hóa đơn thật hoặc thông tin cá nhân thật của bất kỳ ai.

## Dataset 1 · Nhật ký hóa đơn & chi tiêu giả lập (`data/expenses.json`)

| | |
|---|---|
| Dùng để làm gì | Nguồn dữ liệu nền cho các công cụ trong `codebase/tools.py` (`get_day_summary`, `get_month_calendar`, `analyze_spending`, `save_daily_note`) và dựng bộ câu thử `eval/benchmark.csv`. |
| Từ đâu | Nhóm tự thiết kế và sinh ngẫu nhiên có `seed = 42` bằng script [data/seed_expenses.py](seed_expenses.py), mô phỏng hóa đơn chụp ảnh và note chi tiêu hằng ngày theo ngữ cảnh Track E (Tài chính). |
| Xử lý những bước gì | Sinh 2 tháng (`2026-10` và `2026-11`), gắn tên cửa hàng dựng (`Cơm Tấm Mẫu Q1`, `HIGHLANDS*Q1`, `Circle K Mẫu`, `BACH HOA XANH M1`, `Grab*Bike`…), chừa một số ngày không chi tiêu giống lịch Locket, chèn ca chi lớn bất thường (`2026-11-11`), chuyển khoản thiếu nội dung và hóa đơn mờ gắn nhãn `không rõ`. Không chứa SĐT, STK hay tên người thật. |
| Số dòng / số đoạn | **85** bản ghi (`EXP-001` đến `EXP-085`), phủ **6** nhóm chi tiêu (`Ăn uống`, `Di chuyển`, `Mua sắm`, `Hóa đơn & Nhà ở`, `Sức khỏe`, `Giải trí`) + nhóm `không rõ`. |
| Phiên bản / ngày lấy | v1.0 · sinh ngày 27/11/2026 (`seed = 42`). |
| Nhãn | `synthetic` |
| Giới hạn | Dữ liệu do nhóm tự sinh nên không phản ánh phân bố thu nhập/chi tiêu thực tế ngoài đời; **data `synthetic` này chỉ dùng để chạy thử kỹ thuật, KHÔNG tính là bằng chứng pain**. Phần ảnh chụp hóa đơn ở bản CP2 được mô phỏng bằng văn bản OCR / mô tả hóa đơn đầu vào để kiểm tra luồng bóc tách và cộng trừ bằng code. |

**Kiểm tra thủ công `synthetic`:** chạy `python data/seed_expenses.py` kiểm tổng tháng (`2026-10`: 7.994.000 VND; `2026-11`: 8.384.000 VND) và đối chiếu tay các ngày tiêu biểu (`2026-11-11`, `2026-11-15`, `2026-11-20`, `2026-11-23`).

## Dataset 2 · Mẫu câu nhập hóa đơn & truy vấn lịch chi tiêu (`eval/benchmark.csv`)

| | |
|---|---|
| Dùng để làm gì | Đo chất lượng bản chạy thử qua `python run.py eval`. |
| Từ đâu | Nhóm tự viết (`tu_viet`) kết hợp truy vấn đối chiếu số từ dữ liệu `synthetic` (`sinh_seed`, `seed = 42`). |
| Xử lý những bước gì | Chia theo lưới tình huống: nhập hóa đơn đủ thông tin, xem ngày kiểu Locket (có chi tiêu / 0đ), phân tích & so sánh tháng, hóa đơn mờ/thiếu giá hoặc thiếu ngày (`kho`), từ chối tư vấn đầu tư / xem dữ liệu người khác / ép ghi khống (`tu_choi`). |
| Số dòng / số đoạn | **14** câu thử bản đầu CP2 (`thuong`: 5 · `kho`: 6 · `tu_choi`: 3). |
| Phiên bản / ngày lấy | v1.0 · lập ngày 27/11/2026 (sẽ bổ sung thêm câu từ người dùng thật ở CP3 lên 20–30 câu). |
| Nhãn | `synthetic` / `tu_viet` |
| Giới hạn | Chưa có câu lấy trực tiếp từ phỏng vấn người dùng thật ở bản đầu CP2; cần bổ sung ít nhất 1/3 câu `nguoi_dung` / `data_that` trước CP3. |
