"""OAuth Facebook (đăng nhập để lấy quyền trên Page) — gọi Graph API qua HTTPS, không phụ thuộc ngôn ngữ backend.

Luồng (giống MYSP, vpost/src/adapters/meta/facebook-oauth.ts):
  1. authorize_url(state) → hộp thoại www.facebook.com/<ver>/dialog/oauth (người dùng tự đăng nhập + bấm cho phép)
  2. Facebook gọi lại redirect_uri?code=…&state=… → exchange_code(code) → user token NGẮN hạn
  3. long_lived(token) → user token DÀI hạn (~60 ngày) → pages(token) → token của từng Page (không hết hạn)
.env cần: FB_APP_ID, FB_APP_SECRET (người dùng tự điền, không commit), FB_OAUTH_REDIRECT_URI (tuỳ chọn),
FB_LOGIN_CONFIG_ID (tuỳ chọn — app dùng "Facebook Login for Business" thì cấu hình quyền bằng config_id thay cho scope).
"""
import os
from urllib.parse import urlencode

SCOPES = ("pages_show_list", "pages_manage_posts", "pages_read_engagement")
DEFAULT_REDIRECT = "http://localhost:3010/api/channels/callback"   # đi qua proxy Next của giao diện VPOST


class FacebookError(Exception):
    """Lỗi từ Facebook — `code` là mã cho giao diện, `user_message` là câu tiếng Việt cho người vận hành."""

    def __init__(self, code, user_message):
        super().__init__(user_message)
        self.code, self.user_message = code, user_message


def _version():
    return os.environ.get("FB_GRAPH_VERSION", "v23.0").strip() or "v23.0"


def app_config():
    """(app_id, app_secret, redirect_uri) hoặc None khi .env chưa đủ."""
    app_id, secret = os.environ.get("FB_APP_ID", "").strip(), os.environ.get("FB_APP_SECRET", "").strip()
    if not (app_id and secret):
        return None
    return app_id, secret, os.environ.get("FB_OAUTH_REDIRECT_URI", "").strip() or DEFAULT_REDIRECT


def _require_app():
    cfg = app_config()
    if not cfg:
        raise FacebookError("APP_NOT_CONFIGURED", "Chưa cấu hình app Facebook: thêm FB_APP_ID và FB_APP_SECRET vào .env.")
    return cfg


def authorize_url(state):
    app_id, _, redirect = _require_app()
    q = {"client_id": app_id, "redirect_uri": redirect, "state": state, "response_type": "code"}
    config_id = os.environ.get("FB_LOGIN_CONFIG_ID", "").strip()
    if config_id:
        q["config_id"] = config_id
    else:
        q["scope"] = ",".join(SCOPES)
    return "https://www.facebook.com/%s/dialog/oauth?%s" % (_version(), urlencode(q))


def _get(path, **params):
    import httpx
    try:
        r = httpx.get("https://graph.facebook.com/%s%s" % (_version(), path), params=params, timeout=30)
        body = r.json()
    except (httpx.HTTPError, ValueError) as e:
        raise FacebookError("GRAPH_UNREACHABLE", "Không gọi được Facebook: %s" % type(e).__name__)
    if r.status_code != 200 or "error" in body:
        err = body.get("error", {}) if isinstance(body, dict) else {}
        # 190 = token hỏng/hết hạn/bị thu hồi
        code = "TOKEN_INVALID" if err.get("code") == 190 else "GRAPH_ERROR"
        raise FacebookError(code, "Facebook từ chối: %s" % (err.get("message") or r.text[:200]))
    return body


def exchange_code(code):
    """code từ callback → user token ngắn hạn."""
    app_id, secret, redirect = _require_app()
    return _get("/oauth/access_token", client_id=app_id, client_secret=secret, redirect_uri=redirect,
                code=code)["access_token"]


def long_lived(user_token):
    """user token ngắn hạn → dài hạn (để token của Page lấy từ nó không hết hạn)."""
    app_id, secret, _ = _require_app()
    return _get("/oauth/access_token", grant_type="fb_exchange_token", client_id=app_id, client_secret=secret,
                fb_exchange_token=user_token)["access_token"]


def pages(user_token):
    """Các Page người này quản lý: [{id, name, access_token|None}]."""
    out, after = [], None
    for _ in range(10):  # tối đa 10 trang × 100 Page
        params = {"fields": "id,name,access_token", "limit": 100, "access_token": user_token}
        if after:
            params["after"] = after
        body = _get("/me/accounts", **params)
        out += [{"id": p["id"], "name": p.get("name") or "", "access_token": p.get("access_token")}
                for p in body.get("data", []) if p.get("id")]
        after = (body.get("paging") or {}).get("cursors", {}).get("after") if (body.get("paging") or {}).get("next") else None
        if not after:
            break
    return out
