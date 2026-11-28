import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ChatComposer } from "@/ui/components/inbox/ChatComposer";
import { ChatHeader } from "@/ui/components/inbox/ChatHeader";
import { ChatMessageItem } from "@/ui/components/inbox/ChatMessageItem";
import {
  ChatThreadPane,
  resolveThreadCanComment,
  type ChatThreadPaneProps,
} from "@/ui/components/inbox/ChatThreadPane";
import { ConversationListItem } from "@/ui/components/inbox/ConversationListItem";
import {
  ConversationListPane,
  InboxPostJobFilterToken,
  type ConversationListPaneProps,
} from "@/ui/components/inbox/ConversationListPane";
import {
  DEFAULT_INBOX_LIST_FILTER,
  EMPTY_INBOX_COUNTS,
} from "@/ui/components/inbox/inbox-filters";
import {
  INBOX_AVATAR_TONES,
  resolveCustomerAvatarTone,
} from "@/ui/components/inbox/InboxCustomerAvatar";
import { InboxWorkspaceView } from "@/ui/components/inbox/InboxScreen";
import {
  InboxChatSkeleton,
  InboxFallback,
  InboxListSkeleton,
} from "@/ui/components/inbox/InboxSkeleton";
import { JobLogTable } from "@/ui/components/jobs/JobLogTable";
import { NAV_ICONS } from "@/ui/components/shell/AppSideNav";
import { NAV_SECTIONS } from "@/ui/components/shell/nav-items";
import {
  INBOX_HIDDEN_MESSAGE_NOTE,
  type InboxMessage,
  type InboxThread,
  type InboxThreadCounts,
} from "@/ui/schemas/inbox.schema";
import type { PostJobLogEntry } from "@/ui/schemas/post-batch.schema";
import { ApiError } from "@/ui/services/api-error";

const NOW_MS = new Date("2026-11-27T12:00:00.000Z").getTime();

function renderMarkup(element: ReactElement): string {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>{element}</QueryClientProvider>,
  );
}

function sampleCounts(overrides: Partial<InboxThreadCounts> = {}): InboxThreadCounts {
  return {
    ...EMPTY_INBOX_COUNTS,
    ...overrides,
  };
}

function sampleThread(overrides: Partial<InboxThread> = {}): InboxThread {
  return {
    id: "root-1",
    channelId: "fb-123",
    channelName: "WorkHardToday",
    pageId: "123",
    postJobId: "job-1",
    productCode: "G1",
    postCaption: "Đầm voan hoa G1 màu đen, size S-L, giá 890.000đ",
    postUrl: "https://www.facebook.com/123_1001",
    postImageUrl: "https://scontent.xx.fbcdn.net/v/post-1.jpg",
    customer: {
      id: "psid-1",
      name: "Minh Thư",
      tags: [
        { id: "tag-1", name: "VIP", color: "purple" },
        { id: "tag-2", name: "Khách cũ", color: "green" },
        { id: "tag-3", name: "Cần gọi lại", color: "orange" },
      ],
    },
    lastMessage: {
      id: "msg-1",
      fromPage: false,
      text: "Mẫu này còn size M không shop?",
      createdAt: "2026-11-27T11:30:00.000Z",
    },
    needsReply: true,
    unread: true,
    unreadCount: 3,
    status: "open",
    isHidden: false,
    messageCount: 2,
    hasPhone: false,
    draft: {
      id: "d-1",
      status: "draft",
      text: "Dạ mẫu G1 màu đen còn size M, giá 890.000đ ạ!",
      aiText: "Dạ mẫu G1 màu đen còn size M, giá 890.000đ ạ!",
      reasons: [],
      warnings: [],
      errorCode: null,
      userMessage: null,
      updatedAt: "2026-11-27T11:31:00.000Z",
    },
    moderation: null,
    updatedAt: "2026-11-27T11:30:00.000Z",
    ...overrides,
  };
}

function sampleMessage(overrides: Partial<InboxMessage> = {}): InboxMessage {
  return {
    id: "msg-1",
    threadId: "root-1",
    fromPage: false,
    fromId: "psid-1",
    fromName: "Minh Thư",
    text: "Mẫu này còn size M không shop?",
    createdAt: "2026-11-27T11:30:00.000Z",
    permalinkUrl: "https://www.facebook.com/123_1001?comment_id=msg-1",
    isHidden: false,
    canComment: true,
    likedByPage: false,
    delivery: "sent",
    errorCode: null,
    userMessage: null,
    clientId: null,
    moderation: null,
    ...overrides,
  };
}

