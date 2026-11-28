"""Pipeline 7 bước tự động trả lời bình luận hỏi giá / size / màu theo mô hình ALLOWLIST và gắn nhãn 'Cần bạn'.

Nguyên tắc cốt lõi:
- CHỈ trả lời bình luận gốc (top-level) của khách trên bài đăng đã xuất bản bởi VPOST, khi hội thoại chưa có
  bất kỳ phản hồi nào từ Fanpage hay thao tác của nhân viên, dữ liệu sản phẩm vượt qua `tools.check_product()`
  không có lỗi cứng, và toàn bộ nội dung kiểm tra trực tiếp trên NFC(văn bản gốc) chỉ gồm chữ cái tiếng Việt,
  chữ số ASCII, dấu câu cơ bản và tối đa 2 dấu câu/emoji trong danh sách cho phép ở cuối câu (tuyệt đối từ chối
  ký tự vô hình, Bidi, Unicode Tag, homoglyph Cyrillic/Greek, fullwidth/math/Roman/superscript, xuống dòng/\v/\f),
  khớp TRỌN VẸN một mẫu trong `allow` của `data/auto_reply_rules.json` (tối đa 80 ký tự, đúng 1 câu).
- Mọi trường hợp khác (châm biếm, khen, cảm ơn, khiếu nại, câu hỏi hỗn hợp, số đo, sản phẩm/mã khác, trích dẫn,
  chỉ emoji, bình luận phản hồi trong chuỗi...) đều gắn nhãn 'Cần bạn' cho nhân viên xử lý.
- Các lớp bảo vệ an toàn được giữ nguyên và mở rộng cho khách thật (Facebook ẩn `from.id`): kill switch, chế độ dry-run,
  trần giờ/ngày theo Page, idempotency theo bình luận (`auto:<comment_id>`), cooldown theo hội thoại (1 lần/10 phút),
  giới hạn tốc độ theo bài đăng (tối đa 10 lần/bài/10 phút), chống spam lặp nguyên văn theo bài đăng trong 10 phút
  không phân biệt tác giả, giữ thêm lớp cooldown/spam theo khách khi có `from_id`, khoá tư vấn theo Page (kiểm tra lại
  cả danh sách intents dưới khoá), kiểm tra đầu ra (`verify_post`), cùng lớp phát hiện URL và prompt-injection bổ sung.

Log tuyệt đối KHÔNG chứa nội dung tin nhắn khách hàng hay token Facebook.
"""
from __future__ import annotations

import json
import logging
import os
import re
import threading
import unicodedata
from datetime import datetime, timedelta, timezone
from typing import Any, Iterable, Optional

import agent_runs
import facebook
import moderation
import rules
import schedule
import store
import tools
import writing_style

log = logging.getLogger("vpost.comments")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
DEFAULT_RULES_PATH = os.path.join(DATA, "auto_reply_rules.json")

VALID_INTENTS = ("price", "size", "color", "size_advice")
_VALID_INTENT_SET = frozenset(VALID_INTENTS)
_INTENT_ORDER = {"price": 0, "size": 1, "color": 2, "size_advice": 3}
_INTENT_LABELS = {"price": "giá", "size": "size", "color": "màu", "size_advice": "tư vấn size"}

MEASUREMENT_HEIGHT_MIN_CM = 130
MEASUREMENT_HEIGHT_MAX_CM = 200
MEASUREMENT_WEIGHT_MIN_KG = 30
MEASUREMENT_WEIGHT_MAX_KG = 120
SIZE_ADVICE_STATE_TTL_HOURS = 24

DEFAULT_MAX_CHARS = 300
DEFAULT_MAX_ALLOW_CHARS = 80
DEFAULT_COOLDOWN_MINUTES = 10
DEFAULT_POST_RATE_LIMIT = 10
DEFAULT_POST_RATE_WINDOW_MINUTES = 10
DEFAULT_POST_SPAM_THRESHOLD = 5
DEFAULT_POST_SPAM_WINDOW_MINUTES = 10

# Giữ thuộc tính tương thích ngược; mô hình allowlist tuyệt đối KHÔNG gọi AI để phân loại hay sinh câu trả lời.
MODEL = None

_EPOCH_UTC = datetime(1970, 1, 1, tzinfo=timezone.utc)

# Ký tự vô hình / đệm ngoài nhóm Unicode Cf (Hangul filler U+3164, Braille blank U+2800, Khmer, CGJ...)
_INVISIBLE_EXTRA = frozenset((
    "\u00ad",
    "\u034f",
    "\u115f",
    "\u1160",
    "\u17b4",
    "\u17b5",
    "\u180e",
    "\u200b",
    "\u200c",
    "\u200d",
    "\u2060",
    "\u2800",
    "\u3164",
    "\ufeff",
    "\uffa0",
))

# Bảng quy đổi homoglyph Cyrillic / Greek / Latin nhìn giống nhau về ASCII (fullwidth & math đã do NFKC xử lý)
_HOMOGLYPH_TABLE = str.maketrans({
    # Cyrillic uppercase
    "\u0410": "A",  # А
    "\u0412": "B",  # В
    "\u0421": "C",  # С
    "\u0415": "E",  # Е
    "\u0401": "E",  # Ё
    "\u041d": "H",  # Н
    "\u0406": "I",  # І
    "\u0407": "I",  # Ї
    "\u0408": "J",  # Ј
    "\u041a": "K",  # К
    "\u041c": "M",  # М
    "\u041e": "O",  # О
    "\u0420": "P",  # Р
    "\u0405": "S",  # Ѕ
    "\u0422": "T",  # Т
    "\u0423": "Y",  # У
    "\u0425": "X",  # Х
    "\u04ae": "Y",  # Ү
    "\u0474": "V",  # Ѵ
    "\u04c0": "I",  # Ӏ
    "\u0500": "D",  # Ԁ
    "\u051a": "Q",  # Ԛ
    "\u051c": "W",  # Ԝ
    # Cyrillic lowercase
    "\u0430": "a",  # а
    "\u0441": "c",  # с
    "\u0435": "e",  # е
    "\u0451": "e",  # ё
    "\u04bb": "h",  # һ
    "\u0456": "i",  # і
    "\u0457": "i",  # ї
    "\u0458": "j",  # ј
    "\u043a": "k",  # к
    "\u043c": "m",  # м
    "\u043e": "o",  # о
    "\u0440": "p",  # р
    "\u0455": "s",  # ѕ
    "\u0442": "t",  # т
    "\u0443": "y",  # у
    "\u0445": "x",  # х
    "\u04af": "y",  # ү
    "\u0475": "v",  # ѵ
    "\u04cf": "l",  # ӏ
    "\u0501": "d",  # ԁ
    "\u051b": "q",  # ԛ
    "\u051d": "w",  # ԝ
    # Greek uppercase
    "\u0391": "A",  # Α
    "\u0392": "B",  # Β
    "\u0395": "E",  # Ε
    "\u0396": "Z",  # Ζ
    "\u0397": "H",  # Η
    "\u0399": "I",  # Ι
    "\u039a": "K",  # Κ
    "\u039c": "M",  # Μ
    "\u039d": "N",  # Ν
    "\u039f": "O",  # Ο
    "\u03a1": "P",  # Ρ
    "\u03a4": "T",  # Τ
    "\u03a5": "Y",  # Υ
    "\u03a7": "X",  # Χ
    # Greek lowercase
    "\u03b1": "a",  # α
    "\u03b2": "b",  # β
    "\u03b5": "e",  # ε
    "\u03b7": "n",  # η
    "\u03b9": "i",  # ι
    "\u03ba": "k",  # κ
    "\u03bd": "v",  # ν
    "\u03bf": "o",  # ο
    "\u03c1": "p",  # ρ
    "\u03c2": "c",  # ς
    "\u03c4": "t",  # τ
    "\u03c5": "u",  # υ
    "\u03c7": "x",  # χ
    # Latin lookalikes
    "\u0131": "i",  # ı
    "\u0261": "g",  # ɡ
})

_VI_LOWER_LETTERS = (
    "abcdefghijklmnopqrstuvwxyz"
    "àáảãạăằắẳẵặâầấẩẫậđ"
    "èéẻẽẹêềếểễệ"
    "ìíỉĩị"
    "òóỏõọôồốổỗộơờớởỡợ"
    "ùúủũụưừứửữự"
    "ỳýỷỹỵ"
)
_ALLOWED_LETTER_DIGIT_SET = frozenset(_VI_LOWER_LETTERS + "0123456789")
_ALLOWED_CASE_LETTER_DIGIT_SET = frozenset(_VI_LOWER_LETTERS + _VI_LOWER_LETTERS.upper() + "0123456789")
_ALLOWED_BASIC_PUNCT = frozenset(" .,?!-")
_ALLOWED_BASIC_PUNCT_SLASH = _ALLOWED_BASIC_PUNCT | frozenset("/")
_TRAILING_PUNCT = frozenset("?!.")
_NEWLINE_OR_BREAK_CHARS = frozenset("\n\r\v\f\x85\u2028\u2029")
# Đúng 8 dấu tổ hợp NFD của tiếng Việt (chấp nhận trước NFC, sau NFC phải tổ hợp hoàn toàn thành chữ tiếng Việt)
_VI_COMBINING_MARKS = frozenset("\u0300\u0301\u0302\u0303\u0306\u0309\u031b\u0323")

# Danh sách ALLOWLIST nhỏ các emoji lành tính được phép xuất hiện ở CUỐI câu (R2; mọi emoji khác đều bị chặn → Cần bạn)
_BENIGN_TRAILING_EMOJIS = frozenset(
    "🌸🌺🌷🌹💐❤💖💗💕🥰😍😊☺🙏✨👍👌🫶"
)
_ALLOWED_RAW_PRE_NFC_SET = (
    _ALLOWED_CASE_LETTER_DIGIT_SET
    | _ALLOWED_BASIC_PUNCT
    | _BENIGN_TRAILING_EMOJIS
    | _VI_COMBINING_MARKS
    | frozenset(("\ufe0f",))
)
_ALLOWED_RAW_PRE_NFC_SET_SLASH = _ALLOWED_RAW_PRE_NFC_SET | frozenset("/")

_INTERNAL_SENTENCE_RE = re.compile(r"[.!?]\s*[" + _VI_LOWER_LETTERS + r"0-9]")
_DECIMAL_DOT_RE = re.compile(r"(?<=\d)\.(?=\d)")


def _mask_decimal_dots(text: str) -> str:
    """Thay dấu chấm thập phân giữa 2 chữ số (vd '1.6m', '50.5kg') bằng '_' khi kiểm tra tách câu."""
    return _DECIMAL_DOT_RE.sub("_", text)

# Các từ không bao giờ là tên màu hợp lệ trong nhóm `color_named`
_INVALID_COLOR_TOKENS_VI = frozenset((
    "gì", "nào", "j", "khác", "này", "đó", "đấy", "đây", "ấy", "kia", "size", "sz", "cỡ", "sai", "giá", "gía",
    "ship", "giao", "phí", "mặc", "đẹp", "xinh", "nóng", "mát", "tôn", "hợp", "vải", "chất",
    "số", "ảnh", "hình", "mẫu", "bộ", "váy", "đầm", "áo", "quần", "cái", "set", "chiếc",
    "shop", "ad", "em", "chị", "mình", "bạn", "còn", "có", "không", "ko", "k", "và", "hay",
    "hoặc", "với", "bị", "được", "mới", "cũ", "nữa", "thêm", "như", "trên", "ngoài", "lắm",
    "quá", "rồi", "chưa", "đâu", "nhưng", "mà", "thì", "là", "của", "về", "đi", "tới", "đến",
    "làm", "bán", "mua", "đặt", "chốt", "lấy", "đổi", "trả", "sale", "giảm", "tốt", "rẻ", "cao",
    "chật", "rộng", "dài", "ngắn", "mấy", "bao", "nhiêu", "tiền",
))
_INVALID_COLOR_TOKENS_ASCII = frozenset((
    "gi", "nao", "j", "khac", "nay", "do", "day", "ay", "kia", "size", "sz", "sai", "gia",
    "ship", "giao", "phi", "mac", "dep", "xinh", "nong", "mat", "ton", "hop", "vai", "chat",
    "so", "anh", "hinh", "mau", "bo", "vay", "ao", "quan", "cai", "set", "chiec",
    "shop", "ad", "em", "chi", "minh", "ban", "con", "khong", "ko", "k", "va", "hay",
    "hoac", "voi", "bi", "duoc", "dc", "moi", "cu", "nua", "them", "nhu", "tren", "ngoai",
    "lam", "qua", "roi", "chua", "dau", "ma", "thi", "cua", "ve", "di", "toi",
    "mua", "dat", "chot", "lay", "doi", "tra", "sale", "giam", "tot", "re", "cao",
    "rong", "dai", "ngan", "may", "bao", "nhieu", "tien",
))

# Lớp bảo vệ bổ sung: URL guard & Prompt injection
_WORD_TOKEN_RE = re.compile(r"[^\W_]+")
_COLLAPSE_1_RE = re.compile(r"(.)\1+")
_INTERNAL_SEP_RE = re.compile(r"(?<=[^\W_])[.\-_*+/|~•·'`]+(?=[^\W_])")
_INLINE_SYMBOL_LEET_RE = re.compile(
    r"(?<=[^\W_])([!|@$])(?=[^\W_])|(?<!\w)([@$])(?=[a-zA-Z])"
)
_LETTER_RE = re.compile(r"[a-z]")
_NUM_UNIT_RE = re.compile(r"^\d+(?:k|d|tr|m|cm|mm|kg|g|ml|l|xl|xxl|vnd)$")
_LEET_TABLE = str.maketrans({
    "@": "a",
    "4": "a",
    "3": "e",
    "1": "i",
    "!": "i",
    "|": "i",
    "0": "o",
    "$": "s",
    "5": "s",
    "7": "t",
})

_DATE_RE = re.compile(
    r"(?<![A-Za-z0-9])(?:"
    r"(?:0?[1-9]|[12]\d|3[01])([./\-])(?:0?[1-9]|1[0-2])\1(?:19|20)\d{2}"
    r"|(?:19|20)\d{2}([./\-])(?:0?[1-9]|1[0-2])\2(?:0?[1-9]|[12]\d|3[01])"
    r")(?![A-Za-z0-9])"
)
_ANY_TLD_PATH_RE = re.compile(
    r"(?i)(?<![\w@._/-])"
    r"[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*"
    r"\.[a-z]{2,24}/[^\s<>\"'()\[\]{}]+"
)
_ANY_TLD_DOMAIN_RE = re.compile(
    r"(?i)(?<![\w@._/-])"
    r"([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*)"
    r"\.([a-z]{2,24})(?![\w./-])"
)
_NON_DOMAIN_UNIT_TLDS = frozenset(("kg", "cm", "mm", "ml", "mg", "gr", "tr"))

_INJECTION_STRUCT_RE = re.compile(
    r"(?i)(?:^|[\s\n#>*`-])(?:system|assistant|developer|user|instructions?)\s*:"
    r"|\[\s*/?\s*inst\s*\]"
    r"|<\s*\|\s*(?:system|im_start|im_end|assistant|user|endoftext)\s*\|\s*>"
    r"|<<\s*/?\s*sys\s*>>"
    r"|\bfrom\s+now\s+on\b"
    r"|\b(?:override|bypass|disable|ignore|forget|disregard)\b.{0,32}"
    r"\b(?:everything|all|above|prior|rule|rules|instruction|instructions|guideline|guidelines|policy|policies|prompt|guard|filter|safety)\b"
    r"|(?:quên|quen|bỏ\s+qua|bo\s+qua|phớt\s+lờ|phot\s+lo)\s+(?:đi\s+|di\s+)?(?:hết|het|mọi|moi|tất\s+cả|tat\s+ca)"
)

_RULE_CACHE: dict[str, Any] = {"path": None, "mtime": None, "compiled": None}


def init_auto_reply() -> None:
    """Đảm bảo các bảng tự động trả lời và nhãn 'Cần bạn' đã sẵn sàng (idempotent)."""
    store.init()


def _now() -> datetime:
    import vpost_api
    return vpost_api.now()


def _dt_utc(value) -> datetime:
    parsed = facebook.parse_time(value)
    return parsed if parsed is not None else _EPOCH_UTC


def _comment_sort_key(c: dict) -> tuple[datetime, int, str]:
    is_child = 1 if (c.get("parent_id") or "").strip() else 0
    return (_dt_utc(c.get("created_time")), is_child, str(c.get("id") or ""))


def _recent_customer_texts(
    tenant_id: str,
    page_id: str,
    from_id: str,
    fb_post_id: str,
    ref_dt: datetime,
) -> list[str]:
    """Lấy bình luận gần đây trong 24h của CÙNG khách trên cùng bài đăng để bắt spam lặp mà không phạt nhầm khách hỏi nhiều mẫu."""
    if not page_id or not from_id:
        return []
    lo = ref_dt - timedelta(hours=24)
    hi = ref_dt + timedelta(hours=1)
    rows = store.list_fb_comments(tenant_id)
    out: list[str] = []
    for r in rows:
        if str(r.get("page_id") or "") != str(page_id):
            continue
        if str(r.get("from_id") or "") != str(from_id):
            continue
        if fb_post_id and str(r.get("fb_post_id") or "") != str(fb_post_id):
            continue
        if r.get("status") == "deleted":
            continue
        cdt = facebook.parse_time(r.get("created_time"))
        if cdt is None or (lo <= cdt <= hi):
            out.append(str(r.get("message") or ""))
    return out


def _normalize_for_spam(text: str) -> str:
    """Chuẩn hoá văn bản để nhận diện spam lặp nội dung (kể cả ký tự vô hình / homoglyph / dấu câu thừa)."""
    cleaned = _fold_homoglyphs(_strip_invisible(unicodedata.normalize("NFKC", str(text or ""))))
    return moderation.normalize_text(cleaned)


def _recent_post_texts(
    tenant_id: str,
    page_id: str,
    fb_post_id: str,
    ref_dt: datetime,
    *,
    window_minutes: int = DEFAULT_POST_SPAM_WINDOW_MINUTES,
) -> list[str]:
    """Lấy bình luận khách trên cùng bài đăng trong cửa sổ `window_minutes` phút (không phân biệt tác giả)."""
    if not page_id or not fb_post_id:
        return []
    lo = ref_dt - timedelta(minutes=window_minutes)
    hi = ref_dt + timedelta(minutes=2)
    rows = store.list_post_customer_comments(tenant_id, page_id, fb_post_id)
    out: list[str] = []
    for r in rows:
        cdt = facebook.parse_time(r.get("created_time"))
        if cdt is None or (lo <= cdt <= hi):
            out.append(str(r.get("message") or ""))
    return out


