"""API cấu hình và nhật ký tự động trả lời bình luận giá/size/màu theo từng Fanpage.

Thứ tự gắn router bắt buộc trong `codebase/server.py`:
    auto_reply.init_auto_reply()
    app.include_router(auto_reply_api.router)  # PHẢI đứng TRƯỚC vpost_api.router
    app.include_router(vpost_api.router)

Hợp đồng API theo `.swarm/specs/auto-reply.md`:
  GET  /api/comments/auto-reply-settings
  PUT  /api/comments/auto-reply-settings/{pageId}
  GET  /api/comments/auto-reply-log?pageId=&action=&cursor=&limit=
"""
from __future__ import annotations

import base64
import json
import os
from datetime import datetime, timezone
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, ConfigDict, Field, field_validator

import facebook
import schedule
import store
import tools

VALID_INTENTS = ("price", "size", "color", "size_advice")
_VALID_INTENT_SET = frozenset(VALID_INTENTS)
LOG_ACTIONS = ("sent", "would_send", "skipped", "failed")
_LOG_ACTION_SET = frozenset(LOG_ACTIONS)


class ApiError(HTTPException):
    def __init__(self, status: int, code: str, message: str, **extra):
        payload = {"code": code, "message": message}
        payload.update(extra)
        super().__init__(status, payload)


def _tenant_guard(request: Request):
    """Dùng chung guard tenant của `vpost_api`, import lười để tránh import vòng."""
    import vpost_api
    return vpost_api._same_tenant(request)


def _tenant_id() -> str:
    import vpost_api
    return vpost_api.TENANT_ID


router = APIRouter(prefix="/api", dependencies=[Depends(_tenant_guard)])


def _now_z() -> str:
    return schedule.iso_z(datetime.now(timezone.utc))


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


def _connected_pages() -> list[dict]:
    """Danh sách các Fanpage Facebook thật đang nối (OAuth trong Postgres + Fanpage thử trong .env)."""
    out = [
        {
            "pageId": str(p["page_id"]),
            "channelId": "fb-" + str(p["page_id"]),
            "pageName": p.get("name") or str(p["page_id"]),
        }
        for p in store.fb_pages()
    ]
    fb = tools.fb_page()
    if fb and not any(item["pageId"] == str(fb[0]) for item in out):
        out.append(
            {
                "pageId": str(fb[0]),
                "channelId": "fb-test",
                "pageName": os.environ.get("FB_PAGE_NAME", "Fanpage thử (Facebook thật)"),
            }
        )
    return out


def _setting_view(page_info: dict, s: dict) -> dict:
    return {
        "pageId": page_info["pageId"],
        "channelId": page_info["channelId"],
        "pageName": page_info["pageName"],
        "enabled": bool(s["enabled"]),
        "mode": s["mode"],
        "intents": list(s["intents"]),
        "hourlyCap": int(s["hourly_cap"]),
        "dailyCap": int(s["daily_cap"]),
        "updatedAt": _z(s["updated_at"]),
    }


def _log_view(row: dict) -> dict:
    return {
        "id": row["id"],
        "pageId": row["page_id"],
        "threadId": row["thread_id"],
        "commentId": row["comment_id"],
        "intents": list(row["intents"]),
        "action": row["action"],
        "reason": row["reason"] or None,
        "text": row["text"] or None,
        "createdAt": _z(row["created_at"]),
    }


