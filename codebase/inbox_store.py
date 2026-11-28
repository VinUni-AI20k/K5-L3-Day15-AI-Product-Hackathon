"""Storage for the comment inbox extras: likes, quick replies, customer tags and notes.

All tables live in PostgreSQL under the shop schema (`store.schema_name()`), are tenant-scoped,
and reuse `store.connect()` / `store.tx_locked()`.
"""
from __future__ import annotations

import uuid
from typing import Iterable, Optional

import psycopg
from psycopg import sql as pg_sql

import store


class ConflictError(Exception):
    """Raised on tenant-scoped uniqueness conflict (duplicate shortcut or tag name)."""


class UnknownTagError(Exception):
    """Raised when one or more requested tag ids do not exist in the tenant."""

    def __init__(self, missing_ids: list[str]):
        super().__init__("Unknown tag ids: %s" % ", ".join(missing_ids))
        self.missing_ids = list(missing_ids)


INBOX_SCHEMA_STATEMENTS = (
    """
    create table if not exists comment_like(
      tenant_id text not null,
      comment_id text not null,
      liked_at text not null,
      primary key (tenant_id, comment_id)
    )
    """,
    """
    create table if not exists quick_reply(
      id text not null,
      tenant_id text not null,
      shortcut text not null,
      title text not null,
      text text not null,
      created_at text not null,
      updated_at text not null,
      primary key (tenant_id, id),
      unique (tenant_id, shortcut)
    )
    """,
    """
    create table if not exists customer_tag(
      id text not null,
      tenant_id text not null,
      name text not null,
      color text not null,
      created_at text not null,
      primary key (tenant_id, id),
      unique (tenant_id, name)
    )
    """,
    """
    create unique index if not exists customer_tag_tenant_lower_name
      on customer_tag(tenant_id, lower(name))
    """,
    """
    create table if not exists customer_tag_link(
      tenant_id text not null,
      from_id text not null,
      tag_id text not null,
      created_at text not null,
      primary key (tenant_id, from_id, tag_id),
      foreign key (tenant_id, tag_id) references customer_tag(tenant_id, id) on delete cascade
    )
    """,
    """
    create index if not exists customer_tag_link_tag
      on customer_tag_link(tenant_id, tag_id)
    """,
    """
    create table if not exists customer_note(
      tenant_id text not null,
      from_id text not null,
      text text not null,
      updated_at text not null,
      primary key (tenant_id, from_id)
    )
    """,
)


def init_inbox() -> None:
    """Create inbox tables in the shop schema. Idempotent."""
    schema = store.schema_name()
    with store.tx_locked("inbox:init") as c:
        c.execute(pg_sql.SQL("create schema if not exists {}").format(pg_sql.Identifier(schema)))
        c.execute(pg_sql.SQL("set local search_path to {}").format(pg_sql.Identifier(schema)))
        for stmt in INBOX_SCHEMA_STATEMENTS:
            c.execute(stmt)
        has_fb_comment = c.execute(
            "select 1 from information_schema.tables "
            "where table_schema = current_schema() and table_name = 'fb_comment'"
        ).fetchone()
        if has_fb_comment:
            c.execute(
                "create index if not exists fb_comment_customer "
                "on fb_comment(tenant_id, is_from_page, from_id, created_time desc)"
            )


def _clean_ids(values) -> list[str]:
    if not values:
        return []
    out: list[str] = []
    seen: set[str] = set()
    for raw in values:
        if raw is None:
            continue
        s = str(raw).strip()
        if s and s not in seen:
            seen.add(s)
            out.append(s)
    return out


# ---------------- Cross-module batch queries (one query per call) ----------------

def liked_ids(tenant_id: str, comment_ids) -> set:
    """Comment ids among `comment_ids` that the Page has liked."""
    ids = _clean_ids(comment_ids)
    if not ids:
        return set()
    with store.connect() as c:
        rows = c.execute(
            "select comment_id from comment_like where tenant_id=%s and comment_id = any(%s)",
            (tenant_id, ids),
        ).fetchall()
    return {r["comment_id"] for r in rows}


def tags_for(tenant_id: str, from_ids) -> dict:
    """Map from_id -> list of Tag dicts ({id, name, color}) for the given customers."""
    ids = _clean_ids(from_ids)
    if not ids:
        return {}
    with store.connect() as c:
        rows = c.execute(
            """select l.from_id, t.id, t.name, t.color
               from customer_tag_link l
               join customer_tag t on t.tenant_id = l.tenant_id and t.id = l.tag_id
               where l.tenant_id=%s and l.from_id = any(%s)
               order by lower(t.name) asc, t.name asc, t.id asc""",
            (tenant_id, ids),
        ).fetchall()
    out: dict[str, list[dict]] = {}
    for r in rows:
        out.setdefault(r["from_id"], []).append(
            {
                "id": r["id"],
                "name": r["name"],
                "color": r["color"],
            }
        )
    return out


