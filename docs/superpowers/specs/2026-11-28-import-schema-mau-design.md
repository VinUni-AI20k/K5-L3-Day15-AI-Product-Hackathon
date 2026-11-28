# Schema mẫu cho màn Nhập sản phẩm — thiết kế ngắn (đã duyệt 28/11)

**Vì sao:** người dùng không biết file sản phẩm cần những cột gì. Phần đọc file (`rules.read_table`) đã tự nhận tên cột tiếng Việt có/không dấu, hoa/thường, thứ tự tuỳ ý, nhưng màn hình không nói ra.

**Mục tiêu:** trên màn "Nhập sản phẩm" (`/data-mapping` khi chạy backend Python):
1. Bảng "File cần những cột nào": Mã sản phẩm (bắt buộc — thiếu thì bỏ dòng) · Giá bán, Size, Ảnh (cần để soạn bài) · Màu, Chất liệu (nên có) · Tên, Loại, Giá tệ, Mô tả, Page, Prompt (tuỳ chọn). Một câu: thiếu cột/ô trống vẫn nhập, chỉ bị lọc lúc soạn bài.
2. Nút "Tải file mẫu" → `GET /api/vpost/catalog/template` (backend Python sinh CSV UTF-8 có BOM: đúng các tên cột trên + 2 dòng ví dụ — một dòng đủ, một dòng chỉ mã + giá).
3. Link "Tải data demo (30 mẫu váy)" → `/api/sample` có sẵn.

**Không làm:** nút "Xử lý" file thô nhiều sheet của shop (file 14–107MB, có dữ liệu cá nhân).

**Cách làm đã chọn và vì sao:** file mẫu do Python sinh (cùng chỗ với bảng tên cột `rules.ALIASES`), có test nhập lại chính file mẫu → mọi cột đều được nhận, để bảng hiển thị và phần đọc file không lệch. Phương án khác: file tĩnh trong `vpost/public` (không có test chống lệch) hoặc sinh CSV trong trình duyệt (tên cột nằm ở TypeScript, xa `ALIASES`).

**Để người làm tự quyết:** câu chữ, cách dựng bảng bằng component sẵn có (Astryx `Table`/`List`).
