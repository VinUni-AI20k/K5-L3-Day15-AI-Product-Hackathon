# Canvas CP1 — 404ERROR · Track E

| # | Dòng | Nhóm điền |
|---|---|---|
| 1 | Track + lát cắt dự kiến | Track E · Tài chính · Nhật ký chi tiêu từ ảnh. |
| 2 | Người dùng chính | Người có hóa đơn sau khi mua sắm hoặc ăn uống và muốn xem lại chi tiêu theo ngày. |
| 3 | Pain một câu | Người muốn theo dõi chi tiêu hằng ngày phải nhập lại thông tin từ từng hóa đơn, nên dễ bỏ sót khoản chi và mất thời gian khi xem lại đã tiêu vào đâu. |
| 4 | Bằng chứng đầu | Trong 500 review của hai app ghi chi tiêu, **8/500 (1,6%)** nêu khó khăn khi ghi hoặc mong có cách nhập tự động, **5/500 (1,0%)** nêu khó tra cứu. Một review Money Lover đề xuất “gửi ảnh hóa đơn” để ghi chi tiêu. [Cách đếm và trích đoạn](evidence/data-mining.md). |
| 5 | Lát cắt một câu | Khi người dùng chụp một hóa đơn, AI đọc ngày mua và số tiền thực trả rồi phân loại khoản chi để người dùng xem nhanh và bấm Chốt một lần trước khi khoản chi xuất hiện trên lịch. |
| 6 | AI tự làm đến đâu + lý do | AI tự đọc và phân loại, rồi hiển thị ngày, số tiền và nhóm chi để xem nhanh. Người dùng bấm Chốt một lần để lưu. Nếu không rõ số thực trả, app báo Cần đọc lại. Tổng chỉ tính khoản đã chốt. |
| 7 | Phân công có tên | Nguyễn Quang Vũ code luồng nhận ảnh, tích hợp model và giao diện. Trịnh Công Đức viết spec, code kiểm dữ liệu nhập, lưu và tổng hợp. Nguyễn Tiến Đạt dựng hóa đơn mẫu và viết benchmark. Nguyễn Tuấn Kiệt phỏng vấn người dùng và viết tiêu chí chấm. |
| — | Đã đổi gì so với CP1 | Chuyển từ Track D sang Track E theo lát cắt chụp hóa đơn, xem nhanh và bấm Chốt một lần. Sàng 500 review, có 20 câu thử và chạy mô phỏng OCR/AI bằng CLI. Chỉ sau khi Chốt mới thấy khoản mới trong tổng ngày. |
