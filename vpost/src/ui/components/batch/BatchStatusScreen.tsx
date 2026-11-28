"use client";

import { ArrowLeft, Check, CheckCircle2, Copy, History, PenSquare, RefreshCw } from "lucide-react";
import Link from "next/link";

import { BatchChannelTable } from "@/ui/components/batch/BatchChannelTable";
import { BatchStatusSkeleton } from "@/ui/components/batch/BatchStatusSkeleton";
import { BatchSummaryCard } from "@/ui/components/batch/BatchSummaryCard";
import { ApiErrorNotice } from "@/ui/components/feedback/ApiErrorNotice";
import { EmptyState } from "@/ui/components/feedback/EmptyState";
import { Button } from "@/ui/components/ui/button";
import { useChannels } from "@/ui/hooks/useChannels";
import { copyStatusMessage, useCopyToClipboard } from "@/ui/hooks/useCopyToClipboard";
import { useDelayedFlag } from "@/ui/hooks/useDelayedFlag";
import { useActiveTenant } from "@/ui/hooks/useMe";
import { useBatchStatus } from "@/ui/hooks/usePostBatch";
import { isSettledBatchStatus } from "@/ui/schemas/post-batch.schema";

export function BatchStatusScreen({ batchId }: { batchId: string }) {
  const batch = useBatchStatus(batchId);
  const channels = useChannels();
  const { tenantId } = useActiveTenant();
  const clipboard = useCopyToClipboard("batch", { tenant_id: tenantId, batch_id: batchId });

  const isFirstLoad = batch.isPending && batch.fetchStatus === "fetching";
  const showSkeleton = useDelayedFlag(isFirstLoad);

  const data = batch.data;
  const settled = data ? isSettledBatchStatus(data.status) : false;

  return (
    <section className="flex flex-col gap-6" aria-labelledby="batch-heading">
      {/* Header & Breadcrumbs */}
      <header className="border-border flex flex-col gap-3 border-b pb-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/posts?tab=log"
            className="text-accent-foreground focus-visible:ring-ring inline-flex min-h-10 items-center gap-1.5 rounded-lg text-sm font-medium transition-opacity duration-150 outline-none hover:underline focus-visible:ring-2"
          >
            <ArrowLeft className="size-4 shrink-0" aria-hidden="true" />
            <span>Quay lại Nhật ký bài đăng</span>
          </Link>

          {/* Live indicator chip */}
          {data && (
            <div className="flex items-center gap-2">
              {settled ? (
                <span className="bg-success/15 text-success-foreground inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium">
                  <CheckCircle2 className="size-3.5 shrink-0" aria-hidden="true" />
                  <span>Lô đã hoàn thành</span>
                </span>
              ) : (
                <span className="bg-accent text-accent-foreground inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium">
                  <span className="relative flex size-2" aria-hidden="true">
                    <span className="bg-ring absolute inline-flex h-full w-full rounded-full opacity-75 motion-safe:animate-ping" />
                    <span className="bg-ring relative inline-flex size-2 rounded-full" />
                  </span>
                  <span>Tự động cập nhật</span>
                </span>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-start justify-between gap-4 pt-1">
          <div className="flex min-w-0 flex-col gap-1.5">
            <h1
              id="batch-heading"
              className="text-foreground text-2xl leading-8 font-semibold tracking-tight"
            >
              Theo dõi tiến độ lô đăng
            </h1>
            <p className="text-muted-foreground max-w-2xl text-sm leading-relaxed">
              Mỗi kênh là một tác vụ độc lập — lỗi tại một kênh sẽ không ảnh hưởng tới các kênh
              khác. Bạn có thể đóng tab hoặc chia sẻ link này cho thành viên khác, lô vẫn tiếp tục
              chạy trên máy chủ.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => void clipboard.copy(window.location.href)}
              className="min-h-10 gap-2 px-4"
            >
              {clipboard.state === "copied" ? (
                <Check className="text-success-foreground size-4 shrink-0" aria-hidden="true" />
              ) : (
                <Copy className="size-4 shrink-0" aria-hidden="true" />
              )}
              <span>{clipboard.state === "copied" ? "Đã chép link" : "Sao chép link"}</span>
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={batch.isFetching}
              onClick={() => void batch.refetch()}
              className="min-h-10 gap-2 px-4"
            >
              <RefreshCw
                className={`size-4 shrink-0 ${batch.isFetching ? "motion-safe:animate-spin" : ""}`}
                aria-hidden="true"
              />
              <span>Làm mới</span>
              <span className="sr-only"> trạng thái lô</span>
            </Button>
          </div>
        </div>

        {/* The copy outcome keeps its own region: sharing one with the batch
            state meant a failed copy hid the state, or the next poll wiped the
            failure before it was read. */}
        <p role="status" aria-live="polite" className="text-muted-foreground text-xs">
          {copyStatusMessage(clipboard.state, "link theo dõi")}
        </p>
      </header>

      {/* Live region: a screen reader hears the outcome without re-reading the
          page — this screen polls, so a change has no other way to be heard. */}
      <p role="status" aria-live="polite" className="text-muted-foreground text-sm">
        {batch.isError
          ? "Không đọc được trạng thái lô."
          : !data
            ? "Đang tải trạng thái lô…"
            : settled
              ? "Lô đã kết thúc — trang dừng tự cập nhật."
              : "Trang tự cập nhật vài giây một lần khi còn bài đang chạy."}
      </p>

      {/* Loading Skeleton */}
      {isFirstLoad ? (showSkeleton ? <BatchStatusSkeleton /> : null) : null}

      {/* Error state */}
      {batch.isError && !data ? (
        <ApiErrorNotice
          error={batch.error}
          onRetry={() => void batch.refetch()}
          extraAction={
            <Button asChild variant="secondary" className="min-h-10 px-4">
              <Link href="/posts?tab=log">Mở nhật ký bài đăng</Link>
            </Button>
          }
        />
      ) : null}

      {data ? (
        <div className="flex flex-col gap-6">
          {/* Stale data alert */}
          {batch.isError && (
            <div
              role="status"
              className="border-warning/40 bg-warning/10 text-warning-foreground rounded-xl border px-4 py-3 text-sm leading-relaxed"
            >
              Lần cập nhật gần nhất thất bại — bảng bên dưới đang hiển thị dữ liệu đã lưu trước đó.
              Vui lòng bấm “Làm mới” để thử lại.
            </div>
          )}

          {/* Summary Card with Stat Tape */}
          <BatchSummaryCard batch={data} />

          {/* Channels Table */}
          {data.channels.length === 0 ? (
            <EmptyState
              kind="no-result"
              title="Lô này không có kênh nào"
              description="Không tìm thấy bài đăng nào được tạo cho lô này. Vui lòng kiểm tra lại cấu hình."
              action={
                <Button asChild variant="secondary" className="min-h-10 px-4">
                  <Link href="/compose">Về màn Soạn bài</Link>
                </Button>
              }
            />
          ) : (
            <div className="flex flex-col gap-4">
              {channels.isError && (
                <p className="text-muted-foreground text-xs leading-relaxed">
                  Không tải được danh sách tên Page nên cột Kênh đang hiển thị mã kênh. Kết quả
                  đăng bài của từng kênh vẫn chính xác.
                </p>
              )}
              <BatchChannelTable
                channels={data.channels}
                progressSteps={data.progressSteps}
                tenantChannels={channels.data?.channels}
              />
            </div>
          )}

          {/* Bottom Navigation Actions */}
          <div className="border-border flex flex-wrap items-center justify-between gap-3 border-t pt-5">
            <div className="flex flex-wrap items-center gap-2.5">
              <Button asChild className="min-h-10 gap-2 px-4 shadow-xs">
                <Link href="/compose">
                  <PenSquare className="size-4 shrink-0" aria-hidden="true" />
                  <span>Soạn bài mới</span>
                </Link>
              </Button>
              <Button asChild variant="secondary" className="min-h-10 gap-2 px-4">
                <Link href={`/posts?tab=log&batchId=${encodeURIComponent(data.batchId)}`}>
                  <History className="size-4 shrink-0" aria-hidden="true" />
                  <span>Xem trong Nhật ký</span>
                </Link>
              </Button>
            </div>

            <Button
              type="button"
              variant="secondary"
              disabled={batch.isFetching}
              onClick={() => void batch.refetch()}
              className="min-h-10 gap-2 px-4"
            >
              <RefreshCw
                className={`size-4 shrink-0 ${batch.isFetching ? "motion-safe:animate-spin" : ""}`}
                aria-hidden="true"
              />
              <span>{batch.isFetching ? "Đang tải…" : "Làm mới kết quả"}</span>
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
