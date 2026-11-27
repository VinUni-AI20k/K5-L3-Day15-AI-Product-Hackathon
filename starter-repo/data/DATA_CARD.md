# Data card — dữ liệu bản chạy thử dùng

> Bản đầu (CP2). Không commit dữ liệu cá nhân thật; cache chỉ giữ tiêu đề, link, trích ≤ 2 câu.

## Dataset 1 · Cache kết quả tìm kiếm (Tavily + Nominatim)

| | |
|---|---|
| Dùng để làm gì | nguồn cho công cụ `tim_kiem_web`, `dinh_vi` khi chạy bộ câu thử ở chế độ `replay` |
| Từ đâu | Tavily Search API, Nominatim / OpenStreetMap; ghi lại bằng `SEARCH_MODE=record` |
| Xử lý những bước gì | chỉ giữ tiêu đề, link, tên miền, trích ≤ 2 câu; bỏ tên người viết; mỗi truy vấn một file `data/cache/{tavily,geo}/<sha1>.json` |
| Số dòng / số đoạn | __ (điền sau khi ghi cache ở Task 1) |
| Phiên bản / ngày lấy | __ |
| Nhãn | thật (trích đoạn công khai) |
| Giới hạn | giá phòng / suất ăn cho đoàn hiếm khi có trên mạng; kết quả thay đổi theo thời gian; không kiểm được còn phòng |

## Dataset 2 · Bảng đơn giá ước tính (`data/estimates.json`)

| | |
|---|---|
| Dùng để làm gì | đơn giá khi bài viết không có giá (xe, phòng theo hạng sao, suất ăn, gala, team building) |
| Từ đâu | nhóm tự ước tính; dòng nào có nguồn thì ghi link |
| Xử lý những bước gì | __ |
| Số dòng / số đoạn | __ |
| Phiên bản / ngày lấy | __ |
| Nhãn | `synthetic` *(tự ước tính)* — mọi số dùng từ bảng này mang nhãn "ước tính" trong output |
| Giới hạn | không phản ánh giá mùa cao điểm / giá thương lượng cho đoàn |

## Dataset 3 · Bộ câu thử (`eval/benchmark.csv`)

| | |
|---|---|
| Dùng để làm gì | đo theo `eval/metric_spec.yaml` |
| Từ đâu | nhóm tự viết từ kịch bản `spec.md` §5 (`tu_viet`) |
| Số dòng / số đoạn | 26 (thuong 11 · kho 10 · tu_choi 5) |
| Nhãn | `synthetic` |
| Giới hạn | **chưa có câu từ lời người dùng thật** — cần ≥ 9 câu `nguoi_dung` từ phỏng vấn giám đốc / người tổ chức trước CP3 |
