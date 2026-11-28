"""Inbox extras API: likes, quick replies, customer profile, tags and notes.

Implements the Like, Quick replies, and Customers sections of .swarm/specs/inbox-contract.md.
Must be included in server.py before vpost_api.router.
"""
from __future__ import annotations

import logging
import os
import re
from datetime import datetime, timezone
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field, field_validator

import facebook
import inbox_store
import rules
import schedule
import store
import tools

log = logging.getLogger("vpost.inbox")

SHORTCUT_RE = re.compile(r"^[a-z0-9_-]{1,24}$")
TagColor = Literal["gray", "red", "orange", "yellow", "green", "blue", "purple"]
RECENT_COMMENTS_LIMIT = 20


class ApiError(HTTPException):
    def __init__(self, status: int, code: str, message: str, **extra):
        payload = {"code": code, "message": message}
        payload.update(extra)
        super().__init__(status, payload)


def _tenant_guard(request: Request):
    import vpost_api
    return vpost_api._same_tenant(request)


def _tenant_id() -> str:
    import vpost_api
    return vpost_api.TENANT_ID


router = APIRouter(prefix="/api", dependencies=[Depends(_tenant_guard)])


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _z(dt_or_str) -> Optional[str]:
    if not dt_or_str:
        return None
    if isinstance(dt_or_str, str):
        dt = facebook.parse_time(dt_or_str)
        if dt is None:
            try:
                dt = datetime.fromisoformat(dt_or_str.replace("Z", "+00:00"))
            except ValueError:
                return dt_or_str
    else:
        dt = dt_or_str
    return schedule.iso_z(dt)


def _now_z() -> str:
    return schedule.iso_z(_now())


def _fb_http_status(code: str) -> int:
    if code in ("RATE_LIMITED", "POSTING_TOO_FAST"):
        return 429
    return 502


def _comment_channel_id(c: dict) -> str:
    ch = str(c.get("channel_id") or "").strip()
    if ch:
        return ch
    pid = str(c.get("page_id") or "").strip()
    return ("fb-" + pid) if pid else ""


def _channel_names() -> dict[str, str]:
    try:
        import vpost_api
        fn = getattr(vpost_api, "channels_list", None)
        if callable(fn):
            return {c["channelId"]: (c.get("name") or c["channelId"]) for c in fn()}
    except Exception:
        pass
    out = {("fb-" + str(p["page_id"])): (p.get("name") or str(p["page_id"])) for p in store.fb_pages()}
    fb = tools.fb_page()
    if fb:
        out.setdefault("fb-test", os.environ.get("FB_PAGE_NAME", "Fanpage thử (Facebook thật)"))
    for p in tools.PAGES.values():
        out.setdefault(p["id"], p["name"] + " (chỉ lịch trong app)")
    return out


def _quick_reply_view(row: dict) -> dict:
    return {
        "id": row["id"],
        "shortcut": row["shortcut"],
        "title": row["title"],
        "text": row["text"],
        "updatedAt": _z(row["updated_at"]),
    }


def _tag_view(row: dict) -> dict:
    return {
        "id": row["id"],
        "name": row["name"],
        "color": row["color"],
    }


def _note_view(row: Optional[dict]) -> Optional[dict]:
    if not row:
        return None
    return {
        "text": row["text"],
        "updatedAt": _z(row["updated_at"]),
    }


def _phone_key(raw: str) -> str:
    digits = re.sub(r"\D", "", raw)
    stripped = raw.lstrip()
    if stripped.startswith(("(+84", "+84", "84")):
        sub = digits[2:]
        if sub.startswith("0"):
            sub = sub[1:]
        return "0" + sub
    return digits


def _extract_contacts(comments_oldest_first: list[dict]) -> tuple[list[str], list[str]]:
    phones: list[str] = []
    seen_phones: set[str] = set()
    emails: list[str] = []
    seen_emails: set[str] = set()
    for c in comments_oldest_first:
        msg = str(c.get("message") or "")
        if not msg:
            continue
        for a, b in rules.find_phones(msg):
            raw = msg[a:b].strip()
            if not raw:
                continue
            key = _phone_key(raw)
            if key not in seen_phones:
                seen_phones.add(key)
                phones.append(raw)
        for a, b in rules.find_emails(msg):
            raw = msg[a:b].strip()
            if not raw:
                continue
            key = raw.lower()
            if key not in seen_emails:
                seen_emails.add(key)
                emails.append(raw)
    return phones, emails


