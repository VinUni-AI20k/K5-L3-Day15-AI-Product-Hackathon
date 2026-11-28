import { formatCount } from "@/ui/schemas/catalog.schema";
import type {
  ProductDetail,
  ProductStockCell,
  ProductStockGrid,
} from "@/ui/schemas/product-detail.schema";
import { ApiError } from "@/ui/services/api-error";

/**
 * Pure presentation & state helpers for the product detail inspector.
 * Kept out of `.tsx` so every edge case (stock totals, out-of-stock cells,
 * safe image URLs, clipboard fallback, 404 classification) is unit-tested
 * without a browser DOM.
 */

// --- Detail query state -----------------------------------------------------

export type ProductDetailViewState =
  | { readonly kind: "idle" }
  | { readonly kind: "loading"; readonly code: string }
  | { readonly kind: "not_found"; readonly code: string; readonly message?: string }
  | {
      readonly kind: "error";
      readonly code: string;
      readonly error: ApiError;
      readonly onRetry: () => void;
    }
  | { readonly kind: "ready"; readonly detail: ProductDetail };

export function isProductNotFoundError(error: unknown): boolean {
  if (!ApiError.is(error)) return false;
  return error.status === 404 || error.code === "PRODUCT_NOT_FOUND";
}

export function toProductDetailViewState(input: {
  code: string | null;
  isPending: boolean;
  isFetching: boolean;
  data: ProductDetail | undefined;
  error: ApiError | null;
  onRetry: () => void;
}): ProductDetailViewState {
  const normalizedCode = input.code?.trim() ?? "";
  if (normalizedCode.length === 0) return { kind: "idle" };

  if (input.data) return { kind: "ready", detail: input.data };

  if (input.error) {
    if (isProductNotFoundError(input.error)) {
      return {
        kind: "not_found",
        code: normalizedCode,
        message: input.error.userMessage,
      };
    }
    return {
      kind: "error",
      code: normalizedCode,
      error: input.error,
      onRetry: input.onRetry,
    };
  }

  if (input.isPending || input.isFetching) {
    return { kind: "loading", code: normalizedCode };
  }

  return { kind: "loading", code: normalizedCode };
}

// --- Formatting & URL guards ------------------------------------------------

export function formatVnd(amount: number | null | undefined): string | null {
  if (typeof amount !== "number" || !Number.isFinite(amount)) return null;
  return `${formatCount(amount)} đ`;
}

/**
 * Guards `<a href>` and `<img src>` to `http://` / `https://` only so a
 * malformed or untrusted `anh` cell cannot inject `javascript:` or `data:`.
 */
export function isSafeHttpUrl(raw: string): boolean {
  return /^https?:\/\//i.test(raw.trim());
}

