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
