# Chi phí khi dùng thật

> Điền ở guide bước 4.2, nộp ở CP4 14:30 Thứ Bảy 28/11. Ôn lại: ngày 13, ngày 1, ngày 14 · lab ngày 13, lab ngày 14. Chấm ở rubric R6.
> Số **không điền tay**: điền `cost/personas.yaml` → `python run.py simulate` → chép bảng trong `cost/simulate-N-summary.md` vào đây.
> Lúc build dùng gói miễn phí vẫn tính theo **giá gói trả phí** — đây là chi phí cho lúc đưa vào dùng thật.

## 1. Đầu vào

- **Persona** (`cost/personas.yaml`): ≥3 kiểu — tỉ lệ, số phiên / người / tháng, số lượt hỏi / phiên. Nguồn: __
- **Số người dùng thật** 3 kịch bản: thấp __ · cơ sở __ · cao __. Nguồn: __
- **Giá** ≥2 mức model (từ `further-reading/model-prices.md` của repo đề, có link + ngày xem): __ · __
- **Tỉ lệ đạt** dùng để tính: __/__ (__%) — lượt `run-__` (lượt 2)
- Đo token trên model __, tính giá model __ và __

## 2. Kết quả mô phỏng

Lượt mô phỏng: `cost/simulate-__.csv` · run ID __ · __ phiên · seed __

*(dán bảng từ `cost/simulate-N-summary.md`)*

| Model | Chi phí / phiên | Chi phí / task thành công | / tháng — thấp | / tháng — cơ sở | / tháng — cao | / người / tháng (cơ sở) |
|---|---|---|---|---|---|---|
| | | | | | | |
| | | | | | | |

Chi phí / task thành công = chi phí trung bình mỗi phiên ÷ tỉ lệ đạt — **không coi như đạt 100%**.

### Mô phỏng mới nhất

`cost/simulate-2.csv` · `simulate-2@20261128-144044` · 50 phiên · seed 42 · tỉ lệ đạt 12/30 (40%) từ `eval/run-3.csv`.

| Model | Chi phí / phiên | Chi phí / task thành công | Chi phí / câu hỏi đạt | Chi phí / tháng — thấp | Chi phí / tháng — cơ sở | Chi phí / tháng — cao | Chi phí / người / tháng (cơ sở) |
|---|---:|---:|---:|---:|---:|---:|---:|
| gemini-3.1-flash-lite | $0.00012 | $0.00031 | $0.00013 | $0.4560 | $1.06 | $1.52 | $0.0015 |
| gemini-4-hydrogen | $0.00069 | $0.0017 | $0.00071 | $2.55 | $5.95 | $8.49 | $0.0085 |

Token đo trên `gpt-4o-mini`; chi phí tính theo giá model trong bảng. Các persona và giá còn cần nguồn xác thực; xem cảnh báo trong `cost/simulate-2-summary.md`.

## 3. So với impact

- Impact / người / tháng (`spec.md` §2): __
- Chi phí / người / tháng (cơ sở, model __): __
- **Kết luận một dòng — đáng làm không:** __

## 4. *(Muốn sâu hơn, không bắt buộc)*

- Bảng độ nhạy: model rẻ hơn · cache · cắt ngữ cảnh · giới hạn bước — mỗi cần gạt đổi chi phí bao nhiêu
- Chi phí ngoài model: hosting, lưu trữ, giờ công người duyệt
- Quy mô nào thì bài toán còn đáng làm
