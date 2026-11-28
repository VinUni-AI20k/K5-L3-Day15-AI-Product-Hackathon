import { describe, expect, it } from "vitest";

import { CatalogProductsResponseSchema } from "../catalog.schema";
import { ProductDetailResponseSchema } from "../product-detail.schema";

const VALID_DETAIL_RESPONSE = {
  tenantId: "00000000-0000-0000-0000-000000000001",
  product: {
    code: "MGKVX6310",
    name: "Đầm midi cổ vuông Giannal",
    category: "Đầm",
    pageId: "page-1",
    pageName: "Thời trang nữ A",
    fields: {
      giaBan: "450.000đ",
      giaBanVnd: 450000,
      giaTe: "85",
      size: "S, M, L",
      mau: "Đen, Kem",
      chatLieu: "Cotton lụa",
      moTa: "Dáng xòe nhẹ, khóa kéo sau lưng.",
      prompt: "Nhấn mạnh dáng xòe đi làm và đi tiệc nhẹ.",
    },
    images: ["https://cdn.example.com/a.jpg", "https://cdn.example.com/b.jpg"],
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
      { id: "F2", field: "mau", text: "Màu còn hàng: Đen, Kem" },
    ],
    warnings: ["ton_kho: sắp hết ở một số biến thể"],
    blocking: [],
    composable: true,
  },
};

describe("ProductDetailResponseSchema", () => {
  it("accepts a complete product detail response", () => {
    const parsed = ProductDetailResponseSchema.safeParse(VALID_DETAIL_RESPONSE);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.product.code).toBe("MGKVX6310");
    expect(parsed.data.product.stock.cells).toHaveLength(6);
    expect(parsed.data.product.aiFacts).toHaveLength(2);
  });

  it("accepts nullable optional metadata and empty arrays", () => {
    const parsed = ProductDetailResponseSchema.safeParse({
      tenantId: "tenant-1",
      product: {
        code: "SP01",
        name: "",
        category: null,
        pageId: null,
        pageName: null,
        fields: {
          giaBan: null,
          giaBanVnd: null,
          giaTe: null,
          size: null,
          mau: null,
          chatLieu: null,
          moTa: null,
          prompt: null,
        },
        images: [],
        stock: {
          sizes: [],
          colors: [],
          cells: [],
          inStockSizes: [],
          inStockColors: [],
          totalQty: null,
        },
        aiFacts: [],
        warnings: [],
        blocking: [{ code: "OUT_OF_STOCK", message: "Hết toàn bộ biến thể" }],
        composable: false,
      },
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects a detail response missing a product code", () => {
    const parsed = ProductDetailResponseSchema.safeParse({
      ...VALID_DETAIL_RESPONSE,
      product: { ...VALID_DETAIL_RESPONSE.product, code: "" },
    });
    expect(parsed.success).toBe(false);
  });
});

describe("CatalogProductsResponseSchema — optional additive list fields", () => {
  const BASE_ITEM = {
    code: "MGKVX6310",
    name: "Giannal",
    category: "Áo",
    season: null,
    inventory: {
      status: "in_stock",
      stock: 10,
      reason: null,
      operatorMessage: null,
      stockCheckSkipped: false,
      stockCheckSkippedReason: null,
    },
    mediaImageCount: 3,
    mediaVideoCount: 0,
    hasConflict: false,
    composable: true,
    blockedReason: null,
  };

  it("still accepts list rows without price/sizes/colors/material", () => {
    const parsed = CatalogProductsResponseSchema.safeParse({
      items: [BASE_ITEM],
      nextCursor: null,
      totals: { total: 1, ok: 1, blocked: 0 },
    });
    expect(parsed.success).toBe(true);
  });

  it("preserves additive price/sizes/colors/material when returned by the API", () => {
    const parsed = CatalogProductsResponseSchema.safeParse({
      items: [
        {
          ...BASE_ITEM,
          price: "450.000đ",
          sizes: "S, M, L",
          colors: "Đen, Kem",
          material: "Cotton lụa",
        },
      ],
      nextCursor: null,
      totals: { total: 1, ok: 1, blocked: 0 },
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.items[0].price).toBe("450.000đ");
    expect(parsed.data.items[0].sizes).toBe("S, M, L");
    expect(parsed.data.items[0].colors).toBe("Đen, Kem");
    expect(parsed.data.items[0].material).toBe("Cotton lụa");
  });
});
