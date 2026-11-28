import {
  QueryClient,
  QueryClientProvider,
  environmentManager,
  focusManager,
  isServer,
} from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { inboxKeys } from "@/ui/hooks/inbox-keys";
import { useUpdateAutoReplySetting } from "@/ui/hooks/useAutoReply";
import { useClearThreadAttention } from "@/ui/hooks/useInbox";
import {
  AUTO_REPLY_DAILY_CAP_DEFAULT,
  AUTO_REPLY_DEFAULT_INTENTS,
  AUTO_REPLY_HOURLY_CAP_DEFAULT,
  AUTO_REPLY_LIVE_CONFIRM_COPY,
  AutoReplyLogResponseSchema,
  AutoReplySettingSchema,
  AutoReplySettingsListResponseSchema,
  AutoReplySettingUpdateInputSchema,
  type AutoReplySetting,
} from "@/ui/schemas/auto-reply.schema";
import { CommentUpdatesResponseSchema } from "@/ui/schemas/inbox-updates.schema";
import {
  InboxMessageSchema,
  InboxThreadCountsSchema,
  InboxThreadListResponseSchema,
  InboxThreadSchema,
} from "@/ui/schemas/inbox.schema";
import type { MeResponse } from "@/ui/schemas/me.schema";
import { ApiError } from "@/ui/services/api-error";
import {
  listAutoReplyLog,
  listAutoReplySettings,
  updateAutoReplySetting,
} from "@/ui/services/auto-reply.api";
import { clearThreadAttention } from "@/ui/services/inbox.api";
import { meKeys } from "@/ui/services/me.api";

const TENANT_ID = "00000000-0000-4000-8000-000000000001";

const ACTIVE_ME: MeResponse = {
  account: { id: "acc-1", displayName: "Lan Anh", platformRole: null },
  tenants: [
    {
      id: TENANT_ID,
      name: "WorkHardToday",
      slug: "workhardtoday",
      plan: "pro",
      role: "owner",
    },
  ],
  activeTenantId: TENANT_ID,
  isBootstrapAdmin: false,
  supportSession: null,
};

function sampleThreadJson(overrides: Record<string, unknown> = {}) {
  return {
    id: "root-1",
    channelId: "fb-123",
    channelName: "WorkHardToday",
    pageId: "123",
    postJobId: "job-1",
    productCode: "G1",
    postCaption: "Đầm hoa G1",
    postUrl: "https://www.facebook.com/123_1001",
    postImageUrl: null,
    customer: { id: "psid-1", name: "Minh Thư", tags: [] },
    lastMessage: {
      id: "root-1",
      fromPage: false,
      text: "Còn size M không ạ?",
      createdAt: "2026-11-27T10:00:00+07:00",
    },
    needsReply: true,
    unread: true,
    unreadCount: 1,
    status: "open",
    isHidden: false,
    messageCount: 1,
    hasPhone: false,
    draft: null,
    moderation: null,
    updatedAt: "2026-11-27T10:00:00+07:00",
    ...overrides,
  };
}

function sampleMessageJson(overrides: Record<string, unknown> = {}) {
  return {
    id: "msg-1",
    threadId: "root-1",
    fromPage: true,
    fromId: "123",
    fromName: "WorkHardToday",
    text: "Dạ mẫu G1 giá 890.000đ chị nhé.",
    createdAt: "2026-11-27T10:01:00+07:00",
    permalinkUrl: null,
    isHidden: false,
    canComment: true,
    likedByPage: false,
    delivery: "sent",
    errorCode: null,
    userMessage: null,
    clientId: "auto:root-1",
    moderation: null,
    ...overrides,
  };
}

function sampleSettingJson(overrides: Record<string, unknown> = {}) {
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

function mockFetchJson(body: unknown, status = 200) {
  const spy = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    }),
  );
  vi.stubGlobal("fetch", spy);
  return spy;
}

