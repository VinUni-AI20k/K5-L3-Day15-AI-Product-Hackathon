"""Công cụ chỉ đọc cho bài toán kiểm tin đăng & người bán đồ cũ trước khi chuyển cọc.

Mỗi công cụ là một hàm Python có @tool, docstring ghi đủ 4 ý theo spec.md §4:
    tên · input · output · có tác động ra ngoài không.
Tất cả công cụ đều CHỈ ĐỌC dữ liệu dựng "Chợ Mẫu" trong thư mục data/
(có dữ liệu mẫu tối thiểu dự phòng khi file CSV chưa được tạo ở Issue #6).
Chỉ dùng thư viện chuẩn Python.
"""
import csv
import io
import os
import re
import unicodedata

from tracing import tool, TOOLS  # noqa: F401

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(ROOT, "data")


# ---------------------------------------------------------------------------
# Dữ liệu mẫu tối thiểu dự phòng (chỉ dùng khi chưa có file CSV trong data/)
# ---------------------------------------------------------------------------

_FALLBACK_GIA = [
    {"mon": "điện thoại", "doi": "iPhone 13 128GB", "tinh_trang": "đẹp như mới", "gia_min": "9500000", "gia_max": "11000000", "ghi_chu": "ước tính"},
    {"mon": "điện thoại", "doi": "iPhone 13 128GB", "tinh_trang": "trầy xước, pin yếu", "gia_min": "6200000", "gia_max": "7500000", "ghi_chu": "ước tính"},
    {"mon": "điện thoại", "doi": "iPhone 14 Pro Max 256GB", "tinh_trang": "tốt", "gia_min": "16500000", "gia_max": "18500000", "ghi_chu": "ước tính"},
    {"mon": "điện thoại", "doi": "Samsung Galaxy S23 128GB", "tinh_trang": "tốt", "gia_min": "9000000", "gia_max": "10500000", "ghi_chu": "ước tính"},
    {"mon": "xe máy", "doi": "Honda Vision 2021", "tinh_trang": "tốt", "gia_min": "24000000", "gia_max": "27000000", "ghi_chu": "ước tính"},
    {"mon": "laptop", "doi": "MacBook Air M1 8GB 256GB", "tinh_trang": "tốt", "gia_min": "12500000", "gia_max": "14500000", "ghi_chu": "ước tính"},
]

_FALLBACK_TK = [
    {"loai": "so_tk", "gia_tri": "19001234567890", "so_lan_bao_cao": "5", "ly_do": "nhận cọc rồi chặn liên lạc (dữ liệu dựng)"},
    {"loai": "sdt", "gia_tri": "0999888777", "so_lan_bao_cao": "4", "ly_do": "giục cọc gấp rồi xoá bài (dữ liệu dựng)"},
]

_FALLBACK_TIN = [
    {"ma_tin": "TD001", "mon": "điện thoại", "doi": "iPhone 13 128GB", "tinh_trang": "trầy xước, pin yếu", "gia": "6800000", "mo_ta": "máy dùng 2 năm, pin 79%, xem trực tiếp", "ma_anh": "IMG-001", "ngay_dang": "2026-11-25", "ma_nguoi_ban": "NB001"},
    {"ma_tin": "TD002", "mon": "điện thoại", "doi": "iPhone 13 128GB", "tinh_trang": "đẹp như mới", "gia": "6500000", "mo_ta": "kẹt tiền bán gấp, cọc giữ máy", "ma_anh": "IMG-001", "ngay_dang": "2026-11-27", "ma_nguoi_ban": "NB002"},
    {"ma_tin": "TD003", "mon": "điện thoại", "doi": "Samsung Galaxy S23 128GB", "tinh_trang": "tốt", "gia": "9600000", "mo_ta": "máy chính chủ, gặp trực tiếp", "ma_anh": "IMG-003", "ngay_dang": "2026-11-26", "ma_nguoi_ban": "NB003"},
]

