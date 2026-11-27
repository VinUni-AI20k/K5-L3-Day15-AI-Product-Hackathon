# T06 — Quyết định chốt của TV2 (Hồ Quốc Toản), 27/11/2026 ~19:20

1. **Bản chuẩn của ApplicationPlan Contract + Mock Agent** là bản trong `codebase/`:
   - `codebase/application_contract.py`
   - `codebase/mock_agent_v1.py`
   - `codebase/t06_cli.py`

   Đây là bản TV3 (T12/T14) và TV4 (T17) dùng để tích hợp. Bộ `ailab/chatbot/plans.py` + `ailab/chatbot/mock_agent.py` của I02 (workspace chính, chưa commit) **không** phải bản chuẩn. Sau này I02 dùng lại validator của T06, không giữ bộ riêng.
2. **Envelope Contract** theo `spec.md`: 6 trường, `decision`/`warnings` là tùy chọn. REFUSE biểu diễn bằng `status=error` + `errors.code=refused`. Mọi plan hợp lệ đều có `interaction.fallback="mouse"` và `mouse_always_enabled=true`. Review độc lập lần 2 đạt; chi tiết ở `T06_INDEPENDENT_REVIEW.md`.
3. **Cập nhật cùng ngày: TV2 (owner `codebase/agent.py` theo T08) cho phép sửa `agent.py`.** Đã áp đúng patch `T06_ENTRYPOINT_OWNER.patch` (3 dòng, opt-in `AGENT_MODE=t06_mock`, import adapter lúc cần). Luồng mặc định giữ nguyên.
   - `python codebase/accept_t06_entrypoint.py` chạy `run.py` thật bằng subprocess: **OK**. Cả 5 nhánh REUSE/GENERATE/ASK_CLARIFY/REFUSE/ERROR trả envelope T06; khi tắt `AGENT_MODE`, luồng cũ vẫn chạy.
   - Smoke `AGENT_MODE=t06_mock` + `MODEL_PROVIDER=fake` qua `python run.py` trả `simulated=true`, `REUSE`, `pending_approval`, `player_id=101`, `html=null`.
4. **Nhánh xuất bản:** `cp3/t06-contract-mock`. Chưa merge `main`.

## Trạng thái

Contract + Mock: **đạt** ở phạm vi module.

| Kiểm tra | Kết quả |
|---|---|
| Test T06 | 25/25 đạt |
| Hồi quy `ailab` | 216/216 đạt |
| Harness `run.py` thật (sau khi áp patch) | OK (5 nhánh + luồng mặc định) |
| SHA256 3 file đã review | khớp với bản reviewer kiểm |

Tiêu chí `run.py` (mục khẩn CP2 trong `docs/TASKS.md`) đã có bằng chứng (mục 3). Còn lại: TV3/TV1 xác nhận Contract (đã gửi Quân) và review độc lập cho bản có `agent.py`.

## Cách gọi cho TV3/TV4

```powershell
# CLI độc lập, không key, không DB, không mạng
'{"session_id":"s1","message":"Math quiz","selected_player_id":101,"selected_exam_id":301}' | python -m codebase.t06_cli
```

Trong Python:
- Kiểm một plan: `from application_contract import validate_agent_response` (chạy với `codebase` nằm trên `sys.path`).
- Gọi Mock: `mock_agent_v1.run(...)`.

ID 101/301 là ID của fixture, không phải ID production; ID thật lấy từ catalog T12. Chi tiết xem `T06_HANDOFF.md`.
