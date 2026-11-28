"use client";

import { Banner, Heading, IconButton, Skeleton, Stack, Text } from "@astryxdesign/core";
import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";

import { StockCheckSkippedBanner } from "@/ui/components/inventory/StockCheckSkippedBanner";
import {
  IDLE_COPY_FEEDBACK,
  aiFactFieldLabel,
  buildProductInfoFields,
  copyProductFieldValue,
  type ProductCopyFeedback,
} from "@/ui/components/products/product-detail-helpers";
import { ProductImagesGrid } from "@/ui/components/products/ProductImagesGrid";
import { ProductStockGrid } from "@/ui/components/products/ProductStockGrid";
import {
  blockedReasonLabel,
  formatCount,
  type CatalogProduct,
} from "@/ui/schemas/catalog.schema";
import type { ProductDetail } from "@/ui/schemas/product-detail.schema";

const COPY_FEEDBACK_RESET_MS = 2_500;

/**
 * Loading skeleton matching the detail inspector sections so switching codes
 * never jumps violently once the detail payload arrives.
 */
export function ProductDetailSkeleton({ code }: { code: string }) {
  return (
    <Stack direction="vertical" gap={5} className="min-w-0 max-w-full">
      <Text type="supporting" role="status" aria-live="polite">
        Đang tải chi tiết mã {code}…
      </Text>

      <div aria-hidden="true" className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <Skeleton width={96} height={18} />
          <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3">
            <Skeleton width="100%" height={20} index={0} />
            <Skeleton width="85%" height={20} index={1} />
            <Skeleton width="70%" height={20} index={2} />
            <Skeleton width="90%" height={20} index={3} />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Skeleton width={88} height={18} />
          <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3">
            <Skeleton width="100%" height={24} index={0} />
            <Skeleton width="100%" height={24} index={1} />
            <Skeleton width="100%" height={24} index={2} />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Skeleton width={64} height={18} />
          <div className="grid grid-cols-3 gap-2">
            <Skeleton width="100%" height={80} index={0} />
            <Skeleton width="100%" height={80} index={1} />
            <Skeleton width="100%" height={80} index={2} />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Skeleton width={160} height={18} />
          <Skeleton width="100%" height={40} index={0} />
          <Skeleton width="100%" height={40} index={1} />
        </div>
      </div>
    </Stack>
  );
}

/**
 * Full inspector sections for fact-checking AI output against product data:
 * Lỗi chặn, Cảnh báo, Thông tin (with copy buttons + polite "Đã sao chép"),
 * Tồn kho (colour × size grid), Ảnh (thumbnails linking to originals), and
 * Dữ kiện AI được dùng (F-id list).
 */
