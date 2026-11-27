# Khai báo dùng AI

README của nhóm có mục "Dùng AI vào việc gì" (2–3 dòng, bắt buộc). Ghi chi tiết vào bảng dưới đây.

> Luật của đề: dùng AI để làm bài thoải mái, nhưng **ai không giải thích được phần có tên mình thì phần đó nhận 0 điểm**. Khai thiếu không bị trừ; giấu mới bị.

| Việc | Công cụ AI | AI làm gì | Người kiểm/sửa gì | Ai phụ trách |
|---|---|---|---|---|
| Code bản chạy thử | | | | |
| Prompt / thiết kế lời gọi mô hình | | | | |
| Thiết kế dữ liệu hóa đơn mẫu | Codex | Phác thảo trường chú giải và các ca ảnh khó để kiểm thử | Đạt dựng mẫu giả lập và kiểm đáp án | Nguyễn Tiến Đạt |
| Phân tích review công khai | Codex | Lấy mẫu hai app, gắn nhãn sự cố và viết script kiểm lại số đếm | Nhóm có thể đối chiếu nhãn với snapshot cục bộ và trích đoạn đã bỏ tên | Nguyễn Tiến Đạt |
| Rà câu hỏi phỏng vấn / khảo sát | | Chỉ rà câu dẫn dắt | | |
| Viết câu thử (benchmark) | | | Mỗi câu thử có `source`; câu thử AI viết được ghi rõ | |
| Sinh data `synthetic` (nếu có) | | | Seed __ · kiểm tay __ dòng | |
| Chấm cột `pass` bằng LLM (nếu có) | | | Kiểm tra thủ công __ câu thử, khớp __/__ | |
| Văn bản CP1 | Codex | Cập nhật Canvas, giả thuyết và spec theo hướng ảnh hóa đơn | Đội trưởng rà phạm vi và phân công | Trịnh Công Đức |

**Không dùng AI để:** tạo người được phỏng vấn, trích dẫn, câu trả lời khảo sát; sửa kết quả các lượt đã chạy (`eval/run-*.csv`, `cost/simulate-*.csv`, `traces/`).
