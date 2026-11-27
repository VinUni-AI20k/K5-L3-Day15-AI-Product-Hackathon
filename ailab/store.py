"""SQLite + các thao tác dữ liệu của AI Lab. Chỉ thư viện chuẩn."""
import base64
import re
import hashlib
import hmac
import json
import os
import secrets
import sqlite3
import time

import contract
import llm

HERE = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.environ.get("AILAB_DB") or os.path.join(HERE, "data", "ailab.db")

HANDS_URL = "jl:builtin/hands/mediapipe"

# Ảnh nền có sẵn cho các mục có sẵn / đã nhập, theo tên (ailab/seed_images/*.jpg). Chỉ điền khi mục chưa có ảnh: ai đã tự đổi ảnh thì giữ nguyên.
SEED_DIR = os.path.join(HERE, "seed_images")
SEED_IMAGES = {
    "models": {"Bàn tay (MediaPipe)": "hands.jpg"},
    "players": {"Quiz ABCD bằng cử chỉ": "quiz.jpg", "Vòng quay chọn tên": "wheel.jpg", "Cầu Lông 3D": "badminton.jpg", "Sút Penalty 3D": "penalty.jpg",
                "Giải cứu thế giới": "rescue.jpg", "Chim Bay Nói": "voiceflap.jpg", "Tết 2027: Dê Vàng và cổng băng": "tet.jpg"},
    "apps": {"Tết 2027 bằng tay": "tet.jpg"},
}
SEED_EXAMS_FILE = os.path.join(HERE, "seed_exams.json")


def _data_uri(fn):
    with open(os.path.join(SEED_DIR, fn), "rb") as f:
        return "data:image/jpeg;base64," + base64.b64encode(f.read()).decode()


def seed_exams(c):
    """Bộ đề có sẵn của AI Lab (owner_id 0): mọi người dùng được, chỉ Admin sửa. Nội dung ở ailab/seed_exams.json; chỉ thêm khi chưa có bộ đề cùng tên."""
    if not os.path.exists(SEED_EXAMS_FILE):
        return
    with open(SEED_EXAMS_FILE, encoding="utf-8") as f:
        items = json.load(f)
    now = time.time()
    for e in items:
        if c.execute("SELECT 1 FROM exams WHERE owner_id=0 AND name=?", (e["name"],)).fetchone():
            continue
        parse_questions(e["content"])  # sai mẫu thì báo lỗi ngay khi khởi động, không lưu bộ đề hỏng
        img = _data_uri(e["image"]) if e.get("image") and os.path.exists(os.path.join(SEED_DIR, e["image"])) else ""
        c.execute("INSERT INTO exams(owner_id,name,description,image,content,created,updated) VALUES(0,?,?,?,?,?,?)",
                  (e["name"], e["description"], img, e["content"], now, now))


def seed_images(c):
    """Điền ảnh nền có sẵn cho mục cùng tên. Gọi mỗi lần chạy, nên mục mới nhập sau cũng được điền ở lần chạy kế. Ảnh người dùng tự đổi thì giữ nguyên."""
    for table, names in SEED_IMAGES.items():
        for name, fn in names.items():
            path = os.path.join(SEED_DIR, fn)
            if not os.path.exists(path):
                continue
            uri = _data_uri(fn)
            sha = hashlib.sha1(uri.encode()).hexdigest()
            done = c.execute("SELECT sha FROM seed_log WHERE tbl=? AND name=?", (table, name)).fetchone()
            for r in c.execute("SELECT id, image FROM %s WHERE name=?" % table, (name,)).fetchall():
                # điền khi chưa có ảnh, hoặc ảnh vẫn là bản có sẵn lần trước (người dùng chưa đổi) để cập nhật ảnh mới
                if r["image"] == "" or (done and hashlib.sha1(r["image"].encode()).hexdigest() == done["sha"]):
                    c.execute("UPDATE %s SET image=? WHERE id=?" % table, (uri, r["id"]))
            c.execute("INSERT OR REPLACE INTO seed_log(tbl,name,sha) VALUES(?,?,?)", (table, name, sha))

