import { readFileSync } from "node:fs";
import { join } from "node:path";

import { useAnnounce, type AnnounceFn } from "@astryxdesign/core/hooks";
import {
  QueryClient,
  QueryClientProvider,
  QueryObserver,
  environmentManager,
  focusManager,
  isServer,
  type InfiniteData,
} from "@tanstack/react-query";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  AGENT_RUN_LIVE_ANNOUNCEMENT,
  AGENT_RUN_ROW_INDICATOR_LABEL,
  AGENT_RUN_TRACE_TOGGLE_LABEL,
  AGENT_RUN_TYPING_LABEL,
  claimAgentRunAnnouncement,
  formatAgentStepLabel,
  formatAgentStepTime,
  resolveCanBanBlockingStepIndices,
  resolveMessageAgentRun,
} from "@/ui/components/inbox/agent-run-state";
import { AgentRunTrace } from "@/ui/components/inbox/AgentRunTrace";
import { AgentTypingBubble } from "@/ui/components/inbox/AgentTypingBubble";
import {
  ChatThreadPane,
  type ChatThreadPaneProps,
} from "@/ui/components/inbox/ChatThreadPane";
import { ConversationListItem } from "@/ui/components/inbox/ConversationListItem";
import { inboxKeys } from "@/ui/hooks/inbox-keys";
import {
  haveRunningThreadIdsChanged,
  invalidateInboxOnUpdates,
} from "@/ui/hooks/useCommentUpdates";
import {
  AGENT_RUN_POLL_INTERVAL_MS,
  isAgentRunRunning,
  nextAgentRunPollIntervalMs,
} from "@/ui/hooks/useInbox";
import { CommentUpdatesResponseSchema } from "@/ui/schemas/inbox-updates.schema";
import {
  AgentRunSchema,
  InboxMessageSchema,
  InboxThreadRunsResponseSchema,
  InboxThreadSchema,
  type AgentRun,
  type InboxMessage,
  type InboxThread,
  type InboxThreadDetailResponse,
} from "@/ui/schemas/inbox.schema";
import { ApiError } from "@/ui/services/api-error";
import { listThreadRuns } from "@/ui/services/inbox.api";

const NOW_MS = new Date("2026-11-28T12:00:00.000Z").getTime();

function renderMarkup(element: ReactElement): string {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>{element}</QueryClientProvider>,
  );
}

function sampleRun(overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    id: "run-1",
    threadId: "root-1",
    commentId: "msg-1",
    kind: "auto_reply",
    status: "done",
    outcome: "sent",
    steps: [
      {
        key: "read",
        label: "Đọc bình luận",
        status: "ok",
        detail: "Khách hỏi giá sản phẩm G1",
        at: "2026-11-28T11:30:01+07:00",
      },
      {
        key: "safety",
        label: "Kiểm tra an toàn",
        status: "ok",
        detail: null,
        at: "2026-11-28T11:30:02+07:00",
      },
      {
        key: "intent",
        label: "Phân loại câu hỏi",
        status: "ok",
        detail: "Nhận diện: hỏi giá",
        at: "2026-11-28T11:30:03+07:00",
      },
      {
        key: "facts",
        label: "Tra dữ liệu sản phẩm",
        status: "ok",
        detail: "Mã G1: 890.000đ",
        at: "2026-11-28T11:30:04+07:00",
      },
      {
        key: "compose",
        label: "Soạn câu trả lời",
        status: "skipped",
        detail: "Ghép mẫu từ dữ liệu sản phẩm",
        at: "2026-11-28T11:30:05+07:00",
      },
      {
        key: "action",
        label: "Gửi trả lời",
        status: "ok",
        detail: "Đã đăng phản hồi tự động",
        at: "2026-11-28T11:30:06+07:00",
      },
    ],
    startedAt: "2026-11-28T11:30:00+07:00",
    finishedAt: "2026-11-28T11:30:06+07:00",
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
    postImageUrl: null,
    customer: { id: "psid-1", name: "Minh Thư", tags: [] },
    lastMessage: {
      id: "msg-1",
      fromPage: false,
      text: "Mẫu này giá bao nhiêu ạ?",
      createdAt: "2026-11-28T11:30:00+07:00",
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
    updatedAt: "2026-11-28T11:30:00+07:00",
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
    createdAt: "2026-11-28T11:30:00+07:00",
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
    onToggleLikeMessage: () => {},
    onToggleHideMessage: () => {},
    ...overrides,
  };
}