describe("auto-reply & inbox schema backwards compatibility (missing optional fields)", () => {
  it("defaults omitted attention, autoReply, sentBy, counts.canBan, needYou, and autoReplied to safe empty states", () => {
    // Legacy thread payload without attention / autoReply
    const legacyThread = InboxThreadSchema.parse(sampleThreadJson());
    expect(legacyThread.attention).toBeNull();
    expect(legacyThread.autoReply).toBeNull();

    // Legacy message payload without sentBy
    const legacyMessage = InboxMessageSchema.parse(sampleMessageJson());
    expect(legacyMessage.sentBy).toBeNull();

    // Legacy counts payload without canBan
    const legacyCounts = InboxThreadCountsSchema.parse({
      needsReply: 3,
      unread: 1,
      all: 9,
      hidden: 0,
      ignored: 2,
    });
    expect(legacyCounts.canBan).toBe(0);

    // Legacy updates payload without needYou / autoReplied
    const legacyUpdates = CommentUpdatesResponseSchema.parse({
      tenantId: "t1",
      cursor: "2026-11-27T10:00:00+07:00",
      items: [],
      draftsReady: [],
    });
    expect(legacyUpdates.needYou).toEqual([]);
    expect(legacyUpdates.autoReplied).toEqual([]);

    // Minimal auto-reply setting payload with omitted defaults
    const minimalSetting = AutoReplySettingSchema.parse({
      pageId: "123",
      channelId: "fb-123",
      pageName: "Shop A",
    });
    expect(minimalSetting).toEqual({
      pageId: "123",
      channelId: "fb-123",
      pageName: "Shop A",
      enabled: false,
      mode: "dry_run",
      intents: [...AUTO_REPLY_DEFAULT_INTENTS],
      hourlyCap: AUTO_REPLY_HOURLY_CAP_DEFAULT,
      dailyCap: AUTO_REPLY_DAILY_CAP_DEFAULT,
      updatedAt: null,
    });
    expect(minimalSetting.intents).not.toContain("size_advice");
  });

  it("parses full attention, autoReply, sentBy, counts.canBan, updates needYou/autoReplied, settings, and log payloads", () => {
    const list = InboxThreadListResponseSchema.parse({
      tenantId: TENANT_ID,
      items: [
        sampleThreadJson({
          attention: {
            tag: "can_ban",
            reason: "khách hỏi phí ship và đổi trả",
            since: "2026-11-27T10:02:00+07:00",
          },
          autoReply: {
            lastAction: "would_send",
            text: "Dạ mẫu G1 giá 890.000đ chị nhé.",
            reason: null,
            at: "2026-11-27T10:01:30+07:00",
          },
        }),
      ],
      nextCursor: null,
      limit: 30,
      counts: {
        canBan: 4,
        needsReply: 5,
        unread: 2,
        all: 15,
        hidden: 1,
        ignored: 0,
      },
    });
    expect(list.counts.canBan).toBe(4);
    expect(list.items[0].attention).toEqual({
      tag: "can_ban",
      reason: "khách hỏi phí ship và đổi trả",
      since: "2026-11-27T10:02:00+07:00",
    });
    expect(list.items[0].autoReply?.lastAction).toBe("would_send");
    expect(list.items[0].autoReply?.text).toBe("Dạ mẫu G1 giá 890.000đ chị nhé.");

    const autoMsg = InboxMessageSchema.parse(sampleMessageJson({ sentBy: "auto" }));
    expect(autoMsg.sentBy).toBe("auto");

    const updates = CommentUpdatesResponseSchema.parse({
      tenantId: TENANT_ID,
      cursor: "2026-11-27T10:05:00+07:00",
      items: [],
      draftsReady: [],
      needYou: [
        { threadId: "th-1", customerName: "Lan", reason: "hỏi ship" },
        {
          threadId: "th-2",
          customerName: null,
          reason: "thiếu mã SP",
          since: "2026-11-27T10:04:00+07:00",
        },
      ],
      autoReplied: [{ threadId: "th-3", messageId: "m-auto-9" }],
    });
    expect(updates.needYou[0].since).toBeNull();
    expect(updates.needYou[1].since).toBe("2026-11-27T10:04:00+07:00");
    expect(updates.autoReplied).toEqual([{ threadId: "th-3", messageId: "m-auto-9" }]);

    const settingsList = AutoReplySettingsListResponseSchema.parse({
      tenantId: TENANT_ID,
      items: [
        sampleSettingJson({
          enabled: true,
          mode: "live",
          intents: ["price", "size"],
          hourlyCap: 50,
          dailyCap: 500,
          updatedAt: "2026-11-27T10:00:00+07:00",
        }),
      ],
    });
    expect(settingsList.items[0].mode).toBe("live");

    const log = AutoReplyLogResponseSchema.parse({
      tenantId: TENANT_ID,
      items: [
        {
          id: "log-1",
          pageId: "123",
          threadId: "root-1",
          commentId: "c-1",
          intents: ["price", "color"],
          action: "would_send",
          reason: null,
          text: "Dạ mẫu G1 giá 890.000đ, còn màu đen ạ.",
          createdAt: "2026-11-27T10:03:00+07:00",
        },
        {
          id: "log-2",
          pageId: "123",
          threadId: "root-2",
          commentId: "c-2",
          action: "skipped",
          reason: "vượt trần tự trả lời",
          createdAt: "2026-11-27T10:04:00+07:00",
        },
      ],
      nextCursor: "cur-2",
    });
    expect(log.items[0].intents).toEqual(["price", "color"]);
    expect(log.items[1].intents).toEqual([]);
    expect(log.items[1].text).toBeNull();
    expect(log.nextCursor).toBe("cur-2");
  });

  it("rejects empty intents when enabled and rejects invalid caps/modes", () => {
    expect(
      AutoReplySettingUpdateInputSchema.safeParse({
        enabled: true,
        mode: "dry_run",
        intents: [],
        hourlyCap: 30,
        dailyCap: 200,
      }).success,
    ).toBe(false);

    // Disabled with empty intents is valid
    expect(
      AutoReplySettingUpdateInputSchema.safeParse({
        enabled: false,
        mode: "dry_run",
        intents: [],
        hourlyCap: 30,
        dailyCap: 200,
      }).success,
    ).toBe(true);

    expect(
      AutoReplySettingUpdateInputSchema.safeParse({
        enabled: true,
        mode: "dry_run",
        intents: ["price"],
        hourlyCap: 0,
        dailyCap: 200,
      }).success,
    ).toBe(false);

    expect(
      AutoReplySettingUpdateInputSchema.safeParse({
        enabled: true,
        mode: "dry_run",
        intents: ["price"],
        hourlyCap: 201,
        dailyCap: 200,
      }).success,
    ).toBe(false);

    expect(
      AutoReplySettingUpdateInputSchema.safeParse({
        enabled: true,
        mode: "dry_run",
        intents: ["price"],
        hourlyCap: 30,
        dailyCap: 2001,
      }).success,
    ).toBe(false);

    expect(() =>
      InboxThreadSchema.parse(
        sampleThreadJson({
          attention: { tag: "unknown", reason: "x", since: "2026-11-27T10:00:00+07:00" },
        }),
      ),
    ).toThrow();
    expect(() =>
      InboxMessageSchema.parse(sampleMessageJson({ sentBy: "bot" })),
    ).toThrow();
  });
});

