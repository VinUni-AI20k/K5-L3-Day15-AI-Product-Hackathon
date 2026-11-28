"use client";

import {
  Button,
  Center,
  HStack,
  Layout,
  LayoutContent,
  Spinner,
  Stack,
  Text,
} from "@astryxdesign/core";
import { ArrowDown } from "lucide-react";
import {
  useLayoutEffect,
  useRef,
  useState,
  type UIEvent,
} from "react";

import { CommentErrorNotice } from "@/ui/components/comments/CommentErrorNotice";
import {
  ChatComposer,
  type ComposerBlockedState,
} from "@/ui/components/inbox/ChatComposer";
import { ChatHeader } from "@/ui/components/inbox/ChatHeader";
import { ChatMessageItem } from "@/ui/components/inbox/ChatMessageItem";
import {
  isScrolledNearBottom,
  isScrolledNearTop,
  reconcileChatScrollState,
  type ChatScrollTrackerState,
} from "@/ui/components/inbox/inbox-scroll-state";
import { InboxEmptyState } from "@/ui/components/inbox/InboxEmptyState";
import { InboxChatSkeleton } from "@/ui/components/inbox/InboxSkeleton";
import type { InboxMessage, InboxThread } from "@/ui/schemas/inbox.schema";
import { ApiError } from "@/ui/services/api-error";

import "./inbox-surface.css";

export interface ChatThreadPaneProps {
  readonly threadId: string | null;
  readonly thread: InboxThread | null;
  readonly messages: readonly InboxMessage[];
  readonly nowMs: number;
  readonly readOnlyReason: string | null;
  readonly isCoarsePointer: boolean;
  readonly isNarrowViewport: boolean;
  readonly showBackButton: boolean;
  readonly isCustomerPanelOpen: boolean;
  readonly isFirstLoad: boolean;
  readonly showSkeleton: boolean;
  readonly isError: boolean;
  readonly error: unknown;
  readonly hasOlderMessages: boolean;
  readonly isFetchingOlder: boolean;
  readonly isTogglingIgnore: boolean;
  readonly isGeneratingDraft: boolean;
  readonly draftError: unknown;
  readonly blockedState: ComposerBlockedState | null;
  readonly likingMessageId: string | null;
  readonly hidingMessageId: string | null;
  readonly messageErrorById: Readonly<Record<string, unknown>>;
  readonly lastOwnSendSeq: number;
  /** Optional override for render tests of the "Có N tin mới" pill. */
  readonly initialUnseenCount?: number;
  /** Optional override for composer initial text in render tests. */
  readonly composerInitialTextOverride?: string;
  readonly onBack?: () => void;
  readonly onRetryThread: () => void;
  readonly onLoadOlder: () => void;
  readonly onIgnoreThread: () => void;
  readonly onUnignoreThread: () => void;
  readonly onToggleCustomerPanel: () => void;
  readonly onSendReply: (text: string) => void;
  readonly onRetrySendMessage: (message: InboxMessage) => void;
  readonly onRegenerateDraft: () => void;
  readonly onClearBlocked: () => void;
  readonly onToggleLikeMessage: (message: InboxMessage) => void;
  readonly onToggleHideMessage: (message: InboxMessage) => void;
}

function isThreadNotFoundError(error: unknown): boolean {
  if (!ApiError.is(error)) return false;
  return (
    error.status === 404 ||
    error.code === "NOT_FOUND" ||
    error.code === "COMMENT_NOT_FOUND" ||
    error.code === "THREAD_NOT_FOUND"
  );
}

/**
 * Resolves whether Facebook permits replies on this thread from the thread root
 * data (preferring `thread.canComment` when provided by the thread payload, else
 * matching the actual root message `msg.id === thread.id`). Never falls back to
 * `messages[0]`, which on >50-message threads may be a failed draft or level-2 reply.
 */
export function resolveThreadCanComment(
  thread: Pick<InboxThread, "id" | "canComment">,
  messages: readonly Pick<InboxMessage, "id" | "canComment">[],
): boolean {
  if (typeof thread.canComment === "boolean") {
    return thread.canComment;
  }
  const rootMessage = messages.find((msg) => msg.id === thread.id);
  return rootMessage ? rootMessage.canComment : true;
}

/**
 * Center column of the inbox:
 * - Renders nothing-selected, loading skeleton, not-found, and error states
 * - Header (with post card & thread actions) fixed at top
 * - Semantic scrollable message list with anchored older-history load and
 *   conditional auto-scroll / "Có N tin mới" pill
 * - Fixed follow-up composer at bottom
 */
