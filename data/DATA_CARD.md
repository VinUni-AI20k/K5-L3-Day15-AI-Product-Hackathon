# Data card — dữ liệu bản chạy thử dùng

> Bản đầu CP2 (27/11/2026). Mọi dữ liệu ở đây là **`synthetic` / nhóm tự viết**: không có file sản phẩm, tồn kho, bài đăng hay thông tin khách của công ty thật (kể cả mysp). Data tự dựng **không phải bằng chứng pain** — bằng chứng ở `evidence/`.
> Sinh lại: `python data/make_data.py` (seed 42, chỉ thư viện chuẩn).

## Dataset 1 · File sản phẩm mẫu — `products_sample.csv`

| | |
|---|---|
| Dùng để làm gì | Đầu vào của agent (file nhân viên tải lên) cho `read_products` → `check_product` → viết bài · chạy thử cả luồng · nguồn để viết thêm câu thử |
| Từ đâu | Sinh có seed bằng `data/make_data.py` từ danh mục dựng tay (12 mẫu sản phẩm, 8 Page, giá theo khoảng hợp lý) |
| Xử lý những bước gì | Chọn ngẫu nhiên mẫu, giá (bước 10.000đ), màu, size, ghi chú ưu đãi, prompt · **cài lỗi cố ý ~25% dòng**: thiếu size, thiếu ảnh, giá viết bằng chữ, hết hàng, ngừng SX, mã không có trong kho |
| Số dòng | 40 sản phẩm (28 sạch · 12 cài lỗi: `gia_chu` 3 · `ngung_sx` 3 · `khong_co_trong_kho` 2 · `thieu_anh` 2 · `thieu_size` 1 · `het_hang` 1) |
| Cột | `ma_sp, ten, gia, mau, size, chat_lieu, mo_ta, anh, ghi_chu, page, yeu_cau, loi_cai_san` — `yeu_cau` là prompt của nhân viên (để trống → giọng mặc định của Page) |
| Phiên bản / ngày | v1 · seed 42 · 27/11/2026 |
| Nhãn | `synthetic` |
| Giới hạn | Tên, mô tả đơn giản, ít biến thể câu chữ hơn file thật · ảnh chỉ là tên file, không có ảnh thật · tên cột chuẩn hoá — file thật có thể lệch tên cột (câu thử B17 kiểm riêng) · **cột `loi_cai_san` chỉ để người kiểm đối chiếu, agent không được đọc** |

## Dataset 2 · Kho — `inventory.csv`

| | |
|---|---|
| Dùng để làm gì | Nguồn cho `check_stock`: tồn theo màu × size, trạng thái sản xuất, giá tệ (giá nhập) để kiểm giá sàn |
| Từ đâu | Sinh cùng lúc với Dataset 1 (cùng script, cùng seed) |
| Xử lý những bước gì | Mỗi sản phẩm × màu × size một dòng, tồn 0–15 · dòng `het_hang` tồn = 0 · dòng `ngung_sx` ghi "Ngừng sản xuất" · dòng `khong_co_trong_kho` không có trong file · `gia_te` = giá bán / 13.500 × 0,4–0,7 |
| Số dòng | 103 |
| Cột | `ma_sp, mau, size, ton, trang_thai_sx, gia_te` |
| Phiên bản / ngày | v1 · seed 42 · 27/11/2026 |
| Nhãn | `synthetic` |
| Giới hạn | Tỷ giá 13.500 VND/CNY là giả định của nhóm · kho tĩnh, không đổi trong lúc chạy |

## Dataset 3 · Danh sách Page — `pages.csv`

| | |
|---|---|
| Dùng để làm gì | Kiểm mặt hàng có đúng Page không (câu thử B19, B20) · chọn giọng văn mặc định khi dòng không có prompt |
| Từ đâu | Nhóm tự viết |
| Số dòng | 8 Page |
| Cột | `page, mat_hang_cho_phep, giong_van` |
| Nhãn | tự viết |
| Giới hạn | Tên Page dựng, không phải Page thật |

## Dataset 4 · Quy tắc bài đăng — `post_rules.md`

| | |
|---|---|
| Dùng để làm gì | Khối cam kết cố định gắn cuối bài · danh sách cụm cấm cho `verify_post` · luật kiểm giá, tồn, mặt hàng |
| Từ đâu | Nhóm tự viết, bám các câu thử B01, B08, B10, B16, B18, B23 |
| Nhãn | tự viết — **cần đối chiếu quy định thật** khi phỏng vấn nhân viên / CEO mysp |
| Giới hạn | Chưa phải quy định của shop thật; đổi sau khi có thông tin từ mysp thì ghi changelog `spec.md` §10 |

## Bộ câu thử — `eval/benchmark.csv`

Mô tả ở `eval/README.md`. Hiện 24 câu đều `tu_viet` → cần thay / thêm câu từ lời nhân viên mysp (`nguoi_dung: …`) để đạt ≥ 1/3.
