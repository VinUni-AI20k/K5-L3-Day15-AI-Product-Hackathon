import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  buildAutoReplyUpdatePayload,
  evaluateAutoReplySaveGate,
  isAutoReplyDraftDirty,
  settingToAutoReplyDraft,
  validateAutoReplyDraft,
} from "@/ui/components/inbox/auto-reply-state";
import { AutoReplyLogView } from "@/ui/components/inbox/AutoReplyLogPanel";
import { AutoReplySettingsView } from "@/ui/components/inbox/AutoReplySettingsPanel";
import { ChatComposer } from "@/ui/components/inbox/ChatComposer";
import { ChatMessageItem } from "@/ui/components/inbox/ChatMessageItem";
import {
  ChatThreadPane,
  type ChatThreadPaneProps,
} from "@/ui/components/inbox/ChatThreadPane";
import { ConversationListItem } from "@/ui/components/inbox/ConversationListItem";
import {
  ConversationListPane,
  type ConversationListPaneProps,
} from "@/ui/components/inbox/ConversationListPane";
import {
  DEFAULT_INBOX_LIST_FILTER,
  EMPTY_INBOX_COUNTS,
  INBOX_FILTER_CHIPS,
} from "@/ui/components/inbox/inbox-filters";
import { reconcileVisibleThreads } from "@/ui/components/inbox/inbox-scroll-state";
import { InboxAutoReplyDialog } from "@/ui/components/inbox/InboxAutoReplyDialog";
import {
  DEFAULT_AUTO_REPLY_LOG_FILTER,
  type AutoReplyLogEntry,
  type AutoReplySetting,
} from "@/ui/schemas/auto-reply.schema";
import type { InboxMessage, InboxThread } from "@/ui/schemas/inbox.schema";
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
    postImageUrl: null,
    customer: { id: "psid-1", name: "Minh Thư", tags: [] },
    lastMessage: {
      id: "msg-1",
      fromPage: false,
      text: "Mẫu này ship về Đà Nẵng hết bao nhiêu?",
      createdAt: "2026-11-27T11:30:00.000Z",
    },
    needsReply: true,
    unread: true,
    unreadCount: 1,
    status: "open",
    isHidden: false,
    messageCount: 2,
    hasPhone: false,
    draft: null,
    moderation: null,
    attention: null,
    autoReply: null,
    agentRun: null,
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
    text: "Mẫu này giá bao nhiêu ạ?",
    createdAt: "2026-11-27T11:30:00.000Z",
    permalinkUrl: null,
    isHidden: false,
    canComment: true,
    likedByPage: false,
    delivery: "sent",
    errorCode: null,
    userMessage: null,
    clientId: null,
    moderation: null,
    sentBy: null,
    agentRunId: null,
    ...overrides,
  };
}

function sampleSetting(overrides: Partial<AutoReplySetting> = {}): AutoReplySetting {
  return {
    pageId: "123",
    channelId: "fb-123",
    pageName: "WorkHardToday",
    enabled: false,
    mode: "dry_run",
    intents: ["price", "size", "color"],
    hourlyCap: 30,
    dailyCap: 200,
    updatedAt: null,
    ...overrides,
  };
}

function makeListProps(
  overrides: Partial<ConversationListPaneProps> = {},
): ConversationListPaneProps {
  return {
    filter: DEFAULT_INBOX_LIST_FILTER,
    counts: { ...EMPTY_INBOX_COUNTS },
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
    isAutoReplyDialogOpen: false,
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
    onOpenAutoReplyDialog: () => {},
    ...overrides,
  };
}

