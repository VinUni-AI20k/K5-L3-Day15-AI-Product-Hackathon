"use client";

import { Dialog, DialogHeader, Layout, LayoutContent, useMediaQuery } from "@astryxdesign/core";

import type { ProductDetailViewState } from "@/ui/components/products/product-detail-helpers";
import type {
  InspectorRecoveryAction,
  ProductInspectorState,
} from "@/ui/components/products/product-inspector-state";
import { ProductInspector } from "@/ui/components/products/ProductInspector";

/**
 * The inspector below 1024px, where there is no room for a side panel beside
 * the rows.
 *
 * Uses Astryx Dialog `variant="fullscreen"` + `purpose="info"` for native focus
 * trapping, Escape dismissal, and a definite viewport box so the body scrolls
 * vertically while wide stock grids scroll horizontally inside their own box
 * without causing page-level sideways scroll.
 */
export function ProductInspectorDrawer({
  state,
  detail,
  isOpen,
  onClose,
  recovery,
}: {
  state: ProductInspectorState;
  detail?: ProductDetailViewState;
  isOpen: boolean;
  onClose: () => void;
  recovery: InspectorRecoveryAction | null;
}) {
  // Split-screen and folded phones get down here: below ~340px a label column
  // beside the value leaves too little room for the value. Hook first — the
  // early return below must not sit between renders with different hook counts.
  const stackLabels = useMediaQuery("(max-width: 340px)");

  // Rendering the body of a closed drawer would keep a second copy of the
  // inspector (and its router hook) alive behind the page for nothing.
  if (!isOpen) return null;

  const subtitle =
    detail?.kind === "ready"
      ? detail.detail.code
      : detail?.kind === "loading" || detail?.kind === "error" || detail?.kind === "not_found"
        ? detail.code
        : state.kind === "product"
          ? state.product.code
          : state.kind === "missing" || state.kind === "loading"
            ? state.code
            : undefined;

  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      purpose="info"
      variant="fullscreen"
    >
      <Layout
        height="fill"
        header={
          <DialogHeader
            title="Chi tiết sản phẩm"
            subtitle={subtitle}
            onOpenChange={(open) => {
              if (!open) onClose();
            }}
          />
        }
        content={
          <LayoutContent padding={0} isScrollable className="min-w-0 max-w-full overflow-x-hidden">
            {/* h2 belongs to DialogHeader's title; the product code under it is
                h3, or the drawer would announce two peer headings. */}
            <ProductInspector
              state={state}
              detail={detail}
              headingLevel={3}
              recovery={recovery}
              labelPosition={stackLabels ? "top" : "start"}
            />
          </LayoutContent>
        }
      />
    </Dialog>
  );
}
