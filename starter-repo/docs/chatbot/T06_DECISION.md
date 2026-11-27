# T06 — Quyết định chốt của TV2 (Hồ Quốc Toản), 27/11/2026 ~19:20

1. **Bản chuẩn của ApplicationPlan Contract + Mock Agent** là bản trong `codebase/`:
   - `codebase/application_contract.py`
   - `codebase/mock_agent_v1.py`
   - `codebase/t06_cli.py`

   Đây là bản TV3 (T12/T14) và TV4 (T17) dùng để tích hợp. Bộ `ailab/chatbot/plans.py` + `ailab/chatbot/mock_agent.py` của I02 (workspace chính, chưa commit) **không** phải bản chuẩn. Sau này I02 dùng lại validator của T06, không giữ bộ riêng.
2. **Envelope Contract** theo `spec.md`: 6 trường, `decision`/`warnings` là tùy chọn. REFUSE biểu diễn bằng `status=error` + `errors.code=refused`. Mọi plan hợp lệ đều có `interaction.fallback="mouse"` và `mouse_always_enabled=true`. Review độc lập lần 2 đạt; chi tiết ở `T06_INDEPENDENT_REVIEW.md`.
3. **Không sửa `codebase/agent.py`** trong T06. Patch 3 dòng opt-in (`T06_ENTRYPOINT_OWNER.patch`, `AGENT_MODE=t06_mock`) được giữ làm tài liệu nhưng không áp.
   - Hệ quả: tiêu chí "chạy qua `python run.py`" **còn mở**.
   - `codebase/accept_t06_entrypoint.py` hiện FAIL đúng như kỳ vọng (5 subtest), vì `run.py` chưa trả envelope T06.
   - Đường chạy chung sẽ được nối khi làm Shared Core ở T08 (`codebase/agent.py`, owner TV2).
4. **Nhánh xuất bản:** `cp3/t06-contract-mock`. Chưa merge `main`.

## Trạng thái

Contract + Mock: **đạt** ở phạm vi module.

| Kiểm tra | Kết quả |
|---|---|
| Test T06 | 25/25 đạt |
| Hồi quy `ailab` | 216/216 đạt |
| SHA256 3 file đã review | khớp với bản reviewer kiểm |

T06 toàn task chưa DONE theo `docs/TASKS.md`, vì thiếu tiêu chí `run.py` (mục 3).

## Cách gọi cho TV3/TV4

```powershell
# CLI độc lập, không key, không DB, không mạng
'{"session_id":"s1","message":"Math quiz","selected_player_id":101,"selected_exam_id":301}' | python -m codebase.t06_cli
```

Trong Python:
- Kiểm một plan: `from application_contract import validate_agent_response` (chạy với `codebase` nằm trên `sys.path`).
- Gọi Mock: `mock_agent_v1.run(...)`.

ID 101/301 là ID của fixture, không phải ID production; ID thật lấy từ catalog T12. Chi tiết xem `T06_HANDOFF.md`.
