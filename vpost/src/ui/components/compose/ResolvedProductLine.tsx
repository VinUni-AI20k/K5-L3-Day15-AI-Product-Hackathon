"use client";

import { Token } from "@astryxdesign/core";
import { Check } from "lucide-react";

import { stockLabel } from "@/ui/components/inventory/stock-check";
import type { ComposeResponse } from "@/ui/schemas/compose.schema";
import { MANUAL_PRODUCT_BADGE } from "@/ui/schemas/product-origin.schema";

/**
 * The line that replaces the hint once a code resolved — template line 52–56:
 *
 *   ✓  Tên sản phẩm — mô tả ngắn · chủng loại · N ảnh · tồn 62   [Đổi sản phẩm]
 *
 * PRICE AND SIZE ARE MISSING ON PURPOSE, not forgotten. The mock shows
 * "385.000đ · size S–XL", and neither field exists anywhere in this system:
 *  - price: `sync-catalog` deliberately does not persist the four price columns
 *    (`core/domain/product.ts` — `ProductOperational.prices` is typed but never
 *    filled), so `ComposeResponse` has no field to read and no API to ask;
 *  - size: tab "Mẫu 2026" has no size column at all (`SHEET_COLUMNS`).
 * Inventing either would be a number an operator could quote to a customer.
 * What is needed to close the gap is written up in the handover, not faked here.
 *
 * Stock IS shown: this whole screen is the internal operator area, and business
 * rule 2 forbids stock in a CAPTION or a post preview, never on the tool. It
 * sits outside the caption block, exactly like the template draws it.
 *
 * Since onboarding phase 3 the line also carries PROVENANCE: a post whose
 * product text was typed by hand is marked as such, from `productOrigin` on the
 * server's own answer. Without it, "bài này lấy dữ liệu từ đâu" has no answer a
 * month later — and a typed product looks exactly like a synced one.
 */
export function ResolvedProductLine({
  id,
  composed,
  albumCount,
  onChangeProduct,
}: {
  /** The field's `aria-describedby` target: this line IS its description now. */
  id: string;
  composed: ComposeResponse;
  albumCount: number;
  onChangeProduct: () => void;
}) {
  const { content, inventory } = composed;
  const isVideo = Boolean(composed.video);

  const facts: string[] = [];
  const description = (content.description ?? "").trim();
  if (description.length > 0) facts.push(shorten(description, 64));
  const category = (content.category ?? "").trim();
  if (category.length > 0) facts.push(category);
  facts.push(isVideo ? "1 clip" : `${albumCount} ảnh`);
  facts.push(describeStock(inventory));

  return (
    <div
      id={id}
      className="text-muted-foreground flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-sm"
    >
      <span
        aria-hidden="true"
        className="bg-success/15 text-success-foreground flex size-6 shrink-0 items-center justify-center rounded-full"
      >
        <Check className="size-3.5" strokeWidth={2.5} aria-hidden="true" />
      </span>
      <span className="text-foreground text-sm font-semibold">{content.name}</span>
      <span className="font-mono text-xs">{content.code}</span>

      {composed.productOrigin === "manual" ? (
        <Token
          size="sm"
          color="orange"
          label={MANUAL_PRODUCT_BADGE}
          description="Thông tin sản phẩm của bài này do người vận hành nhập tay, không lấy từ dữ liệu đã đồng bộ."
        />
      ) : null}

      {facts.map((fact) => (
        <span key={fact} className="flex items-center gap-2.5">
          <span aria-hidden="true">·</span>
          {fact}
        </span>
      ))}

      <span className="flex-1" />

      <button
        type="button"
        onClick={onChangeProduct}
        className="text-accent-foreground focus-visible:ring-ring inline-flex min-h-10 cursor-pointer items-center rounded-lg px-2 text-sm font-medium transition-colors duration-150 outline-none hover:underline focus-visible:ring-2"
      >
        Đổi sản phẩm
      </button>
    </div>
  );
}

/**
 * Stock in words. Three answers, none of which may be confused with another:
 *  - "không kiểm tồn" — the tenant turned the gate off, so `status` is
 *    `"in_stock"` for every code and the NUMBER means nothing here. Read from
 *    the flag through `stockLabel`, never from `status` (the red banner above
 *    this line carries the reason);
 *  - "chưa có số tồn" — an empty or non-numeric Sheet cell. Not a zero;
 *  - "tồn N" — a real count.
 */
function describeStock(inventory: ComposeResponse["inventory"]): string {
  if (!inventory) return "chưa đọc được tồn";
  if (stockLabel(inventory).isSkipped) return "không kiểm tồn";
  if (inventory.stock === null) return "chưa có số tồn";
  return `tồn ${inventory.stock}`;
}

/** Keeps the row on one line for a long Sheet description. */
function shorten(value: string, max: number): string {
  const flat = value.replace(/\s+/g, " ").trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1)}…`;
}
