# T06 — Cập nhật entrypoint, Contract giữ kết quả đã đạt

Contract/Mock đã review đạt; không mở lại Contract hoặc yêu cầu nhóm xác nhận. Các đoạn chờ xác nhận Contract bên dưới là lịch sử, không còn là cổng nghiệm thu. Chỉ còn đường run.py qua owner có quyền.

Gói mới: T06_ENTRYPOINT_OWNER_HANDOFF.md, T06_ENTRYPOINT_OWNER.patch, codebase/t06_entrypoint_adapter.py và codebase/accept_t06_entrypoint.py. Không sửa file gốc. Patch read-only check đạt nhưng chưa áp; chưa có owner nhận và áp patch. Contract/module/test đã duyệt và agent.py/run.py đều giữ nguyên hash.

Kiểm thật:25/25 Contract đạt (điều phối0.554s); helper mới5/5nhánh đạt trực tiếp. Harness chạy run.py thật hiện2methods/5FAILsubtests (điều phối1.454s) do5nhánh chưa trả T06; nhánh legacy đạt. Không gọi đây là nghiệm thu run.py đạt. Cần owner có quyền áp patch rồi chạy lại harness/regression trên bản đó, sau đó reviewer nghiệm thu. Không hỏi lại ngoại lệ đã bị từ chối, không monkeypatch hoặc đổi Contract.

Trạng thái toàn task: REVIEW, còn dependency entrypoint. Chưa commit/push; khi đạt chỉ publish t06-cp3, chưa merge main. I02/T07 ngoài gói.

---

## Lịch sử trước cập nhật entrypoint

# T06 — Gửi lại review lần 2: tương thích Spec

2026-11-27. **REVIEW; chưa nghiệm thu toàn task, chưa commit/push.** Quyền mới nhất: không sửa file gốc; chỉ đẩy nhánh **t06-cp3** sau khi đạt; **chưa merge main**. Worktree hiện tại cp3-t06 vẫn trên branch chuẩn bị cp3/t06-contract-mock, base225a589; đổi/publish tên đích khi đủ cổng review. I02 và T07 nằm ngoài gói.

## Sửa P1

Coder chỉ sửa module mới application_contract.py trong vòng này; tester chỉ sửa test_t06_contract_mock.py. Validator cần 6 trường Spec, decision/warnings là tùy chọn, REFUSE dùng status=error và errors[].code=refused. Không bổ sung enum status mặc định. Có inference rõ theo status/player.mode/error code; extensions mâu thuẫn hoặc sai kiểu vẫn bị chặn, không mutate dữ liệu.

Policy knowledge warning tách thành validate_knowledge_review_policy; producer mock vẫn phát cảnh báo, validator cơ bản chấp nhận consumer 6 trường Spec mà không ép extensions. Hướng dẫn/enum/nullability/boundary backend/UI được cập nhật trong T06_HANDOFF.md và T06_SPEC.md. Chưa có xác nhận TV1/TV3; đây là phương án giữ tương thích để gửi nhóm review, KHÔNG tuyên bố đã có đồng thuận.

## Kiểm thật sau sửa

- Điều phối: `python -m unittest discover -s codebase -p 'test_t06_*.py'` → **25/25 OK**,0.542giây.
- Tester: **25/25 OK**,0.535giây; regression `python -m unittest discover -s ailab -p 'test_*.py'` → **216/216 OK**,20.114giây.
- Probe trước sửa: bỏ riêng decision/warnings của REUSE còn6trườngSpec →4issues. Sau sửa: đủ5nhánh six-field inference hợp lệ, literal Spec sample giữ shape/fixture IDs tương thích và Exam mới không extensions đều qua; optional fields không được phép mâu thuẫn. Tests cũng kiểm policy riêng, malformed mode/type và không mutation.
- Đã thực chạy `python run.py` qua subprocess stdin, fake/no-key. Exit0, stderr rỗng, vẫn model=fake/token0/đường agent gốc, KHÔNG có application_plan. Điều phối thử cả AGENT_MODE=t06_mock: đường gốc chưa đọc chế độ này, vẫn không envelope T06. Đây là regression và bằng chứng dependency chưa khép, không phải test T06 tích hợp đạt. Không ghi/ghi đè trace evidence.
- Không sửa agent.py/run.py/ai.py/tools.py hoặc nền tảng. Patch cụ thể do coder đề xuất vẫn ở T06_HANDOFF.md để owner nhận; user đã từ chối ngoại lệ nên điều phối không áp dụng hoặc lách bằng monkeypatch.

## Điều kiện còn mở

