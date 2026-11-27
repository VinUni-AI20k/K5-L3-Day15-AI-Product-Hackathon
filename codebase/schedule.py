"""Chọn giờ đăng — code xác định, không để AI đếm ngày giờ."""
from datetime import datetime, time, timedelta, timezone

TZ = timezone(timedelta(hours=7))   # Asia/Ho_Chi_Minh (không đổi giờ mùa hè)
MIN_LEAD = timedelta(minutes=10)    # Graph API chỉ nhận bài hẹn giờ cách hiện tại ≥10 phút
HORIZON_DAYS = 30


def now():
    return datetime.now(TZ)


def next_free_slot(page, taken, at=None):
    """Khung giờ trống gần nhất của page (theo page["slots"] 'HH:MM'), ≥10 phút sau `at`, trong 30 ngày.
    taken: tập chuỗi ISO đã có bài. Hết khung → None."""
    at = at or now()
    slots = sorted(page.get("slots") or [])
    for d in range(HORIZON_DAYS + 1):
        day = (at + timedelta(days=d)).date()
        for hm in slots:
            h, m = (int(x) for x in hm.split(":"))
            t = datetime.combine(day, time(h, m), TZ)
            if t >= at + MIN_LEAD and t.isoformat() not in taken:
                return t
    return None


def iso_z(dt):
    """datetime → '2026-11-28T02:00:00.000Z'. Giao diện VPOST kiểm bằng zod z.iso.datetime(): chỉ nhận hậu tố Z."""
    u = dt.astimezone(timezone.utc)
    return u.strftime("%Y-%m-%dT%H:%M:%S.") + "%03dZ" % (u.microsecond // 1000)


def parse_when(s):
    """Giờ người duyệt tự chọn ('2026-11-28T09:00' hoặc ISO có múi) → datetime giờ VN."""
    t = datetime.fromisoformat(s)
    return t.replace(tzinfo=TZ) if t.tzinfo is None else t.astimezone(TZ)
