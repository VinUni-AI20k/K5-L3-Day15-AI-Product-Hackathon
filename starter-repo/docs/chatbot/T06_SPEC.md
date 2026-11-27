# T06 — Contract và Mock độc lập

2026-11-27. Base 225a589; worktree cp3-t06, nhánh cp3/t06-contract-mock. REVIEW, chỉ commit/push sau review độc lập đạt. Không sửa workspace feature/chatbot hoặc kéo toàn I02 chưa review vào task.

## Contract hiện hành — giữ nguyên phần đã review đạt

Giữ sáu trường bắt buộc Spec v1.0: schema_version='1.0', simulated bool, status str, message str, application_plan object|null, errors list[{code,message,field?}]. decision (REUSE/GENERATE/ASK_CLARIFY/REFUSE/ERROR) và warnings (code/message) là extensions TÙY CHỌN, không bắt consumer Spec cung cấp. Status tương thích: REUSE/GENERATE→pending_approval; ASK_CLARIFY→needs_clarification; REFUSE và ERROR→error; REFUSE được phân biệt bằng errors[].code=refused. Không tự sửa Spec hoặc coi enum đã được nhóm duyệt. Approval lifecycle DRAFT/APPROVED/REJECTED là quyền Backend, không do mock cấp.

Plan bắt buộc đủ name/player/model/exam/interaction. player reuse_existing cần ID có trong registry tin cậy, html=null; generate_new cần player_id=null, HTML qua check_game thật. model=null nếu không dùng, hoặc model_id/kind/mapping/sure/hold_ms theo Spec và tương thích manifest. exam=null chỉ khi list, hoặc mode/exam_id/content đúng parser/cleaner+C04. interaction.primary=mouse hoặc kind thật, fallback=mouse, mouse_always_enabled=true. Không bịa ID; IDs mock chỉ thuộc registry fixture được ghi rõ, không dùng như production IDs. Phần metadata/cảnh báo không được tự cấp duyệt hoặc tuyên bố kiến thức đúng.

Input theo Spec: session_id string, message string, history array, document_ids array, selected_player_id/model_id/exam_id int|null, generation_mode null|reuse_existing|generate_new|auto. Fixture/mock độc lập T12/DB/key; document_ids không có extraction thì báo lỗi rõ, không giả hỗ trợ. Không dùng client history làm quyền/approval.

## API và sở hữu độc quyền

- Coder chức năng chỉ tạo codebase/application_contract.py, codebase/mock_agent_v1.py, codebase/t06_cli.py. Không sửa file gốc codebase/agent.py/ai.py/tools.py, ailab nền tảng, Spec/Canvas/TASKS/TEAMS/AGENTS hoặc I02. Được đọc bản I02 tại workspace chính để tái sử dụng ý tưởng/checks; chỉ port phần cần với provenance, không import module I02 chưa có trong base.
- application_contract.validate_application_plan(plan, registry=None) -> list[issue]; registry là metadata tin cậy caller cấp, optional chỉ kiểm cấu trúc, có registry thì kiểm ID/quyền (registry đã lọc quyền), mapping/Exam compatibility. validate_agent_response(response, registry=None) -> list[issue]. Strict keys/types/nullability/enums có tài liệu; malformed JSON-like data không crash.
- mock_agent_v1.run(payload, registry=None) -> envelope; registry=None dùng fixture registry rõ simulated=true. Có get_fixture_registry() trả copy để tests/Web integration biết ID thật của fixture. Tận dụng catalog/exams/parser/check_game đã có ở base, không viết lại parser/compatibility. Mock không ghi DB hoặc artifact/không gọi LLM, không tự xuất bản. 5 nhánh chọn theo yêu cầu/rules tổng quát, không hardcode benchmark. REFUSE gồm injection/vượt HITL/đòi xuất bản và hành vi mạng/thoát iframe; đây chỉ mock refusal contract, chưa nghiệm thu T09.
- application_contract.to_ui_response(response) -> projection mới, lọc trường lạ/bí mật, không HTML. Phải đánh dấu html_omitted hoặc view='ui' và nêu rõ UI projection không phải payload backend để validate/compose generate. Backend payload giữ HTML mock hợp lệ. Không báo UI projection là backend ApplicationPlan đầy đủ.
- t06_cli.main đọc input JSON từ stdin hoặc file --input, in JSON; --ui để public projection. Gọi trực tiếp adapter mới, không sửa/monkeypatch entrypoint cũ. Web hướng dẫn gọi run(payload, trusted_registry) và truyền backend payload qua kênh có quyền, UI dùng projection.
- Coder test chỉ tạo codebase/test_t06_contract_mock.py; test riêng bằng unittest, không sửa các file chức năng hoặc test cũ. Chạy 5 nhánh/validation/type/null/ID/metadata warnings/HTML backend vs UI/mutation/CLI real subprocess/no key/no DB/no network.
- Điều phối giữ tài liệu T06_SPEC/T06_REVIEW/T06_HANDOFF và bảng dispatch. Coder chức năng gửi nội dung hướng gọi/patch đề xuất entrypoint cho điều phối, không ghi tài liệu khi không được giao.

## Acceptance/dependency

Theo docs/TASKS.md T06: no-key độc lập T12; reuse ID fixture hợp lệ/noHTML; generate check_game thật; fallback mouse; unit5branches đạt; hướng gọi TV3/TV4. Theo đính chính mới nhất của người dùng và reviewer, Spec hiện hành là Contract nghiệm thu; không đặt thêm cổng xác nhận lại TV1/TV3. run.py vẫn chưa nối adapter vì entrypoint được bảo vệ; chuẩn bị đề xuất patch cụ thể cho chủ file, không tự áp dụng. T06 vẫn REVIEW khi dependency shared CLI còn thiếu hoặc chưa có review nghiệm thu toàn task; không dùng test xanh để DONE/push.

Trong lúc review T06, có thể khảo sát T07 và chuẩn bị tấn công T09 ở worktree riêng, không sửa interface dùng chung. T08 chờ T07+T12; T10 chờ T18 Run1 thật. Không chạy AI tốn phí hoặc sửa entrypoint trong khảo sát.

Sau sửa review P1, backend envelope chỉ yêu cầu 6 trường Spec; decision/warnings tùy chọn. Inference dựa status + player.mode hoặc error code rõ ràng; không thêm enum status refused. validate_knowledge_review_policy tách khỏi validator cơ bản; producer mock vẫn luôn cảnh báo kiểm duyệt kiến thức. Chưa có xác nhận TV1/TV3; xem T06_HANDOFF.md. Đã đọc I02_INDEPENDENT_REVIEW.md ở workspace chính: P1fingerprint/approve còn mở và không được mang vào T06; không tái sử dụng workflow/approve I02. Boundary publicHTML/enum/refusal/nullability đã tách và có test T06.

Cập nhật quyền người dùng: không sửa file gốc có sẵn; không áp patch agent.py/run.py. Chỉ push nhánh t06-cp3 khi đạt review; CHƯA merge main. Đường run.py thực đã chạy regression fake nhưng chưa tích hợp T06; không tự nghiệm thu dependency này.

Ưu tiên hiện tại: Contract/Mock đã review đạt, giữ nguyên hash module/test; chỉ thêm adapter nối entrypoint, patch cho owner và harness run.py thực. Không sửa file gốc và không hỏi lại xác nhận Contract. Việc chuyển patch thành code agent.py do owner có quyền thực hiện, không thuộc quyền tự sửa của coder trong phiên.
