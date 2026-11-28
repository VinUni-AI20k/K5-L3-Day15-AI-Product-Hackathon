"use client";

import { EmptyState, Heading } from "@astryxdesign/core";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useId, useMemo, useState } from "react";
import { CheckCircle2, FileText, RefreshCw, Search, X } from "lucide-react";

import { ApiErrorNotice } from "@/ui/components/feedback/ApiErrorNotice";
import { JobLogSkeleton } from "@/ui/components/jobs/JobLogSkeleton";
import { filterJobsBySearch } from "@/ui/components/jobs/job-log-search";
import { JobLogTable } from "@/ui/components/jobs/JobLogTable";
import { POSTS_TAB_PARAM, withTabParam } from "@/ui/components/posts/posts-tabs";
import { RulesDisclosure } from "@/ui/components/posts/RulesDisclosure";
import { WorkerHealthBanner } from "@/ui/components/jobs/WorkerHealthBanner";
import { presentWorkerHealth } from "@/ui/components/jobs/present-worker-health";
import { Button } from "@/ui/components/ui/button";
import { useChannels } from "@/ui/hooks/useChannels";
import { useDelayedFlag } from "@/ui/hooks/useDelayedFlag";
import { useReadOnlyReason } from "@/ui/hooks/useReadOnlyReason";
import { usePostJobLog, useRetryPostJob } from "@/ui/hooks/usePostJobs";
import { useWorkerHealth } from "@/ui/hooks/useWorkerHealth";
import {
  POST_JOB_STATUSES,
  POST_JOB_STATUS_LABELS,
  jobLogSearchParams,
  parseJobLogFilter,
  type PostJobStatus,
} from "@/ui/schemas/post-batch.schema";