def _encode_log_cursor(created_at: str, seq: int) -> str:
    raw = json.dumps({"t": created_at, "s": int(seq)}, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def _decode_log_cursor(token: str) -> tuple[str, int]:
    s = (token or "").strip()
    if not s:
        raise ApiError(400, "INVALID_INPUT", "cursor không hợp lệ")
    try:
        padded = s + ("=" * (-len(s) % 4))
        obj = json.loads(base64.urlsafe_b64decode(padded.encode("ascii")).decode("utf-8"))
    except Exception:
        raise ApiError(400, "INVALID_INPUT", "cursor không hợp lệ")
    if not isinstance(obj, dict):
        raise ApiError(400, "INVALID_INPUT", "cursor không hợp lệ")
    t_val = obj.get("t")
    s_val = obj.get("s")
    if not isinstance(t_val, str) or not t_val or isinstance(s_val, bool) or not isinstance(s_val, int) or s_val < 0:
        raise ApiError(400, "INVALID_INPUT", "cursor không hợp lệ")
    return t_val, s_val


class AutoReplySettingIn(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    enabled: bool
    mode: Literal["dry_run", "live"]
    intents: list[str]
    hourlyCap: Optional[int] = Field(default=None, ge=1, le=200)
    dailyCap: Optional[int] = Field(default=None, ge=1, le=2000)
    confirmLive: Optional[bool] = None

    @field_validator("intents")
    @classmethod
    def _validate_intents(cls, v: list[str]) -> list[str]:
        cleaned: list[str] = []
        seen: set[str] = set()
        for raw in v:
            it = raw.strip()
            if not it:
                raise ValueError("tên nhóm câu hỏi không được để trống")
            if it not in seen:
                seen.add(it)
                cleaned.append(it)
        return cleaned


@router.get("/comments/auto-reply-settings")
def get_auto_reply_settings():
    """Trả cài đặt tự động trả lời cho mọi Fanpage đã nối (mặc định tắt, chạy thử, đủ 3 nhóm, trần 30/200)."""
    tenant_id = _tenant_id()
    saved = {s["page_id"]: s for s in store.list_auto_reply_settings(tenant_id)}
    items = []
    for p in _connected_pages():
        s = saved.get(p["pageId"]) or store.default_auto_reply_setting(tenant_id, p["pageId"])
        items.append(_setting_view(p, s))
    return {"tenantId": tenant_id, "items": items}


@router.put("/comments/auto-reply-settings/{page_id}")
def put_auto_reply_setting(page_id: str, body: AutoReplySettingIn):
    """Cập nhật cài đặt tự động trả lời cho một Fanpage đã nối; chuyển sang `live` bắt buộc `confirmLive: true`."""
    tenant_id = _tenant_id()
    pages = {p["pageId"]: p for p in _connected_pages()}
    page_info = pages.get(page_id)
    if not page_info:
        raise ApiError(404, "NOT_FOUND", "Không tìm thấy Fanpage đã kết nối với mã '%s'." % page_id)

    invalid = [i for i in body.intents if i not in _VALID_INTENT_SET]
    if invalid:
        raise ApiError(
            400,
            "INVALID_INPUT",
            "Nhóm câu hỏi không hợp lệ: %s (chỉ nhận %s)." % (", ".join(invalid), ", ".join(VALID_INTENTS)),
        )

    existing = store.get_auto_reply_setting(tenant_id, page_id)
    prev_mode = existing["mode"] if existing else store.AUTO_REPLY_DEFAULT_MODE
    prev_enabled = bool(existing["enabled"]) if existing else False
    needs_confirm = body.mode == "live" and (prev_mode != "live" or (not prev_enabled and body.enabled))
    if needs_confirm and body.confirmLive is not True:
        raise ApiError(
            400,
            "CONFIRM_REQUIRED",
            "Chuyển sang hoặc bật chế độ chạy thật (live) cần xác nhận confirmLive=true vì câu trả lời sẽ được đăng công khai trên Facebook.",
        )

    hourly_cap = (
        body.hourlyCap
        if body.hourlyCap is not None
        else (existing["hourly_cap"] if existing else store.AUTO_REPLY_DEFAULT_HOURLY_CAP)
    )
    daily_cap = (
        body.dailyCap
        if body.dailyCap is not None
        else (existing["daily_cap"] if existing else store.AUTO_REPLY_DEFAULT_DAILY_CAP)
    )

    saved = store.upsert_auto_reply_setting(
        tenant_id,
        page_id,
        enabled=body.enabled,
        mode=body.mode,
        intents=body.intents,
        hourly_cap=hourly_cap,
        daily_cap=daily_cap,
        updated_by="operator",
        updated_at=_now_z(),
    )
    return {"tenantId": tenant_id, "setting": _setting_view(page_info, saved)}


@router.get("/comments/auto-reply-log")
def get_auto_reply_log(
    pageId: Optional[str] = None,
    action: Optional[str] = None,
    cursor: Optional[str] = None,
    limit: int = Query(20, ge=1, le=100),
):
    """Xem nhật ký tự động trả lời theo tenant, có lọc pageId/action và phân trang cursor."""
    tenant_id = _tenant_id()
    page_f = (pageId or "").strip() or None
    action_f = (action or "").strip() or None
    cursor_f = (cursor or "").strip() or None

    if action_f and action_f not in _LOG_ACTION_SET:
        raise ApiError(400, "INVALID_INPUT", "action không hợp lệ: chỉ nhận %s" % ", ".join(LOG_ACTIONS))

    before_created_at = None
    before_seq = None
    if cursor_f is not None:
        before_created_at, before_seq = _decode_log_cursor(cursor_f)

    rows, has_more = store.list_auto_reply_logs(
        tenant_id,
        page_id=page_f,
        action=action_f,
        before_created_at=before_created_at,
        before_seq=before_seq,
        limit=limit,
    )
    next_cursor = (
        _encode_log_cursor(rows[-1]["created_at"], rows[-1]["seq"])
        if (has_more and rows)
        else None
    )
    return {
        "tenantId": tenant_id,
        "items": [_log_view(r) for r in rows],
        "nextCursor": next_cursor,
    }
