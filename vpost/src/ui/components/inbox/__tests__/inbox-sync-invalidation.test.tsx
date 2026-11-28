import {
  QueryClient,
  QueryClientProvider,
  QueryObserver,
  environmentManager,
  focusManager,
  isServer,
} from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { inboxKeys } from "@/ui/hooks/inbox-keys";
import { useInboxSyncComments } from "@/ui/hooks/useInbox";
import type { MeResponse } from "@/ui/schemas/me.schema";
import { DEFAULT_MODERATION_LOG_FILTER } from "@/ui/schemas/moderation.schema";
import { meKeys } from "@/ui/services/me.api";
import { moderationKeys } from "@/ui/services/moderation.api";

const TENANT_ID = "00000000-0000-4000-8000-000000000001";
const OTHER_TENANT_ID = "00000000-0000-4000-8000-000000000002";

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

function createSyncMutationHarness(queryClient: QueryClient) {
  let captured: ReturnType<typeof useInboxSyncComments> | null = null;

  function Probe() {
    captured = useInboxSyncComments();
    return null;
  }

  renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <Probe />
    </QueryClientProvider>,
  );

  if (!captured) {
    throw new Error("Expected useInboxSyncComments hook to render");
  }
  return captured as ReturnType<typeof useInboxSyncComments>;
}

