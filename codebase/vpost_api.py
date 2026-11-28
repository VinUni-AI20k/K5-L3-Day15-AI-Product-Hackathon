"""API theo hợp đồng giao diện VPOST (vpost/src/ui/services/*.api.ts, schema zod ở vpost/src/ui/schemas/).

Giao diện Next.js chuyển mọi /api/* sang đây (vpost/next.config.ts, biến VPOST_API_URL). Một dòng sản phẩm đi:
  POST /api/posts/compose   code: kiểm dòng + kiểm tồn + ảnh (KHÔNG gọi AI; giao diện chờ tối đa 15s)
  POST /api/posts/captions  AI quyết định viết hay đánh dấu (agent.process_row: soát bài, viết lại ≤1 lần)
  POST /api/posts/batches   người đã duyệt → lên lịch (kiểm tồn lần 2, khoá trùng, mỗi kênh một post_job)
Giờ luôn trả dạng ...Z (zod z.iso.datetime() không nhận +00:00). Lỗi luôn trả {code, message}.
"""
import base64
import json
import logging
import os
import re
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, File, Query, Request, UploadFile
from fastapi import HTTPException
from fastapi.responses import RedirectResponse, Response
from pydantic import BaseModel, ConfigDict, Field, field_validator

import agent
import facebook
import inbox_store
import moderation_api
import moderation_store
import rules
import schedule
import store
import tools
import writing_style
from ai import MODEL_NAME, MODEL_PROVIDER, call_model

# Một shop = một tenant. Phiên + tenant do Next (Postgres) giữ; VPOST_TENANT_ID = id tenant đó.
TENANT_ID = os.environ.get("VPOST_TENANT_ID", "").strip() or "00000000-0000-4000-8000-000000000001"
TENANT_COOKIE = "vpost_active_tenant"   # Next đặt, rewrite /api chuyển tiếp nguyên cookie


def _same_tenant(request: Request):
    """Tenant khác đang chọn trên giao diện thì không được đọc dữ liệu shop này. Không có cookie = gọi thẳng/test."""
    active = request.cookies.get(TENANT_COOKIE)
    if active and active != TENANT_ID:
        raise ApiError(403, "FORBIDDEN", "Công ty đang chọn không có quyền với dữ liệu shop này.")


router = APIRouter(prefix="/api", dependencies=[Depends(_same_tenant)])
FB_CHANNEL = "fb-test"
MODEL = call_model                                    # test thay bằng model giả
TONES = {"thoi-trang-he": "trẻ trung, hợp mùa hè", "sang-trong": "sang trọng, tinh tế",
         "than-thien": "thân thiện, gần gũi", "sale-manh": "dứt khoát, rủ chốt đơn (không nêu khuyến mãi nếu file không có)"}
ACTIVE = ("queued", "publishing", "scheduled_on_facebook", "published")


class ApiError(HTTPException):
    def __init__(self, status, code, message, **extra):
        payload = {"code": code, "message": message}
        payload.update(extra)
        super().__init__(status, payload)


def now():
    return datetime.now(timezone.utc)


def z(dt_or_str):
    if not dt_or_str:
        return None
    dt = datetime.fromisoformat(dt_or_str.replace("Z", "+00:00")) if isinstance(dt_or_str, str) else dt_or_str
    return schedule.iso_z(dt)


def _parse_dt(s, field):
    try:
        dt = datetime.fromisoformat(str(s).replace("Z", "+00:00"))
    except ValueError:
        raise ApiError(400, "INVALID_INPUT", "%s không phải thời điểm hợp lệ" % field)
    return dt if dt.tzinfo else dt.replace(tzinfo=schedule.TZ)


# ---------------- khung trang ----------------
@router.get("/me")
def me():
    return {"account": {"id": "dev-acc", "displayName": "Dev Bypass", "platformRole": None},
            "tenants": [{"id": TENANT_ID, "name": "Shop váy demo", "slug": "demo", "plan": "pro", "role": "editor"}],
            "activeTenantId": TENANT_ID, "isBootstrapAdmin": False, "supportSession": None}


FB_PAGE_PREFIX = "fb-"   # kênh = Page nối qua OAuth, channelId = "fb-<page id>"


def channels_list():
    """Page nối qua OAuth (đăng thật) + Fanpage thử từ .env + 5 page mẫu trong pages.json (chỉ lịch trong app)."""
    out = [{"channelId": FB_PAGE_PREFIX + p["page_id"], "platform": "facebook", "name": p["name"] or p["page_id"],
            "externalId": p["page_id"], "status": "active", "tokenExpiresAt": None} for p in store.fb_pages()]
    fb = tools.fb_page()
    if fb and not any(c["externalId"] == fb[0] for c in out):
        out.append({"channelId": FB_CHANNEL, "platform": "facebook", "externalId": fb[0], "status": "active",
                    "name": os.environ.get("FB_PAGE_NAME", "Fanpage thử (Facebook thật)"), "tokenExpiresAt": None})
    # Sample pages from data/pages.json are listed only when VPOST_DEMO_PAGES=1 (eval still uses the file).
    if os.environ.get("VPOST_DEMO_PAGES", "").strip() == "1":
        out += [{"channelId": p["id"], "platform": "facebook", "name": p["name"] + " (chỉ lịch trong app)",
                 "externalId": p["id"], "status": "active", "tokenExpiresAt": None} for p in tools.PAGES.values()]
    statuses = store.channel_statuses()
    for c in out:
        c["status"] = statuses.get(c["channelId"], "active")
    return out


def page_credentials(ch_id):
    """(page_id, token) để đăng thật lên kênh này, hoặc None = kênh chỉ ghi lịch trong app."""
    if ch_id == FB_CHANNEL:
        return tools.fb_page()
    if ch_id.startswith(FB_PAGE_PREFIX):
        p = store.fb_page(ch_id[len(FB_PAGE_PREFIX):])
        return (p["page_id"], p["page_token"]) if p else None
    return None


@router.get("/channels")
def channels():
    # Page tokens live in PostgreSQL (schema shop), so the backend can always store them.
    return {"tenantId": TENANT_ID, "channels": channels_list(), "secretsConfigured": True}


@router.get("/channel-groups")
def channel_groups():
    return {"tenantId": TENANT_ID, "groups": []}


# ---------------- file sản phẩm ----------------
@router.post("/vpost/catalog")
async def upload_catalog(file: UploadFile = File(...)):
    """Tải file Excel/CSV sản phẩm — thay toàn bộ danh sách mã đang dùng."""
    data = await file.read()
    if len(data) > 10 * 1024 * 1024:
        raise ApiError(413, "INVALID_INPUT", "File lớn hơn 10MB")
    try:
        rows = tools.read_products(data, file.filename or "")
    except ValueError as e:
        raise ApiError(400, "INVALID_INPUT", str(e))
    return load_catalog(rows)


def load_catalog(rows):
    seen, keep, skipped = set(), [], []
    for i, r in enumerate(rows, 2):  # dòng 1 là tiêu đề
        code = (r.get("ma_sp") or "").strip()
        if not code or code in seen:
            skipped.append({"line": i, "reason": "thiếu mã" if not code else "trùng mã %s" % code})
            continue
        seen.add(code)
        keep.append(dict(r, ma_sp=code))
    if not keep:
        raise ApiError(400, "INVALID_INPUT", "File không có dòng nào có mã sản phẩm")
    if len(keep) > 500:
        raise ApiError(400, "INVALID_INPUT", "File có %d mã — tối đa 500" % len(keep))
    store.replace_catalog(keep)
    return {"rows": len(keep), "codes": [r["ma_sp"] for r in keep], "skipped": skipped}


def display_name(row):
    return row.get("ten_sp") or "%s %s" % (row.get("loai") or "Sản phẩm", row["ma_sp"])


def inspect(row):
    """Kiểm bằng code, không gọi AI: → (page, lỗi cứng [(code, message)], cảnh báo, kết quả tồn, ảnh)."""
    page, pwarn = tools.page_for(row)
    c = tools.check_product(row, page)
    hard = [("ROW_DATA_INVALID", "%s: %s" % (rules.LABEL.get(f, f), m)) for f, m in c["hard"]]
    s = tools.check_stock(row) if not c["hard"] else {"hard": [], "warn": [], "colors": [], "low": False, "variants": []}
    hard += [("OUT_OF_STOCK", m) for _, m in s["hard"]]
    images = rules.parse_images(row.get("anh"))
    if not images:
        hard.append(("MEDIA_NOT_FOUND", "Chưa có ảnh sản phẩm — thêm link ảnh vào cột ảnh của file"))
    warns = ["%s: %s" % pwarn] if pwarn else []
    warns += ["%s: %s" % w for w in c["warn"] + s["warn"] if w[0] != "anh"]
    return page, hard, warns, s, images


def _inventory(hard, s):
    blocked = any(code == "OUT_OF_STOCK" for code, _ in hard)
    stock = sum(v["ton"] for v in s.get("variants", [])) if s.get("variants") else None
    return {"status": "blocked" if blocked else ("low_stock" if s.get("low") else "in_stock"), "blocked": blocked,
            "reason": next((m for code, m in hard if code == "OUT_OF_STOCK"), None), "stock": stock,
            "operatorMessage": None, "stockCheckSkipped": False, "stockCheckSkippedReason": None}


@router.get("/catalog/products")
def catalog_products(status: Optional[str] = None, q: Optional[str] = None, limit: int = Query(50, ge=1, le=500),
                     cursor: Optional[str] = None):
    items = []
    for row in store.catalog_rows():
        if q and q.lower() not in (row["ma_sp"] + " " + display_name(row)).lower():
            continue
        page, hard, warns, s, images = inspect(row)
        items.append({"code": row["ma_sp"], "name": display_name(row), "category": row.get("loai") or None, "season": None,
                      "price": (str(row.get("gia_ban") or "").strip() or None),
                      "sizes": (str(row.get("size") or "").strip() or None),
                      "colors": (str(row.get("mau") or "").strip() or None),
                      "material": (str(row.get("chat_lieu") or "").strip() or None),
                      "inventory": {k: v for k, v in _inventory(hard, s).items() if k != "blocked"},
                      "mediaImageCount": len(images), "mediaVideoCount": 0, "hasConflict": False,
                      "composable": not hard,
                      "blockedReason": {"code": hard[0][0], "userMessage": hard[0][1]} if hard else None})
    totals = {"total": len(items), "ok": sum(i["composable"] for i in items), "blocked": sum(not i["composable"] for i in items)}
    if status == "ok":
        items = [i for i in items if i["composable"]]
    elif status == "blocked":
        items = [i for i in items if not i["composable"]]
    start = int(cursor or 0)
    return {"items": items[start:start + limit], "nextCursor": str(start + limit) if start + limit < len(items) else None,
            "totals": totals}


# ---------------- compose → captions → batches ----------------
class ComposeIn(BaseModel):
    model_config = ConfigDict(extra="ignore")
    productCode: str = Field(min_length=1, max_length=64)
    mediaKind: Optional[str] = None
    color: Optional[str] = None


@router.post("/posts/compose")
def compose(body: ComposeIn):
    code = body.productCode.strip()
    row = store.catalog_row(code)
    if not row:
        raise ApiError(404, "PRODUCT_NOT_FOUND", "Không có mã %s trong file sản phẩm đã tải" % code)
    page, hard, warns, s, images = inspect(row)
    if images:  # ảnh không tải được thì bỏ, không đưa lên bài
        chk = tools.check_images(images)
        if chk["broken"]:
            warns.append("ảnh: đã bỏ %d ảnh không tải được" % len(chk["broken"]))
        images = chk["ok"]
        if not images and not any(c == "MEDIA_NOT_FOUND" for c, _ in hard):
            hard.append(("MEDIA_NOT_FOUND", "Không ảnh nào của mã này tải được"))
    if hard:
        # một mã lỗi đại diện cho cả dòng; message liệt kê đủ lý do để người đọc sửa file
        first = next((c for c, _ in hard if c in ("OUT_OF_STOCK", "MEDIA_NOT_FOUND")), hard[0][0])
        status = {"OUT_OF_STOCK": 409, "MEDIA_NOT_FOUND": 404}.get(first, 422)
        raise ApiError(status, first, "; ".join(m for _, m in hard))
    return {"tenantId": TENANT_ID, "productCode": code, "channel": "facebook", "productOrigin": "sheet",
            "content": {"code": code, "name": display_name(row), "description": row.get("mo_ta") or None,
                        "category": row.get("loai") or None, "season": None},
            "inventory": _inventory(hard, s),
            "media": [{"driveFileId": u, "fileName": "%s-%d.jpg" % (code, i), "color": None, "sequence": i,
                       "kind": "image", "warnings": [], "needsReview": False} for i, u in enumerate(images, 1)],
            "availableColors": s.get("colors", []), "warnings": warns, "video": None}


class ProductIn(BaseModel):
    model_config = ConfigDict(extra="ignore")
    name: str = ""
    description: str = ""
    category: str = ""
    season: str = ""