function makeListProps(
  overrides: Partial<ConversationListPaneProps> = {},
): ConversationListPaneProps {
  return {
    filter: DEFAULT_INBOX_LIST_FILTER,
    counts: sampleCounts(),
    hasCounts: true,
    items: [],
    selectedThreadId: null,
    nowMs: NOW_MS,
    readOnlyReason: null,
    searchDraft: "",
    channelOptions: [{ value: "__all__", label: "Tất cả Fanpage" }],
    isFirstLoad: false,
    showSkeleton: false,
    isError: false,
    error: null,
    hasNextPage: false,
    isFetchingNextPage: false,
    isSyncing: false,
    syncError: null,
    lastSyncResult: null,
    syncSummaryMessage: null,
    pendingNewThreadsCount: 0,
    isBulkMode: false,
    selectedBulkIds: [],
    cappedAtMaxBulk: false,
    isBulkAtMax: false,
    bulkPageSelection: {
      checkboxValue: false,
      totalOnPage: 0,
      selectedOnPageCount: 0,
      onToggleAllOnPage: () => {},
    },
    bulkCommentLabelsById: {},
    activeModerationPanel: null,
    onSearchDraftChange: () => {},
    onFilterChange: () => {},
    onClearFilters: () => {},
    onSelectThread: () => {},
    onRetryList: () => {},
    onLoadMore: () => {},
    onSync: () => {},
    onDismissSyncSummary: () => {},
    onApplyPendingThreads: () => {},
    onListScrollChange: () => {},
    onToggleBulkMode: () => {},
    onToggleBulkSelect: () => {},
    onClearBulkSelection: () => {},
    onBulkResult: () => {},
    onOpenModerationPanel: () => {},
    ...overrides,
  };
}

function makeChatProps(
  overrides: Partial<ChatThreadPaneProps> = {},
): ChatThreadPaneProps {
  return {
    threadId: null,
    thread: null,
    messages: [],
    nowMs: NOW_MS,
    readOnlyReason: null,
    isCoarsePointer: false,
    isNarrowViewport: false,
    showBackButton: false,
    isCustomerPanelOpen: true,
    isFirstLoad: false,
    showSkeleton: false,
    isError: false,
    error: null,
    hasOlderMessages: false,
    isFetchingOlder: false,
    isTogglingIgnore: false,
    isGeneratingDraft: false,
    draftError: null,
    blockedState: null,
    likingMessageId: null,
    hidingMessageId: null,
    messageErrorById: {},
    lastOwnSendSeq: 0,
    onBack: () => {},
    onRetryThread: () => {},
    onLoadOlder: () => {},
    onIgnoreThread: () => {},
    onUnignoreThread: () => {},
    onToggleCustomerPanel: () => {},
    onSendReply: () => {},
    onRetrySendMessage: () => {},
    onRegenerateDraft: () => {},
    onClearBlocked: () => {},
    onToggleLikeMessage: () => {},
    onToggleHideMessage: () => {},
    ...overrides,
  };
}

