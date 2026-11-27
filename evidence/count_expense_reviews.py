"""Kiểm và đếm nhãn review Track E trên hai snapshot đã lưu."""
import argparse
import csv
import hashlib
import json
from collections import Counter
from pathlib import Path

SNAPSHOTS = {
    "misa": "82f29eac0a1420b5d0f93d1df129b2b6355fa9528a040e0b00117a5e956fb6c8",
    "money-lover": "54e66530542bdbf56aeee95b22878ad665aca510ab389a59461867b3ad5bf748",
}
LABELS = ("entry", "lookup", "ledger")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("snapshot_dir", type=Path)
    args = parser.parse_args()

    samples = {}
    for app, expected_hash in SNAPSHOTS.items():
        payload = (args.snapshot_dir / f"{app}.json").read_bytes()
        if hashlib.sha256(payload).hexdigest() != expected_hash:
            raise ValueError(f"Snapshot {app} khác bản đã gắn nhãn.")
        rows = json.loads(payload)
        if len(rows) != 250 or len({row["id"] for row in rows}) != len(rows):
            raise ValueError(f"Snapshot {app} sai số lượng hoặc có dòng trùng.")
        samples[app] = rows

    counts = {app: Counter() for app in samples}
    seen = set()
    with Path(__file__).with_name("expense-review-labels.csv").open(encoding="utf-8", newline="") as source:
        for annotation in csv.DictReader(source):
            app, label = annotation["app"], annotation["label"]
            position = int(annotation["sample_row"])
            key = (app, position)
            if label not in LABELS or key in seen or not 1 <= position <= len(samples[app]):
                raise ValueError(f"Nhãn hoặc vị trí không hợp lệ: {annotation}")
            seen.add(key)
            review = samples[app][position - 1]
            if (review["date"], review["stars"]) != (annotation["date"], int(annotation["stars"])):
                raise ValueError(f"Nhãn không khớp review: {annotation}")
            counts[app][label] += 1

    total = sum(counts.values(), Counter())
    for name, count in [*counts.items(), ("total", total)]:
        size = sum(map(len, samples.values())) if name == "total" else len(samples[name])
        print(name, f"n={size}", *(f"{label}={count[label]}/{size} ({count[label] / size:.1%})" for label in LABELS))


if __name__ == "__main__":
    main()