SCHEMA = """
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, username TEXT UNIQUE NOT NULL, pw TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('admin','user')), created REAL NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, user_id INTEGER NOT NULL, expires REAL NOT NULL);
CREATE TABLE IF NOT EXISTS models(id INTEGER PRIMARY KEY, owner_id INTEGER NOT NULL, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL, url TEXT NOT NULL, outputs TEXT NOT NULL, visibility TEXT NOT NULL DEFAULT 'private', created REAL NOT NULL);
CREATE TABLE IF NOT EXISTS players(id INTEGER PRIMARY KEY, owner_id INTEGER, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
  html TEXT NOT NULL, manifest TEXT NOT NULL, flags TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','pending','approved','refused','hidden')),
  source TEXT NOT NULL DEFAULT 'upload', visibility TEXT NOT NULL DEFAULT 'private', note TEXT NOT NULL DEFAULT '',
  created REAL NOT NULL, updated REAL NOT NULL);
CREATE TABLE IF NOT EXISTS apps(id INTEGER PRIMARY KEY, owner_id INTEGER NOT NULL, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
  player_id INTEGER NOT NULL REFERENCES players(id), model_id INTEGER REFERENCES models(id), mapping TEXT NOT NULL DEFAULT '{}',
  content TEXT NOT NULL DEFAULT '', sure REAL NOT NULL DEFAULT 0.8, hold_ms INTEGER NOT NULL DEFAULT 800,
  share INTEGER NOT NULL DEFAULT 0, created REAL NOT NULL);
CREATE TABLE IF NOT EXISTS exams(id INTEGER PRIMARY KEY, owner_id INTEGER NOT NULL, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
  image TEXT NOT NULL DEFAULT '', content TEXT NOT NULL, created REAL NOT NULL, updated REAL NOT NULL);
CREATE TABLE IF NOT EXISTS seed_log(tbl TEXT NOT NULL, name TEXT NOT NULL, sha TEXT NOT NULL, PRIMARY KEY(tbl, name));
CREATE TABLE IF NOT EXISTS chats(id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, title TEXT NOT NULL, messages TEXT NOT NULL DEFAULT '[]', created REAL NOT NULL);
"""


class Err(Exception):
    def __init__(self, status, code, msg):
        super().__init__(msg)
        self.status, self.code, self.msg = status, code, msg


def connect():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    c = sqlite3.connect(DB_PATH, timeout=10)
    c.row_factory = sqlite3.Row
    c.execute("PRAGMA foreign_keys=ON")
    return c


def init(admin_password=None):
    """Tạo bảng, tài khoản admin lần đầu, và hai trình chơi mẫu. Trả mật khẩu admin nếu vừa tạo (để in ra một lần)."""
    c = connect()
    c.executescript(SCHEMA)
    for table, col, ddl in (("models", "image", "TEXT NOT NULL DEFAULT ''"), ("players", "image", "TEXT NOT NULL DEFAULT ''"),
                            ("apps", "image", "TEXT NOT NULL DEFAULT ''"), ("apps", "exam_id", "INTEGER")):
        if col not in {r[1] for r in c.execute("PRAGMA table_info(%s)" % table)}:  # DB cũ: thêm cột, không mất dữ liệu
            c.execute("ALTER TABLE %s ADD COLUMN %s %s" % (table, col, ddl))
    made = None
    if not c.execute("SELECT 1 FROM users WHERE role='admin'").fetchone():
        made = admin_password or secrets.token_urlsafe(9)
        c.execute("INSERT INTO users(username,pw,role,created) VALUES('admin',?, 'admin',?)", (hash_pw(made), time.time()))
    if not c.execute("SELECT 1 FROM players WHERE owner_id IS NULL").fetchone():
        for tpl, title in ((llm.QUIZ_TEMPLATE, "Quiz ABCD bằng cử chỉ"), (llm.WHEEL_TEMPLATE, "Vòng quay chọn tên")):
            html = tpl.replace("__TITLE__", title)
            m, _ = contract.parse(html)
            now = time.time()
            c.execute("INSERT INTO players(owner_id,name,description,html,manifest,status,source,visibility,created,updated) "
                      "VALUES(NULL,?,?,?,?, 'approved','sample','public',?,?)",
                      (m["name"], m["description"], html, json.dumps(m), now, now))
    if not c.execute("SELECT 1 FROM models WHERE url=?", (HANDS_URL,)).fetchone():
        # Mô hình có sẵn, dùng chung (owner_id 0 = AI Lab): đọc bàn tay bằng MediaPipe ngay trong trình duyệt, không cần huấn luyện.
        c.execute("INSERT INTO models(owner_id,name,description,kind,url,outputs,visibility,created) VALUES(0,?,?,?,?,?, 'public',?)",
                  ("Bàn tay (MediaPipe)", "Nhận diện bàn tay: nắm tay, xòe tay và vị trí tay. Không cần huấn luyện.", "hands", HANDS_URL,
                   json.dumps([{"key": "fist", "role": "action"}, {"key": "open", "role": "action"}, {"key": "none", "role": "empty"}]), time.time()))
    seed_exams(c)
    seed_images(c)
    c.commit()
    c.close()
    return made


