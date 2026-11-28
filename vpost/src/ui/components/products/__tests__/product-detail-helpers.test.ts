import { describe, expect, it, vi } from "vitest";

import {
  aiFactFieldLabel,
  buildProductInfoFields,
  buildStockMatrix,
  copyProductFieldValue,
  formatVnd,
  isProductNotFoundError,
  isSafeHttpUrl,
  toProductDetailViewState,
} from "@/ui/components/products/product-detail-helpers";
import type { ProductDetail } from "@/ui/schemas/product-detail.schema";
import { ApiError } from "@/ui/services/api-error";

function sampleDetail(overrides: Partial<ProductDetail> = {}): ProductDetail {
  return {
    code: "MGKVX6310",
    name: "Đầm midi Giannal",
    category: "Đầm",
    pageId: "page-1",
    pageName: "Thời trang nữ A",
    fields: {
      giaBan: "450k",
      giaBanVnd: 450000,
      giaTe: "85",
      size: "S, M, L",
      mau: "Đen, Kem",
      chatLieu: "Cotton lụa",
      moTa: "Dáng xòe nhẹ",
      prompt: "Viết tự nhiên",
    },
    images: ["https://cdn.example.com/1.jpg"],
    stock: {
      sizes: ["S", "M", "L"],
      colors: ["Đen", "Kem"],
      cells: [
        { color: "Đen", size: "S", qty: 5, status: "Còn", inStock: true },
        { color: "Đen", size: "M", qty: 0, status: "Hết", inStock: false },
        { color: "đen", size: "L", qty: 2, status: "Còn", inStock: true },
        { color: "Kem", size: "S", qty: 3, status: "Còn", inStock: true },
      ],
      inStockSizes: ["S", "L"],
      inStockColors: ["Đen", "Kem"],
      totalQty: 10,
    },
    aiFacts: [{ id: "F1", field: "gia_ban", text: "Giá 450.000đ" }],
    warnings: [],
    blocking: [],
    composable: true,
    ...overrides,
  };
}

describe("buildStockMatrix", () => {
  it("reports empty when no colors, sizes or cells exist", () => {
    const matrix = buildStockMatrix({
      sizes: [],
      colors: [],
      cells: [],
      inStockSizes: [],
      inStockColors: [],
      totalQty: null,
    });
    expect(matrix.isEmpty).toBe(true);
    expect(matrix.rows).toHaveLength(0);
  });

  it("maps cells by colour × size, marks missing/out-of-stock cells as 'Hết', and computes totals", () => {
    const matrix = buildStockMatrix(sampleDetail().stock);

    expect(matrix.isEmpty).toBe(false);
    expect(matrix.colors).toEqual(["Đen", "Kem"]);
    expect(matrix.sizes).toEqual(["S", "M", "L"]);

    // Row 0: Đen — S:5, M:Hết (qty 0), L:2 (matched case-insensitively from "đen")
    expect(matrix.rows[0].cells.map((c) => c.displayText)).toEqual(["5", "Hết", "2"]);
    expect(matrix.rows[0].cells[1].inStock).toBe(false);
    expect(matrix.rows[0].total).toBe(7);

    // Row 1: Kem — S:3, M:Hết (missing cell), L:Hết (missing cell)
    expect(matrix.rows[1].cells.map((c) => c.displayText)).toEqual(["3", "Hết", "Hết"]);
    expect(matrix.rows[1].total).toBe(3);

    // Column totals: S=8, M=0, L=2; grandTotal=10
    expect(matrix.colTotals).toEqual([8, 0, 2]);
    expect(matrix.grandTotal).toBe(10);
  });

  it("handles sizes-only products by creating one implicit row", () => {
    const matrix = buildStockMatrix({
      sizes: ["S", "M"],
      colors: [],
      cells: [
        { color: "", size: "S", qty: 4, status: null, inStock: true },
        { color: "", size: "M", qty: 0, status: "Hết", inStock: false },
      ],
      inStockSizes: ["S"],
      inStockColors: [],
      totalQty: null,
    });

    expect(matrix.isEmpty).toBe(false);
    expect(matrix.colors).toEqual(["Mặc định"]);
    expect(matrix.rows[0].cells.map((c) => c.displayText)).toEqual(["4", "Hết"]);
    expect(matrix.grandTotal).toBe(4);
  });
});