describe("ConversationListPane states & row content", () => {
  it("renders first-load skeleton, fallback, and keeps rows rendered on background refresh", () => {
    const skeletonHtml = renderToStaticMarkup(
      <ConversationListPane
        {...makeListProps({ isFirstLoad: true, showSkeleton: true })}
      />,
    );
    expect(skeletonHtml).toContain('aria-hidden="true"');
    expect(skeletonHtml).not.toContain("Chưa có bình luận nào");

    expect(renderToStaticMarkup(<InboxListSkeleton />)).toContain('aria-hidden="true"');
    expect(renderToStaticMarkup(<InboxFallback />)).toContain('aria-hidden="true"');

    const loadedHtml = renderToStaticMarkup(
      <ConversationListPane
        {...makeListProps({
          items: [sampleThread()],
          counts: sampleCounts({ needsReply: 1, unread: 1, all: 1 }),
        })}
      />,
    );
    expect(loadedHtml).toContain("Minh Thư");
    expect(loadedHtml).toContain('data-row="inbox-thread"');
  });

  it("renders all list empty states (first-run, filter no-result, all-done) and pending new threads banner", () => {
    const firstRun = renderToStaticMarkup(<ConversationListPane {...makeListProps()} />);
    expect(firstRun).toContain('data-empty-kind="first-run"');
    expect(firstRun).toContain("Chưa có bình luận nào — hệ thống tự đồng bộ mỗi phút");

    const noResult = renderToStaticMarkup(
      <ConversationListPane
        {...makeListProps({
          filter: { ...DEFAULT_INBOX_LIST_FILTER, q: "không thấy" },
        })}
      />,
    );
    expect(noResult).toContain('data-empty-kind="no-result"');
    expect(noResult).toContain("Xoá bộ lọc");

    const done = renderToStaticMarkup(
      <ConversationListPane
        {...makeListProps({
          counts: sampleCounts({ all: 4, needsReply: 0 }),
        })}
      />,
    );
    expect(done).toContain('data-empty-kind="done"');
    expect(done).toContain("Đã trả lời hết");

    const pendingBanner = renderToStaticMarkup(
      <ConversationListPane
        {...makeListProps({
          items: [sampleThread()],
          counts: sampleCounts({ needsReply: 2, all: 2 }),
          pendingNewThreadsCount: 2,
        })}
      />,
    );
    expect(pendingBanner).toContain("Có 2 hội thoại mới");
  });

  it("renders list API error with retry and PERMISSION_MISSING with /channels link (no retry)", () => {
    const serverErrHtml = renderToStaticMarkup(
      <ConversationListPane
        {...makeListProps({
          isError: true,
          error: new ApiError({
            code: "UPSTREAM_ERROR",
            status: 502,
            userMessage: "Máy chủ tạm gián đoạn.",
          }),
        })}
      />,
    );
    expect(serverErrHtml).toContain('role="alert"');
    expect(serverErrHtml).toContain("Thử lại");

    const permErrHtml = renderToStaticMarkup(
      <ConversationListPane
        {...makeListProps({
          isError: true,
          error: new ApiError({
            code: "PERMISSION_MISSING",
            status: 502,
            userMessage: "Thiếu quyền đọc bình luận.",
          }),
        })}
      />,
    );
    expect(permErrHtml).toContain('role="alert"');
    expect(permErrHtml).toContain('href="/channels"');
    expect(permErrHtml).not.toContain("Thử lại");
  });

  it("renders unread, needsReply, Bạn: prefix, fallback name, 2 tags + '+N', AI draft marker, and bulk checkbox", () => {
    const html = renderToStaticMarkup(
      <ConversationListItem
        thread={sampleThread()}
        nowMs={NOW_MS}
        isSelected
        isBulkMode
        isBulkSelected
        onSelect={() => {}}
        onToggleBulkSelect={() => {}}
      />,
    );
    expect(html).toContain('data-unread="true"');
    expect(html).toContain('data-needs-reply="true"');
    expect(html).toContain('data-selected="true"');
    expect(html).toContain("3 tin chưa đọc");
    expect(html).toContain("Cần trả lời");
    expect(html).toContain("Bình luận");
    expect(html).toContain("Có nháp AI");
    expect(html).toContain("VIP");
    expect(html).toContain("Khách cũ");
    expect(html).toContain("+1");
    expect(html).not.toContain("Cần gọi lại");
    expect(html).toContain('type="checkbox"');

    const fallbackAndPageLast = renderToStaticMarkup(
      <ConversationListItem
        thread={sampleThread({
          customer: { id: "", name: null, tags: [] },
          unread: false,
          unreadCount: 0,
          needsReply: false,
          lastMessage: {
            id: "m-page",
            fromPage: true,
            text: "Dạ shop đã inbox ạ",
            createdAt: "2026-11-27T11:45:00.000Z",
          },
        })}
        nowMs={NOW_MS}
        isSelected={false}
        isBulkMode={false}
        isBulkSelected={false}
        onSelect={() => {}}
        onToggleBulkSelect={() => {}}
      />,
    );
    expect(fallbackAndPageLast).toContain("Khách hàng Facebook");
    expect(fallbackAndPageLast).toContain("Bạn: Dạ shop đã inbox ạ");

    const tokenHtml = renderToStaticMarkup(
      <InboxPostJobFilterToken postJobId="job-42" onRemove={() => {}} />,
    );
    expect(tokenHtml).toContain('aria-label="Bỏ Bài đăng: job-42"');
  });
});