export function ChatThreadPane({
  threadId,
  thread,
  messages,
  nowMs,
  readOnlyReason,
  isCoarsePointer,
  isNarrowViewport,
  showBackButton,
  isCustomerPanelOpen,
  isFirstLoad,
  showSkeleton,
  isError,
  error,
  hasOlderMessages,
  isFetchingOlder,
  isTogglingIgnore,
  isGeneratingDraft,
  draftError,
  blockedState,
  likingMessageId,
  hidingMessageId,
  messageErrorById,
  lastOwnSendSeq,
  initialUnseenCount = 0,
  composerInitialTextOverride,
  onBack,
  onRetryThread,
  onLoadOlder,
  onIgnoreThread,
  onUnignoreThread,
  onToggleCustomerPanel,
  onSendReply,
  onRetrySendMessage,
  onRegenerateDraft,
  onClearBlocked,
  onToggleLikeMessage,
  onToggleHideMessage,
}: ChatThreadPaneProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const scrollTrackerRef = useRef<ChatScrollTrackerState>({
    initializedThreadId: null,
    isAtBottom: true,
    knownMessageIds: new Set(),
    knownClientIds: new Set(),
    lastSeenOwnSendSeq: lastOwnSendSeq,
    olderAnchor: null,
  });

  const [trackedThreadId, setTrackedThreadId] = useState(threadId);
  const [unseenNewCount, setUnseenNewCount] = useState(initialUnseenCount);

  // Reset unseen count synchronously during render whenever switching threads
  // (including cached thread switches where useLayoutEffect runs before useEffect).
  if (trackedThreadId !== threadId) {
    setTrackedThreadId(threadId);
    setUnseenNewCount(initialUnseenCount);
  }

  // Reconcile thread switches, older-history scroll anchors, own sends, and new arrivals.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    const { nextState, effect } = reconcileChatScrollState({
      state: scrollTrackerRef.current,
      threadId,
      messages,
      lastOwnSendSeq,
      scrollHeight: el?.scrollHeight ?? 0,
      hasScrollElement: el !== null,
    });
    scrollTrackerRef.current = nextState;

    if (effect.kind === "restore-anchor" && el) {
      el.scrollTop = effect.scrollTop;
    } else if (effect.kind === "scroll-to-bottom" && el) {
      el.scrollTop = el.scrollHeight;
      if (effect.resetUnseen) {
        setUnseenNewCount(0);
      }
    } else if (effect.kind === "increment-unseen") {
      setUnseenNewCount((prev) => prev + effect.delta);
    }
  }, [messages, threadId, lastOwnSendSeq]);

  function triggerLoadOlder() {
    if (!hasOlderMessages || isFetchingOlder || !threadId) return;
    const el = scrollRef.current;
    if (el) {
      scrollTrackerRef.current = {
        ...scrollTrackerRef.current,
        olderAnchor: {
          threadId,
          prevScrollHeight: el.scrollHeight,
          prevScrollTop: el.scrollTop,
          prevFirstId: messages[0]?.id ?? null,
        },
      };
    }
    onLoadOlder();
  }

  function handleScroll(event: UIEvent<HTMLDivElement>) {
    const el = event.currentTarget;
    const nearBottom = isScrolledNearBottom({
      scrollTop: el.scrollTop,
      clientHeight: el.clientHeight,
      scrollHeight: el.scrollHeight,
    });
    scrollTrackerRef.current = {
      ...scrollTrackerRef.current,
      isAtBottom: nearBottom,
    };
    if (nearBottom && unseenNewCount > 0) {
      setUnseenNewCount(0);
    }

    if (hasOlderMessages && !isFetchingOlder && isScrolledNearTop(el.scrollTop)) {
      triggerLoadOlder();
    }
  }

  function handleScrollToNewest() {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
    scrollTrackerRef.current = {
      ...scrollTrackerRef.current,
      isAtBottom: true,
    };
    setUnseenNewCount(0);
  }

  // --- Empty: nothing selected ---------------------------------------------
  if (!threadId) {
    return (
      <Center className="h-full p-6 inbox-surface-page">
        <InboxEmptyState
          kind="idle"
          title="Chọn một hội thoại"
          description="Chọn hội thoại ở danh sách bên trái để xem đầy đủ bình luận và trả lời khách hàng."
        />
      </Center>
    );
  }

  // --- First-load skeleton (never shown on background refresh) -------------
  if (isFirstLoad && !thread) {
    return showSkeleton ? <InboxChatSkeleton /> : null;
  }

  // --- Thread not found ----------------------------------------------------
  if (isError && !thread && isThreadNotFoundError(error)) {
    return (
      <Center className="h-full p-6 inbox-surface-page">
        <InboxEmptyState
          kind="no-result"
          title="Không tìm thấy hội thoại"
          description="Hội thoại này có thể đã bị xoá trên Facebook hoặc không còn thuộc trang hiện tại."
          action={
            showBackButton && onBack ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="inbox-touch-target"
                label="Quay lại danh sách"
                onClick={onBack}
              />
            ) : undefined
          }
        />
      </Center>
    );
  }

  // --- Fatal error with retry ----------------------------------------------
  if (isError && !thread) {
    return (
      <Stack direction="vertical" padding={4} gap={3} className="h-full inbox-surface-page">
        {showBackButton && onBack ? (
          <HStack>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="inbox-touch-target"
              label="Quay lại danh sách"
              onClick={onBack}
            />
          </HStack>
        ) : null}
        <CommentErrorNotice error={error} onRetry={onRetryThread} />
      </Stack>
    );
  }

  if (!thread) {
    return null;
  }

  const canComment = resolveThreadCanComment(thread, messages);

  return (
    <Layout
      height="fill"
      className="inbox-surface-page"
      header={
        <ChatHeader
          thread={thread}
          readOnlyReason={readOnlyReason}
          isTogglingIgnore={isTogglingIgnore}
          showBackButton={showBackButton}
          isCustomerPanelOpen={isCustomerPanelOpen}
          onBack={onBack}
          onIgnore={onIgnoreThread}
          onUnignore={onUnignoreThread}
          onToggleCustomerPanel={onToggleCustomerPanel}
        />
      }
      content={
        <LayoutContent
          ref={scrollRef}
          padding={0}
          isScrollable
          onScroll={handleScroll}
          className="inbox-chat-stream"
          data-inbox="chat-pane"
          data-thread-id={thread.id}
        >
          <Stack direction="vertical" gap={4}>
            {isError ? (
              <CommentErrorNotice
                error={error}
                shouldFocus={false}
                onRetry={onRetryThread}
              />
            ) : null}

            {/* Load older history trigger / indicator */}
            {hasOlderMessages ? (
              <HStack justify="center" paddingBlock={1}>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="inbox-touch-target"
                  label={isFetchingOlder ? "Đang tải tin cũ hơn…" : "Tải tin nhắn cũ hơn"}
                  isLoading={isFetchingOlder}
                  isDisabled={isFetchingOlder}
                  onClick={triggerLoadOlder}
                />
              </HStack>
            ) : isFetchingOlder ? (
              <HStack justify="center" gap={2} align="center" paddingBlock={1}>
                <Spinner size="sm" />
                <Text type="supporting" color="secondary">
                  Đang tải tin cũ hơn…
                </Text>
              </HStack>
            ) : null}

            {/* Semantic message list */}
            {messages.length === 0 ? (
              <Center className="py-8">
                <InboxEmptyState
                  kind="idle"
                  isCompact
                  title="Chưa có bình luận"
                  description="Chưa có tin nhắn nào trong hội thoại này."
                />
              </Center>
            ) : (
              <Stack
                as="ul"
                role="list"
                aria-label="Lịch sử bình luận"
                direction="vertical"
                gap={4}
                padding={0}
              >
                {messages.map((message) => (
                  <ChatMessageItem
                    key={message.clientId ? `${message.id}:${message.clientId}` : message.id}
                    message={message}
                    channelName={thread.channelName}
                    nowMs={nowMs}
                    readOnlyReason={readOnlyReason}
                    isCoarsePointer={isCoarsePointer}
                    isLiking={likingMessageId === message.id}
                    isHiding={hidingMessageId === message.id}
                    actionError={messageErrorById[message.id]}
                    onToggleLike={onToggleLikeMessage}
                    onToggleHide={onToggleHideMessage}
                    onRetrySend={onRetrySendMessage}
                  />
                ))}
              </Stack>
            )}

            {/* Floating "Có N tin mới" pill when scrolled up */}
            {unseenNewCount > 0 ? (
              <HStack
                justify="center"
                className="sticky bottom-2 z-10 pointer-events-none"
              >
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  elevation="med"
                  className="pointer-events-auto inbox-pill-button inbox-touch-target"
                  icon={<ArrowDown className="size-4" aria-hidden="true" />}
                  label={`Có ${unseenNewCount} tin mới`}
                  onClick={handleScrollToNewest}
                />
              </HStack>
            ) : null}
          </Stack>
        </LayoutContent>
      }
      footer={
        <ChatComposer
          key={thread.id}
          thread={thread}
          canComment={canComment}
          readOnlyReason={readOnlyReason}
          isCoarsePointer={isCoarsePointer}
          isNarrowViewport={isNarrowViewport}
          isGeneratingDraft={isGeneratingDraft}
          draftError={draftError}
          blockedState={blockedState}
          initialTextOverride={composerInitialTextOverride}
          onSendReply={onSendReply}
          onRegenerateDraft={onRegenerateDraft}
          onClearBlocked={onClearBlocked}
        />
      }
    />
  );
}