# ---------- tài khoản ----------
def hash_pw(pw):
    salt = secrets.token_bytes(16)
    d = hashlib.pbkdf2_hmac("sha256", pw.encode(), salt, 200_000)
    return salt.hex() + ":" + d.hex()


def check_pw(pw, stored):
    salt, d = stored.split(":")
    got = hashlib.pbkdf2_hmac("sha256", pw.encode(), bytes.fromhex(salt), 200_000)
    return hmac.compare_digest(got.hex(), d)


def register(c, username, password):
    username = (username or "").strip()
    if not (3 <= len(username) <= 30) or not all(ch.isalnum() or ch in "._-" for ch in username):
        raise Err(400, "bad_username", "Tên đăng nhập 3–30 ký tự: chữ, số, dấu . _ -")
    if len(password or "") < 8:
        raise Err(400, "bad_password", "Mật khẩu cần ít nhất 8 ký tự.")
    try:
        cur = c.execute("INSERT INTO users(username,pw,role,created) VALUES(?,?, 'user',?)", (username, hash_pw(password), time.time()))
    except sqlite3.IntegrityError:
        raise Err(409, "taken", "Tên đăng nhập này đã có người dùng.")
    c.commit()
    return cur.lastrowid


def login(c, username, password):
    u = c.execute("SELECT * FROM users WHERE username=?", ((username or "").strip(),)).fetchone()
    if not u or not check_pw(password or "", u["pw"]):
        raise Err(401, "bad_login", "Sai tên đăng nhập hoặc mật khẩu.")
    token = secrets.token_urlsafe(32)
    c.execute("INSERT INTO sessions VALUES(?,?,?)", (token, u["id"], time.time() + 7 * 86400))
    c.commit()
    return token, u["id"]


def user_of(c, token):
    if not token:
        return None
    r = c.execute("SELECT u.id,u.username,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires>?",
                  (token, time.time())).fetchone()
    return dict(r) if r else None


# ---------- mô hình ----------
def _s(v, lo, hi, field, label):
    if not isinstance(v, str) or not (lo <= len(v.strip()) <= hi):
        raise Err(400, field, "%s phải dài %d–%d ký tự." % (label, lo, hi))
    return v.strip()


