"use client";

import {
  Banner,
  Button,
  Divider,
  EmptyState,
  Heading,
  MetadataList,
  MetadataListItem,
  Spinner,
  Stack,
  StatusDot,
  Text,
} from "@astryxdesign/core";
import { PackageSearch, SearchX } from "lucide-react";
import { useRouter } from "next/navigation";

import { ApiErrorNotice } from "@/ui/components/feedback/ApiErrorNotice";
import { StockCheckSkippedBanner } from "@/ui/components/inventory/StockCheckSkippedBanner";
import { stockLabel } from "@/ui/components/inventory/stock-check";
import {
  ProductDetailSections,
  ProductDetailSkeleton,
} from "@/ui/components/products/ProductDetailSections";
import type {
  ProductCopyFeedback,
  ProductDetailViewState,
} from "@/ui/components/products/product-detail-helpers";
import type {
  InspectorRecoveryAction,
  ProductInspectorState,
} from "@/ui/components/products/product-inspector-state";
import { productStatus, type ProductStatusView } from "@/ui/components/products/product-status";
import {
  blockedReasonLabel,
  formatCount,
  formatMediaCounts,
  type CatalogProduct,
} from "@/ui/schemas/catalog.schema";
import type { ProductDetail } from "@/ui/schemas/product-detail.schema";

/**
 * Detail panel for the selected product. Shows all product fields, the colour ×
 * size stock grid, original photo thumbnails, AI allowed facts (F-ids), warnings
 * and blocking reasons so operators can compare AI output with source data.
 *
 * The same body renders in two frames: the LayoutPanel above 1024px, and the
 * modal drawer below it (ProductInspectorDrawer) — one component, so "Soạn bài"
 * and every fact-checking section stay identical across viewports.
 *
 * Business rule 2: stock and block reasons are INTERNAL — this panel is where
 * an operator reads them, and they never travel into a caption.
 */

/** The sentence the block banner shows when only the list row is present. */
function blockedBannerText(product: CatalogProduct): string {
  return (
    product.blockedReason?.userMessage ??
    "Mã này chưa đăng được. Mở màn Đồng bộ dữ liệu để xem chi tiết."
  );
}

function detailStatusView(
  detail: ProductDetail,
  listProduct: CatalogProduct | null,
): ProductStatusView {
  if (!detail.composable) {
    const firstBlocking = detail.blocking[0];
    return {
      variant: "error",
      label: firstBlocking
        ? blockedReasonLabel(firstBlocking.code)
        : listProduct?.blockedReason
          ? blockedReasonLabel(listProduct.blockedReason.code)
          : "Không đăng được",
    };
  }
  if (listProduct) return productStatus(listProduct);
  return { variant: "success", label: "Đăng được" };
}

