"""API cấu hình phong cách viết (Writing Style) theo công ty và từng Fanpage.

Thứ tự gắn router bắt buộc trong `codebase/server.py`:
    writing_style.init_writing_style()
    app.include_router(writing_style_api.router)  # PHẢI đứng TRƯỚC vpost_api.router
    app.include_router(vpost_api.router)

Hợp đồng API theo `.swarm/specs/writing-style.md`:
  GET    /api/writing-style
  PUT    /api/writing-style
  POST   /api/writing-style/preview
  GET    /api/writing-style/{channelId}
  PUT    /api/writing-style/{channelId}
  DELETE /api/writing-style/{channelId}
"""
from __future__ import annotations

from collections import deque
from datetime import datetime, timezone
import threading
import time
from typing import Any, Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Request

import agent
import facebook
import prompts
import schedule
import store
import tools
import writing_style
from ai import call_model

# Cho phép test ghi đè model giống moderation_api.MODEL / vpost_api.MODEL.
MODEL = None

PREVIEW_RATE_LIMIT = 10
PREVIEW_WINDOW_SECONDS = 60.0
_monotonic = time.monotonic
_rate_lock = threading.Lock()
_rate_buckets: dict[str, deque[float]] = {}


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


def _preview_model():
    if MODEL is not None:
        return MODEL
    import vpost_api
    return getattr(vpost_api, "MODEL", None) or call_model


def _channel_map() -> dict[str, dict]:
    """Tái sử dụng danh sách kênh từ `vpost_api.channels_list()` (chỉ đọc)."""
    import vpost_api
    return {c["channelId"]: c for c in vpost_api.channels_list()}


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


def reset_rate_limit(tenant_id: Optional[str] = None) -> None:
    """Đặt lại bộ đếm giới hạn tần suất preview (dùng cho test)."""
    with _rate_lock:
        if tenant_id is None:
            _rate_buckets.clear()
        else:
            _rate_buckets.pop(tenant_id, None)


def _check_preview_rate_limit(tenant_id: str) -> None:
    now_t = _monotonic()
    cutoff = now_t - PREVIEW_WINDOW_SECONDS
    with _rate_lock:
        bucket = _rate_buckets.setdefault(tenant_id, deque())
        while bucket and bucket[0] <= cutoff:
            bucket.popleft()
        if len(bucket) >= PREVIEW_RATE_LIMIT:
            raise ApiError(
                429,
                "RATE_LIMITED",
                "Bạn đã xem thử quá %d lần trong 1 phút — vui lòng thử lại sau." % PREVIEW_RATE_LIMIT,
            )
        bucket.append(now_t)


def _raise_validation(fields: list[dict[str, str]]) -> None:
    msg = "Dữ liệu không hợp lệ: " + "; ".join("%s: %s" % (f["field"], f["message"]) for f in fields)
    raise ApiError(400, "INVALID_INPUT", msg, fields=fields)


def _extract_style_body(body: Any) -> dict:
    if not isinstance(body, dict):
        _raise_validation([{"field": "body", "message": "dữ liệu gửi lên phải là một object"}])
    extra_keys = [k for k in body if k != "style"]
    if extra_keys:
        _raise_validation([{"field": str(k), "message": "trường không được hỗ trợ"} for k in extra_keys])
    if "style" not in body:
        _raise_validation([{"field": "style", "message": "thiếu trường style"}])
    style = body["style"]
    errors = writing_style.validate(style)
    if errors:
        _raise_validation(errors)
    return style


def _require_channel(channel_id: str) -> dict:
    ch = (channel_id or "").strip()
    chans = _channel_map()
    if not ch or ch == writing_style.DEFAULT_SCOPE or ch not in chans:
        raise ApiError(404, "NOT_FOUND", "Không tìm thấy kênh '%s'." % channel_id)
    return chans[ch]


def _company_view(tenant_id: str) -> dict:
    rows = writing_style.list_scopes(tenant_id)
    chans = _channel_map()
    default_row = None
    override_rows: list[dict] = []
    for r in rows:
        if r["scope"] == writing_style.DEFAULT_SCOPE:
            default_row = r
        else:
            override_rows.append(r)

    default_style = default_row["style"] if default_row else {}
    effective_default, _ = writing_style.merge_styles(
        writing_style.base_page_for(None),
        default_style,
        None,
    )
    overrides = [
        {
            "channelId": r["scope"],
            "channelName": (chans.get(r["scope"]) or {}).get("name") or r["scope"],
            "style": r["style"],
            "updatedAt": _z(r["updated_at"]),
        }
        for r in override_rows
    ]
    return {
        "tenantId": tenant_id,
        "default": default_style,
        "overrides": overrides,
        "effectiveDefault": effective_default,
        "updatedAt": _z(default_row["updated_at"]) if default_row else None,
    }


def _channel_view(tenant_id: str, channel_id: str, chan_info: dict) -> dict:
    default_row = writing_style.get_scope(tenant_id, writing_style.DEFAULT_SCOPE)
    override_row = writing_style.get_scope(tenant_id, channel_id)
    default_style = default_row["style"] if default_row else {}
    override_style = override_row["style"] if override_row else {}
    effective, _ = writing_style.merge_styles(
        writing_style.base_page_for(channel_id),
        default_style,
        override_style,
    )
    return {
        "tenantId": tenant_id,
        "channelId": channel_id,
        "channelName": chan_info.get("name") or channel_id,
        "style": override_style,
        "effective": effective,
        "updatedAt": _z(override_row["updated_at"]) if override_row else None,
    }