function makeChatProps(
  overrides: Partial<ChatThreadPaneProps> = {},
): ChatThreadPaneProps {
  return {
    threadId: "root-1",
    thread: sampleThread(),
    messages: [sampleMessage()],
    nowMs: NOW_MS,
    readOnlyReason: null,
    isCoarsePointer: false,
    isNarrowViewport: false,
    showBackButton: false,
    isCustomerPanelOpen: false,
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
    isClearingAttention: false,
    clearAttentionError: null,
    likingMessageId: null,
    hidingMessageId: null,
    messageErrorById: {},
    lastOwnSendSeq: 0,
    onRetryThread: () => {},
    onLoadOlder: () => {},
    onIgnoreThread: () => {},
    onUnignoreThread: () => {},
    onToggleCustomerPanel: () => {},
    onSendReply: () => {},
    onRetrySendMessage: () => {},
    onRegenerateDraft: () => {},
    onClearBlocked: () => {},
    onClearAttention: () => {},
    onToggleLikeMessage: () => {},
    onToggleHideMessage: () => {},
    ...overrides,
  };
}

describe("Conversation list & chat 'Cần bạn' + auto-reply rendering", () => {
  it("renders 'Cần bạn' filter chip FIRST in the chip row with its count and toolbar button", () => {
    expect(INBOX_FILTER_CHIPS[0]).toBe("can_ban");

    const html = renderToStaticMarkup(
      <ConversationListPane
        {...makeListProps({
          counts: { ...EMPTY_INBOX_COUNTS, canBan: 7, needsReply: 3, all: 10 },
          items: [
            sampleThread({
              attention: {
                tag: "can_ban",
                reason: "khách hỏi phí ship",
                since: "2026-11-27T11:30:00.000Z",
              },
            }),
          ],
        })}
      />,
    );

    const chipsSection = html.slice(html.indexOf('data-inbox="filter-chips"'));
    const canBanIdx = chipsSection.indexOf("Cần bạn");
    const needsReplyIdx = chipsSection.indexOf("Cần trả lời");
    expect(canBanIdx).toBeGreaterThan(-1);
    expect(needsReplyIdx).toBeGreaterThan(canBanIdx);
    expect(chipsSection).toContain(">7<");
    expect(html).toContain('aria-label="Tự động trả lời"');
  });

  it("renders 'Cần bạn' badge highest priority on row with keyboard & screen-reader accessible reason", () => {
    const html = renderToStaticMarkup(
      <ConversationListItem
        thread={sampleThread({
          needsReply: true,
          attention: {
            tag: "can_ban",
            reason: "hết hàng size M",
            since: "2026-11-27T11:30:00.000Z",
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

    expect(html).toContain('data-attention="can_ban"');
    expect(html).toContain('data-attention-badge="can_ban"');
    expect(html).toContain('title="Cần bạn: hết hàng size M"');
    expect(html).toContain("aria-describedby=");
    expect(html).toContain("Cần bạn: hết hàng size M");
    // "Cần bạn" badge precedes "Cần trả lời" token
    expect(html.indexOf('data-attention-badge="can_ban"')).toBeLessThan(
      html.indexOf("Cần trả lời"),
    );

    const noAttentionHtml = renderToStaticMarkup(
      <ConversationListItem
        thread={sampleThread({ attention: null })}
        nowMs={NOW_MS}
        isSelected={false}
        isBulkMode={false}
        isBulkSelected={false}
        onSelect={() => {}}
        onToggleBulkSelect={() => {}}
      />,
    );
    expect(noAttentionHtml).toContain('data-attention="none"');
    expect(noAttentionHtml).not.toContain('data-attention-badge="can_ban"');
  });

  it("never re-sorts visible rows under pointer when server floats a newly tagged 'Cần bạn' thread", () => {
    const t1 = sampleThread({ id: "t1", updatedAt: "2026-11-27T11:00:00+07:00" });
    const t2 = sampleThread({ id: "t2", updatedAt: "2026-11-27T10:30:00+07:00" });
    const t3 = sampleThread({ id: "t3", updatedAt: "2026-11-27T10:00:00+07:00" });

    // Server tags t3 as can_ban and floats it to index 0 (even though updatedAt is older than t1)
    const t3Tagged = sampleThread({
      id: "t3",
      updatedAt: "2026-11-27T10:00:00+07:00",
      attention: {
        tag: "can_ban",
        reason: "khách hỏi ship",
        since: "2026-11-27T11:05:00+07:00",
      },
    });

    // While scrolled down: rows stay pinned [t1, t2, t3] (t3 updated in place), pendingNewCount = 1
    const scrolled = reconcileVisibleThreads({
      currentVisible: [t1, t2, t3],
      latestFromServer: [t3Tagged, t1, t2],
      isListScrolled: true,
    });
    expect(scrolled.visible.map((t) => t.id)).toEqual(["t1", "t2", "t3"]);
    expect(scrolled.visible[2].attention?.tag).toBe("can_ban");
    expect(scrolled.pendingNewCount).toBe(1);

    // At top of list: adopts exact server order [t3, t1, t2]
    const atTop = reconcileVisibleThreads({
      currentVisible: [t1, t2, t3],
      latestFromServer: [t3Tagged, t1, t2],
      isListScrolled: false,
    });
    expect(atTop.visible.map((t) => t.id)).toEqual(["t3", "t1", "t2"]);
    expect(atTop.pendingNewCount).toBe(0);
  });

  it("renders 'Cần bạn: {reason}' banner above composer with 'Đã xử lý' and disables it when read-only", () => {
    const taggedThread = sampleThread({
      attention: {
        tag: "can_ban",
        reason: "khách hỏi phí ship",
        since: "2026-11-27T11:30:00.000Z",
      },
    });

    const activeHtml = renderMarkup(
      <ChatComposer
        thread={taggedThread}
        canComment
        readOnlyReason={null}
        isCoarsePointer={false}
        isNarrowViewport={false}
        isGeneratingDraft={false}
        draftError={null}
        blockedState={null}
        onSendReply={() => {}}
        onRegenerateDraft={() => {}}
        onClearBlocked={() => {}}
        onClearAttention={() => {}}
      />,
    );
    expect(activeHtml).toContain('data-inbox="attention-banner"');
    expect(activeHtml).toContain("Cần bạn: khách hỏi phí ship");
    expect(activeHtml).toContain("Đã xử lý");
    // Banner appears before the textarea
    expect(activeHtml.indexOf('data-inbox="attention-banner"')).toBeLessThan(
      activeHtml.indexOf("<textarea"),
    );

    const readOnlyHtml = renderMarkup(
      <ChatComposer
        thread={taggedThread}
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
        onClearAttention={() => {}}
      />,
    );
    const clearButtonMatch = readOnlyHtml.match(
      /<button\b[^>]*>(?:(?!<\/button>)[\s\S])*?Đã xử lý[\s\S]*?<\/button>/,
    );
    expect(clearButtonMatch?.[0] ?? "").toMatch(/aria-disabled="true"|disabled(?:=""|\b)/);

    const errorHtml = renderMarkup(
      <ChatComposer
        thread={taggedThread}
        canComment
        readOnlyReason={null}
        isCoarsePointer={false}
        isNarrowViewport={false}
        isGeneratingDraft={false}
        draftError={null}
        blockedState={null}
        clearAttentionError={
          new ApiError({
            code: "UPSTREAM_ERROR",
            status: 502,
            userMessage: "Không thể kết nối máy chủ.",
          })
        }
        onSendReply={() => {}}
        onRegenerateDraft={() => {}}
        onClearBlocked={() => {}}
        onClearAttention={() => {}}
      />,
    );
    expect(errorHtml).toContain("Không thể gỡ nhãn Cần bạn");
    expect(errorHtml).toContain("Thử lại");
  });

  it("shows 'Tự động trả lời' label only on auto-sent Page bubbles and renders dry-run card for would_send", () => {
    const autoPageHtml = renderToStaticMarkup(
      <ChatMessageItem
        message={sampleMessage({
          id: "auto-1",
          fromPage: true,
          fromId: "123",
          fromName: "WorkHardToday",
          text: "Dạ mẫu G1 giá 890.000đ chị nhé.",
          sentBy: "auto",
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
    expect(autoPageHtml).toContain("Tự động trả lời");
    expect(autoPageHtml).toContain('data-message-sent-by="auto"');
    expect(autoPageHtml).toContain("Trang WorkHardToday (Tự động trả lời):");

    const manualPageHtml = renderToStaticMarkup(
      <ChatMessageItem
        message={sampleMessage({
          id: "op-1",
          fromPage: true,
          fromId: "123",
          fromName: "WorkHardToday",
          text: "Dạ shop đã inbox ạ",
          sentBy: "operator",
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
    expect(manualPageHtml).not.toContain('data-message-auto-reply="true"');
    expect(manualPageHtml).toContain("Trang WorkHardToday (Bạn):");

    // Dry-run card shown when autoReply.lastAction === "would_send"
    const dryRunChatHtml = renderMarkup(
      <ChatThreadPane
        {...makeChatProps({
          thread: sampleThread({
            autoReply: {
              lastAction: "would_send",
              text: "Dạ mẫu G1 giá 890.000đ chị nhé.",
              reason: null,
              at: "2026-11-27T11:31:00.000Z",
            },
          }),
        })}
      />,
    );
    expect(dryRunChatHtml).toContain('data-inbox="auto-reply-dry-run"');
    expect(dryRunChatHtml).toContain("Sẽ tự trả lời (chạy thử):");
    expect(dryRunChatHtml).toContain("Dạ mẫu G1 giá 890.000đ chị nhé.");

    // No dry-run card when lastAction is "sent" or null
    const sentChatHtml = renderMarkup(
      <ChatThreadPane
        {...makeChatProps({
          thread: sampleThread({
            autoReply: {
              lastAction: "sent",
              text: "Dạ mẫu G1 giá 890.000đ chị nhé.",
              reason: null,
              at: "2026-11-27T11:31:00.000Z",
            },
          }),
        })}
      />,
    );
    expect(sentChatHtml).not.toContain('data-inbox="auto-reply-dry-run"');
  });
});

describe("Auto-reply settings state, always-live payload, intents/caps validation, read-only, and log", () => {
  it("always builds live/active update payloads and ignores legacy enabled/mode for dirty tracking", () => {
    const legacyOffDry = sampleSetting({ enabled: false, mode: "dry_run" });
    const minimalSetting = sampleSetting({ enabled: undefined, mode: undefined });

    const draft = settingToAutoReplyDraft(legacyOffDry);
    expect(isAutoReplyDraftDirty(legacyOffDry, draft)).toBe(false);
    expect(isAutoReplyDraftDirty(minimalSetting, draft)).toBe(false);
    expect(isAutoReplyDraftDirty(legacyOffDry, { ...draft, hourlyCap: 45 })).toBe(true);

    const payload = buildAutoReplyUpdatePayload({
      intents: ["color", "price"],
      hourlyCap: 45,
      dailyCap: 300,
    });
    expect(payload).toEqual({
      enabled: true,
      mode: "live",
      intents: ["price", "color"],
      hourlyCap: 45,
      dailyCap: 300,
      confirmLive: true,
    });
  });

  it("validates intents (always non-empty) and hourly/daily caps and gates saving", () => {
    const base = sampleSetting({ enabled: undefined, mode: undefined });

    // Zero intents -> always invalid & blocks save
    const emptyIntentsDraft = {
      ...settingToAutoReplyDraft(base),
      intents: [] as const,
    };
    const emptyIntentsVal = validateAutoReplyDraft(emptyIntentsDraft);
    expect(emptyIntentsVal.isValid).toBe(false);
    expect(emptyIntentsVal.intentsError).toContain("Giá, Size, Màu");
    const emptyIntentsGate = evaluateAutoReplySaveGate({
      isDirty: isAutoReplyDraftDirty(base, emptyIntentsDraft),
      isSaving: false,
      readOnlyReason: null,
      validation: emptyIntentsVal,
    });
    expect(emptyIntentsGate.canSave).toBe(false);
    expect(emptyIntentsGate.saveDisabledReason).toContain("Giá, Size, Màu");

    // Out-of-range hourly / daily caps -> invalid
    const badHourly = validateAutoReplyDraft({
      ...settingToAutoReplyDraft(base),
      hourlyCap: 201,
    });
    expect(badHourly.isValid).toBe(false);
    expect(badHourly.hourlyCapError).toContain("1 đến 200");

    const nullHourly = validateAutoReplyDraft({
      ...settingToAutoReplyDraft(base),
      hourlyCap: null,
    });
    expect(nullHourly.isValid).toBe(false);

    const badDaily = validateAutoReplyDraft({
      ...settingToAutoReplyDraft(base),
      dailyCap: 0,
    });
    expect(badDaily.isValid).toBe(false);
    expect(badDaily.dailyCapError).toContain("1 đến 2.000");

    // Hourly > daily produces a warning without blocking valid spec range
    const mismatch = validateAutoReplyDraft({
      ...settingToAutoReplyDraft(base),
      hourlyCap: 100,
      dailyCap: 50,
    });
    expect(mismatch.isValid).toBe(true);
    expect(mismatch.capMismatchWarning).toContain("lớn hơn giới hạn theo ngày");

    // Read-only disables editing, saving, and resetting with reason
    const readOnlyGate = evaluateAutoReplySaveGate({
      isDirty: true,
      isSaving: false,
      readOnlyReason: "Phiên hỗ trợ chỉ đọc.",
      validation: validateAutoReplyDraft(settingToAutoReplyDraft(base)),
    });
    expect(readOnlyGate.canEdit).toBe(false);
    expect(readOnlyGate.canSave).toBe(false);
    expect(readOnlyGate.canReset).toBe(false);
    expect(readOnlyGate.editDisabledReason).toBe("Phiên hỗ trợ chỉ đọc.");
  });

  it("shows always-live status without enable/mode switches or confirm dialog, keeps intents/caps/validation/read-only and dialog tabs", () => {
    // Even if server returns legacy enabled=false & mode=dry_run, display ignores them and shows "Đang bật · chạy thật"
    const html = renderMarkup(
      <AutoReplySettingsView
        isFirstLoad={false}
        showSkeleton={false}
        isError={false}
        error={null}
        items={[sampleSetting({ enabled: false, mode: "dry_run" })]}
        readOnlyReason={null}
        savingPageId={null}
        saveErrorByPageId={{}}
        savedMessageByPageId={{}}
        initialDraftOverrides={{
          "123": { intents: [] },
        }}
        onRetry={() => {}}
        onSave={() => {}}
        onOpenLog={() => {}}
      />,
    );

    expect(html).toContain("WorkHardToday");
    expect(html).toContain("Đang bật · chạy thật");
    expect(html).toContain('data-auto-reply-status="active"');
    expect(html).toContain("Nhật ký tự trả lời");
    expect(html).toContain("Xem nhật ký tự trả lời");
    expect(html).toContain("Giá");
    expect(html).toContain("Size");
    expect(html).toContain("Màu");
    expect(html).toContain('data-auto-reply-validation="intents"');

    // Removed controls must never appear
    expect(html).not.toContain('role="switch"');
    expect(html).not.toContain('type="radio"');
    expect(html).not.toContain('role="alertdialog"');
    expect(html).not.toContain("Bật tự động trả lời bình luận mới");
    expect(html).not.toContain("Chế độ hoạt động");
    expect(html).not.toContain("Chạy thử");
    expect(html).not.toContain("Đang tắt");
    expect(html).not.toContain("Xác nhận bật Chạy thật");

    // Read-only disables all settings controls and surfaces reason
    const readOnlyHtml = renderMarkup(
      <AutoReplySettingsView
        isFirstLoad={false}
        showSkeleton={false}
        isError={false}
        error={null}
        items={[sampleSetting({ enabled: undefined, mode: undefined })]}
        readOnlyReason="Chế độ hỗ trợ chỉ được xem."
        savingPageId={null}
        saveErrorByPageId={{}}
        savedMessageByPageId={{}}
        onRetry={() => {}}
        onSave={() => {}}
      />,
    );
    expect(readOnlyHtml).toContain("Đang bật · chạy thật");
    expect(readOnlyHtml).toContain("Chế độ hỗ trợ chỉ được xem.");
    expect(readOnlyHtml).toContain('aria-disabled="true"');

    // Dialog shell renders header & tabs without dry-run copy
    const dialogHtml = renderMarkup(
      <InboxAutoReplyDialog
        isOpen
        readOnlyReason={null}
        settingsContent={<div>settings-slot</div>}
        logContent={<div>log-slot</div>}
        onClose={() => {}}
      />,
    );
    expect(dialogHtml).toContain("Tự động trả lời");
    expect(dialogHtml).toContain("Đang bật · chạy thật".toLowerCase());
    expect(dialogHtml).toContain("Cài đặt theo Fanpage");
    expect(dialogHtml).toContain("Nhật ký tự trả lời");
    expect(dialogHtml).toContain("settings-slot");
    expect(dialogHtml).not.toContain("Chạy thử");
  });

  it("renders auto-reply log view with Page/Action filters, badges, intents, and empty states", () => {
    const entries: AutoReplyLogEntry[] = [
      {
        id: "log-1",
        pageId: "123",
        threadId: "root-1",
        commentId: "c-1",
        intents: ["price", "size"],
        action: "would_send",
        reason: null,
        text: "Dạ mẫu G1 giá 890.000đ, còn size S, M ạ.",
        createdAt: "2026-11-27T11:20:00.000Z",
      },
      {
        id: "log-2",
        pageId: "123",
        threadId: "root-2",
        commentId: "c-2",
        intents: [],
        action: "skipped",
        reason: "vượt trần tự trả lời",
        text: null,
        createdAt: "2026-11-27T11:25:00.000Z",
      },
    ];

    const populatedHtml = renderMarkup(
      <AutoReplyLogView
        isFirstLoad={false}
        showSkeleton={false}
        isFetching={false}
        isError={false}
        error={null}
        items={entries}
        filter={{ pageId: "123", action: "would_send" }}
        nowMs={NOW_MS}
        hasNextPage
        isFetchingNextPage={false}
        pageNameById={{ "123": "WorkHardToday" }}
        onFilterChange={() => {}}
        onClearFilters={() => {}}
        onRefresh={() => {}}
        onLoadMore={() => {}}
      />,
    );
    expect(populatedHtml).toContain("Nhật ký tự động trả lời");
    expect(populatedHtml).toContain("Lọc theo Fanpage");
    expect(populatedHtml).toContain("Lọc theo hành động");
    expect(populatedHtml).toContain("Sẽ gửi (chạy thử)");
    expect(populatedHtml).toContain("Dạ mẫu G1 giá 890.000đ, còn size S, M ạ.");
    expect(populatedHtml).toContain("vượt trần tự trả lời");
    expect(populatedHtml).toContain("Xoá bộ lọc");
    expect(populatedHtml).toContain("Tải thêm nhật ký");

    const emptyHtml = renderMarkup(
      <AutoReplyLogView
        isFirstLoad={false}
        showSkeleton={false}
        isFetching={false}
        isError={false}
        error={null}
        items={[]}
        filter={DEFAULT_AUTO_REPLY_LOG_FILTER}
        nowMs={NOW_MS}
        hasNextPage={false}
        isFetchingNextPage={false}
        onFilterChange={() => {}}
        onClearFilters={() => {}}
        onRefresh={() => {}}
        onLoadMore={() => {}}
      />,
    );
    expect(emptyHtml).toContain("Chưa có nhật ký tự động trả lời");
  });
});