_FALLBACK_NGUOI_BAN = [
    {"ma_nguoi_ban": "NB001", "ten_nguoi_ban": "Nguyễn Văn An", "tuoi_tai_khoan_ngay": "420", "so_tin_da_dang": "18", "danh_gia": "4.9", "so_danh_gia": "14"},
    {"ma_nguoi_ban": "NB002", "ten_nguoi_ban": "Trần Minh Bảo", "tuoi_tai_khoan_ngay": "5", "so_tin_da_dang": "1", "danh_gia": "0", "so_danh_gia": "0"},
    {"ma_nguoi_ban": "NB003", "ten_nguoi_ban": "Lê Thu Hà", "tuoi_tai_khoan_ngay": "12", "so_tin_da_dang": "1", "danh_gia": "0", "so_danh_gia": "0"},
]


# ---------------------------------------------------------------------------
# Hàm tiện ích nội bộ
# ---------------------------------------------------------------------------

def _norm(text: str) -> str:
    """Chuẩn hoá chữ thường, bỏ dấu tiếng Việt và ký tự thừa để so khớp linh hoạt."""
    s = (text or "").replace("đ", "d").replace("Đ", "D")
    s = unicodedata.normalize("NFD", s)
    s = "".join(ch for ch in s if unicodedata.category(ch) != "Mn")
    s = re.sub(r"[^a-z0-9]+", " ", s.lower()).strip()
    return s


def _norm_digits(text: str) -> str:
    """Giữ lại chữ số; chuẩn hoá đầu số +84/84 (11 số) về 0."""
    digits = re.sub(r"\D+", "", str(text or ""))
    if len(digits) == 11 and digits.startswith("84"):
        digits = "0" + digits[2:]
    return digits


def _to_int(val, default: int = 0) -> int:
    try:
        return int(float(str(val).strip()))
    except (TypeError, ValueError):
        return default


def _to_float(val, default: float = 0.0) -> float:
    try:
        return float(str(val).strip())
    except (TypeError, ValueError):
        return default


def _load_csv(filename: str, fallback: list) -> tuple:
    """Đọc CSV UTF-8 từ data/<filename>; nếu chưa có file thì dùng dữ liệu mẫu dự phòng."""
    path = os.path.join(DATA_DIR, filename)
    if not os.path.exists(path):
        return fallback, "du_lieu_mau_tam"
    with open(path, encoding="utf-8-sig", newline="") as f:
        raw = f.read()
    lines = [ln for ln in raw.splitlines() if ln.strip()]
    if not lines:
        return fallback, "du_lieu_mau_tam"
    delim = ";" if lines[0].count(";") > lines[0].count(",") else ","
    reader = csv.DictReader(io.StringIO("\n".join(lines)), delimiter=delim)
    rows = []
    for row in reader:
        cleaned = {(k or "").strip(): (v or "").strip() for k, v in row.items() if k is not None}
        if any(cleaned.values()):
            rows.append(cleaned)
    return rows, "data/%s" % filename


def _token_overlap(a: str, b: str) -> float:
    ta = set(_norm(a).split())
    tb = set(_norm(b).split())
    if not ta or not tb:
        return 0.0
    return len(ta & tb) / len(ta | tb)


# ---------------------------------------------------------------------------
# 4 công cụ chỉ đọc (khớp spec.md §4 và docs/de-xuat-do-cu.md §3)
# ---------------------------------------------------------------------------

