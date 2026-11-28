import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { ProductInspector } from "@/ui/components/products/ProductInspector";
import { ProductInspectorDrawer } from "@/ui/components/products/ProductInspectorDrawer";
import { ProductTable } from "@/ui/components/products/ProductTable";
import type { CatalogProduct } from "@/ui/schemas/catalog.schema";
import type { ProductDetail } from "@/ui/schemas/product-detail.schema";
import { ApiError } from "@/ui/services/api-error";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

function makeListProduct(overrides: Partial<CatalogProduct> = {}): CatalogProduct {
  return {
    code: "MGKVX6310",
    name: "Đầm midi cổ vuông tay bồng chất liệu cotton lụa thoáng mát",
    category: "Đầm công sở",
    season: "Xuân hè 2026",
    price: "450.000đ",
    sizes: "S, M, L, XL",
    colors: "Đen tuyền, Kem sữa, Xanh rêu đậm",
    material: "Cotton lụa Hàn Quốc mềm nhẹ không nhăn",
    inventory: {
      status: "in_stock",
      stock: 14,
      reason: null,
      operatorMessage: null,
      stockCheckSkipped: false,
      stockCheckSkippedReason: null,
    },
    mediaImageCount: 2,
    mediaVideoCount: 0,
    hasConflict: false,
    composable: true,
    blockedReason: null,
    ...overrides,
  };
}

function makeDetail(overrides: Partial<ProductDetail> = {}): ProductDetail {
  return {
    code: "MGKVX6310",
    name: "Đầm midi cổ vuông Giannal",
    category: "Đầm công sở",
    pageId: "page-a",
    pageName: "Thời trang nữ A",
    fields: {
      giaBan: "450.000đ",
      giaBanVnd: 450000,
      giaTe: "85",
      size: "S, M, L",
      mau: "Đen, Kem",
      chatLieu: "Cotton lụa",
      moTa: "Dáng xòe nhẹ, khóa kéo sau lưng.",
      prompt: "Tập trung vào form tôn dáng công sở.",
    },
    images: [
      "https://cdn.example.com/p1.jpg",
      "https://cdn.example.com/p2.jpg",
      "javascript:alert(1)",
    ],
    stock: {
      sizes: ["S", "M", "L"],
      colors: ["Đen", "Kem"],
      cells: [
        { color: "Đen", size: "S", qty: 5, status: "Còn hàng", inStock: true },
        { color: "Đen", size: "M", qty: 0, status: "Hết", inStock: false },
        { color: "Đen", size: "L", qty: 3, status: "Còn hàng", inStock: true },
        { color: "Kem", size: "S", qty: 2, status: "Còn hàng", inStock: true },
        { color: "Kem", size: "M", qty: 4, status: "Còn hàng", inStock: true },
        { color: "Kem", size: "L", qty: 0, status: "Hết", inStock: false },
      ],
      inStockSizes: ["S", "M", "L"],
      inStockColors: ["Đen", "Kem"],
      totalQty: 14,
    },
    aiFacts: [
      { id: "F1", field: "gia_ban", text: "Giá bán: 450.000đ" },
      { id: "F2", field: "chat_lieu", text: "Chất liệu: Cotton lụa" },
      { id: "F3", field: "mau", text: "Màu còn hàng: Đen, Kem" },
    ],
    warnings: ["ton_kho: màu Đen size M đã hết"],
    blocking: [],
    composable: true,
    ...overrides,
  };
}

describe("ProductTable — additive columns & keyboard tooltips", () => {
  it("renders existing and new columns with keyboard-focusable truncated values and right-aligned price", () => {
    const item = makeListProduct();
    const html = renderToStaticMarkup(
      <ProductTable items={[item]} selectedCode={item.code} onSelect={() => {}} />,
    );

    // Existing headers preserved
    expect(html).toContain("Mã SP");
    expect(html).toContain("Tên sản phẩm");
    expect(html).toContain("Chủng loại");
    expect(html).toContain("Tồn kho");
    expect(html).toContain("Ảnh / video");

    // New contract headers
    expect(html).toContain("Giá bán");
    expect(html).toContain("Size");
    expect(html).toContain("Màu");
    expect(html).toContain("Chất liệu");

    // Full values exposed in keyboard-focusable tooltip triggers + title attributes
    expect(html).toContain(`title="${item.material}"`);
    expect(html).toContain(`title="${item.colors}"`);
    expect(html).toContain(`title="${item.price}"`);
    expect(html).toContain('tabindex="0"');
    expect(html).toContain("text-right");
  });

  it("renders placeholders gracefully when optional backend keys are absent", () => {
    const legacy = makeListProduct({
      price: undefined,
      sizes: undefined,
      colors: undefined,
      material: undefined,
    });
    const html = renderToStaticMarkup(
      <ProductTable items={[legacy]} selectedCode={null} onSelect={() => {}} />,
    );

    expect(html).toContain(legacy.code);
    expect(html).toContain("—");
  });
});

