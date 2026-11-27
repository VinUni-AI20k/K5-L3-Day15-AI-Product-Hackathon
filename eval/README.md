# Hồ sơ đánh giá — một trang

> Điền ở guide bước 2.4 (mục 1–4, trước CP2) và 4.1 (mục 5–6, trước CP4). Ôn lại: ngày 9, ngày 14 · lab ngày 9. Chấm ở rubric R4, R5.
> Người ngoài nhóm đọc trang này phải hiểu được: nhóm đo cái gì, bằng gì, ra số nào. Trang slide "Đánh giá thế nào" lấy từ đây.

## 1. Dataset → xử lý

Sổ seed 42 có 85 khoản chi giả lập qua tháng 10 và tháng 11/2026. Luồng nhận ảnh ở CP2 dùng văn bản OCR mô phỏng. Chi tiết ở [DATA_CARD.md](../data/DATA_CARD.md).

## 2. Bộ câu thử dựng ra sao

- 20 câu, gồm 8 thường, 8 khó và 4 từ chối. Có 7/20 tình huống chuyển thể từ [review công khai](../evidence/data-mining.md).
- Độ phủ theo 4 chiều: nhập hoặc tra cứu; đủ hoặc thiếu căn cứ; sổ có dữ liệu, rỗng hoặc trùng; trong hoặc ngoài phạm vi.
- Các câu theo lớp vấn đề có trong [spec](../spec.md).

## 3. Metric và cách chấm

| Metric | Cách chấm | Ngưỡng |
|---|---|---|
| Đúng số tiền và ngày | So với ngày và tổng thực trả trong bản xem nhanh, kiểm chỉ ghi sau Chốt | 100% ca đủ dữ liệu |
| Đúng tổng và chi tiết | Đối chiếu đáp án hoặc sổ mẫu | 100% ca truy vấn có dữ liệu |
| Không ghi khi thiếu căn cứ | Kiểm đầu ra và bản ghi | 100% ca thiếu căn cứ bắt buộc |
| Đúng phạm vi | Xem phản hồi và xác nhận sổ không đổi | 100% câu từ chối |

**Chuẩn CP2 đã được đội trưởng xác nhận:** ít nhất 85% câu đạt và thỏa cả bốn điều kiện trên, tương đương ít nhất 17/20 câu ở bộ CP2. Xem [spec.md §7](../spec.md).

**Chấm độc lập:** lấy 5 output từ `eval/run-mock.csv` (chế độ `MODEL_PROVIDER=fake`, lượt kiểm ngày 27/11/2026) để chấm riêng theo các cột đáp án, tiêu chí và `eval/metric_spec.yaml`. Người 1 (**Nguyễn Tuấn Kiệt**) đã chấm xong 5 câu dưới đây; **Người 2 (Trịnh Công Đức)** sẽ ghi kết quả chấm độc lập để chốt số **khớp __/5** *(cần ≥4/5)*.

| ID | Loại | Output kiểm tra (`eval/run-mock.csv`) | Người 1 (Kiệt) | Người 2 (Đức) |
|---|---|---|---|---|
| `B01` | `thuong` | Xem nhanh đúng `2026-11-26 · HIGHLANDS*Q1 · 70.000đ · Ăn uống` chưa ghi; sau `Chốt` lưu và ra tổng `260.000đ` (`3` khoản) | `1` | `__` |
| `B07` | `kho` | Báo `Cần đọc lại hóa đơn: số tiền thực trả`, chưa ghi khoản chi, hướng dẫn chụp lại | `1` | `__` |
| `B16` | `kho` | Xem nhanh trước `Chốt`; sau `Chốt` báo `Khoản đã có, không ghi trùng`, giữ tổng `2026-11-15` là `516.000đ` | `1` | `__` |
| `B17` | `tu_choi` | Từ chối xử lý thông tin nhạy cảm và không lặp lại OTP hay số thẻ | `1` | `__` |
| `B18` | `thuong` | Hiện xem nhanh `2026-11-27 · Cửa hàng Mẫu · 55.000đ · nhóm không rõ`, ghi rõ chưa ghi khoản chi và mời chọn `Chốt` | `1` | `__` |

**Đối chiếu kỹ thuật của Codex:** đầu ra của cả năm ca khớp tiêu chí đã viết và khớp kết quả của Người 1 ở 5/5 ca. Kết quả này hỗ trợ Người 2 kiểm tra, chưa ghi vào cột điểm chấm độc lập của Trịnh Công Đức.

## 4. Lệnh

Một dòng riêng `Chốt` trong ô input mô phỏng thao tác xác nhận. Ca B18 chỉ chụp để kiểm không ghi trước khi chốt.

`python3 run.py check` kiểm cấu trúc. `MODEL_PROVIDER=fake python3 run.py eval` dùng để kiểm kỹ thuật CP2 và ghi `eval/run-mock.csv`. Chạy thật trước CP3 và chỉ tính tỷ lệ đạt trên lượt hợp lệ đã chấm.

Kiểm kỹ thuật ngày 27/11/2026: chạy đủ 20 câu qua `answer()` với model giả, 0 lỗi thực thi. Lượt kiểm này dùng cho chấm thử chéo và không tính là lượt đánh giá model thật.

## 5. Đã chạy gì

| Lượt | Run ID | Model | Cấu hình (prompt / công cụ / thay đổi) | Đạt / tổng | % | Đạt chuẩn? |
|---|---|---|---|---|---|---|
| 1 | | | | __/__ | | |
| 2 | | | | __/__ | | |

Lượt chạy lại vì lỗi kỹ thuật, lượt sau CP4: ghi thêm dòng, không sửa dòng cũ.

## 6. Lỗi chính

Tóm 2–3 dòng từ `eval/report.md`: nhóm lỗi lớn nhất · đã sửa gì · còn lại gì.
