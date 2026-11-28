"""Writing style configuration store, validator, resolver, and page applicator.

Stores company default (`scope = "default"`) and per-Page overrides (`scope = channelId`)
in PostgreSQL under the shop schema (`store.schema_name()`), strictly tenant-scoped.

Resolution order for channel C:
    base page (pages.json entry if C is one of them, else default page)
    -> tenant default style
    -> channel override for scope C
Field by field; lists replace, not merge, except `extraBanned` which is unioned
across layers and always unioned with the immutable global banned list.
"""
from __future__ import annotations

import json
import unicodedata
from typing import Any, Iterable, Optional

from psycopg import sql as pg_sql

import store
import tools

DEFAULT_SCOPE = "default"
DEFAULT_INDUSTRY = "thời trang nữ"
DEFAULT_LENGTH = "medium"
DEFAULT_MAX_EXTRA_HASHTAGS = 3

VALID_LENGTHS = ("short", "medium", "long")

STYLE_FIELDS = (
    "shopName",
    "mentionShopName",
    "industry",
    "audience",
    "voice",
    "xungHo",
    "selfReference",
    "maxEmoji",
    "length",
    "ctaStyle",
    "hashtags",
    "footer",
    "extraBanned",
    "dos",
    "donts",
    "examples",
)
_STYLE_FIELD_SET = frozenset(STYLE_FIELDS)

STRING_LIMITS: dict[str, tuple[int, str]] = {
    "shopName": (80, "tên shop"),
    "industry": (80, "ngành hàng"),
    "audience": (200, "đối tượng khách hàng"),
    "voice": (400, "giọng văn"),
    "xungHo": (20, "cách gọi khách"),
    "selfReference": (20, "cách shop tự xưng"),
    "ctaStyle": (200, "phong cách CTA"),
    "footer": (300, "chân bài"),
}

LIST_LIMITS: dict[str, tuple[int, int, str]] = {
    "extraBanned": (30, 40, "cụm cấm bổ sung"),
    "dos": (10, 160, "mục nên làm"),
    "donts": (10, 160, "mục không nên làm"),
    "examples": (5, 1200, "bài mẫu"),
}

MAX_EMOJI_MIN = 0
MAX_EMOJI_MAX = 10
HASHTAGS_FIXED_MAX_ITEMS = 5
HASHTAGS_FIXED_MAX_CHARS = 40
HASHTAGS_MAX_EXTRA_MIN = 0
HASHTAGS_MAX_EXTRA_MAX = 5
_HASHTAG_SUBFIELDS = frozenset(("fixed", "maxExtra"))

WRITING_STYLE_SCHEMA_STATEMENTS = (
    """
    create table if not exists writing_style(
      tenant_id text not null,
      scope text not null,
      style json not null default '{}'::json,
      updated_by text not null default '',
      updated_at text not null default '',
      primary key (tenant_id, scope)
    )
    """,
)


class ValidationError(ValueError):
    """Raised when a WritingStyle payload fails field validation."""

    def __init__(self, fields: list[dict[str, str]]):
        self.fields = list(fields)
        msg = "; ".join("%s: %s" % (f["field"], f["message"]) for f in self.fields) or "Dữ liệu phong cách viết không hợp lệ"
        super().__init__(msg)


def init_writing_style() -> None:
    """Create the writing_style table in the shop schema. Idempotent."""
    schema = store.schema_name()
    with store.tx_locked("writing_style:init") as c:
        c.execute(pg_sql.SQL("create schema if not exists {}").format(pg_sql.Identifier(schema)))
        c.execute(pg_sql.SQL("set local search_path to {}").format(pg_sql.Identifier(schema)))
        for stmt in WRITING_STYLE_SCHEMA_STATEMENTS:
            c.execute(stmt)


# ---------------- Validation & normalization ----------------

def _is_strict_int(v: Any) -> bool:
    return isinstance(v, int) and not isinstance(v, bool)


def _is_valid_hashtag(raw: str) -> bool:
    """Matches ^#?[\\p{L}\\p{N}_]{1,40}$ on NFC-normalized text."""
    s = unicodedata.normalize("NFC", raw.strip())
    if not s:
        return False
    body = s[1:] if s.startswith("#") else s
    if not (1 <= len(body) <= HASHTAGS_FIXED_MAX_CHARS):
        return False
    for ch in body:
        if ch == "_":
            continue
        cat = unicodedata.category(ch)
        if not cat or cat[0] not in ("L", "N"):
            return False
    return True


