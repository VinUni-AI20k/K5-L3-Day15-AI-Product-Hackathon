import {
  QueryClient,
  QueryObserver,
  environmentManager,
  focusManager,
  isServer,
} from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { inboxKeys } from "@/ui/hooks/inbox-keys";
import {
  COMMENT_UPDATES_BACKOFF_INTERVAL_MS,
  COMMENT_UPDATES_POLL_INTERVAL_MS,
  createCommentUpdatesCursorStore,
  createCommentUpdatesQueryFn,
  invalidateInboxOnUpdates,
  nextCommentUpdatesIntervalMs,
  type CommentUpdatesPollerState,
  type CommentUpdatesTick,
  type SessionStorageLike,
} from "@/ui/hooks/useCommentUpdates";
import {
  CommentUpdatesResponseSchema,
  type CommentUpdateItem,
  type CommentUpdatesResponse,
} from "@/ui/schemas/inbox-updates.schema";
import { ApiError } from "@/ui/services/api-error";
import {
  buildCommentUpdatesPath,
  fetchCommentUpdates,
} from "@/ui/services/inbox-updates.api";

function createMemoryStorage(): SessionStorageLike & { dump(): Record<string, string> } {
  const data = new Map<string, string>();
  return {
    getItem(key: string) {
      return data.has(key) ? data.get(key)! : null;
    },
    setItem(key: string, value: string) {
      data.set(key, value);
    },
    removeItem(key: string) {
      data.delete(key);
    },
    dump() {
      return Object.fromEntries(data.entries());
    },
  };
}

function createThrowingStorage(): SessionStorageLike {
  return {
    getItem() {
      throw new Error("SecurityError: storage blocked");
    },
    setItem() {
      throw new Error("QuotaExceededError: storage blocked");
    },
    removeItem() {
      throw new Error("SecurityError: storage blocked");
    },
  };
}

function makeItem(overrides: Partial<CommentUpdateItem> = {}): CommentUpdateItem {
  return {
    threadId: "thread-1",
    messageId: "msg-1",
    customerName: "Minh Thư",
    text: "Giá mẫu này bao nhiêu vậy shop?",
    createdAt: "2026-11-27T10:00:00.000Z",
    channelName: "WorkHardToday",
    ...overrides,
  };
}

function makeResponse(
  overrides: Partial<CommentUpdatesResponse> = {},
): CommentUpdatesResponse {
  return {
    tenantId: "tenant-1",
    cursor: "2026-11-27T10:00:00.000Z",
    items: [],
    draftsReady: [],
    needYou: [],
    autoReplied: [],
    runningThreadIds: [],
    ...overrides,
  };
}

describe("inbox-updates schema & API service", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("parses initial and incremental updates payloads and normalizes missing customerName", () => {
    const initial = CommentUpdatesResponseSchema.parse({
      tenantId: "t1",
      cursor: "2026-11-27T10:00:00+07:00",
      items: [],
      draftsReady: [],
    });
    expect(initial.cursor).toBe("2026-11-27T10:00:00+07:00");
    expect(initial.items).toEqual([]);

    const incremental = CommentUpdatesResponseSchema.parse({
      tenantId: "t1",
      cursor: "2026-11-27T10:01:00+07:00",
      items: [
        {
          threadId: "th-1",
          messageId: "m-1",
          customerName: null,
          text: "Còn size M không ạ?",
          createdAt: "2026-11-27T10:00:45+07:00",
          channelName: "Shop A",
        },
        {
          threadId: "th-2",
          messageId: "m-2",
          text: "",
          createdAt: "2026-11-27T10:00:50.000Z",
          channelName: "Shop A",
        },
      ],
      draftsReady: ["th-1"],
    });
    expect(incremental.items[0]?.customerName).toBeNull();
    expect(incremental.items[1]?.customerName).toBeNull();
    expect(incremental.draftsReady).toEqual(["th-1"]);

    expect(
      CommentUpdatesResponseSchema.safeParse({
        tenantId: "t1",
        cursor: "",
        items: [],
        draftsReady: [],
      }).success,
    ).toBe(false);
  });

  it("omits `since` on initial request and encodes `since` when provided", async () => {
    expect(buildCommentUpdatesPath()).toBe("/api/comments/updates");
    expect(buildCommentUpdatesPath({ since: null })).toBe("/api/comments/updates");
    expect(buildCommentUpdatesPath({ since: "   " })).toBe("/api/comments/updates");
    expect(buildCommentUpdatesPath({ since: "2026-11-27T10:00:00+07:00" })).toBe(
      "/api/comments/updates?since=2026-11-27T10%3A00%3A00%2B07%3A00",
    );

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(makeResponse({ cursor: "c-0" })), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const res = await fetchCommentUpdates();
    expect(res.cursor).toBe("c-0");
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/comments/updates",
      expect.objectContaining({ method: "GET", cache: "no-store" }),
    );
  });

  it("raises ApiError on malformed response payload", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ tenantId: "t1", bad: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    await expect(fetchCommentUpdates({ since: "c-0" })).rejects.toBeInstanceOf(ApiError);
  });
});

