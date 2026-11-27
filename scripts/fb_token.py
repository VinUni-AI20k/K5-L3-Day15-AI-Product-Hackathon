"""Đổi token ngắn hạn (Graph API Explorer) → Page access token dài hạn, ghi thẳng vào .env. Không in token ra màn hình.

Trước khi chạy, tự điền vào .env (không commit):
    FB_APP_ID=...          # developers.facebook.com → app → Cài đặt → Thông tin cơ bản
    FB_APP_SECRET=...      # cùng trang đó
    FB_USER_TOKEN=...      # Graph API Explorer: quyền pages_show_list, pages_read_engagement, pages_manage_posts

Chạy:  python scripts/fb_token.py --page workhardtoday.vinuni
Kết quả: .env có FB_PAGE_ID, FB_PAGE_TOKEN (token Page không hết hạn); dòng FB_USER_TOKEN bị xoá.
"""
import argparse
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENV = os.path.join(ROOT, ".env")
NEED_SCOPES = {"pages_manage_posts", "pages_read_engagement", "pages_show_list"}


def read_env(path=ENV):
    out = {}
    if os.path.exists(path):
        for line in open(path, encoding="utf-8-sig"):
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                out[k.strip()] = v.strip().strip('"').strip("'")
    return out


def upsert_env(text, updates, drop=()):
    """Thay / thêm các dòng KEY=VALUE trong nội dung .env, giữ nguyên các dòng khác. drop: các khoá cần xoá."""
    lines, seen = [], set()
    for line in text.splitlines():
        key = line.split("=", 1)[0].strip().lstrip("# ").strip() if "=" in line else None
        if key in drop:
            continue
        if key in updates:
            if key not in seen:
                lines.append("%s=%s" % (key, updates[key]))
                seen.add(key)
            continue
        lines.append(line)
    lines += ["%s=%s" % (k, v) for k, v in updates.items() if k not in seen]
    return "\n".join(lines) + "\n"


def main():
    import httpx
    for s in (sys.stdout, sys.stderr):
        s.reconfigure(encoding="utf-8", errors="replace")
    ap = argparse.ArgumentParser()
    ap.add_argument("--page", default="workhardtoday.vinuni", help="username hoặc tên Fanpage thử")
    a = ap.parse_args()
    env = read_env()
    miss = [k for k in ("FB_APP_ID", "FB_APP_SECRET", "FB_USER_TOKEN") if not env.get(k)]
    if miss:
        sys.exit("Thiếu trong .env: %s — xem hướng dẫn đầu file scripts/fb_token.py" % ", ".join(miss))
    base = "https://graph.facebook.com/" + env.get("FB_GRAPH_VERSION", "v23.0")

    def get(path, **params):
        r = httpx.get(base + path, params=params, timeout=30)
        body = r.json()
        if r.status_code != 200 or "error" in body:
            sys.exit("Facebook từ chối (%s): %s" % (path, body.get("error", {}).get("message", r.text[:200])))
        return body

    long_user = get("/oauth/access_token", grant_type="fb_exchange_token", client_id=env["FB_APP_ID"],
                    client_secret=env["FB_APP_SECRET"], fb_exchange_token=env["FB_USER_TOKEN"])["access_token"]
    pages = get("/me/accounts", fields="id,name,username,access_token", limit=100, access_token=long_user)["data"]
    want = a.page.strip().lower()
    page = next((p for p in pages if want in ((p.get("username") or "").lower(), p["name"].lower(), p["id"])), None)
    if not page:
        sys.exit("Tài khoản này không quản lý page '%s'. Page tìm thấy: %s" % (a.page, ", ".join(p["name"] for p in pages) or "(không có)"))
    info = get("/debug_token", input_token=page["access_token"], access_token="%s|%s" % (env["FB_APP_ID"], env["FB_APP_SECRET"]))["data"]
    lacking = NEED_SCOPES - set(info.get("scopes", []))
    if lacking:
        sys.exit("Token thiếu quyền: %s — tạo lại token ở Graph API Explorer với đủ quyền" % ", ".join(sorted(lacking)))
    text = open(ENV, encoding="utf-8-sig").read()
    with open(ENV, "w", encoding="utf-8") as f:
        f.write(upsert_env(text, {"FB_PAGE_ID": page["id"], "FB_PAGE_TOKEN": page["access_token"]}, drop={"FB_USER_TOKEN"}))
    exp = info.get("expires_at", 0)
    print("Xong: page '%s' (id %s). Token %s. Đã ghi FB_PAGE_ID, FB_PAGE_TOKEN vào .env và xoá FB_USER_TOKEN."
          % (page["name"], page["id"], "không hết hạn" if not exp else "hết hạn lúc unix %s" % exp))
    print("Khởi động lại server: python codebase/server.py — góc phải sẽ hiện 'Lên lịch: Fanpage thử'.")


if __name__ == "__main__":
    main()
