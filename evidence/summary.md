# Tổng hợp bằng chứng · Nhật ký chi tiêu từ ảnh hóa đơn

**Nguồn chính là review công khai, lấy ngày 27/11/2026.** Trong 500 review, 8 nêu ma sát khi ghi chi tiêu hoặc nhu cầu nhập tự động, 5 nêu khó khăn khi xem chi tiết hoặc lịch sử, và 12 nêu vấn đề khoản bị ghi thiếu, trùng hoặc sai tổng. Mẫu có trường hợp đề xuất dùng ảnh hóa đơn để ghi chi và trường hợp muốn sửa lỗi đọc ảnh. [Cách đếm và 5 trích đoạn có nguồn](data-mining.md).

**Kết luận:** review ủng hộ việc thử giảm bước nhập và xem từng khoản theo ngày. Dữ liệu này chưa xác nhận mức tiết kiệm thời gian hay tỷ lệ sử dụng thực tế. Số về impact trong spec là giả định cho một nhóm thử, cần đo lại khi có bản chạy thử.

**Bước kiểm chứng bổ sung:** nếu nhóm phỏng vấn, hỏi người từng tự theo dõi chi tiêu về lần gần nhất nhận hóa đơn, cách họ ghi, số bước, số phút, việc họ phải mở lại để tổng hợp và có từng bỏ sót khoản không. Ghi từng cuộc bằng mã P1, P2, P3. [Mẫu phỏng vấn](interviews/TEMPLATE.md)

**Khảo sát:** Đã thu **24 phản hồi** từ `27/11/2026 18:22` đến `27/11/2026 23:49` (đạt ngưỡng ≥20 người). Bản xuất đã bỏ cột SĐT/liên hệ cá nhân lưu tại [results.csv](survey/results.csv).
- **Tần suất & ma sát nhập:** `9/24 (37,5%)` phát sinh 10–20 lượt chi/tuần, `9/24 (37,5%)` từ 20 lượt/tuần trở lên; `8/24 (33,3%)` bỏ không ghi nữa vì lười/quên và `8/24 (33,3%)` mất từ 5 phút đến trên 15 phút mỗi lần tự tổng hợp.
- **Thói quen với hóa đơn:** `16/24 (66,7%)` bỏ luôn không giữ lại; `3/24 (12,5%)` giữ dồn cuối tuần/tháng mới cộng; `2/24 (8,3%)` chụp ảnh để đó rồi quên xem lại.
- **Điểm vướng chính (chọn nhiều):** `17/24 (70,8%)` chi tiêu rải rác khó gom theo từng ngày; `13/24 (54,2%)` quên khoản tiền mặt trong ngày; `12/24 (50,0%)` ngại nhập tay từng dòng hóa đơn vì tốn thời gian; `16/24 (66,7%)` tốn thời gian lục lại ảnh và lịch sử chuyển khoản.
- **Lý do bỏ app quản lý chi tiêu:** `14/24 (58,3%)` hay quên nhập ngay lúc mua, tối về không nhớ nổi; `11/24 (45,8%)` phải nhập tay quá nhiều thao tác mỗi lần chi.
- **Trích dẫn nguyên văn (ẩn danh):** *“Lười ghi một cái rồi quên bẵng đi, muốn dò lại thì ngại.”* · *“Mình hay quên nhập ngay lúc mua, tối về không nhớ hết các khoản tiền mặt nên dễ bỏ dở sau vài ngày.”* · *“Tốn thời gian tìm các mục chuyển khoản, nghĩ xem đã tiêu gì”* · *“quá nhiều khoản nhỏ lẻ, và t có thói quen hay ăn vặt, hay mua nước ngọt.”*

## Lịch phỏng vấn kiểm chứng CP3

Chưa có lịch hẹn được ghi nhận trong repo. Cập nhật vai và giờ khi người tham gia xác nhận.

| Vai dự kiến | Giờ hẹn |
|---|---|
| Người từng nhập hóa đơn vào sổ hoặc app chi tiêu | Chưa xác nhận |
| Người từng tổng hợp chi theo ngày hoặc tháng | Chưa xác nhận |
| Người từng bỏ sót khoản chi khi ghi thủ công | Chưa xác nhận |