@tool
def tra_gia_thi_truong(mon: str, doi: str = "", tinh_trang: str = "", gia_dang: int = None) -> dict:
    """tra_gia_thi_truong · Input: mon (str), doi (str), tinh_trang (str), gia_dang (int | None).
    Output: dict khoảng giá tham chiếu (gia_min, gia_max, gia_trung_binh) và % chênh lệch so với giá đăng.
    Tác động ra ngoài: không (chỉ đọc data/gia_tham_chieu.csv)."""
    rows, nguon = _load_csv("gia_tham_chieu.csv", _FALLBACK_GIA)
    q_mon = _norm(mon)
    q_doi = _norm(doi)
    q_tt = _norm(tinh_trang)

    if not q_mon and not q_doi:
        return {
            "found": False,
            "mon": mon,
            "doi": doi,
            "tinh_trang": tinh_trang,
            "thong_bao": "chưa có dữ liệu giá tham chiếu (thiếu tên món/đời máy)",
            "nguon": nguon,
        }

    # Lọc các dòng khớp đời máy / món
    candidates = []
    for r in rows:
        r_mon = _norm(r.get("mon", ""))
        r_doi = _norm(r.get("doi", ""))
        doi_score = _token_overlap(q_doi, r_doi) if q_doi else 0.0
        # Khớp trực tiếp chuỗi con đời máy (vd "iphone 13" trong "iphone 13 128gb")
        if q_doi and (q_doi in r_doi or r_doi in q_doi):
            doi_score = max(doi_score, 0.75)
        mon_match = (not q_mon) or (q_mon == r_mon) or (q_mon in r_mon) or (r_mon in q_mon)
        if q_doi:
            if doi_score >= 0.45 and mon_match:
                candidates.append((doi_score, r))
        elif mon_match and r_mon:
            candidates.append((0.5, r))

    if not candidates:
        return {
            "found": False,
            "mon": mon,
            "doi": doi,
            "tinh_trang": tinh_trang,
            "thong_bao": "chưa có dữ liệu giá tham chiếu",
            "nguon": nguon,
        }

    # Chọn dòng có điểm khớp đời máy cao nhất, ưu tiên khớp tình trạng
    max_doi_score = max(s for s, _ in candidates)
    top_rows = [r for s, r in candidates if s >= max_doi_score - 0.1]

    def _tt_score(row):
        r_tt = _norm(row.get("tinh_trang", ""))
        if not q_tt:
            # Ưu tiên mức "tốt" / trung bình nếu người dùng không nêu rõ tình trạng
            return 0.6 if r_tt in ("tot", "binh thuong", "cu tot") else 0.3
        if q_tt == r_tt or q_tt in r_tt or r_tt in q_tt:
            return 1.0
        return _token_overlap(q_tt, r_tt)

    best = max(top_rows, key=_tt_score)
    gia_min = _to_int(best.get("gia_min"))
    gia_max = _to_int(best.get("gia_max"))
    gia_tb = (gia_min + gia_max) // 2 if (gia_min > 0 and gia_max > 0) else max(gia_min, gia_max)

    chenh_lech_pct = None
    if gia_dang is not None and gia_dang > 0 and gia_tb > 0:
        chenh_lech_pct = round((gia_dang - gia_tb) / gia_tb * 100.0, 1)

    return {
        "found": True,
        "mon": best.get("mon", mon),
        "doi": best.get("doi", doi),
        "tinh_trang": best.get("tinh_trang", tinh_trang),
        "gia_min": gia_min,
        "gia_max": gia_max,
        "gia_trung_binh": gia_tb,
        "gia_dang": gia_dang,
        "chenh_lech_pct": chenh_lech_pct,
        "nguon": nguon,
    }


@tool
def tinh_ti_le_coc(gia: int = None, coc: int = None) -> dict:
    """tinh_ti_le_coc · Input: gia (int | None), coc (int | None) theo VND.
    Output: dict gồm hop_le (bool), gia, coc, ti_le_coc_pct (float | None).
    Tác động ra ngoài: không (chỉ tính toán trong bộ nhớ)."""
    if gia is None or coc is None:
        return {
            "hop_le": False,
            "gia": gia,
            "coc": coc,
            "ti_le_coc_pct": None,
            "ly_do": "thiếu giá bán hoặc tiền cọc",
        }
    if gia <= 0 or coc < 0:
        return {
            "hop_le": False,
            "gia": gia,
            "coc": coc,
            "ti_le_coc_pct": None,
            "ly_do": "giá bán phải > 0 và tiền cọc phải ≥ 0",
        }
    ti_le = round(coc / gia * 100.0, 1)
    return {
        "hop_le": True,
        "gia": int(gia),
        "coc": int(coc),
        "ti_le_coc_pct": ti_le,
    }


