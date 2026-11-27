"""Lưu lô và bài nháp trong SQLite (data/app.db — không commit). Mỗi hàm tự mở/đóng kết nối nên dùng được từ nhiều luồng."""
import json
import os
import sqlite3
import threading
from datetime import datetime

from rules import DATA, parse_images

DB = os.environ.get("APP_DB", os.path.join(DATA, "app.db"))
_lock = threading.Lock()
JSON_COLS = ("data", "reasons", "warnings", "colors", "sizes")

SCHEMA = """
create table if not exists batches(
  id integer primary key, filename text, default_page text, created_at text);
create table if not exists rows(
  id integer primary key, batch_id integer, idx integer, data text,
  status text default 'pending',          -- pending · written · flagged · rejected · scheduled · error
  reasons text default '[]', warnings text default '[]', post text default '', edited text default '',
  page_id text default '', colors text default '[]', sizes text default '[]', attempts integer default 0,
  tokens_in integer default 0, tokens_out integer default 0,
  slot text default '', schedule_mode text default '', fb_post_id text default '', updated_at text);
create index if not exists rows_batch on rows(batch_id);
-- VPOST: file sản phẩm đã tải (1 dòng / mã) và bài đăng theo mô hình post_batch / post_job của giao diện
create table if not exists catalog(code text primary key, idx integer, data text);
create table if not exists post_batch(id text primary key, product_code text, color text, format text, created_at text);
create table if not exists post_job(
  id text primary key, batch_id text, product_code text, color text, format text, channel_id text,
  caption text, media text default '[]', status text, scheduled_at text, fb_post_id text, published_url text,
  published_at text, error_code text, user_message text default '', attempt_count integer default 0,
  created_at text, updated_at text);
create index if not exists job_batch on post_job(batch_id);
"""


def _conn():
    c = sqlite3.connect(DB, timeout=30)
    c.row_factory = sqlite3.Row
    return c


def init():
    with _lock, _conn() as c:
        c.executescript(SCHEMA)


def _row(r):
    d = dict(r)
    for k in JSON_COLS:
        if k in d:
            d[k] = json.loads(d[k] or ("{}" if k == "data" else "[]"))
    d["text"] = d.get("edited") or d.get("post") or ""
    d["images"] = parse_images((d.get("data") or {}).get("anh"))
    return d


def _ts():
    return datetime.now().isoformat(timespec="seconds")


def create_batch(filename, default_page, rows):
    with _lock, _conn() as c:
        bid = c.execute("insert into batches(filename, default_page, created_at) values(?,?,?)",
                        (filename, default_page, _ts())).lastrowid
        c.executemany("insert into rows(batch_id, idx, data, updated_at) values(?,?,?,?)",
                      [(bid, i + 1, json.dumps(r, ensure_ascii=False), _ts()) for i, r in enumerate(rows)])
    return bid


def save_result(row_id, res, tokens=(0, 0)):
    with _lock, _conn() as c:
        c.execute("""update rows set status=?, reasons=?, warnings=?, post=?, edited='', page_id=?, colors=?, sizes=?,
                     attempts=?, tokens_in=tokens_in+?, tokens_out=tokens_out+?, updated_at=? where id=?""",
                  ("written" if res["decision"] == "write" else "flagged", json.dumps(res["reasons"], ensure_ascii=False),
                   json.dumps(res["warnings"], ensure_ascii=False), res["post"], res["page_id"],
                   json.dumps(res["colors"], ensure_ascii=False), json.dumps(res["sizes"], ensure_ascii=False),
                   res["attempts"], tokens[0], tokens[1], _ts(), row_id))


def update(row_id, **fields):
    for k in JSON_COLS:
        if k in fields:
            fields[k] = json.dumps(fields[k], ensure_ascii=False)
    fields["updated_at"] = _ts()
    with _lock, _conn() as c:
        c.execute("update rows set %s where id=?" % ", ".join("%s=?" % k for k in fields), (*fields.values(), row_id))


def get_row(row_id):
    with _conn() as c:
        r = c.execute("select * from rows where id=?", (row_id,)).fetchone()
    return _row(r) if r else None


def get_batch(batch_id):
    with _conn() as c:
        b = c.execute("select * from batches where id=?", (batch_id,)).fetchone()
        if not b:
            return None
        rows = [_row(r) for r in c.execute("select * from rows where batch_id=? order by idx", (batch_id,))]
    return dict(b, rows=rows, counts=_counts(rows))


def _counts(rows):
    out = {}
    for r in rows:
        out[r["status"]] = out.get(r["status"], 0) + 1
    out["total"] = len(rows)
    out["tokens_in"] = sum(r["tokens_in"] for r in rows)
    out["tokens_out"] = sum(r["tokens_out"] for r in rows)
    return out


def list_batches():
    with _conn() as c:
        bs = [dict(b) for b in c.execute("select * from batches order by id desc limit 50")]
        for b in bs:
            b["counts"] = _counts([_row(r) for r in c.execute("select * from rows where batch_id=?", (b["id"],))])
    return bs


def taken_slots(page_id):
    with _conn() as c:
        return {r[0] for r in c.execute("select slot from rows where status='scheduled' and page_id=?", (page_id,))}


def scheduled_between(start_iso, end_iso):
    with _conn() as c:
        return [_row(r) for r in c.execute(
            "select * from rows where status='scheduled' and slot>=? and slot<? order by slot", (start_iso, end_iso))]


# ---------------- VPOST: catalog + post_batch + post_job ----------------
def replace_catalog(rows):
    """Thay toàn bộ catalog bằng file mới (mỗi mã một dòng)."""
    with _lock, _conn() as c:
        c.execute("delete from catalog")
        c.executemany("insert into catalog(code, idx, data) values(?,?,?)",
                      [(r["ma_sp"], i, json.dumps(r, ensure_ascii=False)) for i, r in enumerate(rows)])


def catalog_rows():
    with _conn() as c:
        return [json.loads(r[0]) for r in c.execute("select data from catalog order by idx")]


def catalog_row(code):
    with _conn() as c:
        r = c.execute("select data from catalog where code=?", (code,)).fetchone()
    return json.loads(r[0]) if r else None


def create_post_batch(batch, jobs):
    with _lock, _conn() as c:
        c.execute("insert into post_batch(id, product_code, color, format, created_at) "
                  "values(:id, :product_code, :color, :format, :created_at)", batch)
        for j in jobs:
            row = dict(j, media=json.dumps(j["media"], ensure_ascii=False))
            c.execute("insert into post_job(%s) values(%s)" % (", ".join(row), ", ".join(":" + k for k in row)), row)


def _job(r):
    d = dict(r)
    d["media"] = json.loads(d.get("media") or "[]")
    return d


def post_jobs(where="1=1", params=(), order="created_at desc"):
    with _conn() as c:
        return [_job(r) for r in c.execute("select * from post_job where %s order by %s" % (where, order), params)]


def post_job(job_id):
    rows = post_jobs("id=?", (job_id,))
    return rows[0] if rows else None


def post_batch(batch_id):
    with _conn() as c:
        r = c.execute("select * from post_batch where id=?", (batch_id,)).fetchone()
    return dict(r) if r else None


def update_post_job(job_id, updated_at, **fields):
    fields["updated_at"] = updated_at
    with _lock, _conn() as c:
        c.execute("update post_job set %s where id=?" % ", ".join("%s=?" % k for k in fields), (*fields.values(), job_id))
