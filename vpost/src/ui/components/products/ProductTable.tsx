"use client";

import {
  Button,
  HStack,
  Stack,
  StatusDot,
  Table,
  Text,
  Tooltip,
  pixel,
  proportional,
  useMediaQuery,
} from "@astryxdesign/core";
import type { TableColumn } from "@astryxdesign/core";

import { stockCellText } from "@/ui/components/inventory/stock-check";
import { productStatus } from "@/ui/components/products/product-status";
import { formatMediaCounts, type CatalogProduct } from "@/ui/schemas/catalog.schema";

/**
 * The catalog as the operator sees it: which codes can be posted, core product
 * attributes for quick fact-checking (giá bán, size, màu, chất liệu), and for
 * blocked rows, why not (business rule 5 — nothing is silently skipped).
 *
 * `composable` is decided by the SERVER. The UI never re-derives it from stock +
 * photo counts: the day the rule changes (a video-only code, a new block), a
 * client-side guess would offer a "Soạn bài" button that dies on the next screen
 * with the real reason.
 *
 * Business rule 2: stock and block reasons are INTERNAL. They live in this table
 * and in the inspector — never inside a caption.
 */

/** Table's generic needs an index signature; the fields stay CatalogProduct's. */
type ProductRow = CatalogProduct & Record<string, unknown>;

function TruncatedCell({
  value,
  emptyLabel = "—",
  color = "primary",
  alignEnd = false,
  tabular = false,
}: {
  value: string | null | undefined;
  emptyLabel?: string;
  color?: "primary" | "secondary";
  alignEnd?: boolean;
  tabular?: boolean;
}) {
  const trimmed = value?.trim() ?? "";
  if (trimmed.length === 0) {
    return (
      <span className={alignEnd ? "block w-full text-right" : "block w-full"}>
        <Text color="placeholder">{emptyLabel}</Text>
      </span>
    );
  }

  return (
    <Tooltip content={trimmed} focusTrigger="always" placement="above" hasHoverIndication={false}>
      <span
        tabIndex={0}
        title={trimmed}
        aria-label={trimmed}
        className={
          alignEnd
            ? "block w-full truncate rounded-xs text-right focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            : "block w-full truncate rounded-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        }
      >
        <Text color={color} hasTabularNumbers={tabular}>
          {trimmed}
        </Text>
      </span>
    </Tooltip>
  );
}

export function ProductTable({
  items,
  selectedCode,
  onSelect,
}: {
  items: readonly CatalogProduct[];
  selectedCode: string | null;
  onSelect: (code: string) => void;
}) {
  const isNarrow = useMediaQuery("(max-width: 1024px)");

  const columns: TableColumn<ProductRow>[] = [
    {
      key: "code",
      header: "Mã SP",
      width: pixel(isNarrow ? 164 : 184),
      renderCell: (product) => {
        const status = productStatus(product);
        const isSelected = selectedCode === product.code;
        return (
          <HStack gap={2} align="center">
            {/* The dot's colour is decoded by ProductStatusLegend above the
                table — words that are always on screen, not only on hover
                (Named Status Rule). The label/tooltip here name THIS row's own
                reason ("Hết hàng", "Thiếu ảnh"), which the legend cannot. */}
            <StatusDot variant={status.variant} label={status.label} tooltip={status.label} />
            {/* The code is the row's interactive element: one tab stop per row,
                and a real button rather than a click handler on the <tr>.
                The filled variant marks the row the inspector is showing —
                aria-pressed alone would leave sighted users guessing. */}
            <Button
              variant={isSelected ? "secondary" : "ghost"}
              size={isNarrow ? "md" : "sm"}
              label={product.code}
              aria-pressed={isSelected}
              onClick={() => onSelect(product.code)}
            />
          </HStack>
        );
      },
    },
    {
      key: "name",
      header: "Tên sản phẩm",
      width: proportional(2),
      renderCell: (product) => (
        <TruncatedCell value={product.name} emptyLabel="(trống trên Sheet)" color="primary" />
      ),
    },
    {
      key: "category",
      header: "Chủng loại",
      width: proportional(1),
      renderCell: (product) => <TruncatedCell value={product.category} color="secondary" />,
    },
    {
      key: "price",
      header: "Giá bán",
      width: pixel(128),
      align: "end",
      renderCell: (product) => (
        <TruncatedCell value={product.price} color="primary" alignEnd tabular />
      ),
    },
    {
      key: "sizes",
      header: "Size",
      width: pixel(120),
      renderCell: (product) => <TruncatedCell value={product.sizes} color="secondary" />,
    },
    {
      key: "colors",
      header: "Màu",
      width: pixel(148),
      renderCell: (product) => <TruncatedCell value={product.colors} color="secondary" />,
    },
    {
      key: "material",
      header: "Chất liệu",
      width: pixel(160),
      renderCell: (product) => <TruncatedCell value={product.material} color="secondary" />,
    },
    {
      key: "stock",
      header: "Tồn kho",
      width: pixel(120),
      align: "end",
      /*
       * `stockCellText` reads `stockCheckSkipped` FIRST. A tenant with the stock
       * gate off still gets `status: "in_stock"` and a number from the Sheet, and
       * a bare "62" in this column would be read as a count somebody made.
       *
       * The cell carries the WORD, not the alarm: with the gate off every row
       * says the same thing, and a red pill repeated down 300 rows stops being
       * read (Badge §"Don't repeat the same badge in every row"). The red banner
       * above the table is where the warning lives, once, with the reason.
       */
      renderCell: (product) =>
        product.inventory.stockCheckSkipped ? (
          <Text hasTabularNumbers>{stockCellText(product.inventory)}</Text>
        ) : product.inventory.stock === null ? (
          <Text color="placeholder">—</Text>
        ) : (
          <Text hasTabularNumbers>{stockCellText(product.inventory)}</Text>
        ),
    },
    {
      key: "media",
      header: "Ảnh / video",
      width: pixel(140),
      renderCell: (product) => (
        <Text color="secondary" hasTabularNumbers>
          {formatMediaCounts(product.mediaImageCount, product.mediaVideoCount)}
        </Text>
      ),
    },
  ];

  return (
    <Stack direction="vertical" isScrollable height="100%" className="min-w-0 max-w-full scroll-cue-x">
      <Table
        data={items as ProductRow[]}
        columns={columns}
        idKey="code"
        density="compact"
        hasHover
        textOverflow="truncate"
        rowCount={items.length}
      />
    </Stack>
  );
}