def validate(style: Any) -> list[dict[str, str]]:
    """Validate a WritingStyle dict and return a list of `{field, message}` errors (empty = valid)."""
    if not isinstance(style, dict):
        return [{"field": "style", "message": "style phải là một object"}]

    errors: list[dict[str, str]] = []

    for key in style:
        if key not in _STYLE_FIELD_SET:
            errors.append({"field": str(key), "message": "trường không được hỗ trợ"})

    for key, (max_len, label) in STRING_LIMITS.items():
        if key not in style or style[key] is None:
            continue
        val = style[key]
        if not isinstance(val, str):
            errors.append({"field": key, "message": "%s phải là chuỗi ký tự" % label})
            continue
        if len(val.strip()) > max_len:
            errors.append({"field": key, "message": "%s tối đa %d ký tự" % (label, max_len)})

    if "mentionShopName" in style and style["mentionShopName"] is not None:
        if not isinstance(style["mentionShopName"], bool):
            errors.append({"field": "mentionShopName", "message": "mentionShopName phải là true hoặc false"})

    if "maxEmoji" in style and style["maxEmoji"] is not None:
        v = style["maxEmoji"]
        if not _is_strict_int(v) or not (MAX_EMOJI_MIN <= v <= MAX_EMOJI_MAX):
            errors.append({
                "field": "maxEmoji",
                "message": "số emoji tối đa phải là số nguyên từ %d đến %d" % (MAX_EMOJI_MIN, MAX_EMOJI_MAX),
            })

    if "length" in style and style["length"] is not None:
        v = style["length"]
        if not isinstance(v, str):
            errors.append({"field": "length", "message": "độ dài bài phải là short, medium hoặc long"})
        else:
            s = v.strip()
            if s and s not in VALID_LENGTHS:
                errors.append({"field": "length", "message": "độ dài bài chỉ nhận short, medium hoặc long"})

    if "hashtags" in style and style["hashtags"] is not None:
        ht = style["hashtags"]
        if not isinstance(ht, dict):
            errors.append({"field": "hashtags", "message": "hashtags phải là một object"})
        else:
            for sub in ht:
                if sub not in _HASHTAG_SUBFIELDS:
                    errors.append({"field": "hashtags.%s" % sub, "message": "trường không được hỗ trợ"})

            if "fixed" in ht and ht["fixed"] is not None:
                fixed = ht["fixed"]
                if not isinstance(fixed, list):
                    errors.append({"field": "hashtags.fixed", "message": "hashtags.fixed phải là danh sách chuỗi"})
                else:
                    if len(fixed) > HASHTAGS_FIXED_MAX_ITEMS:
                        errors.append({
                            "field": "hashtags.fixed",
                            "message": "tối đa %d hashtag cố định" % HASHTAGS_FIXED_MAX_ITEMS,
                        })
                    for idx, item in enumerate(fixed, 1):
                        if not isinstance(item, str):
                            errors.append({
                                "field": "hashtags.fixed",
                                "message": "mục %d phải là chuỗi ký tự" % idx,
                            })
                            break
                        if not _is_valid_hashtag(item):
                            errors.append({
                                "field": "hashtags.fixed",
                                "message": "mục %d không đúng định dạng hashtag (chỉ gồm chữ, số, dấu _ và tối đa %d ký tự)"
                                % (idx, HASHTAGS_FIXED_MAX_CHARS),
                            })
                            break

            if "maxExtra" in ht and ht["maxExtra"] is not None:
                mx = ht["maxExtra"]
                if not _is_strict_int(mx) or not (HASHTAGS_MAX_EXTRA_MIN <= mx <= HASHTAGS_MAX_EXTRA_MAX):
                    errors.append({
                        "field": "hashtags.maxExtra",
                        "message": "số hashtag bổ sung tối đa phải là số nguyên từ %d đến %d"
                        % (HASHTAGS_MAX_EXTRA_MIN, HASHTAGS_MAX_EXTRA_MAX),
                    })

    for key, (max_items, max_chars, label) in LIST_LIMITS.items():
        if key not in style or style[key] is None:
            continue
        arr = style[key]
        if not isinstance(arr, list):
            errors.append({"field": key, "message": "%s phải là danh sách chuỗi" % label})
            continue
        if len(arr) > max_items:
            errors.append({"field": key, "message": "tối đa %d %s" % (max_items, label)})
        for idx, item in enumerate(arr, 1):
            if not isinstance(item, str):
                errors.append({"field": key, "message": "mục %d phải là chuỗi ký tự" % idx})
                break
            cleaned = item.strip()
            if not cleaned:
                errors.append({"field": key, "message": "mục %d không được để trống" % idx})
                break
            if len(cleaned) > max_chars:
                errors.append({"field": key, "message": "mục %d tối đa %d ký tự" % (idx, max_chars)})
                break

    return errors