describe("ChatThreadPane, ChatHeader, ChatMessageItem, and ChatComposer", () => {
  it("renders chat empty (nothing selected), loading skeleton, not-found, and error states", () => {
    const empty = renderToStaticMarkup(<ChatThreadPane {...makeChatProps()} />);
    expect(empty).toContain("Chọn một hội thoại");

    const loading = renderToStaticMarkup(
      <ChatThreadPane
        {...makeChatProps({
          threadId: "root-1",
          isFirstLoad: true,
          showSkeleton: true,
        })}
      />,
    );
    expect(loading).toContain('aria-hidden="true"');
    expect(renderToStaticMarkup(<InboxChatSkeleton />)).toContain('aria-hidden="true"');

    const notFound = renderToStaticMarkup(
      <ChatThreadPane
        {...makeChatProps({
          threadId: "missing-1",
          isError: true,
          error: new ApiError({
            code: "NOT_FOUND",
            status: 404,
            userMessage: "Không tìm thấy.",
          }),
        })}
      />,
    );
    expect(notFound).toContain("Không tìm thấy hội thoại");

    const error = renderToStaticMarkup(
      <ChatThreadPane
        {...makeChatProps({
          threadId: "root-1",
          isError: true,
          error: new ApiError({
            code: "UPSTREAM_ERROR",
            status: 502,
            userMessage: "Không tải được hội thoại.",
          }),
        })}
      />,
    );
    expect(error).toContain('role="alert"');
    expect(error).toContain("Thử lại");
  });

  it("renders ChatHeader post card safely and degrades unsafe postUrl / postImageUrl", () => {
    const safeHtml = renderToStaticMarkup(
      <ChatHeader
        thread={sampleThread()}
        readOnlyReason={null}
        isTogglingIgnore={false}
        showBackButton
        isCustomerPanelOpen
        onBack={() => {}}
        onIgnore={() => {}}
        onUnignore={() => {}}
        onToggleCustomerPanel={() => {}}
      />,
    );
    expect(safeHtml).toContain("Minh Thư");
    expect(safeHtml).toContain("WorkHardToday");
    expect(safeHtml).toContain("G1");
    expect(safeHtml).toContain("Xem bài trên Facebook");
    expect(safeHtml).toContain('rel="noopener noreferrer"');
    expect(safeHtml).toContain("Quay lại danh sách hội thoại");

    const unsafeHtml = renderToStaticMarkup(
      <ChatHeader
        thread={sampleThread({
          postUrl: "javascript:alert(1)",
          postImageUrl: "javascript:alert(2)",
        })}
        readOnlyReason={null}
        isTogglingIgnore={false}
        showBackButton={false}
        isCustomerPanelOpen={false}
        onIgnore={() => {}}
        onUnignore={() => {}}
        onToggleCustomerPanel={() => {}}
      />,
    );
    expect(unsafeHtml).not.toContain('href="javascript:');
    expect(unsafeHtml).not.toContain('src="javascript:');
  });

  it("renders sender for screen readers, hidden-message note, hover+focus actions, and delivery states", () => {
    const customerHiddenHtml = renderToStaticMarkup(
      <ChatMessageItem
        message={sampleMessage({ isHidden: true, likedByPage: true })}
        channelName="WorkHardToday"
        nowMs={NOW_MS}
        readOnlyReason={null}
        isCoarsePointer={false}
        isLiking={false}
        isHiding={false}
        onToggleLike={() => {}}
        onToggleHide={() => {}}
        onRetrySend={() => {}}
      />,
    );
    expect(customerHiddenHtml).toContain("Khách hàng Minh Thư:");
    expect(customerHiddenHtml).toContain("opacity-60");
    expect(customerHiddenHtml).toContain(INBOX_HIDDEN_MESSAGE_NOTE);
    expect(customerHiddenHtml).toContain("group-hover:opacity-100");
    expect(customerHiddenHtml).toContain("group-focus-within:opacity-100");
    expect(customerHiddenHtml).toContain("Bỏ thích");
    expect(customerHiddenHtml).toContain("Hiện lại");
    expect(customerHiddenHtml).toContain("Xem trên Facebook");

    const pageFailedHtml = renderToStaticMarkup(
      <ChatMessageItem
        message={sampleMessage({
          id: "optimistic:cid-fail",
          fromPage: true,
          fromName: "WorkHardToday",
          text: "Dạ mẫu này còn hàng ạ",
          delivery: "failed",
          userMessage: "Facebook tạm gián đoạn.",
          clientId: "cid-fail",
          permalinkUrl: null,
        })}
        channelName="WorkHardToday"
        nowMs={NOW_MS}
        readOnlyReason={null}
        isCoarsePointer={false}
        isLiking={false}
        isHiding={false}
        onToggleLike={() => {}}
        onToggleHide={() => {}}
        onRetrySend={() => {}}
      />,
    );
    expect(pageFailedHtml).toContain("Trang WorkHardToday (Bạn):");
    expect(pageFailedHtml).toContain("Gửi lỗi");
    expect(pageFailedHtml).toContain("Facebook tạm gián đoạn.");
    expect(pageFailedHtml).toContain("Thử lại");
    expect(pageFailedHtml).toContain('data-client-id="cid-fail"');

    const chatWithUnseen = renderMarkup(
      <ChatThreadPane
        {...makeChatProps({
          threadId: "root-1",
          thread: sampleThread(),
          messages: [sampleMessage()],
          initialUnseenCount: 4,
        })}
      />,
    );
    expect(chatWithUnseen).toContain("Có 4 tin mới");

    // Finding #3: Page's own persisted messages must NOT render Thích/Ẩn buttons,
    // while preserving Xem trên Facebook when permalinkUrl exists.
    const pageSentWithLinkHtml = renderToStaticMarkup(
      <ChatMessageItem
        message={sampleMessage({
          id: "page-reply-1",
          fromPage: true,
          fromId: "123",
          fromName: "WorkHardToday",
          text: "Dạ shop cảm ơn bạn nhé!",
          delivery: "sent",
          permalinkUrl: "https://www.facebook.com/123_1001?comment_id=page-reply-1",
        })}
        channelName="WorkHardToday"
        nowMs={NOW_MS}
        readOnlyReason={null}
        isCoarsePointer={false}
        isLiking={false}
        isHiding={false}
        onToggleLike={() => {}}
        onToggleHide={() => {}}
        onRetrySend={() => {}}
      />,
    );
    expect(pageSentWithLinkHtml).toContain("Xem trên Facebook");
    expect(pageSentWithLinkHtml).not.toContain("Thích bình luận");
    expect(pageSentWithLinkHtml).not.toContain("Bỏ thích bình luận");
    expect(pageSentWithLinkHtml).not.toContain("Ẩn bình luận");
    expect(pageSentWithLinkHtml).not.toContain("Hiện lại bình luận");

    const pageSentNoLinkHtml = renderToStaticMarkup(
      <ChatMessageItem
        message={sampleMessage({
          id: "page-reply-2",
          fromPage: true,
          fromId: "123",
          fromName: "WorkHardToday",
          text: "Đã gửi qua API",
          delivery: "sent",
          permalinkUrl: null,
        })}
        channelName="WorkHardToday"
        nowMs={NOW_MS}
        readOnlyReason={null}
        isCoarsePointer={false}
        isLiking={false}
        isHiding={false}
        onToggleLike={() => {}}
        onToggleHide={() => {}}
        onRetrySend={() => {}}
      />,
    );
    expect(pageSentNoLinkHtml).not.toContain('data-message-actions="true"');
    expect(pageSentNoLinkHtml).not.toContain("Thích");
    expect(pageSentNoLinkHtml).not.toContain("Ẩn bình luận");
  });

  it("derives canComment from thread root payload rather than messages[0] on >50-message threads", () => {
    const failedOutgoingFirst = sampleMessage({
      id: "draft-fail-0",
      threadId: "root-1",
      fromPage: true,
      delivery: "failed",
      canComment: false,
    });
    const level2ReplyFirst = sampleMessage({
      id: "reply-51",
      threadId: "root-1",
      fromPage: false,
      canComment: false,
    });

    // Root omitted from page 0 + messages[0].canComment=false -> stays open (not falsely locked)
    expect(
      resolveThreadCanComment(sampleThread({ id: "root-1" }), [
        failedOutgoingFirst,
        level2ReplyFirst,
      ]),
    ).toBe(true);

    // Explicit thread.canComment=false from thread payload locks composer even when root is omitted
    expect(
      resolveThreadCanComment(sampleThread({ id: "root-1", canComment: false }), [
        sampleMessage({ id: "reply-52", canComment: true }),
      ]),
    ).toBe(false);

    // Explicit thread.canComment=true from thread payload wins over messages[0]
    expect(
      resolveThreadCanComment(sampleThread({ id: "root-1", canComment: true }), [
        failedOutgoingFirst,
      ]),
    ).toBe(true);

    // Root present in messages with canComment=false locks composer when thread.canComment is absent
    expect(
      resolveThreadCanComment(sampleThread({ id: "root-1" }), [
        sampleMessage({ id: "root-1", canComment: false }),
        sampleMessage({ id: "reply-2", canComment: true }),
      ]),
    ).toBe(false);

    const openLongThreadHtml = renderMarkup(
      <ChatThreadPane
        {...makeChatProps({
          threadId: "root-1",
          thread: sampleThread({ id: "root-1" }),
          messages: [failedOutgoingFirst],
        })}
      />,
    );
    expect(openLongThreadHtml).not.toContain("Facebook đã khoá trả lời trên bình luận này.");

    const lockedLongThreadHtml = renderMarkup(
      <ChatThreadPane
        {...makeChatProps({
          threadId: "root-1",
          thread: sampleThread({ id: "root-1", canComment: false }),
          messages: [sampleMessage({ id: "reply-52", canComment: true })],
        })}
      />,
    );
    expect(lockedLongThreadHtml).toContain("Facebook đã khoá trả lời trên bình luận này.");
  });

  it("renders ChatComposer with AI draft prefill, flagged callout, remaining count >=1800, 422 BLOCKED inline aria-invalid/describedby, and read-only lock", () => {
    const flaggedThread = sampleThread({
      draft: {
        id: "d-flag",
        status: "flagged",
        text: "Dạ còn size M ạ",
        aiText: "Dạ còn size M ạ",
        reasons: [{ field: "order", issue: "khách hỏi tình trạng đơn hàng" }],
        warnings: [],
        errorCode: null,
        userMessage: null,
        updatedAt: "2026-11-27T11:31:00.000Z",
      },
    });

    const composerHtml = renderMarkup(
      <ChatComposer
        thread={flaggedThread}
        canComment
        readOnlyReason={null}
        isCoarsePointer={false}
        isNarrowViewport={false}
        isGeneratingDraft={false}
        draftError={null}
        blockedState={{
          seq: 1,
          reasons: ["chứa cụm cấm 'freeship'"],
          rejectedText: "Freeship toàn quốc",
        }}
        initialTextOverride={"a".repeat(1850)}
        onSendReply={() => {}}
        onRegenerateDraft={() => {}}
        onClearBlocked={() => {}}
      />,
    );
    expect(composerHtml).toContain("Trả lời bình luận");
    expect(composerHtml).toContain("Tạo lại nháp AI");
    expect(composerHtml).toContain("AI đánh dấu cần nhân viên kiểm tra");
    expect(composerHtml).toContain("order: khách hỏi tình trạng đơn hàng");
    expect(composerHtml).toContain("Còn 150 ký tự");
    expect(composerHtml).toContain("Nội dung bị chặn: chứa cụm cấm");
    expect(composerHtml).toContain('aria-invalid="true"');
    expect(composerHtml).toContain("aria-describedby=");
    expect(composerHtml).toContain("Enter để gửi");

    const readOnlyHtml = renderMarkup(
      <ChatComposer
        thread={sampleThread()}
        canComment
        readOnlyReason="Chế độ hỗ trợ chỉ được xem."
        isCoarsePointer={false}
        isNarrowViewport={false}
        isGeneratingDraft={false}
        draftError={null}
        blockedState={null}
        onSendReply={() => {}}
        onRegenerateDraft={() => {}}
        onClearBlocked={() => {}}
      />,
    );
    expect(readOnlyHtml).toContain("Chế độ hỗ trợ chỉ được xem.");
    expect(readOnlyHtml).toContain('aria-disabled="true"');

    // Finding #9: Returning to a thread after 422 BLOCKED restores rejectedText on mount
    const returnedBlockedHtml = renderMarkup(
      <ChatComposer
        thread={sampleThread({ draft: null })}
        canComment
        readOnlyReason={null}
        isCoarsePointer={false}
        isNarrowViewport={false}
        isGeneratingDraft={false}
        draftError={null}
        blockedState={{
          seq: 1,
          reasons: ["chứa cụm cấm 'freeship'"],
          rejectedText: "Freeship toàn quốc nhé",
        }}
        onSendReply={() => {}}
        onRegenerateDraft={() => {}}
        onClearBlocked={() => {}}
      />,
    );
    expect(returnedBlockedHtml).toContain("Freeship toàn quốc nhé");
    expect(returnedBlockedHtml).toContain("Nội dung bị chặn: chứa cụm cấm");
    expect(returnedBlockedHtml).not.toContain('data-inbox="blocked-recovery"');

    // Finding #9: When operator already typed newer text, blocked text is preserved in recovery callout without overwriting textarea
    const typedWhileBlockedHtml = renderMarkup(
      <ChatComposer
        thread={sampleThread({ draft: null })}
        canComment
        readOnlyReason={null}
        isCoarsePointer={false}
        isNarrowViewport={false}
        isGeneratingDraft={false}
        draftError={null}
        blockedState={{
          seq: 2,
          reasons: ["chứa cụm cấm 'freeship'"],
          rejectedText: "Freeship toàn quốc",
        }}
        initialTextOverride="Dạ mẫu này còn size M ạ"
        onSendReply={() => {}}
        onRegenerateDraft={() => {}}
        onClearBlocked={() => {}}
      />,
    );
    expect(typedWhileBlockedHtml).toContain("Dạ mẫu này còn size M ạ");
    expect(typedWhileBlockedHtml).toContain('data-inbox="blocked-recovery"');
    expect(typedWhileBlockedHtml).toContain("Freeship toàn quốc");
    expect(typedWhileBlockedHtml).toContain("Khôi phục vào ô nhập");

    // Finding #1 & #17: Open quick-reply menu disables Send and omits duplicate aria-expanded on textarea
    const slashMenuOpenHtml = renderMarkup(
      <ChatComposer
        thread={sampleThread({ draft: null })}
        canComment
        readOnlyReason={null}
        isCoarsePointer={false}
        isNarrowViewport={false}
        isGeneratingDraft={false}
        draftError={null}
        blockedState={null}
        initialTextOverride="/baoga"
        onSendReply={() => {}}
        onRegenerateDraft={() => {}}
        onClearBlocked={() => {}}
      />,
    );
    const textareaTag = slashMenuOpenHtml.match(/<textarea\b[^>]*>/)?.[0] ?? "";
    expect(textareaTag).not.toBe("");
    expect(textareaTag).not.toContain("aria-expanded=");
    expect(slashMenuOpenHtml).toContain('aria-disabled="true"');
  });
});