export function JobLogScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchId = useId();
  /**
   * Deliberately NOT in the URL, unlike the status filter beside it: this box
   * searches the pages ALREADY LOADED, so a shared link carrying it would
   * reopen on a different set of pages and show a different answer. The line
   * under the box says so out loud — see `searchScopeNote` below.
   */
  const [localSearch, setLocalSearch] = useState("");

  const filter = useMemo(
    () => parseJobLogFilter(new URLSearchParams(searchParams.toString())),
    [searchParams],
  );

  const log = usePostJobLog(filter);
  const retry = useRetryPostJob();
  const channels = useChannels();
  const readOnlyReason = useReadOnlyReason();

  const workerHealth = useWorkerHealth();
  const healthNotice = presentWorkerHealth({
    health: workerHealth.data,
    hasError: workerHealth.isError,
  });
  const [retryNotice, setRetryNotice] = useState<string | null>(null);

  const isFirstLoad = log.isPending && log.fetchStatus === "fetching";
  const showSkeleton = useDelayedFlag(isFirstLoad);

  const rawItems = useMemo(() => log.data?.pages.flatMap((page) => page.items) ?? [], [log.data]);
  const hasFilter = filter.status !== null || filter.batchId !== null;

  // Over the loaded pages only — see `job-log-search.ts` for why that is said
  // out loud on screen instead of being hidden behind a plausible empty state.
  const items = useMemo(() => filterJobsBySearch(rawItems, localSearch), [rawItems, localSearch]);

  function applyStatus(status: PostJobStatus | null) {
    const params = jobLogSearchParams({ ...filter, status });
    const query = withTabParam(params.toString(), searchParams.get(POSTS_TAB_PARAM));
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  function clearBatchFilter() {
    const params = jobLogSearchParams({ ...filter, batchId: null });
    const query = withTabParam(params.toString(), searchParams.get(POSTS_TAB_PARAM));
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  function clearFilters() {
    setLocalSearch("");
    const query = withTabParam("", searchParams.get(POSTS_TAB_PARAM));
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  function handleRetry(postJobId: string) {
    setRetryNotice(null);
    retry.mutate(
      { postJobId },
      {
        onSuccess: (result) => setRetryNotice(result.userMessage),
        onError: () => setRetryNotice(null),
      },
    );
  }

  return (
    <section className="flex flex-col gap-6 sm:gap-8" aria-labelledby="jobs-heading">
      {/* Header */}
      <header className="border-border flex flex-col gap-1.5 border-b pb-4">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <Heading level={2} id="jobs-heading">
            Nhật ký đăng bài
          </Heading>
          {/* "đã tải", not "đã ghi nhận": this is the number of rows fetched so
              far, not the tenant's total — the list is paged. */}
          <span className="text-muted-foreground font-mono text-xs tabular-nums">
            {rawItems.length} bài đã tải
          </span>
        </div>
        <p className="text-muted-foreground max-w-prose text-sm leading-relaxed">
          Theo dõi lịch sử từng bài đăng trên từng kênh Facebook. Bạn có thể mở bài đã đăng, xem lý
          do bài lỗi và chạy lại riêng từng kênh.
        </p>
      </header>

      {/* Rules Disclosure */}
      <RulesDisclosure>
        <p>
          Tồn kho được kiểm tra lại ngay trước khi đăng, kể cả khi chạy lại — một mã vừa hết hàng sẽ
          bị chặn thay vì lên bài.
        </p>
        <p>
          Bài ở trạng thái “Facebook giữ lịch” đã nằm trên Facebook và Facebook sẽ tự đăng vào giờ
          đã hẹn; hệ thống chỉ theo dõi và cập nhật lại kết quả.
        </p>
        <p>
          Một bài đăng lên nhiều kênh với cùng kết quả được gộp thành một dòng “× N kênh”. Mở dòng đó
          để xem từng kênh, mở bài trên Facebook hoặc chạy lại riêng.
        </p>
      </RulesDisclosure>

      {/* Worker Health Banner */}
      <WorkerHealthBanner
        notice={healthNotice}
        onRecheck={() => void workerHealth.refetch()}
        isChecking={workerHealth.isFetching}
      />

      {/* Filter & Search Bar */}
      <div className="border-border bg-card flex flex-col gap-4 rounded-xl border p-4 sm:p-5">
        <div className="flex flex-col gap-3">
          {/* Status Filter Chips — single scrollable row so mobile never wraps into 3 lines */}
          <div className="flex flex-col gap-2">
            <span className="text-muted-foreground text-sm font-medium">Trạng thái</span>
            <div
              role="group"
              aria-label="Lọc theo trạng thái"
              className="scroll-cue-x -mx-1 flex items-center gap-2 overflow-x-auto px-1 pb-1"
            >
              <button
                type="button"
                aria-pressed={filter.status === null}
                onClick={() => applyStatus(null)}
                className={`focus-visible:ring-ring inline-flex min-h-10 shrink-0 cursor-pointer items-center rounded-full px-3.5 text-sm font-medium whitespace-nowrap transition-colors duration-150 ease-out outline-none focus-visible:ring-2 focus-visible:ring-offset-2 sm:min-h-9 ${
                  filter.status === null
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-foreground hover:bg-muted/80 active:opacity-80"
                }`}
              >
                Tất cả
              </button>
              {POST_JOB_STATUSES.map((status) => {
                const isSelected = filter.status === status;
                return (
                  <button
                    key={status}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => applyStatus(status)}
                    className={`focus-visible:ring-ring inline-flex min-h-10 shrink-0 cursor-pointer items-center rounded-full px-3.5 text-sm font-medium whitespace-nowrap transition-colors duration-150 ease-out outline-none focus-visible:ring-2 focus-visible:ring-offset-2 sm:min-h-9 ${
                      isSelected
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-foreground hover:bg-muted/80 active:opacity-80"
                    }`}
                  >
                    {POST_JOB_STATUS_LABELS[status]}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Search Box & Refresh */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full sm:max-w-xs">
              <label htmlFor={searchId} className="sr-only">
                Tìm trong {rawItems.length} bài đã tải
              </label>
              <Search
                aria-hidden="true"
                className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
              />
              <input
                id={searchId}
                type="text"
                value={localSearch}
                onChange={(e) => setLocalSearch(e.target.value)}
                placeholder="Tìm mã SP, kênh, lỗi..."
                className="border-input bg-background text-foreground placeholder:text-muted-foreground focus-visible:ring-ring h-10 w-full rounded-lg border pr-10 pl-9 text-sm transition-colors duration-150 ease-out outline-none focus-visible:ring-2 focus-visible:ring-offset-2 sm:h-9 sm:pr-9"
              />
              {localSearch && (
                <button
                  type="button"
                  onClick={() => setLocalSearch("")}
                  title="Xoá từ khoá tìm kiếm"
                  aria-label="Xoá từ khoá tìm kiếm"
                  className="text-muted-foreground hover:text-foreground focus-visible:ring-ring absolute top-1/2 right-1 inline-flex size-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md transition-colors duration-150 ease-out outline-none focus-visible:ring-2"
                >
                  <X aria-hidden="true" className="size-4" />
                </button>
              )}
            </div>

            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                void log.refetch();
                void workerHealth.refetch();
              }}
              disabled={log.isFetching}
              className="min-h-10 gap-1.5 self-start px-3.5 text-sm sm:min-h-9 sm:self-auto"
            >
              <RefreshCw
                aria-hidden="true"
                className={`size-4 ${log.isFetching ? "motion-safe:animate-spin" : ""}`}
              />
              <span>{log.isFetching ? "Đang tải…" : "Làm mới"}</span>
            </Button>
          </div>
        </div>

        {/* Active Filter Tags */}
        {(filter.batchId || hasFilter || localSearch) && (
          <div className="border-border flex flex-wrap items-center gap-2 border-t pt-3">
            <span className="text-muted-foreground text-xs font-medium">Đang lọc:</span>

            {filter.batchId && (
              <span className="border-border bg-accent text-accent-foreground inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-xs font-medium">
                <span>Lô: {filter.batchId}</span>
                <Link
                  href={`/batches/${encodeURIComponent(filter.batchId)}`}
                  className="text-accent-foreground focus-visible:ring-ring rounded-xs underline underline-offset-2 outline-none hover:opacity-80 focus-visible:ring-2"
                  title="Mở chi tiết lô này"
                >
                  (chi tiết)
                </Link>
                <button
                  type="button"
                  onClick={clearBatchFilter}
                  className="hover:text-destructive focus-visible:ring-ring inline-flex size-5 cursor-pointer items-center justify-center rounded-full transition-colors duration-150 ease-out outline-none focus-visible:ring-2"
                  title="Bỏ lọc theo lô"
                  aria-label="Bỏ lọc theo lô"
                >
                  <X aria-hidden="true" className="size-3.5" />
                </button>
              </span>
            )}

            {filter.status && (
              <span className="border-border bg-muted text-foreground inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium">
                <span>Trạng thái: {POST_JOB_STATUS_LABELS[filter.status]}</span>
                <button
                  type="button"
                  onClick={() => applyStatus(null)}
                  className="text-muted-foreground hover:text-destructive focus-visible:ring-ring inline-flex size-5 cursor-pointer items-center justify-center rounded-full transition-colors duration-150 ease-out outline-none focus-visible:ring-2"
                  title="Bỏ lọc trạng thái"
                  aria-label="Bỏ lọc trạng thái"
                >
                  <X aria-hidden="true" className="size-3.5" />
                </button>
              </span>
            )}

            {localSearch && (
              <span className="border-border bg-muted text-foreground inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium">
                <span>Từ khóa: “{localSearch}”</span>
                <button
                  type="button"
                  onClick={() => setLocalSearch("")}
                  className="text-muted-foreground hover:text-destructive focus-visible:ring-ring inline-flex size-5 cursor-pointer items-center justify-center rounded-full transition-colors duration-150 ease-out outline-none focus-visible:ring-2"
                  title="Xoá lọc từ khoá"
                  aria-label="Xoá lọc từ khoá"
                >
                  <X aria-hidden="true" className="size-3.5" />
                </button>
              </span>
            )}

            <button
              type="button"
              onClick={clearFilters}
              className="text-muted-foreground hover:text-foreground focus-visible:ring-ring ml-1 cursor-pointer rounded-md px-2 py-1 text-xs font-medium underline underline-offset-4 transition-colors duration-150 ease-out outline-none focus-visible:ring-2"
            >
              Xóa tất cả bộ lọc
            </button>
          </div>
        )}
      </div>

      {/* Success Notification after Retry */}
      {retryNotice && (
        <div
          role="status"
          aria-live="polite"
          className="border-success/40 bg-success/10 text-success-foreground flex items-center gap-2.5 rounded-xl border p-4 text-sm font-medium"
        >
          <CheckCircle2 aria-hidden="true" className="size-5 shrink-0" />
          <span>{retryNotice}</span>
        </div>
      )}

      {retry.isError && (
        <ApiErrorNotice error={retry.error} onRetry={() => void log.refetch()} />
      )}

      {/* Loading Skeleton */}
      {isFirstLoad ? (showSkeleton ? <JobLogSkeleton /> : null) : null}

      {/* Query Error */}
      {log.isError && items.length === 0 ? (
        <ApiErrorNotice error={log.error} onRetry={() => void log.refetch()} />
      ) : null}

      {/* A failed page fetch WITH rows already on screen used to show nothing at
          all: the spinner stopped and the screen went on claiming the list was
          complete — including inside the "chưa thấy … trong N bài đã tải" empty
          state, which then tells the operator to load more that cannot load.
          Same answer the batch screen gives: keep what is on screen, say it is
          incomplete. */}
      {log.isError && items.length > 0 ? (
        <p
          role="status"
          className="border-warning/40 bg-warning/10 text-warning-foreground rounded-xl border p-4 text-sm"
        >
          Lần tải gần nhất thất bại — danh sách bên dưới có thể còn thiếu bài cũ hơn. Bấm “Làm mới”
          để thử lại.
        </p>
      ) : null}

      {/* Empty States */}
      {!isFirstLoad && !log.isError && items.length === 0 ? (
        hasFilter || localSearch ? (
          <div className="border-border bg-card rounded-xl border p-6">
            <EmptyState
              headingLevel={3}
              icon={
                <span
                  aria-hidden="true"
                  className="bg-accent text-accent-foreground inline-flex size-10 items-center justify-center rounded-lg"
                >
                  <Search className="size-5" />
                </span>
              }
              title={
                localSearch && log.hasNextPage
                  ? `Chưa thấy “${localSearch.trim()}” trong ${rawItems.length} bài đã tải`
                  : "Không có bài đăng nào khớp bộ lọc"
              }
              description={
                // The search only sees the pages already fetched. Saying "không có
                // bài nào khớp" over a paged list is a false negative: the code may
                // sit in a page nobody has asked for yet, and this screen is the one
                // that must answer "vì sao bài này không lên".
                localSearch && log.hasNextPage
                  ? "Ô tìm kiếm chỉ tìm trong các bài đã tải về — tải thêm bài cũ hơn hoặc xóa bộ lọc để xem toàn bộ."
                  : "Không tìm thấy bài nào khớp bộ lọc đang chọn — xóa bộ lọc để hiển thị toàn bộ danh sách."
              }
              actions={
                <div className="flex flex-wrap items-center justify-center gap-2">
                  {localSearch && log.hasNextPage ? (
                    <Button
                      type="button"
                      onClick={() => void log.fetchNextPage()}
                      disabled={log.isFetchingNextPage}
                      className="min-h-10 px-4 sm:min-h-9"
                    >
                      {log.isFetchingNextPage ? "Đang tải thêm…" : "Tải thêm các bài cũ hơn"}
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant={localSearch && log.hasNextPage ? "secondary" : "default"}
                    onClick={clearFilters}
                    className="min-h-10 px-4 sm:min-h-9"
                  >
                    Xóa bộ lọc
                  </Button>
                </div>
              }
            />
          </div>
        ) : (
          <div className="border-border bg-card rounded-xl border p-6">
            <EmptyState
              headingLevel={3}
              icon={
                <span
                  aria-hidden="true"
                  className="bg-accent text-accent-foreground inline-flex size-10 items-center justify-center rounded-lg"
                >
                  <FileText className="size-5" />
                </span>
              }
              title="Chưa có bài đăng nào"
              description="Chưa có lô đăng nào được tạo cho đơn vị này — soạn bài mới rồi chọn kênh để bắt đầu theo dõi tại đây."
              actions={
                <Button asChild className="min-h-10 px-4 sm:min-h-9">
                  <Link href="/compose">Soạn bài mới</Link>
                </Button>
              }
            />
          </div>
        )
      ) : null}

      {/* Log Data Table */}
      {items.length > 0 && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p role="status" aria-live="polite" className="text-muted-foreground text-sm">
              Đang hiển thị{" "}
              <strong className="text-foreground font-mono font-semibold tabular-nums">
                {items.length.toLocaleString("vi-VN")}
              </strong>{" "}
              bài
              {log.hasNextPage ? " (còn dữ liệu cũ hơn)" : ""}
              {localSearch
                ? ` — tìm “${localSearch.trim()}” trong ${rawItems.length} bài đã tải`
                : ""}
              .
            </p>
            {channels.isError && (
              <span className="text-warning-foreground text-xs">
                * Đang hiển thị mã kênh thay cho tên Page do không tải được danh mục kênh.
              </span>
            )}
          </div>

          <JobLogTable
            items={items}
            onRetry={handleRetry}
            retryingJobId={retry.isPending ? (retry.variables?.postJobId ?? null) : null}
            channels={channels.data?.channels}
            readOnlyReason={readOnlyReason}
          />

          {/* Pagination */}
          {log.hasNextPage ? (
            <div className="flex justify-center pt-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => void log.fetchNextPage()}
                disabled={log.isFetchingNextPage}
                className="min-h-10 gap-2 px-4 sm:min-h-9"
              >
                {log.isFetchingNextPage ? (
                  <>
                    <RefreshCw aria-hidden="true" className="size-4 motion-safe:animate-spin" />
                    <span>Đang tải thêm…</span>
                  </>
                ) : (
                  <span>Tải thêm các bài cũ hơn</span>
                )}
              </Button>
            </div>
          ) : (
            <p className="text-muted-foreground py-2 text-center font-mono text-xs">
              — Đã tải toàn bộ danh sách —
            </p>
          )}
        </div>
      )}
    </section>
  );
}
