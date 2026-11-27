"""Đào và đếm ứng viên review Google Play cho Track D3 (Shopee VN).

Tái lập đúng truy vấn và bộ lọc từ khóa ghi trong evidence/data-mining.md.
Chạy:
    python evidence/count_reviews.py
    python evidence/count_reviews.py --save-raw evidence/raw-gplay.json
    python evidence/count_reviews.py --from-raw evidence/raw-gplay.json
"""
import argparse
import json
import os
import re
import unicodedata

from google_play_scraper import Sort, reviews

APP_ID = "com.shopee.vn"

ISSUE_RE = re.compile(
    r"\b(?:sai|nham).{0,20}(?:mau|hang|san pham|size|kich thuoc)"
    r"|(?:giao|gui|nhan).{0,20}(?:nham|sai)"
    r"|(?:khong|ko|k) (?:dung|giong|nhu).{0,14}(?:mo ta|hang|san pham|quang cao|quan cao|hinh|mau|dat)"
    r"|khac.{0,10}(?:mo ta|hinh|quang cao)"
    r"|hang gia|hang fake|bang chung|chung cu|nhu quang cao|nhu quan cao|khong hoat dong|khong bo.at dong"
)

HANDLING_RE = re.compile(
    r"tra ?hang|hang ?tra|hoan ?tien|khieu ?nai|doi ?tra|doi ?hang|tra ?tien"
    r"|lay ?hang|gui ?tra|giao ?tra|doi lai tien|cskh|giai quyet|bang chung|chung cu|khong duyet"
)


def normalize_vi(text: str) -> str:
    """Hạ chữ thường, đổi đ->d và bỏ dấu để khớp từ khóa ổn định."""
    text = (text or "").lower().replace("đ", "d")
    return "".join(ch for ch in unicodedata.normalize("NFD", text) if unicodedata.category(ch) != "Mn")


def dedup_reviews(rows: list) -> list:
    """Loại trùng theo reviewId, giữ nguyên thứ tự mới nhất."""
    seen, out = set(), []
    for r in rows:
        rid = r.get("reviewId")
        if rid and rid in seen:
            continue
        if rid:
            seen.add(rid)
        out.append(
            {
                "reviewId": rid,
                "score": r.get("score"),
                "at": str(r.get("at") or ""),
                "content": r.get("content") or "",
            }
        )
    return out


def fetch_samples() -> dict:
    """Lấy mẫu chính (200 mọi mức sao) và mẫu bổ sung (1000 1★, 300 2★)."""
    main_raw, _ = reviews(APP_ID, lang="vi", country="vn", sort=Sort.NEWEST, count=200)
    s1_raw, _ = reviews(APP_ID, lang="vi", country="vn", sort=Sort.NEWEST, filter_score_with=1, count=1000)
    s2_raw, _ = reviews(APP_ID, lang="vi", country="vn", sort=Sort.NEWEST, filter_score_with=2, count=300)
    return {
        "main": dedup_reviews(main_raw),
        "star1": dedup_reviews(s1_raw),
        "star2": dedup_reviews(s2_raw),
    }


def find_candidates(rows: list, label: str) -> list:
    """Tìm các review khớp cả hai nhóm từ khóa (sai mô tả + xử lý trả/hoàn)."""
    hits = []
    for idx, r in enumerate(rows, start=1):
        norm = normalize_vi(r["content"])
        if ISSUE_RE.search(norm) and HANDLING_RE.search(norm):
            hits.append((idx, r))
    print(f"[{label}] tong={len(rows)} | ung_vien_khop_2_nhom={len(hits)}")
    for idx, r in hits:
        snippet = " ".join(r["content"].split())[:140]
        print(f"  - {label}-{idx} ({r['score']}*, {r['at'][:10]}): {snippet}")
    return hits


def main() -> None:
    parser = argparse.ArgumentParser(description="Đào và lọc ứng viên review D3 trên Google Play.")
    parser.add_argument("--save-raw", help="Lưu dữ liệu thô (đã bỏ tên người viết) ra JSON.")
    parser.add_argument("--from-raw", help="Đọc lại từ file JSON đã lưu thay vì gọi Google Play.")
    args = parser.parse_args()

    if args.from_raw:
        with open(args.from_raw, encoding="utf-8") as f:
            samples = json.load(f)
    else:
        samples = fetch_samples()
        if args.save_raw:
            os.makedirs(os.path.dirname(args.save_raw) or ".", exist_ok=True)
            with open(args.save_raw, "w", encoding="utf-8") as f:
                json.dump(samples, f, ensure_ascii=False, indent=2)

    main_ids = {r["reviewId"] for r in samples["main"] if r.get("reviewId")}
    supp_ids = {r["reviewId"] for r in samples["star1"] + samples["star2"] if r.get("reviewId")}
    star_counts = {s: sum(1 for r in samples["main"] if r.get("score") == s) for s in range(1, 6)}

    print(f"Mau chinh: {len(samples['main'])} review | phan bo sao: {star_counts}")
    print(f"Trung lap giua mau chinh va mau 1-2*: {len(main_ids & supp_ids)}")

    find_candidates(samples["main"], "chinh")
    find_candidates(samples["star1"], "1★")
    find_candidates(samples["star2"], "2★")


if __name__ == "__main__":
    main()