describe("InboxWorkspaceView responsive layouts & repo invariants", () => {
  it("renders desktop 3-column, tablet 2-column, and mobile 1-column (list vs chat) layouts", () => {
    const thread = sampleThread();
    const listProps = makeListProps({
      items: [thread],
      selectedThreadId: thread.id,
      counts: sampleCounts({ needsReply: 1, unread: 1, all: 1 }),
    });
    const chatProps = makeChatProps({
      threadId: thread.id,
      thread,
      messages: [sampleMessage()],
    });

    const desktopHtml = renderMarkup(
      <InboxWorkspaceView
        layoutMode="desktop"
        selectedThreadId={thread.id}
        activeThread={thread}
        isDesktopCustomerPanelOpen
        isCustomerSheetOpen={false}
        activeModerationPanel={null}
        readOnlyReason={null}
        listProps={listProps}
        chatProps={chatProps}
        onCollapseDesktopCustomerPanel={() => {}}
        onCloseCustomerSheet={() => {}}
        onCloseModerationPanel={() => {}}
      />,
    );
    expect(desktopHtml).toContain('data-inbox-layout="desktop"');
    expect(desktopHtml).toContain("max-h-dvh");
    expect(desktopHtml).toContain("Thông tin khách hàng");
    expect(desktopHtml).toContain('data-row="inbox-thread"');
    expect(desktopHtml).toContain('data-inbox="chat-pane"');

    const tabletHtml = renderMarkup(
      <InboxWorkspaceView
        layoutMode="tablet"
        selectedThreadId={thread.id}
        activeThread={thread}
        isDesktopCustomerPanelOpen={false}
        isCustomerSheetOpen={false}
        activeModerationPanel={null}
        readOnlyReason={null}
        listProps={listProps}
        chatProps={chatProps}
        onCollapseDesktopCustomerPanel={() => {}}
        onCloseCustomerSheet={() => {}}
        onCloseModerationPanel={() => {}}
      />,
    );
    expect(tabletHtml).toContain('data-inbox-layout="tablet"');
    expect(tabletHtml).toContain('data-row="inbox-thread"');
    expect(tabletHtml).toContain('data-inbox="chat-pane"');

    const mobileListHtml = renderMarkup(
      <InboxWorkspaceView
        layoutMode="mobile"
        selectedThreadId={null}
        activeThread={null}
        isDesktopCustomerPanelOpen={false}
        isCustomerSheetOpen={false}
        activeModerationPanel={null}
        readOnlyReason={null}
        listProps={makeListProps({ items: [thread], counts: sampleCounts({ all: 1, needsReply: 1 }) })}
        chatProps={makeChatProps()}
        onCollapseDesktopCustomerPanel={() => {}}
        onCloseCustomerSheet={() => {}}
        onCloseModerationPanel={() => {}}
      />,
    );
    expect(mobileListHtml).toContain('data-inbox-layout="mobile"');
    expect(mobileListHtml).toContain('data-row="inbox-thread"');
    expect(mobileListHtml).not.toContain('data-inbox="chat-pane"');

    const mobileChatHtml = renderMarkup(
      <InboxWorkspaceView
        layoutMode="mobile"
        selectedThreadId={thread.id}
        activeThread={thread}
        isDesktopCustomerPanelOpen={false}
        isCustomerSheetOpen={false}
        activeModerationPanel={null}
        readOnlyReason={null}
        listProps={listProps}
        chatProps={chatProps}
        onCollapseDesktopCustomerPanel={() => {}}
        onCloseCustomerSheet={() => {}}
        onCloseModerationPanel={() => {}}
      />,
    );
    expect(mobileChatHtml).toContain('data-inbox="chat-pane"');
    expect(mobileChatHtml).toContain("Quay lại danh sách hội thoại");
    expect(mobileChatHtml).not.toContain('data-row="inbox-thread"');
  });

  it("enforces Astryx-only hygiene, QuickReplyMenu key order, read-only hook, and nav/JobLogTable integration", () => {
    const inboxDir = join(process.cwd(), "src/ui/components/inbox");
    const tsxFiles = readdirSync(inboxDir).filter((f) => f.endsWith(".tsx"));
    expect(tsxFiles.length).toBeGreaterThanOrEqual(8);

    const inlineStylePattern = new RegExp(["style", "=\\{\\{"].join(""));
    for (const file of tsxFiles) {
      const src = readFileSync(join(inboxDir, file), "utf8");
      expect(src, `${file} must not use inline style objects`).not.toMatch(
        inlineStylePattern,
      );
      expect(src, `${file} must not use raw hex colors`).not.toMatch(
        /#[0-9a-fA-F]{3,8}\b/,
      );
      expect(src, `${file} must not use arbitrary Tailwind values`).not.toMatch(
        /\b(?:w|h|min-w|max-w|min-h|max-h|p|px|py|m|mx|my|text|bg|border|top|bottom|left|right)-\[/,
      );
      expect(src, `${file} must not use raw form elements`).not.toMatch(
        /<(?:button|input|textarea|select)\b/,
      );
    }

    const composerSrc = readFileSync(join(inboxDir, "ChatComposer.tsx"), "utf8");
    const menuCallIdx = composerSrc.indexOf("quickReplyKeyHandlerRef.current?.(");
    const decideCallIdx = composerSrc.indexOf("decideComposerKeyAction(");
    expect(menuCallIdx).toBeGreaterThan(-1);
    expect(decideCallIdx).toBeGreaterThan(menuCallIdx);

    const screenSrc = readFileSync(join(inboxDir, "InboxScreen.tsx"), "utf8");
    expect(screenSrc).toContain("useReadOnlyReason()");

    const monitoring = NAV_SECTIONS.find((section) => section.title === "Theo dõi");
    expect(monitoring?.items).toContainEqual({ href: "/comments", label: "Bình luận" });
    expect(NAV_ICONS["/comments"]).toBeDefined();

    const baseJob: PostJobLogEntry = {
      postJobId: "job-pub-1",
      batchId: "batch-1",
      productCode: "G1",
      productOrigin: "sheet",
      color: "Đen",
      channelId: "fb-123",
      format: "image_post",
      status: "published",
      attemptCount: 1,
      lastErrorCode: null,
      userMessage: "Đã đăng thành công.",
      publishedPostId: "123_1001",
      publishedUrl: "https://www.facebook.com/123_1001",
      publishedAt: "2026-11-27T09:00:00.000Z",
      scheduledAt: null,
      createdAt: "2026-11-27T08:00:00.000Z",
      updatedAt: "2026-11-27T09:00:00.000Z",
      canRetry: false,
    };
    const jobHtml = renderToStaticMarkup(
      <JobLogTable items={[baseJob]} onRetry={() => {}} retryingJobId={null} />,
    );
    expect(jobHtml).toContain('href="/comments?postJobId=job-pub-1"');

    const jobTableSrc = readFileSync(
      join(process.cwd(), "src/ui/components/jobs/JobLogTable.tsx"),
      "utf8",
    );
    expect(jobTableSrc).toContain("@/ui/components/inbox/inbox-filters");
    expect(jobTableSrc).not.toContain("comment-filters");
  });

  it("enforces screen-pass design contracts (hashed avatar tones, scrollable chip rail, bubble distinction, icon tile empty state, token-only CSS)", () => {
    // Deterministic customer avatar accent tone hash
    const toneA = resolveCustomerAvatarTone("psid-1", "Minh Thư");
    const toneARepeat = resolveCustomerAvatarTone("psid-1", "Different Name");
    expect(INBOX_AVATAR_TONES).toContain(toneA);
    expect(toneA).toBe(toneARepeat);

    // Conversation list renders single scrollable chip rail and colored avatar tone
    const listHtml = renderToStaticMarkup(
      <ConversationListPane
        {...makeListProps({
          items: [sampleThread()],
          selectedThreadId: "root-1",
          counts: sampleCounts({ needsReply: 1, unread: 1, all: 2 }),
        })}
      />,
    );
    expect(listHtml).toContain('data-inbox="filter-chips"');
    expect(listHtml).toContain("inbox-chip-scroller");
    expect(listHtml).toContain(`data-avatar-tone="${toneA}"`);
    expect(listHtml).toContain("inbox-thread-item");

    // Empty chat state renders accent icon tile + sentence
    const emptyChatHtml = renderToStaticMarkup(<ChatThreadPane {...makeChatProps()} />);
    expect(emptyChatHtml).toContain("inbox-empty-icon-tile");
    expect(emptyChatHtml).toContain("Chọn một hội thoại");

    // Customer and Page bubbles get distinct surface/tail classes and 12px tertiary meta
    const customerMsgHtml = renderToStaticMarkup(
      <ChatMessageItem
        message={sampleMessage({ fromPage: false })}
        channelName="WorkHardToday"
        nowMs={NOW_MS}
        readOnlyReason={null}
        isCoarsePointer={false}
        isLiking={false}
        isHiding={false}
        onToggleLike={() => {}}
        onToggleHide={() => {}}
        onRetrySend={() => {}}
      />,
    );
    expect(customerMsgHtml).toContain("inbox-bubble-customer");
    expect(customerMsgHtml).toContain("inbox-meta-text");

    const pageMsgHtml = renderToStaticMarkup(
      <ChatMessageItem
        message={sampleMessage({ fromPage: true, id: "page-1" })}
        channelName="WorkHardToday"
        nowMs={NOW_MS}
        readOnlyReason={null}
        isCoarsePointer={false}
        isLiking={false}
        isHiding={false}
        onToggleLike={() => {}}
        onToggleHide={() => {}}
        onRetrySend={() => {}}
      />,
    );
    expect(pageMsgHtml).toContain("inbox-bubble-page");

    // Post card uses unified card class; ChatHeader does not use Slash icon
    const headerHtml = renderToStaticMarkup(
      <ChatHeader
        thread={sampleThread()}
        readOnlyReason={null}
        isTogglingIgnore={false}
        showBackButton={false}
        isCustomerPanelOpen
        onIgnore={() => {}}
        onUnignore={() => {}}
        onToggleCustomerPanel={() => {}}
      />,
    );
    expect(headerHtml).toContain("inbox-post-card");
    expect(headerHtml).toContain(`data-avatar-tone="${toneA}"`);

    const inboxDir = join(process.cwd(), "src/ui/components/inbox");
    const headerSrc = readFileSync(join(inboxDir, "ChatHeader.tsx"), "utf8");
    expect(headerSrc).not.toContain("Slash");

    // Token-only CSS hygiene on inbox-surface.css
    const cssSrc = readFileSync(join(inboxDir, "inbox-surface.css"), "utf8");
    expect(cssSrc).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(cssSrc).not.toMatch(/rgb\(|rgba\(|hsl\(|oklch\(/);
  });
});