1. Reviewer độc lập kiểm lại P1/25tests và boundary/policy.
2. TV1/TV3 xác nhận extensions/enum hoặc tiếp tục chỉ dùng6trườngSpec; chưa có người xác nhận trong phiên.
3. Owner có quyền tích hợp entrypoint rồi chạy lại test T06 qua run.py thật. Với giới hạn hiện tại, chưa thể hoàn tất phần này; không đổi taskDONE hoặc báo đã khép sharedCLI từ adapter riêng.

Vì các cổng còn mở, chưa có commit/push hoặc merge. Khi review và acceptance đạt mới publish riêng t06-cp3; không gom I02/T07, không merge main theo quyết định mới nhất.

---

## Lịch sử gói review lần 1 (đã bị thay thế bởi các quyết định trên)

# T06 — Gói review theo task dự án

Ngày2026-11-27, Asia/Bangkok. **REVIEW, chưa DONE/chưa commit/chưa push.** Theo COORDINATOR_CP3_DISPATCH.md, chỉ publish từng task khi acceptance và reviewer độc lập đạt; quyền push mới không cho sửa entrypoint gốc hoặc tự bỏ dependency.

## Vị trí review / base / phạm vi

- Worktree: `C:/Users/Admin/Desktop/hackathon/cp3-t06`.
- Nhánh đích xuất bản: `cp3/t06-contract-mock` (hiện chỉ local).
- Base: `225a589ca3359bfcf3a8fd9050607b22d0cda32a`.
- Workspace chính feature/chatbot và I02 chưa commit giữ nguyên. Không stage/cherry-pick cả I02 vào T06, không reset/clean/stash/chuyển branch workspace chính. Main preservation manifest12file mãI02/Spec/Canvas/TEAMS/DB: 0 thay đổi trong lượt.
- Đã đọc AGENTS.md, docs/TASKS.md v2.2 T06–T10, Spec/Canvas, PROJECT_TASK_HANDOFF.md và COORDINATOR_CP3_DISPATCH.md. Khi I02_INDEPENDENT_REVIEW.md xuất hiện đã đối chiếu phần Contract cần tái sử dụng.

## File / owner

| File mới trong worktree T06 | Owner | Kết quả |
|---|---|---|
| codebase/application_contract.py | t06_coder | Validator strict/nullability/enums, C03/C04/check_game thật, registry có quyền và UI projection |
| codebase/mock_agent_v1.py | t06_coder | 5 nhánh mock, fixture registry tự chứa, no-key/noDB/noT12 |
| codebase/t06_cli.py | t06_coder | Adapter CLI stdin/file JSON + --ui, không sửa entrypoint gốc |
| codebase/test_t06_contract_mock.py | t06_tests | 22 unittest độc lập, CLI/Web import subprocess và regression |
| starter-repo/docs/chatbot/T06_SPEC.md | Điều phối | I/O/file ownership/acceptance chốt trước giao |
| starter-repo/docs/chatbot/T06_HANDOFF.md | Điều phối | Enum/nullability/boundary/guide WebCLI và patch owner chưa áp dụng |
| starter-repo/docs/chatbot/T06_REVIEW.md | Điều phối | Bằng chứng/giới hạn/gói review này |
| starter-repo/docs/chatbot/CP3_TASK_LEDGER.md | Điều phối | Task→owner→file→base→test→review→commit/remote |

Các file đều untracked; git diff rỗng không có nghĩa không cần đọc. Không có tracked file bị sửa trong worktree T06. T07 khảo sát có worktree riêng, không lẫn vào gói này.

## Tái sử dụng / chênh lệch với I02

Tái sử dụng committed C03 describe_player/select_model/validate_mapping; C04 validate_exam_questions; store.parse_questions/clean_exam; tools.check_game thật; llm.QUIZ/WHEEL_TEMPLATE. Chỉ dựng template/manifests trong bộ nhớ. Không import plans/mock_agent/workflow I02 chưa review. Ý tưởng kiểm5components/whitelist từ I02 được port hẹp sang module codebase mới, không mang API/UI/repository I02 vào branch T06.

Đối chiếu reviewer I02:

- GENERATE backend payload giữ HTML qua check_game; UI projection đánh dấu view='ui'/html_omitted=true và không được validator nhận như payload Composer. Khắc phục sự mơ hồ publichtml=null nhưng bị gọi là Player hoàn chỉnh.
- T06 đề xuất decision5nhánh với status rõ. Không trộn needs_revision/dependency_unavailable/plan_approved của workflow I02 vào enum Agent. Có REFUSE/errors và warnings kiến thức.
- Nullability và nested keys bắt buộc strict; model/exam chỉ null khi manifest cho phép; không bịa registryID.
- I02 P1 về HTML Player/Model URL đổi nhưng approve bản cũ vẫn là lỗi mở ở workspace chính. T06 không tái sử dụng đường approve đó và không tuyên bố đã sửa I02; không push I02 như phần T06.

## Contract cần TV1/TV3 xác nhận