# ---------------- Comment lookup & likes ----------------

def get_comment(tenant_id: str, comment_id: str) -> Optional[dict]:
    """Read a single comment for `tenant_id` (including Page's own comments so callers can distinguish 404 vs 400)."""
    if not comment_id:
        return None
    with store.connect() as c:
        r = c.execute(
            "select * from fb_comment where tenant_id=%s and id=%s",
            (tenant_id, comment_id),
        ).fetchone()
    return dict(r) if r else None


def set_comment_like(tenant_id: str, comment_id: str, liked: bool, liked_at: Optional[str] = None) -> None:
    """Record or remove a Page like for `(tenant_id, comment_id)`."""
    ts = liked_at or store._ts()
    with store.connect() as c:
        if liked:
            c.execute(
                """insert into comment_like(tenant_id, comment_id, liked_at)
                   values(%s, %s, %s)
                   on conflict(tenant_id, comment_id) do update set liked_at = excluded.liked_at""",
                (tenant_id, comment_id, ts),
            )
        else:
            c.execute(
                "delete from comment_like where tenant_id=%s and comment_id=%s",
                (tenant_id, comment_id),
            )


# ---------------- Quick replies ----------------

def list_quick_replies(tenant_id: str) -> list[dict]:
    """List tenant quick replies sorted by shortcut ascending."""
    with store.connect() as c:
        rows = c.execute(
            "select id, tenant_id, shortcut, title, text, created_at, updated_at "
            "from quick_reply where tenant_id=%s order by shortcut asc, id asc",
            (tenant_id,),
        ).fetchall()
    return [dict(r) for r in rows]


def get_quick_reply(tenant_id: str, quick_reply_id: str) -> Optional[dict]:
    if not quick_reply_id:
        return None
    with store.connect() as c:
        r = c.execute(
            "select id, tenant_id, shortcut, title, text, created_at, updated_at "
            "from quick_reply where tenant_id=%s and id=%s",
            (tenant_id, quick_reply_id),
        ).fetchone()
    return dict(r) if r else None


def create_quick_reply(
    tenant_id: str,
    *,
    shortcut: str,
    title: str,
    text: str,
    updated_at: Optional[str] = None,
    quick_reply_id: Optional[str] = None,
) -> dict:
    qid = quick_reply_id or str(uuid.uuid4())
    ts = updated_at or store._ts()
    try:
        with store.connect() as c:
            row = c.execute(
                """insert into quick_reply(id, tenant_id, shortcut, title, text, created_at, updated_at)
                   values(%s, %s, %s, %s, %s, %s, %s)
                   returning id, tenant_id, shortcut, title, text, created_at, updated_at""",
                (qid, tenant_id, shortcut, title, text, ts, ts),
            ).fetchone()
    except psycopg.errors.UniqueViolation as e:
        raise ConflictError("Duplicate quick reply shortcut") from e
    return dict(row)


_QUICK_REPLY_PATCH_COLS = frozenset(("shortcut", "title", "text"))


def update_quick_reply(
    tenant_id: str,
    quick_reply_id: str,
    *,
    fields: dict,
    updated_at: Optional[str] = None,
) -> Optional[dict]:
    clean = {k: v for k, v in (fields or {}).items() if k in _QUICK_REPLY_PATCH_COLS}
    if not clean:
        return get_quick_reply(tenant_id, quick_reply_id)
    clean["updated_at"] = updated_at or store._ts()
    assignments = pg_sql.SQL(", ").join(pg_sql.SQL("{}=%s").format(pg_sql.Identifier(k)) for k in clean)
    try:
        with store.connect() as c:
            row = c.execute(
                pg_sql.SQL(
                    "update quick_reply set {} where tenant_id=%s and id=%s "
                    "returning id, tenant_id, shortcut, title, text, created_at, updated_at"
                ).format(assignments),
                (*clean.values(), tenant_id, quick_reply_id),
            ).fetchone()
    except psycopg.errors.UniqueViolation as e:
        raise ConflictError("Duplicate quick reply shortcut") from e
    return dict(row) if row else None


def delete_quick_reply(tenant_id: str, quick_reply_id: str) -> bool:
    if not quick_reply_id:
        return False
    with store.connect() as c:
        cur = c.execute(
            "delete from quick_reply where tenant_id=%s and id=%s",
            (tenant_id, quick_reply_id),
        )
    return cur.rowcount > 0


# ---------------- Customer tags & links ----------------

def list_customer_tags(tenant_id: str) -> list[dict]:
    with store.connect() as c:
        rows = c.execute(
            "select id, name, color from customer_tag where tenant_id=%s "
            "order by lower(name) asc, name asc, id asc",
            (tenant_id,),
        ).fetchall()
    return [dict(r) for r in rows]


