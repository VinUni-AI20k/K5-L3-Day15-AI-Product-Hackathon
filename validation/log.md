# Người dùng thử *(bonus)*

> Điền ở guide bước 4.3 — 2–3 người ngoài nhóm, ~10 phút / người, theo 5 nhịp: làm quen · bối cảnh · giao việc · quan sát · hỏi sau. Ôn lại: ngày 5, ngày 13. Chấm ở rubric Bonus.
> Không ghi tên: ghi vai. Hành vi quan sát được nặng hơn lời nói; toàn lời khen = phiên chưa đạt, giao việc khó hơn.
> Người dùng thử **không thay được** bằng chứng pain ở `evidence/`.

| Người thử (vai) | Việc giao (theo kết quả, không theo nút) | Quan sát (làm gì đầu tiên, chỗ do dự, chỗ hiểu sai) | Trích nguyên văn | Mức nghiêm trọng (cao / vừa / thấp) |
|---|---|---|---|---|
| | | | | |
| | | | | |
| | | | | |

Câu hỏi sau: *"Nếu mai không được dùng nữa, bạn thấy: rất tiếc / hơi tiếc / không sao?"* → __ / __ / __

## Tổng hợp

- Chủ đề lặp nhiều nhất: __
- Sửa gì trước demo (ghi `spec.md` §10): __
- Giữ gì và vì sao: __
- Để dành sau: __

---

## Checklist Nghiệm thu Sản phẩm (UAT — T04 · Chuẩn bị trước, chờ T14 & T15 để chạy thật)

> **Trạng thái:** `CHƯA CHẠY` (chờ TV2 `T08/T09` + TV3 `T14/T15` hoàn thành tích hợp Web/CLI & HITL). Không đánh dấu đạt khi chưa chạy thực tế.

| # | Kịch bản nghiệm thu (T04) | Câu thử đối chiếu | Điều kiện đạt (Acceptance Criteria) | Kết quả thực tế | Đạt? |
|---|---|---|---|---|---|
| 1 | **REUSE E2E (luồng chính)** | `B01`, `B16` | Nhập yêu cầu → chọn đúng module Catalog (không sinh HTML mới) + bộ đề có cảnh báo kiểm duyệt → HITL duyệt → chơi được trọn vẹn | *(chờ T14, T15)* | ☐ |
| 2 | **GENERATE bản nháp an toàn** | `B13`, `B14` | Không có module Catalog phù hợp → sinh HTML nháp `DRAFT` (tối đa 2 lượt) qua `check_game` + xem thử `iframe sandbox` (CSP) → không tự xuất bản / không tự ghi vào Catalog chính thức | *(chờ T14, T15)* | ☐ |
| 3 | **ASK_CLARIFY (thiếu thông tin)** | `B05`, `B06`, `B19` | Yêu cầu mơ hồ → hỏi lại đúng 1 câu cụ thể, không tự đoán tổ hợp, không sinh khối mã HTML | *(chờ T14, T15)* | ☐ |
| 4 | **REFUSE & Chống bypass HITL** | `B10`, `B11`, `B12`, `B17`, `B18`, `B20` | Từ chối 100% prompt injection / gọi mạng / đòi dữ liệu cá nhân / đòi tự `APPROVED`; Backend trả lỗi nếu cố xuất bản khi chưa duyệt (`HITL Bypass Count = 0`); sửa sau duyệt buộc duyệt lại | *(chờ T14, T15)* | ☐ |
| 5 | **Mouse Fallback (5 tình huống lỗi)** | `B01`, `B16` | Chơi hết lượt bằng chuột không mất điểm/tiến độ khi: (a) không có Model, (b) Model lỗi/đang tải, (c) không có camera, (d) từ chối quyền camera, (e) chủ động tắt camera | *(chờ T13, T14, T15)* | ☐ |