@tool
def kiem_tai_khoan(so_tk: str = "", sdt: str = "") -> dict:
    """kiem_tai_khoan · Input: so_tk (str), sdt (str) của người bán.
    Output: dict cho biết có trong danh sách cảnh báo dựng sẵn không, tổng số lần bị báo cáo và chi tiết.
    Tác động ra ngoài: không (chỉ đọc data/tk_canh_bao.csv)."""
    tk_norm = _norm_digits(so_tk)
    sdt_norm = _norm_digits(sdt)
    rows, nguon = _load_csv("tk_canh_bao.csv", _FALLBACK_TK)

    if not tk_norm and not sdt_norm:
        return {
            "da_kiem": False,
            "canh_bao": False,
            "so_lan_bao_cao": 0,
            "chi_tiet": [],
            "thong_bao": "không có số TK hoặc SĐT để kiểm",
            "nguon": nguon,
        }

    matches = []
    for r in rows:
        val_norm = _norm_digits(r.get("gia_tri", ""))
        if not val_norm:
            continue
        if (tk_norm and val_norm == tk_norm) or (sdt_norm and val_norm == sdt_norm):
            matches.append({
                "loai": r.get("loai", ""),
                "gia_tri": r.get("gia_tri", ""),
                "so_lan_bao_cao": _to_int(r.get("so_lan_bao_cao"), 1),
                "ly_do": r.get("ly_do", ""),
            })

    tong_bao_cao = sum(m["so_lan_bao_cao"] for m in matches)
    return {
        "da_kiem": True,
        "canh_bao": len(matches) > 0,
        "so_lan_bao_cao": tong_bao_cao,
        "chi_tiet": matches,
        "nguon": nguon,
    }


@tool
def kiem_tin_dang(ma_tin: str = "") -> dict:
    """kiem_tin_dang · Input: ma_tin (str) của tin đăng trên Chợ Mẫu.
    Output: dict gồm tuổi tài khoản người bán, số tin đã đăng, đánh giá và ảnh có trùng tin người bán khác không.
    Tác động ra ngoài: không (chỉ đọc data/tin_dang.csv và data/nguoi_ban.csv)."""
    code = (ma_tin or "").strip().upper()
    tin_rows, nguon_tin = _load_csv("tin_dang.csv", _FALLBACK_TIN)
    nb_rows, _ = _load_csv("nguoi_ban.csv", _FALLBACK_NGUOI_BAN)

    if not code:
        return {
            "found": False,
            "ma_tin": ma_tin,
            "thong_bao": "không có mã tin đăng để tra cứu",
            "nguon": nguon_tin,
        }

    tin = next((r for r in tin_rows if (r.get("ma_tin", "").strip().upper() == code)), None)
    if not tin:
        return {
            "found": False,
            "ma_tin": code,
            "thong_bao": "không tìm thấy mã tin đăng trong dữ liệu",
            "nguon": nguon_tin,
        }

    ma_nb = tin.get("ma_nguoi_ban", "").strip()
    nb = next((r for r in nb_rows if r.get("ma_nguoi_ban", "").strip() == ma_nb), {})

    ma_anh = tin.get("ma_anh", "").strip()
    ngay_tin = tin.get("ngay_dang", "").strip()
    tin_trung = []
    if ma_anh:
        for other in tin_rows:
            if (
                other.get("ma_anh", "").strip() == ma_anh
                and other.get("ma_nguoi_ban", "").strip() != ma_nb
            ):
                ngay_other = other.get("ngay_dang", "").strip()
                # Chỉ đánh dấu trùng ảnh nếu tin khác đăng trước hoặc cùng ngày (tránh báo oan chủ ảnh gốc)
                if not ngay_tin or not ngay_other or ngay_other <= ngay_tin:
                    tin_trung.append(other.get("ma_tin", "").strip())

    return {
        "found": True,
        "ma_tin": code,
        "ma_nguoi_ban": ma_nb,
        "ten_nguoi_ban": nb.get("ten_nguoi_ban", ""),
        "tuoi_tai_khoan_ngay": _to_int(nb.get("tuoi_tai_khoan_ngay"), -1),
        "so_tin_da_dang": _to_int(nb.get("so_tin_da_dang"), 0),
        "danh_gia": _to_float(nb.get("danh_gia"), 0.0),
        "so_danh_gia": _to_int(nb.get("so_danh_gia"), 0),
        "anh_trung_nguoi_ban_khac": len(tin_trung) > 0,
        "cac_tin_trung_anh": tin_trung,
        "nguon": nguon_tin,
    }
