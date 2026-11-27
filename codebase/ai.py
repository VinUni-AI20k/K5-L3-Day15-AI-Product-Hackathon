"""Nối model — chỗ DUY NHẤT trong bản chạy thử gọi model AI. NHÓM VIẾT phần gọi model thật.

Hợp đồng (giữ nguyên để khung đo được token):
    call_model(system: str, user: str) -> dict với 4 khoá
        "text":       str   chữ model trả về
        "model":      str   tên model đã gọi (để tra giá ở bảng giá model)
        "tokens_in":  int   số token vào, lấy từ trường usage trong phản hồi API — KHÔNG ước lượng
        "tokens_out": int   số token ra, gồm cả token suy luận / suy nghĩ nếu API tính riêng
    @model_call (từ tracing.py) tự ghi mỗi lần gọi vào trace; agent.py gọi call_model bao nhiêu lần
    cũng được, khung tự cộng token.
    Lỗi gọi model (hết lượt, sai key, mất mạng): cứ để exception bay ra — khung ghi lỗi vào cột error.

Chế độ giả (mặc định khi .env chưa có MODEL_PROVIDER, hoặc MODEL_PROVIDER=fake):
    trả một câu giả cố định, model "fake", token 0 — để luồng chạy hết từ trước CP2 (guide bước 3.2).
    Lượt `run.py eval` / `run.py simulate` chạy bằng model giả KHÔNG được tính.

Nối model thật: điền .env (chép từ .env.example), rồi viết nhánh gọi API ở dưới theo docs/connect-model.md
(có ví dụ OpenAI, Claude, model chạy trên máy, và cách nối nhà cung cấp khác). Không dán API key vào file này.

T07: token đọc strict qua provider_usage.extract_usage; lỗi gọi model là ProviderError (provider, kind,
status, code) — thông điệp không chứa body phản hồi, header, key hay prompt.
"""
import http.client
import json
import os
import socket
import urllib.error
import urllib.request

from provider_usage import MAX_ERROR_BODY, ProviderError, extract_usage, http_error
from tracing import model_call

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def load_env(path=os.path.join(ROOT, ".env")):
    """Đọc file .env (KEY=VALUE mỗi dòng) vào biến môi trường, không ghi đè biến đã có. Khung — không cần sửa."""
    if not os.path.exists(path):
        return
    with open(path, encoding="utf-8-sig") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


load_env()
MODEL_PROVIDER = (os.environ.get("MODEL_PROVIDER") or "fake").strip().lower()
MODEL_NAME = (os.environ.get("MODEL_NAME") or "").strip()
API_KEY = (os.environ.get("API_KEY") or "").strip()


SHOW_RAW = False   # True: in nguyên phản hồi của API khi cần tìm tên trường
MAX_OUT = 8192     # trả về cả một file game HTML nên cần nhiều token ra hơn ví dụ mẫu (1024)


def _http_body(e):
    """Đọc tối đa MAX_ERROR_BODY byte của body HTTPError (+1 byte để biết vượt) chỉ để lấy mã lỗi có cấu trúc.
    Vượt giới hạn thì trả nguyên phần đã đọc (> giới hạn) — http_error sẽ không parse. Lỗi đọc → rỗng."""
    try:
        return e.read(MAX_ERROR_BODY + 1) or b""
    except Exception:
        return b""
    finally:
        try:
            e.close()
        except Exception:
            pass


def post_json(url, headers, body, timeout=120, provider=None):
    """Gửi POST JSON, trả JSON phản hồi (dict). Chỉ dùng thư viện chuẩn.
    Lỗi thành ProviderError an toàn (không kèm body, header, key, URL); `from None` để traceback không mang body:
    HTTPError → http_error; OSError (URLError, ConnectionError, timeout) / http.client.HTTPException → network/timeout;
    ValueError / TypeError / http.client.InvalidURL (URL, header, tên model sai) → config; JSON hỏng → bad_response."""
    provider = provider or MODEL_PROVIDER
    err = None
    try:
        req = urllib.request.Request(
            url, data=json.dumps(body).encode("utf-8"), method="POST",
            headers=dict({"Content-Type": "application/json"}, **headers))
        with urllib.request.urlopen(req, timeout=timeout) as r:
            raw = r.read()
    except urllib.error.HTTPError as e:
        err = http_error(provider, e.code, _http_body(e))
    except urllib.error.URLError as e:
        timed_out = isinstance(e.reason, (socket.timeout, TimeoutError)) or "timed out" in str(e.reason).lower()
        err = ProviderError(provider, "timeout" if timed_out else "network")
    except (socket.timeout, TimeoutError):
        err = ProviderError(provider, "timeout")
    except http.client.InvalidURL:          # lớp con của HTTPException — bắt trước
        err = ProviderError(provider, "config")
    except (OSError, http.client.HTTPException):
        err = ProviderError(provider, "network")
    except (ValueError, TypeError):
        err = ProviderError(provider, "config")
    if err is not None:
        raise err from None
    try:
        data = json.loads(raw.decode("utf-8"))
    except Exception:
        data = None
    if not isinstance(data, dict):
        raise ProviderError(provider, "bad_response") from None
    if SHOW_RAW:
        print(json.dumps(data, ensure_ascii=False, indent=2)[:3000])
    return data


def _messages(system, user):
    return ([{"role": "system", "content": system}] if system else []) + [{"role": "user", "content": user}]


def _bad(provider, field):
    return ProviderError(provider, "bad_response", field=field)


def _join_texts(provider, texts, field):
    """Nối các đoạn chữ; mỗi đoạn phải là str (sai kiểu → bad_response). Không có đoạn nào → ""."""
    for t in texts:
        if not isinstance(t, str):
            raise _bad(provider, field)
    return "".join(texts)