describe("auto-reply & clear-attention API clients", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("calls POST /api/comments/threads/{id}/attention/clear", async () => {
    const spy = mockFetchJson({
      tenantId: TENANT_ID,
      thread: sampleThreadJson({ attention: null }),
    });
    const res = await clearThreadAttention("root-1");
    expect(res.thread.attention).toBeNull();
    expect(spy.mock.calls[0]?.[0]).toBe("/api/comments/threads/root-1/attention/clear");
    expect(spy.mock.calls[0]?.[1]?.method).toBe("POST");
  });

  it("fetches auto-reply settings and log with pageId/action/cursor/limit query params", async () => {
    const settingsSpy = mockFetchJson({
      tenantId: TENANT_ID,
      items: [sampleSettingJson()],
    });
    const settings = await listAutoReplySettings();
    expect(settings.items).toHaveLength(1);
    expect(settingsSpy.mock.calls[0]?.[0]).toBe("/api/comments/auto-reply-settings");

    const logSpy = mockFetchJson({
      tenantId: TENANT_ID,
      items: [],
      nextCursor: null,
    });
    await listAutoReplyLog({
      pageId: "123",
      action: "would_send",
      cursor: "c1",
      limit: 25,
    });
    const url = String(logSpy.mock.calls[0]?.[0] ?? "");
    expect(url).toContain("/api/comments/auto-reply-log?");
    expect(url).toContain("pageId=123");
    expect(url).toContain("action=would_send");
    expect(url).toContain("cursor=c1");
    expect(url).toContain("limit=25");
  });

  it("enforces confirmLive=true before sending live mode and validates intents/caps", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    // Switching to live without confirmLive -> rejected client-side with CONFIRM_REQUIRED
    await expect(
      updateAutoReplySetting("123", {
        enabled: true,
        mode: "live",
        intents: ["price"],
        hourlyCap: 30,
        dailyCap: 200,
      }),
    ).rejects.toSatisfy(
      (err: unknown) =>
        ApiError.is(err) &&
        err.code === "CONFIRM_REQUIRED" &&
        err.status === 400 &&
        err.userMessage.includes(AUTO_REPLY_LIVE_CONFIRM_COPY),
    );
    expect(fetchSpy).not.toHaveBeenCalled();

    // Enabled with empty intents -> rejected client-side with INVALID_INPUT
    await expect(
      updateAutoReplySetting("123", {
        enabled: true,
        mode: "dry_run",
        intents: [],
        hourlyCap: 30,
        dailyCap: 200,
      }),
    ).rejects.toSatisfy(
      (err: unknown) => ApiError.is(err) && err.code === "INVALID_INPUT",
    );
    expect(fetchSpy).not.toHaveBeenCalled();

    // Confirmed live sends PUT with confirmLive: true
    const okSpy = mockFetchJson({
      tenantId: TENANT_ID,
      setting: sampleSettingJson({ enabled: true, mode: "live", intents: ["price"] }),
    });
    const saved = await updateAutoReplySetting("123", {
      enabled: true,
      mode: "live",
      intents: ["price", "price"],
      hourlyCap: 40,
      dailyCap: 300,
      confirmLive: true,
    });
    expect(saved.setting.mode).toBe("live");
    expect(okSpy.mock.calls[0]?.[0]).toBe("/api/comments/auto-reply-settings/123");
    expect(okSpy.mock.calls[0]?.[1]?.method).toBe("PUT");
    expect(JSON.parse(String(okSpy.mock.calls[0]?.[1]?.body ?? "{}"))).toEqual({
      enabled: true,
      mode: "live",
      intents: ["price"],
      hourlyCap: 40,
      dailyCap: 300,
      confirmLive: true,
    });

    // dry_run omits confirmLive from body
    const drySpy = mockFetchJson({
      tenantId: TENANT_ID,
      setting: sampleSettingJson({ enabled: true, mode: "dry_run", intents: ["size"] }),
    });
    await updateAutoReplySetting("123", {
      enabled: true,
      mode: "dry_run",
      intents: ["size"],
      hourlyCap: 30,
      dailyCap: 200,
    });
    expect(JSON.parse(String(drySpy.mock.calls[0]?.[1]?.body ?? "{}"))).toEqual({
      enabled: true,
      mode: "dry_run",
      intents: ["size"],
      hourlyCap: 30,
      dailyCap: 200,
    });
  });
});

