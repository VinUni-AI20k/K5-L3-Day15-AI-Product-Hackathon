# T06 — Handoff Contract đề xuất v1.0 / Web / CLI

Worktree C:/Users/Admin/Desktop/hackathon/cp3-t06; branch cp3/t06-contract-mock; base225a589. REVIEW, chưa có đồng thuận TV1/TV3 hoặc nghiệm thu reviewer độc lập. Không áp dụng thay đổi vào Spec hoặc entrypoint được bảo vệ.

## Hợp đồng cần nhóm xác nhận

Backend envelope yêu cầu đúng 6 trường Spec: schema_version/simulated/status/message/application_plan/errors. decision và warnings là extensions tùy chọn; không có chúng vẫn phải validate được. Không nhận field lạ. Extensions chưa có xác nhận nhóm, không yêu cầu TV1/TV3 thay Spec để dùng được dữ liệu gốc.

| decision | status | application_plan | errors |
|---|---|---|---|
| REUSE | pending_approval | Plan reuse hợp lệ | [] |
| GENERATE | pending_approval | Plan draft có HTML qua check_game | [] |
| ASK_CLARIFY | needs_clarification | null | [] |
| REFUSE | error | null | có lỗi code=refused và lý do |
| ERROR | error | null | có lỗi giải thích |

Không dùng needs_revision/dependency_unavailable/plan_approved của I02 làm enum Agent T06. DRAFT/APPROVED/REJECTED là vòng đời duyệt do Backend quản lý, mock không được tự cấp.

Plan chính xác5 keys name/player/model/exam/interaction. player3keys mode/player_id/html; model null hoặc5keys model_id/kind/mapping/sure/hold_ms; exam null (chỉ game không nhận đề) hoặc3keys mode/exam_id/content; interaction3keys primary/fallback/mouse_always_enabled. IDs int dương không bool; mode player/exam reuse_existing|generate_new. Reuse Player html=null; generated Player player_id=null/HTML hợp lệ. Model kinds image/pose/hands; sure hữu hạn0.5..0.99, hold_ms int300..5000. primary=mouse khi không model; fallback=mouse và mouse_always_enabled=true. Có registry tin cậy thì thêm kiểm tồn tại/khớp nội dung/manifest/mapping/tương thích C03/C04. Không registry chỉ kiểm cấu trúc, không chứng nhận quyền hoặc runtime.

Errors/warnings là array object{code,message,field?}, chuỗi không rỗng; không thêm approval/quyền qua field lạ. Validator cơ bản không bắt consumer Spec thêm warnings. Producer policy riêng validate_knowledge_review_policy yêu cầu warnings code=knowledge_review_required cho Exam generate_new; mock phát warning này cho mọi Exam. Fixture có simulated_fixture, không giả là sinh đề AI thật hoặc kiến thức đã đúng.

Input theo Spec session_id/message/history/document_ids/selected_player_id/selected_model_id/selected_exam_id/generation_mode. Mock nhận session string opaque, không coi đó là xác thực production; quyền phải từ registry snapshot server đã lọc. history không cấp quyền/duyệt. No-key, không gọi T12 hoặc DB. document_ids chưa có extraction nên báo lỗi, không hứa upload PDF/DOCX.

## Web / Backend

```python
from codebase.mock_agent_v1 import run, get_fixture_registry
from codebase.application_contract import validate_agent_response, to_ui_response
registry = get_fixture_registry()  # chỉ demo giả lập; production phải cấp snapshot đã lọc quyền
backend_payload = run({"session_id":"demo","message":"Math quiz","selected_player_id":101,"selected_exam_id":301}, registry)
issues = validate_agent_response(backend_payload, registry)
ui_view = to_ui_response(backend_payload)
```

Fixture-local: Player101 quiz chuột,102 camera AB,103 danh sách; Model201 imageAB; Exam301. Không dùng các số này như ID production. Không tự ghi Player/Exam/App hoặc phê duyệt.

