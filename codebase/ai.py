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

Nối model thật qua OpenAI hoặc llama.cpp chạy cục bộ. Xem docs/connect-model.md.
Không dán API key vào file này.
"""
import base64
import json
import os
from urllib.error import HTTPError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen

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

def _call_chat(url: str, system: str, user, *, api_key: str = "", max_tokens: int = 0) -> dict:
    """user là chuỗi, hoặc danh sách phần nội dung (chữ + ảnh) theo định dạng chat completions."""
    messages = [{"role": "user", "content": user}]
    if system:
        messages.insert(0, {"role": "system", "content": system})
    payload = {"model": MODEL_NAME, "messages": messages}
    if max_tokens:
        payload.update(max_tokens=max_tokens, temperature=0)
    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = "Bearer " + api_key
    request = Request(
        url, data=json.dumps(payload).encode("utf-8"), headers=headers, method="POST",
    )
    try:
        with urlopen(request, timeout=60) as response:
            result = json.load(response)
    except HTTPError as error:
        raise RuntimeError(f"{MODEL_PROVIDER} trả HTTP {error.code}. Kiểm tra kết nối và cấu hình model.") from None

    usage = result["usage"]
    content = result["choices"][0]["message"]["content"]
    if not isinstance(content, str) or not content.strip():
        raise RuntimeError("Model không trả văn bản cho lượt thử.")
    return {
        "text": content,
        "model": result.get("model") or MODEL_NAME,
        "tokens_in": usage["prompt_tokens"],
        "tokens_out": usage["completion_tokens"],
    }


@model_call
def call_model(system: str, user: str) -> dict:
    if MODEL_PROVIDER == "fake":
        last = (user.strip().splitlines() or [""])[-1]
        return {"text": "[câu trả lời giả — chưa nối model] " + last[:60], "model": "fake", "tokens_in": 0, "tokens_out": 0}

    if MODEL_PROVIDER == "openai":
        if not MODEL_NAME or not API_KEY:
            raise RuntimeError("Cần điền MODEL_NAME và API_KEY vào .env để thử OpenAI.")
        return _call_chat("https://api.openai.com/v1/chat/completions", system, user, api_key=API_KEY)
    if MODEL_PROVIDER == "llamacpp":
        local_url = (os.environ.get("SKYBILL_MODEL_URL") or "http://127.0.0.1:18088").rstrip("/")
        endpoint = urlsplit(local_url)
        if not MODEL_NAME or endpoint.scheme != "http" or endpoint.hostname not in {"127.0.0.1", "::1", "localhost"}:
            raise RuntimeError("Cần MODEL_NAME và SKYBILL_MODEL_URL trỏ đến llama-server trên máy này.")
        return _call_chat(local_url + "/v1/chat/completions", system, user, max_tokens=32)
    raise NotImplementedError("Chưa có adapter cho MODEL_PROVIDER=%s — xem docs/connect-model.md" % MODEL_PROVIDER)


@model_call
def call_model_image(system: str, user: str, image_bytes: bytes, mime: str = "image/jpeg") -> dict:
    """Như call_model nhưng kèm một ảnh (model đọc ảnh hoá đơn). Token lấy từ usage của API.

    Chỉ hỗ trợ OpenAI; chế độ giả và provider khác báo lỗi để luồng quay về OCR cục bộ.
    """
    if MODEL_PROVIDER != "openai":
        raise NotImplementedError("Đọc ảnh bằng model cần MODEL_PROVIDER=openai.")
    if not MODEL_NAME or not API_KEY:
        raise RuntimeError("Cần điền MODEL_NAME và API_KEY vào .env để thử OpenAI.")
    image_url = "data:%s;base64,%s" % (mime, base64.b64encode(image_bytes).decode("ascii"))
    content = [{"type": "text", "text": user}, {"type": "image_url", "image_url": {"url": image_url}}]
    return _call_chat("https://api.openai.com/v1/chat/completions", system, content, api_key=API_KEY)