def _comment_sort_key(c: dict) -> tuple[float, str, str]:
    raw_ts = str(c.get("created_time") or "")
    dt = facebook.parse_time(raw_ts)
    ts_num = dt.timestamp() if dt is not None else 0.0
    return (ts_num, raw_ts, str(c.get("id") or ""))


# ---------------- Strict Pydantic input models ----------------

def _validate_shortcut(v: str) -> str:
    if not SHORTCUT_RE.fullmatch(v):
        raise ValueError("shortcut chỉ gồm a-z, 0-9, _ hoặc - (1..24 ký tự)")
    return v


def _validate_title(v: str) -> str:
    t = v.strip()
    if not t:
        raise ValueError("tiêu đề không được để trống")
    if len(t) > 80:
        raise ValueError("tiêu đề tối đa 80 ký tự")
    return t


def _validate_qr_text(v: str) -> str:
    t = v.strip()
    if not t:
        raise ValueError("nội dung không được để trống")
    if len(t) > 2000:
        raise ValueError("nội dung tối đa 2000 ký tự")
    return t


class LikeCommentIn(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    liked: bool


class QuickReplyCreateIn(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    shortcut: str
    title: str
    text: str

    @field_validator("shortcut")
    @classmethod
    def _v_shortcut(cls, v: str) -> str:
        return _validate_shortcut(v)

    @field_validator("title")
    @classmethod
    def _v_title(cls, v: str) -> str:
        return _validate_title(v)

    @field_validator("text")
    @classmethod
    def _v_text(cls, v: str) -> str:
        return _validate_qr_text(v)


class QuickReplyPatchIn(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    shortcut: Optional[str] = None
    title: Optional[str] = None
    text: Optional[str] = None

    @field_validator("shortcut")
    @classmethod
    def _v_shortcut(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            raise ValueError("shortcut không được là null")
        return _validate_shortcut(v)

    @field_validator("title")
    @classmethod
    def _v_title(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            raise ValueError("tiêu đề không được là null")
        return _validate_title(v)

    @field_validator("text")
    @classmethod
    def _v_text(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            raise ValueError("nội dung không được là null")
        return _validate_qr_text(v)


class CustomerTagCreateIn(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    name: str
    color: TagColor

    @field_validator("name")
    @classmethod
    def _v_name(cls, v: str) -> str:
        t = v.strip()
        if not t:
            raise ValueError("tên nhãn không được để trống")
        if len(t) > 40:
            raise ValueError("tên nhãn tối đa 40 ký tự")
        return t


class CustomerNoteIn(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    text: str

    @field_validator("text")
    @classmethod
    def _v_text(cls, v: str) -> str:
        t = v.strip()
        if len(t) > 2000:
            raise ValueError("ghi chú tối đa 2000 ký tự")
        return t


class CustomerTagsIn(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    tagIds: list[str] = Field(max_length=20)

    @field_validator("tagIds")
    @classmethod
    def _v_tag_ids(cls, v: list[str]) -> list[str]:
        cleaned: list[str] = []
        seen: set[str] = set()
        for raw in v:
            tid = raw.strip()
            if not tid:
                raise ValueError("mã nhãn không được để trống")
            if tid not in seen:
                seen.add(tid)
                cleaned.append(tid)
        return cleaned


# ---------------- Like ----------------

@router.post("/comments/{comment_id}/like")
def like_comment(comment_id: str, body: LikeCommentIn):
    """Thích hoặc bỏ thích một bình luận khách với tư cách Fanpage."""
    inbox_store.init_inbox()
    tenant_id = _tenant_id()
    c = inbox_store.get_comment(tenant_id, comment_id)
    if not c or c.get("status") == "deleted":
        raise ApiError(404, "NOT_FOUND", "Không tìm thấy bình luận này.")
    if c.get("is_from_page"):
        raise ApiError(400, "INVALID_INPUT", "Không thể thích bình luận của chính Fanpage.")

    channel_id = _comment_channel_id(c)
    if not tools.fb_credentials(channel_id):
        raise ApiError(409, "CHANNEL_NOT_CONFIGURED", "Kênh chưa nối Fanpage Facebook thật — kết nối lại ở mục Kênh.")

    try:
        ok = tools.like_fb_comment(comment_id, body.liked, channel_id)
    except facebook.FacebookError as e:
        log.warning(
            "comment_like_error tenant=%s comment_id=%s liked=%s code=%s",
            tenant_id, comment_id, body.liked, e.code,
        )
        raise ApiError(_fb_http_status(e.code), e.code, e.user_message)
    except Exception as e:
        log.warning(
            "comment_like_error tenant=%s comment_id=%s liked=%s code=%s err=%s",
            tenant_id, comment_id, body.liked, "UPSTREAM_ERROR", type(e).__name__,
        )
        raise ApiError(502, "UPSTREAM_ERROR", "Cập nhật lượt thích bình luận thất bại: %s" % type(e).__name__)

    if not ok:
        log.warning(
            "comment_like_error tenant=%s comment_id=%s liked=%s code=%s",
            tenant_id, comment_id, body.liked, "UPSTREAM_ERROR",
        )
        raise ApiError(502, "UPSTREAM_ERROR", "Facebook không xác nhận cập nhật lượt thích bình luận — vui lòng thử lại.")

    inbox_store.set_comment_like(tenant_id, comment_id, body.liked, liked_at=_now_z())
    return {"tenantId": tenant_id, "commentId": comment_id, "liked": bool(body.liked)}


# ---------------- Quick replies ----------------

@router.get("/quick-replies")
def list_quick_replies():
    """Danh sách mẫu trả lời nhanh của công ty, sắp xếp theo shortcut."""
    inbox_store.init_inbox()
    tenant_id = _tenant_id()
    items = [_quick_reply_view(r) for r in inbox_store.list_quick_replies(tenant_id)]
    return {"tenantId": tenant_id, "items": items}


@router.post("/quick-replies")
def create_quick_reply(body: QuickReplyCreateIn):
    """Tạo mẫu trả lời nhanh mới (shortcut duy nhất trong công ty)."""
    inbox_store.init_inbox()
    tenant_id = _tenant_id()
    try:
        row = inbox_store.create_quick_reply(
            tenant_id,
            shortcut=body.shortcut,
            title=body.title,
            text=body.text,
            updated_at=_now_z(),
        )
    except inbox_store.ConflictError:
        raise ApiError(409, "CONFLICT", "Phím tắt '%s' đã tồn tại." % body.shortcut)
    return {"tenantId": tenant_id, "item": _quick_reply_view(row)}


@router.patch("/quick-replies/{quick_reply_id}")
def patch_quick_reply(quick_reply_id: str, body: QuickReplyPatchIn):
    """Cập nhật một phần mẫu trả lời nhanh."""
    inbox_store.init_inbox()
    tenant_id = _tenant_id()
    fields = {k: getattr(body, k) for k in body.model_fields_set if k in ("shortcut", "title", "text")}
    try:
        row = inbox_store.update_quick_reply(
            tenant_id,
            quick_reply_id,
            fields=fields,
            updated_at=_now_z(),
        )
    except inbox_store.ConflictError:
        raise ApiError(409, "CONFLICT", "Phím tắt '%s' đã tồn tại." % body.shortcut)
    if not row:
        raise ApiError(404, "NOT_FOUND", "Không tìm thấy mẫu trả lời nhanh này.")
    return {"tenantId": tenant_id, "item": _quick_reply_view(row)}


@router.delete("/quick-replies/{quick_reply_id}")
def delete_quick_reply(quick_reply_id: str):
    """Xoá mẫu trả lời nhanh."""
    inbox_store.init_inbox()
    tenant_id = _tenant_id()
    if not inbox_store.delete_quick_reply(tenant_id, quick_reply_id):
        raise ApiError(404, "NOT_FOUND", "Không tìm thấy mẫu trả lời nhanh này.")
    return {"tenantId": tenant_id, "id": quick_reply_id}


# ---------------- Customer tags ----------------

@router.get("/customer-tags")
def list_customer_tags():
    """Danh sách nhãn khách hàng của công ty."""
    inbox_store.init_inbox()
    tenant_id = _tenant_id()
    items = [_tag_view(r) for r in inbox_store.list_customer_tags(tenant_id)]
    return {"tenantId": tenant_id, "items": items}


@router.post("/customer-tags")
def create_customer_tag(body: CustomerTagCreateIn):
    """Tạo nhãn khách hàng mới (tên duy nhất trong công ty)."""
    inbox_store.init_inbox()
    tenant_id = _tenant_id()
    try:
        row = inbox_store.create_customer_tag(
            tenant_id,
            name=body.name,
            color=body.color,
            created_at=_now_z(),
        )
    except inbox_store.ConflictError:
        raise ApiError(409, "CONFLICT", "Nhãn khách hàng đã tồn tại.")
    return {"tenantId": tenant_id, "item": _tag_view(row)}


@router.delete("/customer-tags/{tag_id}")
def delete_customer_tag(tag_id: str):
    """Xoá nhãn khách hàng (và gỡ khỏi toàn bộ khách hàng đang gắn nhãn đó)."""
    inbox_store.init_inbox()
    tenant_id = _tenant_id()
    if not inbox_store.delete_customer_tag(tenant_id, tag_id):
        raise ApiError(404, "NOT_FOUND", "Không tìm thấy nhãn khách hàng này.")
    return {"tenantId": tenant_id, "id": tag_id}


# ---------------- Customers ----------------

@router.get("/customers/{from_id}")
def get_customer_profile(from_id: str):
    """Hồ sơ khách hàng tổng hợp từ các bình luận của chính khách đó trong công ty."""
    inbox_store.init_inbox()
    tenant_id = _tenant_id()
    fid = from_id.strip()
    if not fid:
        raise ApiError(404, "NOT_FOUND", "Không tìm thấy khách hàng này.")

    raw_comments = inbox_store.list_customer_comments(tenant_id, fid)
    if not raw_comments:
        raise ApiError(404, "NOT_FOUND", "Không tìm thấy khách hàng này.")

    oldest_first = sorted(raw_comments, key=_comment_sort_key)
    newest_first = list(reversed(oldest_first))

    name = next(((c.get("from_name") or "").strip() for c in newest_first if (c.get("from_name") or "").strip()), None)
    phones, emails = _extract_contacts(oldest_first)
    first_seen_at = _z(oldest_first[0].get("created_time"))
    last_seen_at = _z(newest_first[0].get("created_time"))

    recent_slice = newest_first[:RECENT_COMMENTS_LIMIT]
    captions_by_job = inbox_store.post_job_captions(c.get("post_job_id") for c in recent_slice)
    ch_names = _channel_names()

    recent_comments = [
        {
            "id": c["id"],
            "threadId": (c.get("parent_id") or "").strip() or c["id"],
            "text": str(c.get("message") or ""),
            "createdAt": _z(c.get("created_time")),
            "postCaption": captions_by_job.get(c.get("post_job_id") or "", ""),
            "channelName": ch_names.get(_comment_channel_id(c)) or _comment_channel_id(c),
        }
        for c in recent_slice
    ]

    tags = inbox_store.tags_for(tenant_id, [fid]).get(fid, [])
    note = _note_view(inbox_store.get_customer_note(tenant_id, fid))

    return {
        "tenantId": tenant_id,
        "customer": {
            "id": fid,
            "name": name,
            "phones": phones,
            "emails": emails,
            "firstSeenAt": first_seen_at,
            "lastSeenAt": last_seen_at,
            "commentCount": len(oldest_first),
            "tags": tags,
            "note": note,
            "recentComments": recent_comments,
        },
    }


@router.put("/customers/{from_id}/note")
def put_customer_note(from_id: str, body: CustomerNoteIn):
    """Lưu hoặc xoá (khi text rỗng) ghi chú nội bộ cho khách hàng."""
    inbox_store.init_inbox()
    tenant_id = _tenant_id()
    fid = from_id.strip()
    if not fid:
        raise ApiError(400, "INVALID_INPUT", "Mã khách hàng không hợp lệ.")
    saved = inbox_store.set_customer_note(tenant_id, fid, body.text, updated_at=_now_z())
    return {"tenantId": tenant_id, "note": _note_view(saved)}


@router.put("/customers/{from_id}/tags")
def put_customer_tags(from_id: str, body: CustomerTagsIn):
    """Thay toàn bộ tập nhãn gắn cho khách hàng."""
    inbox_store.init_inbox()
    tenant_id = _tenant_id()
    fid = from_id.strip()
    if not fid:
        raise ApiError(400, "INVALID_INPUT", "Mã khách hàng không hợp lệ.")
    try:
        rows = inbox_store.replace_customer_tags(tenant_id, fid, body.tagIds, created_at=_now_z())
    except inbox_store.UnknownTagError:
        raise ApiError(400, "INVALID_INPUT", "Danh sách nhãn chứa mã không tồn tại.")
    return {"tenantId": tenant_id, "tags": [_tag_view(r) for r in rows]}
