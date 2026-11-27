"""Sinh dữ liệu chi tiêu & hóa đơn giả lập (synthetic) với seed cố định = 42.

Tạo file data/expenses.json gồm 2 tháng (2026-10 và 2026-11), ≥80 giao dịch / hóa đơn,
6 nhóm chi tiêu + một số khoản chuyển khoản / hóa đơn mờ nhãn "không rõ".
Chạy:
    python data/seed_expenses.py
"""
import json
import os
import random

SEED = 42
OUT_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "expenses.json")

MERCHANTS = {
    "Ăn uống": [
        ("Cơm Tấm Mẫu Q1", ["Cơm sườn bì chả", "Trà đá"], (35000, 75000)),
        ("HIGHLANDS*Q1", ["Phin sữa đá", "Bánh mì que"], (45000, 95000)),
        ("Phở Bò Mẫu 24", ["Phở tái nạm", "Quẩy"], (50000, 90000)),
        ("Trà Sữa Mẫu B", ["Trà sữa trân châu", "Topping"], (38000, 82000)),
        ("BACH HOA XANH M1", ["Rau củ", "Thịt heo", "Trứng gà"], (85000, 260000)),
    ],
    "Di chuyển": [
        ("Grab*Bike", ["Cước xe máy nội thành"], (18000, 65000)),
        ("Xanh SM Mẫu", ["Cước xe điện"], (25000, 95000)),
        ("Trạm Xăng Mẫu A", ["Xăng RON95"], (50000, 120000)),
    ],
    "Mua sắm": [
        ("Circle K Mẫu", ["Nước suối", "Bánh snack"], (22000, 85000)),
        ("Shop Thời Trang Mẫu", ["Áo thun cơ bản"], (140000, 390000)),
        ("Siêu Thị Mẫu C", ["Đồ gia dụng nhỏ", "Giấy ăn"], (110000, 340000)),
    ],
    "Hóa đơn & Nhà ở": [
        ("Tiền Trọ Mẫu", ["Tiền phòng tháng"], (2800000, 2800000)),
        ("Điện Lực Mẫu", ["Tiền điện sinh hoạt"], (380000, 620000)),
        ("Internet Mẫu", ["Cước WiFi tháng"], (220000, 220000)),
    ],
    "Sức khỏe": [
        ("Nhà Thuốc Mẫu D", ["Vitamin C", "Khẩu trang"], (45000, 185000)),
        ("Phòng Khám Mẫu", ["Khám tổng quát"], (250000, 450000)),
    ],
    "Giải trí": [
        ("Rạp Phim Mẫu", ["Vé xem phim 2D", "Bắp nước"], (95000, 230000)),
        ("Sách Mẫu E", ["Sách kỹ năng"], (80000, 190000)),
    ],
}


