"""AI Lab (Mô hình · Trình chơi · Ứng dụng · Trợ lý game) — máy chủ web, chỉ thư viện chuẩn Python 3.10+.

    python ailab/server.py                       # chạy (mặc định 127.0.0.1:8800)
    python ailab/server.py create-user NAME [--admin] [--password P]
    python ailab/server.py set-password NAME [--password P]

Biến môi trường: AILAB_HOST, AILAB_PORT, AILAB_DB (đường dẫn SQLite), AILAB_ADMIN_PASSWORD (mật khẩu admin lần đầu),
AILAB_COOKIE_SECURE=1 (khi chạy sau HTTPS). Model AI: MODEL_PROVIDER / MODEL_NAME / API_KEY trong .env (xem codebase/ai.py).
"""
import getpass
import json
import mimetypes
import os
import re
import sys
import time
from http import cookies
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import contract  # noqa: E402
import llm  # noqa: E402
import store  # noqa: E402
from store import Err  # noqa: E402

WEB = os.path.join(store.HERE, "web")
COOKIE = "ailab_sid"
MAX_BODY = 3 * 1024 * 1024
FAILS = {}  # ip -> [thời điểm đăng nhập sai]


def _need_admin(u):
    if u["role"] != "admin":
        raise Err(403, "forbidden", "Chỉ Admin được làm việc này.")


def _int(v):
    try:
        return int(v)
    except (TypeError, ValueError):
        raise Err(404, "not_found", "Không thấy.")



def _pub(m, index):
    """Một tin nhắn cho trình duyệt: đề xuất không mang theo mã html (xem bằng /try)."""
    m = dict(m)
    if m.get("proposal"):
        m["proposal"] = {k: v for k, v in m["proposal"].items() if k != "html"}
        m["proposal"]["index"] = index
    return m

