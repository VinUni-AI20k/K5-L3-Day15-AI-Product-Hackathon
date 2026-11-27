"""BẢN GIẢ (stub) — chỉ để luồng chạy hết trước khi có code thật. KHÔNG phải bản nộp cuối.

agent.py dùng file này khi CHƯA có hàm thật:
  - planner.py  (Trường):  trich_rang_buoc, xep_lich, sua_lich
  - tools.py    (Thành):   tra_diem_choi, tra_lich_show, tra_thoi_tiet, uoc_thoi_gian_di
  - validator.py (Thành):  kiem_lich_trinh, tinh_tong_tien
Có hàm thật cùng tên → agent.py tự dùng hàm thật, file này không còn được gọi. Ghi trong spec.md §4: phần nào còn giả.

Chữ ký hàm ở đây = hợp đồng (PHAN-CONG.md mục 2). Bản thật phải giữ đúng chữ ký và kiểu trả về:
  trich_rang_buoc(text) -> RangBuoc dict
  tra_diem_choi() -> list[diem] · tra_lich_show(ngay) -> list[show] · tra_thoi_tiet(ngay) -> dict
  uoc_thoi_gian_di(a_id, b_id) -> int (phút)
  xep_lich(rang_buoc, du_lieu) -> Lich (list) · sua_lich(rang_buoc, du_lieu, lich, vi_pham) -> Lich
  kiem_lich_trinh(lich, rang_buoc) -> list[{"loai","chi_tiet"}] · tinh_tong_tien(lich, rang_buoc) -> {"ve_vao_cong","diem","tong"}
  du_lieu = {"diem": [...], "show": [...], "thoi_tiet": {...}}
"""
import re

from ai import call_model
from tracing import tool

# ---------- dữ liệu giả rất nhỏ (Thành thay bằng data/park.json sinh có seed) ----------
_DIEM = [
    {"id": "D01", "ten": "Đu quay mini", "khu": "A", "mo": "09:00", "dong": "17:00", "thoi_luong_phut": 15,
     "cho_doi_phut": 10, "gia": {"nguoi_lon": 0, "tre_em": 0}, "chieu_cao_min_cm": 0, "trong_nha": False,
     "the_loai": ["tre_nho"]},
    {"id": "D02", "ten": "Thuỷ cung", "khu": "B", "mo": "09:30", "dong": "18:00", "thoi_luong_phut": 45,
     "cho_doi_phut": 10, "gia": {"nguoi_lon": 0, "tre_em": 0}, "chieu_cao_min_cm": 0, "trong_nha": True,
     "the_loai": ["kham_pha"]},
    {"id": "D03", "ten": "Tàu lượn siêu tốc", "khu": "C", "mo": "10:00", "dong": "17:00", "thoi_luong_phut": 10,
     "cho_doi_phut": 40, "gia": {"nguoi_lon": 0, "tre_em": 0}, "chieu_cao_min_cm": 130, "trong_nha": False,
     "the_loai": ["cam_giac_manh"]},
    {"id": "D04", "ten": "Công viên nước trẻ em", "khu": "D", "mo": "10:00", "dong": "16:00", "thoi_luong_phut": 60,
     "cho_doi_phut": 0, "gia": {"nguoi_lon": 0, "tre_em": 0}, "chieu_cao_min_cm": 0, "trong_nha": False,
     "the_loai": ["nuoc", "tre_nho"]},
    {"id": "D05", "ten": "Nhà thực tế ảo", "khu": "B", "mo": "09:00", "dong": "20:00", "thoi_luong_phut": 20,
     "cho_doi_phut": 15, "gia": {"nguoi_lon": 100000, "tre_em": 80000}, "chieu_cao_min_cm": 110, "trong_nha": True,
     "the_loai": ["cong_nghe"]},
]
_SHOW = [{"id": "S01", "ten": "Show cá heo", "diem_id": "D02", "gio": ["11:00", "15:00"], "thoi_luong_phut": 30,
          "huy_khi_mua": False}]
