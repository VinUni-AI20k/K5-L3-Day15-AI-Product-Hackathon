# Đào review công khai · Nhật ký chi tiêu từ ảnh hóa đơn

## Mẫu và cách đếm

- Lấy 250 review mới nhất mỗi app trên Google Play tại Việt Nam, giao diện tiếng Việt, mọi mức sao, ngày lấy 27/11/2026. [Sổ Thu Chi MISA](https://play.google.com/store/apps/details?hl=vi&gl=vn&id=vn.com.misa.sothuchi) · [Money Lover](https://play.google.com/store/apps/details?hl=vi&gl=vn&id=com.bookmark.money)
- MISA phủ 17/03–25/11/2026. Money Lover phủ 14/10/2024–14/11/2026. Ngôn ngữ của từng review có thể khác lựa chọn ngôn ngữ của truy vấn.
- Thu với `google-play-scraper==1.2.7`, gọi `reviews(app_id, lang="vi", country="vn", sort=Sort.NEWEST, count=250)`. Giữ thứ tự trả về và đánh số từ 1. Mẫu số gồm toàn bộ 250 review mỗi app, kể cả khen và không liên quan. Kiểm mã review duy nhất trong từng mẫu.
- Sàng từ khóa rồi đọc ứng viên: hóa đơn, bill, nhập, ghi chép, ghi lại, ghi tay, ghi khoản, ghi chi, thủ công, bỏ sót, quên, cộng lại, số tiền, chụp, quét, OCR, phân loại, phân nhóm, thống kê, báo cáo, giao dịch, khoản chi, scan. Khi lọc, dùng chữ thường, bỏ dấu, đổi `đ` thành `d`, và cho phép thiếu khoảng trắng trong các cụm.
- Mỗi review có tối đa một nhãn chính. **entry** là phiền khi nhập/ghi đều đặn hoặc nêu nhu cầu dùng ảnh, OCR hay cách nhập thay thế. **lookup** là khó tra theo ngày, xem lịch sử hoặc mở từng khoản. **ledger** là khoản không được ghi/hiển thị đúng, bị ghi trùng hoặc lệch tổng sau khi lưu. Bỏ đánh giá chung, lỗi đăng nhập và phàn nàn về giá gói đơn thuần.

[Bảng vị trí và nhãn đã gắn](expense-review-labels.csv) không chứa tên hoặc toàn văn. Có thể chạy lại phép đếm trên hai snapshot gốc như sau:

```bash
python3 evidence/count_expense_reviews.py ~/.local/share/404error/track-e-reviews-2026-11-27
```

Script kiểm mã băm, số dòng và vị trí nhãn rồi tính số đếm trên toàn mẫu. Lấy lại review vào ngày khác sẽ tạo mẫu mới.

## Kết quả

| Nhãn | MISA | Money Lover | Gộp |
|---|---:|---:|---:|
| Nhập/ghi chi tiêu và nhu cầu nhập tự động | 5/250 | 3/250 | **8/500 (1,6%)** |
| Tra cứu lịch sử hoặc chi tiết | 3/250 | 2/250 | 5/500 (1,0%) |
| Ghi thiếu, trùng hoặc sai tổng | 7/250 | 5/250 | 12/500 (2,4%) |
| Tổng số review gắn nhãn | 15/250 | 10/250 | 25/500 (5,0%) |

## Năm trích đoạn từ review

| Mẫu · dòng | Ngày · sao | Trích ngắn | Liên quan tới |
|---|---|---|---|
| MISA · 8 | 21/11/2026 · 5★ | “phải chăm ghi thường xuyên” | Cần duy trì thao tác ghi |
| MISA · 212 | 30/04/2026 · 1★ | “quên không nhập liệu” | Bỏ sót ghi chép |
| Money Lover · 29 | 20/05/2026 · 5★ | “gửi ảnh hóa đơn” | Mong dùng ảnh để ghi khoản |
| Money Lover · 163 | 25/05/2025 · 4★ | “fix OCR errors easily” | Mong sửa được khi quét đọc sai |
| Money Lover · 147 | 21/07/2025 · 3★ | “không hiện được từng ngày cụ thể” | Khó xem chi theo ngày |

**Giới hạn:** review phản ánh người tự đăng đánh giá và có thể bỏ sót cách diễn đạt ngoài từ khóa. Hai app có khoảng ngày khác nhau, nên chỉ báo chung như tín hiệu của mẫu. Chưa đo thời gian tiết kiệm, tần suất nhận hóa đơn hay tỷ lệ người sẽ dùng luồng chụp rồi tự ghi. Snapshot đầy đủ được lưu cục bộ bên ngoài repo.
