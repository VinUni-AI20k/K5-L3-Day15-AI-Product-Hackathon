"use client";

import { Token } from "@astryxdesign/core";
import { Calendar, Check, Clock, Copy, Hash, Sparkles } from "lucide-react";

import { cn } from "@/shared/utils";
import { BatchStatusBadge } from "@/ui/components/post/PostStatusBadge";
import { copyStatusMessage, useCopyToClipboard } from "@/ui/hooks/useCopyToClipboard";
import { useActiveTenant } from "@/ui/hooks/useMe";
import {
  formatDateTime,
  formatDurationMs,
  type BatchStatusResponse,
} from "@/ui/schemas/post-batch.schema";
import { MANUAL_PRODUCT_BADGE } from "@/ui/schemas/product-origin.schema";

const TOTALS_FIELDS = [
  { key: "total", label: "Tổng số kênh", tone: "neutral" },
  { key: "published", label: "Đã đăng", tone: "success" },
  { key: "inProgress", label: "Đang chạy", tone: "accent" },
  { key: "scheduledOnFacebook", label: "FB giữ lịch", tone: "warning" },
  { key: "blocked", label: "Bị chặn", tone: "warning" },
  { key: "failed", label: "Lỗi", tone: "danger" },
] as const;

export function BatchSummaryCard({ batch }: { batch: BatchStatusResponse }) {
  const { tenantId } = useActiveTenant();
  const clipboard = useCopyToClipboard("batch", {
    tenant_id: tenantId,
    batch_id: batch.batchId,
  });

  return (
    <section
      aria-labelledby="batch-summary-heading"
      className="border-border bg-card flex flex-col gap-5 rounded-xl border p-5 sm:p-6"
    >
      {/* Header Info */}
      <div className="border-border flex flex-wrap items-start justify-between gap-4 border-b pb-4">
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 id="batch-summary-heading" className="text-foreground text-lg font-semibold">
              Tổng kết lô đăng
            </h2>
            <BatchStatusBadge status={batch.status} />
          </div>
          <p className="text-muted-foreground text-sm leading-relaxed">{batch.summaryMessage}</p>
        </div>

        {/* Product Identity Pill */}
        <div className="border-border bg-sidebar flex items-center gap-2.5 rounded-xl border px-3.5 py-2.5">
          <div className="flex flex-col gap-0.5">
            <span className="text-muted-foreground text-xs font-medium">Sản phẩm</span>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-foreground font-mono text-sm font-semibold">
                {batch.productCode}
              </span>
              {/* An empty colour is the batch that covers EVERY colour — saying
                  nothing makes it look like a single-colour batch, which is a
                  different job with a different scope. */}
              <span className="text-muted-foreground text-xs">
                · {batch.color.trim().length > 0 ? batch.color : "Tất cả màu"}
              </span>
            </div>
          </div>
          {batch.productOrigin === "manual" && (
            <Token
              size="sm"
              color="orange"
              label={MANUAL_PRODUCT_BADGE}
              description="Thông tin sản phẩm do người vận hành nhập tay."
            />
          )}
        </div>
      </div>

      {/* Stat Tape (6 connected cells) */}
      <div className="border-border bg-border grid grid-cols-2 gap-px overflow-hidden rounded-xl border sm:grid-cols-3 lg:grid-cols-6">
        {TOTALS_FIELDS.map((field) => {
          const count = batch.totals[field.key];
          const hasItems = count > 0;

          return (
            <div
              key={field.key}
              className={cn(
                "flex flex-col justify-between gap-1 p-3.5 transition-colors duration-150",
                field.tone === "success" && hasItems
                  ? "bg-success/10"
                  : field.tone === "danger" && hasItems
                    ? "bg-destructive/10"
                    : field.tone === "warning" && hasItems
                      ? "bg-warning/10"
                      : field.tone === "accent" && hasItems
                        ? "bg-accent"
                        : "bg-card",
              )}
            >
              <span className="text-muted-foreground text-xs font-medium">{field.label}</span>
              <span
                className={cn(
                  "font-mono text-2xl font-semibold tabular-nums",
                  field.tone === "success" && hasItems
                    ? "text-success-foreground"
                    : field.tone === "danger" && hasItems
                      ? "text-destructive"
                      : field.tone === "warning" && hasItems
                        ? "text-warning-foreground"
                        : field.tone === "accent" && hasItems
                          ? "text-accent-foreground"
                          : "text-foreground",
                )}
              >
                {count}
              </span>
            </div>
          );
        })}
      </div>

      {/* Metadata Bar */}
      <div className="grid grid-cols-1 gap-3 pt-1 text-xs sm:grid-cols-2 lg:grid-cols-4">
        <div className="text-muted-foreground flex items-center gap-2">
          <Calendar className="text-foreground-subtle size-4 shrink-0" aria-hidden="true" />
          <span>
            Bắt đầu:{" "}
            <strong className="text-foreground font-mono font-medium tabular-nums">
              {formatDateTime(batch.startedAt)}
            </strong>
          </span>
        </div>

        <div className="text-muted-foreground flex items-center gap-2">
          <Clock className="text-foreground-subtle size-4 shrink-0" aria-hidden="true" />
          <span>
            Kết thúc:{" "}
            <strong className="text-foreground font-mono font-medium tabular-nums">
              {batch.finishedAt ? formatDateTime(batch.finishedAt) : "Đang chạy…"}
            </strong>
          </span>
        </div>

        {batch.durationMs !== null && (
          <div className="text-muted-foreground flex items-center gap-2">
            <Sparkles className="text-foreground-subtle size-4 shrink-0" aria-hidden="true" />
            <span>
              Thời gian:{" "}
              <strong className="text-foreground font-mono font-medium tabular-nums">
                {formatDurationMs(batch.durationMs)}
              </strong>
            </span>
          </div>
        )}

        <div className="flex items-center justify-between gap-1.5 sm:justify-start">
          <div className="text-muted-foreground flex min-w-0 items-center gap-1.5 overflow-hidden">
            <Hash className="text-foreground-subtle size-4 shrink-0" aria-hidden="true" />
            <span className="truncate font-mono text-xs">{batch.batchId}</span>
          </div>
          <button
            type="button"
            onClick={() => void clipboard.copy(batch.batchId)}
            title="Sao chép mã lô"
            className="text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-ring flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-lg transition-colors duration-150 outline-none focus-visible:ring-2"
          >
            {clipboard.state === "copied" ? (
              <Check className="text-success-foreground size-4" aria-hidden="true" />
            ) : (
              <Copy className="size-4" aria-hidden="true" />
            )}
            {/* An icon-only button has no name without this. */}
            <span className="sr-only">Sao chép mã lô {batch.batchId}</span>
          </button>
        </div>
      </div>

      {/* The copy either happened or it did not, and the operator is told which:
          a tick that appears whatever the browser did is worse than no tick. */}
      <p role="status" aria-live="polite" className="text-muted-foreground text-xs">
        {copyStatusMessage(clipboard.state, "mã lô")}
      </p>
    </section>
  );
}