export function ProductInspector({
  state,
  /**
   * Result of `GET /api/catalog/products/{code}`. Optional so callers/tests that
   * only pass list-level `state` keep the exact summary layout without needing a
   * QueryClient.
   */
  detail,
  /**
   * 2 in the panel, where this body is the first heading under the page title.
   * 3 in the drawer, where DialogHeader's title already took h2 — two peer
   * headings would tell a screen-reader user the box holds two sections.
   */
  headingLevel = 2,
  /** The button offered when the selected code is not on screen. */
  recovery = null,
  /**
   * Astryx's own rule: "start" for short values, "top" for long ones. In the
   * panel the labels sit beside the values; in a drawer on a split-screen phone
   * labels stack above values.
   */
  labelPosition = "start",
  /** Optional initial copy feedback (used by tests to inspect the polite live region). */
  initialCopyFeedback,
}: {
  state: ProductInspectorState;
  detail?: ProductDetailViewState;
  headingLevel?: 2 | 3;
  recovery?: InspectorRecoveryAction | null;
  labelPosition?: "start" | "top";
  initialCopyFeedback?: ProductCopyFeedback;
}) {
  const router = useRouter();
  const sectionHeadingLevel: 3 | 4 = headingLevel === 2 ? 3 : 4;
  const listProduct = state.kind === "product" ? state.product : null;

  // --- Nothing asked for ---------------------------------------------------
  if (state.kind === "none" && (!detail || detail.kind === "idle")) {
    return (
      <Stack direction="vertical" padding={5} height="100%" justify="center">
        <EmptyState
          isCompact
          headingLevel={headingLevel}
          icon={
            <span
              aria-hidden="true"
              className="bg-accent text-accent-foreground flex size-11 items-center justify-center rounded-xl"
            >
              <PackageSearch className="size-5" aria-hidden="true" />
            </span>
          }
          title="Chưa chọn sản phẩm nào"
          description="Bấm vào mã sản phẩm trong bảng để xem tồn kho, ảnh và lý do bị chặn."
        />
      </Stack>
    );
  }

  // --- 404 PRODUCT_NOT_FOUND from detail endpoint --------------------------
  if (detail?.kind === "not_found") {
    return (
      <Stack direction="vertical" padding={5} className="min-w-0 max-w-full">
        <EmptyState
          isCompact
          headingLevel={headingLevel}
          icon={
            <span
              aria-hidden="true"
              className="bg-accent text-accent-foreground flex size-11 items-center justify-center rounded-xl"
            >
              <SearchX className="size-5" aria-hidden="true" />
            </span>
          }
          title={`Không tìm thấy mã ${detail.code}`}
          description={
            detail.message?.trim() ||
            "Mã sản phẩm này không tồn tại trong danh mục hiện tại. Kiểm tra lại mã hoặc chạy đồng bộ dữ liệu."
          }
        />
      </Stack>
    );
  }

  // --- Full product detail loaded ------------------------------------------
  if (detail?.kind === "ready") {
    const product = detail.detail;
    const status = detailStatusView(product, listProduct);

    return (
      <Stack direction="vertical" gap={4} padding={5} className="min-w-0 max-w-full">
        <Stack direction="vertical" gap={1.5} className="min-w-0">
          <Stack direction="horizontal" gap={2} align="center">
            <StatusDot variant={status.variant} label={status.label} />
            <Heading level={headingLevel}>{product.code}</Heading>
          </Stack>
          <Text type="supporting">
            {product.name.trim().length > 0 ? product.name : "(tên trống trên Sheet)"}
          </Text>
          {product.composable ? (
            <div className="pt-1">
              <Button
                variant="primary"
                label="Soạn bài"
                onClick={() => router.push(`/compose?code=${encodeURIComponent(product.code)}`)}
              />
            </div>
          ) : null}
        </Stack>

        <Divider />

        <ProductDetailSections
          detail={product}
          sectionHeadingLevel={sectionHeadingLevel}
          listProduct={listProduct}
          initialCopyFeedback={initialCopyFeedback}
        />
      </Stack>
    );
  }

  // --- Detail loading ------------------------------------------------------
  if (detail?.kind === "loading") {
    if (listProduct) {
      const status = productStatus(listProduct);
      return (
        <Stack direction="vertical" gap={4} padding={5} className="min-w-0 max-w-full">
          <Stack direction="vertical" gap={1}>
            <Stack direction="horizontal" gap={2} align="center">
              <StatusDot variant={status.variant} label={status.label} />
              <Heading level={headingLevel}>{listProduct.code}</Heading>
            </Stack>
            <Text type="supporting">
              {listProduct.name.trim().length > 0 ? listProduct.name : "(tên trống trên Sheet)"}
            </Text>
          </Stack>

          <Divider />

          <ProductDetailSkeleton code={listProduct.code} />
        </Stack>
      );
    }

    return (
      <Stack direction="vertical" gap={4} padding={5} className="min-w-0 max-w-full">
        <Spinner size="sm" label={`Đang mở mã ${detail.code}…`} />
        <ProductDetailSkeleton code={detail.code} />
      </Stack>
    );
  }

  // --- Detail error (5xx / network / non-404 4xx) --------------------------
  if (detail?.kind === "error") {
    const headerStatus = listProduct ? productStatus(listProduct) : null;
    return (
      <Stack direction="vertical" gap={4} padding={5} className="min-w-0 max-w-full">
        <Stack direction="vertical" gap={1}>
          <Stack direction="horizontal" gap={2} align="center">
            {headerStatus ? (
              <StatusDot variant={headerStatus.variant} label={headerStatus.label} />
            ) : null}
            <Heading level={headingLevel}>{listProduct?.code ?? detail.code}</Heading>
          </Stack>
          {listProduct ? (
            <Text type="supporting">
              {listProduct.name.trim().length > 0 ? listProduct.name : "(tên trống trên Sheet)"}
            </Text>
          ) : null}
        </Stack>

        <Divider />

        <ApiErrorNotice
          error={detail.error}
          onRetry={detail.onRetry}
          shouldFocus={false}
        />
      </Stack>
    );
  }

  // --- Fallback list-only states (when `detail` prop is omitted) -----------

  if (state.kind === "loading") {
    return (
      <Stack direction="vertical" gap={2} padding={5} align="start" role="status">
        <Spinner size="sm" label={`Đang mở mã ${state.code}…`} />
      </Stack>
    );
  }

  if (state.kind === "missing") {
    return (
      <Stack direction="vertical" padding={5}>
        <EmptyState
          isCompact
          headingLevel={headingLevel}
          icon={
            <span
              aria-hidden="true"
              className="bg-accent text-accent-foreground flex size-11 items-center justify-center rounded-xl"
            >
              <SearchX className="size-5" aria-hidden="true" />
            </span>
          }
          title={`Không thấy mã ${state.code} trong danh sách`}
          description={
            recovery === null
              ? "Danh sách đã tải hết và không có mã này. Kiểm tra lại mã, hoặc chạy đồng bộ nếu Sheet vừa thêm mã mới."
              : recovery.kind === "clear-filter"
                ? "Bộ lọc đang bật có thể đang loại mã này ra khỏi danh sách."
                : "Danh sách mới tải một phần — mã này có thể nằm ở những trang chưa tải."
          }
          actions={
            recovery ? (
              <Button
                variant="secondary"
                label={recovery.label}
                isLoading={recovery.isBusy}
                onClick={recovery.onPress}
              />
            ) : undefined
          }
        />
      </Stack>
    );
  }

  if (state.kind === "none") return null;

  const { product } = state;
  const status = productStatus(product);
  const { inventory } = product;
  const stock = stockLabel(inventory);

  const blockedMessage = product.composable ? null : blockedBannerText(product);
  const showOperatorNote =
    inventory.operatorMessage !== null && inventory.operatorMessage !== blockedMessage;

  return (
    <Stack direction="vertical" gap={4} padding={5} className="min-w-0 max-w-full">
      <Stack direction="vertical" gap={1}>
        <Stack direction="horizontal" gap={2} align="center">
          <StatusDot variant={status.variant} label={status.label} />
          <Heading level={headingLevel}>{product.code}</Heading>
        </Stack>
        <Text type="supporting">
          {product.name.trim().length > 0 ? product.name : "(tên trống trên Sheet)"}
        </Text>
      </Stack>

      <Divider />

      <MetadataList
        label={labelPosition === "top" ? { position: "top" } : { position: "start", width: 120 }}
      >
        <MetadataListItem label="Chủng loại">{product.category ?? "—"}</MetadataListItem>
        <MetadataListItem label="Mùa vụ">{product.season ?? "—"}</MetadataListItem>
        <MetadataListItem label="Tồn kho">
          {stock.label}
          {inventory.stock !== null ? ` · ${formatCount(inventory.stock)}` : ""}
        </MetadataListItem>
        <MetadataListItem label="Ảnh / video">
          {formatMediaCounts(product.mediaImageCount, product.mediaVideoCount)}
        </MetadataListItem>
      </MetadataList>

      {stock.isSkipped ? (
        <StockCheckSkippedBanner reason={inventory.stockCheckSkippedReason} />
      ) : null}

      {inventory.stock === null ? (
        <Text type="supporting" color="secondary">
          Ô tồn trên Sheet đang trống hoặc không phải số — không phải bằng 0.
        </Text>
      ) : null}

      {showOperatorNote ? (
        <Text type="supporting" color="secondary">
          {inventory.operatorMessage}
        </Text>
      ) : null}

      {product.hasConflict ? (
        <Banner
          status="warning"
          title="Sheet có nhiều dòng cho mã này"
          description="Kiểm tra lại trên Sheet trước khi đăng — hai dòng đang mang giá trị khác nhau."
        />
      ) : null}

      {product.composable ? (
        <Button
          variant="primary"
          label="Soạn bài"
          onClick={() => router.push(`/compose?code=${encodeURIComponent(product.code)}`)}
        />
      ) : (
        <Banner status="error" title={status.label} description={blockedBannerText(product)} />
      )}
    </Stack>
  );
}
