"use client";

import {
  Badge,
  Banner,
  Button,
  HStack,
  Heading,
  IconButton,
  Layout,
  LayoutContent,
  LayoutFooter,
  LayoutHeader,
  Selector,
  Stack,
  Text,
  TextInput,
  ToggleButton,
  Token,
} from "@astryxdesign/core";
import { InternationalizationProvider, type Catalog } from "@astryxdesign/core/i18n";
import {
  ArrowUp,
  Bot,
  CheckSquare,
  History,
  RefreshCw,
  Search,
  ShieldCheck,
} from "lucide-react";
import { useRef, type UIEvent } from "react";

import { CommentErrorNotice } from "@/ui/components/comments/CommentErrorNotice";
import {
  BulkActionBar,
  type BulkPageSelectionControl,
} from "@/ui/components/comments/moderation/BulkActionBar";
import { PermissionMissingNotice } from "@/ui/components/comments/PermissionMissingNotice";
import { ReadOnlyNotice } from "@/ui/components/feedback/ReadOnlyNotice";
import { ConversationListItem } from "@/ui/components/inbox/ConversationListItem";
import {
  INBOX_FILTER_CHIPS,
  getInboxFilterCount,
  hasActiveInboxFilters,
  resolveInboxListEmptyKind,
} from "@/ui/components/inbox/inbox-filters";
import {
  LIST_TOP_PIN_THRESHOLD_PX,
  isScrolledNearBottom,
} from "@/ui/components/inbox/inbox-scroll-state";
import { InboxEmptyState } from "@/ui/components/inbox/InboxEmptyState";
import { InboxListSkeleton } from "@/ui/components/inbox/InboxSkeleton";
import "./inbox-surface.css";
import { ASTRYX_LOCALE, ASTRYX_VI } from "@/ui/i18n/astryx-vi";
import type { CommentSyncResponse } from "@/ui/schemas/comment.schema";
import {
  INBOX_FILTER_LABELS,
  isModerationFailedCode,
  isReconnectPageCode,
  type InboxListFilter,
  type InboxThread,
  type InboxThreadCounts,
  type InboxThreadFilterChip,
} from "@/ui/schemas/inbox.schema";
import type {
  BulkCommentAction,
  BulkCommentsResponse,
} from "@/ui/schemas/moderation.schema";

const ALL_CHANNELS_VALUE = "__all__";

const INBOX_TOKEN_ASTRYX_VI: Catalog = {
  ...ASTRYX_VI,
  "@astryx.token.remove": { defaultMessage: "Bỏ {label}" },
};

export function InboxPostJobFilterToken({
  postJobId,
  onRemove,
}: {
  readonly postJobId: string;
  readonly onRemove: () => void;
}) {
  return (
    <InternationalizationProvider
      locale={ASTRYX_LOCALE}
      messages={{ [ASTRYX_LOCALE]: INBOX_TOKEN_ASTRYX_VI }}
    >
      <Token label={`Bài đăng: ${postJobId}`} size="sm" onRemove={onRemove} />
    </InternationalizationProvider>
  );
}