def _count_post_identical_texts(message: str, post_texts: Iterable[str]) -> int:
    norm_self = _normalize_for_spam(message)
    if not norm_self:
        return 0
    return sum(1 for item in post_texts if _normalize_for_spam(item) == norm_self)


def _now_z() -> str:
    return schedule.iso_z(_now())


def _local_day_start(dt: datetime) -> datetime:
    aware = dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    local_start = aware.astimezone(schedule.TZ).replace(hour=0, minute=0, second=0, microsecond=0)
    return local_start.astimezone(timezone.utc)


def is_kill_switch_enabled() -> bool:
    """True nếu biến môi trường VPOST_AUTO_REPLY_DISABLED được bật (1/true/yes/on)."""
    raw = (os.environ.get("VPOST_AUTO_REPLY_DISABLED") or "").strip().lower()
    return raw in ("1", "true", "yes", "on")


# ---------------- Normalization & Unicode helpers ----------------

def _is_variation_selector(cp: int) -> bool:
    return (0xFE00 <= cp <= 0xFE0F) or (0xE0100 <= cp <= 0xE01EF)


def _decode_unicode_tags(text: str) -> str:
    """Giải mã các ký tự Unicode Tag (U+E0020–U+E007E) về ASCII để phát hiện chèn lệnh ẩn trong detector."""
    out: list[str] = []
    for ch in str(text or ""):
        cp = ord(ch)
        if 0xE0020 <= cp <= 0xE007E:
            out.append(chr(cp - 0xE0000))
        else:
            out.append(ch)
    return "".join(out)


def _strip_invisible(text: str) -> str:
    """Loại bỏ toàn bộ ký tự định dạng/vô hình/đệm (Cf, U+3164, U+2800, zero-width, variation selectors)."""
    out: list[str] = []
    for ch in str(text or ""):
        if ch in _INVISIBLE_EXTRA:
            continue
        cp = ord(ch)
        if _is_variation_selector(cp):
            continue
        if unicodedata.category(ch) == "Cf":
            continue
        out.append(ch)
    return "".join(out)


def _fold_homoglyphs(text: str) -> str:
    """Quy đổi các ký tự Cyrillic / Greek / lookalike phổ biến về ASCII."""
    return str(text or "").translate(_HOMOGLYPH_TABLE)


def _strip_diacritics(text: str) -> str:
    s = unicodedata.normalize("NFD", str(text or "").replace("đ", "d").replace("Đ", "D"))
    return "".join(c for c in s if unicodedata.category(c) != "Mn")


def _fold_exact(text: str) -> str:
    """Chuẩn hoá không phân biệt hoa/thường và dấu tiếng Việt để so khớp bằng chính xác (không substring)."""
    s = _fold_homoglyphs(_strip_invisible(unicodedata.normalize("NFKC", str(text or ""))))
    s = _strip_diacritics(s).lower()
    return re.sub(r"\s+", " ", s).strip()


def _has_diacritics(text: str) -> bool:
    return any(ord(c) > 127 for c in text)


def _fold_hoi_nga(token: str) -> str:
    nfd = unicodedata.normalize("NFD", token.lower())
    return unicodedata.normalize("NFC", nfd.replace("\u0309", "\u0303"))


def normalize_text(text: str, *, allow_slash: bool = False) -> dict:
    """Kiểm tra tập ký tự allowlist trực tiếp trên NFC(văn bản gốc) rồi chuẩn hoá chữ thường/khoảng trắng (R2, R4).

    KHÔNG dùng NFKC, KHÔNG bỏ ký tự vô hình/Bidi/Unicode Tag và KHÔNG quy đổi homoglyph trước khi kiểm tra
    `charset_ok`, để mọi ký tự giả mạo/điều hướng/vô hình/emoji ngoài danh sách lành tính bị từ chối ngay.
    Chỉ chấp nhận:
    - Chữ cái tiếng Việt NFC (thường/hoa), chữ số ASCII 0-9
    - Dấu câu cơ bản ` .,?!-` (và `/` chỉ khi `allow_slash=True` cho phân tích số đo sau bước chặn URL)
    - Emoji trong danh sách `_BENIGN_TRAILING_EMOJIS` (kèm tối đa 1 `U+FE0F` ngay sau chính emoji đó)
    """
    raw = str(text or "")
    has_newline = any(ch in _NEWLINE_OR_BREAK_CHARS for ch in raw)
    raw_stripped = raw.strip(" ")
    pre_nfc_allowed = _ALLOWED_RAW_PRE_NFC_SET_SLASH if allow_slash else _ALLOWED_RAW_PRE_NFC_SET
    punct_allowed = _ALLOWED_BASIC_PUNCT_SLASH if allow_slash else _ALLOWED_BASIC_PUNCT
    # Chặn cả ký tự phân rã đơn nhất chuẩn tắc Unicode (vd Kelvin K U+212A → K khi qua NFC) trước khi gọi NFC
    if any(ch not in pre_nfc_allowed for ch in raw_stripped):
        return {
            "raw": raw,
            "raw_stripped": raw_stripped,
            "normalized": "",
            "ascii": "",
            "has_newline": has_newline,
            "charset_ok": False,
        }
    raw_nfc = unicodedata.normalize("NFC", raw_stripped)

    charset_ok = True
    cleaned_chars: list[str] = []
    prev_ch = ""
    for ch in raw_nfc:
        if ch == "\ufe0f":
            if prev_ch in _BENIGN_TRAILING_EMOJIS:
                prev_ch = ""
                continue
            charset_ok = False
            break
        if ch in _ALLOWED_CASE_LETTER_DIGIT_SET:
            cleaned_chars.append(ch.lower())
            prev_ch = ch
            continue
        if ch in punct_allowed or ch in _BENIGN_TRAILING_EMOJIS:
            cleaned_chars.append(ch)
            prev_ch = ch
            continue
        charset_ok = False
        break

    if charset_ok:
        normalized = re.sub(r" +", " ", "".join(cleaned_chars)).strip()
        ascii_copy = _strip_diacritics(normalized)
    else:
        normalized = ""
        ascii_copy = ""

    return {
        "raw": raw,
        "raw_stripped": raw_stripped,
        "normalized": normalized,
        "ascii": ascii_copy,
        "has_newline": has_newline,
        "charset_ok": charset_ok,
    }


def _tokenize_aligned(text: str) -> tuple[list[str], list[str]]:
    clean = unicodedata.normalize("NFC", _fold_homoglyphs(_strip_invisible(unicodedata.normalize("NFKC", text))).lower())
    orig = _WORD_TOKEN_RE.findall(clean)
    norm = [_strip_diacritics(t) for t in orig]
    return orig, norm


def _apply_inline_symbol_leet(text: str) -> str:
    def _rep(m):
        ch = m.group(1) or m.group(2)
        return ch.translate(_LEET_TABLE)

    return _INLINE_SYMBOL_LEET_RE.sub(_rep, text)


def _leet_token(token: str) -> str:
    if _NUM_UNIT_RE.match(token):
        return token
    if _LETTER_RE.search(token):
        return token.translate(_LEET_TABLE)
    return token


def _collapse_single_char_runs(tokens: list[str]) -> list[str]:
    out: list[str] = []
    buf: list[str] = []

    def _flush():
        if not buf:
            return
        if len(buf) >= 2 and any(not ch.isdigit() for ch in buf):
            out.append("".join(buf))
        else:
            out.extend(buf)
        buf.clear()

    for tok in tokens:
        if len(tok) == 1:
            buf.append(tok)
        else:
            _flush()
            out.append(tok)
    _flush()
    return out


def _compile_guarded_phrases(phrases: Iterable[str]) -> list[tuple[str, tuple[str, ...], tuple[str, ...]]]:
    compiled = []
    for raw in phrases or ():
        label = str(raw or "").strip()
        if not label:
            continue
        orig, norm = _tokenize_aligned(label)
        if norm:
            compiled.append((label, tuple(orig), tuple(norm)))
    return compiled


def _match_guarded(
    orig_tokens: list[str],
    norm_tokens: list[str],
    p_orig: tuple[str, ...],
    p_norm: tuple[str, ...],
) -> bool:
    n = len(p_norm)
    if n == 0 or n > len(norm_tokens):
        return False
    first = p_norm[0]
    for i in range(len(norm_tokens) - n + 1):
        if norm_tokens[i] != first or tuple(norm_tokens[i:i + n]) != p_norm:
            continue
        conflict = False
        for j in range(n):
            ot = orig_tokens[i + j]
            pt = p_orig[j]
            if _has_diacritics(ot) and _has_diacritics(pt):
                if _fold_hoi_nga(ot) != _fold_hoi_nga(pt):
                    conflict = True
                    break
        if not conflict:
            return True
    return False


def _match_exact(orig_tokens: list[str], pattern: tuple[str, ...]) -> bool:
    n = len(pattern)
    if n == 0 or n > len(orig_tokens):
        return False
    first = pattern[0]
    for i in range(len(orig_tokens) - n + 1):
        if orig_tokens[i] == first and tuple(orig_tokens[i:i + n]) == pattern:
            return True
    return False


# ---------------- Rules loading & compilation ----------------

def load_rules(path: Optional[str] = None) -> dict:
    """Đọc file JSON luật tự động trả lời (mặc định data/auto_reply_rules.json)."""
    target = path or DEFAULT_RULES_PATH
    with open(target, encoding="utf-8") as f:
        raw = json.load(f)
    if not isinstance(raw, dict):
        raise ValueError("file luật tự động trả lời phải là JSON object")
    return raw


