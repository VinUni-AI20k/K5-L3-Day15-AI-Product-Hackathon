# Số đào từ file vận hành của shop (tự sinh bởi `scripts/build_data.py`)

Nguồn: sheet `Đăng bài Order` + `Đăng bài BOT` (bài Facebook đã soạn bằng AI và đăng) và sheet `Soi đơn lệch KM`.
Repo chỉ chứa số tổng hợp; file gốc để ngoài repo. Cách đếm: regex trong script, phần thân bài (bỏ 2 dòng cam kết 🌸/🔰).

| Chỉ số | Giá trị | Cách đếm |
|---|---|---|
| Số bài có nội dung | 4671 | ô `Content AI` ≥ 40 ký tự |
| Bài có nêu **giá** trong thân bài | 0/4671 (0.0%) | regex số + k/đ/tr hoặc 3 số.3 số |
| Bài có nêu **size** | 0/4671 (0.0%) | regex size/S/M/L/XL… |
| Bài có nêu **chất liệu** | 167/4671 (3.6%) | từ điển 16 chất liệu |
| Bài dùng chung khối cam kết cuối bài | 4671/4671 (100.0%) | chứa "kiểm tra hàng trước khi thanh toán" |
| Bài có câu mở đầu trùng với ≥1 bài khác | 478/4671 (10.2%) | so dòng đầu, chữ thường (4353 câu mở đầu khác nhau) |
| Mã cuối bài (🔰) khớp đúng 1 mã của dòng | 147/4650 | so với cột `Mã` cùng dòng |
| Mã cuối bài chỉ là phần đầu của mã | 4483/4650 | vd `GLO61113` ↔ `GLO6111308` |
| Mã cuối bài **không khớp** mã nào | 20/4650 | ví dụ: G5B606260 ↔ G5D6062601, G5D6062602; G5D60718 ↔ G5D6070717, G5D6070718; G5Q60717 ↔ G5Q6070716, G5Q6070717; G5A60714112 ↔ G5A6071412, G5A6071413; GRV607182 ↔ GRV6071801, GRV6071802 |
| Bài đăng lỗi (❌) | 62/4671 (1.3%) | cột `Trạng thái Đăng bài` |
| Cột Duyệt | Lên lịch: 3409, Đăng luôn: 1230, (trống): 32 | đếm giá trị |
| Đơn tại quầy giảm **lệch** mức khuyến mãi quy định | 14/299 (4.7%) | dòng tiêu đề sheet `Soi đơn lệch KM` (soi từ 01/10/2026) |

Đọc: bài hiện tại gần như không mang dữ kiện sản phẩm (giá/size/chất liệu nằm trong ảnh), mở đầu lặp lại, và mã cuối bài có chỗ không khớp. Đây là số từ data, chưa phải lời người dùng — cần phỏng vấn để kiểm lại.
