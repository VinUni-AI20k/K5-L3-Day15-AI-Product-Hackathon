# Tổng hợp bằng chứng pain

> Điền ở guide bước 1.2, xong trước **CP3 10:00 Thứ Bảy 28/11**. Chấm ở rubric R1.
> Ba nguồn ngang nhau — tối thiểu **≥1 nguồn đạt ngưỡng**. Mạnh nhất: đào data ra insight → hỏi người dùng để kiểm lại (hoặc ngược lại).

## 1. Nguồn đã dùng

| Nguồn | Đạt ngưỡng? | File |
|---|---|---|
| Đào data (x/N, %, cách đếm chạy lại được, ≥5 ví dụ) | ☑ | `evidence/data-mining.md`, `evidence/data-mining-numbers.md` |
| Phỏng vấn (≥3 người ngoài nhóm, đúng người dùng) | ☐ | *(chưa dùng)* |
| Khảo sát (bổ trợ kiểm lại, n = 8, 6 người trực tiếp làm bài) | ☐ *(n < 20, dùng kiểm chéo)* | `evidence/survey/results_summary.md` |

## 2. Số chính

- **Đào data (nguồn chính đạt ngưỡng, từ file vận hành thật của shop)**:
  - `0/4671 (0.0%)` bài đăng AI cũ có nêu **giá** trong thân bài; `0/4671 (0.0%)` nêu **size**; chỉ `167/4671 (3.6%)` nêu **chất liệu**.
  - `478/4671 (10.2%)` bài có câu mở đầu trùng lặp với bài khác.
  - `20/4650 (0.4%)` mã cuối bài (🔰) **không khớp** mã sản phẩm nào cùng dòng (`4483/4650` chỉ khớp phần đầu mã).
  - `62/4671 (1.3%)` bài đăng bị lỗi (`❌`); `14/299 (4.7%)` đơn tại quầy bị giảm lệch mức khuyến mãi.
- **Khảo sát Google Form (kiểm lại với người dùng, n = 8; n = 6 người trực tiếp soạn/đăng bài)**:
  - `5/6` có hàng/mẫu đang tồn chưa kịp lên bài (`0/6` lên bài kịp hết; `1/6` tồn trên 30 sản phẩm).
  - `3/6` mất **20 đến trên 30 phút** cho 1 bài đăng; `3/6` bỏ dở hoặc phải gác lại đợt bài sang hôm sau.
  - `5/6` đang gửi thông tin/ảnh vào ChatGPT thủ công, `4/6` copy bài cũ sửa lại, `5/6` lưu dữ liệu gốc ở Excel / CSV / Google Sheet.
  - `3/6` từng đăng nhầm thông tin 1–2 lần trong 1 tháng qua; hậu quả: `2/3` khách bình luận/nhắn tin hỏi lại vì thông tin mâu thuẫn, `1/3` khách đặt theo thông tin sai phải xin lỗi/đổi trả.

## 3. ≥5 trích dẫn hoặc ví dụ nguyên văn (có nguồn, bỏ tên)

1. `"Làm đi làm lại việc đăng bài rất nhàm chán"` — Phiếu khảo sát #2 (Câu 12)
2. `"đăng video load hơi lâu, ngoài ra sắp xếp hình ảnh khá thủ công, đăng video hay bài viết có nhiều hình ảnh khá lag"` — Phiếu khảo sát #3 (Câu 12)
3. `"bài đăng đưa cho ai làm ra không ưng ý"` — Phiếu khảo sát #4 (Câu 12)
4. `"Để check lại 1 lần nữa trước khi đăng"` — Phiếu khảo sát #3 (Câu 11)
5. `"Đang tìm hướng mới"` / `"Chưa tìm ra hướng mới"` — Phiếu khảo sát #2, #4 (Câu 11)
6. Ví dụ dữ liệu thật lệch mã sản phẩm: `G5B606260 ↔ G5D6062601, G5D6062602`; `G5D60718 ↔ G5D6070717, G5D6070718`; `GRV607182 ↔ GRV6071801, GRV6071802` — `evidence/data-mining-numbers.md`

## 4. Các nguồn có khớp nhau không

Data vận hành (`4.671` bài) và khảo sát người dùng (`n = 8`, `6` người trực tiếp soạn/đăng) **khớp nhau ở 3 điểm chính**:
1. **Dữ liệu gốc nằm ở bảng tính nhưng AI/người làm thủ công dễ bỏ sót hoặc sai lệch**: `5/6` dùng Excel/CSV/Google Sheet nhưng khi đẩy qua ChatGPT thủ công (`5/6`), dữ liệu thật cho thấy `0%` bài nêu giá/size, `20` bài lệch mã và `62` bài đăng lỗi; khảo sát ghi nhận `3/6` bị nhầm thông tin dẫn tới khách hỏi lại (`2/3`) hoặc đặt nhầm phải đổi trả (`1/3`).
2. **Tốn thời gian lặp lại & tồn đọng sản phẩm**: `5/6` vẫn còn sản phẩm chờ lên bài, `3/6` mất 20–>30 phút/bài và `3/6` bỏ dở đợt đăng bài vì thao tác lặp đi lặp lại nhàm chán và sửa câu chữ/ảnh thủ công.
3. **Nhu cầu giữ khâu duyệt trước khi đăng**: dù muốn tự động hóa (`"Đang tìm hướng mới"`), người dùng vẫn cần `"check lại 1 lần nữa trước khi đăng"` — khớp với luồng tạo bài nháp có kiểm tra lỗi và chờ duyệt trước khi lên lịch.

## 5. Kết luận

Giả thuyết ban đầu được **xác nhận**: nhân viên/chủ shop mất nhiều thời gian và dễ sai sót khi gom dữ liệu từ bảng tính sang ChatGPT rồi copy lên Fanpage từng bài một; giải pháp đọc hàng loạt từ bảng tính, kiểm tra lỗi cứng/tồn kho bằng code, sinh bài nháp khớp dữ kiện bằng AI và giữ bước duyệt trước khi lên lịch giải quyết đúng điểm nghẽn thực tế.

## Lịch hẹn (dùng cho CP2 — chỉ ghi vai và giờ, không tên)

| Vai | Giờ hẹn | Đã xong? |
|---|---|---|
| Nhân viên soạn/đăng bài & Quản lý shop (khảo sát online) | 27–28/11 | ☑ |
