# T07 — Kết quả chạy model thật (2026-11-27 ~19:34)

Worktree `t07-main`, nhánh `cp3/t07-only`, nền `origin/main` `dd5d71e`. Owner TV2 đã cho phép gọi API thật.

## Cấu hình đã dùng

Không có key nào trong tài liệu này.

- `MODEL_PROVIDER=openai`, `MODEL_NAME=gpt-4o-mini`: đặt bằng **biến môi trường lúc chạy**, không sửa `.env`. `API_KEY` lấy từ `.env` của repo chính (đã được `.gitignore` bỏ qua).
- **Phát hiện về `.env` hiện tại:**
  - thiếu `MODEL_PROVIDER`, nên `ai.py` rơi về chế độ fake;
  - `MODEL_NAME` không phải model OpenAI hợp lệ: OpenAI trả HTTP 400 với message `invalid model ID`.

  Cần sửa `.env` thành `MODEL_PROVIDER=openai`, `MODEL_NAME=gpt-4o-mini` để mọi người chạy được mà không phải đặt biến môi trường.

## Bằng chứng theo tiêu chí `docs/TASKS.md`

| Tiêu chí | Kết quả thật |
|---|---|
| `call_model` giữ `@model_call`, trả 4 khóa, `tokens_in > 0`, `tokens_out > 0` từ `usage` API | ✅ Xem chi tiết bên dưới bảng |
| Không có API key trong code/diff; `.env` trong `.gitignore` | ✅ `git check-ignore .env` khớp `.gitignore:2`. Kiểm trong tiến trình (không in key): key **không** xuất hiện trong `traces/run-try.jsonl`, `eval/run-try.csv` hay output của 2 lệnh chạy. Diff không chứa key |
| `python run.py eval --try` hoàn tất với model thật, log hợp lệ trong `traces/` | ✅ Ghi `eval/run-try.csv` và `traces/run-try.jsonl` (`run_id` `run-try@20261127-193420`), 3 event model, 0 lỗi |
| Lỗi API không lộ key, exception đi đúng `tracing` | ✅ Xem chi tiết bên dưới bảng |

Chi tiết tiêu chí 1:
- `python run.py`, prompt "Tạo game ôn phép cộng lớp 2…": `model: gpt-4o-mini`, gọi model 2 lần, gọi công cụ 2 lần, **token vào 3099 / ra 1768**.
- `eval --try`, 3 câu: B01 1521/46, B02 1517/52, B03 1525/43.

Chi tiết tiêu chí 4:
- Lần gọi thật với model sai trả `ProviderError: openai http HTTP 400 (invalid_request_error): máy chủ model trả lỗi`. Thông báo không chứa body, header hay key.
- Test giả lập: 56/56 OK, gồm 401/403/429/500/504, timeout, lỗi mạng, JSON hỏng, và chuỗi bí mật giả (sentinel) không lọt vào message hay trace.

Ghi chú: `eval/run-try.csv` và `traces/run-try.jsonl` được `.gitignore` bỏ qua (dòng 17, 25). Lệnh `eval --try` ghi đè hai file này mỗi lần chạy, và khung coi đây là "lượt thử", không phải một lượt eval chính thức. Số token ở trên được chép từ chính các file đó.

## Bản cuối sau sửa review (chạy lại ~20:31)

Đọc cấu hình từ `.env` đã sửa (không đặt biến môi trường); bản sao `.env` trong worktree đã xóa sau khi chạy.

- `verify.py`: ailab 37/37, codebase 56/56, file khung không đổi, không có chuỗi giống key.
- `python run.py`: `gpt-4o-mini`, 1 lần gọi model, 1 công cụ, token 1520/783.
- `eval --try`, `run_id` `run-try@20261127-203148`: token vào 1521/1517/1525, ra 98/61/24, 0 lỗi. Key không có trong trace/CSV.

Các số ở bảng trên là của bản trước sửa review. Mục "Cấu hình đã dùng" mô tả `.env` trước khi sửa.

## Review lần 2 (medium): còn mở

1. Phản hồi rỗng (từ chối, SAFETY) đi tới `agent.answer` thành chuỗi rỗng; `ailab/llm.generate` gọi lại model rồi báo "không thấy khối mã html". Do R2.
2. Gemini sai key trả HTTP 400 `API_KEY_INVALID`, bị xếp `http` thay vì `auth`.
3. Ollama phản hồi rỗng thiếu `eval_count` bị báo `usage_missing` (chưa kiểm với Ollama thật).
4. Nhỏ: lỗi 404/400 thiếu gợi ý kiểm `MODEL_NAME`; thông báo `config` chưa nhắc `API_KEY`.
5. Có từ trước: HTML bị cắt vì hết token vẫn được trả như câu trả lời thường.