describe("comment updates cursor store & invalidation", () => {
  it("persists cursor per tenant in memory and sessionStorage, and survives throwing storage", () => {
    const storage = createMemoryStorage();
    const store = createCommentUpdatesCursorStore(() => storage);

    expect(store.get("t1")).toBeNull();
    store.set("t1", "cursor-1");
    expect(store.get("t1")).toBe("cursor-1");
    expect(storage.getItem("vpost.inbox.updates-cursor.t1")).toBe("cursor-1");

    // A fresh instance (simulating page reload on the same tenant) restores from sessionStorage.
    const reloaded = createCommentUpdatesCursorStore(() => storage);
    expect(reloaded.get("t1")).toBe("cursor-1");

    // Throwing storage (Safari private mode) falls back to in-memory map without throwing.
    const fallbackStore = createCommentUpdatesCursorStore(() => createThrowingStorage());
    expect(() => fallbackStore.set("t1", "cursor-mem")).not.toThrow();
    expect(fallbackStore.get("t1")).toBe("cursor-mem");
    expect(() => fallbackStore.reset("t1")).not.toThrow();
    expect(fallbackStore.get("t1")).toBeNull();
  });

  it("resets cursors when switching tenants while preserving cursor on same-tenant reload", () => {
    const storage = createMemoryStorage();
    const store = createCommentUpdatesCursorStore(() => storage);

    expect(store.handleTenantTransition("t1")).toBe(false);
    store.set("t1", "c-t1");

    // Reloading on the same tenant keeps the cursor.
    const sameTenantReload = createCommentUpdatesCursorStore(() => storage);
    expect(sameTenantReload.handleTenantTransition("t1")).toBe(false);
    expect(sameTenantReload.get("t1")).toBe("c-t1");

    // Switching from t1 -> t2 clears t1 and ensures t2 starts fresh.
    expect(sameTenantReload.handleTenantTransition("t2")).toBe(true);
    expect(sameTenantReload.get("t1")).toBeNull();
    expect(sameTenantReload.get("t2")).toBeNull();
    sameTenantReload.set("t2", "c-t2");

    // Switching back t2 -> t1 also resets both so old cursors are not replayed.
    expect(sameTenantReload.handleTenantTransition("t1")).toBe(true);
    expect(sameTenantReload.get("t1")).toBeNull();
    expect(sameTenantReload.get("t2")).toBeNull();
  });

  it("invalidates inboxKeys.threads and each affected inboxKeys.thread without touching legacy commentKeys", () => {
    const queryClient = new QueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    invalidateInboxOnUpdates(queryClient, "t1", { items: [], draftsReady: [] });
    expect(invalidateSpy).not.toHaveBeenCalled();

    invalidateInboxOnUpdates(queryClient, "t1", {
      items: [
        makeItem({ threadId: "th-1", messageId: "m-1" }),
        makeItem({ threadId: "th-1", messageId: "m-2" }),
        makeItem({ threadId: "th-2", messageId: "m-3" }),
      ],
      draftsReady: ["th-3"],
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: inboxKeys.threads("t1") });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: inboxKeys.thread("t1", "th-1") });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: inboxKeys.thread("t1", "th-2") });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: inboxKeys.thread("t1", "th-3") });
    expect(invalidateSpy).not.toHaveBeenCalledWith({ queryKey: ["comments", "t1"] });
    // th-1 appeared twice but should only be invalidated once.
    expect(invalidateSpy).toHaveBeenCalledTimes(4);

    // Also invalidates affected threads for needYou and autoReplied
    invalidateSpy.mockClear();
    invalidateInboxOnUpdates(queryClient, "t1", {
      items: [],
      draftsReady: [],
      needYou: [{ threadId: "th-need", customerName: "An", reason: "hỏi ship", since: null }],
      autoReplied: [{ threadId: "th-auto", messageId: "m-auto" }],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: inboxKeys.threads("t1") });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: inboxKeys.thread("t1", "th-need") });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: inboxKeys.thread("t1", "th-auto") });
    expect(invalidateSpy).toHaveBeenCalledTimes(3);
  });
});

