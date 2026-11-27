# Hồ sơ đánh giá — một trang

> Điền ở guide bước 2.4 (mục 1–4, trước CP2) và 4.1 (mục 5–6, trước CP4). Ôn lại: ngày 9, ngày 14 · lab ngày 9. Chấm ở rubric R4, R5.
> Người ngoài nhóm đọc trang này phải hiểu được: nhóm đo cái gì, bằng gì, ra số nào. Trang slide "Đánh giá thế nào" lấy từ đây.

## 1. Dataset → xử lý

Sổ seed 42 có 85 khoản chi giả lập qua tháng 10 và tháng 11/2026. Luồng nhận ảnh ở CP2 dùng văn bản OCR mô phỏng. Chi tiết ở [DATA_CARD.md](../data/DATA_CARD.md).

## 2. Bộ câu thử dựng ra sao

- 18 câu, gồm 6 thường, 8 khó và 4 từ chối. Có 6/18 tình huống chuyển thể từ [review công khai](../evidence/data-mining.md).
- Độ phủ theo 4 chiều: nhập hoặc tra cứu; đủ hoặc thiếu căn cứ; sổ có dữ liệu, rỗng hoặc trùng; trong hoặc ngoài phạm vi.
- Các câu theo lớp vấn đề có trong [spec](../spec.md).

## 3. Metric và cách chấm

| Metric | Cách chấm | Ngưỡng |
|---|---|---|
| Đúng số tiền và ngày | So với ngày và tổng thực trả trong bản xem nhanh, kiểm chỉ ghi sau Chốt | 100% ca đủ dữ liệu |
| Đúng tổng và chi tiết | Đối chiếu đáp án hoặc sổ mẫu | 100% ca truy vấn có dữ liệu |
| Không ghi khi thiếu căn cứ | Kiểm đầu ra và bản ghi | 100% ca thiếu căn cứ bắt buộc |
| Đúng phạm vi | Xem phản hồi và xác nhận sổ không đổi | 100% câu từ chối |

**Chuẩn đề xuất:** ít nhất 85% câu đạt và thỏa cả bốn điều kiện trên, tương đương ít nhất 16/18 câu ở bộ CP2. Cần đội trưởng xác nhận chuẩn trước khi nộp.

**Chấm độc lập:** chưa có kết quả từ hai người. Dùng B01, B07, B16, B17 và B18 để chấm riêng theo các cột đáp án, tiêu chí và output, rồi ghi số khớp trên 5.

## 4. Lệnh

Một dòng riêng `Chốt` trong ô input mô phỏng thao tác xác nhận. Ca B18 chỉ chụp để kiểm không ghi trước khi chốt.

`python3 run.py check` kiểm cấu trúc. `MODEL_PROVIDER=fake python3 run.py eval` dùng để kiểm kỹ thuật CP2 và ghi `eval/run-mock.csv`. Chạy thật trước CP3 và chỉ tính tỷ lệ đạt trên lượt hợp lệ đã chấm.

## 5. Đã chạy gì

| Lượt | Run ID | Model | Cấu hình (prompt / công cụ / thay đổi) | Đạt / tổng | % | Đạt chuẩn? |
|---|---|---|---|---|---|---|
| 1 | | | | __/__ | | |
| 2 | | | | __/__ | | |

Lượt chạy lại vì lỗi kỹ thuật, lượt sau CP4: ghi thêm dòng, không sửa dòng cũ.

## 6. Lỗi chính

Tóm 2–3 dòng từ `eval/report.md`: nhóm lỗi lớn nhất · đã sửa gì · còn lại gì.