describe("auto-reply & clear-attention mutation cache invalidation", () => {
  beforeEach(() => {
    environmentManager.setIsServer(() => false);
    focusManager.setFocused(true);
  });

  afterEach(() => {
    environmentManager.setIsServer(() => isServer);
    focusManager.setFocused(undefined);
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("useClearThreadAttention invalidates only threads and target thread (never inboxKeys.all or updates)", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 60_000 }, mutations: { retry: false } },
    });
    queryClient.setQueryData(meKeys.me(), ACTIVE_ME);

    const threadsKey = inboxKeys.threadList(TENANT_ID, {
      filter: "can_ban",
      channelId: null,
      postJobId: null,
      q: null,
    });
    const threadKey = inboxKeys.thread(TENANT_ID, "root-1");
    const otherThreadKey = inboxKeys.thread(TENANT_ID, "root-2");
    const updatesKey = inboxKeys.updates(TENANT_ID);
    const settingsKey = inboxKeys.autoReplySettings(TENANT_ID);

    queryClient.setQueryData(threadsKey, { pages: [] });
    queryClient.setQueryData(threadKey, {
      pages: [{ tenantId: TENANT_ID, thread: sampleThreadJson(), messages: [], olderCursor: null }],
      pageParams: [null],
    });
    queryClient.setQueryData(otherThreadKey, { pages: [] });
    queryClient.setQueryData(updatesKey, { cursor: "c-1" });
    queryClient.setQueryData(settingsKey, { tenantId: TENANT_ID, items: [] });

    mockFetchJson({
      tenantId: TENANT_ID,
      thread: sampleThreadJson({ attention: null }),
    });

    let mutation!: ReturnType<typeof useClearThreadAttention>;
    function Probe() {
      mutation = useClearThreadAttention();
      return null;
    }
    renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <Probe />
      </QueryClientProvider>,
    );

    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    await mutation.mutateAsync({ threadId: "root-1" });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: inboxKeys.threads(TENANT_ID) });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: inboxKeys.thread(TENANT_ID, "root-1"),
    });
    expect(invalidateSpy).not.toHaveBeenCalledWith({ queryKey: inboxKeys.all(TENANT_ID) });
    expect(invalidateSpy).not.toHaveBeenCalledWith({ queryKey: inboxKeys.updates(TENANT_ID) });
    expect(queryClient.getQueryState(threadsKey)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(threadKey)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(otherThreadKey)?.isInvalidated).toBe(false);
    expect(queryClient.getQueryState(updatesKey)?.isInvalidated).toBe(false);
    expect(queryClient.getQueryState(settingsKey)?.isInvalidated).toBe(false);

    queryClient.clear();
  });

  it("useUpdateAutoReplySetting invalidates only inboxKeys.autoReplySettings", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 60_000 }, mutations: { retry: false } },
    });
    queryClient.setQueryData(meKeys.me(), ACTIVE_ME);

    const settingsKey = inboxKeys.autoReplySettings(TENANT_ID);
    const threadsKey = inboxKeys.threadList(TENANT_ID, {
      filter: "needs_reply",
      channelId: null,
      postJobId: null,
      q: null,
    });
    const updatesKey = inboxKeys.updates(TENANT_ID);

    const initialSetting: AutoReplySetting = AutoReplySettingSchema.parse(sampleSettingJson());
    queryClient.setQueryData(settingsKey, {
      tenantId: TENANT_ID,
      items: [initialSetting],
    });
    queryClient.setQueryData(threadsKey, { pages: [] });
    queryClient.setQueryData(updatesKey, { cursor: "c-1" });

    mockFetchJson({
      tenantId: TENANT_ID,
      setting: sampleSettingJson({ enabled: true, mode: "dry_run", intents: ["price"] }),
    });

    let mutation!: ReturnType<typeof useUpdateAutoReplySetting>;
    function Probe() {
      mutation = useUpdateAutoReplySetting();
      return null;
    }
    renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <Probe />
      </QueryClientProvider>,
    );

    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    await mutation.mutateAsync({
      pageId: "123",
      input: { enabled: true, mode: "dry_run", intents: ["price"], hourlyCap: 30, dailyCap: 200 },
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: inboxKeys.autoReplySettings(TENANT_ID),
    });
    expect(invalidateSpy).toHaveBeenCalledTimes(1);
    expect(queryClient.getQueryState(settingsKey)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(threadsKey)?.isInvalidated).toBe(false);
    expect(queryClient.getQueryState(updatesKey)?.isInvalidated).toBe(false);

    queryClient.clear();
  });
});