# R2: mọi call_* đọc usage TRƯỚC. Phản hồi đúng cấu trúc nhưng không có chữ (từ chối, bị chặn, hết token)
# → text="" kèm token thật, không ném lỗi (khi có exception, tracing ghi 0 token và token đã tính tiền bị mất).
# Chỉ phản hồi hỏng cấu trúc / sai kiểu mới là bad_response.

def call_openai(system, user):
    data = post_json("https://api.openai.com/v1/chat/completions", {"Authorization": "Bearer " + API_KEY},
                     {"model": MODEL_NAME, "messages": _messages(system, user)}, provider="openai")
    tin, tout = extract_usage("openai", data)
    choices = data.get("choices")
    if not isinstance(choices, list) or not choices or not isinstance(choices[0], dict):
        raise _bad("openai", "choices")
    msg = choices[0].get("message")
    if not isinstance(msg, dict) or "content" not in msg:
        raise _bad("openai", "choices[0].message.content")
    content = msg["content"]          # null khi model từ chối (kèm "refusal") hoặc chỉ gọi tool
    if content is not None and not isinstance(content, str):
        raise _bad("openai", "choices[0].message.content")
    return {"text": content or "", "tokens_in": tin, "tokens_out": tout}


def call_claude(system, user):
    data = post_json("https://api.anthropic.com/v1/messages",
                     {"x-api-key": API_KEY, "anthropic-version": "2023-06-01"},
                     {"model": MODEL_NAME, "max_tokens": MAX_OUT, "system": system or "",
                      "messages": [{"role": "user", "content": user}]}, provider="anthropic")
    tin, tout = extract_usage("anthropic", data)
    blocks = data.get("content")
    if not isinstance(blocks, list) or not all(isinstance(b, dict) for b in blocks):
        raise _bad("anthropic", "content")
    text = _join_texts("anthropic", [b.get("text") for b in blocks if b.get("type") == "text"], "content[].text")
    return {"text": text, "tokens_in": tin, "tokens_out": tout}


def call_ollama(system, user):
    data = post_json("http://localhost:11434/api/chat", {},
                     {"model": MODEL_NAME, "messages": _messages(system, user), "stream": False}, timeout=300,
                     provider="ollama")
    tin, tout = extract_usage("ollama", data)
    msg = data.get("message")
    if not isinstance(msg, dict) or not isinstance(msg.get("content"), str):
        raise _bad("ollama", "message.content")
    return {"text": msg["content"], "tokens_in": tin, "tokens_out": tout}


def call_gemini(system, user):
    """Gemini (generativelanguage v1beta). Key đi qua header, không nằm trên URL. Token ra gồm cả token suy nghĩ nếu có."""
    body = {"contents": [{"role": "user", "parts": [{"text": user}]}],
            "generationConfig": {"maxOutputTokens": MAX_OUT}}
    if system:
        body["systemInstruction"] = {"parts": [{"text": system}]}
    data = post_json("https://generativelanguage.googleapis.com/v1beta/models/%s:generateContent" % MODEL_NAME,
                     {"x-goog-api-key": API_KEY}, body, provider="gemini")
    cands = data.get("candidates")
    if cands is None or cands == []:
        # prompt bị chặn: không có câu trả lời nhưng prompt vẫn bị tính token
        um = data.get("usageMetadata")
        if isinstance(um, dict) and "promptTokenCount" in um:
            tin, tout = extract_usage("gemini", data)
            return {"text": "", "tokens_in": tin, "tokens_out": tout}
        fb = data.get("promptFeedback")
        # chỉ nêu blockReason khi là mã an toàn (ProviderError tự lọc bằng regex); không dump JSON
        raise ProviderError("gemini", "bad_response", code=fb.get("blockReason") if isinstance(fb, dict) else None,
                            field="candidates")
    tin, tout = extract_usage("gemini", data)
    if not isinstance(cands, list) or not isinstance(cands[0], dict):
        raise _bad("gemini", "candidates")
    content = cands[0].get("content", {})       # vắng khi finishReason SAFETY / MAX_TOKENS
    if not isinstance(content, dict):
        raise _bad("gemini", "candidates[0].content")
    parts = content.get("parts", [])
    if not isinstance(parts, list) or not all(isinstance(p, dict) for p in parts):
        raise _bad("gemini", "candidates[0].content.parts")
    text = _join_texts("gemini", [p["text"] for p in parts if "text" in p], "candidates[0].content.parts[].text")
    return {"text": text, "tokens_in": tin, "tokens_out": tout}


PROVIDERS = {"openai": call_openai, "anthropic": call_claude, "claude": call_claude,
             "ollama": call_ollama, "gemini": call_gemini}


@model_call
def call_model(system: str, user: str) -> dict:
    if MODEL_PROVIDER == "fake":
        last = (user.strip().splitlines() or [""])[-1]
        return {"text": "[câu trả lời giả — chưa nối model] " + last[:60], "model": "fake", "tokens_in": 0, "tokens_out": 0}
    fn = PROVIDERS.get(MODEL_PROVIDER)
    if fn is None:
        raise NotImplementedError("MODEL_PROVIDER=%s chưa được hỗ trợ (có: %s) — xem docs/connect-model.md mục 2.4"
                                  % (MODEL_PROVIDER, ", ".join(sorted(PROVIDERS))))
    if not MODEL_NAME or (MODEL_PROVIDER != "ollama" and not API_KEY):
        raise RuntimeError("Thiếu MODEL_NAME hoặc API_KEY trong .env (xem .env.example).")
    r = fn(system, user)
    return {"text": r["text"], "model": MODEL_NAME, "tokens_in": r["tokens_in"], "tokens_out": r["tokens_out"]}
