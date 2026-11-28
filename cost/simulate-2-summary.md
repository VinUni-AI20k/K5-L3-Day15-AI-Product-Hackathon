# Tóm tắt mô phỏng simulate-2@20261128-144044

Do `python run.py simulate` sinh ra — không sửa tay. Chép bảng sang `cost/cost-estimate.md`.

| Persona | Số phiên mô phỏng | Lượt hỏi / phiên | Token vào / phiên | Token ra / phiên | Gọi model / phiên | Gọi công cụ / phiên |
|---|---:|---:|---:|---:|---:|---:|
| dung_it | 23 | 1 | 171 | 19 | 0.1 | 1.3 |
| dung_vua | 18 | 3 | 297 | 35 | 0.2 | 3.4 |
| dung_nhieu | 9 | 5 | 586 | 68 | 0.4 | 5.9 |

Tỉ lệ đạt dùng để tính: 12/30 (40%) — lượt run-3@20261128-143901

- Tỉ lệ đạt lấy từ lượt nhóm chọn: eval/run-3.csv (--rate-from).

| Model (giá) | Chi phí / phiên | Chi phí / task thành công | Chi phí / câu hỏi đạt | Chi phí / tháng — thấp (300 người) | Chi phí / tháng — cơ sở (700 người) | Chi phí / tháng — cao (1.000 người) | Chi phí / người / tháng (cơ sở) |
|---|---:|---:|---:|---:|---:|---:|---:|
| gemini-3.1-flash-lite (vào 0.25 · ra 1.5 $/1M) | $0.00012 | $0.00031 | $0.00013 | $0.4560 | $1.06 | $1.52 | $0.0015 |
| gemini-4-hydrogen (vào 1.5 · ra 7.5 $/1M) | $0.00069 | $0.0017 | $0.00071 | $2.55 | $5.95 | $8.49 | $0.0085 |

- Chi phí / task thành công = chi phí / phiên ÷ tỉ lệ đạt. Chi phí / câu hỏi đạt = chi phí / phiên ÷ số lượt hỏi trung bình mỗi phiên (2.4) ÷ tỉ lệ đạt — tỉ lệ đạt đo theo từng câu thử.
- Token đo trên model: gpt-4o-mini. Giá tính theo từng model trong bảng — model khác bộ tách token thì số token thật có thể lệch; ghi rõ "đo trên model X, tính giá model Y" trong cost/cost-estimate.md.
- Phiên lỗi (không tính vào trung bình): 0/50.
