# Schema mẫu cho màn Nhập sản phẩm — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Màn "Nhập sản phẩm" cho biết file cần những cột gì, có nút tải file mẫu và link tải data demo.

**Architecture:** File mẫu do backend Python sinh (`GET /api/vpost/catalog/template`), test nhập lại chính nó để không lệch `rules.ALIASES`. Giao diện thêm một component trình bày `ProductFileSchema` (không hook) vào `ProductFileImport`.

**Tech Stack:** FastAPI + pytest (Postgres), Next.js 16 + Astryx + vitest (`renderToStaticMarkup`).

**Spec:** `docs/superpowers/specs/2026-11-28-import-schema-mau-design.md`

## Global Constraints

- Tên cột trong file mẫu: `Mã sản phẩm, Tên sản phẩm, Loại, Giá bán, Giá tệ, Size, Màu, Chất liệu, Mô tả, Ảnh, Page, Prompt`.
- CSV UTF-8 có BOM (Excel mở đúng dấu), tên tải về `mau-nhap-san-pham.csv`.
- Câu chữ tiếng Việt, ngắn, không bịa số.

## Review Focus

- Mở file mẫu bằng Excel trên Windows → dấu tiếng Việt đúng (BOM) — test kiểm 3 byte đầu.
- Nhập lại nguyên file mẫu → 2 mã vào danh sách, không cột nào bị bỏ — test round-trip.
- Dòng ví dụ thứ 2 chỉ có mã + giá → vẫn nhập, bị chặn lúc soạn bài — nằm trong test round-trip.

---

### Task 1: Route file mẫu (Python)

**Files:** Modify `codebase/vpost_api.py` (cạnh `upload_catalog`) · Test `tests/test_vpost_api.py`

**Interfaces:** Produces `GET /api/vpost/catalog/template` → `text/csv`, `Content-Disposition: attachment; filename="mau-nhap-san-pham.csv"`.

- [ ] Test `test_catalog_template_round_trips`: GET 200; body bắt đầu bằng `\xef\xbb\xbf`; `rules.read_table(body, "mau.csv")` → 2 dòng, dòng 1 có đủ mọi trường trong `rules.FIELDS` trừ `page` không rỗng; POST lại body vào `/api/vpost/catalog` → `rows == 2`, `skipped == []`.
- [ ] Chạy test, thấy trượt (404).
- [ ] Thêm `TEMPLATE_COLUMNS` + `catalog_template()` dùng `csv` chuẩn, trả `Response`.
- [ ] Chạy `tests/test_vpost_api.py`, đạt hết.

### Task 2: Bảng cột + link tải (giao diện)

**Files:** Create `vpost/src/ui/components/onboarding/ProductFileSchema.tsx` · Modify `ProductFileImport.tsx` · Test `vpost/src/ui/components/onboarding/__tests__/product-file-schema-render.test.tsx`

**Interfaces:** Consumes `/api/vpost/catalog/template`, `/api/sample`. Produces `ProductFileSchema()` (không props).

- [ ] Test render: có "Mã sản phẩm", "Bắt buộc", "Giá bán", "Ảnh"; có `href="/api/vpost/catalog/template"` và `href="/api/sample"`.
- [ ] Viết `ProductFileSchema`: `Table` 3 cột (Cột · Mức độ · Ví dụ) theo spec, câu "thiếu cột/ô trống vẫn nhập…", 2 `Link` có `download`.
- [ ] Đặt `<ProductFileSchema />` trên ô chọn file trong `ProductFileImport`.
- [ ] `pnpm run typecheck`, eslint các file đổi, vitest onboarding đạt.