def generate(seed: int = SEED) -> dict:
    rng = random.Random(seed)
    records = []
    rec_id = 1

    def add_record(date_str: str, time_str: str, merchant: str, category: str, items: list, total: int, note: str, source_type: str = "receipt_photo"):
        nonlocal rec_id
        records.append(
            {
                "id": f"EXP-{rec_id:03d}",
                "capture_id": f"CAP-{rec_id:03d}",
                "date": date_str,
                "time": time_str,
                "merchant": merchant,
                "category": category,
                "items": items,
                "total": total,
                "note": note,
                "source_type": source_type,
            }
        )
        rec_id += 1

    # Cố định hóa đơn đầu tháng (Tiền nhà, Internet, Điện) cho 2026-10 và 2026-11
    for ym, elec in (("2026-10", 460000), ("2026-11", 520000)):
        add_record(f"{ym}-01", "09:00", "Tiền Trọ Mẫu", "Hóa đơn & Nhà ở", [{"name": "Tiền phòng", "amount": 2800000}], 2800000, "Đóng tiền nhà đầu tháng", "manual_note")
        add_record(f"{ym}-05", "10:15", "Internet Mẫu", "Hóa đơn & Nhà ở", [{"name": "Cước WiFi", "amount": 220000}], 220000, "Cước mạng hàng tháng", "receipt_photo")
        add_record(f"{ym}-10", "14:30", "Điện Lực Mẫu", "Hóa đơn & Nhà ở", [{"name": "Tiền điện", "amount": elec}], elec, "Hóa đơn điện sinh hoạt", "receipt_photo")

    # Sinh giao dịch rải đều 2 tháng (mỗi tháng ~44 giao dịch hàng ngày)
    for ym, days in (("2026-10", 31), ("2026-11", 27)):
        for day in range(1, days + 1):
            date_str = f"{ym}-{day:02d}"
            # Bỏ bớt vài ngày không tiêu để lịch Locket giống thực tế
            if day in (3, 7, 13, 19, 24) and ym == "2026-10":
                continue
            if day in (4, 8, 17, 23) and ym == "2026-11":
                continue

            # 1-2 khoản ăn uống/di chuyển mỗi ngày hoạt động
            n_tx = 2 if day % 2 == 0 else 1
            for _ in range(n_tx):
                cat = rng.choices(
                    ["Ăn uống", "Di chuyển", "Mua sắm", "Sức khỏe", "Giải trí"],
                    weights=[0.50, 0.25, 0.12, 0.06, 0.07],
                )[0]
                merchant, item_names, (lo, hi) = rng.choice(MERCHANTS[cat])
                total = rng.randrange(lo // 1000, hi // 1000 + 1) * 1000
                hh = rng.randint(7, 21)
                mm = rng.choice((0, 10, 15, 25, 30, 45, 50))
                items = [{"name": item_names[0], "amount": total}]
                if len(item_names) > 1 and total >= 50000:
                    p1 = (total * 7 // 10 // 1000) * 1000
                    items = [
                        {"name": item_names[0], "amount": p1},
                        {"name": item_names[1], "amount": total - p1},
                    ]
                add_record(date_str, f"{hh:02d}:{mm:02d}", merchant, cat, items, total, f"Chi {cat.lower()} tại {merchant}")

    # Thêm các ca đặc trưng / lộn xộn / bất thường để test Locket-day & phân tích
    add_record("2026-11-11", "20:40", "Siêu Thị Mẫu C", "Mua sắm", [{"name": "Nồi chiên mini", "amount": 950000}], 950000, "Săn sale 11/11 (chi lớn bất thường)", "receipt_photo")
    add_record("2026-11-15", "12:10", "HIGHLANDS*Q1", "Ăn uống", [{"name": "Cà phê sữa", "amount": 49000}, {"name": "Bánh ngọt", "amount": 39000}], 88000, "Gặp bạn cuối tuần", "receipt_photo")
    add_record("2026-11-15", "19:30", "Rạp Phim Mẫu", "Giải trí", [{"name": "2 vé xem phim", "amount": 180000}], 180000, "Xem phim tối Chủ nhật", "receipt_photo")
    add_record("2026-11-20", "16:05", "CHUYEN KHOAN NOI BO", "không rõ", [{"name": "CK không ghi nội dung", "amount": 150000}], 150000, "Chuyển khoản thiếu mô tả — cần người dùng bổ sung nhóm chi", "manual_note")
    add_record("2026-11-22", "11:20", "Quán Cơm Mẫu (Mờ)", "không rõ", [{"name": "Hóa đơn mờ thiếu tên món", "amount": 65000}], 65000, "Ảnh hóa đơn hơi mờ tên món, giữ được tổng tiền", "receipt_photo")

    records.sort(key=lambda r: (r["date"], r["time"], r["id"]))
    return {
        "schema_version": "1.0",
        "seed": seed,
        "currency": "VND",
        "records": records,
    }


def main() -> None:
    payload = generate(SEED)
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    recs = payload["records"]
    by_month = {}
    for r in recs:
        ym = r["date"][:7]
        by_month[ym] = by_month.get(ym, 0) + r["total"]
    d15 = [r for r in recs if r["date"] == "2026-11-15"]
    print(f"Da sinh {len(recs)} ban ghi vao {OUT_PATH} (seed={SEED})")
    print("Tong theo thang:", by_month)
    print(f"Ngay 2026-11-15: {len(d15)} khoan, tong {sum(r['total'] for r in d15):,} VND")


if __name__ == "__main__":
    main()
