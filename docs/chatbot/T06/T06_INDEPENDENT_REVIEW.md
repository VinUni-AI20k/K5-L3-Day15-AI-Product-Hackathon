# T06 — Review độc lập 2026-11-27

> **Đính chính theo người dùng:** spec.md là Contract dùng chung để nghiệm thu; không đặt thêm cổng chờ TV1/TV3 xác nhận lại. Bản sửa lần 2 đã đạt kiểm tra tương thích envelope Spec, nên điều kiện xác nhận lại Contract trong các đoạn lịch sử bên dưới được bỏ. Điểm còn mở là đường chạy run.py theo yêu cầu bàn giao dự án; không sửa file gốc để khép điểm này khi chưa có quyền. Điều phối dùng Spec hiện hành, không xin xác nhận lại hoặc làm lại Contract đã đạt.

## Review lại lần 2 — kết quả mới nhất

Phần Contract/Mock sửa lỗi tương thích: ĐẠT kiểm tra kỹ thuật trong phạm vi module. Chưa nghiệm thu toàn task T06; chưa push t06-cp3 hoặc merge main. Kết luận P1 Contract của lần 1 bên dưới đã được giải quyết, giữ để truy vết.

- application_contract.validate_agent_response nhận đúng 6 trường Spec, decision/warnings tùy chọn; nhánh được suy từ status/player.mode/errors.code, decision cung cấp phải khớp. REFUSE dùng status=error, errors.code=refused; không còn tự bắt nhóm dùng enum refused mới.
- Reviewer tự chạy 25/25 test T06 (0.508 giây), 216/216 hồi quy ailab (18.445 giây). Tái hiện độc lập REUSE, GENERATE và REFUSE bỏ riêng decision/warnings: cả ba validate không lỗi. Không dùng 30 test I02 workspace chính làm bằng chứng branch này.
- Không phát hiện thêm lỗi chặn trong phạm vi Contract/Mock đã kiểm; chưa có bằng chứng TV1/TV3 chốt toàn Contract/nullability/boundary và run.py hiện hữu vẫn chưa nối T06. CLI riêng không thay bằng chứng entrypoint chung. Không diễn giải module đạt thành toàn T06 DONE.
- Không sửa code gốc, không chạy model/browser thật, không commit/push. Mã chức năng và test được kiểm có SHA256 lần lượt application_contract D6EBD50294A1028FFE518B84A1DA2C69F35D43B4F347E70476B504EA0A3F8A84, mock_agent_v1 84EB727804C6974DD9ED158851833D46E08DC0D896DF53E797EBDEB8A575B540, test_t06_contract_mock 08DB197957C00C5DD52C1F1CE4BC8BA6C98AAF8C31A8F2FD335547C4DA6A5B7E.

Lệnh điều phối mới: cập nhật T06_REVIEW/ledger để bỏ mô tả strict8/refused đã lỗi thời; ghi module kỹ thuật đạt và hai điều kiện còn thiếu. Gửi Contract tương thích hiện tại cho TV1/TV3 xác nhận; bàn giao patch cho chủ entrypoint tích hợp theo quyền, không tự sửa file gốc hoặc hỏi lại ngoại lệ đã bị từ chối. Sau khi có bằng chứng đường chạy chung và chốt Contract, gửi reviewer nghiệm thu task; khi đạt mới push t06-cp3 và merge main theo yêu cầu người dùng. Giữ I02/T07 ngoài gói.

## Lịch sử review lần 1

Kết luận: CHƯA ĐẠT nghiệm thu toàn task; giữ REVIEW. Không commit/push/merge main vì quyền người dùng cho là có điều kiện review đạt. Nhánh xuất bản được người dùng yêu cầu mới nhất là t06-cp3, thay tên cp3/t06-contract-mock trong handoff trước.

Snapshot kiểm: worktree C:/Users/Admin/Desktop/hackathon/cp3-t06, base 225a589 cộng các file T06 untracked. Không lấy I02 chưa commit ở workspace chính vào T06.