Backend payload GENERATE giữ HTML đầy đủ để backend kiểm và phục vụ qua kênh có quyền. UI view có view='ui', html_omitted=true, html=null, whitelist/redaction. Đây là projection chỉ hiển thị, **không phải backend ApplicationPlan**; validator cố ý không nhận projection để Composer. Không coi public html=null của GENERATE là Player hoàn chỉnh đã bàn giao. Chưa nối UI/API I02 đang REVIEW vào adapter này.

## CLI riêng, đã chạy test subprocess

Từ Git root worktree:

```powershell
'{"session_id":"cli-demo","message":"Math quiz","selected_player_id":101,"selected_exam_id":301}' | python -m codebase.t06_cli
python -m codebase.t06_cli --input request.json
python -m codebase.t06_cli --input request.json --ui
```

CLI xuất JSON, ERROR exit1; --ui chỉ hiển thị, không Composer. Ví dụ dùng fixture simulated=true, không key hoặc LLM thật.

## Patch đề xuất cho owner agent.py — chưa áp dụng

Coder chức năng đề xuất opt-in; owner cần review/áp nếu được phép:

```diff
--- a/codebase/agent.py
+++ b/codebase/agent.py
@@
 import os
+import json
+from mock_agent_v1 import run as run_t06_mock
@@
 def answer(text: str) -> dict:
+    if os.environ.get("AGENT_MODE") == "t06_mock":
+        payload = {"session_id": "cli", "message": text}
+        return {"output": json.dumps(run_t06_mock(payload), ensure_ascii=False)}
     user, last_err = text, None
```

Đây chỉ là minh họa hunk cụ thể từ coder cho owner, chưa được áp dụng hoặc kiểm trên run.py. Không đổi codebase/agent.py/ai.py/tools.py/run.py trong task hiện tại, không monkeypatch. CLI riêng đã chạy, đường run.py/shared core hiện hữu chưa nối T06; cần owner tích hợp hoặc ngoại lệ quyền rõ trước khi khép dependency. Không suy ra T07/T08/T09 đã hoàn thành từ opt-in mock.

## Điều kiện tiếp theo

Reviewer độc lập kiểm T06, TV1/TV3 xác nhận enum/nullability/extensions và boundary backend/UI; owner giải quyết entrypoint/sharedCLI dependency. Khi đủ acceptance và review đạt, điều phối mới stage đúng file T06, commit và git push -u origin t06-cp3; trước push kiểm remote history, không force/merge main. Quyền có điều kiện đã được người dùng cho, không cần xin lại nếu các điều kiện được đáp ứng; hiện chưa đáp ứng nên chưa commit/push.

## Review lần 2 — cách hiểu không có extensions

- pending_approval + player.mode=reuse_existing → REUSE; generate_new → GENERATE.
- needs_clarification + application_plan=null → ASK_CLARIFY.
- error + application_plan=null + errors chứa code=refused → REFUSE; lỗi khác → ERROR.
- Nếu decision được cung cấp thì phải khớp inference. Validator vẫn kiểm toàn bộ plan/errors, không dùng inference để biến plan lỗi thành hợp lệ. Không thay/mutate envelope đầu vào.
- Sáu trường theo mẫu Spec, kể cả Exam generate_new không có warnings, validate cấu trúc được. Cảnh báo kiến thức được kiểm riêng tại producer; không gọi validate cấu trúc là chứng nhận kiến thức hoặc quyền duyệt.

Quyền mới nhất: user không cho sửa file gốc, nên patch agent.py ở trên vẫn CHƯA áp dụng, chỉ để owner tiếp nhận. run.py thực đã chạy exit0 trong fake mode nhưng không application_plan; chưa có bằng chứng T06 chạy qua entrypoint này. Không yêu cầu lại ngoại lệ đã bị từ chối. Nhánh xuất bản khi đủ điều kiện là t06-cp3, thay tên cũ; chỉ push sau review đạt, CHƯA merge main. Chưa có bằng chứng đồng thuận TV1/TV3; không ghi thay nhóm là đã chốt.