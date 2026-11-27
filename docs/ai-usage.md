# Khai báo dùng AI

README của nhóm có mục "Dùng AI vào việc gì" (2–3 dòng, bắt buộc). Ghi chi tiết vào bảng dưới đây.

> Luật của đề: dùng AI để làm bài thoải mái, nhưng **ai không giải thích được phần có tên mình thì phần đó nhận 0 điểm**. Khai thiếu không bị trừ; giấu mới bị.

| Việc | Công cụ AI | AI làm gì | Người kiểm/sửa gì | Ai phụ trách |
|---|---|---|---|---|
| Code bản chạy thử | *(chờ TV2/TV3 cập nhật sau T06–T14)* | | | TV2 (Hồ Quốc Toản), TV3 (Lê Hồng Quân) |
| Prompt / thiết kế lời gọi mô hình | *(chờ TV2 cập nhật sau T07–T09)* | | | TV2 (Hồ Quốc Toản) |
| Đào data (viết script đếm, gợi ý nhãn) | Không áp dụng (không dùng data thô BTC `data/preclass/`) | — | — | TV4 (Đào Huy Hoàng) |
| Rà câu hỏi phỏng vấn / khảo sát | Coding/writing assistant (LLM) | Chỉ rà câu dẫn dắt cho 5 câu Mom Test trong `evidence/hypothesis.md` | TV1 đọc duyệt từng câu, giữ nguyên tính trung lập và trực tiếp đi phỏng vấn/khảo sát người thật | TV1 (Nguyễn Hoàng Việt) |
| Viết câu thử (benchmark) | *(chờ TV4 cập nhật sau T17)* | | Mỗi câu thử có `source`; câu thử AI viết được ghi rõ | TV4 (Đào Huy Hoàng) |
| Sinh data `synthetic` (nếu có) | Bộ đề mẫu `ailab/seed_exams.json` do AI soạn sẵn từ khung AI Lab (`DATA_CARD.md`) | Soạn 6 bộ đề × 15 câu mẫu (không lưu seed) | Ghi nhãn `synthetic` rõ ràng; không dùng làm bằng chứng pain; giáo viên phải kiểm lại nội dung | TV3 (Lê Hồng Quân), TV4 (Đào Huy Hoàng) |
| Chấm cột `pass` bằng LLM (nếu có) | *(chờ TV4 cập nhật sau T18–T19)* | | Kiểm tra thủ công __ câu thử, khớp __/__ | TV4 (Đào Huy Hoàng) |
| Slide, văn bản | Antigravity / Cursor (LLM) | Hỗ trợ chuẩn hóa cấu trúc `spec.md`, `canvas.md`, `docs/TASKS.md`, `README.md`, `slides/outline.md` | TV1 rà soát toàn bộ nội dung, đối chiếu hiện trạng code/git và chịu trách nhiệm chốt phạm vi & tài liệu | TV1 (Nguyễn Hoàng Việt) |

**Không dùng AI để:** tạo người được phỏng vấn, trích dẫn, câu trả lời khảo sát; sửa kết quả các lượt đã chạy (`eval/run-*.csv`, `cost/simulate-*.csv`, `traces/`).