def create_customer_tag(
    tenant_id: str,
    *,
    name: str,
    color: str,
    created_at: Optional[str] = None,
    tag_id: Optional[str] = None,
) -> dict:
    tid = tag_id or str(uuid.uuid4())
    ts = created_at or store._ts()
    try:
        with store.connect() as c:
            row = c.execute(
                """insert into customer_tag(id, tenant_id, name, color, created_at)
                   values(%s, %s, %s, %s, %s)
                   returning id, name, color""",
                (tid, tenant_id, name, color, ts),
            ).fetchone()
    except psycopg.errors.UniqueViolation as e:
        raise ConflictError("Duplicate customer tag name") from e
    return dict(row)


def delete_customer_tag(tenant_id: str, tag_id: str) -> bool:
    if not tag_id:
        return False
    with store.connect() as c:
        cur = c.execute(
            "delete from customer_tag where tenant_id=%s and id=%s",
            (tenant_id, tag_id),
        )
    return cur.rowcount > 0


def replace_customer_tags(
    tenant_id: str,
    from_id: str,
    tag_ids: Iterable[str],
    *,
    created_at: Optional[str] = None,
) -> list[dict]:
    """Replace the tag set for `(tenant_id, from_id)`. Raises `UnknownTagError` if any id is unknown."""
    clean_ids = _clean_ids(tag_ids)
    ts = created_at or store._ts()
    try:
        with store.tx_locked("customer_tags:%s:%s" % (tenant_id, from_id)) as c:
            existing_rows: list[dict] = []
            if clean_ids:
                existing_rows = [
                    dict(r)
                    for r in c.execute(
                        "select id, name, color from customer_tag "
                        "where tenant_id=%s and id = any(%s) "
                        "order by lower(name) asc, name asc, id asc",
                        (tenant_id, clean_ids),
                    ).fetchall()
                ]
                found = {r["id"] for r in existing_rows}
                missing = [tid for tid in clean_ids if tid not in found]
                if missing:
                    raise UnknownTagError(missing)
            c.execute(
                "delete from customer_tag_link where tenant_id=%s and from_id=%s",
                (tenant_id, from_id),
            )
            if clean_ids:
                with c.cursor() as cur:
                    cur.executemany(
                        "insert into customer_tag_link(tenant_id, from_id, tag_id, created_at) "
                        "values(%s, %s, %s, %s)",
                        [(tenant_id, from_id, tid, ts) for tid in clean_ids],
                    )
            return existing_rows
    except psycopg.errors.ForeignKeyViolation as e:
        raise UnknownTagError(clean_ids) from e


# ---------------- Customer notes ----------------

def get_customer_note(tenant_id: str, from_id: str) -> Optional[dict]:
    if not from_id:
        return None
    with store.connect() as c:
        r = c.execute(
            "select tenant_id, from_id, text, updated_at from customer_note "
            "where tenant_id=%s and from_id=%s",
            (tenant_id, from_id),
        ).fetchone()
    return dict(r) if r else None


def set_customer_note(
    tenant_id: str,
    from_id: str,
    text: str,
    *,
    updated_at: Optional[str] = None,
) -> Optional[dict]:
    """Set or clear (when `text` is empty) the internal note for `(tenant_id, from_id)`."""
    if not text:
        with store.connect() as c:
            c.execute(
                "delete from customer_note where tenant_id=%s and from_id=%s",
                (tenant_id, from_id),
            )
        return None
    ts = updated_at or store._ts()
    with store.connect() as c:
        row = c.execute(
            """insert into customer_note(tenant_id, from_id, text, updated_at)
               values(%s, %s, %s, %s)
               on conflict(tenant_id, from_id) do update set
                 text = excluded.text,
                 updated_at = excluded.updated_at
               returning tenant_id, from_id, text, updated_at""",
            (tenant_id, from_id, text, ts),
        ).fetchone()
    return dict(row)


# ---------------- Customer profile aggregation queries ----------------

def list_customer_comments(tenant_id: str, from_id: str) -> list[dict]:
    """Return this customer's non-deleted, non-page comments for `tenant_id` (oldest first)."""
    if not from_id:
        return []
    with store.connect() as c:
        rows = c.execute(
            """select id, parent_id, from_id, from_name, message, channel_id, page_id, post_job_id, created_time
               from fb_comment
               where tenant_id=%s and from_id=%s and is_from_page=0 and status!='deleted'
               order by created_time asc, id asc""",
            (tenant_id, from_id),
        ).fetchall()
    return [dict(r) for r in rows]


def post_job_captions(job_ids: Iterable[str]) -> dict[str, str]:
    """Batch lookup `{post_job_id: caption}` for the given job ids."""
    ids = _clean_ids(job_ids)
    if not ids:
        return {}
    with store.connect() as c:
        rows = c.execute(
            "select id, caption from post_job where id = any(%s)",
            (ids,),
        ).fetchall()
    return {r["id"]: (r["caption"] or "") for r in rows}
