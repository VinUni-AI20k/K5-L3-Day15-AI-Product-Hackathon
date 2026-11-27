"""Đếm tỷ lệ Negative (nhãn 0) ở các khía cạnh Quality, Size, Outlook trong Kaggle ABSA Vietnamese.

Nguồn: https://www.kaggle.com/datasets/cthng123/absa-vietnamese
Yêu cầu: pip install kagglehub  (hoặc truyền --data-dir tới thư mục chứa 3 file CSV)
Chạy:
    python evidence/count_absa.py
"""
import argparse
import csv
import os

TARGET_ASPECTS = ("Quality", "Size", "Outlook")
SPLITS = ("train_data.csv", "val_data.csv", "test_data.csv")


def load_rows(data_dir: str) -> list:
    """Đọc toàn bộ dòng từ train_data.csv, val_data.csv, test_data.csv."""
    rows = []
    for fn in SPLITS:
        path = os.path.join(data_dir, fn)
        with open(path, encoding="utf-8-sig", newline="") as f:
            for idx, row in enumerate(csv.DictReader(f), start=2):
                row["_file"] = fn
                row["_line"] = idx
                rows.append(row)
    return rows


def main() -> None:
    parser = argparse.ArgumentParser(description="Đếm tỷ lệ Negative (0) trong cthng123/absa-vietnamese.")
    parser.add_argument("--data-dir", help="Thư mục chứa train_data.csv, val_data.csv, test_data.csv.")
    args = parser.parse_args()

    data_dir = args.data_dir
    if not data_dir:
        import kagglehub

        data_dir = kagglehub.dataset_download("cthng123/absa-vietnamese")

    rows = load_rows(data_dir)
    total = len(rows)
    print(f"Tong so review (3 file): {total}")

    for asp in TARGET_ASPECTS:
        neg = sum(1 for r in rows if r[asp] == "0")
        mentioned = sum(1 for r in rows if r[asp] in ("0", "1", "2"))
        pct_all = 100.0 * neg / total if total else 0.0
        pct_ment = 100.0 * neg / mentioned if mentioned else 0.0
        print(
            f"- {asp}: Negative={neg}/{total} ({pct_all:.2f}% toan tap) | "
            f"{neg}/{mentioned} ({pct_ment:.2f}% trong cac review co nhac {asp})"
        )

    any_neg = sum(1 for r in rows if any(r[a] == "0" for a in TARGET_ASPECTS))
    any_ment = sum(1 for r in rows if any(r[a] in ("0", "1", "2") for a in TARGET_ASPECTS))
    print(
        f"- Gop >=1 khia canh (Quality/Size/Outlook): Negative={any_neg}/{total} "
        f"({100.0 * any_neg / total:.2f}% toan tap) | "
        f"{any_neg}/{any_ment} ({100.0 * any_neg / any_ment:.2f}% trong cac review co nhac >=1 khia canh)"
    )

    print("\nVi du Negative co dau hieu sai size / khac hinh / kem chat luong:")
    keywords = ("không giống", "ko giống", "khác hình", "sai size", "chật", "rách", "bung keo", "kém", "thất vọng")
    shown = 0
    for r in rows:
        if not any(r[a] == "0" for a in TARGET_ASPECTS):
            continue
        text = " ".join(r["Review"].split())
        low = text.lower()
        if any(k in low for k in keywords) and 25 <= len(text) <= 180:
            neg_tags = [a for a in TARGET_ASPECTS if r[a] == "0"]
            print(f"  - {r['_file']}:L{r['_line']} {neg_tags} | {text}")
            shown += 1
            if shown >= 8:
                break


if __name__ == "__main__":
    main()
