# Data card — dữ liệu bản chạy thử dùng

> Điền ở guide bước 2.4 (bản đầu ở CP2, đủ ở CP3). Ôn lại: ngày 6 · lab ngày 6. Chấm ở rubric R4.
> Một trang. Mỗi dataset một mục. Dữ liệu chạy thử (bài mẫu, thông báo mẫu, đoạn transcript…) để trong thư mục `data/` này.
> Không commit nguyên tài liệu khoá, dữ liệu cá nhân thật hay nguyên file data BTC cấp — chỉ đoạn trích ngắn, bản viết lại, hoặc số đã tổng hợp.

## Dataset 1 · Đơn và chính sách D1 giả lập

| | |
|---|---|
| Dùng để làm gì | nguồn cho công cụ và bộ thử; không dùng làm bằng chứng pain |
| Từ đâu | Dữ liệu giả lập viết với hỗ trợ AI; không dùng data BTC hay đơn thật |
| Xử lý những bước gì | Viết tay JSON; không dùng ngẫu nhiên nên không có seed; không chia tập |
| Số dòng / số đoạn | 2 đơn, 4 món, 1 chính sách |
| Phiên bản / ngày lấy | bản nháp CP2 |
| Nhãn | `synthetic` |
| Giới hạn | chỉ hai đơn, chưa phản ánh phân bố thực; không chứa dữ liệu cá nhân. Schema: orders[id, items[name, price]], policy[max_vnd, description]; giá VND. Kiểm tra cấu trúc và số lượng bằng code; chưa có kết quả kiểm tra thủ công của thành viên. |

**Data `synthetic` (nhóm tự sinh):** viết tay; seed không áp dụng; người kiểm và số dòng đã kiểm tay: chưa xác nhận. Data tự dựng **không phải bằng chứng pain**.

## Dataset 2 · Chưa có