def clean_model(d):
    name = _s(d.get("name"), 1, 80, "name", "Tên mô hình")
    desc = d.get("description") or ""
    if not isinstance(desc, str) or len(desc) > 300:
        raise Err(400, "description", "Mô tả tối đa 300 ký tự.")
    kind = d.get("kind")
    if kind == "hands":
        raise Err(400, "kind", "Mô hình Bàn tay có sẵn (không tạo thêm). Chọn nó khi tạo ứng dụng.")
    if kind not in contract.KINDS:
        raise Err(400, "kind", "Loại mô hình: image, pose hoặc audio.")
    url = (d.get("url") or "").strip()
    if not url.startswith("https://teachablemachine.withgoogle.com/models/") or len(url) > 200:
        raise Err(400, "url", "Dán đường dẫn mô hình Teachable Machine (https://teachablemachine.withgoogle.com/models/…).")
    if not url.endswith("/"):
        url += "/"
    outs = d.get("outputs")
    if not isinstance(outs, list) or not (1 <= len(outs) <= 30):
        raise Err(400, "outputs", "Mô hình cần 1–30 lớp (đầu ra).")
    seen, clean = set(), []
    for o in outs:
        k = o.get("key") if isinstance(o, dict) else None
        role = (o.get("role") if isinstance(o, dict) else None) or "action"
        if not isinstance(k, str) or not (1 <= len(k) <= 60) or k in seen or role not in contract.ROLES:
            raise Err(400, "outputs", "Mỗi lớp cần tên 1–60 ký tự, không trùng; vai trò action, rest hoặc empty.")
        seen.add(k)
        clean.append({"key": k, "role": role})
    vis = d.get("visibility", "private")
    if vis not in ("private", "public"):
        raise Err(400, "visibility", "visibility là private hoặc public.")
    return name, desc, kind, url, clean, vis


def model_row(r, user, apps_using=None):
    d = dict(r)
    d["outputs"] = json.loads(d["outputs"])
    d["mine"] = r["owner_id"] == user["id"]
    d["usedBy"] = apps_using or 0
    return d


def model_visible(r, user):
    return user["role"] == "admin" or r["owner_id"] == user["id"] or r["visibility"] == "public"


def list_models(c, user, scope):
    rows = c.execute("SELECT m.*, u.username owner, (SELECT COUNT(*) FROM apps a WHERE a.model_id=m.id) used "
                     "FROM models m LEFT JOIN users u ON u.id=m.owner_id ORDER BY m.id DESC").fetchall()
    out = []
    for r in rows:
        mine = r["owner_id"] == user["id"]
        if scope == "mine" and not mine:
            continue
        if scope == "community" and (mine or r["visibility"] != "public"):
            continue
        if scope == "all" and user["role"] != "admin":
            continue
        if scope == "usable" and not model_visible(r, user):
            continue
        d = model_row(r, user, r["used"])
        d["owner"] = r["owner"] or "AI Lab"
        out.append(d)
    return out


def get_model(c, mid, user, edit=False):
    r = c.execute("SELECT * FROM models WHERE id=?", (mid,)).fetchone()
    if not r or not model_visible(r, user):
        raise Err(404, "not_found", "Không thấy mô hình này.")
    if edit and r["owner_id"] == 0:
        raise Err(403, "builtin", "Mô hình có sẵn của AI Lab, không sửa hoặc xoá được.")
    if edit and not (r["owner_id"] == user["id"] or user["role"] == "admin"):
        raise Err(403, "forbidden", "Chỉ người tạo hoặc Admin được sửa mô hình này.")
    return r


# ---------- trình chơi ----------
def player_row(r, user, full=False):
    d = {k: r[k] for k in ("id", "owner_id", "name", "description", "image", "status", "source", "visibility", "note", "created", "updated")}
    d["manifest"] = json.loads(r["manifest"])
    d["flags"] = json.loads(r["flags"])
    d["mine"] = r["owner_id"] == user["id"]
    d["sample"] = r["owner_id"] is None
    if full:
        d["html"] = r["html"]
    return d


def player_usable(r, user):
    if r["status"] == "hidden" and user["role"] != "admin":
        return False
    return (user["role"] == "admin" or r["owner_id"] == user["id"]
            or (r["status"] == "approved" and r["visibility"] == "public"))