describe("buildProductInfoFields", () => {
  it("includes every contract field and separates raw price from converted VND when both exist", () => {
    const fields = buildProductInfoFields(sampleDetail());
    const keys = fields.map((f) => f.key);

    expect(keys).toEqual([
      "code",
      "name",
      "category",
      "page",
      "giaBan",
      "giaBanVnd",
      "giaTe",
      "size",
      "mau",
      "chatLieu",
      "moTa",
      "prompt",
    ]);

    const priceVnd = fields.find((f) => f.key === "giaBanVnd");
    expect(priceVnd?.value).toBe("450.000 đ");
    expect(priceVnd?.copyValue).toBe("450000");
  });

  it("falls back to formatted VND in Giá bán when giaBan is null", () => {
    const detail = sampleDetail({
      fields: {
        ...sampleDetail().fields,
        giaBan: null,
        giaBanVnd: 320000,
      },
    });
    const fields = buildProductInfoFields(detail);
    const price = fields.find((f) => f.key === "giaBan");
    expect(price?.value).toBe("320.000 đ");
    expect(fields.find((f) => f.key === "giaBanVnd")).toBeUndefined();
  });
});

describe("copyProductFieldValue", () => {
  it("returns polite 'Đã sao chép …' when clipboard write succeeds", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const result = await copyProductFieldValue("giaBan", "Giá bán", "450k", { writeText });

    expect(writeText).toHaveBeenCalledWith("450k");
    expect(result).toEqual({
      status: "copied",
      fieldKey: "giaBan",
      announcement: "Đã sao chép Giá bán",
    });
  });

  it("never lies when clipboard is unavailable or rejects", async () => {
    const denied = await copyProductFieldValue("giaBan", "Giá bán", "450k", {
      writeText: vi.fn().mockRejectedValue(new Error("denied")),
    });
    expect(denied.status).toBe("failed");
    expect(denied.announcement).not.toContain("Đã sao chép");

    const missing = await copyProductFieldValue("giaBan", "Giá bán", "450k", null);
    expect(missing.status).toBe("failed");
  });

  it("refuses blank values", async () => {
    const result = await copyProductFieldValue("moTa", "Mô tả", "   ", {
      writeText: vi.fn(),
    });
    expect(result.status).toBe("failed");
  });
});

describe("URL guard, formatting, and error classification", () => {
  it("allows only http and https URLs", () => {
    expect(isSafeHttpUrl("https://cdn.example.com/img.jpg")).toBe(true);
    expect(isSafeHttpUrl("http://example.com/img.png")).toBe(true);
    expect(isSafeHttpUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeHttpUrl("data:text/html,hi")).toBe(false);
    expect(isSafeHttpUrl("/relative/path.jpg")).toBe(false);
  });

  it("formats VND and AI fact field labels", () => {
    expect(formatVnd(450000)).toBe("450.000 đ");
    expect(formatVnd(null)).toBeNull();
    expect(aiFactFieldLabel("chat_lieu")).toBe("Chất liệu");
    expect(aiFactFieldLabel("giaBan")).toBe("Giá bán");
    expect(aiFactFieldLabel("custom_field")).toBe("custom_field");
  });

  it("classifies 404 and PRODUCT_NOT_FOUND separately from retryable errors", () => {
    const notFound = new ApiError({
      code: "PRODUCT_NOT_FOUND",
      status: 404,
      userMessage: "Không có mã SP999",
    });
    const serverErr = new ApiError({
      code: "INTERNAL",
      status: 500,
      userMessage: "Lỗi máy chủ",
    });

    expect(isProductNotFoundError(notFound)).toBe(true);
    expect(isProductNotFoundError(serverErr)).toBe(false);

    expect(
      toProductDetailViewState({
        code: "SP999",
        isPending: false,
        isFetching: false,
        data: undefined,
        error: notFound,
        onRetry: () => {},
      }),
    ).toEqual({
      kind: "not_found",
      code: "SP999",
      message: "Không có mã SP999",
    });

    const errState = toProductDetailViewState({
      code: "SP999",
      isPending: false,
      isFetching: false,
      data: undefined,
      error: serverErr,
      onRetry: () => {},
    });
    expect(errState.kind).toBe("error");
  });
});
