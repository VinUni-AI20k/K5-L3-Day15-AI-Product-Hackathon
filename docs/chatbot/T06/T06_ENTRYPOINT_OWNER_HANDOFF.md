# T06 — Bàn giao người có quyền quản lý entrypoint

Contract/Mock đã review đạt và được giữ nguyên. Không cần xác nhận lại Contract. Điểm còn thiếu duy nhất để nghiệm thu đường chạy chung là nối run.py tới adapter T06.

## Việc đã chuẩn bị

Worktree: C:/Users/Admin/Desktop/hackathon/cp3-t06.

- codebase/t06_entrypoint_adapter.py (mới): nhận một dòng JSON Spec hoặc câu nhắn thông thường, gọi Mock đã duyệt, trả đúng answer(text)->{output:str}. Không đổi Contract hoặc sinh dịch vụ mới.
- starter-repo/docs/chatbot/T06_ENTRYPOINT_OWNER.patch (mới): chỉ thêm ba dòng trong answer() của codebase/agent.py, dùng opt-in AGENT_MODE=t06_mock và lazy import adapter. Luồng mặc định được giữ nguyên.
- codebase/accept_t06_entrypoint.py (mới): chạy run.py thật bằng subprocess, kiểm đủ5nhánh và hành vi mặc định. Không monkeypatch, không thay file tạm để giả bằng chứng đường chạy thật.

Điều phối/coder KHÔNG có quyền áp patch vào file gốc trong phiên này. Chưa xác định hoặc liên hệ được một owner nhận áp patch; tài liệu này là gói sẵn để chuyển cho người quản lý mã nguồn, không phải biên nhận đã giao/đã tích hợp.

## Các bước dành riêng cho owner có quyền

Trong worktree trên, owner kiểm patch trước, rồi chỉ áp nếu có quyền sửa agent.py:

```powershell
git apply --check starter-repo/docs/chatbot/T06_ENTRYPOINT_OWNER.patch
# Chỉ owner có quyền mới chạy lệnh sau; điều phối chưa chạy:
git apply starter-repo/docs/chatbot/T06_ENTRYPOINT_OWNER.patch
python codebase/accept_t06_entrypoint.py
python -m unittest discover -s codebase -p 'test_t06_*.py'
python -m unittest discover -s ailab -p 'test_*.py'
git diff -- codebase/agent.py
```

Smoke thủ công sau khi owner áp patch:

```powershell
$env:AGENT_MODE='t06_mock'
$env:MODEL_PROVIDER='fake'
'{"session_id":"owner-smoke","message":"Math quiz","selected_player_id":101,"selected_exam_id":301}' | python run.py
```

Mong đợi: envelope T06 simulated=true, không key/LLM thật, reuse có Player101/Exam301 fixture và html=null. Harness còn kiểm GENERATE/ASK_CLARIFY/REFUSE/ERROR và tắt AGENT_MODE vẫn đi đường cũ. IDs ở đây chỉ thuộc fixture, không phải ID production.

## Bằng chứng hiện tại — chưa phải nghiệm thu đạt

- git apply --check: đạt; patch chưa áp.
- Contract, Mock, CLI và25test đã duyệt: hash không đổi. agent.py/run.py: hash không đổi.
- Điều phối chạy25/25 Contract tests đạt,0.554giây.
- Helper mới kiểm trực tiếp5/5nhánh đạt; không dùng kết quả này thay run.py.
- Harness run.py thật:2methods,5FAILsubtests ở5nhánh opt-in vì không có envelope T06; legacy mặc định đạt. Điều phối chạy1.454giây, exit1. Không skip/đổi expected để báo xanh.

Owner cần bàn giao diff chính xác, kết quả harness/full regression trên bản đã áp, và xác nhận không thay Contract/Spec/nền tảng/I02/T07. Khi có bản đó, điều phối chạy lại và gửi reviewer nghiệm thu toàn T06. Hiện giữ REVIEW với dependency entrypoint chưa khép, không DONE/commit/push, chưa merge main. Đích xuất bản sau đạt vẫn là t06-cp3.
