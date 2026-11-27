# Dàn slide → lấy số từ file nào

> Làm ở guide bước 5.1. Luật: **không có bằng chứng thì không có slide** — mỗi trang ≥1 con số / trích dẫn có nguồn / kết quả đo.
> Xuất PDF thành `demo-slides.pdf` ở thư mục gốc repo, nộp tại CP4 14:30 Thứ Bảy 28/11. Nộp PDF, không nộp link.

| # | Trang | Có gì | Số lấy từ | Xong |
|---|---|---|---|---|
| 1 | Người dùng & pain | Ai · việc gì · chỗ đau + số và trích dẫn | `evidence/summary.md` | ☐ |
| 2 | Vì sao chọn bài này | Bảng impact rút gọn + hướng bị loại | `spec.md` §2 | ☐ |
| 3 | Giải pháp | Lát cắt một câu · sơ đồ · AI tự làm đến đâu, vì sao | `spec.md` §4 | ☐ |
| 4 | Demo live | 1 trường hợp thường (`B01`/`B16`: `REUSE` + `Mouse Fallback` + HITL) + 1 trường hợp khó/tấn công (`B13`: `GENERATE` bản nháp sandbox hoặc `B17`/`B18`: `REFUSE` chống bypass); mạng hỏng → video dự phòng (T15) | `eval/benchmark.csv` | ☐ |
| 5 | **Đánh giá thế nào** | Dataset · bộ câu thử · metric · lượt 1 → lượt 2 so với chuẩn "đạt" (kèm run ID) · lỗi chính | `eval/README.md`, `eval/report.md` | ☐ |
| 6 | **Chi phí khi dùng thật** | Chi phí / task thành công · 3 kịch bản · so với impact | `cost/cost-estimate.md` | ☐ |
| 7 | Kết luận | Go / iterate / stop — dẫn số ở trang 1, 5, 6 | — | ☐ |
| 8 | Nếu có thêm 1 tuần | 2–3 việc, trỏ về lỗi còn lại / phản hồi người dùng | `eval/report.md` mục 4 · `validation/log.md` | ☐ |

**Trước khi lên:** tải repo về một máy khác (hoặc thư mục mới), chạy theo mục "Chạy trong 3 phút" của `README.md` · `.env` có trên máy demo, đã gọi thử 1 câu trong vòng 1 giờ trước giờ demo · video dự phòng mở được bằng cửa sổ ẩn danh · biết bản chạy thử sẽ làm gì với **1 câu thử lạ** của giám khảo.

Ai nói trang nào (mỗi người ≥1 phần — *đề xuất phân công, TV1 xác nhận trước buổi pitch*):

| Trang | Người nói |
|---|---|
| Trang 1 (Người dùng & pain) · Trang 2 (Vì sao chọn bài này) | TV1 – Nguyễn Hoàng Việt |
| Trang 3 (Giải pháp & kiến trúc Reuse-first, Generate-if-needed) | TV2 – Hồ Quốc Toản |
| Trang 4 (Demo live & Mouse Fallback / HITL) | TV3 – Lê Hồng Quân |
| Trang 5 (Đánh giá thế nào: Run 1 → Run 2) · Trang 6 (Chi phí khi dùng thật) | TV4 – Đào Huy Hoàng |
| Trang 7 (Kết luận Go/Iterate/Stop) · Trang 8 (Nếu có thêm 1 tuần) | TV1 – Nguyễn Hoàng Việt |
