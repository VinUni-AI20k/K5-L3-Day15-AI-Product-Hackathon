# Điều phối CP3 — theo task

2026-11-27. Quyền từ COORDINATOR_CP3_DISPATCH.md: commit/push từng task chỉ sau review độc lập đạt. Không merge main/force push/sửa file bảo vệ. Nhánh feature/chatbot và I02 chưa review giữ nguyên.

| Task | Worktree / nhánh | Owner / file | Interface / base | Test / review | Commit / remote |
|---|---|---|---|---|---|
| T06 | cp3-t06 / cp3/t06-contract-mock | t06_coder: 3 module codebase mới; t06_tests: test mới; điều phối: tài liệu T06 | T06_SPEC.md; base225a589 | REVIEW;22/22T06+216/216regression; Contract đã đạt; chờ owner entrypoint + test run.py | Chưa commit/push |
| T07 khảo sát | cp3-t07 / cp3/t07-llm-usage | t07_survey: T07_SURVEY.md, không sửa provider/entrypoint | Chỉ khảo sát base225a589; triển khai phải dựa T06 đã review | Khảo sát T07_SURVEY.md đã bàn giao; chưa có trace AI thật; không DONE | Chưa commit/push |
| T08 | Chưa khởi chạy | Chưa giao writer | Chờ T06/T07 đã review + T12 | Có thành phần kế thừa; xem ma trận tiêu chí, chưa tích hợp | Không |
| T09 | Chưa khởi chạy | Chưa giao writer | Chuẩn bị độc lập sau T06 ổn định; nghiệm thu chờ T08 cụ thể | Có thành phần kế thừa; xem ma trận tiêu chí, chưa tích hợp | Không |
| T10 | Chưa khởi chạy | Chưa giao writer | Chờ Run1 T18 hợp lệ, không dùng lỗi unit thay eval | Có thành phần kế thừa; xem ma trận tiêu chí, chưa tích hợp | Không |

Nhánh được tạo bằng git worktree add, không chuyển branch hoặc stash/reset/clean workspace I02. Mỗi file chỉ một writer kể cả nhiều worktree. Task chưa có review độc lập không được đưa vào task khác hoặc push như đã hoàn tất. Đề xuất nối codebase/agent.py, ai.py, tools.py chỉ là patch cho chủ file; chưa có quyền áp dụng trực tiếp.

T06_READINESS: T06_REVIEW.md/T06_HANDOFF.md có exactacceptance và patchowner; I02P1chưađạt không được đưa vào task. T07survey chỉ nằm cp3-t07, chưa commit/push và phải chọn base đúngcommitT06review trước triển khai. MainI02/Spec/Canvas/TEAMS/DB 12hashkiểm khôngđổi; không thao tácstash/indexmain.

T06 reviewlần2:25/25T06 +216/216regression đạt; Spec6fieldscompatible, extensionsoptional/refusalstatuserror, nhómchưaxácnhận. Userkhôngcho sửa filegốc; run.pythậtvẫnlegacy, entrypointdependencycònmở. Đíchpublish sauđạt:t06-cp3; CHƯAmergemain. Chưacommit/push; I02/T07ngoàigói.

## Preflight theo tiêu chí

Trước mỗi task phải đọc/cập nhật ma trận điều phối tại workspace chính: starter-repo/docs/chatbot/T06_T10_CRITERIA_MATRIX.md. Ghi tiêu chí → module đã review → phần chênh lệch → evidence còn thiếu; không giao lại module đã đạt. Các hàng T08/T09 chưa mở writer không có nghĩa chưa có lõi: đã kế thừa C02/C03/C04/check_game, còn adapter/producer/shared core và bằng chứng tích hợp. T10 chỉ xác định patch sau Run1 T18, nhưng đã có runner/regression để dùng lại. Bàn giao task phải báo từng tiêu chí, không chỉ nhãn tổng hợp.
Đính chính mới nhất: không đặt lại cổng xác nhận Contract. Module Contract/Mock kế thừa đã đạt review; chỉ hoàn tất run.py qua owner. Bảng/lịch sử còn nhắc xác nhận nhóm là trạng thái cũ, không còn điều kiện. Không sửa agent.py/run.py trong phiên; chuẩn bị patch cụ thể và harness mới để owner dùng.