describe("ProductInspector — full fact-checking detail contract", () => {
  it("renders all contract sections, real stock table, safe image links, AI facts, copy buttons and polite status", () => {
    const item = makeListProduct();
    const detail = makeDetail();

    const html = renderToStaticMarkup(
      <ProductInspector
        state={{ kind: "product", product: item }}
        detail={{ kind: "ready", detail }}
        initialCopyFeedback={{
          status: "copied",
          fieldKey: "giaBan",
          announcement: "Đã sao chép Giá bán",
        }}
      />,
    );

    // All sections present with proper heading hierarchy (h2 code, h3 sections)
    expect(html).toContain("<h2");
    expect(html).toContain("<h3");
    expect(html).toContain("Thông tin");
    expect(html).toContain("Tồn kho");
    expect(html).toContain("Ảnh");
    expect(html).toContain("Dữ kiện AI được dùng");
    expect(html).toContain("Cảnh báo");

    // Fields & copy buttons + polite "Đã sao chép" live region
    expect(html).toContain("450.000đ");
    expect(html).toContain("450.000 đ");
    expect(html).toContain("Cotton lụa");
    expect(html).toContain("Tập trung vào form tôn dáng công sở.");
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain("Đã sao chép Giá bán");
    expect(html).toContain("Sao chép Chất liệu");

    // Real HTML table for stock grid with row & column headers, muted "Hết", totals, scroll container
    expect(html).toContain("<table");
    expect(html).toContain('<caption class="sr-only"');
    expect(html).toContain('scope="col"');
    expect(html).toContain('scope="row"');
    expect(html).toContain("Màu / Size");
    expect(html).toContain("Hết");
    expect(html).toContain("bg-muted/60");
    expect(html).toContain("overflow-x-auto");
    expect(html).toContain("Tổng tồn:");

    // Images link to originals with rel="noopener noreferrer", unsafe javascript: URL excluded
    expect(html).toContain('href="https://cdn.example.com/p1.jpg"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).not.toContain("javascript:alert(1)");

    // AI facts F-ids + one-line grounding note
    expect(html).toContain("F1");
    expect(html).toContain("F2");
    expect(html).toContain("F3");
    expect(html).toContain("AI chỉ được phép dùng các dữ kiện dưới đây");
    expect(html).toContain("Giá bán: 450.000đ");
  });

  it("renders Lỗi chặn and hides Soạn bài when product is not composable", () => {
    const blockedDetail = makeDetail({
      composable: false,
      blocking: [
        { code: "OUT_OF_STOCK", message: "Hết toàn bộ biến thể trong kho" },
        { code: "MEDIA_NOT_FOUND", message: "Chưa có ảnh sản phẩm" },
      ],
    });

    const html = renderToStaticMarkup(
      <ProductInspector
        state={{ kind: "product", product: makeListProduct({ composable: false }) }}
        detail={{ kind: "ready", detail: blockedDetail }}
      />,
    );

    expect(html).toContain("Lỗi chặn");
    expect(html).toContain("Hết toàn bộ biến thể trong kho");
    expect(html).toContain("Chưa có ảnh sản phẩm");
    expect(html).not.toContain("Soạn bài");
  });

  it("renders loading skeleton state", () => {
    const html = renderToStaticMarkup(
      <ProductInspector
        state={{ kind: "product", product: makeListProduct() }}
        detail={{ kind: "loading", code: "MGKVX6310" }}
      />,
    );

    expect(html).toContain("Đang tải chi tiết mã MGKVX6310");
    expect(html).toContain('role="status"');
  });

  it("renders retryable error state for 5xx failures", () => {
    const err = new ApiError({
      code: "INTERNAL",
      status: 500,
      userMessage: "Máy chủ tạm gián đoạn",
    });

    const html = renderToStaticMarkup(
      <ProductInspector
        state={{ kind: "product", product: makeListProduct() }}
        detail={{ kind: "error", code: "MGKVX6310", error: err, onRetry: () => {} }}
      />,
    );

    expect(html).toContain("Máy chủ tạm gián đoạn");
    expect(html).toContain("Thử lại");
  });

  it("renders 404 PRODUCT_NOT_FOUND state without offering a retry button", () => {
    const html = renderToStaticMarkup(
      <ProductInspector
        state={{ kind: "missing", code: "SP404" }}
        detail={{
          kind: "not_found",
          code: "SP404",
          message: "Không có mã SP404 trong file sản phẩm đã tải",
        }}
      />,
    );

    expect(html).toContain("Không tìm thấy mã SP404");
    expect(html).toContain("Không có mã SP404 trong file sản phẩm đã tải");
    expect(html).not.toContain("Thử lại");
  });

  it("uses h3 for code and h4 for sections inside the mobile ProductInspectorDrawer", () => {
    const html = renderToStaticMarkup(
      <ProductInspectorDrawer
        state={{ kind: "product", product: makeListProduct() }}
        detail={{ kind: "ready", detail: makeDetail() }}
        isOpen
        onClose={() => {}}
        recovery={null}
      />,
    );

    expect(html).toContain("<dialog");
    expect(html).toContain("<h3");
    expect(html).toContain("<h4");
    expect(html).toContain("overflow-x-hidden");
    expect(html).toContain("overflow-x-auto");
  });
});
