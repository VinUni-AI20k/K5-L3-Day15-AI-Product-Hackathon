import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  extractTraceMeasurements,
  formatTraceMeasurementTokens,
} from "@/ui/components/inbox/agent-run-state";
import { AgentRunTrace } from "@/ui/components/inbox/AgentRunTrace";
import {
  AWAITING_MEASUREMENTS_BADGE_LABEL,
  formatAwaitingMeasurementsTooltip,
  resolveAwaitingMeasurements,
  sanitizeAutoReplyIntents,
} from "@/ui/components/inbox/auto-reply-state";
import { AutoReplyLogView } from "@/ui/components/inbox/AutoReplyLogPanel";
import { AutoReplySettingsView } from "@/ui/components/inbox/AutoReplySettingsPanel";
import { ChatHeader } from "@/ui/components/inbox/ChatHeader";
import { ConversationListItem } from "@/ui/components/inbox/ConversationListItem";
import {
  AUTO_REPLY_DEFAULT_INTENTS,
  AUTO_REPLY_INTENTS,
  AutoReplySettingSchema,
  DEFAULT_AUTO_REPLY_LOG_FILTER,
  type AutoReplyLogEntry,
  type AutoReplySetting,
} from "@/ui/schemas/auto-reply.schema";
import {
  AgentRunSchema,
  InboxThreadSchema,
  type AgentRun,
  type InboxThread,
} from "@/ui/schemas/inbox.schema";
import { updateAutoReplySetting } from "@/ui/services/auto-reply.api";

const NOW_MS = new Date("2026-11-28T12:00:00.000Z").getTime();

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
    id: "root-size-1",
    channelId: "fb-123",
    channelName: "WorkHardToday",
    pageId: "123",
    postJobId: "job-1",
    productCode: "V102",
    postCaption: "Váy linen dáng A mã V102",
    postUrl: "https://www.facebook.com/123_1001",
    postImageUrl: null,
    customer: { id: "psid-1", name: "Ngọc Anh", tags: [] },
    lastMessage: {
      id: "msg-1",
      fromPage: false,
      text: "Shop ơi tư vấn size giúp em mẫu này với",
      createdAt: "2026-11-28T11:30:00.000Z",
    },
    needsReply: false,
    unread: false,
    unreadCount: 0,
    status: "open",
    isHidden: false,
    messageCount: 2,
    hasPhone: false,
    draft: null,
    moderation: null,
    attention: null,
    autoReply: null,
    agentRun: null,
    updatedAt: "2026-11-28T11:31:00.000Z",
    ...overrides,
  };
}

function sampleSetting(overrides: Partial<AutoReplySetting> = {}): AutoReplySetting {
  return {
    pageId: "123",
    channelId: "fb-123",
    pageName: "WorkHardToday",
    enabled: true,
    mode: "dry_run",
    intents: [...AUTO_REPLY_DEFAULT_INTENTS],
    hourlyCap: 30,
    dailyCap: 200,
    updatedAt: null,
    ...overrides,
  };
}

function sampleSizeAdviceRun(overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    id: "run-size-1",
    threadId: "root-size-1",
    commentId: "msg-2",
    kind: "auto_reply",
    status: "done",
    outcome: "sent",
    steps: [
      {
        key: "read",
        label: "Đọc bình luận",
        status: "ok",
        detail: "1m60 50kg ạ",
        at: "2026-11-28T11:35:01+07:00",
      },
      {
        key: "measurements",
        label: "Đọc số đo khách hàng",
        status: "ok",
        detail: "Chiều cao 160 cm, cân nặng 50 kg",
        at: "2026-11-28T11:35:02+07:00",
      },
      {
        key: "size_chart",
        label: "Đối chiếu bảng size",
        status: "ok",
        detail: "Khớp dòng M (46–52 kg, 150–160 cm) — còn hàng size M",
        at: "2026-11-28T11:35:03+07:00",
      },
      {
        key: "action",
        label: "Gửi trả lời",
        status: "ok",
        detail: "Đã gửi tư vấn size M",
        at: "2026-11-28T11:35:04+07:00",
      },
    ],
    startedAt: "2026-11-28T11:35:00+07:00",
    finishedAt: "2026-11-28T11:35:04+07:00",
    ...overrides,
  };
}

