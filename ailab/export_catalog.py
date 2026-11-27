"""Xuất Catalog Snapshot cố định cho TV4 (DATA_CARD.md / benchmark).

Chạy: python ailab/export_catalog.py [đường_dẫn_file_json]
Mặc định ghi data/catalog_snapshot.json. Không ghi DB ngoài việc khởi tạo seed lần đầu.
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import composer  # noqa: E402
import store  # noqa: E402


def main(path=None):
    store.init()
    snapshot = composer.catalog_snapshot()
    target = path or os.path.join(os.path.dirname(HERE), "data", "catalog_snapshot.json")
    with open(target, "w", encoding="utf-8") as f:
        json.dump(snapshot, f, ensure_ascii=False, indent=2, sort_keys=True)
        f.write("\n")
    print("Exported %s: %d players, %d models, %d exams."
          % (target, len(snapshot["players"]), len(snapshot["models"]), len(snapshot["exams"])))
    return target


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else None)
