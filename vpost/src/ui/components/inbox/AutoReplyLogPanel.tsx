"use client";

import {
  Badge,
  Button,
  HStack,
  Heading,
  Link,
  Selector,
  Skeleton,
  Stack,
  Table,
  Text,
  Token,
  pixel,
  proportional,
  type TableColumn,
} from "@astryxdesign/core";
import { History, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";

import { ApiErrorNotice } from "@/ui/components/feedback/ApiErrorNotice";
import {
  hasActiveAutoReplyLogFilters,
  resolveAutoReplyLogEmptyKind,
} from "@/ui/components/inbox/auto-reply-state";
import { InboxEmptyState } from "@/ui/components/inbox/InboxEmptyState";
import { buildThreadHref } from "@/ui/components/inbox/realtime/realtime-notifications";
import "@/ui/components/inbox/inbox-surface.css";
import { useAutoReplyLog } from "@/ui/hooks/useAutoReply";
import { useDelayedFlag } from "@/ui/hooks/useDelayedFlag";
import { useNowMs } from "@/ui/hooks/useNowMs";
import {
  AUTO_REPLY_ACTIONS,
  AUTO_REPLY_ACTION_LABELS,
  AUTO_REPLY_INTENT_LABELS,
  AUTO_REPLY_LOG_DEFAULT_LIMIT,
  DEFAULT_AUTO_REPLY_LOG_FILTER,
  type AutoReplyAction,
  type AutoReplyLogEntry,
  type AutoReplyLogFilter,
} from "@/ui/schemas/auto-reply.schema";
import {
  formatCommentAbsoluteTime,
  formatCommentRelativeTime,
} from "@/ui/schemas/comment.schema";

const ALL_VALUE = "__all__";
const SKELETON_ROWS = 5;

const ACTION_FILTER_OPTIONS = [
  { value: ALL_VALUE, label: "Tất cả hành động" },
  ...AUTO_REPLY_ACTIONS.map((action) => ({
    value: action,
    label: AUTO_REPLY_ACTION_LABELS[action],
  })),
];

const ACTION_BADGE_VARIANTS: Record<
  AutoReplyAction,
  "success" | "info" | "neutral" | "error"
> = {
  sent: "success",
  would_send: "info",
  skipped: "neutral",
  failed: "error",
};

interface AutoReplyLogTableRow extends Record<string, unknown> {
  readonly id: string;
  readonly entry: AutoReplyLogEntry;
}

export function AutoReplyLogSkeleton() {
  return (
    <Stack direction="vertical" gap={2} aria-hidden="true">
      {Array.from({ length: SKELETON_ROWS }, (_, row) => (
        <HStack key={row} gap={3} align="center" paddingBlock={2}>
          <Skeleton width={130} height={16} index={row} />
          <Skeleton width={110} height={22} index={row} />
          <Skeleton width={150} height={16} index={row} />
          <Skeleton width={100} height={22} index={row} />
          <Skeleton width="35%" height={16} index={row} />
        </HStack>
      ))}
    </Stack>
  );
}

export interface AutoReplyLogViewProps {
  readonly isFirstLoad: boolean;
  readonly showSkeleton: boolean;
  readonly isFetching: boolean;
  readonly isError: boolean;
  readonly error: unknown;
  readonly items: readonly AutoReplyLogEntry[];
  readonly filter: AutoReplyLogFilter;
  readonly nowMs: number;
  readonly hasNextPage: boolean;
  readonly isFetchingNextPage: boolean;
  readonly pageNameById?: Readonly<Record<string, string | undefined>>;
  readonly onFilterChange: (next: AutoReplyLogFilter) => void;
  readonly onClearFilters: () => void;
  readonly onRefresh: () => void;
  readonly onLoadMore: () => void;
  readonly onOpenThread?: () => void;
}

/**
 * Presentational auto-reply log view with Page & Action filters, loading skeleton,
 * empty states, error handling, and cursor pagination.
 */
export function AutoReplyLogView({
  isFirstLoad,
  showSkeleton,
  isFetching,
  isError,
  error,
  items,
  filter,
  nowMs,
  hasNextPage,
  isFetchingNextPage,
  pageNameById,
  onFilterChange,
  onClearFilters,
  onRefresh,
  onLoadMore,
  onOpenThread,
}: AutoReplyLogViewProps) {
  const hasFilters = hasActiveAutoReplyLogFilters(filter);

  const pageFilterOptions = useMemo(() => {
    const entries = Object.entries(pageNameById ?? {})
      .filter(([, name]) => typeof name === "string" && name.trim().length > 0)
      .map(([pageId, name]) => ({ value: pageId, label: name!.trim() }));

    if (filter.pageId && !entries.some((opt) => opt.value === filter.pageId)) {
      entries.push({ value: filter.pageId, label: filter.pageId });
    }
    return [{ value: ALL_VALUE, label: "Tất cả Fanpage" }, ...entries];
  }, [filter.pageId, pageNameById]);

  const tableData: AutoReplyLogTableRow[] = useMemo(
    () => items.map((entry) => ({ id: entry.id, entry })),
    [items],
  );

  const columns: TableColumn<AutoReplyLogTableRow>[] = useMemo(
    () => [
      {
        key: "createdAt",
        header: "Thời gian",
        width: pixel(155),
        renderCell: (row) => {
          const abs = formatCommentAbsoluteTime(row.entry.createdAt);
          const rel = formatCommentRelativeTime(row.entry.createdAt, nowMs);
          return (
            <Text type="supporting" color="secondary" hasTabularNumbers>
              <time dateTime={row.entry.createdAt} title={abs}>
                {rel ? `${rel} · ${abs}` : abs}
              </time>
            </Text>
          );
        },
      },
      {
        key: "action",
        header: "Hành động",
        width: pixel(145),
        renderCell: (row) => (
          <Badge
            variant={ACTION_BADGE_VARIANTS[row.entry.action]}
            label={AUTO_REPLY_ACTION_LABELS[row.entry.action]}
          />
        ),
      },
      {
        key: "page",
        header: "Fanpage & hội thoại",
        width: pixel(190),
        renderCell: (row) => {
          const pageDisplay =
            (row.entry.pageId && pageNameById?.[row.entry.pageId]) ||
            row.entry.pageId ||
            "—";
          return (
            <Stack direction="vertical" gap={0.5}>
              <Text type="supporting" weight="medium">
                {pageDisplay}
              </Text>
              <Link
                href={buildThreadHref(row.entry.threadId)}
                hasUnderline
                className="inbox-subtle-link"
                onClick={onOpenThread}
              >
                Mở hội thoại
              </Link>
            </Stack>
          );
        },
      },
      {
        key: "intents",
        header: "Loại câu hỏi",
        width: pixel(145),
        renderCell: (row) =>
          row.entry.intents.length > 0 ? (
            <HStack gap={1} align="center" wrap="wrap">
              {row.entry.intents.map((intent) => (
                <Token
                  key={intent}
                  label={AUTO_REPLY_INTENT_LABELS[intent]}
                  size="sm"
                />
              ))}
            </HStack>
          ) : (
            <Text type="supporting" color="secondary">
              —
            </Text>
          ),
      },
      {
        key: "detail",
        header: "Nội dung & lý do",
        width: proportional(1),
        renderCell: (row) => {
          const text = row.entry.text?.trim() ?? "";
          const reason = row.entry.reason?.trim() ?? "";
          return (
            <Stack direction="vertical" gap={1}>
              {text.length > 0 ? (
                <Text type="supporting" className="whitespace-pre-wrap break-words">
                  {text}
                </Text>
              ) : null}
              {reason.length > 0 ? (
                <Text type="supporting" color="secondary">
                  {reason}
                </Text>
              ) : null}
              {text.length === 0 && reason.length === 0 ? (
                <Text type="supporting" color="secondary">
                  —
                </Text>
              ) : null}
            </Stack>
          );
        },
      },
    ],
    [nowMs, onOpenThread, pageNameById],
  );

  return (
    <Stack direction="vertical" gap={5} data-auto-reply="log-panel">
      {/* Header & refresh */}
      <HStack gap={3} align="start" justify="between" wrap="wrap">
        <Stack direction="vertical" gap={1}>
          <HStack gap={2} align="center">
            <History
              className="size-5 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <Heading level={2}>Nhật ký tự động trả lời</Heading>
          </HStack>
          <Text type="supporting" color="secondary">
            Theo dõi mọi lượt tự động trả lời đã gửi, bỏ qua hoặc lỗi (bao gồm bản ghi chạy
            thử cũ nếu có) khi hệ thống xử lý câu hỏi giá, size, màu và tư vấn size.
          </Text>
        </Stack>

        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="inbox-touch-target"
          icon={<RefreshCw className="size-4" aria-hidden="true" />}
          label={isFetching ? "Đang tải…" : "Làm mới"}
          isDisabled={isFetching}
          onClick={onRefresh}
        />
      </HStack>

      {/* Page & action filters */}
      <HStack gap={3} align="end" wrap="wrap">
        <div className="w-full sm:w-56">
          <Selector
            label="Lọc theo Fanpage"
            options={pageFilterOptions}
            value={filter.pageId ?? ALL_VALUE}
            size="sm"
            width="100%"
            onChange={(nextValue) =>
              onFilterChange({
                ...filter,
                pageId: nextValue === ALL_VALUE ? null : nextValue,
              })
            }
          />
        </div>

        <div className="w-full sm:w-52">
          <Selector
            label="Lọc theo hành động"
            options={ACTION_FILTER_OPTIONS}
            value={filter.action ?? ALL_VALUE}
            size="sm"
            width="100%"
            onChange={(nextValue) =>
              onFilterChange({
                ...filter,
                action:
                  nextValue === ALL_VALUE ? null : (nextValue as AutoReplyAction),
              })
            }
          />
        </div>

        {hasFilters ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="inbox-touch-target"
            label="Xoá bộ lọc"
            onClick={onClearFilters}
          />
        ) : null}
      </HStack>

      {/* Body states */}
      {isFirstLoad ? (
        showSkeleton ? (
          <AutoReplyLogSkeleton />
        ) : null
      ) : isError && items.length === 0 ? (
        <ApiErrorNotice error={error} onRetry={onRefresh} />
      ) : items.length === 0 ? (
        resolveAutoReplyLogEmptyKind(filter) === "no-result" ? (
          <InboxEmptyState
            kind="no-result"
            title="Không có bản ghi nào khớp bộ lọc"
            description="Thử bỏ lọc Fanpage hoặc hành động để xem toàn bộ nhật ký tự động trả lời."
            action={
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="inbox-touch-target"
                label="Xoá bộ lọc"
                onClick={onClearFilters}
              />
            }
          />
        ) : (
          <InboxEmptyState
            kind="first-run"
            title="Chưa có nhật ký tự động trả lời"
            description="Khi hệ thống tự động xử lý bình luận hỏi giá, size, màu hoặc tư vấn size cho Fanpage, lịch sử sẽ xuất hiện tại đây."
          />
        )
      ) : (
        <Stack direction="vertical" gap={3}>
          {isError ? (
            <ApiErrorNotice error={error} shouldFocus={false} onRetry={onRefresh} />
          ) : null}

          <div className="w-full overflow-x-auto scroll-cue-x">
            <Table
              data={tableData}
              columns={columns}
              idKey="id"
              density="balanced"
              dividers="rows"
              verticalAlign="top"
            />
          </div>

          {hasNextPage ? (
            <HStack justify="center" paddingBlock={2}>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="inbox-touch-target"
                label={isFetchingNextPage ? "Đang tải thêm…" : "Tải thêm nhật ký"}
                isLoading={isFetchingNextPage}
                isDisabled={isFetchingNextPage}
                onClick={onLoadMore}
              />
            </HStack>
          ) : null}
        </Stack>
      )}
    </Stack>
  );
}