## P1 — Contract triển khai chưa tương thích hợp đồng chung đã mô tả

codebase/application_contract.py:178 bắt buộc strict 8 trường, thêm decision và warnings ngoài 6 trường Spec. Dòng 23 chọn status refused dù Spec vẫn ghi cần thống nhất enum với TV1/TV3. T06_HANDOFF/T06_REVIEW thừa nhận extension mới là đề xuất, chưa có bằng chứng đồng thuận.

Probe độc lập: gọi mock_agent_v1.run với fixture Player101/Exam301, nhận REUSE/pending_approval; bỏ riêng decision và warnings để còn 6 trường Spec rồi gọi validate_agent_response. Thực tế trả 4 lỗi gồm invalid_schema, invalid_enum, application_plan bị hiểu thành non-plan. Như vậy consumer dùng đúng envelope 6 trường hiện được Spec mô tả không dùng được validator mới.

Cần chốt với nhóm, hoặc giữ extensions tùy chọn và hỗ trợ envelope Spec. Nếu thêm trường/enum bắt buộc thì cần owner xác nhận Contract chung và cập nhật tài liệu đúng thẩm quyền; không tự sửa Spec để hợp code. Thiết kế inference thiếu decision phải rõ, không tự đoán sai giữa REUSE/GENERATE/refusal. Thêm compatibility tests độc lập từ mẫu Spec và fixture hợp lệ có quyền; ID trong ví dụ Spec chỉ minh họa.

## Dependency — Đường run.py chưa tích hợp

CLI riêng codebase.t06_cli có test subprocess đạt. codebase/agent.py vẫn là luồng cũ, không gọi mock/Contract mới; T06_HANDOFF chỉ có patch đề xuất chưa áp/test. docs/TASKS.md ghi bàn giao Contract cho nhóm; phần hướng triển khai khẩn CP3 trong cùng tài liệu yêu cầu Mock chạy qua run.py, và T06_SPEC tự ghi dependency này chưa khép. Không coi CLI riêng là bằng chứng run.py đã tích hợp.

Giữ bảo vệ file gốc; giao patch cụ thể cho chủ entrypoint hoặc xin ngoại lệ đúng file trước khi áp. Không sửa run.py/tracing, không monkeypatch. Sau tích hợp phải có subprocess test đường thực từ run.py, no-key/simulated=true và giữ hành vi ngoài chế độ mock.

## Phần đã kiểm đạt kỹ thuật

- 22/22 unittest T06, 0.931 giây; 216/216 hồi quy ailab, 17.629 giây trên worktree T06 (không cộng 30 test I02 chưa commit ở workspace chính).
- Có đủ 5 nhánh mock, fixture độc lập DB/T12/provider; validator nested keys, mouse fallback và warnings; HTML GENERATE giữ ở backend và qua check_game; UI projection riêng có nhãn, không dùng thay Composer payload.
- run.py check hoàn tất: 12 benchmark/4 metric, còn cảnh báo CP3 cần 20–30 câu và >=1/3 nguồn thật; đây là việc TV4, không sửa chuẩn/dữ liệu để hợp task T06.
- git diff --check sạch. Không sửa mã chức năng, file gốc, DB thật hoặc chạy LLM/browser thật trong review này.

## Prompt điều phối

Giữ T06 REVIEW. Giao coder Contract giải quyết P1 strict extensions/enum với owner TV1/TV3, tester bổ sung compatibility từ envelope Spec. Chốt hoặc tích hợp patch entrypoint với chủ file đúng quyền, test run.py thực thay vì chỉ CLI riêng. Giữ toàn bộ I02 và T07 ngoài gói. Bàn giao bằng chứng chốt Contract, diff và test để reviewer kiểm lại. Khi review đạt mới tạo/publish nhánh t06-cp3 và merge main theo quyền người dùng mới nhất; kiểm main mới và xung đột trước merge, không force push hoặc mang file chưa review vào main. Hiện chưa đủ điều kiện push/merge.