describe("agent run trace schemas & API", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("defaults omitted agentRun, agentRunId, and runningThreadIds cleanly for rolling deploys", () => {
    const legacyThread = InboxThreadSchema.parse({
      id: "root-1",
      channelId: "fb-123",
      channelName: "WorkHardToday",
      pageId: "123",
      postJobId: "job-1",
      productCode: "G1",
      postCaption: "Caption",
      postUrl: null,
      postImageUrl: null,
      customer: { id: "psid-1", name: "Minh Thư", tags: [] },
      lastMessage: {
        id: "msg-1",
        fromPage: false,
        text: "Giá sao ạ?",
        createdAt: "2026-11-28T10:00:00+07:00",
      },
      needsReply: true,
      unread: false,
      unreadCount: 0,
      status: "open",
      isHidden: false,
      messageCount: 1,
      hasPhone: false,
      draft: null,
      updatedAt: "2026-11-28T10:00:00+07:00",
    });
    expect(legacyThread.agentRun).toBeNull();

    const legacyMsg = InboxMessageSchema.parse({
      id: "msg-1",
      threadId: "root-1",
      fromPage: false,
      fromId: "psid-1",
      text: "Giá sao ạ?",
      createdAt: "2026-11-28T10:00:00+07:00",
      permalinkUrl: null,
      isHidden: false,
      canComment: true,
      likedByPage: false,
      delivery: "sent",
      errorCode: null,
      userMessage: null,
      clientId: null,
    });
    expect(legacyMsg.agentRunId).toBeNull();

    const blankRunIdMsg = InboxMessageSchema.parse({
      id: "msg-2",
      threadId: "root-1",
      fromPage: true,
      fromId: "123",
      text: "Dạ 890k ạ",
      createdAt: "2026-11-28T10:01:00+07:00",
      permalinkUrl: null,
      isHidden: false,
      canComment: true,
      likedByPage: false,
      delivery: "sent",
      errorCode: null,
      userMessage: null,
      clientId: null,
      agentRunId: "   ",
    });
    expect(blankRunIdMsg.agentRunId).toBeNull();

    const legacyUpdates = CommentUpdatesResponseSchema.parse({
      tenantId: "t1",
      cursor: "2026-11-28T10:00:00+07:00",
      items: [],
      draftsReady: [],
    });
    expect(legacyUpdates.runningThreadIds).toEqual([]);
  });

  it("parses full AgentRun, AgentRunStep, InboxThreadRunsResponse, and runningThreadIds while rejecting invalid enums", () => {
    const parsedRun = AgentRunSchema.parse(sampleRun());
    expect(parsedRun.id).toBe("run-1");
    expect(parsedRun.steps).toHaveLength(6);

    const parsedRunsRes = InboxThreadRunsResponseSchema.parse({
      tenantId: "t1",
      items: [sampleRun({ id: "run-2", outcome: "can_ban" }), sampleRun()],
    });
    expect(parsedRunsRes.items).toHaveLength(2);
    expect(parsedRunsRes.items[0]?.outcome).toBe("can_ban");

    const parsedUpdates = CommentUpdatesResponseSchema.parse({
      tenantId: "t1",
      cursor: "2026-11-28T10:00:00+07:00",
      items: [],
      draftsReady: [],
      runningThreadIds: ["root-1", "root-2"],
    });
    expect(parsedUpdates.runningThreadIds).toEqual(["root-1", "root-2"]);

    expect(() =>
      AgentRunSchema.parse({ ...sampleRun(), status: "queued" }),
    ).toThrow();
    expect(() =>
      AgentRunSchema.parse({ ...sampleRun(), outcome: "unknown" }),
    ).toThrow();
    expect(() =>
      AgentRunSchema.parse({
        ...sampleRun(),
        steps: [
          {
            key: "read",
            label: "Đọc",
            status: "pending",
            detail: null,
            at: "2026-11-28T11:30:01+07:00",
          },
        ],
      }),
    ).toThrow();
  });

  it("calls GET /api/comments/threads/{threadId}/runs?limit=10 and rejects blank threadId", async () => {
    const fetchSpy = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(
          JSON.stringify({
            tenantId: "t1",
            items: [sampleRun()],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    );
    vi.stubGlobal("fetch", fetchSpy);

    const res = await listThreadRuns({ threadId: "root/1" });
    expect(res.items).toHaveLength(1);
    expect(res.items[0]?.id).toBe("run-1");
    expect(fetchSpy.mock.calls[0]?.[0]).toBe(
      "/api/comments/threads/root%2F1/runs?limit=10",
    );

    await listThreadRuns({ threadId: "root-2", limit: 5 });
    expect(fetchSpy.mock.calls[1]?.[0]).toBe(
      "/api/comments/threads/root-2/runs?limit=5",
    );

    await expect(listThreadRuns({ threadId: "   " })).rejects.toBeInstanceOf(ApiError);
  });
});

describe("2 s running-thread polling & runningThreadIds invalidation", () => {
  beforeEach(() => {
    environmentManager.setIsServer(() => false);
    focusManager.setFocused(true);
  });

  afterEach(() => {
    environmentManager.setIsServer(() => isServer);
    focusManager.setFocused(undefined);
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("polls that thread every 2 s ONLY while running and tab visible, pauses when hidden, and stops when done", async () => {
    vi.useFakeTimers();

    const makeDetailPage = (
      run: AgentRun | null,
    ): InfiniteData<InboxThreadDetailResponse> => ({
      pages: [
        {
          tenantId: "t1",
          thread: sampleThread({ agentRun: run }),
          messages: [sampleMessage()],
          olderCursor: null,
        },
      ],
      pageParams: [null],
    });

    const running1 = sampleRun({
      id: "run-live",
      status: "running",
      outcome: null,
      finishedAt: null,
      steps: [
        {
          key: "read",
          label: "Đọc bình luận",
          status: "ok",
          detail: null,
          at: "2026-11-28T11:30:01+07:00",
        },
      ],
    });
    const running2 = sampleRun({
      ...running1,
      steps: [
        ...running1.steps,
        {
          key: "facts",
          label: "Tra dữ liệu sản phẩm",
          status: "running",
          detail: "Đang kiểm tra kho G1",
          at: "2026-11-28T11:30:03+07:00",
        },
      ],
    });
    const finished = sampleRun({
      ...running1,
      status: "done",
      outcome: "sent",
      finishedAt: "2026-11-28T11:30:05+07:00",
    });

    // Pure interval checks
    expect(isAgentRunRunning(sampleThread({ agentRun: running1 }))).toBe(true);
    expect(isAgentRunRunning(sampleThread({ agentRun: finished }))).toBe(false);
    expect(nextAgentRunPollIntervalMs(makeDetailPage(running1), true)).toBe(
      AGENT_RUN_POLL_INTERVAL_MS,
    );
    expect(nextAgentRunPollIntervalMs(makeDetailPage(running1), false)).toBe(false);
    expect(nextAgentRunPollIntervalMs(makeDetailPage(finished), true)).toBe(false);
    expect(
      nextAgentRunPollIntervalMs(
        makeDetailPage(running1),
        true,
        new ApiError({ code: "NOT_FOUND", status: 404, userMessage: "missing" }),
      ),
    ).toBe(false);

    // Real QueryObserver polling lifecycle
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(makeDetailPage(running1))
      .mockResolvedValueOnce(makeDetailPage(running2))
      .mockResolvedValueOnce(makeDetailPage(finished));

    let isVisible = true;
    const makeOptions = () => ({
      queryKey: inboxKeys.thread("t1", "root-1"),
      queryFn: () => fetcher(),
      retry: false as const,
      staleTime: 10_000,
      refetchIntervalInBackground: false as const,
      refetchInterval: (q: {
        state: {
          data: InfiniteData<InboxThreadDetailResponse> | undefined;
          error: unknown;
        };
      }) => nextAgentRunPollIntervalMs(q.state.data, isVisible, q.state.error),
    });

    const observer = new QueryObserver<InfiniteData<InboxThreadDetailResponse>>(
      queryClient,
      makeOptions(),
    );
    const unsubscribe = observer.subscribe(() => {});

    // Initial load returns status=running
    await vi.advanceTimersByTimeAsync(0);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(observer.getCurrentResult().data?.pages[0]?.thread.agentRun?.steps).toHaveLength(1);

    // After 2 s -> second poll returns step 2
    await vi.advanceTimersByTimeAsync(AGENT_RUN_POLL_INTERVAL_MS);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(observer.getCurrentResult().data?.pages[0]?.thread.agentRun?.steps).toHaveLength(2);

    // Tab hidden -> polling pauses completely
    isVisible = false;
    focusManager.setFocused(false);
    observer.setOptions(makeOptions());
    await vi.advanceTimersByTimeAsync(20_000);
    expect(fetcher).toHaveBeenCalledTimes(2);

    // Tab visible again -> resumes and receives status=done
    isVisible = true;
    focusManager.setFocused(true);
    observer.setOptions(makeOptions());
    await vi.advanceTimersByTimeAsync(AGENT_RUN_POLL_INTERVAL_MS);
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(observer.getCurrentResult().data?.pages[0]?.thread.agentRun?.status).toBe("done");

    // Once done, polling stops permanently
    await vi.advanceTimersByTimeAsync(20_000);
    expect(fetcher).toHaveBeenCalledTimes(3);

    unsubscribe();
    queryClient.clear();
  });

  it("invalidates threads and affected threads when runningThreadIds starts or finishes, not when unchanged", () => {
    expect(haveRunningThreadIdsChanged([], [])).toBe(false);
    expect(haveRunningThreadIdsChanged(["a"], ["a"])).toBe(false);
    expect(haveRunningThreadIdsChanged(["a", "b"], ["b", "a"])).toBe(false);
    expect(haveRunningThreadIdsChanged([], ["a"])).toBe(true);
    expect(haveRunningThreadIdsChanged(["a"], [])).toBe(true);

    const queryClient = new QueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    // Thread starts running -> invalidates list + that thread
    invalidateInboxOnUpdates(
      queryClient,
      "t1",
      { items: [], draftsReady: [], runningThreadIds: ["th-run"] },
      [],
    );
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: inboxKeys.threads("t1") });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: inboxKeys.thread("t1", "th-run"),
    });

    // Unchanged runningThreadIds -> no spurious invalidation
    invalidateSpy.mockClear();
    invalidateInboxOnUpdates(
      queryClient,
      "t1",
      { items: [], draftsReady: [], runningThreadIds: ["th-run"] },
      ["th-run"],
    );
    expect(invalidateSpy).not.toHaveBeenCalled();

    // Thread finishes running -> invalidates list + previously running thread
    invalidateInboxOnUpdates(
      queryClient,
      "t1",
      { items: [], draftsReady: [], runningThreadIds: [] },
      ["th-run"],
    );
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: inboxKeys.threads("t1") });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: inboxKeys.thread("t1", "th-run"),
    });
  });
});