def _dedupe_ci(items: Iterable[str]) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for raw in items:
        s = str(raw or "").strip()
        if not s:
            continue
        k = s.lower()
        if k not in seen:
            seen.add(k)
            out.append(s)
    return out


def normalize(style: Optional[dict]) -> dict:
    """Return a clean WritingStyle dict keeping only configured (non-empty) fields."""
    if not isinstance(style, dict):
        return {}
    out: dict[str, Any] = {}

    for key in STRING_LIMITS:
        v = style.get(key)
        if isinstance(v, str):
            s = v.strip()
            if s:
                out[key] = s

    if isinstance(style.get("mentionShopName"), bool):
        out["mentionShopName"] = style["mentionShopName"]

    if _is_strict_int(style.get("maxEmoji")):
        out["maxEmoji"] = int(style["maxEmoji"])

    v_len = style.get("length")
    if isinstance(v_len, str) and v_len.strip() in VALID_LENGTHS:
        out["length"] = v_len.strip()

    ht = style.get("hashtags")
    if isinstance(ht, dict):
        ht_out: dict[str, Any] = {}
        fixed = ht.get("fixed")
        if isinstance(fixed, list):
            cleaned_fixed: list[str] = []
            seen_tags: set[str] = set()
            for item in fixed:
                if isinstance(item, str):
                    s = unicodedata.normalize("NFC", item.strip())
                    if s:
                        k = s.lstrip("#").lower()
                        if k not in seen_tags:
                            seen_tags.add(k)
                            cleaned_fixed.append(s)
            if cleaned_fixed:
                ht_out["fixed"] = cleaned_fixed
        if _is_strict_int(ht.get("maxExtra")):
            ht_out["maxExtra"] = int(ht["maxExtra"])
        if ht_out:
            out["hashtags"] = ht_out

    for key in LIST_LIMITS:
        arr = style.get(key)
        if isinstance(arr, list):
            cleaned_list = [x.strip() for x in arr if isinstance(x, str) and x.strip()]
            if key == "extraBanned":
                cleaned_list = _dedupe_ci(cleaned_list)
            if cleaned_list:
                out[key] = cleaned_list

    return out


def _decode_style(raw: Any) -> dict:
    if isinstance(raw, dict):
        return normalize(raw)
    if isinstance(raw, str) and raw.strip():
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, dict):
                return normalize(parsed)
        except ValueError:
            return {}
    return {}


def _decode_row(row: Any) -> dict:
    d = dict(row)
    return {
        "tenant_id": d["tenant_id"],
        "scope": d["scope"],
        "style": _decode_style(d.get("style")),
        "updated_by": d.get("updated_by") or "",
        "updated_at": d.get("updated_at") or "",
    }


# ---------------- CRUD ----------------

def get_scope(tenant_id: str, scope: str) -> Optional[dict]:
    if not tenant_id or not scope:
        return None
    with store.connect() as c:
        r = c.execute(
            "select tenant_id, scope, style, updated_by, updated_at "
            "from writing_style where tenant_id=%s and scope=%s",
            (tenant_id, scope),
        ).fetchone()
    return _decode_row(r) if r else None


def list_scopes(tenant_id: str) -> list[dict]:
    if not tenant_id:
        return []
    with store.connect() as c:
        rows = c.execute(
            "select tenant_id, scope, style, updated_by, updated_at "
            "from writing_style where tenant_id=%s order by scope asc",
            (tenant_id,),
        ).fetchall()
    return [_decode_row(r) for r in rows]