export interface ConversationListPaneProps {
  readonly filter: InboxListFilter;
  readonly counts: InboxThreadCounts;
  readonly hasCounts: boolean;
  readonly items: readonly InboxThread[];
  readonly selectedThreadId: string | null;
  readonly nowMs: number;
  readonly readOnlyReason: string | null;
  readonly searchDraft: string;
  readonly channelOptions: readonly { value: string; label: string }[];
  readonly isFirstLoad: boolean;
  readonly showSkeleton: boolean;
  readonly isError: boolean;
  readonly error: unknown;
  readonly hasNextPage: boolean;
  readonly isFetchingNextPage: boolean;
  readonly isSyncing: boolean;
  readonly syncError: unknown;
  readonly lastSyncResult: CommentSyncResponse | null;
  readonly syncSummaryMessage: string | null;
  readonly pendingNewThreadsCount: number;
  readonly isBulkMode: boolean;
  readonly selectedBulkIds: readonly string[];
  readonly cappedAtMaxBulk: boolean;
  readonly isBulkAtMax: boolean;
  readonly bulkPageSelection: BulkPageSelectionControl;
  readonly bulkCommentLabelsById: Readonly<Record<string, string | undefined>>;
  readonly activeModerationPanel: "settings" | "log" | null;
  readonly isAutoReplyDialogOpen?: boolean;
  readonly onSearchDraftChange: (value: string) => void;
  readonly onFilterChange: (next: InboxListFilter) => void;
  readonly onClearFilters: () => void;
  readonly onSelectThread: (threadId: string) => void;
  readonly onRetryList: () => void;
  readonly onLoadMore: () => void;
  readonly onSync: () => void;
  readonly onDismissSyncSummary: () => void;
  readonly onApplyPendingThreads: () => void;
  readonly onListScrollChange: (isScrolledDown: boolean) => void;
  readonly onToggleBulkMode: () => void;
  readonly onToggleBulkSelect: (threadId: string) => void;
  readonly onClearBulkSelection: () => void;
  readonly onBulkResult: (
    response: BulkCommentsResponse,
    action: BulkCommentAction,
  ) => void;
  readonly onOpenModerationPanel: (panel: "settings" | "log") => void;
  readonly onOpenAutoReplyDialog?: () => void;
}

/**
 * Left column of the inbox: search, filter chips with counts, Page selector,
 * post filter chip, toolbar (sync, bulk mode, moderation settings/log),
 * independently scrolling conversation list with scroll-pinning, and bulk bar.
 */