describe("agent run matching, can_ban blocking highlight, and once-per-run live announcements", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("matches message agentRunId against runs & thread.agentRun and identifies can_ban blocking steps", () => {
    const olderRun = sampleRun({ id: "run-old" });
    const latestRunning = sampleRun({
      id: "run-live",
      status: "running",
      steps: [
        {
          key: "read",
          label: "Đọc bình luận",
          status: "ok",
          detail: null,
          at: "2026-11-28T11:30:01+07:00",
        },
        {
          key: "intent",
          label: "Phân loại câu hỏi",
          status: "running",
          detail: null,
          at: "2026-11-28T11:30:02+07:00",
        },
      ],
    });
    const staleRunningInList = sampleRun({
      id: "run-live",
      status: "running",
      steps: [latestRunning.steps[0]],
    });

    expect(
      resolveMessageAgentRun({
        agentRunId: "run-old",
        runs: [staleRunningInList, olderRun],
        latestThreadRun: latestRunning,
      })?.id,
    ).toBe("run-old");

    // Prefers fresher latestThreadRun when it has more steps for the same ID
    expect(
      resolveMessageAgentRun({
        agentRunId: "run-live",
        runs: [staleRunningInList],
        latestThreadRun: latestRunning,
      })?.steps,
    ).toHaveLength(2);

    expect(
      resolveMessageAgentRun({
        agentRunId: null,
        runs: [olderRun],
        latestThreadRun: latestRunning,
      }),
    ).toBeNull();

    // Blocking step highlighting for can_ban
    const canBanBlocked = sampleRun({
      outcome: "can_ban",
      steps: [
        {
          key: "read",
          label: "Đọc bình luận",
          status: "ok",
          detail: null,
          at: "2026-11-28T11:30:01+07:00",
        },
        {
          key: "intent",
          label: "Phân loại câu hỏi",
          status: "blocked",
          detail: "Khách hỏi phí ship ngoài phạm vi tự trả lời",
          at: "2026-11-28T11:30:02+07:00",
        },
        {
          key: "action",
          label: "Gắn Cần bạn",
          status: "ok",
          detail: "Chuyển nhân viên xử lý",
          at: "2026-11-28T11:30:03+07:00",
        },
      ],
    });
    expect([...resolveCanBanBlockingStepIndices(canBanBlocked)]).toEqual([1]);

    // Non-can_ban runs never highlight blocking steps
    expect([...resolveCanBanBlockingStepIndices(sampleRun({ outcome: "sent" }))]).toEqual(
      [],
    );

    // Fallback step label & time formatting
    expect(formatAgentStepLabel({ key: "facts", label: "   " })).toBe(
      "Tra dữ liệu sản phẩm",
    );
    expect(formatAgentStepTime("2026-11-28T11:30:06+07:00")).toMatch(/\d{2}:\d{2}:\d{2}/);
  });

  it("announces 'AI đang soạn trả lời' strictly once per run via polite live region", () => {
    vi.useFakeTimers();

    interface FakeLiveRegion {
      attrs: Record<string, string>;
      style: { cssText: string };
      isConnected: boolean;
      mutations: string[];
      setAttribute(name: string, value: string): void;
      remove(): void;
      textContent: string;
    }

    const created: FakeLiveRegion[] = [];
    const rafQueue: FrameRequestCallback[] = [];

    vi.stubGlobal("document", {
      createElement: () => {
        let text = "";
        const el: FakeLiveRegion = {
          attrs: {},
          style: { cssText: "" },
          isConnected: false,
          mutations: [],
          setAttribute(name, value) {
            this.attrs[name] = value;
          },
          remove() {
            this.isConnected = false;
          },
          get textContent() {
            return text;
          },
          set textContent(next: string) {
            text = next;
            this.mutations.push(next);
          },
        };
        created.push(el);
        return el;
      },
      body: {
        appendChild: (el: FakeLiveRegion) => {
          el.isConnected = true;
          return el;
        },
      },
    });
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      rafQueue.push(cb);
      return rafQueue.length;
    });

    let announce!: AnnounceFn;
    function Capture() {
      announce = useAnnounce();
      return null;
    }
    renderToStaticMarkup(<Capture />);

    try {
      const announced = new Set<string>();

      // Run 1 starts -> announces once
      if (claimAgentRunAnnouncement(announced, "run-1")) {
        announce(AGENT_RUN_LIVE_ANNOUNCEMENT, "polite");
      }
      rafQueue.shift()?.(16);

      // Subsequent 2 s polls for run-1 -> MUST NOT re-announce
      if (claimAgentRunAnnouncement(announced, "run-1")) {
        announce(AGENT_RUN_LIVE_ANNOUNCEMENT, "polite");
      }
      if (claimAgentRunAnnouncement(announced, null)) {
        announce(AGENT_RUN_LIVE_ANNOUNCEMENT, "polite");
      }

      const politeRegion = created.find(
        (el) => el.attrs["data-astryx-live-region"] === "polite",
      );
      expect(politeRegion).toBeDefined();
      expect(politeRegion?.attrs.role).toBe("status");
      expect(politeRegion?.attrs["aria-live"]).toBe("polite");
      expect(politeRegion?.mutations).toEqual(["", "AI đang soạn trả lời"]);

      // A new distinct run-2 starts -> announces once more
      if (claimAgentRunAnnouncement(announced, "run-2")) {
        announce(AGENT_RUN_LIVE_ANNOUNCEMENT, "polite");
      }
      rafQueue.shift()?.(32);
      expect(politeRegion?.mutations).toEqual([
        "",
        "AI đang soạn trả lời",
        "",
        "AI đang soạn trả lời",
      ]);
    } finally {
      announce("", "polite");
      for (const el of created) el.isConnected = false;
    }
  });
});