export interface AutoReplyLogPanelProps {
  /** Optional Page ID → display name lookup for the filter and table. */
  readonly pageNameById?: Readonly<Record<string, string | undefined>>;
  /** Page size per cursor request (defaults to 20). */
  readonly limit?: number;
  /** Optional callback when operator clicks "Mở hội thoại" (e.g. close dialog). */
  readonly onOpenThread?: () => void;
}

/**
 * Connected paged auto-reply execution log with Fanpage and Action filters.
 */
export function AutoReplyLogPanel({
  pageNameById,
  limit = AUTO_REPLY_LOG_DEFAULT_LIMIT,
  onOpenThread,
}: AutoReplyLogPanelProps = {}) {
  const nowMs = useNowMs(60_000);
  const [filter, setFilter] = useState<AutoReplyLogFilter>(
    DEFAULT_AUTO_REPLY_LOG_FILTER,
  );

  const logQuery = useAutoReplyLog(filter, limit);
  const items = useMemo(
    () => logQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [logQuery.data],
  );
  const isFirstLoad = logQuery.isPending && logQuery.fetchStatus === "fetching";
  const showSkeleton = useDelayedFlag(isFirstLoad);

  return (
    <AutoReplyLogView
      isFirstLoad={isFirstLoad}
      showSkeleton={showSkeleton}
      isFetching={logQuery.isFetching}
      isError={logQuery.isError}
      error={logQuery.error}
      items={items}
      filter={filter}
      nowMs={nowMs}
      hasNextPage={Boolean(logQuery.hasNextPage)}
      isFetchingNextPage={logQuery.isFetchingNextPage}
      pageNameById={pageNameById}
      onFilterChange={setFilter}
      onClearFilters={() => setFilter(DEFAULT_AUTO_REPLY_LOG_FILTER)}
      onRefresh={() => void logQuery.refetch()}
      onLoadMore={() => void logQuery.fetchNextPage()}
      onOpenThread={onOpenThread}
    />
  );
}