async function waitForSettledFetches(queryClient: QueryClient): Promise<void> {
  for (let i = 0; i < 10; i += 1) {
    await Promise.resolve();
    if (queryClient.isFetching() === 0) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

describe("useInboxSyncComments cache invalidation (Review #2 New Finding #4)", () => {
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

  it("invalidates only threads, thread details, and moderation — never inboxKeys.updates or unrelated inbox caches", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: 60_000 },
        mutations: { retry: false },
      },
    });
    queryClient.setQueryData(meKeys.me(), ACTIVE_ME);

    const threadsKey = inboxKeys.threadList(TENANT_ID, {
      filter: "needs_reply",
      channelId: null,
      postJobId: null,
      q: null,
    });
    const openThreadKey = inboxKeys.thread(TENANT_ID, "thread-open");
    const cachedThreadKey = inboxKeys.thread(TENANT_ID, "thread-cached");
    const updatesKey = inboxKeys.updates(TENANT_ID);
    const quickRepliesKey = inboxKeys.quickReplies(TENANT_ID);
    const customerTagsKey = inboxKeys.customerTags(TENANT_ID);
    const customerKey = inboxKeys.customer(TENANT_ID, "cust-1");
    const modSettingsKey = moderationKeys.settings(TENANT_ID);
    const modLogKey = moderationKeys.log(TENANT_ID, DEFAULT_MODERATION_LOG_FILTER);

    const otherTenantThreadsKey = inboxKeys.threadList(OTHER_TENANT_ID, {
      filter: "needs_reply",
      channelId: null,
      postJobId: null,
      q: null,
    });
    const otherTenantThreadKey = inboxKeys.thread(OTHER_TENANT_ID, "thread-open");
    const otherTenantUpdatesKey = inboxKeys.updates(OTHER_TENANT_ID);

    const threadsFetcher = vi.fn(async () => ({ items: [] }));
    const openThreadFetcher = vi.fn(async () => ({ messages: [] }));
    const updatesFetcher = vi.fn(async () => ({ cursor: "c-1", items: [], draftsReady: [] }));
    const quickRepliesFetcher = vi.fn(async () => ({ items: [] }));
    const customerTagsFetcher = vi.fn(async () => ({ items: [] }));
    const customerFetcher = vi.fn(async () => ({ id: "cust-1" }));

    const unsubscribers = [
      new QueryObserver(queryClient, {
        queryKey: threadsKey,
        queryFn: threadsFetcher,
      }).subscribe(() => {}),
      new QueryObserver(queryClient, {
        queryKey: openThreadKey,
        queryFn: openThreadFetcher,
      }).subscribe(() => {}),
      new QueryObserver(queryClient, {
        queryKey: updatesKey,
        queryFn: updatesFetcher,
      }).subscribe(() => {}),
      new QueryObserver(queryClient, {
        queryKey: quickRepliesKey,
        queryFn: quickRepliesFetcher,
      }).subscribe(() => {}),
      new QueryObserver(queryClient, {
        queryKey: customerTagsKey,
        queryFn: customerTagsFetcher,
      }).subscribe(() => {}),
      new QueryObserver(queryClient, {
        queryKey: customerKey,
        queryFn: customerFetcher,
      }).subscribe(() => {}),
    ];

    try {
      await waitForSettledFetches(queryClient);
      expect(threadsFetcher).toHaveBeenCalledTimes(1);
      expect(openThreadFetcher).toHaveBeenCalledTimes(1);
      expect(updatesFetcher).toHaveBeenCalledTimes(1);
      expect(quickRepliesFetcher).toHaveBeenCalledTimes(1);
      expect(customerTagsFetcher).toHaveBeenCalledTimes(1);
      expect(customerFetcher).toHaveBeenCalledTimes(1);

      // Seed inactive cached queries + another tenant's cache.
      queryClient.setQueryData(cachedThreadKey, { pages: [] });
      queryClient.setQueryData(modSettingsKey, { items: [] });
      queryClient.setQueryData(modLogKey, { pages: [] });
      queryClient.setQueryData(otherTenantThreadsKey, { pages: [] });
      queryClient.setQueryData(otherTenantThreadKey, { pages: [] });
      queryClient.setQueryData(otherTenantUpdatesKey, { cursor: "c-other" });

      vi.stubGlobal(
        "fetch",
        vi.fn(async () =>
          new Response(
            JSON.stringify({
              tenantId: TENANT_ID,
              syncedPosts: 2,
              newComments: 1,
              updatedComments: 0,
              errors: [],
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          ),
        ),
      );

      const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
      const syncMutation = createSyncMutationHarness(queryClient);

      await syncMutation.mutateAsync({});
      await waitForSettledFetches(queryClient);

      // Must NEVER invalidate the broad inboxKeys.all prefix or inboxKeys.updates.
      expect(invalidateSpy).not.toHaveBeenCalledWith({
        queryKey: inboxKeys.all(TENANT_ID),
      });
      expect(invalidateSpy).not.toHaveBeenCalledWith({
        queryKey: inboxKeys.updates(TENANT_ID),
      });

      // Active updates poller and unrelated inbox caches must NOT refetch or become invalidated.
      expect(updatesFetcher).toHaveBeenCalledTimes(1);
      expect(queryClient.getQueryState(updatesKey)?.isInvalidated).toBe(false);
      expect(quickRepliesFetcher).toHaveBeenCalledTimes(1);
      expect(queryClient.getQueryState(quickRepliesKey)?.isInvalidated).toBe(false);
      expect(customerTagsFetcher).toHaveBeenCalledTimes(1);
      expect(queryClient.getQueryState(customerTagsKey)?.isInvalidated).toBe(false);
      expect(customerFetcher).toHaveBeenCalledTimes(1);
      expect(queryClient.getQueryState(customerKey)?.isInvalidated).toBe(false);

      // Active thread list + open thread refetch once; inactive cached thread & moderation caches mark stale.
      expect(threadsFetcher).toHaveBeenCalledTimes(2);
      expect(openThreadFetcher).toHaveBeenCalledTimes(2);
      expect(queryClient.getQueryState(cachedThreadKey)?.isInvalidated).toBe(true);
      expect(queryClient.getQueryState(modSettingsKey)?.isInvalidated).toBe(true);
      expect(queryClient.getQueryState(modLogKey)?.isInvalidated).toBe(true);

      // Tenant isolation preserved.
      expect(queryClient.getQueryState(otherTenantThreadsKey)?.isInvalidated).toBe(false);
      expect(queryClient.getQueryState(otherTenantThreadKey)?.isInvalidated).toBe(false);
      expect(queryClient.getQueryState(otherTenantUpdatesKey)?.isInvalidated).toBe(false);
    } finally {
      for (const unsubscribe of unsubscribers) unsubscribe();
      queryClient.clear();
    }
  });

  it("also spares inboxKeys.updates when manual sync fails and settles with an error", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: 60_000 },
        mutations: { retry: false },
      },
    });
    queryClient.setQueryData(meKeys.me(), ACTIVE_ME);

    const threadsKey = inboxKeys.threadList(TENANT_ID, {
      filter: "needs_reply",
      channelId: null,
      postJobId: null,
      q: null,
    });
    const threadKey = inboxKeys.thread(TENANT_ID, "thread-1");
    const updatesKey = inboxKeys.updates(TENANT_ID);

    const updatesFetcher = vi.fn(async () => ({ cursor: "c-1", items: [], draftsReady: [] }));
    const unsubscribe = new QueryObserver(queryClient, {
      queryKey: updatesKey,
      queryFn: updatesFetcher,
    }).subscribe(() => {});

    try {
      await waitForSettledFetches(queryClient);
      expect(updatesFetcher).toHaveBeenCalledTimes(1);

      queryClient.setQueryData(threadsKey, { pages: [] });
      queryClient.setQueryData(threadKey, { pages: [] });

      vi.stubGlobal(
        "fetch",
        vi.fn(async () =>
          new Response(
            JSON.stringify({ code: "UPSTREAM_ERROR", message: "Facebook tạm lỗi" }),
            { status: 502, headers: { "content-type": "application/json" } },
          ),
        ),
      );

      const syncMutation = createSyncMutationHarness(queryClient);
      await expect(syncMutation.mutateAsync({})).rejects.toBeDefined();
      await waitForSettledFetches(queryClient);

      expect(updatesFetcher).toHaveBeenCalledTimes(1);
      expect(queryClient.getQueryState(updatesKey)?.isInvalidated).toBe(false);
      expect(queryClient.getQueryState(threadsKey)?.isInvalidated).toBe(true);
      expect(queryClient.getQueryState(threadKey)?.isInvalidated).toBe(true);
    } finally {
      unsubscribe();
      queryClient.clear();
    }
  });
});