def get_player(c, pid, user, edit=False):
    r = c.execute("SELECT * FROM players WHERE id=?", (pid,)).fetchone()
    if not r or not (player_usable(r, user) or (r["status"] == "hidden" and r["owner_id"] == user["id"])):
        raise Err(404, "not_found", "Không thấy trình chơi này.")
    if edit and r["owner_id"] is None and user["role"] != "admin":
        raise Err(403, "forbidden", "Trình chơi mẫu chỉ Admin được sửa.")
    if edit and not (r["owner_id"] == user["id"] or user["role"] == "admin"):
        raise Err(403, "forbidden", "Chỉ người tạo hoặc Admin được sửa trình chơi này.")
    return r


def add_player(c, user, html, source="upload", status="draft"):
    if not isinstance(html, str) or not html.strip():
        raise Err(400, "empty", "Chưa có nội dung HTML.")
    m, err = contract.parse(html)
    if err:
        raise Err(400, err[0], err[1])
    count = c.execute("SELECT COUNT(*) FROM players WHERE owner_id=?", (user["id"],)).fetchone()[0]
    if count >= 50:
        raise Err(409, "storage_full", "Mỗi tài khoản có tối đa 50 trình chơi. Xoá bớt rồi thêm lại.")
    now = time.time()
    cur = c.execute("INSERT INTO players(owner_id,name,description,html,manifest,flags,status,source,created,updated) VALUES(?,?,?,?,?,?,?,?,?,?)",
                    (user["id"], m["name"], m["description"], html, json.dumps(m), json.dumps(contract.scan(html)), status, source, now, now))
    c.commit()
    return cur.lastrowid


def replace_player_html(c, r, html):
    m, err = contract.parse(html)
    if err:
        raise Err(400, err[0], err[1])
    # bản mới của trình chơi đã duyệt phải duyệt lại; bản mẫu do Admin sửa thì giữ nguyên
    status = r["status"]
    if status in ("approved", "refused") and r["owner_id"] is not None:
        status = "pending"
    c.execute("UPDATE players SET name=?,description=?,html=?,manifest=?,flags=?,status=?,updated=? WHERE id=?",
              (m["name"], m["description"], html, json.dumps(m), json.dumps(contract.scan(html)), status, time.time(), r["id"]))
    c.commit()


# ---------- ảnh + thông tin chung (tên, mô tả, ảnh) ----------
IMG_RE = re.compile(r"^data:image/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$")
IMG_MAX = 300 * 1024  # byte sau khi giải mã; giao diện nên thu nhỏ ảnh còn ~640 px (vài chục KB)


def clean_image(v):
    """'' hoặc None = bỏ ảnh. Ngược lại phải là data URL png/jpeg/webp, tối đa 300 KB."""
    if v in (None, ""):
        return ""
    m = IMG_RE.match(v) if isinstance(v, str) and len(v) <= IMG_MAX * 4 // 3 + 64 else None
    if not m:
        raise Err(400, "image", "Ảnh phải là png, jpeg hoặc webp, tối đa 300 KB.")
    try:
        raw = base64.b64decode(m.group(2), validate=True)
    except Exception:
        raise Err(400, "image", "Ảnh không hợp lệ.")
    if len(raw) > IMG_MAX:
        raise Err(400, "image", "Ảnh tối đa 300 KB.")
    sig = {"png": b"\x89PNG", "jpeg": b"\xff\xd8", "webp": b"RIFF"}[m.group(1)]
    if not raw.startswith(sig):
        raise Err(400, "image", "Nội dung ảnh không khớp định dạng.")
    return v


META_TABLES = {"models": "models", "players": "players", "apps": "apps", "exams": "exams"}


