# T07 — Real LLM Integration & Usage Tracking: interface chốt trước khi giao coder

Nền: `origin/main` `dd5d71e`. Nhánh: `cp3/t07-only`, worktree `C:\Users\Admin\Desktop\hackathon\t07-main`.

Owner T07 là TV2. Deliverable theo `docs/TASKS.md` là `codebase/ai.py`, nên sửa `ai.py` thuộc đúng phạm vi task. Giữ nguyên: `@model_call`, chữ ký `call_model(system, user) -> {text, model, tokens_in, tokens_out}`, chế độ fake, `load_env`, `SHOW_RAW=False`.

Không sửa `tracing.py`, `run.py`, `eval/`, `cost/`, `ailab/*`. Không đọc hoặc in `.env`, không đưa key vào code, test hay log.

## 1. File và chủ sở hữu

| File | Coder | Ghi chú |
|---|---|---|
| `codebase/provider_usage.py` (mới) | Nghiệp vụ | Đọc usage strict, lỗi an toàn |
| `codebase/ai.py` (sửa tối thiểu) | Nghiệp vụ | Chỉ nối helper; không viết lại provider |
| `codebase/test_t07_provider.py` (mới) | Kiểm thử | Chỉ fixture, không gọi mạng |

## 2. `codebase/provider_usage.py`

### `class ProviderError(RuntimeError)`

Thuộc tính:
- `provider: str`
- `kind ∈ {"auth","rate_limit","timeout","network","http","bad_response","usage_missing"}`
- `status: int|None`
- `code: str|None`

`str(e)` có dạng `"<provider> <kind>[ HTTP <status>][ (<code>)]: <thông điệp cố định tiếng Việt>"`.

`str(e)` **không bao giờ** chứa:
- body phản hồi;
- header;
- API key;
- URL có query;
- prompt.

### `extract_usage(provider, data) -> (tokens_in, tokens_out)`

Hàm đọc usage một cách strict:
- Mỗi số lấy ra phải là `int`, không phải `bool`, và `>= 0`.
- Thiếu khối usage hoặc thiếu trường bắt buộc → `ProviderError(kind="usage_missing")`.
- Sai kiểu (chuỗi, float, bool, số âm) → `ProviderError(kind="bad_response")`.
- Không ép kiểu, không ước lượng, không tự điền 0.

| provider | tokens_in | tokens_out |
|---|---|---|
| `openai` | `usage.prompt_tokens` | `usage.completion_tokens` (đã gồm reasoning; **không** cộng thêm `completion_tokens_details.reasoning_tokens`) |
| `anthropic` / `claude` | `usage.input_tokens` + `cache_creation_input_tokens` + `cache_read_input_tokens` (hai trường cache cộng vào khi có; nếu có thì cũng phải hợp lệ) | `usage.output_tokens` (đã gồm thinking) |
| `gemini` | `usageMetadata.promptTokenCount` | `candidatesTokenCount` + `thoughtsTokenCount`. Mỗi trường được phép vắng, nhưng **phải có ít nhất một**; vắng cả hai → `usage_missing` |
| `ollama` | `prompt_eval_count` | `eval_count` (cả hai bắt buộc) |

### `http_error(provider, status, body: bytes) -> ProviderError`

Ánh xạ status sang `kind`:

| status | kind |
|---|---|
| 401, 403 | `auth` |
| 429 | `rate_limit` |
| 408, 504 | `timeout` |
| khác | `http` |

`code` chỉ lấy mã lỗi có cấu trúc của provider (vd `error.type`, `error.code`, `error.status`) khi khớp `^[A-Za-z0-9_.-]{1,64}$`. Không lấy message text của provider.

## 3. Thay đổi trong `codebase/ai.py`