describe("auto-reply size_advice opt-in setting and UI", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("keeps size_advice opt-in by default, supports saving it via PUT, and renders the checkbox + log token", async () => {
    expect(AUTO_REPLY_INTENTS).toContain("size_advice");
    expect(AUTO_REPLY_DEFAULT_INTENTS).not.toContain("size_advice");

    const parsedDefault = AutoReplySettingSchema.parse({
      pageId: "123",
      channelId: "fb-123",
      pageName: "WorkHardToday",
    });
    expect(parsedDefault.intents).toEqual(["price", "size", "color"]);

    expect(sanitizeAutoReplyIntents(["size_advice", "price", "unknown"])).toEqual([
      "price",
      "size_advice",
    ]);

    const fetchSpy = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(
          JSON.stringify({
            tenantId: "t-1",
            setting: sampleSetting({ intents: ["price", "size", "color", "size_advice"] }),
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    );
    vi.stubGlobal("fetch", fetchSpy);

    const saved = await updateAutoReplySetting("123", {
      enabled: true,
      mode: "dry_run",
      intents: ["size_advice", "price"],
      hourlyCap: 30,
      dailyCap: 200,
    });
    expect(saved.setting.intents).toContain("size_advice");
    expect(JSON.parse(String(fetchSpy.mock.calls[0]?.[1]?.body ?? "{}"))).toEqual({
      enabled: true,
      mode: "dry_run",
      intents: ["price", "size_advice"],
      hourlyCap: 30,
      dailyCap: 200,
    });

    // Settings panel shows checkbox "Tư vấn size (hỏi chiều cao, cân nặng)" and link to /writing-style
    const settingsHtml = renderMarkup(
      <AutoReplySettingsView
        isFirstLoad={false}
        showSkeleton={false}
        isError={false}
        error={null}
        items={[sampleSetting()]}
        readOnlyReason={null}
        savingPageId={null}
        saveErrorByPageId={{}}
        savedMessageByPageId={{}}
        onRetry={() => {}}
        onSave={() => {}}
      />,
    );
    expect(settingsHtml).toContain("Tư vấn size (hỏi chiều cao, cân nặng)");
    expect(settingsHtml).toContain('href="/writing-style"');

    // Log panel displays "Tư vấn size" intent token
    const logEntries: AutoReplyLogEntry[] = [
      {
        id: "log-sa-1",
        pageId: "123",
        threadId: "root-size-1",
        commentId: "msg-2",
        intents: ["size_advice"],
        action: "sent",
        reason: null,
        text: "Dạ với chiều cao 1m60 và cân nặng 50kg, chị mặc size M là vừa ạ.",
        createdAt: "2026-11-28T11:35:04.000Z",
      },
    ];
    const logHtml = renderMarkup(
      <AutoReplyLogView
        isFirstLoad={false}
        showSkeleton={false}
        isFetching={false}
        isError={false}
        error={null}
        items={logEntries}
        filter={DEFAULT_AUTO_REPLY_LOG_FILTER}
        nowMs={NOW_MS}
        hasNextPage={false}
        isFetchingNextPage={false}
        pageNameById={{ "123": "WorkHardToday" }}
        onFilterChange={() => {}}
        onClearFilters={() => {}}
        onRefresh={() => {}}
        onLoadMore={() => {}}
      />,
    );
    expect(logHtml).toContain("Tư vấn size");
  });
});

describe("'Đang chờ số đo' badge on conversation row and chat header", () => {
  it("parses optional awaiting_measurements shapes from backend and handles expiry cleanly", () => {
    const baseJson = {
      id: "root-size-1",
      channelId: "fb-123",
      channelName: "WorkHardToday",
      pageId: "123",
      postJobId: "job-1",
      productCode: "V102",
      postCaption: "Váy V102",
      postUrl: null,
      postImageUrl: null,
      customer: { id: "psid-1", name: "Ngọc Anh", tags: [] },
      lastMessage: {
        id: "msg-1",
        fromPage: false,
        text: "Tư vấn size giúp mình",
        createdAt: "2026-11-28T11:30:00+07:00",
      },
      needsReply: false,
      unread: false,
      unreadCount: 0,
      status: "open",
      isHidden: false,
      messageCount: 1,
      hasPhone: false,
      draft: null,
      updatedAt: "2026-11-28T11:30:00+07:00",
    };

    // Omitted fields -> not awaiting
    const legacy = InboxThreadSchema.parse(baseJson);
    expect(resolveAwaitingMeasurements(legacy, NOW_MS)).toBeNull();

    // Structured threadState object (active vs expired)
    const active = InboxThreadSchema.parse({
      ...baseJson,
      threadState: {
        state: "awaiting_measurements",
        productCode: "V102",
        askedCommentId: "msg-ask-1",
        expiresAt: "2026-11-29T11:30:00.000Z",
      },
    });
    const resolvedActive = resolveAwaitingMeasurements(active, NOW_MS);
    expect(resolvedActive).toEqual({
      productCode: "V102",
      askedCommentId: "msg-ask-1",
      expiresAt: "2026-11-29T11:30:00.000Z",
    });
    expect(formatAwaitingMeasurementsTooltip(resolvedActive!)).toContain("Mã V102");

    // Expired state -> hidden
    const expired = InboxThreadSchema.parse({
      ...baseJson,
      threadState: {
        state: "awaiting_measurements",
        expiresAt: "2026-11-28T10:00:00.000Z",
      },
    });
    expect(resolveAwaitingMeasurements(expired, NOW_MS)).toBeNull();

    // Alternative shapes: bare string, sizeAdvice, awaitingMeasurements boolean, autoReply.state
    expect(
      resolveAwaitingMeasurements(
        InboxThreadSchema.parse({ ...baseJson, threadState: "awaiting_measurements" }),
        NOW_MS,
      ),
    ).not.toBeNull();
    expect(
      resolveAwaitingMeasurements(
        InboxThreadSchema.parse({
          ...baseJson,
          sizeAdvice: { state: "awaiting_measurements", product_code: "V102" },
        }),
        NOW_MS,
      )?.productCode,
    ).toBe("V102");
    expect(
      resolveAwaitingMeasurements(
        InboxThreadSchema.parse({ ...baseJson, awaitingMeasurements: true }),
        NOW_MS,
      ),
    ).not.toBeNull();
    expect(
      resolveAwaitingMeasurements(
        InboxThreadSchema.parse({
          ...baseJson,
          autoReply: {
            lastAction: "sent",
            text: "Dạ chị cho shop xin chiều cao và cân nặng ạ.",
            reason: null,
            at: "2026-11-28T11:31:00.000Z",
            state: "awaiting_measurements",
            expiresAt: "2026-11-29T11:31:00.000Z",
          },
        }),
        NOW_MS,
      ),
    ).not.toBeNull();
  });

  it("renders 'Đang chờ số đo' badge on ConversationListItem and ChatHeader while awaiting, and omits when cleared", () => {
    const awaitingThread = sampleThread({
      threadState: {
        state: "awaiting_measurements",
        productCode: "V102",
        askedCommentId: "msg-ask-1",
        expiresAt: "2026-11-29T11:31:00.000Z",
      },
    });

    const rowHtml = renderToStaticMarkup(
      <ConversationListItem
        thread={awaitingThread}
        nowMs={NOW_MS}
        isSelected={false}
        isBulkMode={false}
        isBulkSelected={false}
        onSelect={() => {}}
        onToggleBulkSelect={() => {}}
      />,
    );
    expect(rowHtml).toContain('data-awaiting-measurements="true"');
    expect(rowHtml).toContain('data-awaiting-measurements-badge="true"');
    expect(rowHtml).toContain(AWAITING_MEASUREMENTS_BADGE_LABEL);

    const headerHtml = renderToStaticMarkup(
      <ChatHeader
        thread={awaitingThread}
        nowMs={NOW_MS}
        readOnlyReason={null}
        isTogglingIgnore={false}
        showBackButton={false}
        isCustomerPanelOpen={false}
        onIgnore={() => {}}
        onUnignore={() => {}}
        onToggleCustomerPanel={() => {}}
      />,
    );
    expect(headerHtml).toContain('data-awaiting-measurements="true"');
    expect(headerHtml).toContain('data-awaiting-measurements-badge="true"');
    expect(headerHtml).toContain(AWAITING_MEASUREMENTS_BADGE_LABEL);

    // Cleared thread hides the badge in both places
    const normalThread = sampleThread({ threadState: null });
    const normalRowHtml = renderToStaticMarkup(
      <ConversationListItem
        thread={normalThread}
        nowMs={NOW_MS}
        isSelected={false}
        isBulkMode={false}
        isBulkSelected={false}
        onSelect={() => {}}
        onToggleBulkSelect={() => {}}
      />,
    );
    expect(normalRowHtml).toContain('data-awaiting-measurements="false"');
    expect(normalRowHtml).not.toContain('data-awaiting-measurements-badge="true"');

    const normalHeaderHtml = renderToStaticMarkup(
      <ChatHeader
        thread={normalThread}
        nowMs={NOW_MS}
        readOnlyReason={null}
        isTogglingIgnore={false}
        showBackButton={false}
        isCustomerPanelOpen={false}
        onIgnore={() => {}}
        onUnignore={() => {}}
        onToggleCustomerPanel={() => {}}
      />,
    );
    expect(normalHeaderHtml).toContain('data-awaiting-measurements="false"');
    expect(normalHeaderHtml).not.toContain('data-awaiting-measurements-badge="true"');
  });
});

describe("agent run trace parsed measurements display", () => {
  it("extracts parsed measurements from structured fields and step details without false positives on price runs", () => {
    const structuredRun = AgentRunSchema.parse({
      ...sampleSizeAdviceRun(),
      parsedMeasurements: {
        height_cm: 160,
        weight_kg: 50,
        recommended_size: "M",
        category: "Váy",
        chart_row: { size: "M", weightKg: [46, 52], heightCm: [150, 160] },
      },
    });
    const structured = extractTraceMeasurements(structuredRun);
    expect(structured).toEqual({
      heightCm: 160,
      weightKg: 50,
      size: "M",
      category: "Váy",
      chartRowLabel: "Size M · 46–52 kg · 150–160 cm",
    });
    expect(formatTraceMeasurementTokens(structured!)).toEqual([
      "Cao 160 cm",
      "Nặng 50 kg",
      "Gợi ý size M",
      "Bảng size: Váy",
    ]);

    // Text-only detail fallback (1m58 + 48,5 ký)
    const textOnlyRun = sampleSizeAdviceRun({
      steps: [
        {
          key: "measurements",
          label: "Đọc số đo",
          status: "ok",
          detail: "Khách cung cấp 1m58 và 48,5 ký",
          at: "2026-11-28T11:35:01+07:00",
        },
      ],
    });
    expect(extractTraceMeasurements(textOnlyRun)).toEqual({
      heightCm: 158,
      weightKg: 48.5,
      size: null,
      category: null,
      chartRowLabel: null,
    });

    // Normal price run produces no measurement summary
    const priceRun = sampleSizeAdviceRun({
      steps: [
        {
          key: "facts",
          label: "Tra dữ liệu sản phẩm",
          status: "ok",
          detail: "Mã G1: giá 890.000đ, còn size S, M",
          at: "2026-11-28T11:35:01+07:00",
        },
      ],
    });
    expect(extractTraceMeasurements(priceRun)).toBeNull();
  });

  it("renders 'Số đo đã đọc' tokens and chart row inside expanded AgentRunTrace", () => {
    const runWithStructured = AgentRunSchema.parse({
      ...sampleSizeAdviceRun(),
      parsedMeasurements: {
        heightCm: 160,
        weightKg: 50,
        size: "M",
        chartRow: { size: "M", weightKg: [46, 52], heightCm: [150, 160] },
      },
    });

    const html = renderToStaticMarkup(
      <AgentRunTrace
        agentRunId="run-size-1"
        run={runWithStructured}
        isExpanded
        isLoading={false}
        align="end"
        contextExcerpt="Dạ với chiều cao 1m60 và cân nặng 50kg..."
        onToggle={() => {}}
      />,
    );
    expect(html).toContain('data-inbox="agent-trace-measurements"');
    expect(html).toContain("Số đo đã đọc");
    expect(html).toContain("Cao 160 cm");
    expect(html).toContain("Nặng 50 kg");
    expect(html).toContain("Gợi ý size M");
    expect(html).toContain("Size M · 46–52 kg · 150–160 cm");

    // Non-size run omits measurement strip
    const normalRun = sampleSizeAdviceRun({
      steps: [
        {
          key: "facts",
          label: "Tra dữ liệu sản phẩm",
          status: "ok",
          detail: "Mã G1: 890.000đ",
          at: "2026-11-28T11:35:01+07:00",
        },
      ],
    });
    const normalHtml = renderToStaticMarkup(
      <AgentRunTrace
        agentRunId="run-price-1"
        run={normalRun}
        isExpanded
        isLoading={false}
        align="end"
        contextExcerpt="Giá 890.000đ"
        onToggle={() => {}}
      />,
    );
    expect(normalHtml).not.toContain('data-inbox="agent-trace-measurements"');
  });
});