def update_meta(c, res, rid, user, d):
    """Sửa tên, mô tả, ảnh (mỗi trường có thì mới đổi) của mô hình, trình chơi, ứng dụng hoặc bộ đề.
    Người tạo hoặc Admin; mô hình có sẵn của AI Lab thì không; trình chơi mẫu chỉ Admin."""
    if res not in META_TABLES:
        raise Err(404, "not_found", "Không thấy.")
    if res == "models":
        r = get_model(c, rid, user, edit=True)
    elif res == "players":
        r = get_player(c, rid, user, edit=True)
        if r["owner_id"] is None and user["role"] != "admin":
            raise Err(403, "forbidden", "Trình chơi mẫu chỉ Admin được sửa thông tin.")
    else:
        r = c.execute("SELECT * FROM %s WHERE id=?" % res, (rid,)).fetchone()
        if not r or not (r["owner_id"] == user["id"] or user["role"] == "admin"):
            raise Err(404, "not_found", "Không thấy.")
    sets, vals = [], []
    if "name" in d:
        sets.append("name=?"); vals.append(_s(d["name"], 1, 80, "name", "Tên"))
    if "description" in d:
        desc = d["description"] or ""
        if not isinstance(desc, str) or len(desc) > 300:
            raise Err(400, "description", "Mô tả tối đa 300 ký tự.")
        sets.append("description=?"); vals.append(desc)
    if "image" in d:
        sets.append("image=?"); vals.append(clean_image(d["image"]))
    if not sets:
        raise Err(400, "empty", "Chưa có gì để sửa (name, description hoặc image).")
    if res in ("players", "exams"):
        sets.append("updated=?"); vals.append(time.time())
    c.execute("UPDATE %s SET %s WHERE id=?" % (res, ",".join(sets)), (*vals, rid))
    c.commit()


# ---------- bộ đề ----------
def clean_exam(d):
    name = _s(d.get("name"), 1, 80, "name", "Tên bộ đề")
    desc = d.get("description") or ""
    if not isinstance(desc, str) or len(desc) > 300:
        raise Err(400, "description", "Mô tả tối đa 300 ký tự.")
    content = d.get("content")
    if not isinstance(content, str) or len(content) > 40000:
        raise Err(400, "content", "Nội dung bộ đề tối đa 40000 ký tự.")
    qs = parse_questions(content)
    if not (1 <= len(qs) <= 200):
        raise Err(400, "questions", "Bộ đề cần 1–200 câu hỏi.")
    return name, desc, content.strip(), clean_image(d.get("image"))


def exam_row(r, user, full=False):
    d = {k: r[k] for k in ("id", "owner_id", "name", "description", "image", "created", "updated")}
    d["mine"] = r["owner_id"] == user["id"]
    d["builtin"] = r["owner_id"] == 0
    d["count"] = len(parse_questions(r["content"]))
    if full:
        d["content"] = r["content"]
    return d


def get_exam(c, eid, user, edit=False):
    r = c.execute("SELECT * FROM exams WHERE id=?", (eid,)).fetchone()
    if not r or not (r["owner_id"] in (user["id"], 0) or user["role"] == "admin"):
        raise Err(404, "not_found", "Không thấy bộ đề này.")
    if edit and r["owner_id"] == 0 and user["role"] != "admin":
        raise Err(403, "builtin", "Bộ đề có sẵn của AI Lab, chỉ Admin được sửa hoặc xoá.")
    return r