- `post_json(url, headers, body, timeout=120, provider=...)` chuyển lỗi thành `ProviderError` an toàn:

  | Lỗi gốc | Xử lý |
  |---|---|
  | `HTTPError` | `http_error(...)`, **không** đọc body vào message |
  | `socket.timeout` / `TimeoutError` / `URLError` có lý do timeout | `kind="timeout"` |
  | `URLError` khác | `kind="network"` |
  | JSON hỏng | `kind="bad_response"` |

  Exception gốc không được gắn vào message. Dùng `raise ... from None` để traceback không mang body.
- Các hàm `call_*` dùng `extract_usage`.
- Gemini không có candidates → `bad_response`. Chỉ được nêu `promptFeedback.blockReason` khi giá trị khớp regex ở trên; không dump JSON.
- Phản hồi thiếu text, sai cấu trúc → `bad_response`.
- `call_model` bỏ `int(...)` ép kiểu. Trường `model` giữ `MODEL_NAME`, để thống nhất với bảng giá.

## 4. Kiểm thử (`codebase/test_t07_provider.py`, không mạng)

| ID | Ca |
|---|---|
| T07-01 | Fixture hợp lệ cho từng provider ra đúng tokens. Các ca riêng: OpenAI có `reasoning_tokens` không bị cộng trùng; Anthropic cộng cache; Gemini cộng thoughts |
| T07-02 | Thiếu usage hoặc thiếu trường bắt buộc → `usage_missing` |
| T07-03 | Giá trị bool / chuỗi số / float / số âm → `bad_response` |
| T07-04 | HTTP 401/403/429/500/504, body chứa chuỗi bí mật giả (sentinel) → đúng `kind`; message không chứa sentinel |
| T07-05 | Timeout, lỗi mạng, JSON hỏng → đúng `kind`, message an toàn |
| T07-06 | `call_model` với provider giả lập (patch `urlopen` trong test, gán tạm `ai.MODEL_PROVIDER` / `API_KEY` = sentinel rồi khôi phục): (a) trả đúng 4 khóa, token `int`; (b) lỗi HTTP: `tracing.end()` có error event, exception được raise, không chứa sentinel key/body; không trả fake fallback |
| T07-07 | Chế độ fake không đổi (`model="fake"`, token 0) |
| T07-08 | Hồi quy: `python -m unittest discover -s codebase -p "test_*.py"` và `-s ailab` đều OK |

## 5. Ngoài phạm vi coder

Lần gọi model thật (`python run.py`, `python run.py eval --try`) cần `.env` do người dùng cấu hình và người dùng cho phép gọi API thật (có chi phí). Bước này do điều phối chạy sau khi người dùng xác nhận.

## 6. Sửa sau review lần 1 (bắt buộc, ưu tiên hơn §2–§3 nếu mâu thuẫn)