class CaptionsIn(BaseModel):
    model_config = ConfigDict(extra="ignore")
    product: ProductIn
    channels: list[str] = Field(min_length=1)
    tone: Optional[str] = None
    channelId: Optional[str] = None


def find_row(name):
    """Giao diện chỉ gửi tên hiển thị — tên đó chứa mã (display_name), lấy mã dài nhất khớp."""
    rows = store.catalog_rows()
    exact = [r for r in rows if display_name(r) == name]
    if exact:
        return exact[0]
    hits = sorted((r for r in rows if re.search(r"(?<![\w])%s(?![\w])" % re.escape(r["ma_sp"]), name)),
                  key=lambda r: -len(r["ma_sp"]))
    return hits[0] if hits else None


@router.post("/posts/captions")
def captions(body: CaptionsIn):
    if body.tone and body.tone not in TONES:
        raise HTTPException(400, {"code": "INVALID_INPUT", "message": "Giọng viết không hỗ trợ",
                                  "issues": [{"path": "tone", "message": "không hỗ trợ"}]})
    row = find_row(body.product.name)
    if not row:
        raise ApiError(404, "PRODUCT_NOT_FOUND", "Không tìm thấy sản phẩm '%s' trong file đã tải" % body.product.name)
    if body.tone:
        row = dict(row, prompt=((row.get("prompt") or "") + ". Giọng: " + TONES[body.tone]).strip(". "))
    ch_id = (body.channelId or "").strip() or (
        body.channels[0] if len(body.channels) == 1 and body.channels[0] in _channel_map() else None
    )
    if ch_id and ch_id in tools.PAGES:
        page = tools.PAGES[ch_id]
    else:
        page, _ = tools.page_for(row)
    page = writing_style.apply(page, TENANT_ID, ch_id)
    res = agent.process_row(row, page, model=MODEL)
    if res["decision"] != "write":
        reason = "; ".join("%s: %s" % (rules.LABEL.get(f, f), m) for f, m in res["reasons"])
        return {"generated": [], "failed": [{"channelId": p, "platform": p, "code": "ROW_FLAGGED",
                                             "reason": reason or "AI đánh dấu dòng này"} for p in body.channels]}
    return {"generated": [{"channelId": p, "platform": p, "text": res["post"], "hashtags": [],
                           "model": MODEL_NAME or "fake", "provider": MODEL_PROVIDER} for p in body.channels],
            "failed": []}


class MediaIn(BaseModel):
    model_config = ConfigDict(extra="ignore")
    driveFileId: str = Field(min_length=1)
    fileName: Optional[str] = None
    kind: Optional[str] = None


class BatchIn(BaseModel):
    model_config = ConfigDict(extra="ignore")
    productCode: str = Field(min_length=1, max_length=64)
    color: Optional[str] = None
    format: Optional[str] = "image_post"
    scheduledAt: Optional[str] = None
    spacingMs: Optional[int] = Field(None, ge=0)
    channelIds: list[str] = Field(min_length=1)
    captionByChannel: dict[str, str]
    media: list[MediaIn] = Field(min_length=1)


def _channel_map():
    return {c["channelId"]: c for c in channels_list()}


def _publish(job_id, ch_id, text, images, when):
    """Một post_job: kênh có token Page thì gọi Facebook, kênh mẫu chỉ ghi lịch trong app. → các trường cập nhật."""
    creds = page_credentials(ch_id)
    if creds:
        try:
            res = tools.schedule_post(text, int(when.timestamp()) if when else None, images, page=creds)
        except Exception as e:  # lỗi Facebook: ghi vào job, không làm hỏng các kênh khác
            return {"status": "failed", "error_code": "PUBLISH_FAILED", "user_message": "Facebook từ chối: %s" % str(e)[:200]}
        url = "https://www.facebook.com/%s" % res["fb_post_id"] if res.get("fb_post_id") else None
        if when:
            return {"status": "scheduled_on_facebook", "fb_post_id": res["fb_post_id"],
                    "user_message": "Đã hẹn giờ trên Facebook"}
        return {"status": "published", "fb_post_id": res["fb_post_id"], "published_url": url,
                "published_at": z(now()), "user_message": "Đã đăng lên Facebook"}
    if not when:
        return {"status": "blocked", "error_code": "CHANNEL_NOT_CONFIGURED",
                "user_message": "Kênh này chưa nối Fanpage thật — chỉ hẹn giờ trong app được, chưa đăng ngay được"}
    return {"status": "queued", "user_message": "Đã lên lịch trong app (kênh chưa nối Fanpage nên không tự đăng)"}


@router.post("/posts/batches")
def create_batch(body: BatchIn):
    code = body.productCode.strip()
    row = store.catalog_row(code)
    if not row:
        raise ApiError(404, "PRODUCT_NOT_FOUND", "Không có mã %s trong file sản phẩm đã tải" % code)
    chans = _channel_map()
    unknown = [c for c in body.channelIds if c not in chans]
    if unknown:
        raise ApiError(409, "CHANNEL_NOT_CONFIGURED", "Kênh không tồn tại: %s" % ", ".join(unknown))
    off = [chans[c]["name"] for c in body.channelIds if chans[c]["status"] != "active"]
    if off:
        raise ApiError(409, "CHANNEL_NOT_CONFIGURED", "Kênh đang tắt: %s — bật lại ở màn Kênh" % ", ".join(off))
    missing =[c for c in body.channelIds if not (body.captionByChannel.get(c) or "").strip()]
    if missing:
        raise ApiError(400, "INVALID_INPUT", "Thiếu nội dung bài cho kênh: %s" % ", ".join(chans[c]["name"] for c in missing))
    when0 = _parse_dt(body.scheduledAt, "scheduledAt") if body.scheduledAt else None
    if when0 and when0 < now() + schedule.MIN_LEAD:
        raise ApiError(400, "INVALID_INPUT", "Giờ đăng phải sau hiện tại ít nhất 10 phút")
    color, fmt = body.color or "", body.format or "image_post"
    # kiểm tồn lần 2 ngay trước khi đăng — hết hàng thì chặn cả lô
    page, hard, warns, s, _ = inspect(row)
    oos = [m for c, m in hard if c == "OUT_OF_STOCK"]
    if oos:
        raise ApiError(409, "OUT_OF_STOCK", "; ".join(oos))
    images = [m.driveFileId for m in body.media]
    warnings = []
    batch_id, ts = str(uuid.uuid4()), z(now())
    jobs = []
    for i, ch in enumerate(body.channelIds):
        ch_base_page = tools.PAGES[ch] if ch in tools.PAGES else page
        ch_page = writing_style.apply(ch_base_page, TENANT_ID, ch)
        ch_allowed = rules.allowed_facts(row, s, ch_page, agent._effective_glob(ch_page))
        text = body.captionByChannel[ch].strip()
        v = rules.verify_post(text, ch_allowed)
        warnings += ["%s: %s" % (chans[ch]["name"], b) for b in v["block"]]
        dup = store.post_jobs(
            "product_code=%s and color=%s and channel_id=%s and format=%s and status = any(%s)",
            (code, color, ch, fmt, list(ACTIVE)),
        )
        job = {"id": str(uuid.uuid4()), "batch_id": batch_id, "product_code": code, "color": color, "format": fmt,
               "channel_id": ch, "caption": text, "media": images, "status": "draft", "scheduled_at": None,
               "fb_post_id": None, "published_url": None, "published_at": None, "error_code": None,
               "user_message": "", "attempt_count": 1, "created_at": ts, "updated_at": ts}
        when = when0 + timedelta(milliseconds=(body.spacingMs or 0) * i) if when0 else None
        if dup:
            job.update(status="blocked", error_code="DUPLICATE_POST_BLOCKED",
                       user_message="Mã này đã có bài đang chờ/đã đăng trên kênh này")
        else:
            job.update(scheduled_at=z(when) if when else None, **_publish(job["id"], ch, text, images, when))
        jobs.append(job)
    store.create_post_batch({"id": batch_id, "product_code": code, "color": color, "format": fmt, "created_at": ts}, jobs)
    return {"tenantId": TENANT_ID, "batchId": batch_id, "productCode": code, "color": color, "format": fmt,
            "batchStatus": batch_status([j["status"] for j in jobs]),
            "channels": [{"channelId": j["channel_id"], "postJobId": j["id"], "status": j["status"],
                          "queued": j["status"] == "queued", "queueJobId": j["id"] if j["status"] == "queued" else None,
                          "errorCode": j["error_code"], "userMessage": j["user_message"] or None,
                          "scheduledAt": j["scheduled_at"]} for j in jobs],
            "warnings": warnings + [w for w in warns if not w.startswith("page:")]}


def batch_status(statuses):
    done = [s for s in statuses if s in ("published", "failed", "blocked")]
    if statuses and len(done) == len(statuses):
        if all(s == "published" for s in statuses):
            return "completed"
        if all(s == "blocked" for s in statuses):
            return "blocked"
        if all(s == "failed" for s in statuses):
            return "failed"
        return "partial"
    return "running" if "publishing" in statuses else "pending"


def _job_view(j):
    return {"channelId": j["channel_id"], "postJobId": j["id"], "status": j["status"], "productOrigin": "sheet",
            "attemptCount": j["attempt_count"], "publishedPostId": j["fb_post_id"], "publishedUrl": j["published_url"],
            "publishedAt": j["published_at"], "lastErrorCode": j["error_code"], "userMessage": j["user_message"] or "",
            "progress": None}


@router.get("/posts/batches/{batch_id}")
def get_batch(batch_id: str):
    b = store.post_batch(batch_id)
    if not b:
        raise ApiError(404, "BATCH_NOT_FOUND", "Không có lô đăng này")
    jobs = store.post_jobs("batch_id=%s", (batch_id,), order="created_at, id")
    st = [j["status"] for j in jobs]
    status = batch_status(st)
    totals = {"total": len(st), "published": st.count("published"), "failed": st.count("failed"),
              "blocked": st.count("blocked"), "queued": st.count("queued"), "publishing": st.count("publishing"),
              "scheduledOnFacebook": st.count("scheduled_on_facebook"), "draft": st.count("draft"),
              "inProgress": st.count("queued") + st.count("publishing")}
    parts = [("%d hẹn giờ trên Facebook" % totals["scheduledOnFacebook"]) if totals["scheduledOnFacebook"] else "",
             ("%d chờ trong lịch app" % totals["queued"]) if totals["queued"] else "",
             ("%d đã đăng" % totals["published"]) if totals["published"] else "",
             ("%d bị chặn" % totals["blocked"]) if totals["blocked"] else "",
             ("%d lỗi" % totals["failed"]) if totals["failed"] else ""]
    return {"tenantId": TENANT_ID, "batchId": batch_id, "productCode": b["product_code"], "productOrigin": "sheet",
            "color": b["color"] or "", "format": b["format"], "status": status, "totals": totals,
            "startedAt": b["created_at"], "finishedAt": None, "durationMs": None,
            "channels": [_job_view(j) for j in jobs],
            "summaryMessage": "%d kênh: %s" % (len(st), ", ".join(p for p in parts if p) or "đang xử lý"),
            "progressSteps": []}


# ---------------- lịch đã hẹn + nhật ký ----------------
def _page(items, cursor, limit):
    start = int(cursor or 0)
    return items[start:start + limit], (str(start + limit) if start + limit < len(items) else None)


@router.get("/posts/scheduled")
def scheduled(channelId: Optional[str] = None, from_: Optional[str] = Query(None, alias="from"),
              to: Optional[str] = None, cursor: Optional[str] = None, limit: int = Query(50, ge=1, le=200)):
    jobs = store.post_jobs("scheduled_at is not null and status in ('queued','scheduled_on_facebook')", order="scheduled_at, id")
    lo = _parse_dt(from_, "from") if from_ else None
    hi = _parse_dt(to, "to") if to else None
    t = now()
    items = []
    for j in jobs:
        when = _parse_dt(j["scheduled_at"], "scheduledAt")
        if (channelId and j["channel_id"] != channelId) or (lo and when < lo) or (hi and when >= hi):
            continue
        starts = int((when - t).total_seconds() * 1000)
        items.append({"postJobId": j["id"], "batchId": j["batch_id"], "productCode": j["product_code"],
                      "color": j["color"] or "", "channelId": j["channel_id"], "format": j["format"],
                      "status": j["status"], "scheduledAt": j["scheduled_at"], "startsInMs": starts,
                      "overdue": starts < 0 and j["status"] == "queued", "captionPreview": j["caption"][:160],
                      "mediaCount": len(j["media"]), "userMessage": j["user_message"] or "",
                      "canReschedule": j["status"] == "queued", "canCancel": True, "createdAt": j["created_at"]})
    page_items, nxt = _page(items, cursor, limit)
    return {"tenantId": TENANT_ID, "items": page_items, "nextCursor": nxt, "limit": limit}


def _job_or_404(job_id):
    j = store.post_job(job_id)
    if not j:
        raise ApiError(404, "BATCH_NOT_FOUND", "Không có bài này")
    return j