# ---------- ứng dụng ----------
def parse_questions(text):
    """Mỗi dòng: Câu hỏi | Đáp án A | Đáp án B | ... | =B   (=B là đáp án đúng). Đúng/Sai: Câu hỏi | =Đúng"""
    qs = []
    for n, line in enumerate((text or "").splitlines(), 1):
        line = line.strip()
        if not line:
            continue
        parts = [p.strip() for p in line.split("|")]
        ans = [p for p in parts if p.startswith("=")]
        if len(parts) < 2 or len(ans) != 1 or parts[-1] != ans[0] or not parts[0]:
            raise Err(400, "questions", "Dòng %d: viết theo mẫu  Câu hỏi | Đáp án A | Đáp án B | =B" % n)
        a = ans[0][1:].strip()
        body = parts[1:-1]
        qid = "q%d" % len(qs)
        esc = lambda s: s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
        if not body:
            if a.lower() not in ("đúng", "dung", "sai", "t", "f"):
                raise Err(400, "questions", "Dòng %d: câu Đúng/Sai viết  Câu hỏi | =Đúng  hoặc  =Sai" % n)
            key = "T" if a.lower() in ("đúng", "dung", "t") else "F"
            ch = [{"key": "T", "html": "Đúng", "text": "Đúng"}, {"key": "F", "html": "Sai", "text": "Sai"}]
            qs.append({"id": qid, "type": "truefalse", "html": "<p>%s</p>" % esc(parts[0]), "text": parts[0], "choices": ch, "answer": key})
            continue
        if not (2 <= len(body) <= 6):
            raise Err(400, "questions", "Dòng %d: mỗi câu có 2–6 đáp án." % n)
        keys = "ABCDEF"[:len(body)]
        if a.upper() not in keys:
            raise Err(400, "questions", "Dòng %d: đáp án đúng phải là một trong %s." % (n, ", ".join(keys)))
        ch = [{"key": keys[i], "html": esc(t), "text": t} for i, t in enumerate(body)]
        qs.append({"id": qid, "type": "single", "html": "<p>%s</p>" % esc(parts[0]), "text": parts[0], "choices": ch, "answer": a.upper()})
    return qs


def clean_app(c, user, d, existing=None):
    name = _s(d.get("name"), 1, 80, "name", "Tên ứng dụng")
    desc = d.get("description") or ""
    if not isinstance(desc, str) or len(desc) > 300:
        raise Err(400, "description", "Mô tả tối đa 300 ký tự.")
    try:
        pid = int(d.get("playerId"))
    except (TypeError, ValueError):
        raise Err(400, "player", "Chọn một trình chơi.")
    p = c.execute("SELECT * FROM players WHERE id=?", (pid,)).fetchone()
    keep = existing is not None and existing["player_id"] == pid
    if not p or not (player_usable(p, user) or keep):
        raise Err(400, "player", "Trình chơi này không dùng được (đã ẩn hoặc chưa được chia sẻ).")
    man = json.loads(p["manifest"])
    mapping, model_id = {}, None
    if "inputs" in man:
        try:
            model_id = int(d.get("modelId"))
        except (TypeError, ValueError):
            raise Err(400, "model", "Chọn một mô hình.")
        m = c.execute("SELECT * FROM models WHERE id=?", (model_id,)).fetchone()
        keepm = existing is not None and existing["model_id"] == model_id
        if not m or not (model_visible(m, user) or keepm):
            raise Err(400, "model", "Mô hình này không dùng được.")
        if m["kind"] not in man["kinds"]:
            raise Err(400, "model", "Trình chơi này không đọc mô hình loại %s." % m["kind"])
        outs = {o["key"]: o["role"] for o in json.loads(m["outputs"])}
        raw = d.get("mapping") or {}
        used = set()
        for i in man["inputs"]:
            o = raw.get(i["key"])
            if not o:
                if i["required"]:
                    raise Err(400, "mapping", "Ô “%s” của trình chơi cần gắn với một lớp của mô hình." % i["label"])
                continue
            if o not in outs or o in used or outs[o] not in i["accepts"]:
                raise Err(400, "mapping", "Lớp “%s” không gắn được vào ô “%s” (không có, dùng hai lần, hoặc sai vai trò)." % (o, i["label"]))
            used.add(o)
            mapping[i["key"]] = o
    content = d.get("content") or ""
    exam_id = None
    needs_q = man.get("questions") == "exam" or man.get("content", {}).get("kind") == "questions"
    if needs_q and d.get("examId") not in (None, ""):
        try:
            exam_id = int(d.get("examId"))
        except (TypeError, ValueError):
            raise Err(400, "exam", "Chọn một bộ đề.")
        ex = c.execute("SELECT * FROM exams WHERE id=?", (exam_id,)).fetchone()
        keepx = existing is not None and existing["exam_id"] == exam_id
        if not ex or not (ex["owner_id"] in (user["id"], 0) or user["role"] == "admin" or keepx):
            raise Err(400, "exam", "Bộ đề này không dùng được.")
        content = ex["content"]  # chép lúc lưu; khi chơi lấy bản mới nhất của bộ đề (play_data)
    if not isinstance(content, str) or len(content) > 40000:
        raise Err(400, "content", "Nội dung quá dài.")
    if needs_q:
        if not parse_questions(content):
            raise Err(400, "questions", "Cần ít nhất một câu hỏi.")
    elif "content" in man:
        lines = [x for x in content.splitlines() if x.strip()]
        cm = man["content"]
        if not (cm["min"] <= len(lines) <= cm["max"]) or any(len(x) > 120 for x in lines):
            raise Err(400, "content", "%s cần %d–%d dòng, mỗi dòng tối đa 120 ký tự." % (cm["label"], cm["min"], cm["max"]))
    try:
        sure = float(d.get("sure", 0.8))
        hold = int(d.get("holdMs", 800))
    except (TypeError, ValueError):
        raise Err(400, "sure", "Độ chắc chắn và thời gian giữ phải là số.")
    if not (0.5 <= sure <= 0.99) or not (300 <= hold <= 5000):
        raise Err(400, "sure", "Độ chắc chắn 0.5–0.99, thời gian giữ 300–5000 ms.")
    image = clean_image(d["image"]) if "image" in d else (existing["image"] if existing is not None else "")
    return name, desc, pid, model_id, mapping, content, sure, hold, 1 if d.get("share") else 0, exam_id, image