def upsert_scope(
    tenant_id: str,
    scope: str,
    style: dict,
    *,
    updated_by: str = "operator",
    updated_at: Optional[str] = None,
) -> dict:
    errors = validate(style)
    if errors:
        raise ValidationError(errors)
    clean = normalize(style)
    ts = updated_at or store._ts()
    payload = json.dumps(clean, ensure_ascii=False)
    with store.connect() as c:
        row = c.execute(
            """insert into writing_style(tenant_id, scope, style, updated_by, updated_at)
               values(%s, %s, %s::json, %s, %s)
               on conflict(tenant_id, scope) do update set
                 style = excluded.style,
                 updated_by = excluded.updated_by,
                 updated_at = excluded.updated_at
               returning tenant_id, scope, style, updated_by, updated_at""",
            (tenant_id, scope, payload, updated_by or "", ts),
        ).fetchone()
    return _decode_row(row)


def delete_scope(tenant_id: str, scope: str) -> bool:
    if not tenant_id or not scope:
        return False
    with store.connect() as c:
        cur = c.execute(
            "delete from writing_style where tenant_id=%s and scope=%s",
            (tenant_id, scope),
        )
    return cur.rowcount > 0


# ---------------- Resolution & Page Merging ----------------

def base_page_for(channel_id: Optional[str] = None) -> dict:
    """Base page dict from data/pages.json: channel entry if present, else DEFAULT_PAGE."""
    ch = (channel_id or "").strip()
    if ch and ch in tools.PAGES:
        return tools.PAGES[ch]
    return tools.PAGES[tools.DEFAULT_PAGE]


def base_style_for(channel_id: Optional[str] = None, page: Optional[dict] = None) -> dict:
    """Base WritingStyle values inherited from the base page and global config."""
    bp = page if page is not None else base_page_for(channel_id)
    return {
        "shopName": "",
        "mentionShopName": False,
        "industry": DEFAULT_INDUSTRY,
        "audience": "",
        "voice": bp.get("gu") or "",
        "xungHo": bp.get("xung_ho") or "",
        "selfReference": "",
        "maxEmoji": int(bp.get("max_emoji", 3)),
        "length": DEFAULT_LENGTH,
        "ctaStyle": "",
        "hashtags": {
            "fixed": [],
            "maxExtra": DEFAULT_MAX_EXTRA_HASHTAGS,
        },
        "footer": tools.GLOB.get("footer") or "",
        "extraBanned": [],
        "dos": [],
        "donts": [],
        "examples": [],
    }


def effective_banned(
    extra_banned: Optional[Iterable[str]] = None,
    base_banned: Optional[Iterable[str]] = None,
) -> list[str]:
    """Union the immutable global banned list with extraBanned; global entries can never be removed."""
    glob_list = list(base_banned if base_banned is not None else tools.GLOB["banned"])
    if not extra_banned:
        return glob_list
    out = list(glob_list)
    seen = {p.lower() for p in out}
    for raw in extra_banned:
        s = str(raw or "").strip()
        if s and s.lower() not in seen:
            seen.add(s.lower())
            out.append(s)
    return out


def merge_styles(
    base_page: dict,
    default_style: Optional[dict],
    channel_style: Optional[dict] = None,
) -> tuple[dict, dict]:
    """Merge base_page -> default_style -> channel_style.

    Returns `(effective_style, configured_style)`:
    - `effective_style`: full WritingStyle after inheritance from base_page.
    - `configured_style`: only the fields explicitly configured by default/channel.
    """
    eff = base_style_for(page=base_page)
    configured: dict[str, Any] = {}

    for raw_layer in (default_style, channel_style):
        layer = normalize(raw_layer)
        if not layer:
            continue

        for key in STRING_LIMITS:
            if key in layer:
                eff[key] = layer[key]
                configured[key] = layer[key]

        if "mentionShopName" in layer:
            eff["mentionShopName"] = layer["mentionShopName"]
            configured["mentionShopName"] = layer["mentionShopName"]

        if "maxEmoji" in layer:
            eff["maxEmoji"] = layer["maxEmoji"]
            configured["maxEmoji"] = layer["maxEmoji"]

        if "length" in layer:
            eff["length"] = layer["length"]
            configured["length"] = layer["length"]

        if "hashtags" in layer:
            lh = layer["hashtags"]
            ch_ht = configured.setdefault("hashtags", {})
            if "fixed" in lh:
                eff["hashtags"]["fixed"] = list(lh["fixed"])
                ch_ht["fixed"] = list(lh["fixed"])
            if "maxExtra" in lh:
                eff["hashtags"]["maxExtra"] = lh["maxExtra"]
                ch_ht["maxExtra"] = lh["maxExtra"]

        for key in ("dos", "donts", "examples"):
            if key in layer:
                eff[key] = list(layer[key])
                configured[key] = list(layer[key])

        if "extraBanned" in layer:
            merged_extra = _dedupe_ci(eff["extraBanned"] + layer["extraBanned"])
            eff["extraBanned"] = merged_extra
            configured["extraBanned"] = list(merged_extra)

    return eff, configured


