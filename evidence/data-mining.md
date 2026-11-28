# Đào data — cách đếm và kết quả

> Điền ở guide bước 1.2. Ôn lại: ngày 2, ngày 6 · lab ngày 2, lab ngày 6.
> Không đào data thì xoá file này. Script / công thức đếm để trong repo (vd `evidence/count.py` hoặc ghi công thức Sheets ngay dưới), người khác chạy lại phải ra cùng số.
> Repo chỉ chứa số đã tổng hợp và vài dòng ví dụ — không chép lại nguyên file data.

## 1. Cách đếm — viết TRƯỚC khi chạy

# Đào data — cách đếm và kết quả

> Điền từ dữ liệu tổng hợp trong `evidence/data-mining-numbers.md` và script `scripts/build_data.py` (`mine_posts`, `mine_promo`).
> File Excel gốc để ngoài repo; repo chỉ chứa số đã tổng hợp và ví dụ ẩn danh.

## 1. Cách đếm — viết TRƯỚC khi chạy

- Data dùng: 2 file Google Sheets vận hành thật của shop thời trang (`AI - Làm ảnh taobao` — sheet `Đăng bài Order`, `Đăng bài BOT`; và `Hàng thiết kế 2026` — sheet `Soi đơn lệch KM`), tải ngày 27/11/2026.
- Đếm gì: tỷ lệ bài AI đã soạn/đăng nêu giá, size, chất liệu; tỷ lệ trùng câu mở đầu; tỷ lệ lệch mã sản phẩm cuối bài; tỷ lệ bài đăng lỗi (`❌`); tỷ lệ đơn giảm lệch mức khuyến mãi.
- **Mẫu số là gì:**
  - `4.671` bài có nội dung (`Content AI` ≥ 40 ký tự, bỏ 2 dòng cam kết cuối 🌸/🔰).
  - `4.650` bài có mã cuối bài (🔰) để đối chiếu với cột `Mã` cùng dòng.
  - `299` đơn tại quầy trong sheet `Soi đơn lệch KM` (từ 01/10/2026).
- Script / công thức: `scripts/build_data.py` (hàm `mine_posts`, `mine_promo`), kết quả lưu tại `evidence/data-mining-numbers.md`.

## 2. Đọc trước, đếm sau

Các kiểu vấn đề thấy được khi đọc mẫu dữ liệu (`data/DATA_CARD.md`, `evidence/data-mining-numbers.md`):
- Bài do AI soạn cũ gần như chỉ viết cảm tính dựa vào ảnh (không nêu giá/size, rất ít nêu chất liệu), dễ lặp câu mở đầu.
- Khi thao tác hàng loạt từ bảng tính, mã cuối bài có trường hợp bị gõ/ghép nhầm sang mã khác, hoặc bài đăng bị lỗi (`❌`).

## 3. Kết quả

| Đếm gì | x / N | % | Ghi chú |
|---|---|---|---|
| Bài có nêu **giá** trong thân bài | 0 / 4671 | 0.0% | regex số + k/đ/tr hoặc 3 số.3 số |
| Bài có nêu **size** trong thân bài | 0 / 4671 | 0.0% | regex size/S/M/L/XL… |
| Bài có nêu **chất liệu** | 167 / 4671 | 3.6% | từ điển 16 chất liệu |
| Bài có câu mở đầu trùng với ≥1 bài khác | 478 / 4671 | 10.2% | so dòng đầu (4.353 câu mở đầu khác nhau) |
| Mã cuối bài (🔰) khớp đúng 1 mã của dòng | 147 / 4650 | 3.2% | 4.483/4650 chỉ là phần đầu của mã |
| Mã cuối bài **không khớp** mã nào cùng dòng | 20 / 4650 | 0.4% | sai/lệch mã sản phẩm |
| Bài đăng lỗi (`❌`) | 62 / 4671 | 1.3% | cột `Trạng thái Đăng bài` |
| Đơn tại quầy giảm **lệch** mức khuyến mãi | 14 / 299 | 4.7% | sheet `Soi đơn lệch KM` |

## 4. ≥5 ví dụ cụ thể (mã dòng / mã đã ẩn danh)

1. `G5B606260` (mã cuối bài 🔰 không khớp với `G5D6062601`, `G5D6062602` cùng dòng) — `evidence/data-mining-numbers.md`
2. `G5D60718` (mã cuối bài 🔰 không khớp với `G5D6070717`, `G5D6070718` cùng dòng) — `evidence/data-mining-numbers.md`
3. `G5Q60717` (mã cuối bài 🔰 không khớp với `G5Q6070716`, `G5Q6070717` cùng dòng) — `evidence/data-mining-numbers.md`
4. `G5A60714112` (mã cuối bài 🔰 không khớp với `G5A6071412`, `G5A6071413` cùng dòng) — `evidence/data-mining-numbers.md`
5. `GRV607182` (mã cuối bài 🔰 không khớp với `GRV6071801`, `GRV6071802` cùng dòng) — `evidence/data-mining-numbers.md`

## 5. Giới hạn của data

Data cho biết bài viết thực tế thiếu dữ kiện sản phẩm (giá, size, chất liệu) và có sai lệch mã/trạng thái đăng lỗi, nhưng chưa cho biết **vì sao** nhân viên vẫn làm thủ công và khâu nào gây tốn thời gian/bực mình nhất.
→ Kiểm lại bằng khảo sát Google Form (`evidence/survey/results_summary.md`, n = 8, 6 người trực tiếp soạn/đăng).