# ---------------- Routes (static `/preview` registered before `/{channel_id}`) ----------------

@router.get("/writing-style")
def get_writing_style():
    """Đọc phong cách viết mặc định công ty và danh sách ghi đè theo từng Page."""
    writing_style.init_writing_style()
    return _company_view(_tenant_id())


@router.put("/writing-style")
def put_writing_style(body: Any = Body(...)):
    """Lưu phong cách viết mặc định của công ty."""
    writing_style.init_writing_style()
    style = _extract_style_body(body)
    tenant_id = _tenant_id()
    writing_style.upsert_scope(
        tenant_id,
        writing_style.DEFAULT_SCOPE,
        style,
        updated_by="operator",
        updated_at=_now_z(),
    )
    return _company_view(tenant_id)


@router.post("/writing-style/preview")
def preview_writing_style(body: Any = Body(...)):
    """Viết thử bài cho một mã sản phẩm bằng cấu hình chưa lưu (không lưu DB, không đăng bài)."""
    writing_style.init_writing_style()
    tenant_id = _tenant_id()

    if not isinstance(body, dict):
        _raise_validation([{"field": "body", "message": "dữ liệu gửi lên phải là một object"}])

    allowed_keys = {"channelId", "productCode", "style"}
    field_errors: list[dict[str, str]] = []
    for k in body:
        if k not in allowed_keys:
            field_errors.append({"field": str(k), "message": "trường không được hỗ trợ"})

    raw_code = body.get("productCode")
    product_code = ""
    if not isinstance(raw_code, str) or not raw_code.strip():
        field_errors.append({"field": "productCode", "message": "cần mã sản phẩm hợp lệ"})
    else:
        product_code = raw_code.strip()
        if len(product_code) > 64:
            field_errors.append({"field": "productCode", "message": "mã sản phẩm tối đa 64 ký tự"})

    raw_channel = body.get("channelId")
    channel_id: Optional[str] = None
    if raw_channel is not None:
        if not isinstance(raw_channel, str):
            field_errors.append({"field": "channelId", "message": "channelId phải là chuỗi ký tự"})
        else:
            channel_id = raw_channel.strip() or None

    raw_style = body.get("style")
    if raw_style is not None:
        style_errors = writing_style.validate(raw_style)
        field_errors.extend(style_errors)

    if field_errors:
        _raise_validation(field_errors)

    if channel_id is not None:
        _require_channel(channel_id)

    row = store.catalog_row(product_code)
    if not row:
        raise ApiError(404, "PRODUCT_NOT_FOUND", "Không có mã %s trong file sản phẩm đã tải." % product_code)

    _check_preview_rate_limit(tenant_id)

    if channel_id and channel_id in tools.PAGES:
        base_page = tools.PAGES[channel_id]
    else:
        base_page, _ = tools.page_for(row)

    styled_page = writing_style.apply_preview(
        base_page,
        tenant_id,
        channel_id,
        unsaved_style=raw_style,
    )

    active_model = _preview_model()
    tok = [0, 0]
    prompt_chars = [0]

    def counted_model(system, user, schema=None):
        prompt_chars[0] = len(system or "")
        out = active_model(system, user, schema)
        if isinstance(out, dict):
            try:
                tok[0] += max(0, int(out.get("tokens_in") or 0))
                tok[1] += max(0, int(out.get("tokens_out") or 0))
            except (TypeError, ValueError):
                pass
        return out

    res = agent.process_row(row, styled_page, model=counted_model)
    if prompt_chars[0] == 0:
        prompt_chars[0] = len(prompts.system_prompt(styled_page, agent._effective_glob(styled_page)))

    reasons = [{"field": str(f), "issue": str(issue)} for f, issue in (res.get("reasons") or [])]
    return {
        "tenantId": tenant_id,
        "decision": res["decision"],
        "post": res["post"],
        "reasons": reasons,
        "warnings": list(res.get("warnings") or []),
        "systemPromptChars": prompt_chars[0],
        "tokensIn": tok[0],
        "tokensOut": tok[1],
    }


@router.get("/writing-style/{channel_id}")
def get_channel_writing_style(channel_id: str):
    """Đọc ghi đè phong cách viết của một kênh và bản hợp nhất hiệu lực."""
    writing_style.init_writing_style()
    chan_info = _require_channel(channel_id)
    return _channel_view(_tenant_id(), channel_id, chan_info)


@router.put("/writing-style/{channel_id}")
def put_channel_writing_style(channel_id: str, body: Any = Body(...)):
    """Lưu ghi đè phong cách viết riêng cho một kênh."""
    writing_style.init_writing_style()
    chan_info = _require_channel(channel_id)
    style = _extract_style_body(body)
    tenant_id = _tenant_id()
    writing_style.upsert_scope(
        tenant_id,
        channel_id,
        style,
        updated_by="operator",
        updated_at=_now_z(),
    )
    return _channel_view(tenant_id, channel_id, chan_info)


@router.delete("/writing-style/{channel_id}")
def delete_channel_writing_style(channel_id: str):
    """Xoá ghi đè phong cách viết của kênh để quay về dùng mặc định công ty."""
    writing_style.init_writing_style()
    chan_info = _require_channel(channel_id)
    tenant_id = _tenant_id()
    writing_style.delete_scope(tenant_id, channel_id)
    return _channel_view(tenant_id, channel_id, chan_info)