def app_row(r, user):
    d = {k: r[k] for k in ("id", "owner_id", "name", "description", "image", "player_id", "model_id", "exam_id", "content", "sure", "hold_ms", "share", "created")}
    d["mapping"] = json.loads(r["mapping"])
    d["mine"] = r["owner_id"] == user["id"]
    return d


def get_app(c, aid, user, edit=False):
    r = c.execute("SELECT * FROM apps WHERE id=?", (aid,)).fetchone()
    if not r or not (r["owner_id"] == user["id"] or user["role"] == "admin"):
        raise Err(404, "not_found", "Không thấy ứng dụng này.")
    return r


def play_data(c, aid, user):
    """Dữ liệu để chạy ứng dụng. user có thể None: chỉ chạy được khi ứng dụng có Chia sẻ."""
    a = c.execute("SELECT * FROM apps WHERE id=?", (aid,)).fetchone()
    ok = a and (a["share"] or (user and (a["owner_id"] == user["id"] or user["role"] == "admin")))
    if not ok:
        raise Err(404, "not_found", "Không thấy ứng dụng này, hoặc chủ ứng dụng chưa chia sẻ.")
    p = c.execute("SELECT * FROM players WHERE id=?", (a["player_id"],)).fetchone()
    if p["status"] == "hidden":
        return {"unavailable": "player", "reason": p["note"] or "Trình chơi đã bị Admin ẩn."}
    man = json.loads(p["manifest"])
    out = {"app": {"id": a["id"], "name": a["name"], "description": a["description"]}, "manifest": man,
           "srcdoc": contract.secure(p["html"]), "sure": a["sure"], "holdMs": a["hold_ms"], "mapping": json.loads(a["mapping"]),
           "questions": [], "content": []}
    if a["model_id"]:
        m = c.execute("SELECT * FROM models WHERE id=?", (a["model_id"],)).fetchone()
        out["model"] = {"kind": m["kind"], "url": m["url"], "outputs": json.loads(m["outputs"])}
    if man.get("questions") == "exam" or man.get("content", {}).get("kind") == "questions":
        src = a["content"]
        if a["exam_id"]:
            ex = c.execute("SELECT content FROM exams WHERE id=?", (a["exam_id"],)).fetchone()
            src = ex["content"] if ex else src  # bộ đề bị xoá thì dùng bản chép lúc lưu
        out["questions"] = parse_questions(src)
    elif "content" in man:
        out["content"] = [{"id": str(i + 1), "text": x.strip()} for i, x in enumerate(a["content"].splitlines()) if x.strip()]
    return out