describe("TanStack Query polling lifecycle (initial cursor, visibility, catch-up, backoff, tenant switch)", () => {
  beforeEach(() => {
    // Vitest runs in `environment: "node"` where TanStack Query disables refetchInterval
    // unless told we are simulating a client browser tab.
    environmentManager.setIsServer(() => false);
    focusManager.setFocused(true);
  });

  afterEach(() => {
    environmentManager.setIsServer(() => isServer);
    focusManager.setFocused(undefined);
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("bootstraps cursor without `since` (no notifications), polls every 15 s while visible, stops when hidden, and catches up on visibility regain", async () => {
    vi.useFakeTimers();

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const storage = createMemoryStorage();
    const cursorStore = createCommentUpdatesCursorStore(() => storage);
    const state: CommentUpdatesPollerState = {
      consecutiveErrors: 0,
      activeTenantKey: "tenant-1",
      isActive: true,
    };

    const onUpdates = vi.fn<(tick: CommentUpdatesTick) => void>();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const fetcher = vi
      .fn()
      // 1. Initial bootstrap without `since` (even if items present, must NOT notify)
      .mockResolvedValueOnce(
        makeResponse({
          tenantId: "tenant-1",
          cursor: "c-0",
          items: [makeItem({ messageId: "old-1" })],
        }),
      )
      // 2. Normal 15 s poll with `since=c-0`
      .mockResolvedValueOnce(
        makeResponse({
          tenantId: "tenant-1",
          cursor: "c-1",
          items: [makeItem({ threadId: "th-1", messageId: "m-1" })],
        }),
      )
      // 3. Catch-up immediately when tab becomes visible again with `since=c-1`
      .mockResolvedValueOnce(
        makeResponse({
          tenantId: "tenant-1",
          cursor: "c-2",
          items: [makeItem({ threadId: "th-2", messageId: "m-2" })],
        }),
      )
      // 4. Catch-up immediately on window focus regain with `since=c-2`
      .mockResolvedValueOnce(
        makeResponse({
          tenantId: "tenant-1",
          cursor: "c-3",
          items: [makeItem({ threadId: "th-3", messageId: "m-3" })],
        }),
      );

    let isVisible = true;
    const makeOptions = () => ({
      queryKey: inboxKeys.updates("tenant-1"),
      queryFn: createCommentUpdatesQueryFn({
        queryClient,
        tenantKey: "tenant-1",
        tenantId: "tenant-1",
        cursorStore,
        state,
        fetcher,
        onUpdates,
      }),
      enabled: isVisible,
      retry: false as const,
      staleTime: 0,
      gcTime: 0,
      refetchOnWindowFocus: false as const,
      refetchIntervalInBackground: false as const,
      refetchInterval: () => nextCommentUpdatesIntervalMs(state.consecutiveErrors, isVisible),
    });

    const observer = new QueryObserver<CommentUpdatesTick>(queryClient, makeOptions());
    const unsubscribe = observer.subscribe(() => {});

    // Flush initial mount fetch
    await vi.advanceTimersByTimeAsync(0);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenNthCalledWith(1, { since: null }, expect.any(AbortSignal));
    expect(cursorStore.get("tenant-1")).toBe("c-0");
    expect(onUpdates).not.toHaveBeenCalled();
    expect(invalidateSpy).not.toHaveBeenCalled();

    // Advance 15 s -> second poll uses stored cursor c-0 and fires notification + invalidation
    await vi.advanceTimersByTimeAsync(COMMENT_UPDATES_POLL_INTERVAL_MS);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher).toHaveBeenNthCalledWith(2, { since: "c-0" }, expect.any(AbortSignal));
    expect(cursorStore.get("tenant-1")).toBe("c-1");
    expect(onUpdates).toHaveBeenCalledTimes(1);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: inboxKeys.threads("tenant-1") });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: inboxKeys.thread("tenant-1", "th-1") });
    expect(invalidateSpy).not.toHaveBeenCalledWith({ queryKey: ["comments", "tenant-1"] });

    // Tab becomes hidden -> polling stops completely
    isVisible = false;
    focusManager.setFocused(false);
    observer.setOptions(makeOptions());
    await vi.advanceTimersByTimeAsync(120_000);
    expect(fetcher).toHaveBeenCalledTimes(2);

    // Tab regains visibility -> immediate catch-up fetch with stored cursor c-1
    isVisible = true;
    focusManager.setFocused(true);
    observer.setOptions(makeOptions());
    await vi.advanceTimersByTimeAsync(0);
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(fetcher).toHaveBeenNthCalledWith(3, { since: "c-1" }, expect.any(AbortSignal));
    expect(cursorStore.get("tenant-1")).toBe("c-2");
    expect(onUpdates).toHaveBeenCalledTimes(2);

    // Window regains focus while visible -> immediate catch-up fetch with stored cursor c-2
    await observer.refetch({ cancelRefetch: false });
    expect(fetcher).toHaveBeenCalledTimes(4);
    expect(fetcher).toHaveBeenNthCalledWith(4, { since: "c-2" }, expect.any(AbortSignal));
    expect(cursorStore.get("tenant-1")).toBe("c-3");
    expect(onUpdates).toHaveBeenCalledTimes(3);

    // Logout / unmount stops polling
    state.isActive = false;
    unsubscribe();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetcher).toHaveBeenCalledTimes(4);

    queryClient.clear();
  });

  it("backs off to 60 s after consecutive errors, preserves cursor, never triggers error notifications, and recovers to 15 s", async () => {
    vi.useFakeTimers();

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const cursorStore = createCommentUpdatesCursorStore(() => createMemoryStorage());
    cursorStore.handleTenantTransition("tenant-1");
    cursorStore.set("tenant-1", "c-10");

    const state: CommentUpdatesPollerState = {
      consecutiveErrors: 0,
      activeTenantKey: "tenant-1",
      isActive: true,
    };
    const onUpdates = vi.fn();
    const fetcher = vi
      .fn()
      // 1st error
      .mockRejectedValueOnce(new ApiError({ code: "NETWORK", status: 0, userMessage: "err1" }))
      // 2nd consecutive error -> triggers 60 s backoff
      .mockRejectedValueOnce(new ApiError({ code: "UPSTREAM", status: 502, userMessage: "err2" }))
      // Recovery after 60 s
      .mockResolvedValueOnce(
        makeResponse({
          tenantId: "tenant-1",
          cursor: "c-11",
          items: [makeItem({ messageId: "m-recovered" })],
        }),
      )
      // Back to 15 s cadence
      .mockResolvedValueOnce(makeResponse({ tenantId: "tenant-1", cursor: "c-12" }));

    const observer = new QueryObserver<CommentUpdatesTick>(queryClient, {
      queryKey: inboxKeys.updates("tenant-1"),
      queryFn: createCommentUpdatesQueryFn({
        queryClient,
        tenantKey: "tenant-1",
        tenantId: "tenant-1",
        cursorStore,
        state,
        fetcher,
        onUpdates,
      }),
      enabled: true,
      retry: false,
      staleTime: 0,
      gcTime: 0,
      refetchOnWindowFocus: false,
      refetchIntervalInBackground: false,
      refetchInterval: () => nextCommentUpdatesIntervalMs(state.consecutiveErrors, true),
    });

    const unsubscribe = observer.subscribe(() => {});

    // Tick 1 fails -> consecutiveErrors = 1, still 15 s
    await vi.advanceTimersByTimeAsync(0);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(state.consecutiveErrors).toBe(1);
    expect(nextCommentUpdatesIntervalMs(state.consecutiveErrors, true)).toBe(
      COMMENT_UPDATES_POLL_INTERVAL_MS,
    );
    expect(cursorStore.get("tenant-1")).toBe("c-10");
    expect(onUpdates).not.toHaveBeenCalled();

    // Tick 2 fails at +15 s -> consecutiveErrors = 2, backs off to 60 s
    await vi.advanceTimersByTimeAsync(COMMENT_UPDATES_POLL_INTERVAL_MS);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(state.consecutiveErrors).toBe(2);
    expect(nextCommentUpdatesIntervalMs(state.consecutiveErrors, true)).toBe(
      COMMENT_UPDATES_BACKOFF_INTERVAL_MS,
    );
    expect(cursorStore.get("tenant-1")).toBe("c-10");
    expect(onUpdates).not.toHaveBeenCalled();

    // At +15 s and +45 s: still backing off, no fetch yet
    await vi.advanceTimersByTimeAsync(45_000);
    expect(fetcher).toHaveBeenCalledTimes(2);

    // At +60 s total: recovery fetch succeeds with preserved cursor c-10
    await vi.advanceTimersByTimeAsync(15_000);
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(fetcher).toHaveBeenNthCalledWith(3, { since: "c-10" }, expect.any(AbortSignal));
    expect(state.consecutiveErrors).toBe(0);
    expect(cursorStore.get("tenant-1")).toBe("c-11");
    expect(onUpdates).toHaveBeenCalledTimes(1);

    // Back to 15 s cadence
    await vi.advanceTimersByTimeAsync(COMMENT_UPDATES_POLL_INTERVAL_MS);
    expect(fetcher).toHaveBeenCalledTimes(4);
    expect(fetcher).toHaveBeenNthCalledWith(4, { since: "c-11" }, expect.any(AbortSignal));

    unsubscribe();
    queryClient.clear();
  });

  it("resets cursor on tenant switch and drops stale responses belonging to another tenant", async () => {
    const queryClient = new QueryClient();
    const cursorStore = createCommentUpdatesCursorStore(() => createMemoryStorage());
    const state: CommentUpdatesPollerState = {
      consecutiveErrors: 2,
      activeTenantKey: "tenant-1",
      isActive: true,
    };
    const onUpdates = vi.fn();
    const onTenantSwitch = vi.fn();

    // Start on tenant-1 and establish cursor
    const runT1 = createCommentUpdatesQueryFn({
      queryClient,
      tenantKey: "tenant-1",
      tenantId: "tenant-1",
      cursorStore,
      state,
      fetcher: vi.fn().mockResolvedValueOnce(makeResponse({ tenantId: "tenant-1", cursor: "c-a1" })),
      onUpdates,
      onTenantSwitch,
    });
    await runT1({ signal: new AbortController().signal });
    expect(cursorStore.get("tenant-1")).toBe("c-a1");
    expect(onTenantSwitch).not.toHaveBeenCalled();

    // Switch to tenant-2 -> resets previous cursor and fetches without `since`
    state.activeTenantKey = "tenant-2";
    const fetcherT2 = vi
      .fn()
      .mockResolvedValueOnce(makeResponse({ tenantId: "tenant-2", cursor: "c-b1" }));
    const runT2 = createCommentUpdatesQueryFn({
      queryClient,
      tenantKey: "tenant-2",
      tenantId: "tenant-2",
      cursorStore,
      state,
      fetcher: fetcherT2,
      onUpdates,
      onTenantSwitch,
    });
    const tickT2 = await runT2({ signal: new AbortController().signal });
    expect(onTenantSwitch).toHaveBeenCalledTimes(1);
    expect(fetcherT2).toHaveBeenCalledWith({ since: null }, expect.any(AbortSignal));
    expect(tickT2.isInitialCursor).toBe(true);
    expect(cursorStore.get("tenant-1")).toBeNull();
    expect(cursorStore.get("tenant-2")).toBe("c-b1");
    expect(onUpdates).not.toHaveBeenCalled();

    // A stale response returning tenant-1 while tenant-2 is active is dropped safely
    const runStale = createCommentUpdatesQueryFn({
      queryClient,
      tenantKey: "tenant-2",
      tenantId: "tenant-2",
      cursorStore,
      state,
      fetcher: vi.fn().mockResolvedValueOnce(
        makeResponse({
          tenantId: "tenant-1",
          cursor: "c-wrong",
          items: [makeItem({ messageId: "m-leak" })],
        }),
      ),
      onUpdates,
      onTenantSwitch,
    });
    await runStale({ signal: new AbortController().signal });
    expect(cursorStore.get("tenant-2")).toBe("c-b1");
    expect(onUpdates).not.toHaveBeenCalled();
  });

  it("self-heals on 400 INVALID_INPUT by resetting the stored cursor and restarting from a fresh cursor", async () => {
    vi.useFakeTimers();

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const storage = createMemoryStorage();
    const cursorStore = createCommentUpdatesCursorStore(() => storage);
    cursorStore.handleTenantTransition("tenant-1");
    cursorStore.set("tenant-1", "corrupt-legacy-cursor");

    const state: CommentUpdatesPollerState = {
      consecutiveErrors: 1,
      activeTenantKey: "tenant-1",
      isActive: true,
    };
    const onUpdates = vi.fn<(tick: CommentUpdatesTick) => void>();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const fetcher = vi
      .fn()
      // 1. Stored cursor rejected with 400 INVALID_INPUT
      .mockRejectedValueOnce(
        new ApiError({
          code: "INVALID_INPUT",
          status: 400,
          userMessage: "cursor không hợp lệ",
        }),
      )
      // 2. Immediate fresh bootstrap without `since` succeeds
      .mockResolvedValueOnce(
        makeResponse({
          tenantId: "tenant-1",
          cursor: "c-fresh-0",
          items: [makeItem({ messageId: "old-ignored" })],
        }),
      )
      // 3. Subsequent 15 s poll uses the healed cursor and delivers new updates normally
      .mockResolvedValueOnce(
        makeResponse({
          tenantId: "tenant-1",
          cursor: "c-fresh-1",
          items: [makeItem({ threadId: "th-healed", messageId: "m-healed" })],
        }),
      );

    const observer = new QueryObserver<CommentUpdatesTick>(queryClient, {
      queryKey: inboxKeys.updates("tenant-1"),
      queryFn: createCommentUpdatesQueryFn({
        queryClient,
        tenantKey: "tenant-1",
        tenantId: "tenant-1",
        cursorStore,
        state,
        fetcher,
        onUpdates,
      }),
      enabled: true,
      retry: false,
      staleTime: 0,
      gcTime: 0,
      refetchOnWindowFocus: false,
      refetchIntervalInBackground: false,
      refetchInterval: () => nextCommentUpdatesIntervalMs(state.consecutiveErrors, true),
    });

    const unsubscribe = observer.subscribe(() => {});

    // Mount fetch hits 400 INVALID_INPUT -> resets bad cursor -> immediately restarts without `since`
    await vi.advanceTimersByTimeAsync(0);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher).toHaveBeenNthCalledWith(
      1,
      { since: "corrupt-legacy-cursor" },
      expect.any(AbortSignal),
    );
    expect(fetcher).toHaveBeenNthCalledWith(2, { since: null }, expect.any(AbortSignal));
    expect(cursorStore.get("tenant-1")).toBe("c-fresh-0");
    expect(storage.getItem("vpost.inbox.updates-cursor.tenant-1")).toBe("c-fresh-0");
    expect(state.consecutiveErrors).toBe(0);
    expect(onUpdates).not.toHaveBeenCalled();
    expect(invalidateSpy).not.toHaveBeenCalled();

    // Next 15 s tick polls normally with the healed cursor (no 60 s backoff)
    await vi.advanceTimersByTimeAsync(COMMENT_UPDATES_POLL_INTERVAL_MS);
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(fetcher).toHaveBeenNthCalledWith(3, { since: "c-fresh-0" }, expect.any(AbortSignal));
    expect(cursorStore.get("tenant-1")).toBe("c-fresh-1");
    expect(onUpdates).toHaveBeenCalledTimes(1);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: inboxKeys.thread("tenant-1", "th-healed") });

    unsubscribe();
    queryClient.clear();
  });

  it("keeps the bad cursor cleared if fresh-cursor restart fails and never loops when `since` was already null", async () => {
    const queryClient = new QueryClient();
    const storage = createMemoryStorage();
    const cursorStore = createCommentUpdatesCursorStore(() => storage);
    cursorStore.handleTenantTransition("tenant-1");
    cursorStore.set("tenant-1", "bad-cursor");

    const state: CommentUpdatesPollerState = {
      consecutiveErrors: 0,
      activeTenantKey: "tenant-1",
      isActive: true,
    };

    const failingRestartFetcher = vi
      .fn()
      .mockRejectedValueOnce(
        new ApiError({ code: "INVALID_INPUT", status: 400, userMessage: "cursor không hợp lệ" }),
      )
      .mockRejectedValueOnce(
        new ApiError({ code: "UPSTREAM", status: 503, userMessage: "server unavailable" }),
      );

    const runWithBadCursor = createCommentUpdatesQueryFn({
      queryClient,
      tenantKey: "tenant-1",
      tenantId: "tenant-1",
      cursorStore,
      state,
      fetcher: failingRestartFetcher,
    });

    await expect(runWithBadCursor({ signal: new AbortController().signal })).rejects.toMatchObject({
      code: "UPSTREAM",
      status: 503,
    });
    expect(failingRestartFetcher).toHaveBeenCalledTimes(2);
    expect(failingRestartFetcher).toHaveBeenNthCalledWith(
      1,
      { since: "bad-cursor" },
      expect.any(AbortSignal),
    );
    expect(failingRestartFetcher).toHaveBeenNthCalledWith(
      2,
      { since: null },
      expect.any(AbortSignal),
    );
    expect(cursorStore.get("tenant-1")).toBeNull();
    expect(storage.getItem("vpost.inbox.updates-cursor.tenant-1")).toBeNull();
    expect(state.consecutiveErrors).toBe(1);

    // When `since` is already null, 400 INVALID_INPUT must NOT trigger a second retry in the same tick.
    const alreadyNullFetcher = vi.fn().mockRejectedValueOnce(
      new ApiError({ code: "INVALID_INPUT", status: 400, userMessage: "invalid" }),
    );
    const runWithoutCursor = createCommentUpdatesQueryFn({
      queryClient,
      tenantKey: "tenant-1",
      tenantId: "tenant-1",
      cursorStore,
      state,
      fetcher: alreadyNullFetcher,
    });

    await expect(runWithoutCursor({ signal: new AbortController().signal })).rejects.toMatchObject({
      code: "INVALID_INPUT",
      status: 400,
    });
    expect(alreadyNullFetcher).toHaveBeenCalledTimes(1);
    expect(state.consecutiveErrors).toBe(2);
  });
});
