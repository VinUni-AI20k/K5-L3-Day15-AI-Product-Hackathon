"use client";

import {
  HStack,
  Heading,
  IconButton,
  Layout,
  LayoutContent,
  LayoutHeader,
  LayoutPanel,
  useAnnounce,
  useMediaQuery,
} from "@astryxdesign/core";
import { X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { extractBlockedReasonsFromError } from "@/ui/components/comments/comment-error";
import { formatBulkResultSummary } from "@/ui/components/comments/moderation/bulk-action-state";
import type { BulkPageSelectionControl } from "@/ui/components/comments/moderation/BulkActionBar";
import { useCommentSelection } from "@/ui/components/comments/moderation/useCommentSelection";
import { toApiError } from "@/ui/components/feedback/present-api-error";
import type { ComposerBlockedState } from "@/ui/components/inbox/ChatComposer";
import {
  ChatThreadPane,
  type ChatThreadPaneProps,
} from "@/ui/components/inbox/ChatThreadPane";
import {
  ConversationListPane,
  type ConversationListPaneProps,
} from "@/ui/components/inbox/ConversationListPane";
import { CustomerPanel } from "@/ui/components/inbox/customer/CustomerPanel";
import {
  clearBlockedDraftFromStorage,
  persistBlockedDraftIfEmpty,
} from "@/ui/components/inbox/inbox-composer-state";
import {
  DEFAULT_INBOX_LIST_FILTER,
  EMPTY_INBOX_COUNTS,
  buildInboxListFilterKey,
  buildInboxUrl,
  parseInboxUrlState,
  toInboxListFilter,
} from "@/ui/components/inbox/inbox-filters";
import {
  createClientId,
  createOptimisticReplyMessage,
  createThreadReplyQueue,
  flattenThreadPages,
  markMessageRetrying,
  markOptimisticMessageFailed,
  mergeThreadMessages,
  pruneConfirmedOptimisticMessages,
  reconcileOptimisticMessageSent,
  removeOptimisticMessage,
  upsertOptimisticMessage,
  type OptimisticMessagesByThread,
} from "@/ui/components/inbox/inbox-optimistic";
import { reconcileVisibleThreads } from "@/ui/components/inbox/inbox-scroll-state";
import { InboxAutoReplyDialog } from "@/ui/components/inbox/InboxAutoReplyDialog";
import { InboxCustomerSheet } from "@/ui/components/inbox/InboxCustomerSheet";
import {
  InboxModerationDialog,
  type InboxModerationPanel,
} from "@/ui/components/inbox/InboxModerationDialog";
import { useChannels } from "@/ui/hooks/useChannels";
import { useDelayedFlag } from "@/ui/hooks/useDelayedFlag";
import {
  useClearThreadAttention,
  useGenerateThreadDraft,
  useIgnoreThread,
  useInboxSyncComments,
  useInboxThread,
  useInboxThreadRuns,
  useInboxThreads,
  useInvalidateInbox,
  useMarkThreadRead,
  useSendThreadReply,
  useSetMessageHidden,
  useSetMessageLiked,
  useUnignoreThread,
} from "@/ui/hooks/useInbox";
import { useNowMs } from "@/ui/hooks/useNowMs";
import { useReadOnlyReason } from "@/ui/hooks/useReadOnlyReason";
import type { CommentSyncResponse } from "@/ui/schemas/comment.schema";
import {
  formatSyncSummary,
  formatThreadAccessibleContext,
  type InboxListFilter,
  type InboxMessage,
  type InboxThread,
} from "@/ui/schemas/inbox.schema";
import type {
  BulkCommentAction,
  BulkCommentsResponse,
} from "@/ui/schemas/moderation.schema";

import "./inbox-surface.css";

const SEARCH_DEBOUNCE_MS = 300;
const ALL_CHANNELS_VALUE = "__all__";

export type InboxLayoutMode = "desktop" | "tablet" | "mobile";

export interface InboxWorkspaceViewProps {
  readonly layoutMode: InboxLayoutMode;
  readonly selectedThreadId: string | null;
  readonly activeThread: InboxThread | null;
  readonly isDesktopCustomerPanelOpen: boolean;
  readonly isCustomerSheetOpen: boolean;
  readonly activeModerationPanel: InboxModerationPanel;
  readonly isAutoReplyDialogOpen?: boolean;
  readonly readOnlyReason: string | null;
  readonly pageNameById?: Readonly<Record<string, string | undefined>>;
  readonly listProps: ConversationListPaneProps;
  readonly chatProps: ChatThreadPaneProps;
  readonly onCollapseDesktopCustomerPanel: () => void;
  readonly onCloseCustomerSheet: () => void;
  readonly onCloseModerationPanel: () => void;
  readonly onCloseAutoReplyDialog?: () => void;
}

/**
 * Pure presentational shell for the 3-column desktop / 2-column tablet /
 * 1-column mobile Pancake-style inbox. Uses dynamic viewport height with zero
 * page scroll and independent column scroll containers.
 */
export function InboxWorkspaceView({
  layoutMode,
  selectedThreadId,
  activeThread,
  isDesktopCustomerPanelOpen,
  isCustomerSheetOpen,
  activeModerationPanel,
  isAutoReplyDialogOpen = false,
  readOnlyReason,
  pageNameById,
  listProps,
  chatProps,
  onCollapseDesktopCustomerPanel,
  onCloseCustomerSheet,
  onCloseModerationPanel,
  onCloseAutoReplyDialog,
}: InboxWorkspaceViewProps) {
  const isMobile = layoutMode === "mobile";
  const isDesktop = layoutMode === "desktop";

  // Mobile (<768px): strictly one column driven by `?thread=`.
  if (isMobile) {
    return (
      <>
        <Layout
          height="fill"
          className="h-full max-h-dvh overflow-hidden inbox-surface-page"
          content={
            <LayoutContent
              padding={0}
              isScrollable={false}
              className="inbox-surface-page"
              data-inbox-layout="mobile"
            >
              {selectedThreadId ? (
                <ChatThreadPane {...chatProps} showBackButton />
              ) : (
                <ConversationListPane {...listProps} />
              )}
            </LayoutContent>
          }
        />

        <InboxCustomerSheet
          isOpen={isCustomerSheetOpen}
          isMobile
          thread={activeThread}
          onClose={onCloseCustomerSheet}
        />

        <InboxModerationDialog
          activePanel={activeModerationPanel}
          readOnlyReason={readOnlyReason}
          pageNameById={pageNameById}
          onClose={onCloseModerationPanel}
        />

        <InboxAutoReplyDialog
          isOpen={isAutoReplyDialogOpen}
          readOnlyReason={readOnlyReason}
          pageNameById={pageNameById}
          onClose={() => onCloseAutoReplyDialog?.()}
        />
      </>
    );
  }

  // Desktop (>=1024px): 3 independently scrolling columns.
  // Tablet (768-1023px): list + chat; customer panel opens as a side sheet.
  const showInlineCustomerPanel =
    isDesktop && isDesktopCustomerPanelOpen && activeThread !== null;

  return (
    <>
      <Layout
        height="fill"
        className="h-full max-h-dvh overflow-hidden inbox-surface-page"
        start={
          <LayoutPanel
            width={isDesktop ? 340 : 300}
            padding={0}
            hasDivider
            isScrollable={false}
            label="Danh sách hội thoại"
            className="inbox-surface-page"
          >
            <ConversationListPane {...listProps} />
          </LayoutPanel>
        }
        content={
          <LayoutContent
            padding={0}
            isScrollable={false}
            className="inbox-surface-page"
            data-inbox-layout={layoutMode}
          >
            <ChatThreadPane {...chatProps} showBackButton={false} />
          </LayoutContent>
        }
        end={
          showInlineCustomerPanel ? (
            <LayoutPanel
              width={320}
              padding={0}
              hasDivider
              isScrollable={false}
              label="Thông tin khách hàng"
              className="inbox-surface-page"
            >
              <Layout
                height="fill"
                className="inbox-surface-page"
                header={
                  <LayoutHeader hasDivider padding={0} className="inbox-panel-header">
                    <HStack gap={2} align="center" justify="between">
                      <Heading level={5} color="secondary">
                        Thông tin khách hàng
                      </Heading>
                      <IconButton
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="inbox-touch-target"
                        icon={<X className="size-4" aria-hidden="true" />}
                        label="Thu gọn bảng thông tin khách hàng"
                        tooltip="Thu gọn"
                        onClick={onCollapseDesktopCustomerPanel}
                      />
                    </HStack>
                  </LayoutHeader>
                }
                content={
                  <LayoutContent padding={0} isScrollable className="inbox-surface-page">
                    <CustomerPanel
                      fromId={activeThread.customer.id}
                      fallbackName={activeThread.customer.name}
                      threadId={activeThread.id}
                    />
                  </LayoutContent>
                }
              />
            </LayoutPanel>
          ) : undefined
        }
      />

      {!isDesktop ? (
        <InboxCustomerSheet
          isOpen={isCustomerSheetOpen}
          isMobile={false}
          thread={activeThread}
          onClose={onCloseCustomerSheet}
        />
      ) : null}

      <InboxModerationDialog
        activePanel={activeModerationPanel}
        readOnlyReason={readOnlyReason}
        pageNameById={pageNameById}
        onClose={onCloseModerationPanel}
      />

      <InboxAutoReplyDialog
        isOpen={isAutoReplyDialogOpen}
        readOnlyReason={readOnlyReason}
        pageNameById={pageNameById}
        onClose={() => onCloseAutoReplyDialog?.()}
      />
    </>
  );
}

/**
 * Connected `/comments` Pancake/Messenger-style inbox screen.
 * Owns URL state, TanStack Query hooks via `inboxKeys`, optimistic reply state,
 * scroll pinning, bulk moderation integration, and read-only session gating.
 */
export function InboxScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isMobile = useMediaQuery("(max-width: 767px)");
  const isBelowDesktop = useMediaQuery("(max-width: 1023px)");
  const isCoarsePointer = useMediaQuery("(pointer: coarse)");
  const nowMs = useNowMs(60_000);
  const readOnlyReason = useReadOnlyReason();
  const announce = useAnnounce();
  const invalidateInbox = useInvalidateInbox();

  const layoutMode: InboxLayoutMode = isMobile
    ? "mobile"
    : isBelowDesktop
      ? "tablet"
      : "desktop";

  const urlState = useMemo(
    () => parseInboxUrlState(new URLSearchParams(searchParams.toString())),
    [searchParams],
  );
  const listFilter = useMemo(() => toInboxListFilter(urlState), [urlState]);
  const selectedThreadId = urlState.thread;

  const [runsRequestedThreadId, setRunsRequestedThreadId] = useState<string | null>(null);
  const shouldFetchThreadRuns =
    Boolean(selectedThreadId) && runsRequestedThreadId === selectedThreadId;

  const threadsQuery = useInboxThreads(listFilter);
  const threadQuery = useInboxThread(selectedThreadId);
  const threadRunsQuery = useInboxThreadRuns(selectedThreadId, shouldFetchThreadRuns);
  const channelsQuery = useChannels();

  const markReadMutation = useMarkThreadRead();
  const generateDraftMutation = useGenerateThreadDraft();
  const sendReplyMutation = useSendThreadReply();
  const ignoreMutation = useIgnoreThread();
  const unignoreMutation = useUnignoreThread();
  const clearAttentionMutation = useClearThreadAttention();
  const likeMutation = useSetMessageLiked();
  const hideMutation = useSetMessageHidden();
  const syncMutation = useInboxSyncComments();

  // --- UI state ------------------------------------------------------------
  const [searchDraft, setSearchDraft] = useState(listFilter.q ?? "");
  const lastAppliedQueryRef = useRef(listFilter.q ?? "");
  const [isDesktopCustomerPanelOpen, setIsDesktopCustomerPanelOpen] = useState(true);
  const [isCustomerSheetOpen, setIsCustomerSheetOpen] = useState(false);
  const [activeModerationPanel, setActiveModerationPanel] =
    useState<InboxModerationPanel>(null);
  const [isAutoReplyDialogOpen, setIsAutoReplyDialogOpen] = useState(false);
  const [isBulkMode, setIsBulkMode] = useState(false);

  // Sync feedback state
  const [lastSyncResult, setLastSyncResult] = useState<CommentSyncResponse | null>(null);
  const [syncSummaryMessage, setSyncSummaryMessage] = useState<string | null>(null);

  // Optimistic reply state + inline 422 BLOCKED state + per-message action errors
  const [optimisticByThread, setOptimisticByThread] =
    useState<OptimisticMessagesByThread>({});
  const [blockedByThread, setBlockedByThread] = useState<
    Record<string, ComposerBlockedState | undefined>
  >({});
  const [draftErrorByThread, setDraftErrorByThread] = useState<
    Record<string, unknown>
  >({});
  const [clearAttentionErrorByThread, setClearAttentionErrorByThread] = useState<
    Record<string, unknown>
  >({});
  const [messageErrorById, setMessageErrorById] = useState<Record<string, unknown>>(
    {},
  );
  const [lastOwnSendSeq, setLastOwnSendSeq] = useState(0);
  const [replyQueue] = useState(() => createThreadReplyQueue());

  // Conversation list scroll freeze (no reordering under pointer)
  const [isListScrolled, setIsListScrolled] = useState(false);
  const [pinnedSnapshot, setPinnedSnapshot] = useState<{
    readonly filterKey: string;
    readonly items: readonly InboxThread[];
  } | null>(null);

  // --- URL navigation helpers ----------------------------------------------
  const replaceListFilter = useCallback(
    (nextListFilter: InboxListFilter) => {
      setPinnedSnapshot(null);
      setIsListScrolled(false);
      router.replace(
        buildInboxUrl({ ...nextListFilter, thread: urlState.thread }, pathname),
        { scroll: false },
      );
    },
    [pathname, router, urlState.thread],
  );

  const handleSelectThread = useCallback(
    (threadId: string) => {
      const targetUrl = buildInboxUrl({ ...urlState, thread: threadId }, pathname);
      if (isMobile) {
        router.push(targetUrl, { scroll: false });
      } else {
        router.replace(targetUrl, { scroll: false });
      }
    },
    [isMobile, pathname, router, urlState],
  );

  const handleBackToList = useCallback(() => {
    setIsCustomerSheetOpen(false);
    router.push(buildInboxUrl({ ...urlState, thread: null }, pathname), {
      scroll: false,
    });
  }, [pathname, router, urlState]);

  // Debounced search sync with URL
  useEffect(() => {
    const fromUrl = listFilter.q ?? "";
    if (fromUrl !== lastAppliedQueryRef.current) {
      lastAppliedQueryRef.current = fromUrl;
      setSearchDraft(fromUrl);
    }
  }, [listFilter.q]);

  useEffect(() => {
    const trimmed = searchDraft.trim();
    if (trimmed === (listFilter.q ?? "")) return;
    const timer = setTimeout(() => {
      lastAppliedQueryRef.current = trimmed;
      replaceListFilter({
        ...listFilter,
        q: trimmed.length > 0 ? trimmed : null,
      });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [listFilter, replaceListFilter, searchDraft]);

  // --- Derived thread list & scroll freeze ---------------------------------
  const rawServerThreads = useMemo(() => {
    const seen = new Set<string>();
    const list: InboxThread[] = [];
    for (const page of threadsQuery.data?.pages ?? []) {
      for (const item of page.items) {
        if (seen.has(item.id)) continue;
        seen.add(item.id);
        list.push(item);
      }
    }
    return list;
  }, [threadsQuery.data]);

  const counts = threadsQuery.data?.pages[0]?.counts ?? EMPTY_INBOX_COUNTS;
  const hasCounts = threadsQuery.data !== undefined;
  const listFilterKey = useMemo(
    () => buildInboxListFilterKey(listFilter),
    [listFilter],
  );

  const pinnedForCurrentFilter =
    pinnedSnapshot && pinnedSnapshot.filterKey === listFilterKey
      ? pinnedSnapshot.items
      : rawServerThreads;

  const { visible: visibleThreads, pendingNewCount: pendingNewThreadsCount } = useMemo(
    () =>
      reconcileVisibleThreads({
        currentVisible: pinnedForCurrentFilter,
        latestFromServer: rawServerThreads,
        isListScrolled,
      }),
    [isListScrolled, pinnedForCurrentFilter, rawServerThreads],
  );

  const handleListScrollChange = useCallback(
    (scrolledDown: boolean) => {
      if (scrolledDown === isListScrolled) return;
      setIsListScrolled(scrolledDown);
      if (scrolledDown) {
        setPinnedSnapshot({ filterKey: listFilterKey, items: rawServerThreads });
      } else {
        setPinnedSnapshot(null);
      }
    },
    [isListScrolled, listFilterKey, rawServerThreads],
  );

  const handleApplyPendingThreads = useCallback(() => {
    setPinnedSnapshot(null);
    setIsListScrolled(false);
  }, []);

  // --- Active thread & merged messages -------------------------------------
  const detailThread = threadQuery.data?.pages[0]?.thread ?? null;
  const listThreadFallback = useMemo(
    () =>
      selectedThreadId
        ? (rawServerThreads.find((t) => t.id === selectedThreadId) ?? null)
        : null,
    [rawServerThreads, selectedThreadId],
  );
  const activeThread = detailThread ?? listThreadFallback;

  // Keep the open thread's live 2 s agentRun state reflected on its row in the list.
  const syncedVisibleThreads = useMemo(() => {
    if (!detailThread) return visibleThreads;
    let changed = false;
    const next = visibleThreads.map((item) => {
      if (item.id !== detailThread.id || item.agentRun === detailThread.agentRun) {
        return item;
      }
      changed = true;
      return { ...item, agentRun: detailThread.agentRun };
    });
    return changed ? next : visibleThreads;
  }, [detailThread, visibleThreads]);

  const serverMessages = useMemo(
    () => flattenThreadPages(threadQuery.data?.pages ?? []),
    [threadQuery.data],
  );

  const mergedMessages = useMemo(() => {
    if (!selectedThreadId) return [];
    const prunedMap = pruneConfirmedOptimisticMessages(
      optimisticByThread,
      selectedThreadId,
      serverMessages,
    );
    return mergeThreadMessages(
      serverMessages,
      prunedMap[selectedThreadId] ?? [],
    );
  }, [optimisticByThread, selectedThreadId, serverMessages]);

  // --- Mark thread read when opened ----------------------------------------
  const lastMarkedReadRef = useRef<string | null>(null);
  const markReadMutate = markReadMutation.mutate;
  const activeLastMessageId = activeThread?.lastMessage.id ?? null;
  const activeUnread = activeThread?.unread ?? false;

  useEffect(() => {
    if (!selectedThreadId || readOnlyReason !== null) return;
    const signature = `${selectedThreadId}:${activeLastMessageId ?? "open"}`;
    const alreadyMarkedSameOpen = lastMarkedReadRef.current === signature;
    if (alreadyMarkedSameOpen) return;
    // Call /read on first open of any thread, or whenever a new unread message arrives in it.
    const isNewThreadOpen =
      !lastMarkedReadRef.current?.startsWith(`${selectedThreadId}:`);
    if (isNewThreadOpen || activeUnread) {
      lastMarkedReadRef.current = signature;
      markReadMutate({ threadId: selectedThreadId });
    }
  }, [activeLastMessageId, activeUnread, markReadMutate, readOnlyReason, selectedThreadId]);

  // --- Bulk moderation selection (reuses comments/moderation/*) ------------
  const pageIds = useMemo(
    () => visibleThreads.map((item) => item.id),
    [visibleThreads],
  );
  const selection = useCommentSelection({ pageIds, filterKey: listFilterKey });

  const bulkCommentLabelsById = useMemo(() => {
    const labels: Record<string, string> = {};
    for (const item of visibleThreads) {
      labels[item.id] = formatThreadAccessibleContext(item);
    }
    return labels;
  }, [visibleThreads]);

  const bulkPageSelection: BulkPageSelectionControl = useMemo(
    () => ({
      checkboxValue: selection.pageStatus.checkboxValue,
      totalOnPage: selection.pageStatus.totalOnPage,
      selectedOnPageCount: selection.pageStatus.selectedOnPageCount,
      onToggleAllOnPage: selection.toggleAllOnPage,
    }),
    [selection.pageStatus, selection.toggleAllOnPage],
  );

  // --- Channels selector & Page name map -----------------------------------
  const channelOptions = useMemo(() => {
    const list = channelsQuery.data?.channels ?? [];
    const facebookChannels = list.filter((channel) => channel.platform === "facebook");
    const mapped = facebookChannels.map((channel) => ({
      value: channel.channelId,
      label: channel.name.trim().length > 0 ? channel.name : channel.channelId,
    }));
    if (listFilter.channelId && !mapped.some((opt) => opt.value === listFilter.channelId)) {
      mapped.push({ value: listFilter.channelId, label: listFilter.channelId });
    }
    return [{ value: ALL_CHANNELS_VALUE, label: "Tất cả Fanpage" }, ...mapped];
  }, [channelsQuery.data?.channels, listFilter.channelId]);

  const pageNameById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const channel of channelsQuery.data?.channels ?? []) {
      const name = channel.name.trim();
      if (channel.externalId && name.length > 0) {
        map[channel.externalId] = name;
      }
    }
    return map;
  }, [channelsQuery.data?.channels]);

  // --- Loading skeleton flags (never shown during background refetch) ------
  const isListFirstLoad =
    threadsQuery.isPending && threadsQuery.fetchStatus === "fetching";
  const showListSkeleton = useDelayedFlag(isListFirstLoad);

  const isThreadFirstLoad =
    Boolean(selectedThreadId) &&
    threadQuery.isPending &&
    threadQuery.fetchStatus === "fetching";
  const showThreadSkeleton = useDelayedFlag(isThreadFirstLoad);

  // --- Action handlers -----------------------------------------------------
  function handleClearFilters() {
    lastAppliedQueryRef.current = "";
    setSearchDraft("");
    replaceListFilter(DEFAULT_INBOX_LIST_FILTER);
  }

  function handleSync() {
    if (readOnlyReason !== null) return;
    syncMutation.reset();
    setLastSyncResult(null);
    setSyncSummaryMessage(null);
    syncMutation.mutate(
      {
        channelId: listFilter.channelId ?? undefined,
        postJobId: listFilter.postJobId ?? undefined,
      },
      {
        onSuccess: (result) => {
          setLastSyncResult(result);
          const summary = formatSyncSummary(result);
          setSyncSummaryMessage(summary);
          announce(summary, "polite");
        },
      },
    );
  }

  function handleBulkResult(
    response: BulkCommentsResponse,
    action: BulkCommentAction,
  ) {
    selection.applyBulkResult(response);
    announce(formatBulkResultSummary(action, response), "polite");
    invalidateInbox(selectedThreadId);
  }

  async function dispatchReply(params: {
    readonly threadId: string;
    readonly text: string;
    readonly clientId: string;
  }) {
    try {
      const res = await sendReplyMutation.mutateAsync(params);
      setOptimisticByThread((prev) =>
        reconcileOptimisticMessageSent(prev, {
          threadId: params.threadId,
          clientId: params.clientId,
          serverMessage: res.message,
        }),
      );
      announce("Đã gửi trả lời lên Facebook.", "polite");
    } catch (caught) {
      const apiError = toApiError(caught);
      const blockedReasons = extractBlockedReasonsFromError(apiError);
      if (blockedReasons.length > 0) {
        persistBlockedDraftIfEmpty(params.threadId, params.text);
        setOptimisticByThread((prev) =>
          removeOptimisticMessage(prev, {
            threadId: params.threadId,
            clientId: params.clientId,
          }),
        );
        setBlockedByThread((prev) => ({
          ...prev,
          [params.threadId]: {
            seq: (prev[params.threadId]?.seq ?? 0) + 1,
            reasons: blockedReasons,
            rejectedText: params.text,
          },
        }));
        return;
      }

      setOptimisticByThread((prev) =>
        markOptimisticMessageFailed(prev, {
          threadId: params.threadId,
          clientId: params.clientId,
          errorCode: apiError.code,
          userMessage: apiError.userMessage,
        }),
      );
    }
  }

  function handleSendReply(text: string) {
    if (!activeThread || readOnlyReason !== null) return;
    const threadId = activeThread.id;
    const clientId = createClientId();
    const optimistic = createOptimisticReplyMessage({
      threadId,
      pageId: activeThread.pageId,
      channelName: activeThread.channelName,
      text,
      clientId,
    });
    setOptimisticByThread((prev) => upsertOptimisticMessage(prev, optimistic));
    setLastOwnSendSeq((prev) => prev + 1);
    void replyQueue.enqueue(threadId, () =>
      dispatchReply({ threadId, text, clientId }),
    );
  }

  function handleRetrySendMessage(message: InboxMessage) {
    if (readOnlyReason !== null) return;
    const clientId = message.clientId ?? createClientId();
    setOptimisticByThread((prev) =>
      markMessageRetrying(prev, { ...message, clientId }),
    );
    void replyQueue.enqueue(message.threadId, () =>
      dispatchReply({
        threadId: message.threadId,
        text: message.text,
        clientId,
      }),
    );
  }

  function handleRegenerateDraft() {
    if (!activeThread || readOnlyReason !== null) return;
    const targetId = activeThread.id;
    setDraftErrorByThread((prev) => ({ ...prev, [targetId]: undefined }));
    generateDraftMutation.mutate(
      { threadId: targetId },
      {
        onSuccess: (res) => {
          const msg =
            res.thread.draft?.status === "flagged"
              ? "AI đã đánh dấu hội thoại cần nhân viên kiểm tra."
              : "Đã tạo lại nháp trả lời AI.";
          announce(msg, "polite");
        },
        onError: (err) => {
          setDraftErrorByThread((prev) => ({ ...prev, [targetId]: err }));
        },
      },
    );
  }

  function handleIgnoreThread() {
    if (!activeThread || readOnlyReason !== null) return;
    ignoreMutation.mutate(
      { threadId: activeThread.id },
      {
        onSuccess: () => announce("Đã bỏ qua hội thoại.", "polite"),
      },
    );
  }

  function handleUnignoreThread() {
    if (!activeThread || readOnlyReason !== null) return;
    unignoreMutation.mutate(
      { threadId: activeThread.id },
      {
        onSuccess: () => announce("Đã khôi phục hội thoại.", "polite"),
      },
    );
  }

  function handleClearAttention() {
    if (!activeThread || readOnlyReason !== null) return;
    const targetId = activeThread.id;
    setClearAttentionErrorByThread((prev) => ({ ...prev, [targetId]: undefined }));
    clearAttentionMutation.mutate(
      { threadId: targetId },
      {
        onSuccess: () => announce("Đã đánh dấu xử lý hội thoại Cần bạn.", "polite"),
        onError: (err) => {
          setClearAttentionErrorByThread((prev) => ({ ...prev, [targetId]: err }));
        },
      },
    );
  }

  function handleToggleLikeMessage(message: InboxMessage) {
    if (readOnlyReason !== null || message.fromPage) return;
    setMessageErrorById((prev) => ({ ...prev, [message.id]: undefined }));
    const nextLiked = !message.likedByPage;
    likeMutation.mutate(
      { threadId: message.threadId, commentId: message.id, liked: nextLiked },
      {
        onSuccess: () => {
          announce(
            nextLiked ? "Đã thích bình luận." : "Đã bỏ thích bình luận.",
            "polite",
          );
        },
        onError: (err) => {
          setMessageErrorById((prev) => ({ ...prev, [message.id]: err }));
        },
      },
    );
  }

  function handleToggleHideMessage(message: InboxMessage) {
    if (readOnlyReason !== null || message.fromPage) return;
    setMessageErrorById((prev) => ({ ...prev, [message.id]: undefined }));
    const nextHidden = !message.isHidden;
    hideMutation.mutate(
      { threadId: message.threadId, commentId: message.id, hidden: nextHidden },
      {
        onSuccess: () => {
          announce(
            nextHidden ? "Đã ẩn bình luận." : "Đã hiện lại bình luận.",
            "polite",
          );
        },
        onError: (err) => {
          setMessageErrorById((prev) => ({ ...prev, [message.id]: err }));
        },
      },
    );
  }

  function handleToggleCustomerPanel() {
    if (layoutMode === "desktop") {
      setIsDesktopCustomerPanelOpen((prev) => !prev);
    } else {
      setIsCustomerSheetOpen((prev) => !prev);
    }
  }

  function handleCloseModerationPanel() {
    setActiveModerationPanel(null);
    invalidateInbox(selectedThreadId);
  }

  const isCustomerPanelOpen =
    layoutMode === "desktop" ? isDesktopCustomerPanelOpen : isCustomerSheetOpen;

  const isTogglingIgnore =
    (ignoreMutation.isPending &&
      ignoreMutation.variables?.threadId === activeThread?.id) ||
    (unignoreMutation.isPending &&
      unignoreMutation.variables?.threadId === activeThread?.id);

  const isGeneratingDraft =
    generateDraftMutation.isPending &&
    generateDraftMutation.variables?.threadId === activeThread?.id;

  const isClearingAttention =
    clearAttentionMutation.isPending &&
    clearAttentionMutation.variables?.threadId === activeThread?.id;

  return (
    <InboxWorkspaceView
      layoutMode={layoutMode}
      selectedThreadId={selectedThreadId}
      activeThread={activeThread}
      isDesktopCustomerPanelOpen={isDesktopCustomerPanelOpen}
      isCustomerSheetOpen={isCustomerSheetOpen}
      activeModerationPanel={activeModerationPanel}
      isAutoReplyDialogOpen={isAutoReplyDialogOpen}
      readOnlyReason={readOnlyReason}
      pageNameById={pageNameById}
      listProps={{
        filter: listFilter,
        counts,
        hasCounts,
        items: syncedVisibleThreads,
        selectedThreadId,
        nowMs,
        readOnlyReason,
        searchDraft,
        channelOptions,
        isFirstLoad: isListFirstLoad,
        showSkeleton: showListSkeleton,
        isError: threadsQuery.isError,
        error: threadsQuery.error,
        hasNextPage: Boolean(threadsQuery.hasNextPage),
        isFetchingNextPage: threadsQuery.isFetchingNextPage,
        isSyncing: syncMutation.isPending,
        syncError: syncMutation.error,
        lastSyncResult,
        syncSummaryMessage,
        pendingNewThreadsCount,
        isBulkMode,
        selectedBulkIds: selection.selectedIds,
        cappedAtMaxBulk: selection.cappedAtMax,
        isBulkAtMax: selection.isAtMax,
        bulkPageSelection,
        bulkCommentLabelsById,
        activeModerationPanel,
        isAutoReplyDialogOpen,
        onSearchDraftChange: setSearchDraft,
        onFilterChange: replaceListFilter,
        onClearFilters: handleClearFilters,
        onSelectThread: handleSelectThread,
        onRetryList: () => void threadsQuery.refetch(),
        onLoadMore: () => void threadsQuery.fetchNextPage(),
        onSync: handleSync,
        onDismissSyncSummary: () => setSyncSummaryMessage(null),
        onApplyPendingThreads: handleApplyPendingThreads,
        onListScrollChange: handleListScrollChange,
        onToggleBulkMode: () => {
          setIsBulkMode((prev) => {
            if (prev) selection.clear();
            return !prev;
          });
        },
        onToggleBulkSelect: selection.toggle,
        onClearBulkSelection: selection.clear,
        onBulkResult: handleBulkResult,
        onOpenModerationPanel: setActiveModerationPanel,
        onOpenAutoReplyDialog: () => setIsAutoReplyDialogOpen(true),
      }}
      chatProps={{
        threadId: selectedThreadId,
        thread: activeThread,
        messages: mergedMessages,
        nowMs,
        readOnlyReason,
        isCoarsePointer,
        isNarrowViewport: isMobile,
        showBackButton: isMobile,
        isCustomerPanelOpen,
        isFirstLoad: isThreadFirstLoad,
        showSkeleton: showThreadSkeleton,
        isError: threadQuery.isError,
        error: threadQuery.error,
        hasOlderMessages: Boolean(threadQuery.hasNextPage),
        isFetchingOlder: threadQuery.isFetchingNextPage,
        isTogglingIgnore,
        isGeneratingDraft,
        draftError: activeThread ? draftErrorByThread[activeThread.id] : undefined,
        blockedState: activeThread
          ? (blockedByThread[activeThread.id] ?? null)
          : null,
        isClearingAttention,
        clearAttentionError: activeThread
          ? clearAttentionErrorByThread[activeThread.id]
          : undefined,
        likingMessageId: likeMutation.isPending
          ? (likeMutation.variables?.commentId ?? null)
          : null,
        hidingMessageId: hideMutation.isPending
          ? (hideMutation.variables?.commentId ?? null)
          : null,
        messageErrorById,
        lastOwnSendSeq,
        threadRuns: threadRunsQuery.data?.items,
        isLoadingThreadRuns:
          shouldFetchThreadRuns &&
          threadRunsQuery.isPending &&
          threadRunsQuery.fetchStatus === "fetching",
        threadRunsError: shouldFetchThreadRuns ? threadRunsQuery.error : null,
        onBack: handleBackToList,
        onRetryThread: () => void threadQuery.refetch(),
        onLoadOlder: () => void threadQuery.fetchNextPage(),
        onIgnoreThread: handleIgnoreThread,
        onUnignoreThread: handleUnignoreThread,
        onToggleCustomerPanel: handleToggleCustomerPanel,
        onSendReply: handleSendReply,
        onRetrySendMessage: handleRetrySendMessage,
        onRegenerateDraft: handleRegenerateDraft,
        onClearBlocked: () => {
          if (!activeThread) return;
          clearBlockedDraftFromStorage(activeThread.id);
          setBlockedByThread((prev) => ({ ...prev, [activeThread.id]: undefined }));
        },
        onClearAttention: handleClearAttention,
        onToggleLikeMessage: handleToggleLikeMessage,
        onToggleHideMessage: handleToggleHideMessage,
        onRequestThreadRuns: () => {
          if (selectedThreadId) {
            setRunsRequestedThreadId(selectedThreadId);
          }
        },
        onRetryThreadRuns: () => void threadRunsQuery.refetch(),
      }}
      onCollapseDesktopCustomerPanel={() => setIsDesktopCustomerPanelOpen(false)}
      onCloseCustomerSheet={() => setIsCustomerSheetOpen(false)}
      onCloseModerationPanel={handleCloseModerationPanel}
      onCloseAutoReplyDialog={() => setIsAutoReplyDialogOpen(false)}
    />
  );
}