_VE_CONG = {"nguoi_lon": 500000, "tre_em": 350000, "tre_duoi_1m": 0}
_THOI_TIET = {"mua_tu": "13:00", "mua_den": "14:30"}


def hhmm_to_min(s):
    h, m = s.split(":")
    return int(h) * 60 + int(m)


def min_to_hhmm(x):
    return "%02d:%02d" % (x // 60, x % 60)


# ---------- giả của tools.py (Thành) ----------
@tool
def tra_diem_choi() -> list:
    """GIẢ. Input: không. Output: danh sách điểm chơi. Không tác động ra ngoài."""
    return [dict(d) for d in _DIEM]


@tool
def tra_lich_show(ngay: str) -> list:
    """GIẢ. Input: ngày YYYY-MM-DD. Output: danh sách show. Không tác động ra ngoài."""
    return [dict(s) for s in _SHOW]


@tool
def tra_thoi_tiet(ngay: str) -> dict:
    """GIẢ. Input: ngày. Output: {"mua_tu","mua_den"} hoặc {} nếu không mưa. Không tác động ra ngoài."""
    return dict(_THOI_TIET)


@tool
def uoc_thoi_gian_di(a_id: str, b_id: str) -> int:
    """GIẢ. Input: 2 mã điểm. Output: phút đi bộ (cùng khu 3', khác khu 10'). Không tác động ra ngoài."""
    if not a_id or not b_id:
        return 0
    khu = {d["id"]: d["khu"] for d in _DIEM}
    return 3 if khu.get(a_id) == khu.get(b_id) else 10


# ---------- giả của validator.py (Thành) — chỉ kiểm vài loại, bản thật đủ 9 loại ----------
def tinh_tong_tien(lich, rang_buoc):
    nl = rang_buoc.get("nguoi_lon") or 0
    tre = rang_buoc.get("tre_em") or []
    tre_tren_1m = [t for t in tre if (t.get("chieu_cao_cm") or 999) >= 100]
    cong = nl * _VE_CONG["nguoi_lon"] + len(tre_tren_1m) * _VE_CONG["tre_em"]
    gia = {d["id"]: d["gia"] for d in _DIEM}
    diem = sum(nl * gia[m["diem_id"]]["nguoi_lon"] + len(tre) * gia[m["diem_id"]]["tre_em"]
               for m in lich if m.get("diem_id") in gia)
    return {"ve_vao_cong": cong, "diem": diem, "tong": cong + diem}


def kiem_lich_trinh(lich, rang_buoc):
    vp = []
    diem = {d["id"]: d for d in _DIEM}
    show = {s["id"]: s for s in _SHOW}
    for m in lich:
        mid = m.get("diem_id") or m.get("show_id")
        if mid not in diem and mid not in show:
            vp.append({"loai": "diem_khong_ton_tai", "chi_tiet": str(mid)})
            continue
        if mid in diem:
            d = diem[mid]
            if hhmm_to_min(m["bat_dau"]) < hhmm_to_min(d["mo"]):
                vp.append({"loai": "truoc_gio_mo", "chi_tiet": "%s mở %s" % (d["ten"], d["mo"])})
            if hhmm_to_min(m["ket_thuc"]) > hhmm_to_min(d["dong"]):
                vp.append({"loai": "sau_gio_dong", "chi_tiet": "%s đóng %s" % (d["ten"], d["dong"])})
    tong = tinh_tong_tien(lich, rang_buoc)["tong"]
    if rang_buoc.get("ngan_sach") and tong > rang_buoc["ngan_sach"]:
        vp.append({"loai": "vuot_ngan_sach", "chi_tiet": "%d > %d" % (tong, rang_buoc["ngan_sach"])})
    return vp


# ---------- giả của planner.py (Trường) — gọi model giả 1 lần để trace có lượt gọi, rồi làm bằng luật đơn giản ----------
_SO = r"(\d+(?:[.,]\d+)?)"


def trich_rang_buoc(text):
    call_model("GIẢ: trích ràng buộc", text)
    t = text.lower()
    rb = {"ngay": "2026-12-05", "gio_bat_dau": None, "gio_ket_thuc": None, "nguoi_lon": None, "tre_em": [],
          "ngan_sach": None, "so_thich": [], "thieu": [], "ngoai_pham_vi": None}
    if re.search(r"đặt vé|thanh toán|mua vé giúp|hoàn tiền", t):
        rb["ngoai_pham_vi"] = "đặt vé / thanh toán"
    m = re.search(r"(\d+)\s*người lớn", t)
    if m:
        rb["nguoi_lon"] = int(m.group(1))
    m = re.search(r"(\d+)\s*(?:bé|trẻ|con|cháu)", t)
    so_tre = int(m.group(1)) if m else 0
    cao = [int(x) for x in re.findall(r"(\d{2,3})\s*cm", t)]
    tuoi = [int(x) for x in re.findall(r"(\d{1,2})\s*tuổi", t)]
    for i in range(so_tre):
        rb["tre_em"].append({"tuoi": tuoi[i] if i < len(tuoi) else None,
                             "chieu_cao_cm": cao[i] if i < len(cao) else None})
    m = re.search(_SO + r"\s*(triệu|tr\b|k\b|nghìn|ngàn)", t)
    if m:
        so = float(m.group(1).replace(",", "."))
        rb["ngan_sach"] = int(so * (1_000_000 if m.group(2).startswith("tr") else 1000))
    m = re.search(r"(\d{1,2})\s*h(\d{2})?\s*(?:đến|tới|-|–)\s*(\d{1,2})\s*h(\d{2})?", t)
    if m:
        rb["gio_bat_dau"] = "%02d:%s" % (int(m.group(1)), m.group(2) or "00")
        rb["gio_ket_thuc"] = "%02d:%s" % (int(m.group(3)), m.group(4) or "00")
    for k, tu in (("nuoc", "nước"), ("show", "show"), ("cam_giac_manh", "cảm giác mạnh")):
        if tu in t:
            rb["so_thich"].append(k)
    if rb["nguoi_lon"] is None:
        rb["thieu"].append("so_nguoi_lon")
    if rb["gio_bat_dau"] is None:
        rb["thieu"].append("khung_gio")
    if rb["ngan_sach"] is None:
        rb["thieu"].append("ngan_sach")
    if any(c["chieu_cao_cm"] is None and c["tuoi"] is None for c in rb["tre_em"]):
        rb["thieu"].append("chieu_cao_hoac_tuoi_tre")
    return rb


def xep_lich(rang_buoc, du_lieu):
    """GIẢ: xếp tham lam theo thứ tự dữ liệu, bỏ điểm trẻ không đủ cao. Bản thật: model xếp."""
    call_model("GIẢ: xếp lịch", str(rang_buoc))
    cao_min = min([c.get("chieu_cao_cm") or 999 for c in rang_buoc.get("tre_em") or []] or [999])
    now = hhmm_to_min(rang_buoc["gio_bat_dau"])
    het = hhmm_to_min(rang_buoc["gio_ket_thuc"])
    lich, truoc = [], None
    for d in du_lieu["diem"]:
        if d["chieu_cao_min_cm"] > cao_min:
            continue
        bat_dau = max(now + uoc_thoi_gian_di(truoc, d["id"]), hhmm_to_min(d["mo"])) + d["cho_doi_phut"]
        ket_thuc = bat_dau + d["thoi_luong_phut"]
        if ket_thuc > het:
            break
        lich.append({"diem_id": d["id"], "bat_dau": min_to_hhmm(bat_dau), "ket_thuc": min_to_hhmm(ket_thuc),
                     "ly_do": "(giả) hợp độ tuổi, còn trong khung giờ"})
        now, truoc = ket_thuc, d["id"]
    return lich


def sua_lich(rang_buoc, du_lieu, lich, vi_pham):
    """GIẢ: bỏ điểm cuối cùng. Bản thật: model sửa theo danh sách vi phạm."""
    call_model("GIẢ: sửa lịch", str(vi_pham))
    return lich[:-1]