class RescheduleIn(BaseModel):
    model_config = ConfigDict(extra="ignore")
    scheduledAt: str


@router.post("/posts/scheduled/{job_id}/reschedule")
def reschedule(job_id: str, body: RescheduleIn):
    j = _job_or_404(job_id)
    if j["status"] != "queued":
        raise ApiError(409, "INVALID_INPUT", "Bài đã hẹn trên Facebook — đổi giờ trên Meta Business Suite" if
                       j["status"] == "scheduled_on_facebook" else "Bài này không còn chờ đăng")
    when = _parse_dt(body.scheduledAt, "scheduledAt")
    if when < now() + schedule.MIN_LEAD:
        raise ApiError(400, "INVALID_INPUT", "Giờ đăng phải sau hiện tại ít nhất 10 phút")
    store.update_post_job(job_id, z(now()), scheduled_at=z(when))
    return {"tenantId": TENANT_ID, "postJobId": job_id, "channelId": j["channel_id"], "batchId": j["batch_id"],
            "previousScheduledAt": j["scheduled_at"], "scheduledAt": z(when),
            "delayMs": int((when - now()).total_seconds() * 1000), "queueJobId": job_id,
            "previousQueueEntryRemoved": True, "userMessage": "Đã đổi giờ đăng"}


@router.post("/posts/scheduled/{job_id}/cancel")
def cancel(job_id: str, body: Optional[dict] = None):
    j = _job_or_404(job_id)
    if j["status"] not in ("queued", "scheduled_on_facebook"):
        raise ApiError(409, "INVALID_INPUT", "Bài này không còn chờ đăng")
    deleted = tools.delete_fb_post(j["fb_post_id"], j["channel_id"]) \
        if j["status"] == "scheduled_on_facebook" else False
    if j["status"] == "scheduled_on_facebook" and not deleted:
        raise ApiError(502, "PUBLISH_FAILED", "Facebook chưa xoá được bài hẹn giờ — thử lại hoặc huỷ trên Meta Business Suite")
    msg = "Đã huỷ" + (" và xoá bài hẹn giờ trên Facebook" if deleted else "")
    store.update_post_job(job_id, z(now()), status="blocked", user_message=msg)
    return {"tenantId": TENANT_ID, "postJobId": job_id, "batchId": j["batch_id"], "channelId": j["channel_id"],
            "status": "blocked", "scheduledAt": j["scheduled_at"], "queueEntryRemoved": True,
            "platformPostDeleted": deleted, "userMessage": msg}


@router.get("/posts/jobs")
def jobs(status: Optional[str] = None, batchId: Optional[str] = None, cursor: Optional[str] = None,
         limit: int = Query(25, ge=1, le=200)):
    where, params = ["1=1"], []
    if status:
        where.append("status=%s")
        params.append(status)
    if batchId:
        where.append("batch_id=%s")
        params.append(batchId)
    rows = store.post_jobs(" and ".join(where), tuple(params))
    items = [{"postJobId": j["id"], "batchId": j["batch_id"], "productCode": j["product_code"], "productOrigin": "sheet",
              "color": j["color"] or "", "channelId": j["channel_id"], "format": j["format"], "status": j["status"],
              "attemptCount": j["attempt_count"], "lastErrorCode": j["error_code"], "userMessage": j["user_message"] or "",
              "publishedPostId": j["fb_post_id"], "publishedUrl": j["published_url"], "publishedAt": j["published_at"],
              "scheduledAt": j["scheduled_at"], "createdAt": j["created_at"], "updatedAt": j["updated_at"],
              "canRetry": j["status"] == "failed"} for j in rows]
    page_items, nxt = _page(items, cursor, limit)
    return {"tenantId": TENANT_ID, "items": page_items, "nextCursor": nxt, "limit": limit}


@router.post("/posts/jobs/{job_id}/retry")
def retry(job_id: str, body: Optional[dict] = None):
    j = _job_or_404(job_id)
    if j["status"] != "failed":
        raise ApiError(409, "INVALID_INPUT", "Chỉ thử lại được bài bị lỗi")
    when = _parse_dt(j["scheduled_at"], "scheduledAt") if j["scheduled_at"] else None
    if when and when < now() + schedule.MIN_LEAD:
        raise ApiError(409, "INVALID_INPUT", "Giờ hẹn cũ đã qua — tạo lại bài với giờ mới")
    upd = _publish(job_id, j["channel_id"], j["caption"], j["media"], when)
    upd.setdefault("error_code", None)
    store.update_post_job(job_id, z(now()), attempt_count=j["attempt_count"] + 1, **upd)
    return {"tenantId": TENANT_ID, "postJobId": job_id, "batchId": j["batch_id"], "channelId": j["channel_id"],
            "productCode": j["product_code"], "previousStatus": "failed", "status": upd["status"],
            "queueJobId": job_id, "attemptCount": j["attempt_count"] + 1, "userMessage": upd["user_message"]}


@router.get("/posts/worker-health")
def worker_health():
    queued = store.post_jobs("status='queued'")
    # không có worker tự đăng: chỉ Facebook (khi có token) đăng đúng giờ — nói thật trên banner
    return {"workersAvailable": bool(tools.fb_page()), "workersOnline": 1 if tools.fb_page() else 0,
            "queueReachable": True, "untouchedQueuedJobs": len(queued), "oldestUntouchedWaitMs": None,
            "checkedAt": z(now())}


# ---------------- phần giao diện cần nhưng lát cắt không dùng ----------------
@router.get("/posts/drafts")
def get_draft():
    return {"draft": None, "updatedAt": None, "persisted": False, "ownerKey": None}


@router.put("/posts/drafts")
@router.post("/posts/drafts")
def save_draft():
    return {"updatedAt": None, "persisted": False, "reason": "VPOST chưa lưu nháp soạn bài"}


@router.delete("/posts/drafts")
def delete_draft():
    return Response(status_code=204)


@router.post("/posts/uploads/detect-code")
def detect_code(body: dict):
    files = [f.get("fileName", "") for f in (body.get("files") or []) if isinstance(f, dict)]
    return {"verdict": {"status": "no_code"},
            "files": [{"fileName": f, "status": "none", "productCode": None} for f in files], "warnings": []}


# ---------------- OAuth Facebook: nối Page thật cho màn Kênh ----------------
STATE_COOKIE = "vpost_fb_state"
CHANNELS_SCREEN = os.environ.get("VPOST_UI_URL", "http://localhost:3010").rstrip("/") + "/channels"


def _back(query):
    return RedirectResponse("%s?%s" % (CHANNELS_SCREEN, query), status_code=302)


def _import_pages(user_token):
    """Token người dùng → lưu mọi Page có token. Lỗi Facebook → ApiError có mã."""
    try:
        if facebook.app_config():
            user_token = facebook.long_lived(user_token)   # để token Page không hết hạn
        pages = facebook.pages(user_token)
    except facebook.FacebookError as e:
        raise ApiError(502 if e.code == "GRAPH_UNREACHABLE" else 400, e.code, e.user_message)
    usable = [p for p in pages if p.get("access_token")]
    new, upd = store.save_fb_pages(usable, user_token, z(now()))
    return {"tenantId": TENANT_ID, "imported": new, "updated": upd, "skipped": len(pages) - len(usable),
            "channels": [c for c in channels_list() if c["channelId"].startswith(FB_PAGE_PREFIX)]}


@router.get("/channels/connect")
def channels_connect():
    """Bắt đầu OAuth: 302 sang hộp thoại đăng nhập Facebook, kèm state chống giả mạo (cookie HttpOnly)."""
    state = secrets.token_urlsafe(24)
    try:
        url = facebook.authorize_url(state)
    except facebook.FacebookError as e:
        return _back("connect=error&reason=%s" % e.code)
    resp = RedirectResponse(url, status_code=302)
    resp.set_cookie(STATE_COOKIE, state, max_age=600, httponly=True, samesite="lax", path="/api/channels")
    return resp


@router.get("/channels/callback")
def channels_callback(request: Request, code: str = "", state: str = "", error: str = ""):
    """Facebook gọi lại sau khi người dùng bấm cho phép (hoặc huỷ)."""
    expected = request.cookies.get(STATE_COOKIE, "")
    if error:
        resp = _back("connect=cancelled")
    elif not (code and state and expected and secrets.compare_digest(state, expected)):
        resp = _back("connect=error&reason=STATE_MISMATCH")
    else:
        try:
            r = _import_pages(facebook.exchange_code(code))
            resp = _back("connected=%d&new=%d&skipped=%d" % (r["imported"] + r["updated"], r["imported"], r["skipped"]))
        except facebook.FacebookError as e:
            resp = _back("connect=error&reason=%s" % e.code)
        except ApiError as e:
            resp = _back("connect=error&reason=%s" % e.detail["code"])
    resp.delete_cookie(STATE_COOKIE, path="/api/channels")
    return resp


class ImportIn(BaseModel):
    model_config = ConfigDict(extra="ignore")
    userAccessToken: str = Field(min_length=1, max_length=2000, pattern=r"^\S+$")


@router.post("/channels/import")
def channels_import(body: ImportIn):
    """Cửa phụ: dán User Access Token (từ Graph API Explorer) thay cho đăng nhập."""
    return _import_pages(body.userAccessToken)


@router.post("/channels/refresh")
def channels_refresh(body: Optional[dict] = None):
    token = store.fb_user_token()
    if not token:
        raise ApiError(409, "CHANNEL_NOT_CONFIGURED", "Chưa nối Facebook lần nào — bấm Kết nối Facebook trước")
    return _import_pages(token)


class ChannelStatusIn(BaseModel):
    model_config = ConfigDict(extra="ignore")
    status: str = Field(pattern=r"^(active|disabled)$")


@router.put("/channels/{channel_id}")
def channel_set_status(channel_id: str, body: ChannelStatusIn):
    if channel_id not in _channel_map():
        raise ApiError(404, "CHANNEL_NOT_CONFIGURED", "Không có kênh này")
    store.set_channel_status(channel_id, body.status)
    return {"channelId": channel_id, "status": body.status}


@router.delete("/channels/{channel_id}")
def channel_remove(channel_id: str):
    if not channel_id.startswith(FB_PAGE_PREFIX) or not store.fb_page(channel_id[len(FB_PAGE_PREFIX):]):
        raise ApiError(409, "INVALID_INPUT", "Chỉ gỡ được Page đã nối qua Facebook; kênh mẫu thì tắt thay vì gỡ")
    store.delete_fb_page(channel_id[len(FB_PAGE_PREFIX):])
    return {"channelId": channel_id, "removed": True}


# ---------------- Hộp thư bình luận Facebook (/api/comments) ----------------
log = logging.getLogger("vpost.comments")
COMMENT_STATUSES = ("unreplied", "replied", "ignored")
MODERATION_FILTERS = ("auto_hidden", "would_hide", "flagged")
THREAD_FILTERS = ("can_ban", "needs_reply", "unread", "all", "hidden", "ignored", "has_phone")
OOS_CLAIMS = ("còn hàng", "sẵn hàng", "còn nhiều", "đủ size", "full size", "sẵn nhiều")
_EPOCH_UTC = datetime(1970, 1, 1, tzinfo=timezone.utc)