function nonEmpty(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

const AI_FACT_FIELD_LABELS: Record<string, string> = {
  ma_sp: "Mã sản phẩm",
  code: "Mã sản phẩm",
  ten_sp: "Tên sản phẩm",
  name: "Tên sản phẩm",
  loai: "Chủng loại",
  category: "Chủng loại",
  gia_ban: "Giá bán",
  giaBan: "Giá bán",
  price: "Giá bán",
  gia_te: "Giá tệ",
  giaTe: "Giá tệ",
  size: "Size",
  sizes: "Size",
  mau: "Màu",
  colors: "Màu",
  chat_lieu: "Chất liệu",
  chatLieu: "Chất liệu",
  material: "Chất liệu",
  mo_ta: "Mô tả",
  moTa: "Mô tả",
  anh: "Ảnh",
  images: "Ảnh",
  page: "Page",
  pageName: "Page",
  prompt: "Yêu cầu viết bài",
  ton_kho: "Tồn kho",
  stock: "Tồn kho",
};

export function aiFactFieldLabel(field: string): string {
  const key = field.trim();
  if (key.length === 0) return "";
  return AI_FACT_FIELD_LABELS[key] ?? AI_FACT_FIELD_LABELS[key.toLowerCase()] ?? key;
}

// --- Info section fields ----------------------------------------------------

export interface ProductInfoField {
  readonly key: string;
  readonly label: string;
  readonly value: string | null;
  /** Exact text written to the clipboard when different from `value`. */
  readonly copyValue?: string | null;
  readonly multiline?: boolean;
  readonly numeric?: boolean;
}

export function buildProductInfoFields(detail: ProductDetail): readonly ProductInfoField[] {
  const { fields } = detail;
  const pageName = nonEmpty(detail.pageName);
  const pageId = nonEmpty(detail.pageId);
  const pageDisplay =
    pageName && pageId && pageName !== pageId
      ? `${pageName} (${pageId})`
      : (pageName ?? pageId);

  const rawPrice = nonEmpty(fields.giaBan);
  const formattedVnd = formatVnd(fields.giaBanVnd);

  const list: ProductInfoField[] = [
    { key: "code", label: "Mã sản phẩm", value: nonEmpty(detail.code) },
    { key: "name", label: "Tên sản phẩm", value: nonEmpty(detail.name) },
    { key: "category", label: "Chủng loại", value: nonEmpty(detail.category) },
    {
      key: "page",
      label: "Page áp dụng",
      value: pageDisplay,
      copyValue: pageName ?? pageId,
    },
    {
      key: "giaBan",
      label: "Giá bán",
      value: rawPrice ?? formattedVnd,
      copyValue: rawPrice ?? (fields.giaBanVnd !== null ? String(fields.giaBanVnd) : null),
      numeric: true,
    },
  ];

  if (rawPrice !== null && formattedVnd !== null) {
    list.push({
      key: "giaBanVnd",
      label: "Giá quy đổi (VND)",
      value: formattedVnd,
      copyValue: String(fields.giaBanVnd),
      numeric: true,
    });
  }

  list.push(
    { key: "giaTe", label: "Giá tệ", value: nonEmpty(fields.giaTe), numeric: true },
    { key: "size", label: "Size", value: nonEmpty(fields.size) },
    { key: "mau", label: "Màu", value: nonEmpty(fields.mau) },
    { key: "chatLieu", label: "Chất liệu", value: nonEmpty(fields.chatLieu) },
    { key: "moTa", label: "Mô tả", value: nonEmpty(fields.moTa), multiline: true },
    {
      key: "prompt",
      label: "Yêu cầu viết bài (Prompt)",
      value: nonEmpty(fields.prompt),
      multiline: true,
    },
  );

  return list;
}

// --- Stock colour × size matrix --------------------------------------------

export interface StockMatrixCell {
  readonly color: string;
  readonly size: string;
  readonly qty: number | null;
  readonly status: string | null;
  readonly inStock: boolean;
  /** Visible text inside the table cell ("12", "Hết", "Còn"). */
  readonly displayText: string;
}

export interface StockMatrixRow {
  readonly color: string;
  readonly cells: readonly StockMatrixCell[];
  readonly total: number | null;
}

export interface StockMatrix {
  readonly isEmpty: boolean;
  readonly colors: readonly string[];
  readonly sizes: readonly string[];
  readonly rows: readonly StockMatrixRow[];
  readonly colTotals: readonly (number | null)[];
  readonly grandTotal: number | null;
}

function uniqueOrdered(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

function sumQuantities(values: readonly (number | null)[]): number | null {
  let hasNumber = false;
  let total = 0;
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) {
      hasNumber = true;
      total += value;
    }
  }
  return hasNumber ? total : null;
}

