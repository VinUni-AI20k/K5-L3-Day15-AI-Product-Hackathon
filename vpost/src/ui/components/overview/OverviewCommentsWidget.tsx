"use client";

import { Badge, Heading } from "@astryxdesign/core";
import { AlertCircle, ArrowRight, MessageSquare, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useId } from "react";

import type { OverviewCommentsState } from "@/ui/components/overview/overview-model";
import {
  formatCommentAbsoluteTime,
  formatCommentRelativeTime,
} from "@/ui/schemas/inbox.schema";

export interface OverviewCommentsWidgetProps {
  readonly state: OverviewCommentsState;
  readonly nowMs: number;
  readonly onRetry?: () => void;
}

/**
 * Overview "Bình luận" card backed by the conversation inbox threads API
 * (`GET /api/comments/threads`). Displays the newest few threads with customer
 * name, excerpt, timestamp, deep link to `/comments?thread=<id>`, and the
 * "Cần bạn" escalation count when present.
 */
export function OverviewCommentsWidget({
  state,
  nowMs,
  onRetry,
}: OverviewCommentsWidgetProps) {
  const headingId = useId();
  const canBanCount =
    state.kind === "ready" || state.kind === "empty" ? state.canBanCount : 0;

  return (
    <section aria-labelledby={headingId} className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Heading level={2} id={headingId}>
            Bình luận
          </Heading>
          {canBanCount > 0 ? (
            <Link
              href="/comments?filter=can_ban"
              aria-label={`Cần bạn: ${canBanCount.toLocaleString("vi-VN")} hội thoại`}
              className="focus-visible:ring-ring inline-flex min-h-7 items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
            >
              <Badge
                variant="error"
                icon={<AlertCircle className="size-3.5" aria-hidden="true" />}
                label={`Cần bạn (${canBanCount.toLocaleString("vi-VN")})`}
                className="tabular-nums"
              />
            </Link>
          ) : null}
        </div>

        {state.kind === "ready" ? (
          <Link
            href="/comments"
            className="text-accent-foreground focus-visible:ring-ring inline-flex min-h-10 items-center rounded-sm px-1 text-sm font-medium underline-offset-4 hover:underline outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
          >
            Xem tất cả ({state.totalCount.toLocaleString("vi-VN")})
          </Link>
        ) : null}
      </div>

      {state.kind === "loading" ? (
        <div
          aria-busy="true"
          className="border-border bg-card flex min-h-56 flex-col justify-center gap-4 rounded-xl border p-5"
        >
          <span className="sr-only">Đang tải bình luận…</span>
          {[0, 1, 2].map((index) => (
            <div key={index} aria-hidden="true" className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div className="bg-muted h-4 w-32 rounded-md motion-safe:animate-pulse" />
                <div className="bg-muted h-3.5 w-16 rounded-md motion-safe:animate-pulse" />
              </div>
              <div className="bg-muted h-3.5 w-4/5 rounded-md motion-safe:animate-pulse" />
            </div>
          ))}
        </div>
      ) : state.kind === "error" ? (
        <div
          role="alert"
          className="border-border bg-card flex min-h-56 flex-col items-center justify-center rounded-xl border p-6 text-center"
        >
          <span
            aria-hidden="true"
            className="bg-muted text-muted-foreground flex size-11 items-center justify-center rounded-xl"
          >
            <AlertCircle className="size-5" aria-hidden="true" />
          </span>
          <h3 className="text-foreground mt-4 text-base font-semibold">
            Không tải được bình luận
          </h3>
          <p className="text-muted-foreground mt-1.5 max-w-xs text-sm">{state.message}</p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            {onRetry ? (
              <button
                type="button"
                onClick={onRetry}
                className="bg-secondary text-secondary-foreground hover:bg-muted/80 active:bg-muted focus-visible:ring-ring inline-flex min-h-10 items-center gap-2 rounded-lg px-4 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-offset-2 motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out"
              >
                <RefreshCw className="size-4" aria-hidden="true" />
                <span>Thử lại</span>
              </button>
            ) : null}
            <Link
              href="/comments"
              className="border-border bg-card text-foreground hover:bg-sidebar active:bg-muted focus-visible:ring-ring inline-flex min-h-10 items-center gap-2 rounded-lg border px-4 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-offset-2 motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out"
            >
              <span>Mở hộp bình luận</span>
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      ) : state.kind === "empty" ? (
        <div className="border-border bg-card flex min-h-56 flex-col items-center justify-center rounded-xl border p-6 text-center">
          <span
            aria-hidden="true"
            className="bg-accent text-accent-foreground flex size-11 items-center justify-center rounded-xl"
          >
            <MessageSquare className="size-5" aria-hidden="true" />
          </span>
          <h3 className="text-foreground mt-4 text-base font-semibold">
            Chưa có bình luận nào.
          </h3>
          <p className="text-muted-foreground mt-1.5 max-w-xs text-sm">
            Các phản hồi và bình luận mới nhất sẽ hiển thị tại đây.
          </p>
          <Link
            href="/comments"
            className="bg-secondary text-secondary-foreground hover:bg-muted/80 active:bg-muted focus-visible:ring-ring mt-5 inline-flex min-h-10 items-center gap-2 rounded-lg px-4 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-offset-2 motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out"
          >
            <span>Mở hộp bình luận</span>
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </div>
      ) : (
        <div className="border-border bg-card flex min-h-56 flex-col justify-between overflow-hidden rounded-xl border">
          <ul className="divide-border divide-y" aria-label="Bình luận mới nhất">
            {state.items.map((item) => {
              const relativeTime = item.timestamp
                ? formatCommentRelativeTime(item.timestamp, nowMs)
                : "";
              const absoluteTime = item.timestamp
                ? formatCommentAbsoluteTime(item.timestamp)
                : "";
              const timeLabel = relativeTime || absoluteTime;

              return (
                <li key={item.id}>
                  <Link
                    href={item.href}
                    className="hover:bg-sidebar active:bg-muted focus-visible:ring-ring flex flex-col gap-1 px-4 py-3 outline-none focus-visible:ring-2 focus-visible:ring-inset motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        {item.unread ? (
                          <>
                            <span
                              aria-hidden="true"
                              className="bg-primary size-2 shrink-0 rounded-full"
                            />
                            <span className="sr-only">Chưa đọc</span>
                          </>
                        ) : null}
                        <span
                          className={
                            item.unread
                              ? "text-foreground truncate text-sm font-semibold"
                              : "text-foreground truncate text-sm font-medium"
                          }
                        >
                          {item.customerName}
                        </span>
                        {item.needsAttention ? (
                          <span
                            className="inline-flex shrink-0"
                            title={
                              item.attentionReason
                                ? `Cần bạn: ${item.attentionReason}`
                                : "Cần bạn"
                            }
                          >
                            <Badge variant="error" label="Cần bạn" />
                          </span>
                        ) : null}
                      </div>

                      {timeLabel ? (
                        <time
                          dateTime={item.timestamp}
                          title={absoluteTime}
                          suppressHydrationWarning
                          className="text-foreground-subtle shrink-0 text-xs tabular-nums"
                        >
                          {timeLabel}
                        </time>
                      ) : null}
                    </div>

                    <p
                      className={
                        item.unread
                          ? "text-foreground truncate text-sm"
                          : "text-muted-foreground truncate text-sm"
                      }
                    >
                      {item.excerpt}
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>

          <div className="border-border bg-sidebar flex items-center justify-end border-t px-4 py-2.5">
            <Link
              href="/comments"
              className="text-accent-foreground focus-visible:ring-ring inline-flex min-h-8 items-center gap-1.5 rounded-sm px-1 text-sm font-medium underline-offset-4 hover:underline outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
            >
              <span>Mở hộp bình luận</span>
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      )}
    </section>
  );
}