def _load_scopes(tenant_id: str, channel_id: Optional[str]) -> tuple[dict, dict]:
    """Fetch default and channel override styles in a single SQL query.

    Safe to call when no rows exist, the table has not been initialized yet,
    or PostgreSQL is unavailable (e.g., offline eval/unit tests).
    """
    if not tenant_id:
        return {}, {}
    ch = (channel_id or "").strip()
    scopes = [DEFAULT_SCOPE]
    if ch and ch != DEFAULT_SCOPE:
        scopes.append(ch)
    try:
        with store.connect() as c:
            rows = c.execute(
                "select scope, style from writing_style where tenant_id=%s and scope = any(%s)",
                (tenant_id, scopes),
            ).fetchall()
    except Exception:
        return {}, {}
    by_scope = {r["scope"]: _decode_style(r.get("style")) for r in rows}
    return by_scope.get(DEFAULT_SCOPE, {}), (by_scope.get(ch, {}) if ch and ch != DEFAULT_SCOPE else {})


def resolve(tenant_id: str, channel_id: Optional[str] = None, *, page: Optional[dict] = None) -> dict:
    """Resolve the effective WritingStyle for `(tenant_id, channel_id)` in a single DB query."""
    bp = page if page is not None else base_page_for(channel_id)
    default_style, channel_style = _load_scopes(tenant_id, channel_id)
    eff, _ = merge_styles(bp, default_style, channel_style)
    return eff


def apply_resolved(page: dict, effective: dict, configured: dict) -> dict:
    """Return a new page dict with resolved style merged in without mutating `page`.

    When nothing is configured (or only the no-op default `mentionShopName=False`),
    returns a plain copy of `page` with no `writing_style` key so default prompts
    stay byte-identical.
    """
    new_page = dict(page)
    if not configured or configured == {"mentionShopName": False}:
        return new_page

    if "voice" in configured:
        new_page["gu"] = effective["voice"]
    if "xungHo" in configured:
        new_page["xung_ho"] = effective["xungHo"]
    if "maxEmoji" in configured:
        new_page["max_emoji"] = effective["maxEmoji"]
    if "industry" in configured:
        new_page["industry"] = effective["industry"]
    if "selfReference" in configured:
        new_page["self_reference"] = effective["selfReference"]
    if "mentionShopName" in configured:
        new_page["mention_shop_name"] = bool(effective["mentionShopName"])
    if "footer" in configured:
        new_page["footer"] = effective["footer"]

    extra = list(effective.get("extraBanned") or [])
    if extra:
        new_page["extra_banned"] = extra
    new_page["banned"] = effective_banned(extra)
    new_page["writing_style"] = json.loads(json.dumps(configured, ensure_ascii=False))
    return new_page


def apply(page: dict, tenant_id: str, channel_id: Optional[str] = None) -> dict:
    """Load resolved writing style in one query and return a new page dict with it applied.

    Safe to call when no style exists or the DB is unavailable; never mutates `page`.
    """
    default_style, channel_style = _load_scopes(tenant_id, channel_id)
    if not default_style and not channel_style:
        return dict(page)
    effective, configured = merge_styles(page, default_style, channel_style)
    return apply_resolved(page, effective, configured)


def apply_preview(
    page: dict,
    tenant_id: str,
    channel_id: Optional[str] = None,
    unsaved_style: Optional[dict] = None,
) -> dict:
    """Apply an unsaved style for preview without modifying the database.

    - If `unsaved_style` is None: resolves saved style for `(tenant_id, channel_id)`.
    - If `channel_id` is set: merges `page -> saved default -> unsaved_style`.
    - If `channel_id` is None: merges `page -> unsaved_style`.
    """
    if unsaved_style is None:
        return apply(page, tenant_id, channel_id)
    clean_unsaved = normalize(unsaved_style)
    ch = (channel_id or "").strip()
    if ch and ch != DEFAULT_SCOPE:
        saved_default, _ = _load_scopes(tenant_id, None)
        effective, configured = merge_styles(page, saved_default, clean_unsaved)
    else:
        effective, configured = merge_styles(page, clean_unsaved, None)
    return apply_resolved(page, effective, configured)