export function buildStockMatrix(stock: ProductStockGrid): StockMatrix {
  const declaredColors = uniqueOrdered(stock.colors);
  const declaredSizes = uniqueOrdered(stock.sizes);
  const cellColors = uniqueOrdered(stock.cells.map((cell) => cell.color));
  const cellSizes = uniqueOrdered(stock.cells.map((cell) => cell.size));

  let colors = declaredColors.length > 0 ? declaredColors : cellColors;
  let sizes = declaredSizes.length > 0 ? declaredSizes : cellSizes;

  if (colors.length === 0 && sizes.length === 0 && stock.cells.length === 0) {
    return {
      isEmpty: true,
      colors: [],
      sizes: [],
      rows: [],
      colTotals: [],
      grandTotal: stock.totalQty,
    };
  }

  const hasImplicitColor = colors.length === 0;
  const hasImplicitSize = sizes.length === 0;
  if (hasImplicitColor) colors = ["Mặc định"];
  if (hasImplicitSize) sizes = ["Mặc định"];

  const exactMap = new Map<string, ProductStockCell>();
  const foldedMap = new Map<string, ProductStockCell>();

  for (const cell of stock.cells) {
    const c = cell.color.trim();
    const s = cell.size.trim();
    const exactKey = `${c}\0${s}`;
    const foldedKey = `${c.toLowerCase()}\0${s.toLowerCase()}`;
    if (!exactMap.has(exactKey)) exactMap.set(exactKey, cell);
    if (!foldedMap.has(foldedKey)) foldedMap.set(foldedKey, cell);
  }

  function findCell(color: string, size: string): ProductStockCell | undefined {
    const lookupColor = hasImplicitColor ? "" : color;
    const lookupSize = hasImplicitSize ? "" : size;
    return (
      exactMap.get(`${lookupColor}\0${lookupSize}`) ??
      foldedMap.get(`${lookupColor.toLowerCase()}\0${lookupSize.toLowerCase()}`)
    );
  }

  const rows: StockMatrixRow[] = colors.map((color) => {
    const rowCells: StockMatrixCell[] = sizes.map((size) => {
      const matched = findCell(color, size);
      if (!matched || !matched.inStock) {
        return {
          color,
          size,
          qty: matched?.qty ?? null,
          status: nonEmpty(matched?.status),
          inStock: false,
          displayText: "Hết",
        };
      }

      const displayText =
        matched.qty !== null && Number.isFinite(matched.qty)
          ? formatCount(matched.qty)
          : (nonEmpty(matched.status) ?? "Còn");

      return {
        color,
        size,
        qty: matched.qty,
        status: nonEmpty(matched.status),
        inStock: true,
        displayText,
      };
    });

    return {
      color,
      cells: rowCells,
      total: sumQuantities(rowCells.map((cell) => cell.qty)),
    };
  });

  const colTotals = sizes.map((_, colIndex) =>
    sumQuantities(rows.map((row) => row.cells[colIndex]?.qty ?? null)),
  );

  const computedGrandTotal = sumQuantities(rows.map((row) => row.total));
  const grandTotal =
    stock.totalQty !== null && Number.isFinite(stock.totalQty)
      ? stock.totalQty
      : computedGrandTotal;

  return {
    isEmpty: false,
    colors,
    sizes,
    rows,
    colTotals,
    grandTotal,
  };
}

// --- Clipboard copy feedback ------------------------------------------------

export interface ProductCopyFeedback {
  readonly status: "idle" | "copied" | "failed";
  readonly fieldKey: string | null;
  readonly announcement: string;
}

export const IDLE_COPY_FEEDBACK: ProductCopyFeedback = {
  status: "idle",
  fieldKey: null,
  announcement: "",
};

export interface ClipboardWriter {
  writeText: (text: string) => Promise<void>;
}

/**
 * Copies one product field value without throwing. Produces a polite Vietnamese
 * status ("Đã sao chép …") on success or a manual-copy hint if denied.
 */
export async function copyProductFieldValue(
  fieldKey: string,
  label: string,
  rawValue: string,
  clipboard?: ClipboardWriter | null,
): Promise<ProductCopyFeedback> {
  const value = rawValue.trim();
  if (value.length === 0) {
    return {
      status: "failed",
      fieldKey,
      announcement: "Không có nội dung để sao chép.",
    };
  }

  const writer: ClipboardWriter | null =
    clipboard !== undefined
      ? clipboard
      : typeof navigator !== "undefined" &&
          typeof navigator.clipboard?.writeText === "function"
        ? navigator.clipboard
        : null;

  if (!writer || typeof writer.writeText !== "function") {
    return {
      status: "failed",
      fieldKey,
      announcement: "Không thể sao chép tự động — hãy chọn và sao chép thủ công.",
    };
  }

  try {
    await writer.writeText(value);
    return {
      status: "copied",
      fieldKey,
      announcement: `Đã sao chép ${label}`,
    };
  } catch {
    return {
      status: "failed",
      fieldKey,
      announcement: "Không thể sao chép tự động — hãy chọn và sao chép thủ công.",
    };
  }
}