def _normalize_polite_list(items: Iterable[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for x in items or ():
        s = re.sub(r"\s+", " ", unicodedata.normalize("NFC", str(x or "").strip().lower()))
        if s and s not in seen:
            seen.add(s)
            out.append(s)
    out.sort(key=len, reverse=True)
    return out


def _compile_rules(raw: dict) -> dict:
    pl = raw.get("polite_leading") if isinstance(raw.get("polite_leading"), dict) else {}
    pt = raw.get("polite_trailing") if isinstance(raw.get("polite_trailing"), dict) else {}

    compiled_allow: list[dict] = []
    for entry in raw.get("allow") or ():
        if not isinstance(entry, dict):
            continue
        intents = [i for i in (entry.get("intents") or ()) if i in _VALID_INTENT_SET]
        if not intents:
            continue
        vi_pat = str(entry.get("vi") or "").strip()
        ascii_pat = str(entry.get("ascii") or "").strip()
        if not vi_pat and not ascii_pat:
            continue
        compiled_allow.append({
            "id": str(entry.get("id") or "allow"),
            "intents": tuple(intents),
            "vi_re": re.compile(vi_pat) if vi_pat else None,
            "ascii_re": re.compile(ascii_pat) if ascii_pat else None,
            "forbid_trailing": frozenset(_normalize_polite_list(entry.get("forbid_trailing") or ())),
        })

    cooldown_minutes = int(raw.get("cooldown_minutes") or DEFAULT_COOLDOWN_MINUTES)
    return {
        "max_chars": int(raw.get("max_chars") or DEFAULT_MAX_CHARS),
        "max_allow_chars": int(raw.get("max_allow_chars") or DEFAULT_MAX_ALLOW_CHARS),
        "cooldown_minutes": cooldown_minutes,
        "post_rate_limit": int(raw.get("post_rate_limit") or DEFAULT_POST_RATE_LIMIT),
        "post_rate_window_minutes": int(raw.get("post_rate_window_minutes") or DEFAULT_POST_RATE_WINDOW_MINUTES),
        "post_spam_threshold": int(raw.get("post_spam_threshold") or DEFAULT_POST_SPAM_THRESHOLD),
        "post_spam_window_minutes": int(raw.get("post_spam_window_minutes") or DEFAULT_POST_SPAM_WINDOW_MINUTES),
        "injection": _compile_guarded_phrases(raw.get("injection_markers") or ()),
        "polite_leading_vi": _normalize_polite_list(pl.get("vi") or ()),
        "polite_leading_ascii": _normalize_polite_list(pl.get("ascii") or ()),
        "polite_trailing_vi": _normalize_polite_list(pt.get("vi") or ()),
        "polite_trailing_ascii": _normalize_polite_list(pt.get("ascii") or ()),
        "allow": compiled_allow,
    }


def _get_compiled_rules(rules_cfg: Optional[dict] = None) -> dict:
    if rules_cfg is not None:
        return _compile_rules(rules_cfg)
    path = DEFAULT_RULES_PATH
    try:
        mtime = os.path.getmtime(path)
    except OSError:
        mtime = None
    if _RULE_CACHE["path"] == path and _RULE_CACHE["mtime"] == mtime and _RULE_CACHE["compiled"] is not None:
        return _RULE_CACHE["compiled"]
    compiled = _compile_rules(load_rules(path))
    _RULE_CACHE["path"] = path
    _RULE_CACHE["mtime"] = mtime
    _RULE_CACHE["compiled"] = compiled
    return compiled


# ---------------- Step 1 extra safety layer: URL guard & Prompt injection ----------------

def has_url(text: str) -> bool:
    """True nếu bình luận chứa đường dẫn (http/www hoặc tên miền trần / có đường dẫn, kể cả homoglyph & dấu chấm lạ)."""
    raw = _fold_homoglyphs(_strip_invisible(unicodedata.normalize("NFKC", str(text or ""))))
    raw = raw.replace("\u3002", ".").replace("\uff61", ".").replace("\u2024", ".").replace("\ufe52", ".")
    if not raw.strip():
        return False
    if rules.find_urls(raw) or moderation._extract_urls(raw):
        return True
    masked = rules._mask_spans(
        raw,
        rules._merge_spans(
            rules.find_emails(raw) + [(m.start(), m.end()) for m in _DATE_RE.finditer(raw)]
        ),
    )
    if _ANY_TLD_PATH_RE.search(masked):
        return True
    for m in _ANY_TLD_DOMAIN_RE.finditer(masked):
        host, tld = m.group(1), m.group(2).lower()
        if "." not in host and host.isdigit() and tld in _NON_DOMAIN_UNIT_TLDS:
            continue
        return True
    return False


def has_prompt_injection(text: str, *, rules_cfg: Optional[dict] = None) -> bool:
    """True nếu văn bản chứa dấu hiệu chèn lệnh / yêu cầu nhập vai / lộ prompt hệ thống (kể cả homoglyph/vô hình/Unicode Tag/leet)."""
    raw_src = str(text or "")
    tag_decoded = _decode_unicode_tags(raw_src)
    candidates_raw = [raw_src] if tag_decoded == raw_src else [raw_src, tag_decoded]
    compiled = _get_compiled_rules(rules_cfg)
    markers = compiled["injection"]

    for src in candidates_raw:
        raw = _fold_homoglyphs(_strip_invisible(unicodedata.normalize("NFKC", src)))
        if not raw.strip():
            continue
        if rules.INJECTION.search(raw) or _INJECTION_STRUCT_RE.search(raw):
            return True

        sep_removed = _INTERNAL_SEP_RE.sub("", raw)
        leet_raw = _strip_diacritics(_apply_inline_symbol_leet(raw)).lower()
        leet_sep = _strip_diacritics(_apply_inline_symbol_leet(sep_removed)).lower()

        leet_words_str = " ".join(_leet_token(t) for t in re.findall(r"[^\s]+", leet_raw))
        if _INJECTION_STRUCT_RE.search(leet_words_str) or rules.INJECTION.search(leet_words_str):
            return True

        aligned_views: list[tuple[list[str], list[str]]] = []
        for candidate in (raw, sep_removed):
            orig, norm = _tokenize_aligned(candidate)
            if not orig:
                continue
            aligned_views.append((orig, norm))
            collapsed_norm = [_COLLAPSE_1_RE.sub(r"\1", t) for t in norm]
            aligned_views.append((orig, collapsed_norm))

        ascii_views: list[list[str]] = []
        for candidate in (leet_raw, leet_sep):
            toks = _WORD_TOKEN_RE.findall(candidate)
            if not toks:
                continue
            leet_toks = [_leet_token(t) for t in toks]
            ascii_views.append(leet_toks)
            ascii_views.append([_COLLAPSE_1_RE.sub(r"\1", t) for t in leet_toks])
            joined_runs = _collapse_single_char_runs(leet_toks)
            if joined_runs != leet_toks:
                ascii_views.append(joined_runs)
                ascii_views.append([_COLLAPSE_1_RE.sub(r"\1", t) for t in joined_runs])

        for orig, norm in aligned_views:
            for _, p_orig, p_norm in markers:
                if _match_guarded(orig, norm, p_orig, p_norm):
                    return True
                p_col = tuple(_COLLAPSE_1_RE.sub(r"\1", t) for t in p_norm)
                if _match_guarded(orig, norm, p_orig, p_col):
                    return True

        for toks in ascii_views:
            for _, _, p_norm in markers:
                p_col = tuple(_COLLAPSE_1_RE.sub(r"\1", t) for t in p_norm)
                if _match_exact(toks, p_norm) or _match_exact(toks, p_col):
                    return True

        squashed_views = {"".join(toks) for toks in ascii_views if toks}
        for _, _, p_norm in markers:
            sq = "".join(p_norm)
            if len(sq) >= 6 and any(sq in sv for sv in squashed_views):
                return True
        for toks in ascii_views:
            for _, _, p_norm in markers:
                if len(p_norm) >= 2:
                    sq = "".join(p_norm)
                    if len(sq) >= 5 and sq in toks:
                        return True
    return False


# ---------------- Step 2: Allowlist intent matching ----------------

def _strip_trailing_punct_emoji(text: str, *, max_count: int = 2) -> str:
    """Bỏ tối đa `max_count` dấu câu kết thúc (?, !, .) hoặc emoji thuộc danh sách lành tính ở CUỐI câu."""
    s = text.rstrip()
    removed = 0
    while s and removed < max_count:
        ch = s[-1]
        if ch in _TRAILING_PUNCT or ch in _BENIGN_TRAILING_EMOJIS:
            s = s[:-1].rstrip()
            removed += 1
        else:
            break
    return s


def _strip_polite_leading(text: str, compiled: dict) -> str:
    """Bỏ các lời chào / mở đầu lịch sự ở đầu câu (vd 'shop ơi,', 'ad ơi', 'cho em hỏi')."""
    s = text.strip()
    for _ in range(3):
        if not s:
            break
        phrases = compiled["polite_leading_vi"] if _has_diacritics(s) else compiled["polite_leading_ascii"]
        matched = False
        for p in phrases:
            if s == p:
                return ""
            if s.startswith(p):
                rest = s[len(p):]
                if rest and rest[0] in (" ", ","):
                    s = rest.lstrip(" ,")
                    matched = True
                    break
        if not matched:
            break
    return s


def _strip_polite_trailing_tokens(text: str, compiled: dict) -> tuple[str, list[str]]:
    """Bỏ các từ đệm lịch sự / gọi shop ở cuối câu và trả về `(phần_còn_lại, danh_sách_từ_đã_bỏ)`."""
    s = text.strip()
    removed: list[str] = []
    for _ in range(4):
        if not s:
            break
        phrases = compiled["polite_trailing_vi"] if _has_diacritics(s) else compiled["polite_trailing_ascii"]
        matched = False
        for p in phrases:
            if s == p:
                removed.append(p)
                return "", removed
            if s.endswith(p):
                head = s[:-len(p)]
                if head and head[-1] in (" ", ","):
                    s = head.rstrip(" ,")
                    removed.append(p)
                    matched = True
                    break
        if not matched:
            break
    return s, removed


def _strip_polite_trailing(text: str, compiled: dict) -> str:
    """Bỏ các từ đệm lịch sự / gọi shop ở cuối câu (vd 'ạ', 'vậy', 'thế', 'nhé', 'ơi', 'shop ơi')."""
    core, _ = _strip_polite_trailing_tokens(text, compiled)
    return core


def _is_invalid_color_capture(color_text: str, *, is_ascii_only: bool) -> bool:
    tokens = color_text.split()
    if not tokens or len(tokens) > 4:
        return True
    invalid_set = _INVALID_COLOR_TOKENS_ASCII if is_ascii_only else _INVALID_COLOR_TOKENS_VI
    return any(tok in invalid_set for tok in tokens)


# ---------------- Quantity ("lấy 2 bộ giá bao nhiêu", "size M còn 2 cái không") ----------------

MAX_AUTO_QTY = 10  # above this the customer is buying in bulk — a human quotes wholesale

_QTY_WORDS = {
    "một": 1, "mot": 1, "hai": 2, "ba": 3, "bốn": 4, "bon": 4, "tư": 4, "năm": 5,
    "sáu": 6, "sau": 6, "bảy": 7, "bay": 7, "tám": 8, "tam": 8, "chín": 9, "chin": 9,
    "mười": 10, "muoi": 10,
}
_QTY_NUM = r"(?P<q>\d{1,3}|%s)" % "|".join(sorted(_QTY_WORDS, key=len, reverse=True))
_QTY_UNIT = r"(?P<u>cái|cai|bộ|bo|chiếc|chiec|set|váy|vay|đầm|dam|sp|sản\s+phẩm|san\s+pham|món|mon)"
_QTY_BUYER = r"(?:(?:em|e|mình|minh|chị|chi|c|tôi|toi|t|tớ|to)\s+)?"
_QTY_VERB = r"(?:lấy|lay|mua|đặt|dat|order|ship|chốt|chot)"
_QTY_LINK = r"(?:\s+(?:thì|thi|là|la))?"
_QTY_PREFIX_RES = [
    re.compile(r"^%s%s\s+%s\s+%s%s\s+" % (_QTY_BUYER, _QTY_VERB, _QTY_NUM, _QTY_UNIT, _QTY_LINK)),
    re.compile(r"^%s\s+%s%s\s+" % (_QTY_NUM, _QTY_UNIT, _QTY_LINK)),
]
# "giá 2 cái bao nhiêu" -> "giá bao nhiêu"
_QTY_MID_PRICE_RE = re.compile(r"^(?P<g>giá|gía|gia)\s+%s\s+%s(?:\s+(?:thì|thi|là|la))?\s+" % (_QTY_NUM, _QTY_UNIT))
_QTY_SUFFIX_RE = re.compile(r"\s+(?:cho|lấy|lay|mua|đặt|dat)\s+%s\s+%s$" % (_QTY_NUM, _QTY_UNIT))
# "size M còn 2 cái không" -> "size M còn không"
_QTY_AVAIL_RE = re.compile(r"\s+(?P<v>còn|con|có|co)\s+%s\s+%s\s+(?P<neg>không|ko|k)$" % (_QTY_NUM, _QTY_UNIT))


def _qty_value(raw: str) -> Optional[int]:
    raw = raw.strip()
    if raw.isdigit():
        return int(raw)
    return _QTY_WORDS.get(raw)


def _unit_label(raw: str) -> str:
    u = re.sub(r"\s+", " ", raw.strip())
    folded = _strip_diacritics(u)
    return {"cai": "cái", "bo": "bộ", "chiec": "chiếc", "vay": "váy", "dam": "đầm",
            "san pham": "sản phẩm", "sp": "sản phẩm", "mon": "món", "set": "set"}.get(folded, u)


def extract_quantity(core: str) -> tuple[Optional[int], Optional[str], str]:
    """Tách cụm số lượng khỏi câu hỏi; trả (số lượng, đơn vị, phần câu còn lại để đối chiếu allowlist).

    Không có cụm số lượng → (None, None, core) giữ nguyên câu.
    """
    for rx in _QTY_PREFIX_RES:
        m = rx.match(core)
        if m:
            q = _qty_value(m.group("q"))
            if q:
                return q, _unit_label(m.group("u")), core[m.end():].strip()
    m = _QTY_MID_PRICE_RE.match(core)
    if m:
        q = _qty_value(m.group("q"))
        if q:
            return q, _unit_label(m.group("u")), ("%s %s" % (m.group("g"), core[m.end():])).strip()
    m = _QTY_SUFFIX_RE.search(core)
    if m:
        q = _qty_value(m.group("q"))
        if q:
            return q, _unit_label(m.group("u")), core[: m.start()].strip()
    m = _QTY_AVAIL_RE.search(core)
    if m:
        q = _qty_value(m.group("q"))
        if q:
            rest = "%s %s %s" % (core[: m.start()].strip(), m.group("v"), m.group("neg"))
            return q, _unit_label(m.group("u")), rest.strip()
    return None, None, core


def available_quantity(stock: dict, *, asked_size: Optional[str], asked_color: Optional[str]) -> Optional[int]:
    """Tổng tồn kho khớp size/màu khách hỏi (bỏ trống = mọi size/màu); None khi không có dữ liệu tồn theo biến thể."""
    variants = stock.get("variants") or []
    if not variants:
        return None
    size_canon = _canonical_size(asked_size) if asked_size else None
    color_fold = _fold_exact(asked_color) if asked_color else None
    total = 0
    for v in variants:
        if size_canon and _canonical_size(str(v.get("size") or "")) != size_canon:
            continue
        if color_fold and _fold_exact(str(v.get("mau") or "")) != color_fold:
            continue
        try:
            total += max(0, int(v.get("ton") or 0))
        except (TypeError, ValueError):
            continue
    return total


# ---------------- Size advice: Measurement parsing, deterministic recommendation, templates ----------------

_VI_WORD_CLASS = _VI_LOWER_LETTERS + "0123456789"
_WB_L = r"(?<![" + _VI_WORD_CLASS + r"])"
_WB_R = r"(?![" + _VI_WORD_CLASS + r"])"

_WEIGHT_UNIT_RE = re.compile(
    _WB_L
    + r"(?:(?:cân\s+nặng|can\s+nang|nặng|nang)\s+)?"
    + r"(?P<w>\d{1,4}(?:[.,]\d)?)\s*(?:kg|ký|kí|ki|ky|cân|can)"
    + _WB_R
)
_HEIGHT_DEC_METER_RE = re.compile(
    _WB_L
    + r"(?:(?:chiều\s+cao|chieu\s+cao|cao)\s+)?"
    + r"(?P<m>\d{1,2})[.,](?P<frac>\d{1,2})\s*(?:m|mét|met)"
    + _WB_R
)
_HEIGHT_METER_SHORT_RE = re.compile(
    _WB_L
    + r"(?:(?:chiều\s+cao|chieu\s+cao|cao)\s+)?"
    + r"(?P<m>\d{1,2})\s*(?:m|mét|met)"
    + r"(?:\s*(?P<cm>\d{1,2})(?!\s*(?:kg|ký|kí|ki|ky|cân|can|cm|mm)))?"
    + r"(?!\s*cm)"
    + _WB_R
)
_HEIGHT_CM_RE = re.compile(
    _WB_L
    + r"(?:(?:chiều\s+cao|chieu\s+cao|cao)\s+)?"
    + r"(?P<cm>\d{1,4}(?:[.,]\d)?)\s*cm"
    + _WB_R
)
_HEIGHT_LABELLED_RE = re.compile(
    _WB_L
    + r"(?:chiều\s+cao|chieu\s+cao|cao)\s+(?P<val>\d{1,4}(?:[.,]\d{1,2})?)"
    + _WB_R
)
_WEIGHT_LABELLED_RE = re.compile(
    _WB_L
    + r"(?:cân\s+nặng|can\s+nang|nặng|nang)\s+(?P<w>\d{1,4}(?:[.,]\d)?)"
    + _WB_R
)
_BARE_NUM_RE = re.compile(_WB_L + r"(?P<num>\d{1,4}(?:[.,]\d{1,2})?)" + _WB_R)

_ITEM_REF_PREFIX_VI_RE = re.compile(r"^(?:(?:mẫu|bộ|váy|đầm|cái|set|chiếc)\s+này)(?:\s+|,\s*)")
_ITEM_REF_PREFIX_ASCII_RE = re.compile(r"^(?:(?:mau|bo|vay|dam|cai|set|chiec)\s+nay)(?:\s+|,\s*)")
_THI_PREFIX_RE = re.compile(r"^(?:thì|thi)\s+")

_FOLLOWUP_POLITE_PHRASES_VI = tuple(sorted((
    "cảm ơn shop nhiều",
    "cảm ơn shop",
    "cảm ơn ạ",
    "cảm ơn",
    "tư vấn giúp em",
    "tư vấn giúp e",
    "tư vấn giúp mình",
    "tư vấn giúp chị",
    "tư vấn giúp",
    "tư vấn size",
    "tư vấn",
    "giúp em ạ",
    "giúp e ạ",
    "giúp mình ạ",
    "giúp chị ạ",
    "giúp em",
    "giúp e",
    "giúp mình",
    "giúp chị",
    "dạ shop ơi",
    "dạ ad ơi",
    "dạ shop",
    "dạ ad",
    "chào shop",
    "shop ơi",
    "ad ơi",
    "chị ơi",
    "em ơi",
    "bạn ơi",
    "nhé ạ",
    "nha ạ",
    "với ạ",
    "em với",
    "e với",
    "mình với",
), key=len, reverse=True))

_FOLLOWUP_POLITE_PHRASES_ASCII = tuple(sorted((
    "cam on shop nhieu",
    "cam on shop",
    "cam on a",
    "cam on",
    "tu van giup em",
    "tu van giup e",
    "tu van giup minh",
    "tu van giup chi",
    "tu van giup",
    "tu van size",
    "tu van",
    "giup em a",
    "giup e a",
    "giup minh a",
    "giup chi a",
    "giup em",
    "giup e",
    "giup minh",
    "giup chi",
    "da shop oi",
    "da ad oi",
    "da shop",
    "da ad",
    "chao shop",
    "shop oi",
    "ad oi",
    "chi oi",
    "em oi",
    "ban oi",
    "nhe a",
    "nha a",
    "voi a",
    "em voi",
    "e voi",
    "minh voi",
), key=len, reverse=True))

_FOLLOWUP_POLITE_TOKENS_VI = frozenset((
    "dạ", "vâng", "em", "e", "chị", "c", "mình", "mk", "tớ", "tôi",
    "shop", "ad", "ạ", "nhé", "nha", "ơi", "với", "và", "là", "nhờ", "giúp",
))
_FOLLOWUP_POLITE_TOKENS_ASCII = frozenset((
    "da", "vang", "em", "e", "chi", "c", "minh", "mk", "to", "toi",
    "shop", "ad", "a", "nhe", "nha", "oi", "voi", "va", "la", "nho", "giup",
))


def _clean_measure_num(val: float) -> int | float:
    f = float(val)
    return int(round(f)) if abs(f - round(f)) < 1e-9 else round(f, 1)


def _fmt_height(height_cm: float) -> str:
    n = _clean_measure_num(height_cm)
    if isinstance(n, int) and 100 <= n < 300:
        return "%dm%02d" % (n // 100, n % 100)
    return "%gcm" % n


def _fmt_weight(weight_kg: float) -> str:
    n = _clean_measure_num(weight_kg)
    if isinstance(n, int):
        return "%dkg" % n
    return ("%gkg" % n).replace(".", ",")


def _fmt_measurement_summary(height_cm: Optional[float], weight_kg: Optional[float]) -> str:
    parts: list[str] = []
    if height_cm is not None:
        parts.append("chiều cao %s" % _fmt_height(height_cm))
    if weight_kg is not None:
        parts.append("cân nặng %s" % _fmt_weight(weight_kg))
    return ", ".join(parts)


def _fmt_chart_row(row: dict) -> str:
    w = row["weightKg"]
    h = row.get("heightCm")
    if h is not None:
        return "%s (%g–%gkg, %g–%gcm)" % (row["size"], w[0], w[1], h[0], h[1])
    return "%s (%g–%gkg)" % (row["size"], w[0], w[1])


def _mask_span_str(s: str, start: int, end: int) -> str:
    return s[:start] + (" " * (end - start)) + s[end:]


def parse_measurements(
    text: str,
    *,
    allow_bare_single: bool = True,
    rules_cfg: Optional[dict] = None,
) -> dict:
    """Phân tích chiều cao (130–200cm) và cân nặng (30–120kg) thuần luật; từ chối mọi nội dung lạ hoặc vô lý."""
    compiled = _get_compiled_rules(rules_cfg)
    max_allow_chars = compiled["max_allow_chars"]

    def _fail(reason: str, *, implausible: bool = False, ambiguous: bool = False, has_extra_text: bool = False) -> dict:
        return {
            "ok": False,
            "height_cm": None,
            "weight_kg": None,
            "implausible": implausible,
            "ambiguous": ambiguous,
            "has_extra_text": has_extra_text,
            "reason": reason,
        }

    norm = normalize_text(text, allow_slash=True)
    if not norm["raw"].strip():
        return _fail("Phản hồi không có nội dung số đo — cần nhân viên xử lý")
    if norm["has_newline"]:
        return _fail("Phản hồi có nhiều dòng — cần nhân viên xử lý", has_extra_text=True)
    if not norm["charset_ok"]:
        return _fail("Phản hồi chứa ký tự hoặc biểu tượng ngoài phạm vi cho phép — cần nhân viên xử lý", has_extra_text=True)
    if len(norm["raw_stripped"]) > max_allow_chars or len(norm["normalized"]) > max_allow_chars:
        return _fail("Phản hồi dài hơn %d ký tự — cần nhân viên xử lý" % max_allow_chars, has_extra_text=True)
    if _INTERNAL_SENTENCE_RE.search(_mask_decimal_dots(norm["normalized"])):
        return _fail("Phản hồi có nhiều câu — cần nhân viên xử lý", has_extra_text=True)

    core = _strip_trailing_punct_emoji(norm["normalized"], max_count=2)
    if not core:
        return _fail("Phản hồi không có nội dung số đo — cần nhân viên xử lý")
    if any(ch in _BENIGN_TRAILING_EMOJIS or ch in _TRAILING_PUNCT for ch in _mask_decimal_dots(core)):
        return _fail("Phản hồi chứa ký tự kết câu không hợp lệ — cần nhân viên xử lý", has_extra_text=True)

    is_ascii_only = (core == _strip_diacritics(core))
    work = core
    heights: list[float] = []
    weights: list[float] = []
    explicit_count = 0
    bare_count = 0

    # 1. Cân nặng có đơn vị rõ ràng (ưu tiên trước để "2m 50 kg" không ăn nhầm "50" vào chiều cao)
    for m in list(_WEIGHT_UNIT_RE.finditer(work)):
        w_val = float(m.group("w").replace(",", "."))
        weights.append(_clean_measure_num(w_val))
        explicit_count += 1
        work = _mask_span_str(work, m.start(), m.end())

    # 2. Chiều cao mét thập phân ("1.6m", "1,58m", "cao 1.60 mét")
    for m in list(_HEIGHT_DEC_METER_RE.finditer(work)):
        m_int = int(m.group("m"))
        frac = m.group("frac")
        h_val = m_int * 100 + (int(frac) * 10 if len(frac) == 1 else int(frac))
        heights.append(_clean_measure_num(h_val))
        explicit_count += 1
        work = _mask_span_str(work, m.start(), m.end())

    # 3. Chiều cao dạng viết gọn ("1m6", "1m60", "1m58", "cao 1 mét 6", "2m")
    for m in list(_HEIGHT_METER_SHORT_RE.finditer(work)):
        m_int = int(m.group("m"))
        cm_raw = m.group("cm")
        if cm_raw is None:
            h_val = m_int * 100
        elif len(cm_raw) == 1:
            h_val = m_int * 100 + int(cm_raw) * 10
        else:
            h_val = m_int * 100 + int(cm_raw)
        heights.append(_clean_measure_num(h_val))
        explicit_count += 1
        work = _mask_span_str(work, m.start(), m.end())

    # 4. Chiều cao có đơn vị cm ("160cm", "cao 160 cm", "250cm")
    for m in list(_HEIGHT_CM_RE.finditer(work)):
        cm_val = float(m.group("cm").replace(",", "."))
        heights.append(_clean_measure_num(cm_val))
        explicit_count += 1
        work = _mask_span_str(work, m.start(), m.end())

    # 5. Chiều cao có nhãn "cao 160", "chiều cao 158", "cao 1.6"
    for m in list(_HEIGHT_LABELLED_RE.finditer(work)):
        raw_v = m.group("val")
        f_val = float(raw_v.replace(",", "."))
        if ("." in raw_v or "," in raw_v) and f_val < 3.0:
            h_val = f_val * 100.0
        else:
            h_val = f_val
        heights.append(_clean_measure_num(h_val))
        explicit_count += 1
        work = _mask_span_str(work, m.start(), m.end())

    # 6. Cân nặng có nhãn "nặng 50", "cân nặng 52"
    for m in list(_WEIGHT_LABELLED_RE.finditer(work)):
        w_val = float(m.group("w").replace(",", "."))
        weights.append(_clean_measure_num(w_val))
        explicit_count += 1
        work = _mask_span_str(work, m.start(), m.end())

    # 7. Số trần không kèm đơn vị ("160 50", "160", "50", "1m60 50")
    for m in list(_BARE_NUM_RE.finditer(work)):
        raw_num = m.group("num")
        val = float(raw_num.replace(",", "."))
        clean_v = _clean_measure_num(val)
        bare_count += 1
        work = _mask_span_str(work, m.start(), m.end())
        if MEASUREMENT_HEIGHT_MIN_CM <= val <= MEASUREMENT_HEIGHT_MAX_CM:
            heights.append(clean_v)
        elif MEASUREMENT_WEIGHT_MIN_KG <= val <= MEASUREMENT_WEIGHT_MAX_KG:
            weights.append(clean_v)
        else:
            return _fail(
                "Số đo %s nằm ngoài khoảng hợp lệ (cao %d–%dcm, nặng %d–%dkg) — cần nhân viên tư vấn"
                % (raw_num, MEASUREMENT_HEIGHT_MIN_CM, MEASUREMENT_HEIGHT_MAX_CM, MEASUREMENT_WEIGHT_MIN_KG, MEASUREMENT_WEIGHT_MAX_KG),
                implausible=True,
            )

    # Kiểm tra phần chữ còn lại: CHỈ cho phép dấu phân tách (,, -, /) và từ lịch sự / xưng hô cho phép
    residual = re.sub(r"[,/\-]+", " ", work)
    residual = re.sub(r"\s+", " ", residual).strip()
    if residual:
        phrases = _FOLLOWUP_POLITE_PHRASES_ASCII if is_ascii_only else _FOLLOWUP_POLITE_PHRASES_VI
        for ph in phrases:
            residual = re.sub(_WB_L + re.escape(ph) + _WB_R, " ", residual)
        residual = re.sub(r"\s+", " ", residual).strip()

    if residual:
        allowed_tokens = _FOLLOWUP_POLITE_TOKENS_ASCII if is_ascii_only else _FOLLOWUP_POLITE_TOKENS_VI
        leftover = [tok for tok in residual.split() if tok not in allowed_tokens]
        if leftover:
            return _fail(
                "Nội dung có thêm câu hỏi hoặc thông tin ngoài số đo — cần nhân viên xử lý",
                has_extra_text=True,
            )

    if len(heights) > 1 or len(weights) > 1:
        return _fail(
            "Số đo có nhiều mức chiều cao hoặc cân nặng không rõ ràng — cần nhân viên tư vấn",
            ambiguous=True,
        )

    if not heights and not weights:
        return _fail("Không tìm thấy chiều cao hoặc cân nặng — cần nhân viên tư vấn")

    if not allow_bare_single and explicit_count == 0 and bare_count == 1:
        return _fail(
            "Số đo chưa rõ đơn vị (kg/cm) — cần nhân viên tư vấn",
            ambiguous=True,
        )

    h_out: Optional[float] = heights[0] if heights else None
    w_out: Optional[float] = weights[0] if weights else None

    if h_out is not None and not (MEASUREMENT_HEIGHT_MIN_CM <= h_out <= MEASUREMENT_HEIGHT_MAX_CM):
        return _fail(
            "Chiều cao %gcm nằm ngoài khoảng hợp lệ (%d–%dcm) — cần nhân viên tư vấn"
            % (h_out, MEASUREMENT_HEIGHT_MIN_CM, MEASUREMENT_HEIGHT_MAX_CM),
            implausible=True,
        )
    if w_out is not None and not (MEASUREMENT_WEIGHT_MIN_KG <= w_out <= MEASUREMENT_WEIGHT_MAX_KG):
        return _fail(
            "Cân nặng %gkg nằm ngoài khoảng hợp lệ (%d–%dkg) — cần nhân viên tư vấn"
            % (w_out, MEASUREMENT_WEIGHT_MIN_KG, MEASUREMENT_WEIGHT_MAX_KG),
            implausible=True,
        )

    return {
        "ok": True,
        "height_cm": h_out,
        "weight_kg": w_out,
        "implausible": False,
        "ambiguous": False,
        "has_extra_text": False,
        "reason": "",
    }


def _match_size_advice_pattern(candidate: str, compiled: dict, *, is_ascii_only: bool) -> Optional[dict]:
    if not candidate:
        return None
    for pat in compiled["allow"]:
        if pat["intents"] != ("size_advice",):
            continue
        m = pat["vi_re"].fullmatch(candidate) if pat["vi_re"] is not None else None
        if m is None and is_ascii_only and pat["ascii_re"] is not None:
            m = pat["ascii_re"].fullmatch(candidate)
        if m is not None:
            return pat
    return None


def _match_size_advice_with_measurements(
    core: str,
    compiled: dict,
    *,
    is_ascii_only: bool,
    rules_cfg: Optional[dict] = None,
) -> Optional[dict]:
    """Tách câu hỏi tư vấn size có kèm số đo trong cùng 1 câu (vd 'cao 1m60 nặng 50kg mặc size nào')."""
    body = core
    if is_ascii_only:
        body = _ITEM_REF_PREFIX_ASCII_RE.sub("", body).strip()
    else:
        body = _ITEM_REF_PREFIX_VI_RE.sub("", body).strip()
    if not body:
        return None

    split_positions = [m.start() for m in re.finditer(r"[\s,]+", body)]
    if not split_positions:
        return None

    # Chiến lược A: <số đo> <mẫu hỏi tư vấn size> (ưu tiên vế phải dài nhất khớp allowlist size_advice)
    for pos in split_positions:
        left = body[:pos].rstrip(" ,")
        right = body[pos:].lstrip(" ,")
        if not left or not right:
            continue
        right_clean = _THI_PREFIX_RE.sub("", right).strip()
        pat = _match_size_advice_pattern(right_clean, compiled, is_ascii_only=is_ascii_only)
        if pat is None:
            continue
        meas = parse_measurements(left, allow_bare_single=False, rules_cfg=rules_cfg)
        if meas["ok"]:
            return {
                "ok": True,
                "intents": {"size_advice"},
                "source": "rule",
                "reason": "",
                "pattern_id": pat["id"] + "+measurements",
                "asked_size": None,
                "asked_color": None,
                "asked_qty": None,
                "asked_unit": None,
                "height_cm": meas["height_cm"],
                "weight_kg": meas["weight_kg"],
            }
        if meas["implausible"] or meas["ambiguous"]:
            return {
                "ok": False,
                "intents": {"size_advice"},
                "source": "rule",
                "reason": meas["reason"],
                "pattern_id": None,
                "asked_size": None,
                "asked_color": None,
                "asked_qty": None,
                "asked_unit": None,
                "height_cm": None,
                "weight_kg": None,
            }

    # Chiến lược B: <mẫu hỏi tư vấn size>[,] <số đo> (vd "tư vấn size giúp em, cao 1m60 nặng 50kg")
    for pos in reversed(split_positions):
        left = body[:pos].rstrip(" ,")
        right = body[pos:].lstrip(" ,")
        if not left or not right:
            continue
        left_clean = _strip_polite_trailing(left, compiled)
        pat = _match_size_advice_pattern(left_clean, compiled, is_ascii_only=is_ascii_only)
        if pat is None:
            continue
        meas = parse_measurements(right, allow_bare_single=False, rules_cfg=rules_cfg)
        if meas["ok"]:
            return {
                "ok": True,
                "intents": {"size_advice"},
                "source": "rule",
                "reason": "",
                "pattern_id": pat["id"] + "+measurements",
                "asked_size": None,
                "asked_color": None,
                "asked_qty": None,
                "asked_unit": None,
                "height_cm": meas["height_cm"],
                "weight_kg": meas["weight_kg"],
            }
        if meas["implausible"] or meas["ambiguous"]:
            return {
                "ok": False,
                "intents": {"size_advice"},
                "source": "rule",
                "reason": meas["reason"],
                "pattern_id": None,
                "asked_size": None,
                "asked_color": None,
                "asked_qty": None,
                "asked_unit": None,
                "height_cm": None,
                "weight_kg": None,
            }

    return None


def recommend_size(
    *,
    weight_kg: float,
    height_cm: Optional[float],
    chart: dict,
    in_stock_sizes: Iterable[str],
    product_code: str,
) -> dict:
    """Đề xuất size xác định từ bảng size và danh sách size đang còn hàng của sản phẩm.

    Luật:
    - Freesize (Free/Freesize/FS): mặc định vừa 40–55 kg (hoặc dùng dòng Freesize nếu bảng có cấu hình).
    - Theo cân nặng trước; nếu có chiều cao và lệch hơn 1 cỡ → ưu tiên cỡ lớn hơn và nói rõ.
    - Nếu trùng 2 cỡ liền kề (overlap) và cả 2 còn hàng → trả cả 2 cỡ; chỉ còn 1 cỡ trong 2 → chọn cỡ còn hàng.
    - Ngoài bảng size, không rõ ràng hoặc cỡ phù hợp đã hết hàng → `ok=False` kèm lý do (Cần bạn).
    """
    stock_list = [str(s).strip() for s in in_stock_sizes if str(s).strip()]
    if not stock_list:
        return {
            "ok": False,
            "sizes": [],
            "rows_used": [],
            "overlap": False,
            "conflict_prefer_larger": False,
            "conflict_detail": "",
            "is_freesize": False,
            "reason": "Sản phẩm mã %s hiện chưa có thông tin size còn hàng — cần nhân viên tư vấn" % product_code,
        }

    instock_map = {_canonical_size(s): s for s in stock_list}
    raw_rows = list(chart.get("rows") or ())

    # Trường hợp sản phẩm Freesize
    if set(instock_map.keys()) == {"Freesize"}:
        fs_row = next((r for r in raw_rows if _canonical_size(r.get("size") or "") == "Freesize"), None)
        if fs_row is not None:
            w_lo, w_hi = fs_row["weightKg"]
            h_rng = fs_row.get("heightCm")
            used_row = fs_row
        else:
            w_lo, w_hi = writing_style.FREESIZE_WEIGHT_RANGE
            h_rng = None
            used_row = {"size": "Freesize", "weightKg": [w_lo, w_hi], "heightCm": None}

        if not (w_lo <= weight_kg <= w_hi):
            return {
                "ok": False,
                "sizes": [],
                "rows_used": [used_row],
                "overlap": False,
                "conflict_prefer_larger": False,
                "conflict_detail": "",
                "is_freesize": True,
                "reason": "Cân nặng %s nằm ngoài khoảng Freesize (%g–%gkg) — cần nhân viên tư vấn"
                % (_fmt_weight(weight_kg), w_lo, w_hi),
            }
        if height_cm is not None and h_rng is not None and not (h_rng[0] <= height_cm <= h_rng[1]):
            return {
                "ok": False,
                "sizes": [],
                "rows_used": [used_row],
                "overlap": False,
                "conflict_prefer_larger": False,
                "conflict_detail": "",
                "is_freesize": True,
                "reason": "Chiều cao %s nằm ngoài khoảng Freesize (%g–%gcm) — cần nhân viên tư vấn"
                % (_fmt_height(height_cm), h_rng[0], h_rng[1]),
            }
        return {
            "ok": True,
            "sizes": [instock_map["Freesize"]],
            "rows_used": [used_row],
            "overlap": False,
            "conflict_prefer_larger": False,
            "conflict_detail": "",
            "is_freesize": True,
            "reason": "",
        }

    # Sản phẩm theo size thường: sắp xếp dòng bảng size từ nhỏ đến lớn theo khoảng cân nặng
    rows = sorted(
        [r for r in raw_rows if _canonical_size(r.get("size") or "") != "Freesize"],
        key=lambda r: (float(r["weightKg"][0]), float(r["weightKg"][1])),
    )
    if not rows:
        return {
            "ok": False,
            "sizes": [],
            "rows_used": [],
            "overlap": False,
            "conflict_prefer_larger": False,
            "conflict_detail": "",
            "is_freesize": False,
            "reason": "Bảng size chưa có dòng phù hợp — cần nhân viên tư vấn",
        }

    w_idxs = [i for i, r in enumerate(rows) if r["weightKg"][0] <= weight_kg <= r["weightKg"][1]]
    if not w_idxs:
        return {
            "ok": False,
            "sizes": [],
            "rows_used": [],
            "overlap": False,
            "conflict_prefer_larger": False,
            "conflict_detail": "",
            "is_freesize": False,
            "reason": "Cân nặng %s nằm ngoài bảng size của shop — cần nhân viên tư vấn" % _fmt_weight(weight_kg),
        }
    if len(w_idxs) > 2 or (len(w_idxs) == 2 and (w_idxs[1] - w_idxs[0]) != 1):
        return {
            "ok": False,
            "sizes": [],
            "rows_used": [rows[i] for i in w_idxs],
            "overlap": False,
            "conflict_prefer_larger": False,
            "conflict_detail": "",
            "is_freesize": False,
            "reason": "Bảng size có nhiều khoảng cân nặng chồng chéo cho %s — cần nhân viên tư vấn" % _fmt_weight(weight_kg),
        }

    conflict_prefer_larger = False
    conflict_detail = ""
    has_any_height = any(r.get("heightCm") is not None for r in rows)

    if height_cm is not None and has_any_height:
        h_idxs = [
            i for i, r in enumerate(rows)
            if r.get("heightCm") is not None and r["heightCm"][0] <= height_cm <= r["heightCm"][1]
        ]
        if not h_idxs:
            return {
                "ok": False,
                "sizes": [],
                "rows_used": [rows[i] for i in w_idxs],
                "overlap": False,
                "conflict_prefer_larger": False,
                "conflict_detail": "",
                "is_freesize": False,
                "reason": "Chiều cao %s nằm ngoài bảng size của shop — cần nhân viên tư vấn" % _fmt_height(height_cm),
            }
        both = [i for i in w_idxs if i in h_idxs]
        if both:
            chosen_idxs = both
        else:
            best_pair = min(
                ((abs(wi - hi), -max(wi, hi), wi, hi) for wi in w_idxs for hi in h_idxs)
            )
            min_dist, _, wi, hi = best_pair
            if min_dist > 1:
                larger_idx = max(wi, hi)
                chosen_idxs = [larger_idx]
                conflict_prefer_larger = True
                conflict_detail = "%s theo cân nặng, %s theo chiều cao → ưu tiên cỡ lớn hơn %s" % (
                    rows[wi]["size"],
                    rows[hi]["size"],
                    rows[larger_idx]["size"],
                )
            else:
                chosen_idxs = w_idxs
    else:
        chosen_idxs = w_idxs

    matched_rows = [rows[i] for i in chosen_idxs]
    available_pairs: list[tuple[str, dict]] = []
    for r in matched_rows:
        canon = _canonical_size(r["size"])
        if canon in instock_map:
            available_pairs.append((instock_map[canon], r))

    if not available_pairs:
        wanted = "/".join(r["size"] for r in matched_rows)
        return {
            "ok": False,
            "sizes": [],
            "rows_used": matched_rows,
            "overlap": False,
            "conflict_prefer_larger": conflict_prefer_larger,
            "conflict_detail": conflict_detail,
            "is_freesize": False,
            "reason": "Size %s phù hợp với số đo nhưng mã %s hiện hết hàng hoặc không có size này — cần nhân viên tư vấn"
            % (wanted, product_code),
        }

    chosen_sizes = [sz for sz, _ in available_pairs]
    used_rows = [r for _, r in available_pairs]
    return {
        "ok": True,
        "sizes": chosen_sizes,
        "rows_used": used_rows,
        "overlap": len(chosen_sizes) == 2,
        "conflict_prefer_larger": conflict_prefer_larger,
        "conflict_detail": conflict_detail,
        "is_freesize": False,
        "reason": "",
    }


def render_size_advice_ask(*, style: Optional[dict] = None) -> str:
    """Mẫu câu hỏi xin chiều cao và cân nặng khi khách hỏi tư vấn size (KHÔNG gọi LLM)."""
    st = style or {}
    xung_ho = str(st.get("xungHo") or "").strip() or "bạn"
    self_ref = str(st.get("selfReference") or "").strip() or "shop"
    try:
        max_emoji = max(0, int(st.get("maxEmoji", 1)))
    except (TypeError, ValueError):
        max_emoji = 0

    sentence = "Dạ %s cho %s xin chiều cao và cân nặng để tư vấn size chuẩn ạ." % (xung_ho, self_ref)
    if max_emoji >= 1:
        sentence = sentence + " 🌸"
    return sentence


def render_size_advice_recommendation(
    product_code: str,
    rec: dict,
    *,
    weight_kg: float,
    height_cm: Optional[float] = None,
    style: Optional[dict] = None,
) -> str:
    """Mẫu câu tư vấn size xác định từ bảng size và tồn kho (KHÔNG gọi LLM, không bình luận vóc dáng, không hứa hẹn)."""
    st = style or {}
    xung_ho = str(st.get("xungHo") or "").strip() or "bạn"
    self_ref = str(st.get("selfReference") or "").strip() or "shop"
    try:
        max_emoji = max(0, int(st.get("maxEmoji", 1)))
    except (TypeError, ValueError):
        max_emoji = 0

    code = str(product_code).strip()
    if height_cm is not None:
        meas_phrase = "với chiều cao %s và cân nặng %s" % (_fmt_height(height_cm), _fmt_weight(weight_kg))
    else:
        meas_phrase = "với cân nặng %s" % _fmt_weight(weight_kg)

    sizes = list(rec.get("sizes") or ())
    if not sizes:
        raise ValueError("Cần ít nhất một size còn hàng để ghép câu tư vấn size")

    if rec.get("is_freesize") or sizes == ["Freesize"]:
        sentence = "Dạ %s, %s mặc Freesize là vừa ạ. Mẫu %s hiện còn Freesize." % (meas_phrase, xung_ho, code)
    elif len(sizes) == 2:
        s1, s2 = sizes[0], sizes[1]
        sentence = (
            "Dạ %s, %s có thể mặc size %s hoặc %s tuỳ %s thích mặc ôm hay thoải mái ạ. "
            "Mẫu %s hiện còn size %s và %s."
            % (meas_phrase, xung_ho, s1, s2, xung_ho, code, s1, s2)
        )
    elif rec.get("conflict_prefer_larger"):
        sz = sizes[0]
        sentence = (
            "Dạ %s, chiều cao và cân nặng lệch hơn 1 cỡ nên %s ưu tiên chọn size lớn hơn là size %s "
            "để %s mặc thoải mái ạ. Mẫu %s hiện còn size %s."
            % (meas_phrase, self_ref, sz, xung_ho, code, sz)
        )
    else:
        sz = sizes[0]
        sentence = "Dạ %s, %s mặc size %s là vừa ạ. Mẫu %s hiện còn size %s." % (
            meas_phrase,
            xung_ho,
            sz,
            code,
            sz,
        )

    if max_emoji >= 1:
        sentence = sentence + " 🌸"
    return sentence


def classify_intent_rules(
    text: str,
    *,
    rules_cfg: Optional[dict] = None,
    product_code: Optional[str] = None,  # giữ chữ ký tương thích ngược
) -> dict:
    """Đối chiếu bình luận theo allowlist trong `data/auto_reply_rules.json` (khớp trọn vẹn, tối đa 80 ký tự, 1 câu)."""
    compiled = _get_compiled_rules(rules_cfg)
    norm = normalize_text(text)
    slash_fallback = False
    if not norm["charset_ok"] and "/" in str(text or "") and not has_url(text):
        alt = normalize_text(text, allow_slash=True)
        if alt["charset_ok"]:
            norm = alt
            slash_fallback = True

    def _reject_res(reason: str) -> dict:
        return {
            "ok": False,
            "intents": set(),
            "source": "rule",
            "reason": reason,
            "pattern_id": None,
            "asked_size": None,
            "asked_color": None,
            "height_cm": None,
            "weight_kg": None,
        }

    if not norm["raw"].strip():
        return _reject_res("Bình luận không có nội dung chữ — cần nhân viên xem trực tiếp")

    if norm["has_newline"]:
        return _reject_res("Bình luận có nhiều câu hoặc nhiều dòng — cần nhân viên xử lý")

    if not norm["charset_ok"]:
        return _reject_res("Bình luận chứa ký tự hoặc biểu tượng ngoài phạm vi cho phép — cần nhân viên xử lý")

    if not norm["normalized"]:
        return _reject_res("Bình luận không có nội dung chữ — cần nhân viên xem trực tiếp")

    max_allow_chars = compiled["max_allow_chars"]
    if len(norm["raw_stripped"]) > max_allow_chars or len(norm["normalized"]) > max_allow_chars:
        return _reject_res("Bình luận dài hơn %d ký tự — cần nhân viên xử lý" % max_allow_chars)

    if _INTERNAL_SENTENCE_RE.search(_mask_decimal_dots(norm["normalized"])):
        return _reject_res("Bình luận có nhiều câu hoặc nhiều dòng — cần nhân viên xử lý")

    core = _strip_trailing_punct_emoji(norm["normalized"], max_count=2)
    if not core:
        return _reject_res("Bình luận chỉ có ký tự/biểu tượng — cần nhân viên xử lý")

    # Không chấp nhận emoji đứng đầu/giữa hoặc hơn 2 dấu câu/emoji ở cuối
    if any(ch in _BENIGN_TRAILING_EMOJIS or ch in _TRAILING_PUNCT for ch in _mask_decimal_dots(core)):
        return _reject_res("Bình luận không khớp mẫu câu hỏi được phép tự động trả lời")

    core = _strip_polite_leading(core, compiled)
    core, stripped_trailing = _strip_polite_trailing_tokens(core, compiled)
    # Quét lại 1 lượt đầu câu phòng trường hợp mở đầu đứng trước/sau cấu trúc ngắn
    core = _strip_polite_leading(core, compiled)
    if not core:
        return _reject_res("Bình luận không phải câu hỏi giá/size/màu rõ ràng")

    asked_qty, asked_unit, core = extract_quantity(core)
    if not core:
        return _reject_res("Bình luận không phải câu hỏi giá/size/màu rõ ràng")

    is_ascii_only = (core == _strip_diacritics(core))
    if not slash_fallback:
        for pat in compiled["allow"]:
            if asked_qty is not None and "size_advice" in pat["intents"]:
                continue
            m = pat["vi_re"].fullmatch(core) if pat["vi_re"] is not None else None
            if m is None and is_ascii_only and pat["ascii_re"] is not None:
                m = pat["ascii_re"].fullmatch(core)
            if m is None:
                continue
            forbid_trailing = pat.get("forbid_trailing")
            if forbid_trailing and any(tok in forbid_trailing for tok in stripped_trailing):
                continue
            gd = m.groupdict()
            asked_size = (gd.get("size") or "").strip() or None
            asked_color = (gd.get("color") or "").strip() or None
            if asked_color is not None and _is_invalid_color_capture(asked_color, is_ascii_only=is_ascii_only):
                continue
            return {
                "ok": True,
                "intents": set(pat["intents"]),
                "source": "rule",
                "reason": "",
                "pattern_id": pat["id"],
                "asked_size": asked_size,
                "asked_color": asked_color,
                "asked_qty": asked_qty,
                "asked_unit": asked_unit,
                "height_cm": None,
                "weight_kg": None,
            }

    if asked_qty is None:
        sa_hit = _match_size_advice_with_measurements(
            core,
            compiled,
            is_ascii_only=is_ascii_only,
            rules_cfg=rules_cfg,
        )
        if sa_hit is not None:
            return sa_hit

    return _reject_res("Bình luận không khớp mẫu câu hỏi giá/size/màu được phép tự động trả lời")


def classify_intent(
    text: str,
    *,
    rules_cfg: Optional[dict] = None,
    model=None,  # bỏ qua có chủ đích: allowlist tuyệt đối không rơi sang AI
    product_code: Optional[str] = None,
) -> dict:
    """Bước 2: phân loại ý định thuần allowlist xác định (KHÔNG gọi AI)."""
    return classify_intent_rules(text, rules_cfg=rules_cfg, product_code=product_code)


# ---------------- Step 4: Deterministic template answer (NO LLM) ----------------

def render_template(
    product_code: str,
    intents: Iterable[str],
    *,
    price: Optional[int] = None,
    sizes: Iterable[str] = (),
    colors: Iterable[str] = (),
    variant_pairs: Optional[Iterable[tuple[str, Iterable[str]]]] = None,
    style: Optional[dict] = None,
    qty: Optional[int] = None,
    unit: str = "cái",
) -> str:
    """Sinh câu trả lời xác định hoàn toàn từ dữ liệu sản phẩm và phong cách viết (KHÔNG gọi LLM).

    qty > 1: giá nêu theo đơn vị ("giá X mỗi bộ") và xác nhận còn đủ số lượng — không tự tính tổng
    hay hứa giảm giá (bộ kiểm tra đầu ra chỉ chấp nhận đúng giá bán).
    """
    intent_set = {i for i in intents if i in _VALID_INTENT_SET}
    if not intent_set:
        raise ValueError("Cần ít nhất một ý định trong {price, size, color}")

    st = style or {}
    xung_ho = str(st.get("xungHo") or "").strip()
    self_ref = str(st.get("selfReference") or "").strip()
    raw_max_emoji = st.get("maxEmoji", 1)
    try:
        max_emoji = max(0, int(raw_max_emoji))
    except (TypeError, ValueError):
        max_emoji = 0

    parts: list[str] = []
    if "price" in intent_set:
        if price is None:
            raise ValueError("Thiếu giá bán để ghép mẫu trả lời")
        if qty and qty > 1:
            parts.append("giá %s mỗi %s" % (rules.fmt_vnd(price), unit))
        else:
            parts.append("giá %s" % rules.fmt_vnd(price))

    size_list = [str(s).strip() for s in sizes if str(s).strip()]
    color_list = [str(c).strip() for c in colors if str(c).strip()]
    clean_pairs: list[tuple[str, list[str]]] = []
    if variant_pairs is not None:
        for col, szs in variant_pairs:
            c_str = str(col or "").strip()
            s_arr = [str(s).strip() for s in (szs or ()) if str(s).strip()]
            if c_str and s_arr:
                clean_pairs.append((c_str, s_arr))

    if clean_pairs and ("size" in intent_set or "color" in intent_set):
        pair_strs = ["màu %s (size %s)" % (c, ", ".join(szs)) for c, szs in clean_pairs]
        parts.append("còn %s" % ", ".join(pair_strs))
    elif "size" in intent_set and "color" in intent_set:
        parts.append("còn size %s, màu %s" % (", ".join(size_list), ", ".join(color_list)))
    elif "size" in intent_set:
        parts.append("còn size %s" % ", ".join(size_list))
    elif "color" in intent_set:
        parts.append("còn màu %s" % ", ".join(color_list))
    if qty and qty > 1:
        parts.append("còn đủ %d %s" % (qty, unit))

    fact_str = ", ".join(parts)
    code = str(product_code).strip()

    if self_ref:
        if xung_ho:
            sentence = "Dạ %s báo %s, mẫu %s %s ạ." % (self_ref, xung_ho, code, fact_str)
        else:
            sentence = "Dạ %s báo mẫu %s %s ạ." % (self_ref, code, fact_str)
    else:
        if intent_set == {"price"}:
            if xung_ho:
                sentence = "Dạ mẫu %s %s %s nhé." % (code, fact_str, xung_ho)
            else:
                sentence = "Dạ mẫu %s %s ạ." % (code, fact_str)
        else:
            if xung_ho:
                sentence = "Dạ mẫu %s %s %s ạ." % (code, fact_str, xung_ho)
            else:
                sentence = "Dạ mẫu %s %s ạ." % (code, fact_str)

    if max_emoji >= 1:
        sentence = sentence + " 🌸"
    return sentence


# ---------------- Pipeline helpers ----------------

def _comment_page_id(c: dict) -> str:
    pid = str(c.get("page_id") or "").strip()
    if pid:
        return pid
    ch = str(c.get("channel_id") or "").strip()
    if ch.startswith("fb-") and ch != "fb-test":
        return ch[3:]
    return ""


def _comment_channel_id(c: dict) -> str:
    ch = str(c.get("channel_id") or "").strip()
    if ch:
        return ch
    pid = _comment_page_id(c)
    return ("fb-" + pid) if pid else ""


def _sorted_intents(intents: Iterable[str]) -> list[str]:
    return sorted({i for i in intents if i in _VALID_INTENT_SET}, key=lambda k: _INTENT_ORDER[k])


def _is_published_vpost_post(comment: dict) -> tuple[bool, Optional[dict]]:
    """True nếu bình luận thuộc bài đăng đã được xuất bản công khai bởi VPOST (N2)."""
    post_job_id = str(comment.get("post_job_id") or "").strip()
    if not post_job_id:
        return False, None
    job = store.post_job(post_job_id)
    if not job or str(job.get("status") or "").strip() != "published":
        return False, job
    job_fb_post_id = str(job.get("fb_post_id") or "").strip()
    if not job_fb_post_id:
        return False, job
    c_fb_post_id = str(comment.get("fb_post_id") or "").strip()
    if c_fb_post_id and c_fb_post_id != job_fb_post_id:
        return False, job
    return True, job


def _resolve_product_code(tenant_id: str, comment: dict, thread_id: str, job: Optional[dict] = None) -> str:
    code = str(comment.get("product_code") or "").strip()
    if code:
        return code
    if thread_id and thread_id != comment.get("id"):
        root = store.get_comment(tenant_id, thread_id)
        if root and str(root.get("product_code") or "").strip():
            return str(root["product_code"]).strip()
    if job is None:
        post_job_id = str(comment.get("post_job_id") or "").strip()
        if post_job_id:
            job = store.post_job(post_job_id)
    if job and str(job.get("product_code") or "").strip():
        return str(job["product_code"]).strip()
    return ""


def _moderation_block_reason(category: str) -> str:
    mapping = {
        "abusive": "Bình luận có ngôn từ không phù hợp (quy tắc kiểm duyệt)",
        "spam": "Bình luận bị nhận diện là spam (quy tắc kiểm duyệt)",
        "scam": "Bình luận có dấu hiệu lừa đảo (quy tắc kiểm duyệt)",
        "pii": "Bình luận chứa thông tin cá nhân (SĐT/email) — cần nhân viên xử lý",
        "complaint": "Bình luận là phản hồi/khiếu nại — cần nhân viên xử lý",
    }
    return mapping.get(category, "Bình luận cần nhân viên kiểm tra theo quy tắc kiểm duyệt")


def _canonical_size(raw_size: str) -> str:
    parsed = rules.parse_sizes(raw_size)
    return parsed[0] if len(parsed) == 1 else str(raw_size or "").strip().upper()


def _build_stock_matrix(
    stock: dict,
    in_stock_colors: list[str],
    in_stock_sizes: list[str],
    *,
    has_color: bool,
) -> tuple[set[tuple[str, str]], list[tuple[str, list[str]]], bool]:
    """Dựng ma trận tồn kho thực tế theo từng cặp (màu, size) từ `stock['variants']`."""
    variants = stock.get("variants") or []
    instock_pairs: set[tuple[str, str]] = set()
    for v in variants:
        try:
            ton = int(v.get("ton") or 0)
        except (TypeError, ValueError):
            ton = 0
        if ton <= 0:
            continue
        col_norm = _fold_exact(str(v.get("mau") or ""))
        sz_canon = _canonical_size(str(v.get("size") or "").strip())
        instock_pairs.add((col_norm, sz_canon))

    if not has_color or not in_stock_colors or not in_stock_sizes or not variants:
        return instock_pairs, [], True

    pairs_by_color: list[tuple[str, list[str]]] = []
    for c in in_stock_colors:
        c_norm = _fold_exact(c)
        szs = [s for s in in_stock_sizes if (c_norm, _canonical_size(s)) in instock_pairs]
        if szs:
            pairs_by_color.append((c, szs))

    is_full = all(
        (_fold_exact(c), _canonical_size(s)) in instock_pairs
        for c in in_stock_colors
        for s in in_stock_sizes
    )
    return instock_pairs, pairs_by_color, is_full


def _check_named_variant_in_stock(
    product_code: str,
    *,
    asked_size: Optional[str],
    asked_color: Optional[str],
    in_stock_colors: list[str],
    in_stock_sizes: list[str],
    has_color: bool,
) -> Optional[str]:
    """Kiểm tra size hoặc màu cụ thể khách hỏi khớp CHÍNH XÁC (không phân biệt hoa/thường & dấu, không substring) với giá trị còn hàng của sản phẩm bài đăng."""
    if asked_size:
        asked_canon = _canonical_size(asked_size)
        asked_fold = _fold_exact(asked_size)
        in_sizes_canon = {_canonical_size(s) for s in in_stock_sizes}
        in_sizes_fold = {_fold_exact(s) for s in in_stock_sizes}
        if asked_canon not in in_sizes_canon and asked_fold not in in_sizes_fold:
            return "Size %s của mã %s hiện đã hết hàng — cần nhân viên tư vấn" % (asked_size.upper(), product_code)

    if asked_color:
        asked_fold = _fold_exact(asked_color)
        in_colors_fold = {_fold_exact(c) for c in in_stock_colors}
        if not has_color or asked_fold not in in_colors_fold:
            return "Màu %s của mã %s hiện không còn hàng — cần nhân viên tư vấn" % (asked_color, product_code)

    return None


def _record_rejection(
    tenant_id: str,
    *,
    page_id: str,
    fb_post_id: str = "",
    thread_id: str,
    comment_id: str,
    from_id: str,
    reason: str,
    intents: Iterable[str] = (),
    action: str = "skipped",
    text: str = "",
    ts: Optional[str] = None,
    tag_attention: bool = True,
) -> dict:
    """Bước 7: gắn nhãn 'can_ban' (khi tag_attention=True) kèm lý do và ghi dòng nhật ký `auto_reply_log`."""
    now_ts = ts or _now_z()
    intent_list = _sorted_intents(intents)
    if tag_attention:
        store.set_thread_attention(tenant_id, thread_id, reason, tag="can_ban", since=now_ts)
    store.append_auto_reply_log(
        tenant_id,
        page_id=page_id,
        fb_post_id=fb_post_id,
        thread_id=thread_id,
        comment_id=comment_id,
        from_id=from_id,
        intents=intent_list,
        action=action,
        reason=reason,
        text=text,
        created_at=now_ts,
    )
    log.info(
        "comment_auto_reply tenant=%s page_id=%s thread_id=%s comment_id=%s action=%s intents=%s",
        tenant_id,
        page_id,
        thread_id,
        comment_id,
        action,
        ",".join(intent_list) or "none",
    )
    return {
        "action": action,
        "tagged": bool(tag_attention),
        "threadId": thread_id,
        "commentId": comment_id,
        "intents": intent_list,
        "reason": reason,
        "text": text or None,
    }


def _evaluate_comment(
    tenant_id: str,
    comment: dict,
    *,
    thread_id: str,
    setting: dict,
    compiled: dict,
    rules_cfg: Optional[dict] = None,
    recent_texts: Optional[list[str]] = None,
    post_recent_texts: Optional[list[str]] = None,
    failed_pages: Optional[set[str]] = None,
    ref_dt: datetime,
    ts: str,
    check_cooldown: bool = True,
    allow_child_for_lookahead: bool = False,
    pending_state: Optional[dict] = None,
    step_cb=None,
) -> dict:
    """Đánh giá thuần đọc Steps 1–5 (KHÔNG ghi DB nghiệp vụ, KHÔNG gọi Facebook; chỉ gọi `step_cb` nếu có).

    Trả `{"status": "reject", "reason": ..., "intents": [...]}` hoặc
    `{"status": "ready", "intents": [...], "reply_text": ..., "product_code": ...}`.
    """
    import vpost_api

    def _emit(key: str, status: str, detail: Optional[str] = None, *, label: Optional[str] = None) -> None:
        if step_cb is not None:
            step_cb(key, status, detail, label=label)

    def _reject(
        stage: str,
        reason: str,
        intents_val: Iterable[str] = (),
        *,
        label: Optional[str] = None,
    ) -> dict:
        _emit(stage, "blocked", reason, label=label)
        return {"status": "reject", "reason": reason, "intents": list(intents_val)}

    page_id = _comment_page_id(comment)
    channel_id = _comment_channel_id(comment)
    from_id = str(comment.get("from_id") or "").strip()
    message = str(comment.get("message") or "")
    cid = str(comment.get("id") or "").strip()

    is_followup_measurement = bool(
        not allow_child_for_lookahead
        and pending_state
        and pending_state.get("state") == "awaiting_measurements"
        and str(pending_state.get("asked_comment_id") or "") != cid
    )
    pending_asked_id = str(pending_state.get("asked_comment_id") or "") if is_followup_measurement else ""
    pending_bot_reply_id = str(pending_state.get("bot_reply_id") or "") if is_followup_measurement else ""

    # ---------- BƯỚC 1: Input guard & Thread scope (N2 + ngoại lệ 1 lượt cho câu hỏi chờ số đo của bot) ----------
    if is_kill_switch_enabled():
        return _reject("safety", "Tự động trả lời đang tạm tắt toàn hệ thống")

    if failed_pages is not None and page_id and page_id in failed_pages:
        return _reject(
            "safety",
            "Tạm dừng tự động trả lời trên Fanpage trong lượt này do lỗi Facebook trước đó",
        )

    if not setting["enabled"]:
        return _reject("safety", "Chưa bật tự động trả lời cho Fanpage này")

    enabled_intents = set(setting.get("intents") or ()) & _VALID_INTENT_SET
    if not enabled_intents:
        return _reject("safety", "Chưa chọn nhóm câu hỏi được phép tự động trả lời")

    if is_followup_measurement:
        if "size_advice" not in enabled_intents:
            return _reject(
                "safety",
                "Fanpage chưa bật tự động trả lời cho nhóm câu hỏi: tư vấn size",
                ["size_advice"],
            )
        asked_comment = store.get_comment(tenant_id, pending_asked_id) if pending_asked_id else None
        if asked_comment is not None:
            asked_from_id = str(asked_comment.get("from_id") or "").strip()
            if asked_from_id and from_id and asked_from_id != from_id:
                return _reject(
                    "safety",
                    "Bình luận trong chuỗi đến từ tài khoản khách khác — cần nhân viên xử lý",
                    ["size_advice"],
                )
            if _comment_sort_key(comment) <= _comment_sort_key(asked_comment):
                return _reject(
                    "safety",
                    "Bình luận cũ hơn câu hỏi chờ số đo — cần nhân viên xử lý",
                    ["size_advice"],
                )
        if store.thread_has_activity_other_than_bot_question(
            tenant_id,
            thread_id,
            asked_comment_id=pending_asked_id,
            bot_reply_id=pending_bot_reply_id,
            now_ts=ts,
        ):
            return _reject(
                "safety",
                "Hội thoại đã có phản hồi của Fanpage hoặc thao tác nhân viên — cần nhân viên xử lý",
                ["size_advice"],
            )
    elif not allow_child_for_lookahead:
        if (comment.get("parent_id") or "").strip():
            return _reject(
                "safety",
                "Bình luận phản hồi trong chuỗi hội thoại — cần nhân viên xử lý",
            )
        if store.thread_has_any_page_reply_or_operator_activity(tenant_id, thread_id, now_ts=ts):
            return _reject(
                "safety",
                "Hội thoại đã có phản hồi của Fanpage hoặc thao tác nhân viên — cần nhân viên xử lý",
            )

    published_ok, post_job = _is_published_vpost_post(comment)
    if not published_ok:
        return _reject(
            "safety",
            "Bình luận không thuộc bài đăng đã xuất bản bởi VPOST — cần nhân viên xử lý",
        )

    if not message.strip():
        return _reject("safety", "Bình luận không có nội dung chữ — cần nhân viên xem trực tiếp")

    if not comment.get("can_comment", 1):
        return _reject("safety", "Facebook không cho phép trả lời bình luận này")

    if comment.get("is_hidden"):
        return _reject("safety", "Bình luận đang bị ẩn")

    mod_action = str(comment.get("moderation_action") or "").strip()
    mod_cat = str(comment.get("moderation_category") or "").strip()
    if mod_action in ("auto_hidden", "would_hide", "flagged") or mod_cat in ("spam", "scam", "abusive", "pii", "complaint"):
        return _reject(
            "safety",
            "Bình luận đã bị kiểm duyệt gắn cờ cần nhân viên xem xét",
        )

    if has_url(message):
        return _reject("safety", "Bình luận có chứa đường dẫn (URL)")

    max_chars = compiled["max_chars"]
    if len(message) > max_chars:
        return _reject("safety", "Bình luận dài hơn %d ký tự" % max_chars)

    if has_prompt_injection(message, rules_cfg=rules_cfg):
        return _reject("safety", "Phát hiện dấu hiệu chèn lệnh (prompt injection)")

    fb_post_id = str(comment.get("fb_post_id") or (post_job.get("fb_post_id") if post_job else "") or "").strip()

    # Lớp chống kiểm duyệt & chống spam lặp theo khách (khi có from_id; khi from_id trống vẫn chạy kiểm duyệt nội dung)
    if recent_texts is not None:
        recents = recent_texts
    elif from_id:
        recents = _recent_customer_texts(tenant_id, page_id, from_id, fb_post_id, ref_dt)
    else:
        recents = []
    mod_hit = moderation.classify_by_rules(
        message,
        pii_detector=rules.find_pii_spans,
        recent_texts=recents,
    )
    if mod_hit is not None and mod_hit.get("category") in ("abusive", "spam", "scam", "pii", "complaint"):
        return _reject("safety", _moderation_block_reason(mod_hit["category"]))

    # Chống spam lặp nội dung giống nhau trên cùng bài đăng trong 10 phút, không phân biệt tác giả (kể cả from_id trống)
    post_spam_window = compiled["post_spam_window_minutes"]
    post_spam_threshold = compiled["post_spam_threshold"]
    p_recents = (
        post_recent_texts
        if post_recent_texts is not None
        else _recent_post_texts(tenant_id, page_id, fb_post_id, ref_dt, window_minutes=post_spam_window)
    )
    if _count_post_identical_texts(message, p_recents) >= post_spam_threshold:
        return _reject(
            "safety",
            "Phát hiện spam lặp cùng nội dung trên bài đăng trong vòng %d phút gần đây" % post_spam_window,
        )

    cooldown_minutes = compiled["cooldown_minutes"]
    post_rate_limit = compiled["post_rate_limit"]
    post_rate_window = compiled["post_rate_window_minutes"]
    if check_cooldown:
        # 1. Cooldown theo hội thoại: tối đa 1 câu tự động trả lời mỗi hội thoại trong 10 phút
        #    (ngoại lệ duy nhất: bỏ qua chính câu hỏi chờ số đo vừa gửi của bot trên hội thoại này)
        if store.has_recent_auto_reply_for_thread(
            tenant_id,
            thread_id,
            ref_dt - timedelta(minutes=cooldown_minutes),
            exclude_comment_id=(pending_asked_id if is_followup_measurement else None),
        ):
            return _reject(
                "safety",
                "Hội thoại này đã được tự động trả lời trong vòng %d phút gần đây" % cooldown_minutes,
            )

        # 2. Giới hạn tốc độ theo bài đăng: tối đa 10 câu tự động trả lời mỗi bài trong 10 phút
        if fb_post_id and store.count_auto_replies_for_post_since(
            tenant_id,
            fb_post_id,
            ref_dt - timedelta(minutes=post_rate_window),
        ) >= post_rate_limit:
            return _reject(
                "safety",
                "Bài đăng đã đạt giới hạn %d lượt tự động trả lời trong vòng %d phút gần đây"
                % (post_rate_limit, post_rate_window),
            )

    if is_followup_measurement:
        _emit("safety", "ok", "Đạt kiểm tra an toàn (phản hồi số đo cho câu hỏi đang chờ của bot)")
    else:
        _emit("safety", "ok", "Đạt kiểm tra an toàn, phạm vi hội thoại và chống spam")

    # ---------- BƯỚC 2: Allowlist Intent (hoặc phân tích số đo phản hồi) ----------
    height_cm: Optional[float] = None
    weight_kg: Optional[float] = None
    asked_size: Optional[str] = None
    asked_color: Optional[str] = None
    asked_qty: Optional[int] = None
    asked_unit: str = "cái"
    specific_question = False

    if is_followup_measurement:
        meas = parse_measurements(message, allow_bare_single=True, rules_cfg=rules_cfg)
        if not meas["ok"]:
            return _reject("intent", meas["reason"], ["size_advice"], label="Đọc số đo")
        height_cm = meas["height_cm"]
        weight_kg = meas["weight_kg"]
        if weight_kg is None:
            h_desc = _fmt_height(height_cm) if height_cm is not None else "không rõ"
            return _reject(
                "intent",
                "Khách chỉ cung cấp chiều cao (%s), chưa có cân nặng — cần nhân viên tư vấn" % h_desc,
                ["size_advice"],
                label="Đọc số đo",
            )
        intents = {"size_advice"}
        sorted_ints = ["size_advice"]
        specific_question = True
        _emit(
            "intent",
            "ok",
            "Đọc số đo phản hồi: %s" % _fmt_measurement_summary(height_cm, weight_kg),
            label="Đọc số đo",
        )
    else:
        intent_res = classify_intent(message, rules_cfg=rules_cfg)
        if not intent_res["ok"]:
            return _reject("intent", intent_res["reason"], intent_res.get("intents") or ())

        intents = intent_res["intents"]
        sorted_ints = _sorted_intents(intents)
        asked_size = intent_res.get("asked_size")
        asked_color = intent_res.get("asked_color")
        asked_qty = intent_res.get("asked_qty")
        asked_unit = intent_res.get("asked_unit") or "cái"
        height_cm = intent_res.get("height_cm")
        weight_kg = intent_res.get("weight_kg")

        # Lớp bảo vệ theo khách khi có from_id: chỉ chặn khi khách hỏi lại ĐÚNG loại câu chung chung đã được trả lời
        # gần đây. Câu cụ thể hơn (có số lượng, size, màu cụ thể hoặc kèm số đo) là câu hỏi mới nên vẫn trả lời.
        specific_question = bool(
            asked_qty or asked_size or asked_color or (height_cm is not None) or (weight_kg is not None)
        )
        if check_cooldown and from_id and not specific_question and store.has_recent_auto_reply_for_customer(
            tenant_id,
            page_id,
            from_id,
            ref_dt - timedelta(minutes=cooldown_minutes),
            intents=sorted_ints,
        ):
            return _reject(
                "safety",
                "Khách hàng này vừa được tự động trả lời đúng câu hỏi này trong vòng %d phút" % cooldown_minutes,
                sorted_ints,
            )
        disabled_ints = [i for i in sorted_ints if i not in enabled_intents]
        if disabled_ints:
            labels = ", ".join(_INTENT_LABELS[i] for i in disabled_ints)
            return _reject(
                "intent",
                "Fanpage chưa bật tự động trả lời cho nhóm câu hỏi: %s" % labels,
                sorted_ints,
            )

        intent_desc = ", ".join(_INTENT_LABELS[i] for i in sorted_ints)
        intent_extras: list[str] = []
        if asked_size:
            intent_extras.append("size %s" % str(asked_size).upper())
        if asked_color:
            intent_extras.append("màu %s" % str(asked_color))
        if height_cm is not None or weight_kg is not None:
            intent_extras.append(_fmt_measurement_summary(height_cm, weight_kg))
        intent_detail = "Nhận diện câu hỏi: %s" % intent_desc
        if intent_extras:
            intent_detail += " (%s)" % ", ".join(intent_extras)
        _emit("intent", "ok", intent_detail)

    # ---------- BƯỚC 3: Facts ----------
    product_code = _resolve_product_code(tenant_id, comment, thread_id, job=post_job)
    if not product_code and is_followup_measurement:
        product_code = str(pending_state.get("product_code") or "").strip()
    if not product_code:
        return _reject("facts", "Bài đăng chưa gắn mã sản phẩm", sorted_ints)

    row = store.catalog_row(product_code)
    if not row:
        return _reject(
            "facts",
            "Không tìm thấy sản phẩm mã %s trong danh mục" % product_code,
            sorted_ints,
        )

    stock = tools.check_stock(row)
    if stock.get("hard"):
        hard_msg = "; ".join(m for _, m in stock["hard"])
        return _reject(
            "facts",
            "Sản phẩm mã %s hết hàng hoặc không kiểm được tồn kho: %s" % (product_code, hard_msg),
            sorted_ints,
        )

    base_page, _ = tools.page_for(row)
    if channel_id in tools.PAGES:
        base_page = tools.PAGES[channel_id]
    resolved_style = writing_style.resolve(tenant_id, channel_id, page=base_page)
    styled_page = writing_style.apply(base_page, tenant_id, channel_id)
    allowed = vpost_api._allowed_for_comment(row, stock, styled_page)

    # R1 / N7: Kiểm tra dữ liệu dòng sản phẩm vô điều kiện cho mọi ý định (giá/size/màu/tư vấn size)
    prod_check = tools.check_product(row, base_page)
    all_hard = [m for _, m in prod_check.get("hard", [])]
    if all_hard:
        return _reject(
            "facts",
            "Sản phẩm mã %s có dữ liệu không hợp lệ (%s)" % (product_code, "; ".join(all_hard)),
            sorted_ints,
        )

    price_val: Optional[int] = allowed["prices"][0] if allowed["prices"] else None
    if "price" in intents and (price_val is None or not (rules.PRICE_MIN <= price_val <= rules.PRICE_MAX)):
        return _reject(
            "facts",
            "Sản phẩm mã %s có dữ liệu không hợp lệ (thiếu giá bán hợp lệ)" % product_code,
            sorted_ints,
        )

    in_stock_sizes = list(allowed.get("sizes") or [])
    if ("size" in intents or "size_advice" in intents) and not in_stock_sizes:
        return _reject(
            "facts",
            "Sản phẩm mã %s chưa có thông tin size còn hàng" % product_code,
            sorted_ints,
        )

    in_stock_colors = list(allowed.get("colors") or [])
    has_color = bool(allowed.get("has_color"))
    if "color" in intents and (not has_color or not in_stock_colors):
        return _reject(
            "facts",
            "Sản phẩm mã %s chưa có thông tin màu còn hàng" % product_code,
            sorted_ints,
        )

    # Kiểm tra size/màu định danh khớp CHÍNH XÁC với giá trị còn hàng của sản phẩm bài đăng (không substring)
    named_err = _check_named_variant_in_stock(
        product_code,
        asked_size=asked_size,
        asked_color=asked_color,
        in_stock_colors=in_stock_colors,
        in_stock_sizes=in_stock_sizes,
        has_color=has_color,
    )
    if named_err:
        return _reject("facts", named_err, sorted_ints)

    if asked_qty is not None:
        if asked_qty < 1:
            return _reject("facts", "Số lượng khách hỏi không hợp lệ — cần nhân viên xem", sorted_ints)
        if asked_qty > MAX_AUTO_QTY:
            return _reject(
                "facts",
                "Khách hỏi số lượng lớn (%d %s) — cần nhân viên báo giá sỉ" % (asked_qty, asked_unit),
                sorted_ints,
            )
        avail = available_quantity(
            stock, asked_size=asked_size, asked_color=asked_color
        )
        if avail is None or avail < asked_qty:
            return _reject(
                "facts",
                "Tồn kho mã %s không đủ %d %s khách hỏi — cần nhân viên tư vấn" % (product_code, asked_qty, asked_unit),
                sorted_ints,
            )

    _, pairs_by_color, is_full_matrix = _build_stock_matrix(
        stock,
        in_stock_colors,
        in_stock_sizes,
        has_color=has_color,
    )

    fact_parts: list[str] = []
    if price_val is not None:
        fact_parts.append("giá %s" % rules.fmt_vnd(price_val))
    if in_stock_sizes:
        fact_parts.append("size %s" % ", ".join(in_stock_sizes))
    if has_color and in_stock_colors:
        fact_parts.append("màu %s" % ", ".join(in_stock_colors))
    facts_detail = (
        "Mã %s: %s" % (product_code, ", ".join(fact_parts))
        if fact_parts
        else ("Tìm thấy dữ liệu sản phẩm mã %s" % product_code)
    )
    _emit("facts", "ok", facts_detail)

    # ---------- BƯỚC 4: Deterministic template answer (NO LLM) ----------
    size_advice_mode: Optional[str] = None
    if "size_advice" in intents:
        if weight_kg is None:
            size_advice_mode = "ask"
            reply_text = render_size_advice_ask(style=resolved_style)
            _emit("compose", "ok", "Soạn câu hỏi xin chiều cao, cân nặng (%d ký tự, không dùng AI)" % len(reply_text))
        else:
            chart, chart_source = writing_style.resolve_size_chart(tenant_id, row.get("loai"))
            rec = recommend_size(
                weight_kg=weight_kg,
                height_cm=height_cm,
                chart=chart,
                in_stock_sizes=in_stock_sizes,
                product_code=product_code,
            )
            meas_txt = _fmt_measurement_summary(height_cm, weight_kg)
            source_label = (
                "bảng %s" % chart_source.split(":", 1)[1]
                if chart_source.startswith("category:")
                else ("bảng shop" if chart_source == "company_default" else "bảng mẫu")
            )
            if not rec["ok"]:
                rows_note = (
                    " · dòng %s" % ", ".join(_fmt_chart_row(r) for r in rec["rows_used"])
                    if rec.get("rows_used")
                    else ""
                )
                return _reject(
                    "size_chart",
                    rec["reason"],
                    sorted_ints,
                    label="Tra bảng size (%s%s)" % (meas_txt, rows_note),
                )
            rows_desc = ", ".join(_fmt_chart_row(r) for r in rec["rows_used"])
            chart_detail = "Số đo: %s → %s [%s] → chọn %s" % (
                meas_txt,
                rows_desc,
                source_label,
                " hoặc ".join(rec["sizes"]),
            )
            if rec.get("conflict_detail"):
                chart_detail += " (%s)" % rec["conflict_detail"]
            _emit("size_chart", "ok", chart_detail, label="Tra bảng size")

            size_advice_mode = "followup_recommend" if is_followup_measurement else "recommend"
            reply_text = render_size_advice_recommendation(
                product_code,
                rec,
                weight_kg=weight_kg,
                height_cm=height_cm,
                style=resolved_style,
            )
            _emit("compose", "ok", "Soạn tư vấn size từ bảng size và tồn kho (%d ký tự, không dùng AI)" % len(reply_text))
    else:
        use_pairs = (not is_full_matrix) and bool(pairs_by_color) and ("size" in intents or "color" in intents)
        reply_text = render_template(
            product_code,
            sorted_ints,
            price=price_val,
            sizes=in_stock_sizes,
            colors=in_stock_colors,
            variant_pairs=pairs_by_color if use_pairs else None,
            style=resolved_style,
            qty=asked_qty,
            unit=asked_unit,
        )
        _emit("compose", "ok", "Soạn từ mẫu dữ liệu sản phẩm (%d ký tự, không dùng AI)" % len(reply_text))

    # ---------- BƯỚC 5: Output guard ----------
    check = vpost_api._check_reply_text(reply_text, row, styled_page)
    if check["block"]:
        reason = "kiểm tra chặn: %s" % "; ".join(check["block"])
        return _reject("output_check", reason, sorted_ints)

    warn_note = " (%d cảnh báo)" % len(check["warn"]) if check.get("warn") else ""
    _emit("output_check", "ok", "Đạt kiểm tra đầu ra (khớp giá, tồn kho, không có PII/link)%s" % warn_note)

    return {
        "status": "ready",
        "specific_question": specific_question,
        "intents": sorted_ints,
        "reply_text": reply_text,
        "product_code": product_code,
        "fb_post_id": fb_post_id,
        "size_advice_mode": size_advice_mode,
        "pending_asked_comment_id": pending_asked_id or None,
        "pending_bot_reply_id": pending_bot_reply_id or None,
    }


def _find_later_can_ban_in_thread(
    tenant_id: str,
    comment: dict,
    thread_id: str,
    *,
    setting: dict,
    compiled: dict,
    rules_cfg: Optional[dict] = None,
    failed_pages: Optional[set[str]] = None,
    ref_dt: datetime,
    ts: str,
    candidate_later: Optional[list[dict]] = None,
) -> Optional[tuple[str, str]]:
    """Kiểm tra xem hội thoại có tin nhắn khách MỚI HƠN có nội dung rơi vào `can_ban` hay không (#6, R6).

    Luôn hợp nhất (union theo `id`) bình luận hiện có trong DB của hội thoại với `candidate_later` để không
    bỏ sót tin nhắn mới hơn đã đồng bộ trước đó trong cùng hội thoại.
    Trả `(reason, blocking_comment_id)` nếu phát hiện, ngược lại `None`.
    """
    cur_key = _comment_sort_key(comment)
    by_id: dict[str, dict] = {}
    for m in store.list_thread_comments(tenant_id, thread_id):
        if m.get("is_from_page") or m.get("status") in ("deleted", "ignored"):
            continue
        if m["id"] == comment["id"]:
            continue
        if _comment_sort_key(m) > cur_key:
            by_id[m["id"]] = m

    for m in candidate_later or ():
        if m.get("is_from_page") or m.get("status") in ("deleted", "ignored"):
            continue
        if m["id"] == comment["id"]:
            continue
        if _comment_sort_key(m) > cur_key:
            by_id.setdefault(m["id"], m)

    later_msgs = sorted(by_id.values(), key=_comment_sort_key)
    for lm in later_msgs:
        if store.has_sent_auto_reply_for_comment(tenant_id, lm["id"]):
            continue
        if store.has_thread_reply_or_operator_activity(tenant_id, lm, now_ts=ts):
            continue
        ev = _evaluate_comment(
            tenant_id,
            lm,
            thread_id=thread_id,
            setting=setting,
            compiled=compiled,
            rules_cfg=rules_cfg,
            recent_texts=None,
            failed_pages=failed_pages,
            ref_dt=ref_dt,
            ts=ts,
            check_cooldown=False,
            allow_child_for_lookahead=True,
        )
        if ev["status"] == "reject":
            return ev["reason"], lm["id"]
    return None


def process_comment(
    tenant_id: str,
    comment: dict,
    *,
    model=None,  # bỏ qua có chủ đích: allowlist thuần luật
    rules_cfg: Optional[dict] = None,
    recent_texts: Optional[list[str]] = None,
    failed_pages: Optional[set[str]] = None,
    now_dt: Optional[datetime] = None,
    _later_in_tick: Optional[list[dict]] = None,
    _replied_threads_in_tick: Optional[set[str]] = None,
    _thread_id: Optional[str] = None,
    _post_recent_texts: Optional[list[str]] = None,
) -> dict:
    """Chạy đúng 7 bước của pipeline cho MỘT bình luận khách hàng."""
    import vpost_api

    cid = str(comment.get("id") or "").strip()
    if not cid or comment.get("is_from_page") or comment.get("status") in ("deleted", "ignored"):
        return {"action": "ignored", "tagged": False, "commentId": cid}

    thread_id = _thread_id or store.resolve_thread_root_id(tenant_id, comment)
    page_id = _comment_page_id(comment)
    fb_post_id = str(comment.get("fb_post_id") or "").strip()
    from_id = str(comment.get("from_id") or "").strip()
    ref_dt = now_dt or _now()
    ts = schedule.iso_z(ref_dt)

    # Idempotency guard: đã tự động gửi cho bình luận này rồi → không gửi lại, không gắn can_ban
    if store.has_sent_auto_reply_for_comment(tenant_id, cid):
        return {
            "action": "already_sent",
            "tagged": False,
            "threadId": thread_id,
            "commentId": cid,
        }

    # Chính bình luận này đã có trả lời của Page (gốc FB hoặc nhân viên) hay thao tác nhân viên → bỏ qua không gắn can_ban
    if store.has_thread_reply_or_operator_activity(tenant_id, comment, now_ts=ts):
        cur_state = store.get_thread_state(tenant_id, thread_id, now_dt=ref_dt)
        if cur_state and str(cur_state.get("asked_comment_id") or "") != cid:
            store.clear_thread_state(tenant_id, thread_id)
        return {
            "action": "ignored",
            "tagged": False,
            "threadId": thread_id,
            "commentId": cid,
        }

    def _step_now() -> datetime:
        return now_dt if now_dt is not None else _now()

    run_id = agent_runs.start_run(
        tenant_id,
        thread_id,
        "auto_reply",
        comment_id=cid,
        now_dt=_step_now(),
    )

    def _add_step(
        key: str,
        status: str,
        detail: Optional[str] = None,
        *,
        label: Optional[str] = None,
    ) -> None:
        agent_runs.add_step(
            tenant_id,
            run_id,
            key,
            status,
            label=label,
            detail=detail,
            now_dt=_step_now(),
        )

    pending_state = store.get_thread_state(tenant_id, thread_id, now_dt=ref_dt)
    is_followup_candidate = bool(
        pending_state
        and pending_state.get("state") == "awaiting_measurements"
        and str(pending_state.get("asked_comment_id") or "") != cid
    )

    def _clear_pending_if_followup() -> None:
        if is_followup_candidate:
            store.clear_thread_state(tenant_id, thread_id)

    def _finish_can_ban(
        res: dict,
        *,
        action_status: str = "ok",
        action_detail: Optional[str] = None,
    ) -> dict:
        _clear_pending_if_followup()
        detail = action_detail
        if detail is None:
            detail = (
                "Đã gắn nhãn Cần bạn chờ nhân viên xử lý"
                if res.get("tagged")
                else (res.get("reason") or "Chuyển nhân viên xử lý")
            )
        _add_step("action", action_status, detail, label="Cần bạn")
        agent_runs.finish_run(tenant_id, run_id, status="done", outcome="can_ban", now_dt=_step_now())
        res["agentRunId"] = run_id
        return res

    def _finish_would_send(res: dict) -> dict:
        _add_step(
            "action",
            "ok",
            "Chế độ chạy thử — đã tạo câu trả lời mẫu, chưa gửi lên Facebook",
            label="Chạy thử",
        )
        agent_runs.finish_run(tenant_id, run_id, status="done", outcome="would_send", now_dt=_step_now())
        res["agentRunId"] = run_id
        return res

    def _finish_failed(res: dict) -> dict:
        _clear_pending_if_followup()
        _add_step("action", "error", res.get("reason") or "Gửi tự động lên Facebook thất bại", label="Gửi")
        agent_runs.finish_run(tenant_id, run_id, status="error", outcome="failed", now_dt=_step_now())
        res["agentRunId"] = run_id
        return res

    try:
        msg_len = len(str(comment.get("message") or "").strip())
        _add_step(
            "read",
            "ok",
            "Đã đọc bình luận khách hàng (%d ký tự)" % msg_len if msg_len else "Đã đọc bình luận (không có nội dung chữ)",
        )

        # N9: tối đa 1 lần tự động trả lời mỗi hội thoại trong 1 lượt tick; bình luận bổ sung gắn 'Cần bạn', không bỏ rơi
        if _replied_threads_in_tick is not None and thread_id in _replied_threads_in_tick:
            tick_reason = "Hội thoại đã có 1 phản hồi tự động trong lượt này — gắn 'Cần bạn' cho bình luận bổ sung"
            _add_step("safety", "blocked", tick_reason)
            return _finish_can_ban(
                _record_rejection(
                    tenant_id,
                    page_id=page_id,
                    fb_post_id=fb_post_id,
                    thread_id=thread_id,
                    comment_id=cid,
                    from_id=from_id,
                    reason=tick_reason,
                    ts=ts,
                )
            )

        compiled = _get_compiled_rules(rules_cfg)
        setting = (
            store.get_auto_reply_setting_or_default(tenant_id, page_id)
            if page_id
            else store.default_auto_reply_setting(tenant_id, "")
        )

        ev = _evaluate_comment(
            tenant_id,
            comment,
            thread_id=thread_id,
            setting=setting,
            compiled=compiled,
            rules_cfg=rules_cfg,
            recent_texts=recent_texts,
            post_recent_texts=_post_recent_texts,
            failed_pages=failed_pages,
            ref_dt=ref_dt,
            ts=ts,
            check_cooldown=True,
            pending_state=(pending_state if is_followup_candidate else None),
            step_cb=_add_step,
        )
        if ev["status"] == "reject":
            return _finish_can_ban(
                _record_rejection(
                    tenant_id,
                    page_id=page_id,
                    fb_post_id=fb_post_id,
                    thread_id=thread_id,
                    comment_id=cid,
                    from_id=from_id,
                    intents=ev["intents"],
                    reason=ev["reason"],
                    ts=ts,
                )
            )

        sorted_ints = ev["intents"]
        reply_text = ev["reply_text"]
        fb_post_id = ev.get("fb_post_id") or fb_post_id
        size_advice_mode = ev.get("size_advice_mode")
        is_followup_send = size_advice_mode == "followup_recommend"
        pending_asked_id = ev.get("pending_asked_comment_id") if is_followup_send else None
        pending_bot_reply_id = ev.get("pending_bot_reply_id") if is_followup_send else None

        # Nếu hội thoại đang mang nhãn 'can_ban' chưa được nhân viên xử lý → không tự động trả lời đè lên
        existing_att = store.get_thread_attentions(tenant_id, [thread_id]).get(thread_id)
        if existing_att and existing_att.get("tag") == "can_ban":
            reason = "Hội thoại đang gắn nhãn 'Cần bạn' chờ nhân viên xử lý"
            return _finish_can_ban(
                _record_rejection(
                    tenant_id,
                    page_id=page_id,
                    fb_post_id=fb_post_id,
                    thread_id=thread_id,
                    comment_id=cid,
                    from_id=from_id,
                    intents=sorted_ints,
                    reason=reason,
                    ts=ts,
                    tag_attention=False,
                ),
                action_status="blocked",
                action_detail=reason,
            )

        # Nếu cùng hội thoại đã có tin nhắn khách MỚI HƠN rơi vào `can_ban` → không trả lời tin nhắn cũ (#6, R6)
        later_hit = _find_later_can_ban_in_thread(
            tenant_id,
            comment,
            thread_id,
            setting=setting,
            compiled=compiled,
            rules_cfg=rules_cfg,
            failed_pages=failed_pages,
            ref_dt=ref_dt,
            ts=ts,
            candidate_later=_later_in_tick,
        )
        if later_hit:
            later_reason, blocking_cid = later_hit
            later_tick_ids = {m["id"] for m in (_later_in_tick or ())}
            should_tag = blocking_cid not in later_tick_ids
            reason = later_reason if should_tag else "Bỏ qua bình luận cũ vì có tin nhắn mới hơn cần nhân viên xử lý"
            return _finish_can_ban(
                _record_rejection(
                    tenant_id,
                    page_id=page_id,
                    fb_post_id=fb_post_id,
                    thread_id=thread_id,
                    comment_id=cid,
                    from_id=from_id,
                    intents=sorted_ints,
                    reason=reason,
                    ts=ts,
                    tag_attention=should_tag,
                ),
                action_status="blocked",
                action_detail=reason,
            )

        # ---------- BƯỚC 6: Action ----------
        if is_kill_switch_enabled():
            reason = "Tự động trả lời đang tạm tắt toàn hệ thống"
            return _finish_can_ban(
                _record_rejection(
                    tenant_id,
                    page_id=page_id,
                    fb_post_id=fb_post_id,
                    thread_id=thread_id,
                    comment_id=cid,
                    from_id=from_id,
                    intents=sorted_ints,
                    reason=reason,
                    ts=ts,
                ),
                action_status="blocked",
                action_detail=reason,
            )

        if setting["mode"] != "live":
            store.append_auto_reply_log(
                tenant_id,
                page_id=page_id,
                fb_post_id=fb_post_id,
                thread_id=thread_id,
                comment_id=cid,
                from_id=from_id,
                intents=sorted_ints,
                action="would_send",
                reason="",
                text=reply_text,
                created_at=ts,
            )
            log.info(
                "comment_auto_reply tenant=%s page_id=%s thread_id=%s comment_id=%s action=would_send intents=%s",
                tenant_id,
                page_id,
                thread_id,
                cid,
                ",".join(sorted_ints),
            )
            return _finish_would_send({
                "action": "would_send",
                "tagged": False,
                "threadId": thread_id,
                "commentId": cid,
                "intents": sorted_ints,
                "reason": None,
                "text": reply_text,
            })

        # Mode live: giữ khoá tư vấn theo (tenant_id, page_id) để tuần tự hoá kiểm tra đã trả lời,
        # phạm vi hội thoại, intents đang bật (N11), cooldown hội thoại/bài đăng/khách, trần giờ/ngày, gửi FB và ghi log.
        cooldown_minutes = compiled["cooldown_minutes"]
        post_rate_limit = compiled["post_rate_limit"]
        post_rate_window = compiled["post_rate_window_minutes"]
        with store.auto_reply_page_lock(tenant_id, page_id):
            if store.has_sent_auto_reply_for_comment(tenant_id, cid):
                _add_step("action", "skipped", "Bình luận này đã được tự động trả lời trước đó", label="Gửi")
                agent_runs.finish_run(tenant_id, run_id, status="done", outcome="sent", now_dt=_step_now())
                return {
                    "action": "already_sent",
                    "tagged": False,
                    "threadId": thread_id,
                    "commentId": cid,
                    "intents": sorted_ints,
                    "reason": None,
                    "text": reply_text,
                    "agentRunId": run_id,
                }

            if store.has_thread_reply_or_operator_activity(tenant_id, comment, now_ts=ts):
                _clear_pending_if_followup()
                _add_step("action", "skipped", "Hội thoại đã có phản hồi của Fanpage hoặc thao tác nhân viên", label="Cần bạn")
                agent_runs.finish_run(tenant_id, run_id, status="done", outcome=None, now_dt=_step_now())
                return {
                    "action": "ignored",
                    "tagged": False,
                    "threadId": thread_id,
                    "commentId": cid,
                    "agentRunId": run_id,
                }

            if is_followup_send:
                live_state = store.get_thread_state(tenant_id, thread_id, now_dt=ref_dt)
                if (
                    not live_state
                    or live_state.get("state") != "awaiting_measurements"
                    or str(live_state.get("asked_comment_id") or "") != str(pending_asked_id or "")
                ):
                    reason = "Trạng thái chờ số đo đã hết hạn hoặc đã được xử lý — cần nhân viên xử lý"
                    return _finish_can_ban(
                        _record_rejection(
                            tenant_id,
                            page_id=page_id,
                            fb_post_id=fb_post_id,
                            thread_id=thread_id,
                            comment_id=cid,
                            from_id=from_id,
                            intents=sorted_ints,
                            reason=reason,
                            ts=ts,
                        ),
                        action_status="blocked",
                        action_detail=reason,
                    )
                if store.thread_has_activity_other_than_bot_question(
                    tenant_id,
                    thread_id,
                    asked_comment_id=pending_asked_id,
                    bot_reply_id=pending_bot_reply_id or "",
                    now_ts=ts,
                ):
                    reason = "Hội thoại đã có phản hồi của Fanpage hoặc thao tác nhân viên — cần nhân viên xử lý"
                    return _finish_can_ban(
                        _record_rejection(
                            tenant_id,
                            page_id=page_id,
                            fb_post_id=fb_post_id,
                            thread_id=thread_id,
                            comment_id=cid,
                            from_id=from_id,
                            intents=sorted_ints,
                            reason=reason,
                            ts=ts,
                        ),
                        action_status="blocked",
                        action_detail=reason,
                    )
            elif store.thread_has_any_page_reply_or_operator_activity(tenant_id, thread_id, now_ts=ts):
                reason = "Hội thoại đã có phản hồi của Fanpage hoặc thao tác nhân viên — cần nhân viên xử lý"
                return _finish_can_ban(
                    _record_rejection(
                        tenant_id,
                        page_id=page_id,
                        fb_post_id=fb_post_id,
                        thread_id=thread_id,
                        comment_id=cid,
                        from_id=from_id,
                        intents=sorted_ints,
                        reason=reason,
                        ts=ts,
                    ),
                    action_status="blocked",
                    action_detail=reason,
                )

            att_now = store.get_thread_attentions(tenant_id, [thread_id]).get(thread_id)
            if att_now and att_now.get("tag") == "can_ban":
                reason = "Hội thoại đang gắn nhãn 'Cần bạn' chờ nhân viên xử lý"
                return _finish_can_ban(
                    _record_rejection(
                        tenant_id,
                        page_id=page_id,
                        fb_post_id=fb_post_id,
                        thread_id=thread_id,
                        comment_id=cid,
                        from_id=from_id,
                        intents=sorted_ints,
                        reason=reason,
                        ts=ts,
                        tag_attention=False,
                    ),
                    action_status="blocked",
                    action_detail=reason,
                )

            if is_kill_switch_enabled():
                reason = "Tự động trả lời đang tạm tắt toàn hệ thống"
                return _finish_can_ban(
                    _record_rejection(
                        tenant_id,
                        page_id=page_id,
                        fb_post_id=fb_post_id,
                        thread_id=thread_id,
                        comment_id=cid,
                        from_id=from_id,
                        intents=sorted_ints,
                        reason=reason,
                        ts=ts,
                    ),
                    action_status="blocked",
                    action_detail=reason,
                )

            live_setting = (
                store.get_auto_reply_setting_or_default(tenant_id, page_id)
                if page_id
                else setting
            )
            if not live_setting["enabled"]:
                reason = "Chưa bật tự động trả lời cho Fanpage này"
                return _finish_can_ban(
                    _record_rejection(
                        tenant_id,
                        page_id=page_id,
                        fb_post_id=fb_post_id,
                        thread_id=thread_id,
                        comment_id=cid,
                        from_id=from_id,
                        intents=sorted_ints,
                        reason=reason,
                        ts=ts,
                    ),
                    action_status="blocked",
                    action_detail=reason,
                )

            # N11: kiểm tra lại danh sách intents đang bật của Page ngay dưới khoá
            live_enabled_intents = set(live_setting.get("intents") or ()) & _VALID_INTENT_SET
            live_disabled_ints = [i for i in sorted_ints if i not in live_enabled_intents]
            if live_disabled_ints:
                labels = ", ".join(_INTENT_LABELS[i] for i in live_disabled_ints)
                reason = "Fanpage chưa bật tự động trả lời cho nhóm câu hỏi: %s" % labels
                return _finish_can_ban(
                    _record_rejection(
                        tenant_id,
                        page_id=page_id,
                        fb_post_id=fb_post_id,
                        thread_id=thread_id,
                        comment_id=cid,
                        from_id=from_id,
                        intents=sorted_ints,
                        reason=reason,
                        ts=ts,
                    ),
                    action_status="blocked",
                    action_detail=reason,
                )

            if live_setting["mode"] != "live":
                store.append_auto_reply_log(
                    tenant_id,
                    page_id=page_id,
                    fb_post_id=fb_post_id,
                    thread_id=thread_id,
                    comment_id=cid,
                    from_id=from_id,
                    intents=sorted_ints,
                    action="would_send",
                    reason="",
                    text=reply_text,
                    created_at=ts,
                )
                return _finish_would_send({
                    "action": "would_send",
                    "tagged": False,
                    "threadId": thread_id,
                    "commentId": cid,
                    "intents": sorted_ints,
                    "reason": None,
                    "text": reply_text,
                })

            # Kiểm tra lại cooldown theo hội thoại, tốc độ theo bài đăng và (khi có from_id) cooldown theo khách dưới khoá
            if store.has_recent_auto_reply_for_thread(
                tenant_id,
                thread_id,
                ref_dt - timedelta(minutes=cooldown_minutes),
                exclude_comment_id=(pending_asked_id if is_followup_send else None),
            ):
                reason = "Hội thoại này đã được tự động trả lời trong vòng %d phút gần đây" % cooldown_minutes
                return _finish_can_ban(
                    _record_rejection(
                        tenant_id,
                        page_id=page_id,
                        fb_post_id=fb_post_id,
                        thread_id=thread_id,
                        comment_id=cid,
                        from_id=from_id,
                        intents=sorted_ints,
                        reason=reason,
                        ts=ts,
                    ),
                    action_status="blocked",
                    action_detail=reason,
                )

            if fb_post_id and store.count_auto_replies_for_post_since(
                tenant_id,
                fb_post_id,
                ref_dt - timedelta(minutes=post_rate_window),
            ) >= post_rate_limit:
                reason = (
                    "Bài đăng đã đạt giới hạn %d lượt tự động trả lời trong vòng %d phút gần đây"
                    % (post_rate_limit, post_rate_window)
                )
                return _finish_can_ban(
                    _record_rejection(
                        tenant_id,
                        page_id=page_id,
                        fb_post_id=fb_post_id,
                        thread_id=thread_id,
                        comment_id=cid,
                        from_id=from_id,
                        intents=sorted_ints,
                        reason=reason,
                        ts=ts,
                    ),
                    action_status="blocked",
                    action_detail=reason,
                )

            if (
                not is_followup_send
                and from_id
                and not ev.get("specific_question")
                and store.has_recent_auto_reply_for_customer(
                    tenant_id,
                    page_id,
                    from_id,
                    ref_dt - timedelta(minutes=cooldown_minutes),
                    intents=sorted_ints,
                )
            ):
                reason = "Khách hàng này vừa được tự động trả lời đúng câu hỏi này trong vòng %d phút" % cooldown_minutes
                return _finish_can_ban(
                    _record_rejection(
                        tenant_id,
                        page_id=page_id,
                        fb_post_id=fb_post_id,
                        thread_id=thread_id,
                        comment_id=cid,
                        from_id=from_id,
                        intents=sorted_ints,
                        reason=reason,
                        ts=ts,
                    ),
                    action_status="blocked",
                    action_detail=reason,
                )

            # Kiểm tra trần giờ & ngày của Page dưới khoá
            hourly_sent = store.count_auto_replies_since(tenant_id, page_id, ref_dt - timedelta(hours=1))
            daily_sent = store.count_auto_replies_since(tenant_id, page_id, _local_day_start(ref_dt))
            if hourly_sent >= int(live_setting["hourly_cap"]) or daily_sent >= int(live_setting["daily_cap"]):
                reason = "vượt trần tự trả lời"
                return _finish_can_ban(
                    _record_rejection(
                        tenant_id,
                        page_id=page_id,
                        fb_post_id=fb_post_id,
                        thread_id=thread_id,
                        comment_id=cid,
                        from_id=from_id,
                        intents=sorted_ints,
                        reason=reason,
                        ts=ts,
                    ),
                    action_status="blocked",
                    action_detail=reason,
                )

            # Gửi qua đúng đường gửi của người vận hành với clientId = "auto:" + comment_id
            _add_step("action", "running", "Đang gửi trả lời tự động lên Facebook…", label="Gửi")
            client_id = "auto:" + cid
            try:
                send_res = vpost_api.send_thread_reply(
                    thread_id,
                    reply_text,
                    client_id,
                    tenant_id=tenant_id,
                    sent_by="auto",
                    clear_attention=False,
                    agent_run_id=run_id,
                    allow_pending_size_advice_id=pending_asked_id,
                )
            except vpost_api.ApiError as e:
                detail = e.detail if isinstance(e.detail, dict) else {}
                err_code = str(detail.get("code") or "UPSTREAM_ERROR")
                err_msg = str(detail.get("message") or "Lỗi gửi bình luận lên Facebook")
                if err_code == "BLOCKED":
                    reason = "kiểm tra chặn: %s" % err_msg
                    return _finish_can_ban(
                        _record_rejection(
                            tenant_id,
                            page_id=page_id,
                            fb_post_id=fb_post_id,
                            thread_id=thread_id,
                            comment_id=cid,
                            from_id=from_id,
                            intents=sorted_ints,
                            reason=reason,
                            ts=ts,
                        ),
                        action_status="blocked",
                        action_detail=reason,
                    )
                if err_code == "CONFLICT":
                    if store.has_sent_auto_reply_for_comment(tenant_id, cid):
                        _add_step("action", "skipped", "Bình luận này đã được tự động trả lời trước đó", label="Gửi")
                        agent_runs.finish_run(tenant_id, run_id, status="done", outcome="sent", now_dt=_step_now())
                        return {
                            "action": "already_sent",
                            "tagged": False,
                            "threadId": thread_id,
                            "commentId": cid,
                            "intents": sorted_ints,
                            "reason": None,
                            "text": reply_text,
                            "agentRunId": run_id,
                        }
                    reason = "Bỏ qua do đang có lượt gửi khác trên hội thoại này (CONFLICT)"
                    return _finish_can_ban(
                        _record_rejection(
                            tenant_id,
                            page_id=page_id,
                            fb_post_id=fb_post_id,
                            thread_id=thread_id,
                            comment_id=cid,
                            from_id=from_id,
                            intents=sorted_ints,
                            reason=reason,
                            ts=ts,
                            tag_attention=False,
                        ),
                        action_status="blocked",
                        action_detail=reason,
                    )
                if err_code == "NOT_FOUND":
                    reason = "Không tìm thấy hội thoại gốc để tự động trả lời — cần nhân viên kiểm tra"
                    return _finish_can_ban(
                        _record_rejection(
                            tenant_id,
                            page_id=page_id,
                            fb_post_id=fb_post_id,
                            thread_id=thread_id,
                            comment_id=cid,
                            from_id=from_id,
                            intents=sorted_ints,
                            reason=reason,
                            ts=ts,
                        ),
                        action_status="blocked",
                        action_detail=reason,
                    )
                if failed_pages is not None and page_id:
                    failed_pages.add(page_id)
                log.warning(
                    "comment_auto_reply_error tenant=%s page_id=%s thread_id=%s comment_id=%s code=%s",
                    tenant_id,
                    page_id,
                    thread_id,
                    cid,
                    err_code,
                )
                res = _record_rejection(
                    tenant_id,
                    page_id=page_id,
                    fb_post_id=fb_post_id,
                    thread_id=thread_id,
                    comment_id=cid,
                    from_id=from_id,
                    intents=sorted_ints,
                    action="failed",
                    reason="Gửi tự động lên Facebook thất bại (%s)" % err_code,
                    text=reply_text,
                    ts=ts,
                )
                res["errorCode"] = err_code
                res["rateLimited"] = err_code == "RATE_LIMITED"
                return _finish_failed(res)
            except facebook.FacebookError as e:
                if failed_pages is not None and page_id:
                    failed_pages.add(page_id)
                log.warning(
                    "comment_auto_reply_error tenant=%s page_id=%s thread_id=%s comment_id=%s code=%s",
                    tenant_id,
                    page_id,
                    thread_id,
                    cid,
                    e.code,
                )
                res = _record_rejection(
                    tenant_id,
                    page_id=page_id,
                    fb_post_id=fb_post_id,
                    thread_id=thread_id,
                    comment_id=cid,
                    from_id=from_id,
                    intents=sorted_ints,
                    action="failed",
                    reason="Gửi tự động lên Facebook thất bại (%s)" % e.code,
                    text=reply_text,
                    ts=ts,
                )
                res["errorCode"] = e.code
                res["rateLimited"] = e.code == "RATE_LIMITED"
                return _finish_failed(res)
            except Exception as e:
                if failed_pages is not None and page_id:
                    failed_pages.add(page_id)
                log.warning(
                    "comment_auto_reply_error tenant=%s page_id=%s thread_id=%s comment_id=%s err=%s",
                    tenant_id,
                    page_id,
                    thread_id,
                    cid,
                    type(e).__name__,
                )
                res = _record_rejection(
                    tenant_id,
                    page_id=page_id,
                    fb_post_id=fb_post_id,
                    thread_id=thread_id,
                    comment_id=cid,
                    from_id=from_id,
                    intents=sorted_ints,
                    action="failed",
                    reason="Gửi tự động lên Facebook thất bại (%s)" % type(e).__name__,
                    text=reply_text,
                    ts=ts,
                )
                res["errorCode"] = "UPSTREAM_ERROR"
                res["rateLimited"] = False
                return _finish_failed(res)

            if send_res.get("alreadySent"):
                if is_followup_send:
                    store.clear_thread_state(tenant_id, thread_id)
                reply_msg_id = str((send_res.get("message") or {}).get("id") or "")
                _add_step("action", "skipped", "Bình luận này đã được tự động trả lời trước đó", label="Gửi")
                agent_runs.finish_run(
                    tenant_id,
                    run_id,
                    status="done",
                    outcome="sent",
                    reply_message_id=reply_msg_id or None,
                    now_dt=_step_now(),
                )
                return {
                    "action": "already_sent",
                    "tagged": False,
                    "threadId": thread_id,
                    "commentId": cid,
                    "intents": sorted_ints,
                    "reason": None,
                    "text": reply_text,
                    "agentRunId": run_id,
                }

            reply_msg = send_res.get("message") or {}
            reply_msg_id = str(reply_msg.get("id") or "")
            if size_advice_mode == "ask":
                expires_ts = schedule.iso_z(ref_dt + timedelta(hours=SIZE_ADVICE_STATE_TTL_HOURS))
                store.set_thread_state(
                    tenant_id,
                    thread_id,
                    product_code=ev["product_code"],
                    state="awaiting_measurements",
                    asked_comment_id=cid,
                    bot_reply_id=reply_msg_id,
                    expires_at=expires_ts,
                    now_ts=ts,
                )
            elif is_followup_send:
                store.clear_thread_state(tenant_id, thread_id)
            store.append_auto_reply_log(
                tenant_id,
                page_id=page_id,
                fb_post_id=fb_post_id,
                thread_id=thread_id,
                comment_id=cid,
                from_id=from_id,
                intents=sorted_ints,
                action="sent",
                reason="",
                text=reply_text,
                fb_reply_id=reply_msg_id,
                created_at=ts,
            )
            action_msg = (
                "Đã hỏi chiều cao và cân nặng trên Facebook (chờ phản hồi 24h)"
                if size_advice_mode == "ask"
                else (
                    "Đã gửi tư vấn size lên Facebook"
                    if size_advice_mode in ("recommend", "followup_recommend")
                    else "Đã gửi trả lời tự động lên Facebook"
                )
            )
            _add_step("action", "ok", action_msg, label="Gửi")
            agent_runs.finish_run(
                tenant_id,
                run_id,
                status="done",
                outcome="sent",
                reply_message_id=reply_msg_id or None,
                now_dt=_step_now(),
            )
            log.info(
                "comment_auto_reply tenant=%s page_id=%s thread_id=%s comment_id=%s action=sent reply_id=%s intents=%s",
                tenant_id,
                page_id,
                thread_id,
                cid,
                reply_msg_id,
                ",".join(sorted_ints),
            )
            return {
                "action": "sent",
                "tagged": False,
                "threadId": thread_id,
                "commentId": cid,
                "messageId": reply_msg_id,
                "intents": sorted_ints,
                "reason": None,
                "text": reply_text,
                "agentRunId": run_id,
            }
    except Exception as exc:
        try:
            _add_step("action", "error", "Lỗi hệ thống khi xử lý (%s)" % type(exc).__name__, label="Gửi")
            agent_runs.finish_run(tenant_id, run_id, status="error", outcome="failed", now_dt=_step_now())
        except Exception:
            pass
        raise


def run_auto_reply(
    tenant_id: str,
    comment_ids: Iterable[str],
    *,
    model=None,
    rules_cfg: Optional[dict] = None,
    stop_event: Optional[threading.Event] = None,
    now_dt: Optional[datetime] = None,
) -> dict:
    """Chạy pipeline tự động trả lời theo thứ tự thời gian (cũ → mới) cho danh sách `comment_ids` mới đồng bộ."""
    ids = list(dict.fromkeys(str(x).strip() for x in (comment_ids or ()) if str(x).strip()))
    summary = {
        "tenantId": tenant_id,
        "evaluated": 0,
        "sent": 0,
        "wouldSend": 0,
        "skipped": 0,
        "failed": 0,
        "tagged": 0,
        "rateLimited": False,
    }
    if not ids:
        return summary

    comments = store.list_comments_by_ids(tenant_id, ids)
    eligible_comments = [
        c for c in comments
        if not c.get("is_from_page") and c.get("status") not in ("deleted", "ignored")
    ]
    # Sắp xếp cũ → mới để bình luận cùng hội thoại luôn xử lý đúng thứ tự thời gian
    eligible_comments.sort(key=_comment_sort_key)

    thread_id_by_cid: dict[str, str] = {}
    by_thread: dict[str, list[dict]] = {}
    for c in eligible_comments:
        tid = store.resolve_thread_root_id(tenant_id, c)
        thread_id_by_cid[c["id"]] = tid
        by_thread.setdefault(tid, []).append(c)

    ref_dt = now_dt or _now()
    compiled = _get_compiled_rules(rules_cfg)
    post_spam_window = compiled["post_spam_window_minutes"]
    failed_pages: set[str] = set()
    replied_threads_in_tick: set[str] = set()
    recent_cache: dict[tuple[str, str, str], list[str]] = {}
    post_recent_cache: dict[tuple[str, str], list[str]] = {}

    for comment in eligible_comments:
        if stop_event is not None and stop_event.is_set():
            break
        cid = comment["id"]
        thread_id = thread_id_by_cid[cid]
        page_id = _comment_page_id(comment)
        from_id = str(comment.get("from_id") or "").strip()
        fb_post_id = str(comment.get("fb_post_id") or "").strip()
        if from_id:
            cache_key = (page_id, from_id, fb_post_id)
            if cache_key not in recent_cache:
                recent_cache[cache_key] = _recent_customer_texts(tenant_id, page_id, from_id, fb_post_id, ref_dt)
            cust_recents = recent_cache[cache_key]
        else:
            cust_recents = []

        post_recents: Optional[list[str]] = None
        if page_id and fb_post_id:
            post_key = (page_id, fb_post_id)
            if post_key not in post_recent_cache:
                post_recent_cache[post_key] = _recent_post_texts(
                    tenant_id,
                    page_id,
                    fb_post_id,
                    ref_dt,
                    window_minutes=post_spam_window,
                )
            post_recents = post_recent_cache[post_key]

        thread_batch = by_thread.get(thread_id) or []
        cur_key = _comment_sort_key(comment)
        later_in_tick = [m for m in thread_batch if _comment_sort_key(m) > cur_key]

        try:
            res = process_comment(
                tenant_id,
                comment,
                model=model,
                rules_cfg=rules_cfg,
                recent_texts=cust_recents,
                failed_pages=failed_pages,
                now_dt=ref_dt,
                _later_in_tick=later_in_tick if later_in_tick else None,
                _replied_threads_in_tick=replied_threads_in_tick,
                _thread_id=thread_id,
                _post_recent_texts=post_recents,
            )
        except Exception as e:
            log.warning(
                "comment_auto_reply_error tenant=%s page_id=%s thread_id=%s comment_id=%s err=%s",
                tenant_id,
                page_id,
                thread_id,
                cid,
                type(e).__name__,
            )
            res = _record_rejection(
                tenant_id,
                page_id=page_id,
                fb_post_id=fb_post_id,
                thread_id=thread_id,
                comment_id=cid,
                from_id=from_id,
                action="failed",
                reason="Lỗi hệ thống khi xử lý tự động trả lời (%s)" % type(e).__name__,
                ts=schedule.iso_z(ref_dt),
            )

        action = res.get("action")
        if action in ("sent", "would_send"):
            replied_threads_in_tick.add(thread_id)
        if action in ("ignored", "already_sent"):
            continue
        summary["evaluated"] += 1
        if action == "sent":
            summary["sent"] += 1
        elif action == "would_send":
            summary["wouldSend"] += 1
        elif action == "failed":
            summary["failed"] += 1
        else:
            summary["skipped"] += 1
        if res.get("tagged"):
            summary["tagged"] += 1
        if res.get("rateLimited"):
            summary["rateLimited"] = True

    return summary
