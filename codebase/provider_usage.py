"""T07 — đọc usage (token) từ phản hồi API một cách strict, và lỗi provider an toàn. Chỉ thư viện chuẩn.

    ProviderError(provider, kind, status=None, code=None)   lỗi có cấu trúc; str(e) không chứa body,
                                                             header, key, URL có query hay prompt
    extract_usage(provider, data) -> (tokens_in, tokens_out) số nguyên ≥0 lấy đúng trường usage, không ước lượng
    http_error(provider, status, body) -> ProviderError      ánh xạ HTTP status → kind; code chỉ lấy mã có cấu trúc
"""
import json
import re

KINDS = ("auth", "rate_limit", "timeout", "network", "http", "bad_response", "usage_missing", "config")
MAX_ERROR_BODY = 65536   # body lỗi dài hơn thì không parse (code=None)

_MESSAGES = {
    "auth": "sai hoặc thiếu quyền API key — kiểm tra API_KEY trong .env",
    "rate_limit": "hết lượt hoặc vượt giới hạn gọi — thử lại sau hoặc kiểm tra hạn mức",
    "timeout": "hết thời gian chờ phản hồi",
    "network": "không kết nối được tới máy chủ model",
    "http": "máy chủ model trả lỗi",
    "bad_response": "phản hồi sai cấu trúc",
    "usage_missing": "phản hồi thiếu số token (usage)",
    "config": "cấu hình gọi model không hợp lệ (kiểm MODEL_NAME, URL và API_KEY)",
}

SAFE_CODE = re.compile(r"^[A-Za-z0-9_.-]{1,64}$")
_SAFE_FIELD = re.compile(r"^[A-Za-z0-9_.\[\]]{1,80}$")


def safe_code(value):
    """Trả value nếu là chuỗi mã có cấu trúc an toàn, ngược lại None."""
    if isinstance(value, str) and SAFE_CODE.match(value):
        return value
    return None


class ProviderError(RuntimeError):
    """Lỗi gọi model. Thông điệp chỉ gồm provider, kind, status, code và câu cố định (+ tên trường nội bộ)."""

    def __init__(self, provider, kind, status=None, code=None, field=None):
        if kind not in KINDS:
            kind = "http"
        self.provider = str(provider)
        self.kind = kind
        self.status = status if isinstance(status, int) and not isinstance(status, bool) else None
        self.code = safe_code(code)
        self.field = field if isinstance(field, str) and _SAFE_FIELD.match(field) else None
        msg = "%s %s" % (self.provider, kind)
        if self.status is not None:
            msg += " HTTP %d" % self.status
        if self.code:
            msg += " (%s)" % self.code
        msg += ": " + _MESSAGES[kind]
        if kind == "http" and self.status in (400, 404):
            msg += " — kiểm MODEL_NAME trong .env"
        if self.field:
            msg += " [%s]" % self.field
        super().__init__(msg)

    def __reduce__(self):
        return (ProviderError, (self.provider, self.kind, self.status, self.code, self.field))


def _num(provider, block, key, prefix, required=True):
    """Lấy block[key] strict: int, không bool, ≥0. Vắng → usage_missing (nếu bắt buộc) hoặc None."""
    if key not in block or block[key] is None:
        if required:
            raise ProviderError(provider, "usage_missing", field=prefix + key)
        return None
    v = block[key]
    if not isinstance(v, int) or isinstance(v, bool) or v < 0:
        raise ProviderError(provider, "bad_response", field=prefix + key)
    return v


def _block(provider, data, key):
    if not isinstance(data, dict):
        raise ProviderError(provider, "bad_response")
    b = data.get(key)
    if b is None:
        raise ProviderError(provider, "usage_missing", field=key)
    if not isinstance(b, dict):
        raise ProviderError(provider, "bad_response", field=key)
    return b


def _gemini_has_text(data):
    """True khi có ít nhất một part chứa chuỗi text không rỗng trong candidates."""
    cands = data.get("candidates")
    if not isinstance(cands, list):
        return False
    for c in cands:
        content = c.get("content") if isinstance(c, dict) else None
        parts = content.get("parts") if isinstance(content, dict) else None
        if isinstance(parts, list) and any(isinstance(x, dict) and isinstance(x.get("text"), str) and x["text"]
                                           for x in parts):
            return True
    return False