export function ProductDetailSections({
  detail,
  sectionHeadingLevel,
  listProduct,
  initialCopyFeedback = IDLE_COPY_FEEDBACK,
}: {
  detail: ProductDetail;
  sectionHeadingLevel: 3 | 4;
  listProduct?: CatalogProduct | null;
  initialCopyFeedback?: ProductCopyFeedback;
}) {
  const [copyFeedback, setCopyFeedback] = useState<ProductCopyFeedback>(initialCopyFeedback);
  const [renderedCode, setRenderedCode] = useState(detail.code);

  // Reset copy feedback whenever the operator selects a different product.
  if (renderedCode !== detail.code) {
    setRenderedCode(detail.code);
    setCopyFeedback(IDLE_COPY_FEEDBACK);
  }

  useEffect(() => {
    if (copyFeedback.status === "idle") return;
    const timer = setTimeout(() => setCopyFeedback(IDLE_COPY_FEEDBACK), COPY_FEEDBACK_RESET_MS);
    return () => clearTimeout(timer);
  }, [copyFeedback]);

  async function handleCopy(fieldKey: string, label: string, value: string) {
    const feedback = await copyProductFieldValue(fieldKey, label, value);
    setCopyFeedback(feedback);
  }

  const infoFields = buildProductInfoFields(detail);
  const hasBlocking = detail.blocking.length > 0 || !detail.composable;
  const hasWarnings = detail.warnings.length > 0 || Boolean(listProduct?.hasConflict);

  return (
    <Stack direction="vertical" gap={6} className="min-w-0 max-w-full">
      {/* Polite live region for every copy button in this panel. Always mounted
          so screen readers hear the transition to "Đã sao chép …". */}
      <span role="status" aria-live="polite" className="sr-only">
        {copyFeedback.announcement}
      </span>

      {/* --- Lỗi chặn ----------------------------------------------------- */}
      {hasBlocking ? (
        <section aria-labelledby={`product-blocking-${detail.code}`} className="flex min-w-0 flex-col gap-2.5">
          <Heading level={sectionHeadingLevel} id={`product-blocking-${detail.code}`}>
            Lỗi chặn
          </Heading>
          {detail.blocking.length > 0 ? (
            <Stack direction="vertical" gap={2}>
              {detail.blocking.map((item, idx) => (
                <Banner
                  key={`${item.code}:${idx}`}
                  status="error"
                  title={blockedReasonLabel(item.code)}
                  description={item.message}
                />
              ))}
            </Stack>
          ) : (
            <Banner
              status="error"
              title={
                listProduct?.blockedReason
                  ? blockedReasonLabel(listProduct.blockedReason.code)
                  : "Không đăng được"
              }
              description={
                listProduct?.blockedReason?.userMessage ??
                "Mã này chưa đăng được. Kiểm tra lại dữ liệu sản phẩm và tồn kho."
              }
            />
          )}
        </section>
      ) : null}

      {/* --- Cảnh báo ----------------------------------------------------- */}
      {hasWarnings ? (
        <section aria-labelledby={`product-warnings-${detail.code}`} className="flex min-w-0 flex-col gap-2.5">
          <Heading level={sectionHeadingLevel} id={`product-warnings-${detail.code}`}>
            Cảnh báo
          </Heading>
          <Stack direction="vertical" gap={2}>
            {listProduct?.hasConflict ? (
              <Banner
                status="warning"
                title="Sheet có nhiều dòng cho mã này"
                description="Kiểm tra lại trên Sheet trước khi đăng — hai dòng đang mang giá trị khác nhau."
              />
            ) : null}
            {detail.warnings.map((warning, idx) => (
              <Banner key={`${warning}:${idx}`} status="warning" title={warning} />
            ))}
          </Stack>
        </section>
      ) : null}

      {/* --- Thông tin ---------------------------------------------------- */}
      <section aria-labelledby={`product-info-${detail.code}`} className="flex min-w-0 flex-col gap-2.5">
        <div className="flex items-center justify-between gap-2">
          <Heading level={sectionHeadingLevel} id={`product-info-${detail.code}`}>
            Thông tin
          </Heading>
          {copyFeedback.status === "copied" ? (
            <span className="text-xs font-medium text-accent-foreground">Đã sao chép</span>
          ) : null}
        </div>

        {copyFeedback.status === "failed" ? (
          <Banner
            role="status"
            status="warning"
            title="Không thể sao chép tự động"
            description={copyFeedback.announcement}
          />
        ) : null}

        <dl className="min-w-0 divide-y divide-border rounded-lg border border-border bg-card">
          {infoFields.map((field) => {
            const copyTarget = (field.copyValue ?? field.value ?? "").trim();
            const isCopied =
              copyFeedback.status === "copied" && copyFeedback.fieldKey === field.key;

            return (
              <div key={field.key} className="flex min-w-0 items-start justify-between gap-2 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <dt className="text-xs font-medium text-muted-foreground">{field.label}</dt>
                  {field.value !== null ? (
                    <dd
                      className={
                        field.multiline
                          ? "mt-0.5 text-sm leading-relaxed text-foreground whitespace-pre-wrap break-words"
                          : field.numeric
                            ? "mt-0.5 text-sm font-medium text-foreground tabular-nums break-words"
                            : "mt-0.5 text-sm text-foreground break-words"
                      }
                    >
                      {field.value}
                    </dd>
                  ) : (
                    <dd className="mt-0.5 text-sm text-foreground-subtle">—</dd>
                  )}
                </div>

                {copyTarget.length > 0 ? (
                  <IconButton
                    variant="ghost"
                    size="sm"
                    icon={
                      isCopied ? (
                        <Check className="size-4" aria-hidden="true" />
                      ) : (
                        <Copy className="size-4" aria-hidden="true" />
                      )
                    }
                    label={
                      isCopied
                        ? `Đã sao chép ${field.label}`
                        : `Sao chép ${field.label}`
                    }
                    tooltip={isCopied ? "Đã sao chép" : `Sao chép ${field.label}`}
                    onClick={() => void handleCopy(field.key, field.label, copyTarget)}
                  />
                ) : null}
              </div>
            );
          })}
        </dl>
      </section>

      {/* --- Tồn kho ------------------------------------------------------ */}
      <section aria-labelledby={`product-stock-${detail.code}`} className="flex min-w-0 flex-col gap-2.5">
        <Heading level={sectionHeadingLevel} id={`product-stock-${detail.code}`}>
          Tồn kho
        </Heading>

        {listProduct?.inventory.stockCheckSkipped ? (
          <StockCheckSkippedBanner reason={listProduct.inventory.stockCheckSkippedReason} />
        ) : null}

        <ProductStockGrid code={detail.code} stock={detail.stock} />
      </section>

      {/* --- Ảnh ---------------------------------------------------------- */}
      <section aria-labelledby={`product-images-${detail.code}`} className="flex min-w-0 flex-col gap-2.5">
        <div className="flex items-baseline justify-between gap-2">
          <Heading level={sectionHeadingLevel} id={`product-images-${detail.code}`}>
            Ảnh
          </Heading>
          {detail.images.length > 0 ? (
            <span className="text-xs text-muted-foreground tabular-nums">
              {formatCount(detail.images.length)} ảnh
            </span>
          ) : null}
        </div>
        <ProductImagesGrid code={detail.code} images={detail.images} />
      </section>

      {/* --- Dữ kiện AI được dùng ---------------------------------------- */}
      <section aria-labelledby={`product-ai-facts-${detail.code}`} className="flex min-w-0 flex-col gap-2.5">
        <Heading level={sectionHeadingLevel} id={`product-ai-facts-${detail.code}`}>
          Dữ kiện AI được dùng
        </Heading>
        <Text type="supporting" color="secondary">
          AI chỉ được phép dùng các dữ kiện dưới đây khi viết bài — mọi chi tiết ngoài danh sách này là AI tự suy diễn.
        </Text>

        {detail.aiFacts.length === 0 ? (
          <div className="rounded-lg border border-border bg-card p-3">
            <Text type="supporting" color="secondary">
              Chưa có dữ kiện nào được phép gửi cho AI cho sản phẩm này.
            </Text>
          </div>
        ) : (
          <ol className="flex min-w-0 flex-col gap-2">
            {detail.aiFacts.map((fact) => {
              const fieldLabel = aiFactFieldLabel(fact.field);
              const factKey = `fact:${fact.id}`;
              const isCopied =
                copyFeedback.status === "copied" && copyFeedback.fieldKey === factKey;

              return (
                <li
                  key={`${fact.id}:${fact.field}`}
                  className="flex min-w-0 items-start justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex shrink-0 items-center rounded-full bg-accent px-2 py-0.5 font-mono text-xs font-semibold text-accent-foreground tabular-nums">
                        {fact.id}
                      </span>
                      {fieldLabel ? (
                        <span className="text-xs font-medium text-muted-foreground">
                          {fieldLabel}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-sm leading-relaxed text-foreground whitespace-pre-wrap break-words">
                      {fact.text}
                    </p>
                  </div>

                  {fact.text.trim().length > 0 ? (
                    <IconButton
                      variant="ghost"
                      size="sm"
                      icon={
                        isCopied ? (
                          <Check className="size-4" aria-hidden="true" />
                        ) : (
                          <Copy className="size-4" aria-hidden="true" />
                        )
                      }
                      label={
                        isCopied
                          ? `Đã sao chép dữ kiện ${fact.id}`
                          : `Sao chép dữ kiện ${fact.id}`
                      }
                      tooltip={isCopied ? "Đã sao chép" : `Sao chép ${fact.id}`}
                      onClick={() => void handleCopy(factKey, `dữ kiện ${fact.id}`, fact.text)}
                    />
                  ) : null}
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </Stack>
  );
}