class EmptyIn(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class SyncCommentsIn(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    channelId: Optional[str] = Field(default=None, min_length=1, max_length=128)
    postJobId: Optional[str] = Field(default=None, min_length=1, max_length=128)
    lookbackDays: Optional[int] = Field(default=None, ge=1, le=30)

    @field_validator("channelId", "postJobId")
    @classmethod
    def _strip_non_empty(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        t = v.strip()
        if not t:
            raise ValueError("không được để trống hoặc chỉ có khoảng trắng")
        return t


class CommentTextIn(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    text: str

    @field_validator("text")
    @classmethod
    def _validate_text(cls, v: str) -> str:
        t = v.strip()
        if not t:
            raise ValueError("nội dung không được để trống")
        if len(t) > 2000:
            raise ValueError("nội dung tối đa 2000 ký tự")
        return t


class ThreadReplyIn(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    text: str
    clientId: str

    @field_validator("text")
    @classmethod
    def _validate_text(cls, v: str) -> str:
        t = v.strip()
        if not t:
            raise ValueError("nội dung không được để trống")
        if len(t) > 2000:
            raise ValueError("nội dung tối đa 2000 ký tự")
        return t

    @field_validator("clientId")
    @classmethod
    def _validate_client_id(cls, v: str) -> str:
        t = v.strip()
        if t.lower().startswith("auto:"):
            raise ValueError("clientId không được bắt đầu bằng tiền tố hệ thống 'auto:'")
        try:
            return str(uuid.UUID(t))
        except ValueError:
            raise ValueError("clientId phải là UUID hợp lệ")


class HideCommentIn(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    hidden: bool


def _fb_http_status(code: str) -> int:
    if code in ("RATE_LIMITED", "POSTING_TOO_FAST"):
        return 429
    return 502


def _dt_utc(value) -> datetime:
    parsed = facebook.parse_time(value)
    return parsed if parsed is not None else _EPOCH_UTC


def _encode_cursor(payload: dict) -> str:
    raw = json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def _decode_cursor(token: str) -> dict:
    s = (token or "").strip()
    if not s:
        raise ApiError(400, "INVALID_INPUT", "cursor không hợp lệ")
    try:
        padded = s + ("=" * (-len(s) % 4))
        raw = base64.urlsafe_b64decode(padded.encode("ascii"))
        obj = json.loads(raw.decode("utf-8"))
    except Exception:
        raise ApiError(400, "INVALID_INPUT", "cursor không hợp lệ")
    if not isinstance(obj, dict):
        raise ApiError(400, "INVALID_INPUT", "cursor không hợp lệ")
    return obj


def _parse_thread_cursor(token: str):
    obj = _decode_cursor(token)
    t_raw = obj.get("t")
    tid = obj.get("id")
    a_val = obj.get("a", 0)
    if not isinstance(t_raw, str) or not isinstance(tid, str) or not tid:
        raise ApiError(400, "INVALID_INPUT", "cursor không hợp lệ")
    if isinstance(a_val, bool) or a_val not in (0, 1):
        raise ApiError(400, "INVALID_INPUT", "cursor không hợp lệ")
    dt = facebook.parse_time(t_raw)
    if dt is None:
        raise ApiError(400, "INVALID_INPUT", "cursor không hợp lệ")
    return int(a_val), dt, tid


def _parse_before_cursor(token: str):
    obj = _decode_cursor(token)
    t_raw = obj.get("t")
    mid = obj.get("id")
    r_val = obj.get("r", 1)
    if not isinstance(t_raw, str) or not isinstance(mid, str) or not mid:
        raise ApiError(400, "INVALID_INPUT", "before cursor không hợp lệ")
    if isinstance(r_val, bool) or r_val not in (0, 1):
        raise ApiError(400, "INVALID_INPUT", "before cursor không hợp lệ")
    dt = facebook.parse_time(t_raw)
    if dt is None:
        raise ApiError(400, "INVALID_INPUT", "before cursor không hợp lệ")
    return dt, int(r_val), mid


def _parse_updates_cursor(token: str):
    obj = _decode_cursor(token)
    cs = obj.get("cs")
    ds = obj.get("ds")
    if isinstance(cs, bool) or isinstance(ds, bool) or not isinstance(cs, int) or not isinstance(ds, int):
        raise ApiError(400, "INVALID_INPUT", "cursor không hợp lệ")
    if cs < 0 or ds < 0:
        raise ApiError(400, "INVALID_INPUT", "cursor không hợp lệ")
    return cs, ds


def _parse_updates_cursor_v2(token: str):
    obj = _decode_cursor(token)
    cs = obj.get("cs")
    ds = obj.get("ds")
    att_s = obj.get("as", 0)
    ar_s = obj.get("rs", 0)
    for val in (cs, ds, att_s, ar_s):
        if isinstance(val, bool) or not isinstance(val, int) or val < 0:
            raise ApiError(400, "INVALID_INPUT", "cursor không hợp lệ")
    return cs, ds, att_s, ar_s


def _truncate_update_text(text: str, max_len: int = 120) -> str:
    clean = re.sub(r"\s+", " ", str(text or "")).strip()
    if len(clean) <= max_len:
        return clean
    return clean[: max_len - 1].rstrip() + "…"


def _post_image_url(job, catalog_by_code, product_code) -> Optional[str]:
    media = job.get("media") if isinstance(job, dict) else None
    if isinstance(media, list):
        for item in media:
            if isinstance(item, str) and item.strip():
                return item.strip()
    if product_code and catalog_by_code:
        row = catalog_by_code.get(product_code)
        if row:
            imgs = rules.parse_images(row.get("anh"))
            if imgs:
                return imgs[0]
    return None


def _comment_or_404(comment_id: str):
    c = store.get_fb_comment(TENANT_ID, comment_id, customer_only=True)
    if not c or c.get("status") == "deleted":
        raise ApiError(404, "NOT_FOUND", "Không tìm thấy bình luận này")
    return c


def _comment_context(c, *, tenant_id=None):
    tid = tenant_id or TENANT_ID
    post = store.post_job(c["post_job_id"]) if c.get("post_job_id") else None
    row = store.catalog_row(c["product_code"]) if c.get("product_code") else None
    if row:
        page, _ = tools.page_for(row)
    elif c.get("channel_id") in tools.PAGES:
        page = tools.PAGES[c["channel_id"]]
    else:
        page = tools.PAGES[tools.DEFAULT_PAGE]
    page = writing_style.apply(page, tid, c.get("channel_id"))
    return post, row, page


def _allowed_for_comment(row, stock, page):
    eff_glob = agent._effective_glob(page)
    if not row:
        return {
            "prices": [], "colors": [], "sizes": [],
            "dropped_colors": [], "dropped_sizes": [],
            "materials": set(), "has_material": False, "has_color": False,
            "low": False, "fact_text": "",
            "max_emoji": (page or {}).get("max_emoji", 3),
            "banned": eff_glob["banned"] + eff_glob["brands"],
            "conditional": eff_glob["conditional"],
        }
    s = dict(stock)
    if s.get("hard"):
        s["dropped_colors"] = list(dict.fromkeys(list(s.get("dropped_colors") or []) + list(s.get("colors") or [])))
        s["dropped_sizes"] = list(dict.fromkeys(list(s.get("dropped_sizes") or []) + list(s.get("sizes") or [])))
        s["colors"], s["sizes"] = [], []
    return rules.allowed_facts(row, s, page, eff_glob)


def _check_reply_text(text, row, page):
    stock = tools.check_stock(row) if row else None
    allowed = _allowed_for_comment(row, stock, page)
    chk = tools.verify_post(text, allowed, is_comment=True)
    block = list(chk["block"])
    if stock and stock.get("hard"):
        for phrase in rules._phrase_hits(text, OOS_CLAIMS, negation_aware=True):
            block.append("sản phẩm đang hết hàng nhưng câu trả lời nói '%s'" % phrase)
    return {"block": list(dict.fromkeys(block)), "warn": list(chk["warn"])}


def _draft_view(d):
    if not d:
        return None
    return {
        "id": d["id"],
        "status": d["status"],
        "text": d["edited_text"] if d["edited_text"] else d["ai_text"],
        "aiText": d["ai_text"],
        "reasons": d["reasons"],
        "warnings": d["warnings"],
        "errorCode": d["error_code"] or None,
        "userMessage": d["user_message"] or None,
        "updatedAt": z(d["updated_at"]),
    }


def _build_thread_records(rows, read_states, attentions=None):
    """Nhóm các dòng fb_comment thành hội thoại theo bình luận gốc (parent_id rỗng, gồm cả phản hồi 3 tầng), ưu tiên 'Cần bạn' lên đầu rồi mới nhất trước."""
    att_map = attentions or {}
    by_id = {r["id"]: r for r in rows}
    roots = {}
    replies_by_root = {}
    for r in rows:
        pid = (r.get("parent_id") or "").strip()
        if not pid:
            roots[r["id"]] = r
    for r in rows:
        pid = (r.get("parent_id") or "").strip()
        if not pid:
            continue
        cur = pid
        seen = {r["id"]}
        for _ in range(10):
            if cur in roots or cur in seen:
                break
            seen.add(cur)
            parent_row = by_id.get(cur)
            if not parent_row:
                break
            next_pid = (parent_row.get("parent_id") or "").strip()
            if not next_pid:
                break
            cur = next_pid
        replies_by_root.setdefault(cur, []).append(r)

    records = []
    for root_id, root in roots.items():
        fb_msgs = [root] + list(replies_by_root.get(root_id) or [])
        fb_msgs.sort(key=lambda m: (_dt_utc(m["created_time"]), 0 if m["id"] == root_id else 1, m["id"]))
        if root["is_from_page"] and not any(not m["is_from_page"] for m in fb_msgs):
            continue

        cust_msg = root if not root["is_from_page"] else next(m for m in fb_msgs if not m["is_from_page"])
        customer_id = cust_msg.get("from_id") or ""
        customer_name = (cust_msg.get("from_name") or "").strip() or None
        status = "ignored" if root["status"] == "ignored" else "open"
        is_hidden = bool(root["is_hidden"])
        last_msg = fb_msgs[-1]
        updated_dt = _dt_utc(last_msg["created_time"])
        updated_at = z(last_msg["created_time"])

        non_hidden = [m for m in fb_msgs if not m["is_hidden"]]
        needs_reply = (status != "ignored") and bool(non_hidden) and (not bool(non_hidden[-1]["is_from_page"]))

        last_read_raw = read_states.get(root_id)
        last_read_dt = facebook.parse_time(last_read_raw) if last_read_raw else None
        if status == "ignored":
            unread_count = 0
        else:
            unread_count = sum(
                1
                for m in fb_msgs
                if not m["is_from_page"]
                and not m["is_hidden"]
                and (last_read_dt is None or _dt_utc(m["created_time"]) > last_read_dt)
            )
        has_phone = any(bool(rules.find_phones(m["message"])) for m in fb_msgs if not m["is_from_page"])
        last_customer_msg = next((m for m in reversed(non_hidden) if not m["is_from_page"]), None)
        att = att_map.get(root_id)
        has_can_ban = bool(att and att.get("tag") == "can_ban")

        records.append({
            "id": root_id,
            "root": root,
            "fb_msgs": fb_msgs,
            "customer_id": customer_id,
            "customer_name": customer_name,
            "status": status,
            "is_hidden": is_hidden,
            "last_msg": last_msg,
            "updated_dt": updated_dt,
            "updated_at": updated_at,
            "needs_reply": needs_reply,
            "unread": unread_count > 0,
            "unread_count": unread_count,
            "has_phone": has_phone,
            "message_count": len(fb_msgs),
            "last_customer_msg": last_customer_msg,
            "attention": att if has_can_ban else None,
            "has_can_ban": has_can_ban,
        })

    records.sort(key=lambda rec: (1 if rec["has_can_ban"] else 0, rec["updated_dt"], rec["id"]), reverse=True)
    return records


def _serialize_thread(rec, *, chans, jobs_by_id, catalog_by_code, active_drafts, tags_by_from, auto_replies=None):
    root = rec["root"]
    ch_info = chans.get(root["channel_id"]) or {}
    job = jobs_by_id.get(root["post_job_id"]) if root.get("post_job_id") else None
    post_url = (job.get("published_url") if job else None) or (
        "https://www.facebook.com/%s" % root["fb_post_id"] if root.get("fb_post_id") else None
    )
    post_image_url = _post_image_url(job, catalog_by_code, root.get("product_code"))
    last_msg = rec["last_msg"]
    customer_id = rec["customer_id"]
    tags = list(tags_by_from.get(customer_id) or []) if customer_id else []
    att = rec.get("attention")
    attention_view = (
        {"tag": att["tag"], "reason": att["reason"], "since": z(att["since"])}
        if att and att.get("tag")
        else None
    )
    ar = (auto_replies or {}).get(rec["id"])
    auto_reply_view = (
        {
            "lastAction": ar["action"],
            "text": ar["text"] or None,
            "reason": ar["reason"] or None,
            "at": z(ar["created_at"]),
        }
        if ar
        else None
    )
    return {
        "id": rec["id"],
        "channelId": root["channel_id"],
        "channelName": ch_info.get("name") or root["channel_id"],
        "pageId": root["page_id"],
        "postJobId": root["post_job_id"],
        "productCode": root["product_code"],
        "postCaption": (job.get("caption") or "") if job else "",
        "postUrl": post_url,
        "postImageUrl": post_image_url,
        "customer": {
            "id": customer_id,
            "name": rec["customer_name"],
            "tags": tags,
        },
        "lastMessage": {
            "id": last_msg["id"],
            "fromPage": bool(last_msg["is_from_page"]),
            "text": last_msg["message"],
            "createdAt": z(last_msg["created_time"]),
        },
        "needsReply": rec["needs_reply"],
        "unread": rec["unread"],
        "unreadCount": rec["unread_count"],
        "status": rec["status"],
        "isHidden": rec["is_hidden"],
        "messageCount": rec["message_count"],
        "hasPhone": rec["has_phone"],
        "draft": _draft_view(active_drafts.get(rec["id"])),
        "moderation": moderation_store.format_comment_moderation(root),
        "attention": attention_view,
        "autoReply": auto_reply_view,
        "updatedAt": rec["updated_at"],
    }


def _message_view(m, *, thread_id, liked_set, client_by_reply):
    from_page = bool(m["is_from_page"])
    client_id = client_by_reply.get(m["id"])
    if not from_page:
        sent_by = None
    elif m.get("sent_by") == "auto" or (client_id or "").startswith("auto:"):
        sent_by = "auto"
    else:
        sent_by = "operator"
    return {
        "id": m["id"],
        "threadId": thread_id,
        "fromPage": from_page,
        "fromId": m["from_id"] or "",
        "fromName": (m["from_name"] or "").strip() or None,
        "text": m["message"],
        "createdAt": z(m["created_time"]),
        "permalinkUrl": m["permalink_url"] or None,
        "isHidden": bool(m["is_hidden"]),
        "canComment": bool(m["can_comment"]),
        "likedByPage": m["id"] in liked_set,
        "delivery": "sent",
        "errorCode": None,
        "userMessage": None,
        "clientId": client_id,
        "sentBy": sent_by,
        "moderation": moderation_store.format_comment_moderation(m),
    }


def _outgoing_draft_message_view(d, *, root, channel_name):
    cid = d["client_id"] or None
    sent_by = "auto" if (d.get("sent_by") == "auto" or (cid or "").startswith("auto:")) else "operator"
    return {
        "id": d["id"],
        "threadId": root["id"],
        "fromPage": True,
        "fromId": root["page_id"] or "",
        "fromName": channel_name or None,
        "text": d["edited_text"] if d["edited_text"] else d["ai_text"],
        "createdAt": z(d["created_at"] or d["updated_at"]),
        "permalinkUrl": None,
        "isHidden": False,
        "canComment": False,
        "likedByPage": False,
        "delivery": d["status"],
        "errorCode": d["error_code"] or None,
        "userMessage": d["user_message"] or None,
        "clientId": cid,
        "sentBy": sent_by,
        "moderation": None,
    }


def _load_thread_record(thread_id: str, *, tenant_id=None):
    tid = tenant_id or TENANT_ID
    rows = store.list_thread_comments(tid, thread_id)
    read_states = store.get_thread_read_states(tid, [thread_id])
    attentions = store.get_thread_attentions(tid, [thread_id])
    recs = _build_thread_records(rows, read_states, attentions=attentions)
    rec = next((r for r in recs if r["id"] == thread_id), None)
    if rec is None:
        raise ApiError(404, "NOT_FOUND", "Không tìm thấy hội thoại này")
    return rec


def _thread_view(thread_id: str, *, rec=None, chans=None, tenant_id=None):
    tid = tenant_id or TENANT_ID
    rec = rec if rec is not None else _load_thread_record(thread_id, tenant_id=tid)
    chans = chans if chans is not None else _channel_map()
    root = rec["root"]
    job = store.post_job(root["post_job_id"]) if root.get("post_job_id") else None
    jobs_by_id = {root["post_job_id"]: job} if job else {}
    catalog_by_code = {}
    if root.get("product_code") and not _post_image_url(job, None, None):
        row = store.catalog_row(root["product_code"])
        if row:
            catalog_by_code[root["product_code"]] = row
    active_drafts = store.active_thread_drafts(tid, [thread_id])
    tags_by_from = inbox_store.tags_for(tid, [rec["customer_id"]]) if rec["customer_id"] else {}
    auto_replies = store.latest_auto_reply_for_threads(tid, [thread_id])
    return _serialize_thread(
        rec,
        chans=chans,
        jobs_by_id=jobs_by_id,
        catalog_by_code=catalog_by_code,
        active_drafts=active_drafts,
        tags_by_from=tags_by_from,
        auto_replies=auto_replies,
    )


def _message_for_sent_draft(thread_id: str, draft: dict, *, root: dict, chans: dict, tenant_id=None):
    tid = tenant_id or TENANT_ID
    fb_reply_id = draft.get("fb_reply_id") or ""
    saved = store.get_comment(tid, fb_reply_id) if fb_reply_id else None
    if saved:
        liked = set(inbox_store.liked_ids(tid, [saved["id"]]))
        client_map = {saved["id"]: draft["client_id"]} if draft.get("client_id") else {}
        return _message_view(saved, thread_id=thread_id, liked_set=liked, client_by_reply=client_map)
    ch_name = (chans.get(root["channel_id"]) or {}).get("name") or root["channel_id"]
    cid = draft.get("client_id") or None
    sent_by = "auto" if (draft.get("sent_by") == "auto" or (cid or "").startswith("auto:")) else "operator"
    return {
        "id": fb_reply_id or draft["id"],
        "threadId": thread_id,
        "fromPage": True,
        "fromId": root["page_id"] or "",
        "fromName": ch_name or None,
        "text": draft["edited_text"] if draft["edited_text"] else draft["ai_text"],
        "createdAt": z(draft.get("sent_at") or draft.get("updated_at") or draft.get("created_at")),
        "permalinkUrl": None,
        "isHidden": False,
        "canComment": True,
        "likedByPage": False,
        "delivery": "sent",
        "errorCode": None,
        "userMessage": None,
        "clientId": cid,
        "sentBy": sent_by,
        "moderation": None,
    }


def generate_thread_draft(thread_id: str):
    """Soạn và lưu nháp AI cho một hội thoại dựa trên lịch sử không bị ẩn cũ→mới (không gọi Facebook).

    Trả (draft_status, error_code|None). Dùng chung cho API `POST /threads/{id}/draft` và `comment_poller`.
    """
    rec = _load_thread_record(thread_id)
    now_ts = z(now())
    if store.has_sending_draft(TENANT_ID, thread_id, now_ts=now_ts):
        return None, "CONFLICT"
    root = rec["root"]
    post, row, page = _comment_context(root)
    visible_history = [m for m in rec["fb_msgs"] if not m["is_hidden"]]
    history = visible_history if visible_history else [root]
    target_comment = rec["last_customer_msg"] or root
    res = agent.draft_comment_reply(target_comment, post, row, page, model=MODEL, history=history)
    ts = z(now())
    draft_status = "draft" if res["decision"] == "reply" else "flagged"
    ok, err = store.create_ai_comment_draft(
        TENANT_ID,
        thread_id,
        {
            "id": str(uuid.uuid4()),
            "comment_id": thread_id,
            "target_comment_id": target_comment["id"],
            "status": draft_status,
            "ai_text": res["reply"],
            "edited_text": "",
            "reasons": res["reasons"],
            "warnings": res["warnings"],
            "model": res["model"],
            "tokens_in": res["tokens_in"],
            "tokens_out": res["tokens_out"],
            "fb_reply_id": "",
            "client_id": "",
            "error_code": "",
            "user_message": "",
            "created_at": ts,
            "updated_at": ts,
            "sent_at": "",
        },
        allow_any_root=True,
    )
    if not ok:
        return None, err
    log.info(
        "comment_thread_draft_created tenant=%s thread_id=%s status=%s",
        TENANT_ID,
        thread_id,
        draft_status,
    )
    return draft_status, None


def threads_needing_auto_draft(limit: int) -> list[str]:
    """Danh sách tối đa `limit` threadId cần trả lời và chưa có nháp phủ tới tin nhắn khách gần nhất."""
    if limit <= 0:
        return []
    rows = store.list_all_tenant_comments(TENANT_ID)
    if not rows:
        return []
    recs = _build_thread_records(rows, {})
    need_recs = [r for r in recs if r["needs_reply"] and r["last_customer_msg"] is not None]
    if not need_recs:
        return []
    active_drafts = store.active_thread_drafts(TENANT_ID, [r["id"] for r in need_recs])
    now_ts = z(now())
    out = []
    for rec in need_recs:
        tid = rec["id"]
        if store.has_sending_draft(TENANT_ID, tid, now_ts=now_ts):
            continue
        draft = active_drafts.get(tid)
        last_cust = rec["last_customer_msg"]
        if draft is not None:
            covered_id = (draft.get("target_comment_id") or "").strip()
            if covered_id:
                if covered_id == last_cust["id"]:
                    continue
            else:
                last_cust_dt = _dt_utc(last_cust["created_time"])
                draft_dt = facebook.parse_time(draft.get("created_at") or draft.get("updated_at"))
                if draft_dt is not None and draft_dt >= last_cust_dt:
                    continue
        out.append(tid)
        if len(out) >= limit:
            break
    return out


def _page_replies_for(c, replies_by_thread, draft, reply_owners=None):
    owners = reply_owners or {}
    if not c.get("parent_id"):
        reps = [
            p for p in replies_by_thread.get(c["id"], [])
            if owners.get(p["id"]) in (None, c["id"])
        ]
    else:
        sent_id = draft.get("fb_reply_id") if draft and draft.get("status") == "sent" else ""
        reps = [
            p for p in replies_by_thread.get(c["parent_id"], [])
            if owners.get(p["id"]) in (None, c["id"])
            and (p["created_time"] >= c["created_time"] or (sent_id and p["id"] == sent_id))
        ]
    return [{"id": p["id"], "message": p["message"], "createdAt": z(p["created_time"])} for p in reps]


def _comment_view(c, *, chans=None, jobs_by_id=None, replies_by_thread=None, drafts_by_comment=None, reply_owners=None):
    chans = chans if chans is not None else _channel_map()
    job = jobs_by_id.get(c["post_job_id"]) if jobs_by_id is not None else (
        store.post_job(c["post_job_id"]) if c.get("post_job_id") else None
    )
    if replies_by_thread is None:
        thread_key = c["parent_id"] or c["id"]
        replies_by_thread = store.page_replies_for_threads(TENANT_ID, [thread_key])
    if reply_owners is None:
        all_reply_ids = [p["id"] for reps in replies_by_thread.values() for p in reps]
        reply_owners = store.sent_reply_owners(TENANT_ID, all_reply_ids)
    if drafts_by_comment is None:
        draft = store.latest_comment_draft(TENANT_ID, c["id"], now_ts=z(now()))
    else:
        draft = drafts_by_comment.get(c["id"])
    ch_info = chans.get(c["channel_id"]) or {}
    post_url = (job.get("published_url") if job else None) or (
        "https://www.facebook.com/%s" % c["fb_post_id"] if c.get("fb_post_id") else None
    )
    return {
        "id": c["id"],
        "channelId": c["channel_id"],
        "channelName": ch_info.get("name") or c["channel_id"],
        "pageId": c["page_id"],
        "postJobId": c["post_job_id"],
        "productCode": c["product_code"],
        "postCaption": (job.get("caption") or "") if job else "",
        "postUrl": post_url,
        "fromName": c["from_name"],
        "message": c["message"],
        "createdAt": z(c["created_time"]),
        "permalinkUrl": c["permalink_url"] or None,
        "isHidden": bool(c["is_hidden"]),
        "canComment": bool(c["can_comment"]),
        "status": c["status"],
        "pageReplies": _page_replies_for(c, replies_by_thread, draft, reply_owners=reply_owners),
        "draft": _draft_view(draft),
        "moderation": moderation_store.format_comment_moderation(c),
    }


def run_comment_sync(
    *,
    channel_id: Optional[str] = None,
    post_job_id: Optional[str] = None,
    lookback_days: int = 14,
    include_meta: bool = False,
    out_new_ids: Optional[list[str]] = None,
):
    """Đồng bộ bình luận từ Facebook và chạy tự kiểm duyệt (dùng chung cho API và poller nền)."""
    cutoff = now() - timedelta(days=lookback_days)

    where, params = ["status='published'", "fb_post_id is not null", "trim(fb_post_id)!=''"], []
    if channel_id:
        where.append("channel_id=%s")
        params.append(channel_id)
    if post_job_id:
        where.append("id=%s")
        params.append(post_job_id)
    jobs = store.post_jobs(" and ".join(where), tuple(params), order="published_at desc nulls last, created_at desc, id desc")

    eligible = []
    for j in jobs:
        pub_dt = facebook.parse_time(j.get("published_at") or j.get("created_at"))
        if pub_dt is not None and pub_dt >= cutoff:
            eligible.append(j)

    synced_posts = 0
    new_comments = 0
    updated_comments = 0
    errors = []
    new_customer_comment_ids = []
    rate_limited = False

    for job in eligible:
        fb_post_id = (job.get("fb_post_id") or "").strip()
        creds = page_credentials(job["channel_id"])
        if not creds:
            code = "CHANNEL_NOT_CONFIGURED"
            msg = "Kênh chưa nối Fanpage Facebook hoặc đã bị gỡ — nối lại trong mục Kênh."
            store.set_comment_sync_error(TENANT_ID, fb_post_id, "%s: %s" % (code, msg))
            log.warning("comment_sync_error tenant=%s post_job_id=%s comment_id=%s code=%s",
                        TENANT_ID, job["id"], "", code)
            errors.append({"postJobId": job["id"], "code": code, "message": msg})
            continue

        page_id, page_token = creds
        sync_state = store.get_comment_sync(TENANT_ID, fb_post_id)
        since = sync_state["last_synced_at"] if sync_state and sync_state.get("last_synced_at") else None
        sync_now = now()
        sync_ts = z(sync_now)
        # Lưu mốc đồng bộ theo giây nguyên (lùi 1 giây an toàn) để không rớt bình luận cùng giây / lệch đồng hồ nhẹ
        watermark_ts = z(sync_now.replace(microsecond=0) - timedelta(seconds=1))

        try:
            raw_items = facebook.list_comments(fb_post_id, page_token, since=since)
            post_new = 0
            post_upd = 0
            for raw in raw_items:
                cid = str(raw.get("id") or "").strip()
                if not cid:
                    continue
                frm = raw.get("from") if isinstance(raw.get("from"), dict) else {}
                from_id = str(frm.get("id") or "")
                from_name = str(frm.get("name") or "")
                parent = raw.get("parent") if isinstance(raw.get("parent"), dict) else {}
                parent_id = str(parent.get("id") or "")
                is_from_page = 1 if (from_id and from_id == str(page_id)) else 0
                cdt = facebook.parse_time(raw.get("created_time"))
                created_time = z(cdt) if cdt else sync_ts
                created = store.upsert_fb_comment(
                    TENANT_ID,
                    {
                        "id": cid,
                        "channel_id": job["channel_id"],
                        "page_id": str(page_id),
                        "post_job_id": job["id"],
                        "fb_post_id": fb_post_id,
                        "product_code": job.get("product_code") or "",
                        "parent_id": parent_id,
                        "from_id": from_id,
                        "from_name": from_name,
                        "is_from_page": is_from_page,
                        "message": str(raw.get("message") or ""),
                        "permalink_url": str(raw.get("permalink_url") or ""),
                        "is_hidden": 1 if raw.get("is_hidden") else 0,
                        "can_comment": 0 if raw.get("can_comment") is False else 1,
                        "created_time": created_time,
                        "status": "replied" if is_from_page else "unreplied",
                        "synced_at": sync_ts,
                        "updated_at": sync_ts,
                        "publish_updates": False,
                    },
                )
                if created:
                    post_new += 1
                    if not is_from_page:
                        new_customer_comment_ids.append(cid)
                else:
                    post_upd += 1

            store.reconcile_replied_comments(TENANT_ID, fb_post_id, sync_ts)
            new_comments += post_new
            updated_comments += post_upd
            if getattr(raw_items, "truncated", False):
                msg = "Bài có quá nhiều bình luận mới (đã dừng ở giới hạn trang) — chưa đẩy mốc đồng bộ để tránh sót bình luận cũ hơn."
                store.set_comment_sync_error(TENANT_ID, fb_post_id, "SYNC_TRUNCATED: %s" % msg)
                log.warning("comment_sync_truncated tenant=%s post_job_id=%s comment_id=%s code=%s",
                            TENANT_ID, job["id"], "", "SYNC_TRUNCATED")
                errors.append({"postJobId": job["id"], "code": "SYNC_TRUNCATED", "message": msg})
            else:
                store.set_comment_sync_ok(TENANT_ID, fb_post_id, watermark_ts)
            synced_posts += 1
        except facebook.FacebookError as e:
            if e.code == "RATE_LIMITED":
                rate_limited = True
            store.set_comment_sync_error(TENANT_ID, fb_post_id, "%s: %s" % (e.code, e.user_message))
            log.warning("comment_sync_error tenant=%s post_job_id=%s comment_id=%s code=%s",
                        TENANT_ID, job["id"], "", e.code)
            errors.append({"postJobId": job["id"], "code": e.code, "message": e.user_message})
            continue
        except Exception as e:
            msg = "Lỗi đồng bộ bình luận: %s" % type(e).__name__
            try:
                store.set_comment_sync_error(TENANT_ID, fb_post_id, "UPSTREAM_ERROR: %s" % msg)
            except Exception:
                pass
            log.warning("comment_sync_error tenant=%s post_job_id=%s comment_id=%s code=%s",
                        TENANT_ID, job["id"], "", "UPSTREAM_ERROR")
            errors.append({"postJobId": job["id"], "code": "UPSTREAM_ERROR", "message": msg})
            continue

    moderation_summary = {"autoHidden": 0, "wouldHide": 0, "flagged": 0, "skipped": 0}
    try:
        mod_res = moderation_api.run_auto_moderation(TENANT_ID, new_customer_comment_ids, model=MODEL)
        if mod_res.get("stoppedByRateLimit"):
            rate_limited = True
        moderation_summary = {
            "autoHidden": int(mod_res.get("autoHidden", 0)),
            "wouldHide": int(mod_res.get("wouldHide", 0)),
            "flagged": int(mod_res.get("flagged", 0)),
            "skipped": int(mod_res.get("skipped", 0)),
        }
        if int(mod_res.get("failed", 0)) > 0:
            failed_n = int(mod_res["failed"])
            log.warning(
                "comment_sync_moderation_error tenant=%s synced_posts=%d new_comments=%d "
                "updated_comments=%d new_customer_comments=%d failed=%d code=%s",
                TENANT_ID, synced_posts, new_comments, updated_comments,
                len(new_customer_comment_ids), failed_n, "MODERATION_FAILED",
            )
            errors.append({
                "postJobId": post_job_id or "auto-moderation",
                "code": "MODERATION_FAILED",
                "message": "Tự kiểm duyệt gặp lỗi ở %d bình luận — các bình luận lỗi đã được gắn cờ để kiểm tra thủ công." % failed_n,
            })
    except Exception as e:
        log.warning(
            "comment_sync_moderation_error tenant=%s synced_posts=%d new_comments=%d "
            "updated_comments=%d new_customer_comments=%d code=%s err=%s",
            TENANT_ID, synced_posts, new_comments, updated_comments,
            len(new_customer_comment_ids), "MODERATION_FAILED", type(e).__name__,
        )
        errors.append({
            "postJobId": post_job_id or "auto-moderation",
            "code": "MODERATION_FAILED",
            "message": "Tự kiểm duyệt bình luận gặp lỗi: %s" % type(e).__name__,
        })
    finally:
        if new_customer_comment_ids:
            try:
                store.publish_comment_updates(TENANT_ID, new_customer_comment_ids)
            except Exception as e:
                log.warning(
                    "comment_sync_publish_updates_error tenant=%s count=%d err=%s",
                    TENANT_ID, len(new_customer_comment_ids), type(e).__name__,
                )

    if out_new_ids is not None:
        out_new_ids.extend(new_customer_comment_ids)
    result = {
        "tenantId": TENANT_ID,
        "syncedPosts": synced_posts,
        "newComments": new_comments,
        "updatedComments": updated_comments,
        "errors": errors,
        "moderation": moderation_summary,
    }
    if include_meta:
        return result, rate_limited
    return result


@router.post("/comments/sync")
def sync_comments(body: Optional[SyncCommentsIn] = None):
    req = body or SyncCommentsIn()
    new_customer_ids: list[str] = []
    res = run_comment_sync(
        channel_id=req.channelId,
        post_job_id=req.postJobId,
        lookback_days=req.lookbackDays if req.lookbackDays is not None else 14,
        out_new_ids=new_customer_ids,
    )
    if new_customer_ids:
        import auto_reply
        try:
            auto_reply.run_auto_reply(TENANT_ID, new_customer_ids)
        except Exception as e:
            log.warning(
                "comment_sync_auto_reply_error tenant=%s count=%d err=%s",
                TENANT_ID,
                len(new_customer_ids),
                type(e).__name__,
            )
    return res


# ---------------- Hội thoại bình luận (/api/comments/threads) & luồng cập nhật (/api/comments/updates) ----------------
# Đặt TRƯỚC mọi đường dẫn động `/comments/{comment_id}/...` để không bao giờ bị che khuất.

@router.get("/comments/updates")
def comment_updates(since: Optional[str] = None):
    since_f = (since or "").strip() or None
    if not since_f:
        cs, ds, att_s, ar_s = store.comment_updates_watermark_v2(TENANT_ID)
        return {
            "tenantId": TENANT_ID,
            "cursor": _encode_cursor({"cs": cs, "ds": ds, "as": att_s, "rs": ar_s}),
            "items": [],
            "draftsReady": [],
            "needYou": [],
            "autoReplied": [],
        }

    cs, ds, att_s, ar_s = _parse_updates_cursor_v2(since_f)
    rows, drafts_ready, need_you, auto_replied, new_cs, new_ds, new_as, new_rs = (
        store.list_comment_updates_since_v2(TENANT_ID, cs, ds, att_s, ar_s, limit=50)
    )
    chans = _channel_map() if rows else {}
    items = [
        {
            "threadId": store.resolve_thread_root_id(TENANT_ID, r) if r["parent_id"] else r["id"],
            "messageId": r["id"],
            "customerName": (r["from_name"] or "").strip() or None,
            "text": _truncate_update_text(r["message"], 120),
            "createdAt": z(r["created_time"]),
            "channelName": (chans.get(r["channel_id"]) or {}).get("name") or r["channel_id"],
        }
        for r in rows
    ]
    return {
        "tenantId": TENANT_ID,
        "cursor": _encode_cursor({"cs": new_cs, "ds": new_ds, "as": new_as, "rs": new_rs}),
        "items": items,
        "draftsReady": drafts_ready,
        "needYou": need_you,
        "autoReplied": auto_replied,
    }


@router.get("/comments/threads")
def list_comment_threads(
    filter: Optional[str] = None,
    channelId: Optional[str] = None,
    postJobId: Optional[str] = None,
    q: Optional[str] = None,
    cursor: Optional[str] = None,
    limit: int = Query(30, ge=1, le=100),
):
    filter_f = (filter or "").strip() or "needs_reply"
    if filter_f not in THREAD_FILTERS:
        raise ApiError(
            400,
            "INVALID_INPUT",
            "filter chỉ nhận can_ban, needs_reply, unread, all, hidden, ignored hoặc has_phone",
        )
    channel_f = (channelId or "").strip() or None
    job_f = (postJobId or "").strip() or None
    q_f = (q or "").strip().lower() or None
    cursor_f = (cursor or "").strip() or None
    cur_key = _parse_thread_cursor(cursor_f) if cursor_f else None

    rows = store.list_all_tenant_comments(TENANT_ID, channel_id=channel_f, post_job_id=job_f)
    read_states = store.get_thread_read_states(TENANT_ID) if rows else {}
    attentions = store.get_thread_attentions(TENANT_ID) if rows else {}
    records = _build_thread_records(rows, read_states, attentions=attentions)
    jobs_by_id = {j["id"]: j for j in store.post_jobs()} if records else {}

    if q_f:
        matched = []
        for rec in records:
            root = rec["root"]
            caption = (jobs_by_id.get(root["post_job_id"]) or {}).get("caption") or ""
            parts = [rec["customer_name"] or "", root["product_code"] or "", caption]
            parts.extend(m["message"] or "" for m in rec["fb_msgs"])
            if q_f in " ".join(parts).lower():
                matched.append(rec)
        records = matched

    counts = {
        "canBan": sum(1 for r in records if r["has_can_ban"]),
        "needsReply": sum(1 for r in records if r["needs_reply"]),
        "unread": sum(1 for r in records if r["unread"]),
        "all": len(records),
        "hidden": sum(1 for r in records if r["is_hidden"]),
        "ignored": sum(1 for r in records if r["status"] == "ignored"),
    }

    if filter_f == "can_ban":
        filtered = [r for r in records if r["has_can_ban"]]
    elif filter_f == "needs_reply":
        filtered = [r for r in records if r["needs_reply"]]
    elif filter_f == "unread":
        filtered = [r for r in records if r["unread"]]
    elif filter_f == "hidden":
        filtered = [r for r in records if r["is_hidden"]]
    elif filter_f == "ignored":
        filtered = [r for r in records if r["status"] == "ignored"]
    elif filter_f == "has_phone":
        filtered = [r for r in records if r["has_phone"]]
    else:
        filtered = records

    if cur_key is not None:
        cur_a, cur_dt, cur_id = cur_key
        filtered = [
            r
            for r in filtered
            if (1 if r["has_can_ban"] else 0, r["updated_dt"], r["id"]) < (cur_a, cur_dt, cur_id)
        ]

    page_recs = filtered[:limit]
    has_more = len(filtered) > limit
    next_cursor = (
        _encode_cursor({
            "a": 1 if page_recs[-1]["has_can_ban"] else 0,
            "t": page_recs[-1]["updated_at"],
            "id": page_recs[-1]["id"],
        })
        if (has_more and page_recs)
        else None
    )

    chans = _channel_map() if page_recs else {}
    catalog_by_code = {r["ma_sp"]: r for r in store.catalog_rows()} if page_recs else {}
    page_ids = [r["id"] for r in page_recs]
    active_drafts = store.active_thread_drafts(TENANT_ID, page_ids) if page_ids else {}
    auto_replies = store.latest_auto_reply_for_threads(TENANT_ID, page_ids) if page_ids else {}
    from_ids = list(dict.fromkeys(r["customer_id"] for r in page_recs if r["customer_id"]))
    tags_by_from = inbox_store.tags_for(TENANT_ID, from_ids) if from_ids else {}

    items = [
        _serialize_thread(
            rec,
            chans=chans,
            jobs_by_id=jobs_by_id,
            catalog_by_code=catalog_by_code,
            active_drafts=active_drafts,
            tags_by_from=tags_by_from,
            auto_replies=auto_replies,
        )
        for rec in page_recs
    ]
    return {
        "tenantId": TENANT_ID,
        "items": items,
        "nextCursor": next_cursor,
        "limit": limit,
        "counts": counts,
    }


@router.get("/comments/threads/{thread_id}")
def get_comment_thread(
    thread_id: str,
    before: Optional[str] = None,
    limit: int = Query(50, ge=1, le=200),
):
    before_f = (before or "").strip() or None
    before_key = _parse_before_cursor(before_f) if before_f else None
    rec = _load_thread_record(thread_id)
    root = rec["root"]

    pending_or_failed, client_by_reply = store.thread_outgoing_drafts(TENANT_ID, thread_id, now_ts=z(now()))
    entries = []
    for m in rec["fb_msgs"]:
        is_root = m["id"] == thread_id
        dt = _dt_utc(m["created_time"])
        r_flag = 0 if is_root else 1
        entries.append({
            "kind": "fb",
            "id": m["id"],
            "created_at": z(m["created_time"]),
            "r": r_flag,
            "sort_key": (dt, r_flag, m["id"]),
            "row": m,
        })
    for d in pending_or_failed:
        ts_val = d.get("created_at") or d.get("updated_at") or ""
        dt = _dt_utc(ts_val)
        entries.append({
            "kind": "draft",
            "id": d["id"],
            "created_at": z(ts_val),
            "r": 1,
            "sort_key": (dt, 1, d["id"]),
            "row": d,
        })
    entries.sort(key=lambda e: e["sort_key"])

    if before_key is not None:
        entries = [e for e in entries if e["sort_key"] < before_key]

    if len(entries) > limit:
        page_entries = entries[-limit:]
        first = page_entries[0]
        older_cursor = _encode_cursor({"t": first["created_at"], "id": first["id"], "r": first["r"]})
    else:
        page_entries = entries
        older_cursor = None

    chans = _channel_map()
    channel_name = (chans.get(root["channel_id"]) or {}).get("name") or root["channel_id"]
    real_ids = [e["id"] for e in page_entries if e["kind"] == "fb"]
    liked_set = set(inbox_store.liked_ids(TENANT_ID, real_ids)) if real_ids else set()

    messages = [
        _message_view(e["row"], thread_id=thread_id, liked_set=liked_set, client_by_reply=client_by_reply)
        if e["kind"] == "fb"
        else _outgoing_draft_message_view(e["row"], root=root, channel_name=channel_name)
        for e in page_entries
    ]
    thread = _thread_view(thread_id, rec=rec, chans=chans)
    return {
        "tenantId": TENANT_ID,
        "thread": thread,
        "messages": messages,
        "olderCursor": older_cursor,
    }


@router.post("/comments/threads/{thread_id}/read")
def mark_comment_thread_read(thread_id: str, body: Optional[EmptyIn] = None):
    rec = _load_thread_record(thread_id)
    now_dt = now()
    cust_dts = [
        _dt_utc(m["created_time"])
        for m in rec["fb_msgs"]
        if not m["is_from_page"] and not m["is_hidden"]
    ]
    if cust_dts:
        store.mark_thread_read(TENANT_ID, thread_id, z(max(cust_dts)), z(now_dt))
    return {"tenantId": TENANT_ID, "thread": _thread_view(thread_id)}


@router.post("/comments/threads/{thread_id}/draft")
def draft_comment_thread(thread_id: str, body: Optional[EmptyIn] = None):
    _, err = generate_thread_draft(thread_id)
    if err == "NOT_FOUND":
        raise ApiError(404, "NOT_FOUND", "Không tìm thấy hội thoại này")
    if err == "CONFLICT":
        raise ApiError(409, "CONFLICT", "Đang gửi trả lời cho hội thoại này")
    return {"tenantId": TENANT_ID, "thread": _thread_view(thread_id)}


@router.patch("/comments/threads/{thread_id}/draft")
def patch_comment_thread_draft(thread_id: str, body: CommentTextIn):
    rec = _load_thread_record(thread_id)
    _, row, page = _comment_context(rec["root"])
    check = _check_reply_text(body.text, row, page)
    ts = z(now())
    target_comment = rec["last_customer_msg"] or rec["root"]
    _, err = store.patch_comment_draft(
        TENANT_ID,
        thread_id,
        str(uuid.uuid4()),
        body.text,
        ts,
        valid_text=not check["block"],
        warnings=check["warn"],
        preserve_client_failed=True,
        allow_any_root=True,
        target_comment_id=target_comment["id"],
    )
    if err == "NOT_FOUND":
        raise ApiError(404, "NOT_FOUND", "Không tìm thấy hội thoại này")
    if err == "CONFLICT":
        raise ApiError(409, "CONFLICT", "Đang gửi trả lời cho hội thoại này, không thể chỉnh sửa nháp")
    return {"tenantId": TENANT_ID, "thread": _thread_view(thread_id), "check": check}


@router.post("/comments/threads/{thread_id}/attention/clear")
def clear_comment_thread_attention(thread_id: str, body: Optional[EmptyIn] = None):
    _load_thread_record(thread_id)
    store.clear_thread_attention(TENANT_ID, thread_id)
    return {"tenantId": TENANT_ID, "thread": _thread_view(thread_id)}


def send_thread_reply(
    thread_id: str,
    text: str,
    client_id: str,
    *,
    tenant_id=None,
    sent_by: str = "operator",
    clear_attention: bool = True,
) -> dict:
    """Đường gửi trả lời dùng chung cho người vận hành và auto-reply (cùng kiểm tra nội dung, fencing, idempotency)."""
    if sent_by != "auto" and str(client_id or "").strip().lower().startswith("auto:"):
        raise ApiError(400, "INVALID_INPUT", "clientId bắt đầu bằng 'auto:' chỉ dành cho hệ thống tự động trả lời")
    tid = tenant_id or TENANT_ID
    rec = _load_thread_record(thread_id, tenant_id=tid)
    root = rec["root"]

    now_ts = z(now())
    existing = store.get_draft_by_client_id(tid, client_id, now_ts=now_ts)
    if existing:
        if existing["comment_id"] != thread_id:
            raise ApiError(409, "CONFLICT", "clientId đã được dùng cho hội thoại khác")
        if existing["status"] == "sent":
            chans = _channel_map()
            return {
                "tenantId": tid,
                "thread": _thread_view(thread_id, rec=rec, chans=chans, tenant_id=tid),
                "message": _message_for_sent_draft(thread_id, existing, root=root, chans=chans, tenant_id=tid),
                "alreadySent": True,
            }
        if existing["status"] == "sending":
            raise ApiError(409, "CONFLICT", "Đang gửi trả lời cho hội thoại này")

    if not root["can_comment"]:
        raise ApiError(409, "CONFLICT", "Facebook không cho phép trả lời bình luận này")

    _, row, page = _comment_context(root, tenant_id=tid)
    check = _check_reply_text(text, row, page)
    if check["block"]:
        raise ApiError(422, "BLOCKED", "; ".join(check["block"]), reasons=list(check["block"]))

    creds = page_credentials(root["channel_id"])
    if not creds:
        raise ApiError(409, "CHANNEL_NOT_CONFIGURED", "Kênh chưa nối Fanpage Facebook thật — kết nối lại ở mục Kênh.")

    ts = z(now())
    attempt_token = str(uuid.uuid4())
    with store.active_send_attempt(attempt_token):
        draft_id, claim_err, existing_sent = store.claim_thread_reply(
            tid,
            thread_id,
            str(uuid.uuid4()),
            text,
            client_id,
            ts,
            attempt_token=attempt_token,
            sent_by=sent_by,
        )
        if claim_err == "ALREADY_SENT" and existing_sent:
            chans = _channel_map()
            return {
                "tenantId": tid,
                "thread": _thread_view(thread_id, chans=chans, tenant_id=tid),
                "message": _message_for_sent_draft(thread_id, existing_sent, root=root, chans=chans, tenant_id=tid),
                "alreadySent": True,
            }
        if claim_err == "NOT_FOUND":
            raise ApiError(404, "NOT_FOUND", "Không tìm thấy hội thoại này")
        if claim_err == "CANNOT_COMMENT":
            raise ApiError(409, "CONFLICT", "Facebook không cho phép trả lời bình luận này")
        if claim_err == "CONFLICT":
            raise ApiError(409, "CONFLICT", "Đang gửi trả lời cho hội thoại này")

        try:
            fb_reply_id = tools.reply_fb_comment(thread_id, text, root["channel_id"])
        except facebook.FacebookError as e:
            fail_ts = z(now())
            store.fail_comment_reply(
                tid,
                draft_id,
                thread_id,
                error_code=e.code,
                user_message=e.user_message,
                updated_at=fail_ts,
                attempt_token=attempt_token,
            )
            log.warning("comment_thread_reply_error tenant=%s post_job_id=%s thread_id=%s code=%s",
                        tid, root["post_job_id"], thread_id, e.code)
            raise ApiError(_fb_http_status(e.code), e.code, e.user_message)
        except Exception as e:
            fail_ts = z(now())
            msg = "Gửi trả lời lên Facebook thất bại: %s" % type(e).__name__
            store.fail_comment_reply(
                tid,
                draft_id,
                thread_id,
                error_code="UPSTREAM_ERROR",
                user_message=msg,
                updated_at=fail_ts,
                attempt_token=attempt_token,
            )
            log.warning("comment_thread_reply_error tenant=%s post_job_id=%s thread_id=%s code=%s",
                        tid, root["post_job_id"], thread_id, "UPSTREAM_ERROR")
            raise ApiError(502, "UPSTREAM_ERROR", msg)

        sent_ts = z(now())
        chans = _channel_map()
        ch_name = (chans.get(root["channel_id"]) or {}).get("name") or ""
        msg_id = fb_reply_id or ("reply-" + draft_id)
        page_reply_item = {
            "id": msg_id,
            "channel_id": root["channel_id"],
            "page_id": root["page_id"],
            "post_job_id": root["post_job_id"],
            "fb_post_id": root["fb_post_id"],
            "product_code": root["product_code"],
            "parent_id": thread_id,
            "from_id": root["page_id"],
            "from_name": ch_name,
            "is_from_page": 1,
            "message": text,
            "permalink_url": "",
            "is_hidden": 0,
            "can_comment": 1,
            "created_time": sent_ts,
            "status": "replied",
            "sent_by": sent_by,
            "synced_at": sent_ts,
            "updated_at": sent_ts,
        }
        completed = store.complete_comment_reply(
            tid,
            draft_id,
            thread_id,
            msg_id,
            sent_ts,
            page_reply_item=page_reply_item,
            attempt_token=attempt_token,
            clear_attention=clear_attention,
            attention_thread_id=thread_id,
        )
    if not completed:
        current = store.get_draft_by_client_id(tid, client_id, now_ts=sent_ts)
        if current and current["comment_id"] == thread_id and current["status"] == "sent":
            return {
                "tenantId": tid,
                "thread": _thread_view(thread_id, chans=chans, tenant_id=tid),
                "message": _message_for_sent_draft(thread_id, current, root=root, chans=chans, tenant_id=tid),
                "alreadySent": True,
            }
        raise ApiError(409, "CONFLICT", "Lượt gửi này đã được thay thế bởi lượt thử lại mới hơn")
    log.info(
        "comment_thread_reply_sent tenant=%s post_job_id=%s thread_id=%s reply_id=%s sent_by=%s",
        tid,
        root["post_job_id"],
        thread_id,
        msg_id,
        sent_by,
    )
    saved_reply = store.get_comment(tid, msg_id) or page_reply_item
    liked = set(inbox_store.liked_ids(tid, [saved_reply["id"]]))
    msg_view = _message_view(
        saved_reply,
        thread_id=thread_id,
        liked_set=liked,
        client_by_reply={saved_reply["id"]: client_id},
    )
    return {
        "tenantId": tid,
        "thread": _thread_view(thread_id, chans=chans, tenant_id=tid),
        "message": msg_view,
        "alreadySent": False,
    }


@router.post("/comments/threads/{thread_id}/reply")
def reply_comment_thread(thread_id: str, body: ThreadReplyIn):
    if str(body.clientId or "").strip().lower().startswith("auto:"):
        raise ApiError(400, "INVALID_INPUT", "clientId không được bắt đầu bằng 'auto:'")
    res = send_thread_reply(
        thread_id,
        body.text,
        body.clientId,
        sent_by="operator",
        clear_attention=True,
    )
    return {
        "tenantId": res["tenantId"],
        "thread": res["thread"],
        "message": res["message"],
    }


@router.post("/comments/threads/{thread_id}/ignore")
def ignore_comment_thread(thread_id: str, body: Optional[EmptyIn] = None):
    _load_thread_record(thread_id)
    store.update_fb_comment(TENANT_ID, thread_id, status="ignored", updated_at=z(now()))
    return {"tenantId": TENANT_ID, "thread": _thread_view(thread_id)}


@router.post("/comments/threads/{thread_id}/unignore")
def unignore_comment_thread(thread_id: str, body: Optional[EmptyIn] = None):
    rec = _load_thread_record(thread_id)
    root = rec["root"]
    restored = "replied" if store.has_page_reply_or_sent_draft(TENANT_ID, root) else "unreplied"
    store.update_fb_comment(TENANT_ID, thread_id, status=restored, updated_at=z(now()))
    return {"tenantId": TENANT_ID, "thread": _thread_view(thread_id)}


@router.get("/comments")
def list_comments(
    status: Optional[str] = None,
    moderation: Optional[str] = None,
    channelId: Optional[str] = None,
    postJobId: Optional[str] = None,
    q: Optional[str] = None,
    cursor: Optional[str] = None,
    limit: int = Query(20, ge=1, le=50),
):
    status_f = (status or "").strip() or None
    if status_f and status_f not in COMMENT_STATUSES:
        raise ApiError(400, "INVALID_INPUT", "status chỉ nhận unreplied, replied hoặc ignored")
    mod_f = (moderation or "").strip() or None
    if mod_f and mod_f not in MODERATION_FILTERS:
        raise ApiError(400, "INVALID_INPUT", "moderation chỉ nhận auto_hidden, would_hide hoặc flagged")
    channel_f = (channelId or "").strip() or None
    job_f = (postJobId or "").strip() or None
    q_f = (q or "").strip().lower() or None
    cursor_f = (cursor or "").strip() or None
    if cursor_f is not None:
        try:
            if int(cursor_f) < 0:
                raise ValueError()
        except ValueError:
            raise ApiError(400, "INVALID_INPUT", "cursor không hợp lệ")

    rows = store.list_fb_comments(TENANT_ID, channel_id=channel_f, post_job_id=job_f)
    jobs_by_id = {j["id"]: j for j in store.post_jobs()} if rows else {}
    if q_f:
        filtered = []
        for c in rows:
            caption = (jobs_by_id.get(c["post_job_id"]) or {}).get("caption") or ""
            haystack = " ".join((c["message"], c["from_name"], c["product_code"], caption)).lower()
            if q_f in haystack:
                filtered.append(c)
        rows = filtered

    counts = {
        "unreplied": sum(1 for c in rows if c["status"] == "unreplied"),
        "replied": sum(1 for c in rows if c["status"] == "replied"),
        "ignored": sum(1 for c in rows if c["status"] == "ignored"),
        "autoHidden": sum(1 for c in rows if (c.get("moderation_action") or "") == "auto_hidden"),
        "flagged": sum(1 for c in rows if (c.get("moderation_action") or "") == "flagged"),
    }
    if status_f:
        rows = [c for c in rows if c["status"] == status_f]
    if mod_f:
        rows = [c for c in rows if (c.get("moderation_action") or "") == mod_f]

    page_rows, nxt = _page(rows, cursor_f, limit)
    chans = _channel_map()
    thread_ids = [c["parent_id"] or c["id"] for c in page_rows]
    replies_by_thread = store.page_replies_for_threads(TENANT_ID, thread_ids)
    all_reply_ids = [p["id"] for reps in replies_by_thread.values() for p in reps]
    reply_owners = store.sent_reply_owners(TENANT_ID, all_reply_ids)
    drafts_by_comment = store.latest_comment_drafts(TENANT_ID, [c["id"] for c in page_rows], now_ts=z(now()))
    items = [
        _comment_view(
            c,
            chans=chans,
            jobs_by_id=jobs_by_id,
            replies_by_thread=replies_by_thread,
            drafts_by_comment=drafts_by_comment,
            reply_owners=reply_owners,
        )
        for c in page_rows
    ]
    return {"tenantId": TENANT_ID, "items": items, "nextCursor": nxt, "limit": limit, "counts": counts}


@router.post("/comments/{comment_id}/draft")
def draft_comment(comment_id: str, body: Optional[EmptyIn] = None):
    c = _comment_or_404(comment_id)
    if store.has_sending_draft(TENANT_ID, comment_id, now_ts=z(now())):
        raise ApiError(409, "CONFLICT", "Bình luận này đang gửi trả lời")
    post, row, page = _comment_context(c)
    res = agent.draft_comment_reply(c, post, row, page, model=MODEL)
    ts = z(now())
    ok, err = store.create_ai_comment_draft(
        TENANT_ID,
        comment_id,
        {
            "id": str(uuid.uuid4()),
            "comment_id": comment_id,
            "target_comment_id": comment_id,
            "status": "draft" if res["decision"] == "reply" else "flagged",
            "ai_text": res["reply"],
            "edited_text": "",
            "reasons": res["reasons"],
            "warnings": res["warnings"],
            "model": res["model"],
            "tokens_in": res["tokens_in"],
            "tokens_out": res["tokens_out"],
            "fb_reply_id": "",
            "client_id": "",
            "error_code": "",
            "user_message": "",
            "created_at": ts,
            "updated_at": ts,
            "sent_at": "",
        },
    )
    if not ok:
        if err == "NOT_FOUND":
            raise ApiError(404, "NOT_FOUND", "Không tìm thấy bình luận này")
        raise ApiError(409, "CONFLICT", "Bình luận này đang gửi trả lời")
    return {"tenantId": TENANT_ID, "comment": _comment_view(store.get_fb_comment(TENANT_ID, comment_id))}


@router.patch("/comments/{comment_id}/draft")
def patch_comment_draft(comment_id: str, body: CommentTextIn):
    c = _comment_or_404(comment_id)
    _, row, page = _comment_context(c)
    check = _check_reply_text(body.text, row, page)
    ts = z(now())
    _, err = store.patch_comment_draft(
        TENANT_ID,
        comment_id,
        str(uuid.uuid4()),
        body.text,
        ts,
        valid_text=not check["block"],
        warnings=check["warn"],
    )
    if err == "NOT_FOUND":
        raise ApiError(404, "NOT_FOUND", "Không tìm thấy bình luận này")
    if err == "CONFLICT":
        raise ApiError(409, "CONFLICT", "Bản nháp đang gửi, không thể chỉnh sửa")
    return {"tenantId": TENANT_ID, "comment": _comment_view(store.get_fb_comment(TENANT_ID, comment_id)), "check": check}


@router.post("/comments/{comment_id}/reply")
def reply_comment(comment_id: str, body: CommentTextIn):
    c = _comment_or_404(comment_id)
    if not c["can_comment"]:
        raise ApiError(409, "CONFLICT", "Facebook không cho phép trả lời bình luận này")
    if store.has_sending_draft(TENANT_ID, comment_id, now_ts=z(now())):
        raise ApiError(409, "CONFLICT", "Bình luận này đang gửi trả lời")

    _, row, page = _comment_context(c)
    check = _check_reply_text(body.text, row, page)
    if check["block"]:
        raise ApiError(422, "BLOCKED", "; ".join(check["block"]), reasons=list(check["block"]))

    creds = page_credentials(c["channel_id"])
    if not creds:
        raise ApiError(409, "CHANNEL_NOT_CONFIGURED", "Kênh chưa nối Fanpage Facebook thật — kết nối lại ở mục Kênh.")

    ts = z(now())
    attempt_token = str(uuid.uuid4())
    with store.active_send_attempt(attempt_token):
        draft_id, claim_err = store.claim_comment_reply(
            TENANT_ID, comment_id, str(uuid.uuid4()), body.text, ts, attempt_token=attempt_token
        )
        if claim_err == "NOT_FOUND":
            raise ApiError(404, "NOT_FOUND", "Không tìm thấy bình luận này")
        if claim_err == "CANNOT_COMMENT":
            raise ApiError(409, "CONFLICT", "Facebook không cho phép trả lời bình luận này")
        if claim_err == "CONFLICT":
            raise ApiError(409, "CONFLICT", "Bình luận này đang gửi trả lời")

        target_id = c["parent_id"] or c["id"]
        try:
            fb_reply_id = tools.reply_fb_comment(target_id, body.text, c["channel_id"])
        except facebook.FacebookError as e:
            fail_ts = z(now())
            store.fail_comment_reply(
                TENANT_ID,
                draft_id,
                comment_id,
                error_code=e.code,
                user_message=e.user_message,
                updated_at=fail_ts,
                attempt_token=attempt_token,
            )
            log.warning("comment_reply_error tenant=%s post_job_id=%s comment_id=%s code=%s",
                        TENANT_ID, c["post_job_id"], comment_id, e.code)
            raise ApiError(_fb_http_status(e.code), e.code, e.user_message)
        except Exception as e:
            fail_ts = z(now())
            msg = "Gửi trả lời lên Facebook thất bại: %s" % type(e).__name__
            store.fail_comment_reply(
                TENANT_ID,
                draft_id,
                comment_id,
                error_code="UPSTREAM_ERROR",
                user_message=msg,
                updated_at=fail_ts,
                attempt_token=attempt_token,
            )
            log.warning("comment_reply_error tenant=%s post_job_id=%s comment_id=%s code=%s",
                        TENANT_ID, c["post_job_id"], comment_id, "UPSTREAM_ERROR")
            raise ApiError(502, "UPSTREAM_ERROR", msg)

        sent_ts = z(now())
        page_reply_item = None
        if fb_reply_id:
            ch_name = (_channel_map().get(c["channel_id"]) or {}).get("name") or ""
            page_reply_item = {
                "id": fb_reply_id,
                "channel_id": c["channel_id"],
                "page_id": c["page_id"],
                "post_job_id": c["post_job_id"],
                "fb_post_id": c["fb_post_id"],
                "product_code": c["product_code"],
                "parent_id": target_id,
                "from_id": c["page_id"],
                "from_name": ch_name,
                "is_from_page": 1,
                "message": body.text,
                "permalink_url": "",
                "is_hidden": 0,
                "can_comment": 1,
                "created_time": sent_ts,
                "status": "replied",
                "sent_by": "operator",
                "synced_at": sent_ts,
                "updated_at": sent_ts,
            }
        completed = store.complete_comment_reply(
            TENANT_ID,
            draft_id,
            comment_id,
            fb_reply_id,
            sent_ts,
            page_reply_item=page_reply_item,
            attempt_token=attempt_token,
            clear_attention=True,
            attention_thread_id=target_id,
        )
    if not completed:
        latest = store.latest_comment_draft(TENANT_ID, comment_id, now_ts=sent_ts)
        if not (latest and latest["status"] == "sent"):
            raise ApiError(409, "CONFLICT", "Lượt gửi này đã được thay thế bởi lượt thử lại mới hơn")
    return {"tenantId": TENANT_ID, "comment": _comment_view(store.get_fb_comment(TENANT_ID, comment_id))}


@router.post("/comments/{comment_id}/ignore")
def ignore_comment(comment_id: str, body: Optional[EmptyIn] = None):
    _comment_or_404(comment_id)
    store.update_fb_comment(TENANT_ID, comment_id, status="ignored", updated_at=z(now()))
    return {"tenantId": TENANT_ID, "comment": _comment_view(store.get_fb_comment(TENANT_ID, comment_id))}


@router.post("/comments/{comment_id}/unignore")
def unignore_comment(comment_id: str, body: Optional[EmptyIn] = None):
    c = _comment_or_404(comment_id)
    restored = "replied" if store.has_page_reply_or_sent_draft(TENANT_ID, c) else "unreplied"
    store.update_fb_comment(TENANT_ID, comment_id, status=restored, updated_at=z(now()))
    return {"tenantId": TENANT_ID, "comment": _comment_view(store.get_fb_comment(TENANT_ID, comment_id))}


@router.post("/comments/{comment_id}/hide")
def hide_comment(comment_id: str, body: HideCommentIn):
    c = _comment_or_404(comment_id)
    creds = page_credentials(c["channel_id"])
    if not creds:
        raise ApiError(409, "CHANNEL_NOT_CONFIGURED", "Kênh chưa nối Fanpage Facebook thật — kết nối lại ở mục Kênh.")
    try:
        ok = tools.hide_fb_comment(comment_id, body.hidden, c["channel_id"])
    except facebook.FacebookError as e:
        log.warning("comment_hide_error tenant=%s post_job_id=%s comment_id=%s code=%s",
                    TENANT_ID, c["post_job_id"], comment_id, e.code)
        raise ApiError(_fb_http_status(e.code), e.code, e.user_message)
    except Exception as e:
        log.warning("comment_hide_error tenant=%s post_job_id=%s comment_id=%s code=%s",
                    TENANT_ID, c["post_job_id"], comment_id, "UPSTREAM_ERROR")
        raise ApiError(502, "UPSTREAM_ERROR", "Cập nhật trạng thái ẩn bình luận thất bại: %s" % type(e).__name__)
    if not ok:
        log.warning("comment_hide_error tenant=%s post_job_id=%s comment_id=%s code=%s",
                    TENANT_ID, c["post_job_id"], comment_id, "UPSTREAM_ERROR")
        raise ApiError(502, "UPSTREAM_ERROR", "Facebook không xác nhận cập nhật trạng thái ẩn bình luận — vui lòng thử lại.")
    upd = {"is_hidden": 1 if body.hidden else 0, "updated_at": z(now())}
    if not body.hidden and c.get("moderation_action") == "auto_hidden":
        upd["moderation_action"] = ""
    store.update_fb_comment(TENANT_ID, comment_id, **upd)
    return {"tenantId": TENANT_ID, "comment": _comment_view(store.get_fb_comment(TENANT_ID, comment_id))}