describe("agent run trace UI rendering & accessibility contracts", () => {
  it("renders typing bubble at end of chat and 'AI đang soạn' row indicator only while running", () => {
    const runningRun = sampleRun({
      id: "run-typing",
      status: "running",
      outcome: null,
      finishedAt: null,
      steps: [
        {
          key: "read",
          label: "Đọc bình luận",
          status: "ok",
          detail: "Đã đọc câu hỏi",
          at: "2026-11-28T11:30:01+07:00",
        },
        {
          key: "facts",
          label: "Tra dữ liệu sản phẩm",
          status: "running",
          detail: "Đang tra cứu sản phẩm G1",
          at: "2026-11-28T11:30:02+07:00",
        },
      ],
    });

    const runningChatHtml = renderMarkup(
      <ChatThreadPane
        {...makeChatProps({
          thread: sampleThread({ agentRun: runningRun }),
          messages: [sampleMessage()],
        })}
      />,
    );
    expect(runningChatHtml).toContain('data-inbox="agent-typing-bubble"');
    expect(runningChatHtml).toContain(AGENT_RUN_TYPING_LABEL);
    expect(runningChatHtml).toContain('data-inbox="typing-dots"');
    expect(runningChatHtml).toContain("Tra dữ liệu sản phẩm");
    // Typing bubble appears after the message list
    expect(runningChatHtml.indexOf('data-inbox="agent-typing-bubble"')).toBeGreaterThan(
      runningChatHtml.indexOf("Lịch sử bình luận"),
    );

    const typingOnlyHtml = renderToStaticMarkup(
      <AgentTypingBubble agentRun={runningRun} channelName="WorkHardToday" />,
    );
    expect(typingOnlyHtml).not.toContain('aria-live="polite"');
    expect(typingOnlyHtml).toContain('aria-hidden="true"');

    // Done run does NOT show typing bubble
    const doneChatHtml = renderMarkup(
      <ChatThreadPane
        {...makeChatProps({
          thread: sampleThread({ agentRun: sampleRun({ status: "done" }) }),
          messages: [sampleMessage()],
        })}
      />,
    );
    expect(doneChatHtml).not.toContain('data-inbox="agent-typing-bubble"');

    // Row indicator shown ONLY while running
    const runningRowHtml = renderToStaticMarkup(
      <ConversationListItem
        thread={sampleThread({ agentRun: runningRun })}
        nowMs={NOW_MS}
        isSelected={false}
        isBulkMode={false}
        isBulkSelected={false}
        onSelect={() => {}}
        onToggleBulkSelect={() => {}}
      />,
    );
    expect(runningRowHtml).toContain('data-agent-run-status="running"');
    expect(runningRowHtml).toContain('data-agent-run-indicator="running"');
    expect(runningRowHtml).toContain(AGENT_RUN_ROW_INDICATOR_LABEL);

    const idleRowHtml = renderToStaticMarkup(
      <ConversationListItem
        thread={sampleThread({ agentRun: sampleRun({ status: "done" }) })}
        nowMs={NOW_MS}
        isSelected={false}
        isBulkMode={false}
        isBulkSelected={false}
        onSelect={() => {}}
        onToggleBulkSelect={() => {}}
      />,
    );
    expect(idleRowHtml).toContain('data-agent-run-status="done"');
    expect(idleRowHtml).not.toContain('data-agent-run-indicator="running"');
    expect(idleRowHtml).not.toContain(AGENT_RUN_ROW_INDICATOR_LABEL);
  });

  it("renders collapsed-by-default 'Xem quá trình xử lý' on bot-handled customer & Page messages, expands steps with icons/detail/time, and highlights can_ban blocking step", () => {
    const canBanRun = sampleRun({
      id: "run-canban",
      outcome: "can_ban",
      steps: [
        {
          key: "read",
          label: "Đọc bình luận",
          status: "ok",
          detail: "Khách hỏi phí ship về Đà Nẵng",
          at: "2026-11-28T11:30:01+07:00",
        },
        {
          key: "intent",
          label: "Phân loại câu hỏi",
          status: "blocked",
          detail: "Ngoài phạm vi tự trả lời (phí ship)",
          at: "2026-11-28T11:30:02+07:00",
        },
        {
          key: "compose",
          label: "Soạn câu trả lời",
          status: "skipped",
          detail: null,
          at: "2026-11-28T11:30:03+07:00",
        },
        {
          key: "action",
          label: "Gắn nhãn Cần bạn",
          status: "ok",
          detail: "Chờ nhân viên trả lời",
          at: "2026-11-28T11:30:04+07:00",
        },
      ],
    });
    const autoReplyRun = sampleRun({ id: "run-auto", outcome: "sent" });

    const customerMsg = sampleMessage({
      id: "msg-cust-1",
      fromPage: false,
      text: "Ship Đà Nẵng bao nhiêu shop?",
      agentRunId: "run-canban",
    });
    const pageAutoMsg = sampleMessage({
      id: "msg-page-auto",
      fromPage: true,
      fromId: "123",
      fromName: "WorkHardToday",
      text: "Dạ mẫu G1 giá 890.000đ ạ.",
      sentBy: "auto",
      agentRunId: "run-auto",
    });
    const manualMsg = sampleMessage({
      id: "msg-manual",
      fromPage: true,
      fromId: "123",
      fromName: "WorkHardToday",
      text: "Shop đã inbox bạn nhé!",
      sentBy: "operator",
      agentRunId: null,
    });

    // Collapsed by default: toggle has aria-expanded="false", no trace panel in DOM
    const collapsedHtml = renderMarkup(
      <ChatThreadPane
        {...makeChatProps({
          thread: sampleThread(),
          messages: [customerMsg, pageAutoMsg, manualMsg],
          threadRuns: [canBanRun, autoReplyRun],
        })}
      />,
    );
    const toggleMatches = collapsedHtml.match(/data-inbox="agent-trace-toggle"/g) ?? [];
    expect(toggleMatches).toHaveLength(2);
    expect(collapsedHtml).toContain(AGENT_RUN_TRACE_TOGGLE_LABEL);
    expect(collapsedHtml).toContain('aria-expanded="false"');
    expect(collapsedHtml).not.toContain('data-inbox="agent-trace-panel"');
    expect(collapsedHtml).toContain('data-agent-run-id="run-canban"');
    expect(collapsedHtml).toContain('data-agent-run-id="run-auto"');

    // Expanded state for can_ban customer message: button aria-expanded="true", <ol role="list">, blocking step highlighted
    const expandedHtml = renderMarkup(
      <ChatThreadPane
        {...makeChatProps({
          thread: sampleThread(),
          messages: [customerMsg, pageAutoMsg],
          threadRuns: [canBanRun, autoReplyRun],
          initialExpandedTraceMessageIds: ["msg-cust-1"],
        })}
      />,
    );
    expect(expandedHtml).toContain('aria-expanded="true"');
    expect(expandedHtml).toContain("aria-controls=");
    expect(expandedHtml).toContain('data-inbox="agent-trace-panel"');
    expect(expandedHtml).toContain('data-agent-run-outcome="can_ban"');
    expect(expandedHtml).toContain("<ol ");
    expect(expandedHtml).toContain('role="list"');
    expect(expandedHtml).toContain('role="listitem"');
    expect(expandedHtml).toContain("Phân loại câu hỏi");
    expect(expandedHtml).toContain("Ngoài phạm vi tự trả lời (phí ship)");
    expect(expandedHtml).toContain('data-step-key="intent"');
    expect(expandedHtml).toContain('data-step-blocking="true"');
    expect(expandedHtml).toContain('data-blocking-badge="true"');
    expect(expandedHtml).toContain('<time dateTime="2026-11-28T11:30:02+07:00"');
    expect(expandedHtml).toContain("inbox-trace-icon-ok");
    expect(expandedHtml).toContain("inbox-trace-icon-blocked");
    expect(expandedHtml).toContain("inbox-trace-icon-skipped");

    // Loading, error, and missing (7-day retention) states
    const loadingTraceHtml = renderToStaticMarkup(
      <AgentRunTrace
        agentRunId="run-older"
        run={null}
        isExpanded
        isLoading
        align="start"
        contextExcerpt="Giá bao nhiêu?"
        onToggle={() => {}}
      />,
    );
    expect(loadingTraceHtml).toContain("Đang tải quá trình xử lý…");

    const errorTraceHtml = renderToStaticMarkup(
      <AgentRunTrace
        agentRunId="run-older"
        run={null}
        isExpanded
        isLoading={false}
        error={
          new ApiError({
            code: "UPSTREAM_ERROR",
            status: 502,
            userMessage: "Máy chủ tạm gián đoạn.",
          })
        }
        align="end"
        contextExcerpt="Dạ 890k"
        onToggle={() => {}}
        onRetry={() => {}}
      />,
    );
    expect(errorTraceHtml).toContain("Không tải được quá trình xử lý");
    expect(errorTraceHtml).toContain("Thử lại");

    const expiredTraceHtml = renderToStaticMarkup(
      <AgentRunTrace
        agentRunId="run-expired"
        run={null}
        isExpanded
        isLoading={false}
        align="start"
        contextExcerpt="Bình luận cũ"
        onToggle={() => {}}
      />,
    );
    expect(expiredTraceHtml).toContain("7 ngày gần nhất");
  });

  it("disables typing dot animation under prefers-reduced-motion: reduce using token-only CSS", () => {
    const cssSrc = readFileSync(
      join(process.cwd(), "src/ui/components/inbox/inbox-surface.css"),
      "utf8",
    );
    expect(cssSrc).toMatch(
      /@media\s*\(prefers-reduced-motion:\s*no-preference\)[\s\S]*?\.inbox-typing-dot[\s\S]*?animation:/,
    );
    expect(cssSrc).toMatch(
      /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.inbox-typing-dot[\s\S]*?animation:\s*none/,
    );
    expect(cssSrc).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(cssSrc).not.toMatch(/rgb\(|rgba\(|hsl\(|oklch\(/);
  });
});