## Vòng cuối S1–S4 (chạy lại ~20:42) — số liệu hiện hành

- `verify.py`: ailab 37/37, codebase 67/67, file khung không đổi, không có chuỗi giống key. Test mới trên bản trước S1–S4: 13 failures, 2 errors.
- `python run.py`: `gpt-4o-mini`, 2 lần gọi model, 2 công cụ, token 3068/1624.
- `eval --try`, `run_id` `run-try@20261127-204212`: token vào 1521/1517/1525, ra 46/53/36, 0 lỗi, key không có trong trace/CSV.
- Merge thử `codebase/agent.py` với `cp3/t06-only`: không xung đột.
- Đã xử lý mục còn mở của review lần 2: S1 (agent), Gemini sai key, Ollama rỗng, thông báo lỗi.
- Còn mở: `ailab/llm.py` gặp phản hồi rỗng thì gọi lại model rồi báo thiếu khối html (TV3); HTML bị cắt do hết token (T08). Chưa review độc lập sau vòng này.

## Thay đổi mã

- `codebase/provider_usage.py` (mới): `ProviderError`, `extract_usage` (đọc usage strict theo từng provider), `http_error` (phân loại lỗi an toàn).
- `codebase/ai.py`:
  - `post_json` chuyển lỗi thành `ProviderError` an toàn;
  - các hàm `call_*` dùng `extract_usage`;
  - bỏ ép `int()`;
  - giữ `@model_call`, chế độ fake, `load_env`, `SHOW_RAW=False`.
- `codebase/agent.py`: +5 dòng, báo rõ khi model trả rỗng.
- `codebase/test_t07_provider.py` (mới): 67 test, không gọi mạng.

## Hạn chế

- `ProviderError.code` nhận mã có cấu trúc của provider khớp `^[A-Za-z0-9_.-]{1,64}$`. Nếu provider đặt một chuỗi bí mật có dạng mã vào `error.code`, chuỗi đó sẽ lọt qua. Muốn chặt hơn thì chuyển sang danh sách mã cho phép.
- Usage của Anthropic, Gemini, Ollama mới chỉ được kiểm bằng fixture. Chỉ OpenAI đã được kiểm bằng lần gọi thật.
- **Prompt caching (review R3):** với Anthropic, `tokens_in` = input + cache_creation + cache_read. Vì hợp đồng 4 khóa không có chỗ tách riêng token cache, chi phí `cost/simulate.py` tính ra là **ước lượng cao hơn thực tế** khi bật caching (giá thật của cache read khoảng 0,1×, cache write khoảng 1,25× giá input). OpenAI `prompt_tokens` cũng đã gồm token cache. Nhóm hiện chưa bật caching.
- **Phản hồi rỗng hoặc bị từ chối (review R2):** khi phản hồi đúng cấu trúc nhưng không có chữ (refusal, SAFETY, MAX_TOKENS, prompt bị chặn), `call_model` trả `text=""` kèm token thật để chi phí không bị mất. Agent phía trên phải tự xử lý trường hợp text rỗng.
- Chưa chạy `python run.py eval` chính thức hay `simulate`; đó là phần của TV4 (T18/T20).

## Bàn giao cho TV3 (T14) và TV4 (T18, T20)

- Đặt trong `.env` ở gốc repo, không commit file này:
  - `MODEL_PROVIDER=openai`
  - `MODEL_NAME=gpt-4o-mini`
  - `API_KEY=<key>`
- Lỗi API giờ là `ProviderError` với `kind ∈ auth/rate_limit/timeout/network/http/bad_response/usage_missing/config`. Khung `tracing` ghi lỗi này vào cột `error`.

## Review cuối trước khi merge

Review mức medium trên bản cuối: không có lỗi quan trọng mới trong phạm vi file T07. Còn mở: `ailab/llm.py` với phản hồi rỗng (TV3, phát sinh do `call_model` nay trả `text=""`); HTML bị cắt (có từ trước, T08); lỗi nhỏ: không ghi lý do bị chặn vào trace, gợi ý MODEL_NAME ở mọi HTTP 400, regex mã lỗi chấp nhận ký tự xuống dòng cuối chuỗi.