class H(BaseHTTPRequestHandler):
    server_version = "AILab/1"

    def log_message(self, fmt, *a):
        sys.stderr.write("%s %s\n" % (self.log_date_time_string(), fmt % a))

    # ---- tiện ích ----
    def _send(self, status, body, ctype="application/json; charset=utf-8", headers=None):
        if not isinstance(body, bytes):
            body = body.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "same-origin")
        self.send_header("Cache-Control", "no-store")
        for k, v in (headers or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def _json(self, status, obj, headers=None):
        self._send(status, json.dumps(obj, ensure_ascii=False), headers=headers)

    def _token(self):
        raw = self.headers.get("Cookie")
        if not raw:
            return None
        try:
            c = cookies.SimpleCookie(raw)
        except cookies.CookieError:
            return None
        return c[COOKIE].value if COOKIE in c else None

    def _body(self):
        n = int(self.headers.get("Content-Length") or 0)
        if n > MAX_BODY:
            raise Err(413, "too_big", "Dữ liệu gửi lên quá lớn.")
        if n == 0:
            return {}
        if "application/json" not in (self.headers.get("Content-Type") or ""):
            raise Err(415, "json_only", "Chỉ nhận JSON.")
        try:
            d = json.loads(self.rfile.read(n).decode("utf-8"))
        except ValueError:
            raise Err(400, "bad_json", "JSON không hợp lệ.")
        if not isinstance(d, dict):
            raise Err(400, "bad_json", "JSON phải là một đối tượng.")
        return d

    # ---- định tuyến ----
    def do_GET(self):
        self._handle("GET")

    def do_POST(self):
        self._handle("POST")

    def do_PUT(self):
        self._handle("PUT")

    def do_DELETE(self):
        self._handle("DELETE")

    def _handle(self, method):
        path = self.path.split("?", 1)[0]
        try:
            if path == "/health":
                return self._json(200, {"ok": True})
            if path.startswith("/api/"):
                return self._api(method, path[5:])
            if method != "GET":
                raise Err(405, "method", "Không hỗ trợ.")
            return self._static(path)
        except Err as e:
            self._json(e.status, {"error": e.code, "message": e.msg})
        except Exception as e:  # lỗi không lường: không lộ chi tiết ra ngoài
            sys.stderr.write("LỖI %s %s: %r\n" % (method, path, e))
            import traceback
            traceback.print_exc()
            self._json(500, {"error": "server", "message": "Có lỗi ở máy chủ. Thử lại, nếu vẫn lỗi hãy báo Admin."})

    def _static(self, path):
        if path in ("/", ""):
            path = "/index.html"
        m = re.match(r"^/play/(\d+)$", path)
        if m:
            path = "/play.html"
        full = os.path.normpath(os.path.join(WEB, path.lstrip("/")))
        if not full.startswith(WEB + os.sep) or not os.path.isfile(full):
            raise Err(404, "not_found", "Không thấy trang này.")
        ctype = mimetypes.guess_type(full)[0] or "application/octet-stream"
        with open(full, "rb") as f:
            self._send(200, f.read(), ctype + ("; charset=utf-8" if ctype.startswith("text/") or ctype.endswith("javascript") else ""))

    def _api(self, method, p):
        c = store.connect()
        try:
            user = store.user_of(c, self._token())
            # --- mở ---
            if (method, p) == ("POST", "register"):
                d = self._body()
                store.register(c, d.get("username"), d.get("password"))
                return self._login_reply(c, d)
            if (method, p) == ("POST", "login"):
                return self._login_reply(c, self._body())
            if (method, p) == ("POST", "logout"):
                if self._token():
                    c.execute("DELETE FROM sessions WHERE token=?", (self._token(),))
                    c.commit()
                return self._json(200, {"ok": True}, {"Set-Cookie": self._cookie("", 0)})
            m = re.match(r"^apps/(\d+)/play$", p)
            if method == "GET" and m:
                return self._json(200, store.play_data(c, int(m.group(1)), user))
            # --- cần đăng nhập ---
            if not user:
                raise Err(401, "login", "Bạn cần đăng nhập.")
            if (method, p) == ("GET", "me"):
                return self._json(200, {"user": user, "llm": "giả" if llm._real_model() is None else "thật"})
            return self._authed(c, method, p, user)
        finally:
            c.close()

    def _cookie(self, token, age):
        secure = "; Secure" if os.environ.get("AILAB_COOKIE_SECURE") == "1" else ""
        return "%s=%s; Path=/; HttpOnly; SameSite=Lax; Max-Age=%d%s" % (COOKIE, token, age, secure)

    def _login_reply(self, c, d):
        ip = self.client_address[0]
        now = time.time()
        FAILS[ip] = [t for t in FAILS.get(ip, []) if now - t < 300]
        if len(FAILS[ip]) >= 10:
            raise Err(429, "too_many", "Đăng nhập sai quá nhiều lần. Chờ vài phút rồi thử lại.")
        try:
            token, uid = store.login(c, d.get("username"), d.get("password"))
        except Err:
            FAILS[ip].append(now)
            raise
        user = store.user_of(c, token)
        self._json(200, {"user": user}, {"Set-Cookie": self._cookie(token, 7 * 86400)})

    # ---- các thao tác cần đăng nhập ----
    def _authed(self, c, method, p, user):
        parts = p.split("/")
        res = parts[0]
        if len(parts) == 3 and parts[2] == "meta" and method == "POST" and res in store.META_TABLES:
            store.update_meta(c, res, _int(parts[1]), user, self._body())  # tên, mô tả, ảnh
            return self._json(200, {"ok": True})
        if res == "exams":
            return self._exams(c, method, parts, user)
        if res == "models":
            return self._models(c, method, parts, user)
        if res == "players":
            return self._players(c, method, parts, user)
        if res == "apps":
            return self._apps(c, method, parts, user)
        if res == "chat" or res == "chats":
            return self._chat(c, method, parts, user)
        if res == "admin":
            _need_admin(user)
            return self._admin(c, method, parts)
        raise Err(404, "not_found", "Không thấy.")

    def _exams(self, c, method, parts, user):
        """Bộ đề: nguồn câu hỏi dùng chung cho ứng dụng. Của ai người đó thấy; Admin thấy hết."""
        if len(parts) == 1:
            if method == "GET":
                if "scope=all" in self.path:
                    _need_admin(user)
                    rows = c.execute("SELECT e.*, u.username owner FROM exams e LEFT JOIN users u ON u.id=e.owner_id ORDER BY e.id DESC").fetchall()
                else:
                    rows = c.execute("SELECT e.*, u.username owner FROM exams e LEFT JOIN users u ON u.id=e.owner_id WHERE e.owner_id IN (?,0) ORDER BY e.id DESC", (user["id"],)).fetchall()
                out = []
                for r in rows:
                    d = store.exam_row(r, user)
                    d["owner"] = r["owner"] or "AI Lab"
                    out.append(d)
                return self._json(200, {"exams": out})
            if method == "POST":
                if c.execute("SELECT COUNT(*) FROM exams WHERE owner_id=?", (user["id"],)).fetchone()[0] >= 100:
                    raise Err(409, "storage_full", "Mỗi tài khoản có tối đa 100 bộ đề.")
                name, desc, content, image = store.clean_exam(self._body())
                now = time.time()
                cur = c.execute("INSERT INTO exams(owner_id,name,description,image,content,created,updated) VALUES(?,?,?,?,?,?,?)",
                                (user["id"], name, desc, image, content, now, now))
                c.commit()
                return self._json(201, {"id": cur.lastrowid})
        elif len(parts) == 2:
            eid = _int(parts[1])
            r = store.get_exam(c, eid, user, edit=method in ("PUT", "DELETE"))
            if method == "GET":
                return self._json(200, {"exam": store.exam_row(r, user, full=True)})
            if method == "PUT":
                d = self._body()
                name, desc, content, image = store.clean_exam(d if "image" in d else dict(d, image=r["image"]))
                c.execute("UPDATE exams SET name=?,description=?,image=?,content=?,updated=? WHERE id=?", (name, desc, image, content, time.time(), eid))
                c.commit()
                return self._json(200, {"ok": True})
            if method == "DELETE":
                n = c.execute("SELECT COUNT(*) FROM apps WHERE exam_id=?", (eid,)).fetchone()[0]
                if n:
                    raise Err(409, "in_use", "Có %d ứng dụng đang dùng bộ đề này. Đổi hoặc xoá ứng dụng trước." % n)
                c.execute("DELETE FROM exams WHERE id=?", (eid,))
                c.commit()
                return self._json(200, {"ok": True})
        raise Err(404, "not_found", "Không thấy.")

    def _models(self, c, method, parts, user):
        if len(parts) == 1:
            if method == "GET":
                q = self.path.split("scope=")[-1].split("&")[0] if "scope=" in self.path else "usable"
                if q not in ("mine", "community", "usable", "all"):
                    q = "usable"
                return self._json(200, {"models": store.list_models(c, user, q)})
            if method == "POST":
                body = self._body()
                name, desc, kind, url, outs, vis = store.clean_model(body)
                if c.execute("SELECT COUNT(*) FROM models WHERE owner_id=?", (user["id"],)).fetchone()[0] >= 100:
                    raise Err(409, "storage_full", "Mỗi tài khoản có tối đa 100 mô hình.")
                cur = c.execute("INSERT INTO models(owner_id,name,description,kind,url,outputs,visibility,created,image) VALUES(?,?,?,?,?,?,?,?,?)",
                                (user["id"], name, desc, kind, url, json.dumps(outs), vis, time.time(), store.clean_image(body.get("image"))))
                c.commit()
                return self._json(201, {"id": cur.lastrowid})
        elif len(parts) == 2:
            mid = _int(parts[1])
            if method == "GET":
                r = store.get_model(c, mid, user)
                return self._json(200, {"model": store.model_row(r, user)})
            if method == "PUT":
                store.get_model(c, mid, user, edit=True)
                body = self._body()
                name, desc, kind, url, outs, vis = store.clean_model(body)
                img = store.clean_image(body["image"]) if "image" in body else None
                used = c.execute("SELECT mapping FROM apps WHERE model_id=?", (mid,)).fetchall()
                keys = {o["key"] for o in outs}
                for a in used:
                    if any(v not in keys for v in json.loads(a["mapping"]).values()):
                        raise Err(409, "in_use", "Có ứng dụng đang gắn vào một lớp bạn vừa bỏ hoặc đổi tên. Sửa ứng dụng trước.")
                c.execute("UPDATE models SET name=?,description=?,kind=?,url=?,outputs=?,visibility=? WHERE id=?",
                          (name, desc, kind, url, json.dumps(outs), vis, mid))
                if img is not None:
                    c.execute("UPDATE models SET image=? WHERE id=?", (img, mid))
                c.commit()
                return self._json(200, {"ok": True})
            if method == "DELETE":
                store.get_model(c, mid, user, edit=True)
                if c.execute("SELECT 1 FROM apps WHERE model_id=?", (mid,)).fetchone():
                    raise Err(409, "in_use", "Có ứng dụng đang dùng mô hình này. Xoá hoặc đổi ứng dụng trước.")
                c.execute("DELETE FROM models WHERE id=?", (mid,))
                c.commit()
                return self._json(200, {"ok": True})
        raise Err(404, "not_found", "Không thấy.")

    def _players(self, c, method, parts, user):
        if len(parts) == 1:
            if method == "GET":
                scope = self.path.split("scope=")[-1].split("&")[0] if "scope=" in self.path else "usable"
                rows = c.execute("SELECT p.*, u.username owner FROM players p LEFT JOIN users u ON u.id=p.owner_id ORDER BY p.id DESC").fetchall()
                out = []
                for r in rows:
                    mine = r["owner_id"] == user["id"]
                    if scope == "mine" and not mine:
                        continue
                    if scope == "community" and (mine or r["status"] != "approved" or r["visibility"] != "public"):
                        continue
                    if scope == "usable" and not store.player_usable(r, user):
                        continue
                    if scope == "all" and user["role"] != "admin":
                        continue
                    d = store.player_row(r, user)
                    d["owner"] = r["owner"] or "AI Lab"
                    out.append(d)
                return self._json(200, {"players": out})
            if method == "POST":
                pid = store.add_player(c, user, self._body().get("html"))
                return self._json(201, {"id": pid})
        elif len(parts) == 2:
            pid = _int(parts[1])
            if method == "GET":
                return self._json(200, {"player": store.player_row(store.get_player(c, pid, user), user, full=True)})
            if method == "PUT":
                r = store.get_player(c, pid, user, edit=True)
                store.replace_player_html(c, r, self._body().get("html"))
                return self._json(200, {"ok": True})
            if method == "DELETE":
                r = store.get_player(c, pid, user, edit=True)
                if c.execute("SELECT 1 FROM apps WHERE player_id=?", (pid,)).fetchone():
                    raise Err(409, "in_use", "Có ứng dụng đang dùng trình chơi này. Xoá ứng dụng trước.")
                c.execute("DELETE FROM players WHERE id=?", (pid,))
                c.commit()
                return self._json(200, {"ok": True})
        elif len(parts) == 3 and method in ("GET", "POST"):
            pid, act = _int(parts[1]), parts[2]
            if act == "try" and method == "GET":
                r = store.get_player(c, pid, user)
                man = json.loads(r["manifest"])
                return self._json(200, {"manifest": man, "srcdoc": contract.secure(r["html"]), "sampleQuestions": SAMPLE_QUESTIONS})
            if method == "POST":
                body = self._body()
                r = store.get_player(c, pid, user, edit=act in ("submit", "withdraw", "visibility"))
                now = time.time()
                if act == "submit":
                    if r["status"] not in ("draft", "refused"):
                        raise Err(409, "state", "Chỉ bản nháp hoặc bản bị từ chối mới gửi duyệt được.")
                    c.execute("UPDATE players SET status='pending',note='',updated=? WHERE id=?", (now, pid))
                elif act == "withdraw":
                    if r["status"] != "pending":
                        raise Err(409, "state", "Trình chơi này không đang chờ duyệt.")
                    c.execute("UPDATE players SET status='draft',updated=? WHERE id=?", (now, pid))
                elif act == "visibility":
                    v = body.get("visibility")
                    if v not in ("private", "public"):
                        raise Err(400, "visibility", "visibility là private hoặc public.")
                    if v == "public" and r["status"] != "approved":
                        raise Err(409, "state", "Chỉ trình chơi đã được Admin duyệt mới công khai được.")
                    c.execute("UPDATE players SET visibility=?,updated=? WHERE id=?", (v, now, pid))
                elif act in ("approve", "refuse", "hide", "restore"):
                    _need_admin(user)
                    if act == "approve":
                        if r["status"] != "pending":
                            raise Err(409, "state", "Chỉ trình chơi đang chờ duyệt mới duyệt được.")
                        c.execute("UPDATE players SET status='approved',visibility='public',note='',updated=? WHERE id=?", (now, pid))
                    elif act == "refuse":
                        note = (body.get("note") or "").strip()
                        if not (1 <= len(note) <= 300) or r["status"] != "pending":
                            raise Err(400, "note", "Ghi lý do từ chối (1–300 ký tự) cho một trình chơi đang chờ duyệt.")
                        c.execute("UPDATE players SET status='refused',note=?,updated=? WHERE id=?", (note, now, pid))
                    elif act == "hide":
                        note = (body.get("note") or "").strip()[:300]
                        c.execute("UPDATE players SET status='hidden',note=?,updated=? WHERE id=?", (note, now, pid))
                    else:
                        c.execute("UPDATE players SET status='approved',note='',updated=? WHERE id=?", (now, pid))
                else:
                    raise Err(404, "not_found", "Không thấy.")
                c.commit()
                return self._json(200, {"ok": True})
        raise Err(404, "not_found", "Không thấy.")

    def _apps(self, c, method, parts, user):
        if len(parts) == 1:
            if method == "GET":
                if "scope=all" in self.path:
                    _need_admin(user)
                    rows = c.execute("SELECT a.*, u.username owner FROM apps a JOIN users u ON u.id=a.owner_id ORDER BY a.id DESC").fetchall()
                else:
                    rows = c.execute("SELECT a.*, u.username owner FROM apps a JOIN users u ON u.id=a.owner_id WHERE a.owner_id=? ORDER BY a.id DESC", (user["id"],)).fetchall()
                out = []
                for r in rows:
                    d = store.app_row(r, user)
                    d["owner"] = r["owner"]
                    out.append(d)
                return self._json(200, {"apps": out})
            if method == "POST":
                if c.execute("SELECT COUNT(*) FROM apps WHERE owner_id=?", (user["id"],)).fetchone()[0] >= 200:
                    raise Err(409, "storage_full", "Mỗi tài khoản có tối đa 200 ứng dụng.")
                v = store.clean_app(c, user, self._body())
                cur = c.execute("INSERT INTO apps(owner_id,name,description,player_id,model_id,mapping,content,sure,hold_ms,share,exam_id,image,created) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
                                (user["id"], v[0], v[1], v[2], v[3], json.dumps(v[4]), v[5], v[6], v[7], v[8], v[9], v[10], time.time()))
                c.commit()
                return self._json(201, {"id": cur.lastrowid})
        elif len(parts) == 2:
            aid = _int(parts[1])
            r = store.get_app(c, aid, user)
            if method == "GET":
                return self._json(200, {"app": store.app_row(r, user)})
            if method == "PUT":
                if r["owner_id"] != user["id"]:
                    raise Err(403, "forbidden", "Chỉ người tạo được sửa ứng dụng này.")
                v = store.clean_app(c, user, self._body(), existing=r)
                c.execute("UPDATE apps SET name=?,description=?,player_id=?,model_id=?,mapping=?,content=?,sure=?,hold_ms=?,share=?,exam_id=?,image=? WHERE id=?", (*v, aid))
                c.commit()
                return self._json(200, {"ok": True})
            if method == "DELETE":
                c.execute("DELETE FROM apps WHERE id=?", (aid,))
                c.commit()
                return self._json(200, {"ok": True})
        raise Err(404, "not_found", "Không thấy.")

    def _chat(self, c, method, parts, user):
        if parts == ["chats"] and method == "GET":
            rows = c.execute("SELECT id,title,created FROM chats WHERE user_id=? ORDER BY id DESC", (user["id"],)).fetchall()
            return self._json(200, {"chats": [dict(r) for r in rows]})
        if len(parts) == 2 and parts[0] == "chats" and method == "GET":
            r = c.execute("SELECT * FROM chats WHERE id=? AND user_id=?", (_int(parts[1]), user["id"])).fetchone()
            if not r:
                raise Err(404, "not_found", "Không thấy cuộc trò chuyện này.")
            return self._json(200, {"id": r["id"], "title": r["title"], "messages": [_pub(m, i) for i, m in enumerate(json.loads(r["messages"]))]})
        if len(parts) >= 5 and parts[0] == "chats" and parts[2] == "proposals":
            return self._proposal(c, method, parts, user)
        if parts == ["chat"] and method == "POST":
            d = self._body()
            text = (d.get("text") or "").strip() if isinstance(d.get("text"), str) else ""
            if not (3 <= len(text) <= 2000):
                raise Err(400, "text", "Hãy mô tả game dài 3–2000 ký tự.")
            if d.get("chatId"):
                r = c.execute("SELECT * FROM chats WHERE id=? AND user_id=?", (_int(d["chatId"]), user["id"])).fetchone()
                if not r:
                    raise Err(404, "not_found", "Không thấy cuộc trò chuyện này.")
                msgs, cid = json.loads(r["messages"]), r["id"]
            else:
                cur = c.execute("INSERT INTO chats(user_id,title,created) VALUES(?,?,?)", (user["id"], text[:60], time.time()))
                cid, msgs = cur.lastrowid, []
            if len(msgs) >= 60:
                raise Err(409, "chat_full", "Cuộc trò chuyện này đã dài. Mở cuộc mới nhé.")
            msgs.append({"role": "user", "text": text})
            out = llm.generate(msgs)
            reply = {"role": "bot", "text": out["text"], "simulated": out["simulated"], "model": out["model"]}
            if out.get("error"):
                reply["error"] = out["error"]
            if out["html"]:
                # Chatbot chỉ ĐỀ XUẤT: chưa lưu gì. Người dùng bấm Chấp nhận thì mới thành trình chơi Nháp (AGENTS.md: chờ người duyệt).
                man, _ = contract.parse(out["html"])
                reply["proposal"] = {"html": out["html"], "name": man["name"], "description": man["description"],
                                     "flags": contract.scan(out["html"]), "status": "pending", "playerId": None,
                                     "source": "fake" if out["simulated"] else "ai"}
            msgs.append(reply)
            c.execute("UPDATE chats SET messages=? WHERE id=?", (json.dumps(msgs, ensure_ascii=False), cid))
            c.commit()
            return self._json(200, {"chatId": cid, "reply": _pub(reply, len(msgs) - 1)})
        raise Err(404, "not_found", "Không thấy.")

    def _proposal(self, c, method, parts, user):
        """/api/chats/<cid>/proposals/<index>/(try|accept|reject)"""
        cid, idx, act = _int(parts[1]), _int(parts[3]), parts[4]
        r = c.execute("SELECT * FROM chats WHERE id=? AND user_id=?", (cid, user["id"])).fetchone()
        if not r:
            raise Err(404, "not_found", "Không thấy cuộc trò chuyện này.")
        msgs = json.loads(r["messages"])
        p = msgs[idx].get("proposal") if 0 <= idx < len(msgs) else None
        if not p:
            raise Err(404, "not_found", "Không thấy đề xuất này.")
        if act == "try" and method == "GET":
            if p["status"] != "pending" or not p.get("html"):
                raise Err(409, "state", "Đề xuất này đã được xử lý.")
            return self._json(200, {"manifest": contract.parse(p["html"])[0], "srcdoc": contract.secure(p["html"]), "sampleQuestions": SAMPLE_QUESTIONS})
        if method != "POST" or act not in ("accept", "reject"):
            raise Err(404, "not_found", "Không thấy.")
        if p["status"] != "pending":
            raise Err(409, "state", "Đề xuất này đã được chấp nhận hoặc từ chối rồi.")
        if act == "accept":
            p["playerId"] = store.add_player(c, user, p["html"], source=p.get("source", "ai"), status="draft")
            p["status"] = "accepted"
        else:
            p["status"] = "rejected"
        p.pop("html", None)  # xong việc thì bỏ bản mã khỏi cuộc trò chuyện (đã nằm trong trình chơi nếu chấp nhận)
        c.execute("UPDATE chats SET messages=? WHERE id=?", (json.dumps(msgs, ensure_ascii=False), cid))
        c.commit()
        return self._json(200, {"status": p["status"], "playerId": p["playerId"]})

    def _admin(self, c, method, parts):
        if parts == ["admin", "users"] and method == "GET":
            rows = c.execute("SELECT id,username,role,created FROM users ORDER BY id").fetchall()
            return self._json(200, {"users": [dict(r) for r in rows]})
        if len(parts) == 4 and parts[1] == "users" and parts[3] == "role" and method == "POST":
            uid, role = _int(parts[2]), self._body().get("role")
            if role not in ("admin", "user"):
                raise Err(400, "role", "Vai trò là admin hoặc user.")
            if role == "user" and c.execute("SELECT COUNT(*) FROM users WHERE role='admin' AND id<>?", (uid,)).fetchone()[0] == 0:
                raise Err(409, "last_admin", "Phải còn ít nhất một Admin.")
            c.execute("UPDATE users SET role=? WHERE id=?", (role, uid))
            c.commit()
            return self._json(200, {"ok": True})
        raise Err(404, "not_found", "Không thấy.")


SAMPLE_QUESTIONS = [
    {"id": "s1", "type": "single", "html": "<p>2 + 2 = ?</p>", "text": "2 + 2 = ?", "answer": "B",
     "choices": [{"key": "A", "html": "3", "text": "3"}, {"key": "B", "html": "4", "text": "4"}, {"key": "C", "html": "5", "text": "5"}, {"key": "D", "html": "6", "text": "6"}]},
    {"id": "s2", "type": "single", "html": "<p>Thủ đô của Việt Nam?</p>", "text": "Thủ đô của Việt Nam?", "answer": "A",
     "choices": [{"key": "A", "html": "Hà Nội", "text": "Hà Nội"}, {"key": "B", "html": "Huế", "text": "Huế"}, {"key": "C", "html": "Đà Nẵng", "text": "Đà Nẵng"}, {"key": "D", "html": "Cần Thơ", "text": "Cần Thơ"}]},
]


def _arg(args, flag):
    return args[args.index(flag) + 1] if flag in args and args.index(flag) + 1 < len(args) else None


def cli(argv):
    cmd = argv[0]
    store.init()
    c = store.connect()
    try:
        name = argv[1] if len(argv) > 1 else None
        if not name:
            print("Thiếu tên đăng nhập.")
            return 2
        pw = _arg(argv, "--password") or os.environ.get("AILAB_NEW_PASSWORD") or getpass.getpass("Mật khẩu (>= 8 ký tự): ")
        if cmd == "create-user":
            uid = store.register(c, name, pw)
            if "--admin" in argv:
                c.execute("UPDATE users SET role='admin' WHERE id=?", (uid,))
                c.commit()
            print("Đã tạo %s: %s" % ("Admin" if "--admin" in argv else "User", name))
            return 0
        if cmd == "set-password":
            if len(pw) < 8:
                print("Mật khẩu cần ít nhất 8 ký tự.")
                return 2
            if not c.execute("UPDATE users SET pw=? WHERE username=?", (store.hash_pw(pw), name)).rowcount:
                print("Không có tài khoản %s." % name)
                return 1
            c.execute("DELETE FROM sessions WHERE user_id=(SELECT id FROM users WHERE username=?)", (name,))
            c.commit()
            print("Đã đổi mật khẩu của %s." % name)
            return 0
        print("Lệnh không có: %s" % cmd)
        return 2
    except Err as e:
        print(e.msg)
        return 1
    finally:
        c.close()


def main():
    sys.stdout.reconfigure(line_buffering=True)  # chạy nền (> log) vẫn thấy địa chỉ và mật khẩu admin ngay
    if len(sys.argv) > 1 and sys.argv[1] in ("create-user", "set-password"):
        sys.exit(cli(sys.argv[1:]))
    host = os.environ.get("AILAB_HOST", "127.0.0.1")
    port = int(os.environ.get("AILAB_PORT", "8800"))
    made = store.init(os.environ.get("AILAB_ADMIN_PASSWORD"))
    print("AI Lab: http://%s:%d   (SQLite: %s)" % (host, port, store.DB_PATH))
    print("Model AI: %s" % ("GIẢ (chưa nối model, chatbot dựng từ khuôn)" if llm._real_model() is None else "thật"))
    if made:
        print("Tài khoản Admin đầu tiên: admin / %s   (hiện một lần — hãy đổi bằng set-password)" % made
              if not os.environ.get("AILAB_ADMIN_PASSWORD") else "Tài khoản Admin đầu tiên: admin (mật khẩu từ AILAB_ADMIN_PASSWORD)")
    ThreadingHTTPServer((host, port), H).serve_forever()


if __name__ == "__main__":
    main()