Giữ6fieldsSpec và đề xuất thêm2requiredfields decision/warnings (strict8keys). Decision/status: REUSE+GENERATE→pending_approval, ASK_CLARIFY→needs_clarification, REFUSE→refused, ERROR→error. Plan đúng5keysSpec. Các nullable fields và cấu hình trong T06_HANDOFF.md. Đây là Contract đề xuất để nhóm review, chưa sửa Spec và chưa có bằng chứng cả TV1/TV3 đồng thuận.

Registry do caller tin cậy lọc quyền cấp, không nhận quyền từ history/client. Mặc định là fixture-local IDs101/102/103,201,301; simulated=true, không phải production IDs. REFUSE mock đủ minh họa Contract nhưng chưa nghiệm thu bảo vệ tổng thể T09. Bộ đề mới bắt buộc warningknowledge_review_required; fixture có nhãn rõ và không phải bằng chứng AI thật.

## Acceptance theo docs/TASKS.md

| Tiêu chí | Bằng chứng | Trạng thái |
|---|---|---|
| Mock không cần key/T12 | Test noDB/noNetwork/nokey và fresh CLI/Web import | Đạt kỹ thuật trong fixture |
| REUSE validID/html=null | Registry fixture + validator/mapping/parser thật | Đạt kỹ thuật, không chứng nhận quyền production |
| GENERATE HTML nháp qua check_game | Tests check_game thật, backendHTML còn nguyên | Đạt static, không runtime |
| Mousefallback luôn có | Validator/test mọi plan hợp lệ | Đạt Contract, chưa chứng minh hành vi mouse runtime |
| UnitContract+5nhánh pass | 22/22 | Đạt |
| Hướng gọi TV3/TV4 | T06_HANDOFF.md + CLI/Web import subprocess | Có |
| Chốt Contract với TV1/TV3 | Cần review enum/extensions/nullability | Chưa xác nhận |
| SharedCLI/run.py hiện hữu | CLIadapter riêng đã chạy; owner patch chưa áp | Dependency chưa khép, không gọi taskDONE |
| Review độc lập T06 | Gói này gửi reviewer hiện tại | Đang chờ |

## Lệnh / kết quả thật

Từ worktree cp3-t06:

```powershell
python -m unittest discover -s codebase -p 'test_t06_*.py'
python -m unittest discover -s ailab -p 'test_*.py'
python run.py check
git diff --check
git status --short --branch
git diff HEAD --name-status
git ls-files --others --exclude-standard
```

- Điều phối cuối: T06 **22/22 OK**,0.559giây.
- Tester cuối: T06 **22/22 OK**,1.078giây; sau sourcefinal hồi quy ailab **216/216 OK**,18.863giây. Worktree base không có I02 nên không cộng nhầm246test workspace chính thành regression của branch này.
- Điều phối chạy run.pycheck: exit0, metric4/4field đủ; có cảnh báo benchmark12câu chưa20–30 và0/12nguồn người dùng/data thật chưa1/3. Không sửa benchmark/metric/dữ liệu owner khác; không dùng check này làm bằng chứng evalRun1.
- git diff --check sạch, tracked diffHEAD rỗng. Mọi mã task và tài liệu mới cần mở riêng khi review.
- Có trước/sau REFUSE: điều phối tái hiện2English requests đòi tựAPPROVED trả ASK_CLARIFY trước sửa. Snapshot `%TEMP%/codex-t06-before-refusal.py`, tester loadimportlib/swapmodule chỉ trong process chạy đúng method:1method,**2FAILsubtests**,0ERROR. Sau sửa rules tổng quát (không hardcode input benchmark),22/22 đạt. File repo không bị thay bằng snapshot.

## Giới hạn / điều kiện push

Chưa sửa run.py hoặc codebase/agent.py/ai.py/tools.py; không monkeypatch entrypoint. Hunk opt-in do coder đề xuất cho owner nằm T06_HANDOFF.md, chưa áp/test đường run.py. Backend thực phải xác thực user và cấp registry đã lọc quyền; mock không có dịch vụ T12/DB, không tự xuất bản/duyệt App. Không sinh câu hỏi bằng AI thật, không LLM/usage thật, không runtime/browser/preview, không T08/T09 hoàn chỉnh. Không đưa T07 khảo sát vào acceptance T06.

Nhờ reviewer hiện tại kiểm đầy đủ file mới, boundary backend/UI,5branches/nullability/warnings và acceptance. TV1/TV3 cần xác nhận Contract và owner cần khép entrypoint dependency đúng quyền. Chỉ khi đủ điều kiện mới DONE, stage explicitfiles, commit và push cp3/t06-contract-mock; phải kiểm remote history trước, không force/merge main. Hiện **chưa có commit hash hoặc remote publication** để báo vì chưa đạt cổng review.
