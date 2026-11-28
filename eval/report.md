# Báo cáo đánh giá — lượt 1 → một cải tiến → lượt 2

> Điền ở guide bước 4.1. Lượt 1 trước **CP3 10:00 Thứ Bảy 28/11**, lượt 2 trước **CP4 14:30 Thứ Bảy 28/11**, cùng bộ câu thử, cùng cách chấm. Chấm ở rubric R5.
> Số lấy từ `python run.py score eval/run-1.csv` (và `run-2.csv`) sau khi điền cột `pass`. **Kết quả thấp ghi thật vẫn đủ điểm.**
> Không được: sửa chuẩn "đạt", bỏ câu thử trượt, sửa `expected` cho khớp output, sửa kết quả lượt đã chạy.

## 1. Kết quả

| Lượt | Run ID | Đạt / tổng | % | thuong | kho | tu_choi | So với chuẩn "đạt" |
|---|---|---|---|---|---|---|---|
| 1 | `run-1@20261128-095827` | 8/30 | 27% | 1/10 (10%) | 6/14 (43%) | 1/6 (17%) | chưa |
| 2 | | __/__ | | __/__ | __/__ | __/__ | đạt / chưa |

Kết quả từng câu: `eval/run-1.csv`, `eval/run-2.csv`. Trace: `traces/run-1.jsonl`, `traces/run-2.jsonl`.

## 2. Lỗi lượt 1 — gom thành nhóm có tên

| Nhóm lỗi | Số câu | Câu |
|---|---|---|
| Chặn sớm do giá dưới giá sàn page mặc định `Dịu Mây` (`< 540.000đ`) | 19 | `B01`–`B06`, `B08`–`B09`, `B13`–`B16`, `B18`–`B24` |
| Mã sản phẩm không có trong `data/inventory.csv` | 1 | `B07` |
| Chưa chuẩn hóa tên cột lệch chuẩn dạng text trong `answer()` | 1 | `B17` |
| AI bỏ sót trường dữ kiện (`chat_lieu: Polyester`) khi viết bài | 1 | `B25` |

**≥3 lỗi cụ thể:**

| Câu | Input | Output | Vì sao sai |
|---|---|---|---|
| `B01` | `Mã SP: AO-01 \| Giá: 199000 \| Page: Thời trang nam nữ` | `ĐÁNH DẤU: gia_ban: 199.000đ dưới giá sàn 540.000đ của page Dịu Mây` | Bộ câu thử cũ dùng giá `< 540k` và page không khớp `data/pages.json` nên bị chặn sớm thay vì tạo bài nháp |
| `B17` | `Ma_Hang: AO-17 \| Đơn giá: 160.000đ \| KichCo: S` | `ĐÁNH DẤU: gia_ban: thiếu giá bán; size: thiếu size` | `answer()` chưa map tên cột lệch chuẩn (`Đơn giá`, `KichCo`) như khi đọc file Excel |
| `B25` | `ma_sp: G5V6071502 \| gia_ban: 1.950.000đ \| chat_lieu: Polyester` | `VIẾT ... Giá chỉ 1.950.000đ ... size S, M, L, XL, 2XL ...` | AI viết đúng giá, size, xưng hô nhưng bỏ sót chất liệu `Polyester` |

## 3. Một lần cải tiến

- Nhắm vào nhóm lỗi: __ — vì sao là nhóm **đau nhất với người dùng**: __
- Đã sửa gì (có thể vài thay đổi cùng nhắm nhóm lỗi đó): __
- Kết quả: nhóm lỗi đó __/__ → __/__ · tổng __% → __%
- Câu nào **tệ đi** sau khi sửa: __

## 4. Còn lại

- Lỗi chưa sửa + nguy hiểm thế nào:
  1. `B17` (`answer()` chưa map tên cột lệch chuẩn dạng text như `Đơn giá`, `KichCo`) khiến dữ liệu nhập tay bị đánh dấu thiếu giá/size dù có đủ thông tin.
  2. `B25` (AI đôi lúc bỏ sót trường chất liệu `Polyester` khi viết bài) — dễ làm thiếu thông số sản phẩm trên Fanpage nếu người duyệt không đọc kỹ.
  3. Bộ câu `B01–B24` tự viết trước đó dùng giá `< 540.000đ` và tên page khác `data/pages.json`, cần đồng bộ hoặc bổ sung thêm câu `data_that` để đo đúng từng kịch bản ở Lượt 2.
- Nếu có thêm thời gian (cho Lượt 2 / CP4): bổ sung kiểm tra bắt buộc đủ trường dữ kiện (`chat_lieu`) trong `verify_post`, chuẩn hóa alias cột trong `answer()`, và chạy `python run.py simulate` để hoàn thiện bài toán chi phí.