| # | Lỗi review | Hành vi chốt |
|---|---|---|
| R1 | Ollama bỏ `prompt_eval_count` khi prompt đã nằm trong KV cache → hiện báo `usage_missing` | Ollama: `eval_count` **bắt buộc**. `prompt_eval_count` **được phép vắng** (do cache), khi đó `tokens_in = 0`. Nếu có thì vẫn phải là int hợp lệ. Chỉ vắng `eval_count` mới là `usage_missing` |
| R2 | Kiểm text trước usage → phản hồi rỗng hoặc bị từ chối làm mất token đã bị tính tiền (khi có exception, tracing ghi 0) | Mọi `call_*` đọc **usage trước**. Phản hồi **hợp lệ về cấu trúc** nhưng text rỗng (OpenAI `content: null` kèm `refusal`, Anthropic `content: []` hoặc không có text block, Gemini candidate không có part do `finishReason` SAFETY/MAX_TOKENS, Ollama `content: ""`) thì **trả `text=""` kèm usage thật**, không ném lỗi. Gemini không có candidates nhưng có `usageMetadata.promptTokenCount` (prompt bị chặn) cũng trả `text=""` kèm token. Chỉ phản hồi **hỏng cấu trúc** mới là `bad_response`: thiếu `choices`/`message`/`content`/`candidates` ở mức không đọc được, sai kiểu (vd `content` là số). Ghi `text` rỗng; không bịa câu trả lời |
| R3 | Token cache của Anthropic bị cộng vào `tokens_in`, tính theo giá input đầy đủ | **Giữ cách tính hiện tại** (`tokens_in` = input + cache_creation + cache_read), vì hợp đồng 4 khóa không có chỗ tách riêng token cache. Ghi rõ trong docstring `extract_usage` và `T07_RESULTS.md`: chi phí mô phỏng chỉ là **ước lượng cao hơn thực tế** khi bật prompt caching. Nhóm hiện dùng OpenAI, chưa dùng cache của Anthropic |
| R4 | Mọi exception khác trong `urlopen` đều bị gắn nhãn `network` | Chỉ `OSError` (gồm `URLError`, `ConnectionError`) và `http.client.HTTPException` được tính là `network`/`timeout`. `ValueError` / `TypeError` / `http.client.InvalidURL` → thêm kind **`config`**: `"<provider> config: cấu hình gọi model không hợp lệ (kiểm MODEL_NAME/URL)"`. Không kèm giá trị cấu hình, vẫn dùng `from None`. Thêm `config` vào `KINDS` |
| R5 | Body lỗi bị cắt 64KB trước khi parse JSON; `_http_body` đọc không giới hạn | `_http_body` đọc **tối đa 65536 byte**. Nếu body dài hơn (đọc thêm 1 byte để biết) thì không parse, `code=None`. Body ≤ 64KB thì parse đầy đủ |
| R6 | `ProviderError` không pickle được | Thêm `__reduce__` trả `(ProviderError, (provider, kind, status, code, field))`. Sau khi pickle rồi unpickle phải giữ nguyên `kind`, `status`, `code`, `str()` |
| R7 | Test | (a) T07-06b: kiểm rõ không có event nào `model == "fake"`, exception thật sự được raise, và không có event nào token > 0 giả. (b) Bỏ các dòng không làm gì (`mock.patch.stopall` không được gọi, `if True:` kiểm regex của chính test). (c) Không ghi đè `os.environ` vĩnh viễn: dùng `mock.patch.dict(os.environ, {"MODEL_PROVIDER": "fake"})` trong `setUpModule`/`tearDownModule`, hoặc lưu rồi khôi phục. (d) Thêm hồi quy cho R1–R6 |

## 7. Sửa sau review lần 2 (vòng cuối)

Người dùng (owner TV2) cho phép sửa `codebase/agent.py` trong phạm vi lỗi S1. Không sửa `ailab/llm.py` (phía TV3), không xử lý HTML bị cắt do hết token (chuyển T08).

| # | Hành vi chốt |
|---|---|
| S1 | `agent.answer`: khi text model trả về rỗng hoặc chỉ khoảng trắng → trả `{"output": <thông báo tiếng Việt rõ: model không trả nội dung (có thể bị từ chối, bị chặn hoặc hết token), mời diễn đạt lại>}`, ghi `note()` lý do dừng. Nếu lượt trước bị `check_game` từ chối thì thông báo giữ cả lý do đó. Không gọi thêm lượt model chỉ vì text rỗng. Hợp đồng `answer(text)->{"output":str}`, `MAX_STEPS`, các nhánh khác giữ nguyên |
| S2 | Gemini sai key: HTTP 400 có `error.details[].reason == "API_KEY_INVALID"` (hoặc `API_KEY_EXPIRED`) → `kind="auth"`, `code` là reason đó. Chỉ đọc `reason` khớp regex mã; không lấy message |
| S3 | Ollama: `done` là true, `message.content` rỗng và vắng `eval_count` → `tokens_out = 0`, không `usage_missing`. Có text mà vắng `eval_count` vẫn `usage_missing`; sai kiểu vẫn `bad_response` |
| S4 | Thông báo cố định: `config` nhắc kiểm `MODEL_NAME`, URL và `API_KEY`; `http` với status 400 hoặc 404 thêm gợi ý "kiểm MODEL_NAME trong .env". Vẫn không chứa dữ liệu phản hồi |