export function ConversationListPane({
  filter,
  counts,
  hasCounts,
  items,
  selectedThreadId,
  nowMs,
  readOnlyReason,
  searchDraft,
  channelOptions,
  isFirstLoad,
  showSkeleton,
  isError,
  error,
  hasNextPage,
  isFetchingNextPage,
  isSyncing,
  syncError,
  lastSyncResult,
  syncSummaryMessage,
  pendingNewThreadsCount,
  isBulkMode,
  selectedBulkIds,
  cappedAtMaxBulk,
  isBulkAtMax,
  bulkPageSelection,
  bulkCommentLabelsById,
  activeModerationPanel,
  isAutoReplyDialogOpen = false,
  onSearchDraftChange,
  onFilterChange,
  onClearFilters,
  onSelectThread,
  onRetryList,
  onLoadMore,
  onSync,
  onDismissSyncSummary,
  onApplyPendingThreads,
  onListScrollChange,
  onToggleBulkMode,
  onToggleBulkSelect,
  onClearBulkSelection,
  onBulkResult,
  onOpenModerationPanel,
  onOpenAutoReplyDialog,
}: ConversationListPaneProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const hasFilters = hasActiveInboxFilters(filter);
  const selectedBulkSet = new Set(selectedBulkIds);

  const syncErrors = lastSyncResult?.errors ?? [];
  const syncPermissionErrors = syncErrors.filter((e) => isReconnectPageCode(e.code));
  const syncOtherErrors = syncErrors.filter(
    (e) => !isReconnectPageCode(e.code) && !isModerationFailedCode(e.code),
  );

  function handleScroll(event: UIEvent<HTMLDivElement>) {
    const el = event.currentTarget;
    const isScrolledDown = el.scrollTop > LIST_TOP_PIN_THRESHOLD_PX;
    onListScrollChange(isScrolledDown);
    if (
      hasNextPage &&
      !isFetchingNextPage &&
      isScrolledNearBottom(
        {
          scrollTop: el.scrollTop,
          clientHeight: el.clientHeight,
          scrollHeight: el.scrollHeight,
        },
        120,
      )
    ) {
      onLoadMore();
    }
  }

  function handleApplyPendingAndScrollTop() {
    onApplyPendingThreads();
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }

  function renderChipBadge(chip: InboxThreadFilterChip) {
    if (!hasCounts) return undefined;
    const count = getInboxFilterCount(counts, chip);
    if (count === undefined) return undefined;
    const variant =
      chip === "can_ban" && count > 0
        ? "error"
        : chip === "needs_reply" && count > 0
          ? "warning"
          : chip === "unread" && count > 0
            ? "info"
            : "neutral";
    return <Badge variant={variant} label={count} className="tabular-nums" />;
  }

  function renderBody() {
    if (isFirstLoad) {
      return showSkeleton ? <InboxListSkeleton /> : null;
    }

    if (isError && items.length === 0) {
      return (
        <Stack direction="vertical" padding={4}>
          <CommentErrorNotice error={error} onRetry={onRetryList} />
        </Stack>
      );
    }

    if (items.length === 0) {
      const emptyKind = resolveInboxListEmptyKind({ counts, filter });
      if (emptyKind === "first-run") {
        return (
          <Stack direction="vertical" padding={4}>
            <InboxEmptyState
              kind="first-run"
              isCompact
              title="Chưa có bình luận nào — hệ thống tự đồng bộ mỗi phút"
              description="Khi khách bình luận trên bài viết Facebook đã đăng từ VPOST, hội thoại sẽ tự động xuất hiện tại đây."
              action={
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="inbox-touch-target"
                  icon={<RefreshCw className="size-4" aria-hidden="true" />}
                  label={isSyncing ? "Đang đồng bộ…" : "Đồng bộ ngay"}
                  isLoading={isSyncing}
                  isDisabled={isSyncing || readOnlyReason !== null}
                  tooltip={readOnlyReason ?? undefined}
                  onClick={onSync}
                />
              }
            />
          </Stack>
        );
      }

      if (emptyKind === "can-ban-clear") {
        return (
          <Stack direction="vertical" padding={4}>
            <InboxEmptyState
              kind="done"
              isCompact
              title="Không có hội thoại nào cần bạn"
              description="Tất cả hội thoại cần nhân viên xử lý đều đã được giải quyết. Bạn có thể xem lại toàn bộ hội thoại ở mục Tất cả."
              action={
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="inbox-touch-target"
                  label="Xem tất cả hội thoại"
                  onClick={() => onFilterChange({ ...filter, filter: "all" })}
                />
              }
            />
          </Stack>
        );
      }

      if (emptyKind === "done") {
        return (
          <Stack direction="vertical" padding={4}>
            <InboxEmptyState
              kind="done"
              isCompact
              title="Đã trả lời hết"
              description="Không còn hội thoại nào đang chờ phản hồi. Bạn có thể xem lại toàn bộ hội thoại ở mục Tất cả."
              action={
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="inbox-touch-target"
                  label="Xem tất cả hội thoại"
                  onClick={() => onFilterChange({ ...filter, filter: "all" })}
                />
              }
            />
          </Stack>
        );
      }

      return (
        <Stack direction="vertical" padding={4}>
          <InboxEmptyState
            kind="no-result"
            isCompact
            title="Không có hội thoại nào khớp bộ lọc"
            description="Thử xoá bộ lọc hoặc đổi từ khoá tìm kiếm để xem các hội thoại khác."
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
        </Stack>
      );
    }

    return (
      <Stack direction="vertical" gap={0}>
        {isError ? (
          <Stack direction="vertical" paddingInline={4} paddingBlock={3}>
            <CommentErrorNotice
              error={error}
              shouldFocus={false}
              onRetry={onRetryList}
            />
          </Stack>
        ) : null}

        <Stack
          as="ul"
          role="list"
          aria-label="Danh sách hội thoại"
          direction="vertical"
          gap={0}
          padding={0}
        >
          {items.map((thread, idx) => {
            const isBulkSelected = selectedBulkSet.has(thread.id);
            const isCheckboxDisabled = !isBulkSelected && isBulkAtMax;
            return (
              <ConversationListItem
                key={thread.id}
                thread={thread}
                nowMs={nowMs}
                isSelected={selectedThreadId === thread.id}
                isBulkMode={isBulkMode}
                isBulkSelected={isBulkSelected}
                isBulkCheckboxDisabled={isCheckboxDisabled}
                bulkDisabledReason={
                  isCheckboxDisabled
                    ? "Đã đạt giới hạn 50 bình luận mỗi lượt thao tác hàng loạt."
                    : undefined
                }
                showDivider={idx < items.length - 1}
                onSelect={onSelectThread}
                onToggleBulkSelect={onToggleBulkSelect}
              />
            );
          })}
        </Stack>

        {hasNextPage ? (
          <HStack justify="center" padding={4}>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="inbox-touch-target"
              label={isFetchingNextPage ? "Đang tải thêm…" : "Tải thêm hội thoại"}
              isLoading={isFetchingNextPage}
              isDisabled={isFetchingNextPage}
              onClick={onLoadMore}
            />
          </HStack>
        ) : null}
      </Stack>
    );
  }

  return (
    <Layout
      height="fill"
      className="inbox-surface-page"
      header={
        <LayoutHeader hasDivider padding={0} className="inbox-list-header">
          <Stack direction="vertical" gap={3} className="min-w-0">
            {/* Top title + toolbar */}
            <HStack gap={2} align="center" justify="between">
              <Heading level={1}>Bình luận</Heading>

              <HStack gap={1} align="center">
                <IconButton
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="inbox-touch-target"
                  icon={<RefreshCw className="size-4" aria-hidden="true" />}
                  label={isSyncing ? "Đang đồng bộ bình luận" : "Đồng bộ bình luận"}
                  tooltip={readOnlyReason ?? "Đồng bộ bình luận"}
                  isLoading={isSyncing}
                  isDisabled={isSyncing || readOnlyReason !== null}
                  onClick={onSync}
                />

                <ToggleButton
                  size="sm"
                  isIconOnly
                  className="inbox-touch-target"
                  icon={<CheckSquare className="size-4" aria-hidden="true" />}
                  label={isBulkMode ? "Thoát chọn nhiều" : "Chọn nhiều để kiểm duyệt"}
                  tooltip={isBulkMode ? "Thoát chọn nhiều" : "Chọn nhiều để kiểm duyệt"}
                  isPressed={isBulkMode}
                  onPressedChange={onToggleBulkMode}
                />

                <IconButton
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="inbox-touch-target"
                  icon={<Bot className="size-4" aria-hidden="true" />}
                  label="Tự động trả lời"
                  tooltip="Tự động trả lời"
                  aria-haspopup="dialog"
                  aria-expanded={isAutoReplyDialogOpen}
                  onClick={() => onOpenAutoReplyDialog?.()}
                />

                <IconButton
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="inbox-touch-target"
                  icon={<ShieldCheck className="size-4" aria-hidden="true" />}
                  label="Cài đặt tự kiểm duyệt"
                  tooltip="Cài đặt tự kiểm duyệt"
                  aria-haspopup="dialog"
                  aria-expanded={activeModerationPanel === "settings"}
                  onClick={() => onOpenModerationPanel("settings")}
                />

                <IconButton
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="inbox-touch-target"
                  icon={<History className="size-4" aria-hidden="true" />}
                  label="Nhật ký kiểm duyệt"
                  tooltip="Nhật ký kiểm duyệt"
                  aria-haspopup="dialog"
                  aria-expanded={activeModerationPanel === "log"}
                  onClick={() => onOpenModerationPanel("log")}
                />
              </HStack>
            </HStack>

            <ReadOnlyNotice reason={readOnlyReason} />

            {/* Search input + Page selector */}
            <Stack direction="vertical" gap={2} className="min-w-0">
              <TextInput
                label="Tìm kiếm hội thoại"
                isLabelHidden
                value={searchDraft}
                onChange={onSearchDraftChange}
                placeholder="Tìm tên khách, nội dung, mã SP…"
                startIcon={Search}
                hasClear
                size="md"
                width="100%"
              />

              <Selector
                label="Lọc theo Fanpage"
                isLabelHidden
                options={[...channelOptions]}
                value={filter.channelId ?? ALL_CHANNELS_VALUE}
                onChange={(nextValue) =>
                  onFilterChange({
                    ...filter,
                    channelId: nextValue === ALL_CHANNELS_VALUE ? null : nextValue,
                  })
                }
                size="md"
                width="100%"
              />
            </Stack>

            {/* Filter chips: single scrollable horizontal row with edge fade */}
            <div className="inbox-chip-rail">
              <div
                className="inbox-chip-scroller scroll-cue-x"
                role="group"
                aria-label="Lọc danh sách hội thoại"
                data-inbox="filter-chips"
              >
                {INBOX_FILTER_CHIPS.map((chip) => {
                  const isActive = filter.filter === chip;
                  return (
                    <Button
                      key={chip}
                      type="button"
                      variant={isActive ? "primary" : "secondary"}
                      size="sm"
                      className="inbox-chip"
                      aria-pressed={isActive}
                      label={INBOX_FILTER_LABELS[chip]}
                      endContent={renderChipBadge(chip)}
                      onClick={() => onFilterChange({ ...filter, filter: chip })}
                    />
                  );
                })}
              </div>
            </div>

            {/* Optional post filter chip + clear filters */}
            {filter.postJobId || hasFilters ? (
              <HStack gap={2} align="center" wrap="wrap">
                {filter.postJobId ? (
                  <InboxPostJobFilterToken
                    postJobId={filter.postJobId}
                    onRemove={() => onFilterChange({ ...filter, postJobId: null })}
                  />
                ) : null}
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
            ) : null}
          </Stack>
        </LayoutHeader>
      }
      content={
        <LayoutContent
          ref={scrollRef}
          padding={0}
          isScrollable
          onScroll={handleScroll}
          className="inbox-surface-page"
        >
          {/* New threads waiting while list is scrolled down */}
          {pendingNewThreadsCount > 0 ? (
            <HStack
              justify="center"
              padding={2}
              className="sticky top-0 z-10 bg-background/95"
            >
              <Button
                type="button"
                variant="primary"
                size="sm"
                elevation="low"
                className="inbox-pill-button inbox-touch-target"
                icon={<ArrowUp className="size-4" aria-hidden="true" />}
                label={`Có ${pendingNewThreadsCount} hội thoại mới`}
                onClick={handleApplyPendingAndScrollTop}
              />
            </HStack>
          ) : null}

          {/* Sync notices */}
          {syncSummaryMessage ? (
            <Stack direction="vertical" paddingInline={4} paddingBlock={3}>
              <Banner
                role="status"
                aria-live="polite"
                status="info"
                title={syncSummaryMessage}
                isDismissable
                onDismiss={onDismissSyncSummary}
              />
            </Stack>
          ) : null}

          {syncError ? (
            <Stack direction="vertical" paddingInline={4} paddingBlock={3}>
              <CommentErrorNotice
                error={syncError}
                shouldFocus={false}
                onRetry={readOnlyReason ? undefined : onSync}
              />
            </Stack>
          ) : null}

          {syncPermissionErrors.length > 0 ? (
            <Stack direction="vertical" paddingInline={4} paddingBlock={3}>
              <PermissionMissingNotice errors={syncPermissionErrors} />
            </Stack>
          ) : null}

          {syncOtherErrors.length > 0 ? (
            <Stack direction="vertical" paddingInline={4} paddingBlock={3}>
              <Banner
                role="alert"
                status="warning"
                title={`Có ${syncOtherErrors.length} bài không đồng bộ được`}
                description="Các bài còn lại vẫn được cập nhật bình thường."
              >
                <Stack as="ul" role="list" direction="vertical" gap={1}>
                  {syncOtherErrors.map((item) => (
                    <Stack as="li" key={`${item.postJobId}-${item.code}`} direction="vertical" gap={0}>
                      <Text type="supporting">
                        Bài {item.postJobId}: {item.message}
                      </Text>
                    </Stack>
                  ))}
                </Stack>
              </Banner>
            </Stack>
          ) : null}

          {renderBody()}
        </LayoutContent>
      }
      footer={
        isBulkMode || selectedBulkIds.length > 0 ? (
          <LayoutFooter hasDivider padding={3} className="inbox-surface-page">
            <BulkActionBar
              selectedIds={selectedBulkIds}
              cappedAtMax={cappedAtMaxBulk}
              pageSelection={bulkPageSelection}
              commentLabelsById={bulkCommentLabelsById}
              readOnlyReason={readOnlyReason}
              onClearSelection={onClearBulkSelection}
              onBulkResult={onBulkResult}
            />
          </LayoutFooter>
        ) : undefined
      }
    />
  );
}
