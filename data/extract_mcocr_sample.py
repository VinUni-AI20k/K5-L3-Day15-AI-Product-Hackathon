"""Extract a clean, stratified 40-image MC-OCR sample from archive.zip."""

import csv
import io
import random
import zipfile
from pathlib import Path

SEED = 42
N_NORMAL = 25
N_HARD = 15

REPO_ROOT = Path(__file__).resolve().parent.parent
ZIP_PATH = REPO_ROOT / "archive.zip"
OUT_DIR = REPO_ROOT / "data" / "receipts"
IMG_OUT_DIR = OUT_DIR / "images"
CSV_OUT_PATH = OUT_DIR / "mcocr_sample_40.csv"


def parse_fields(anno_texts: str, anno_labels: str) -> dict[str, str]:
    """Group |||-separated OCR texts by their KIE label."""
    texts = anno_texts.split("|||") if anno_texts else []
    labels = anno_labels.split("|||") if anno_labels else []
    grouped: dict[str, list[str]] = {
        "SELLER": [],
        "ADDRESS": [],
        "TIMESTAMP": [],
        "TOTAL_COST": [],
    }
    for text, label in zip(texts, labels):
        key = label.strip().upper()
        if key in grouped:
            grouped[key].append(text.strip())
    return {k: " | ".join(v) for k, v in grouped.items()}


def main() -> None:
    if not ZIP_PATH.exists():
        raise FileNotFoundError(f"Không tìm thấy {ZIP_PATH}")

    IMG_OUT_DIR.mkdir(parents=True, exist_ok=True)
    rng = random.Random(SEED)

    with zipfile.ZipFile(ZIP_PATH, "r") as zf:
        available_images = {
            Path(name).name: name
            for name in zf.namelist()
            if name.startswith("train_images/") and name.endswith(".jpg")
        }

        with zf.open("mcocr_train_df.csv") as f:
            reader = csv.DictReader(io.TextIOWrapper(f, encoding="utf-8"))
            normal_pool = []
            hard_pool = []

            for row in reader:
                img_id = row["img_id"].strip()
                if img_id not in available_images:
                    continue

                try:
                    quality = float(row["anno_image_quality"])
                except (TypeError, ValueError):
                    quality = 0.0

                fields = parse_fields(row.get("anno_texts", ""), row.get("anno_labels", ""))
                has_core = bool(fields["SELLER"] and fields["TIMESTAMP"] and fields["TOTAL_COST"])

                record = {
                    "img_id": img_id,
                    "image_path": f"data/receipts/images/{img_id}",
                    "quality": f"{quality:.4f}",
                    "seller": fields["SELLER"],
                    "address": fields["ADDRESS"],
                    "timestamp": fields["TIMESTAMP"],
                    "total_cost": fields["TOTAL_COST"],
                    "difficulty": "thuong" if (quality >= 0.7 and has_core) else "kho",
                }

                if quality >= 0.7 and has_core:
                    normal_pool.append(record)
                elif quality < 0.55 and fields["TOTAL_COST"]:
                    hard_pool.append(record)

        rng.shuffle(normal_pool)
        rng.shuffle(hard_pool)

        selected = normal_pool[:N_NORMAL] + hard_pool[:N_HARD]

        for rec in selected:
            src = available_images[rec["img_id"]]
            dst = IMG_OUT_DIR / rec["img_id"]
            with zf.open(src) as z_in, open(dst, "wb") as f_out:
                f_out.write(z_in.read())

    fieldnames = [
        "img_id",
        "image_path",
        "difficulty",
        "quality",
        "seller",
        "address",
        "timestamp",
        "total_cost",
    ]
    with open(CSV_OUT_PATH, "w", newline="", encoding="utf-8-sig") as f_csv:
        writer = csv.DictWriter(f_csv, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(selected)

    print(f"Đã trích xuất {len(selected)} ảnh ({N_NORMAL} thường, {N_HARD} khó) vào {IMG_OUT_DIR}")
    print(f"File nhãn sạch: {CSV_OUT_PATH}")


if __name__ == "__main__":
    main()
