import { z } from "zod";

/**
 * Contract for `GET /api/catalog/products/{code}` (product detail for
 * fact-checking AI output).
 *
 * `ui/` may not import `core/` or Python modules; this runtime schema is the
 * single validation boundary before detail data reaches React.
 */

export const ProductDetailFieldsSchema = z.object({
  giaBan: z.string().nullable(),
  giaBanVnd: z.number().nullable(),
  giaTe: z.string().nullable(),
  size: z.string().nullable(),
  mau: z.string().nullable(),
  chatLieu: z.string().nullable(),
  moTa: z.string().nullable(),
  prompt: z.string().nullable(),
});
export type ProductDetailFields = z.infer<typeof ProductDetailFieldsSchema>;

export const ProductStockCellSchema = z.object({
  color: z.string(),
  size: z.string(),
  qty: z.number().nullable(),
  status: z.string().nullable(),
  inStock: z.boolean(),
});
export type ProductStockCell = z.infer<typeof ProductStockCellSchema>;

export const ProductStockGridSchema = z.object({
  sizes: z.array(z.string()),
  colors: z.array(z.string()),
  cells: z.array(ProductStockCellSchema),
  inStockSizes: z.array(z.string()),
  inStockColors: z.array(z.string()),
  totalQty: z.number().nullable(),
});
export type ProductStockGrid = z.infer<typeof ProductStockGridSchema>;

export const ProductAiFactSchema = z.object({
  id: z.string().min(1),
  field: z.string(),
  text: z.string(),
});
export type ProductAiFact = z.infer<typeof ProductAiFactSchema>;

export const ProductBlockingItemSchema = z.object({
  code: z.string().min(1),
  message: z.string(),
});
export type ProductBlockingItem = z.infer<typeof ProductBlockingItemSchema>;

export const ProductDetailSchema = z.object({
  code: z.string().min(1),
  name: z.string(),
  category: z.string().nullable(),
  pageId: z.string().nullable(),
  pageName: z.string().nullable(),
  fields: ProductDetailFieldsSchema,
  images: z.array(z.string()),
  stock: ProductStockGridSchema,
  aiFacts: z.array(ProductAiFactSchema),
  warnings: z.array(z.string()),
  blocking: z.array(ProductBlockingItemSchema),
  composable: z.boolean(),
});
export type ProductDetail = z.infer<typeof ProductDetailSchema>;

export const ProductDetailResponseSchema = z.object({
  tenantId: z.string().min(1),
  product: ProductDetailSchema,
});
export type ProductDetailResponse = z.infer<typeof ProductDetailResponseSchema>;
