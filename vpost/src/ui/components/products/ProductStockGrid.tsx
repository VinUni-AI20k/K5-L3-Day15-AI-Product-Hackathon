"use client";

import { Text } from "@astryxdesign/core";

import { buildStockMatrix } from "@/ui/components/products/product-detail-helpers";
import { formatCount } from "@/ui/schemas/catalog.schema";
import type { ProductStockGrid as ProductStockGridData } from "@/ui/schemas/product-detail.schema";

/**
 * Colour × size inventory grid inside the product inspector.
 *
 * Uses a real HTML `<table>` with `scope="col"` and `scope="row"` headers so
 * screen readers announce each cell's colour and size. Out-of-stock cells stay
 * muted with an explicit "Hết" label, and the table scrolls horizontally inside
 * its own container so narrow (390px) viewports never scroll the page sideways.
 */
export function ProductStockGrid({
  code,
  stock,
}: {
  code: string;
  stock: ProductStockGridData;
}) {
  const matrix = buildStockMatrix(stock);

  if (matrix.isEmpty) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <Text type="supporting" color="secondary">
          Chưa có dữ liệu tồn kho theo màu và size cho mã này.
        </Text>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 max-w-full flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>
          Tổng tồn:{" "}
          <strong className="font-semibold text-foreground tabular-nums">
            {matrix.grandTotal !== null ? formatCount(matrix.grandTotal) : "—"}
          </strong>
        </span>
        {stock.inStockColors.length > 0 ? (
          <span>
            Màu còn:{" "}
            <span className="font-medium text-foreground">{stock.inStockColors.join(", ")}</span>
          </span>
        ) : null}
        {stock.inStockSizes.length > 0 ? (
          <span>
            Size còn:{" "}
            <span className="font-medium text-foreground">{stock.inStockSizes.join(", ")}</span>
          </span>
        ) : null}
      </div>

      <div
        tabIndex={0}
        role="region"
        aria-label={`Bảng tồn kho theo màu và size của mã ${code}`}
        className="w-full max-w-full overflow-x-auto rounded-lg border border-border bg-card scroll-cue-x focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">
            Tồn kho theo màu và size của sản phẩm {code}
          </caption>
          <thead>
            <tr className="border-b border-border bg-sidebar">
              <th
                scope="col"
                className="sticky left-0 z-10 border-r border-border bg-sidebar px-3 py-2 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap"
              >
                Màu / Size
              </th>
              {matrix.sizes.map((size) => (
                <th
                  key={size}
                  scope="col"
                  className="px-3 py-2 text-right text-xs font-semibold text-muted-foreground whitespace-nowrap"
                >
                  {size}
                </th>
              ))}
              <th
                scope="col"
                className="border-l border-border px-3 py-2 text-right text-xs font-semibold text-foreground whitespace-nowrap"
              >
                Tổng
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-border">
            {matrix.rows.map((row) => (
              <tr key={row.color} className="transition-colors duration-150 ease-out hover:bg-sidebar/50 motion-reduce:transition-none">
                <th
                  scope="row"
                  className="sticky left-0 z-10 border-r border-border bg-card px-3 py-2 text-left text-sm font-medium text-foreground whitespace-nowrap"
                >
                  {row.color}
                </th>
                {row.cells.map((cell) => {
                  const isOut = !cell.inStock;
                  const noteTitle =
                    cell.status && cell.status.toLowerCase() !== "hết"
                      ? `${cell.color} · ${cell.size}: ${cell.status}`
                      : undefined;
                  return (
                    <td
                      key={`${row.color}:${cell.size}`}
                      title={noteTitle}
                      className={
                        isOut
                          ? "bg-muted/60 px-3 py-2 text-right text-xs font-medium text-muted-foreground whitespace-nowrap"
                          : "px-3 py-2 text-right text-sm font-medium text-foreground tabular-nums whitespace-nowrap"
                      }
                    >
                      {cell.displayText}
                    </td>
                  );
                })}
                <td className="border-l border-border px-3 py-2 text-right text-sm font-semibold text-foreground tabular-nums whitespace-nowrap">
                  {row.total !== null ? formatCount(row.total) : "—"}
                </td>
              </tr>
            ))}
          </tbody>

          <tfoot>
            <tr className="border-t border-border bg-sidebar">
              <th
                scope="row"
                className="sticky left-0 z-10 border-r border-border bg-sidebar px-3 py-2 text-left text-xs font-semibold text-foreground whitespace-nowrap"
              >
                Tổng
              </th>
              {matrix.colTotals.map((colTotal, idx) => (
                <td
                  key={matrix.sizes[idx] ?? idx}
                  className="px-3 py-2 text-right text-sm font-semibold text-foreground tabular-nums whitespace-nowrap"
                >
                  {colTotal !== null ? formatCount(colTotal) : "—"}
                </td>
              ))}
              <td className="border-l border-border px-3 py-2 text-right text-sm font-semibold text-foreground tabular-nums whitespace-nowrap">
                {matrix.grandTotal !== null ? formatCount(matrix.grandTotal) : "—"}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
