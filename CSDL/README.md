# Thư mục `CSDL/` — Lưu trữ cục bộ cho SkyBill

Thư mục này được [codebase/storage.py](../codebase/storage.py) tự động khởi tạo khi chạy `python run.py`:

- `CSDL/images/YYYY-MM-DD/<RecordId>.jpg`: Ảnh hoá đơn người dùng đã chụp hoặc tải lên.
- `CSDL/receipts.json`: Danh sách hoá đơn đã xác nhận lưu vào sổ chi tiêu (mặc định tự tạo 17 hoá đơn mẫu `synthetic` Tháng 10–11/2026 nếu chưa có).
- `CSDL/drafts.json`: Các bản nháp đang chờ người dùng duyệt (`DRAFT_PENDING_USER`).

> Để bảo vệ dữ liệu ảnh và hoá đơn cục bộ, các file `CSDL/images/`, `CSDL/receipts.json` và `CSDL/drafts.json` được loại trừ trong `.gitignore`.
