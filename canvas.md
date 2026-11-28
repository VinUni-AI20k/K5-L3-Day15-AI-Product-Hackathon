# Canvas — 404ERROR · Track E

> Bản cập nhật CP2 theo [guide 1.4](02-guide.md#b1-4). Lát cắt Track E ở bản CP1 đã sửa nằm trong [README mục CP1](README.md#cp1).

| # | Dòng | Nhóm điền |
|---|---|---|
| 1 | Track + lát cắt dự kiến | Track E · Tài chính · Nhật ký chi tiêu từ ảnh. |
| 2 | Người dùng chính (một vai cụ thể) | Người có hóa đơn sau khi mua sắm hoặc ăn uống và muốn xem lại chi tiêu theo ngày. |
| 3 | Pain một câu (ai · đang làm gì · vướng đâu · hậu quả) | Người muốn theo dõi chi tiêu hằng ngày phải nhập lại thông tin từ từng hóa đơn, nên dễ bỏ sót khoản chi và mất thời gian khi xem lại đã tiêu vào đâu. |
| 4 | Bằng chứng đầu (CP1 giả thuyết + nguồn sẽ kiểm · CP2 số đầu tiên + 1 trích dẫn) | Trong 500 review của hai app ghi chi tiêu, **8/500 (1,6%)** nêu khó khăn khi ghi hoặc mong có cách nhập tự động, **5/500 (1,0%)** nêu khó tra cứu. Một review Money Lover đề xuất “gửi ảnh hóa đơn” để ghi chi tiêu. [Cách đếm và trích đoạn](evidence/data-mining.md). |
| 5 | **Lát cắt MỘT CÂU** (1 người dùng · 1 việc · 1 quyết định AI · 1 kết quả) | Khi người ghi chi tiêu cá nhân chụp một hóa đơn, AI chọn nhóm chi dựa trên nội dung hóa đơn để họ có một khoản chi trên lịch sau khi bấm Chốt. |
| 6 | AI tự làm đến đâu + 1 dòng lý do (sai thì ai chịu gì) | AI đọc hóa đơn và gợi ý nhóm chi. Người dùng xem nhanh ngày, số thực trả và nhóm trước khi bấm Chốt vì đọc sai số tiền sẽ làm lệch tổng chi của họ. Nếu không rõ số thực trả, app báo Cần đọc lại. |
| 7 | Phân công có tên | Nguyễn Quang Vũ code luồng nhận ảnh, tích hợp model và giao diện. Trịnh Công Đức viết spec, code kiểm dữ liệu nhập, lưu và tổng hợp. Nguyễn Tiến Đạt dựng hóa đơn mẫu và viết benchmark. Nguyễn Tuấn Kiệt phỏng vấn người dùng và viết tiêu chí chấm. |
| — | *(CP2)* Đã đổi gì so với CP1 | Thêm bước xem nhanh và bấm Chốt một lần trước khi lưu khoản chi vào lịch. Khoản đã chốt được tính vào tổng ngày. CP2 có 20 câu thử và luồng mô phỏng OCR/AI bằng CLI. |
