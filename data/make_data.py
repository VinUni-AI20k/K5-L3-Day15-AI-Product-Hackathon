"""Sinh dữ liệu giả (synthetic) cho bản chạy thử — có seed, chạy lại ra đúng file cũ.

Chạy:  python data/make_data.py
Ra:    data/products_sample.csv  — file sản phẩm nhân viên tải lên (đầu vào của agent)
       data/inventory.csv        — kho: tồn theo màu/size, trạng thái SX, giá tệ (giá nhập, CNY)

Không dùng dữ liệu thật của công ty nào. Tên sản phẩm, giá, tồn kho đều dựng.
Chỉ dùng thư viện chuẩn.
"""
import csv
import random
import sys
from pathlib import Path

SEED = 42
N_PRODUCTS = 40
OUT = Path(__file__).resolve().parent

# (tiền tố mã, tên, chất liệu, page, khoảng giá bán VND)
CATALOG = [
    ("AO", "Áo thun basic", "Cotton 100%", "Thời trang nam nữ", (150_000, 250_000)),
    ("AO", "Áo polo", "Cá sấu", "Thời trang nam", (200_000, 320_000)),
    ("AO", "Áo sơ mi", "Linen", "Thời trang công sở", (250_000, 420_000)),
    ("AO", "Áo hoodie", "Nỉ bông", "Thời trang trẻ", (280_000, 450_000)),
    ("QN", "Quần jean ống suông", "Denim", "Thời trang nam nữ", (300_000, 480_000)),
    ("QN", "Quần tây âu", "Tuyết mưa", "Thời trang công sở", (300_000, 450_000)),
    ("QN", "Quần short kaki", "Kaki", "Thời trang nam", (160_000, 260_000)),
    ("VY", "Váy hoa nhí", "Voan", "Thời trang nữ", (220_000, 380_000)),
    ("DM", "Đầm maxi", "Lanh", "Thời trang nữ", (280_000, 450_000)),
    ("AK", "Áo khoác gió 2 lớp", "Dù chống nước", "Đồ thể thao", (350_000, 550_000)),
    ("GI", "Giày sneaker", "Da PU", "Giày dép", (400_000, 650_000)),
    ("PK", "Thắt lưng da", "Da bò", "Phụ kiện nam", (180_000, 320_000)),
]
COLORS = ["Trắng", "Đen", "Xanh", "Be", "Xám", "Hồng", "Nâu", "Kem"]
SIZES = {"GI": ["39", "40", "41", "42"], "PK": ["Freesize"]}
DEFAULT_SIZES = ["S", "M", "L", "XL"]
NOTES = ["", "", "", "Freeship toàn quốc", "Giảm 10% hôm nay"]
PROMPTS = [
    "Viết bài ngắn, giọng trẻ trung, 3 hashtag",
    "Viết bài giới thiệu lịch sự, nhấn mạnh chất liệu",
    "Viết bài dưới 80 chữ, có emoji",
    "",  # dòng không có prompt riêng → dùng giọng mặc định của Page
]
TY_GIA = 13_500  # VND / 1 CNY, dùng cho luật giá bán >= giá tệ x tỷ giá (B10)

# Lỗi cố ý cài vào một số dòng để kiểm check_product / check_stock
DEFECTS = ["thieu_size", "thieu_anh", "gia_chu", "het_hang", "ngung_sx", "khong_co_trong_kho"]
DEFECT_RATE = 0.25


def main() -> None:
    rng = random.Random(SEED)
    products, inventory = [], []

    for i in range(1, N_PRODUCTS + 1):
        prefix, name, material, page, (lo, hi) = rng.choice(CATALOG)
        code = f"{prefix}-{100 + i}"
        price = rng.randrange(lo, hi + 1, 10_000)
        colors = rng.sample(COLORS, rng.randint(1, 3))
        size_pool = SIZES.get(prefix, DEFAULT_SIZES)
        sizes = rng.sample(size_pool, rng.randint(1, min(2, len(size_pool))))
        defect = rng.choice(DEFECTS) if rng.random() < DEFECT_RATE else ""

        row = {
            "ma_sp": code,
            "ten": name,
            "gia": str(price),
            "mau": ", ".join(colors),
            "size": ", ".join(sizes),
            "chat_lieu": material,
            "mo_ta": f"{name} chất liệu {material.lower()}",
            "anh": f"{code.lower().replace('-', '')}.jpg",
            "ghi_chu": rng.choice(NOTES),
            "page": page,
            "yeu_cau": rng.choice(PROMPTS),
            "loi_cai_san": defect,  # chỉ để kiểm tay, agent KHÔNG được đọc cột này
        }
        if defect == "thieu_size":
            row["size"] = ""
        elif defect == "thieu_anh":
            row["anh"] = ""
        elif defect == "gia_chu":
            row["gia"] = "hai trăm nghìn"
        products.append(row)

        if defect == "khong_co_trong_kho":
            continue
        status = "Ngừng sản xuất" if defect == "ngung_sx" else "Đang sản xuất"
        gia_te = round(price / TY_GIA * rng.uniform(0.4, 0.7))
        for c in colors:
            for s in sizes:
                stock = 0 if defect == "het_hang" else rng.randint(0, 15)
                inventory.append({
                    "ma_sp": code, "mau": c, "size": s, "ton": stock,
                    "trang_thai_sx": status, "gia_te": gia_te,
                })

    write(OUT / "products_sample.csv", products)
    write(OUT / "inventory.csv", inventory)
    n_bad = sum(1 for p in products if p["loi_cai_san"])
    sys.stdout.reconfigure(encoding="utf-8")  # console Windows mặc định cp1252
    print(f"seed={SEED} · {len(products)} sản phẩm ({n_bad} dòng cài lỗi) · {len(inventory)} dòng kho")


def write(path: Path, rows: list[dict]) -> None:
    with path.open("w", newline="", encoding="utf-8-sig") as f:  # utf-8-sig: Excel mở đúng dấu
        w = csv.DictWriter(f, fieldnames=list(rows[0]))
        w.writeheader()
        w.writerows(rows)


if __name__ == "__main__":
    main()