def extract_usage(provider, data):
    """(tokens_in, tokens_out) từ phản hồi JSON đã parse. Không ép kiểu, không ước lượng.

    Anthropic: tokens_in = input_tokens + cache_creation_input_tokens + cache_read_input_tokens, vì hợp đồng
    4 khoá không tách được token cache — khi bật prompt caching, chi phí mô phỏng (tính mọi token vào theo giá
    input đầy đủ) là ƯỚC LƯỢNG CAO HƠN thực tế.
    Gemini: vắng cả candidatesTokenCount lẫn thoughtsTokenCount → usage_missing nếu phản hồi có chữ; nếu không có
    chữ (không candidates / candidate không content-parts) thì tokens_out = 0, giữ promptTokenCount.
    Ollama: prompt_eval_count được vắng (prompt đã nằm trong KV cache) → tokens_in = 0; eval_count bắt buộc,
    trừ khi done=true và message.content == "" (không sinh chữ) → tokens_out = 0.
    """
    p = (provider or "").strip().lower()
    if p == "openai":
        u = _block(p, data, "usage")
        # completion_tokens đã gồm reasoning_tokens — không cộng thêm
        return _num(p, u, "prompt_tokens", "usage."), _num(p, u, "completion_tokens", "usage.")
    if p in ("anthropic", "claude"):
        u = _block(p, data, "usage")
        tin = _num(p, u, "input_tokens", "usage.")
        for k in ("cache_creation_input_tokens", "cache_read_input_tokens"):
            extra = _num(p, u, k, "usage.", required=False)
            if extra is not None:
                tin += extra
        return tin, _num(p, u, "output_tokens", "usage.")
    if p == "gemini":
        u = _block(p, data, "usageMetadata")
        tin = _num(p, u, "promptTokenCount", "usageMetadata.")
        cand = _num(p, u, "candidatesTokenCount", "usageMetadata.", required=False)
        thoughts = _num(p, u, "thoughtsTokenCount", "usageMetadata.", required=False)
        if cand is None and thoughts is None:
            if _gemini_has_text(data):
                raise ProviderError(p, "usage_missing", field="usageMetadata.candidatesTokenCount")
            return tin, 0   # không có chữ (bị chặn / SAFETY / không candidates): giữ token vào đã tính tiền
        return tin, (cand or 0) + (thoughts or 0)
    if p == "ollama":
        if not isinstance(data, dict):
            raise ProviderError(p, "bad_response")
        tin = _num(p, data, "prompt_eval_count", "", required=False)
        msg = data.get("message")
        if ("eval_count" not in data or data["eval_count"] is None) and data.get("done") is True                 and isinstance(msg, dict) and msg.get("content") == "":
            return (0 if tin is None else tin), 0   # xong mà không sinh chữ: Ollama bỏ eval_count
        return (0 if tin is None else tin), _num(p, data, "eval_count", "")
    raise ProviderError(p or "unknown", "bad_response", field="provider")


GEMINI_AUTH_REASONS = ("API_KEY_INVALID", "API_KEY_EXPIRED")


def _error_obj(body):
    """Khối "error" (dict) trong body JSON ≤ MAX_ERROR_BODY byte, ngược lại None."""
    if not isinstance(body, (bytes, bytearray)) or not body or len(body) > MAX_ERROR_BODY:
        return None
    try:
        data = json.loads(bytes(body).decode("utf-8"))
    except Exception:
        return None
    err = data.get("error") if isinstance(data, dict) else None
    return err if isinstance(err, dict) else None


def _auth_reason(err):
    """Gemini báo sai key bằng HTTP 400 + error.details[].reason; chỉ lấy reason là mã an toàn đã biết."""
    details = err.get("details") if isinstance(err, dict) else None
    if not isinstance(details, list):
        return None
    for d in details:
        r = safe_code(d.get("reason")) if isinstance(d, dict) else None
        if r in GEMINI_AUTH_REASONS:
            return r
    return None


def _error_code(body):
    """Mã lỗi có cấu trúc trong body JSON (error.code / error.type / error.status), không lấy message."""
    err = _error_obj(body)
    if err is None:
        return None
    for k in ("code", "type", "status"):
        c = safe_code(err.get(k))
        if c:
            return c
    return None


def http_error(provider, status, body=b""):
    """ProviderError từ HTTP status. Body chỉ dùng để lấy mã lỗi có cấu trúc, không vào thông điệp."""
    if status in (401, 403):
        kind = "auth"
    elif status == 429:
        kind = "rate_limit"
    elif status in (408, 504):
        kind = "timeout"
    else:
        kind = "http"
    if status == 400:
        reason = _auth_reason(_error_obj(body))
        if reason:
            return ProviderError(provider, "auth", status=status, code=reason)
    return ProviderError(provider, kind, status=status, code=_error_code(body))
