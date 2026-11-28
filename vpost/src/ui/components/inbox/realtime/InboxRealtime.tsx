"use client";

import { useAnnounce, type AnnounceFn } from "@astryxdesign/core/hooks";
import { Link } from "@astryxdesign/core/Link";
import { useToast, type ToastDismissFn } from "@astryxdesign/core/Toast";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef } from "react";

import { inboxKeys } from "@/ui/hooks/inbox-keys";
import { useCommentUpdates, type CommentUpdatesTick } from "@/ui/hooks/useCommentUpdates";
import { useActiveTenant } from "@/ui/hooks/useMe";

import {
  createInboxNotificationTracker,
  extractCustomerNameFromCache,
  getActiveThreadId,
  type InboxNotificationPlan,
  type InboxNotificationTracker,
} from "./realtime-notifications";

/**
 * Trailing action link rendered inside Astryx `Toast` (`endContent`).
 * Uses Astryx `Link`, which routes through `AppLink` via `LinkProvider` in `AppFrame`.
 */
export function InboxToastAction({
  href,
  label,
  onClick,
}: {
  href: string;
  label: string;
  onClick?: () => void;
}) {
  return (
    <Link href={href} hasUnderline onClick={onClick}>
      {label}
    </Link>
  );
}

/**
 * Looks up a thread's cached customer name from `inboxKeys.thread` (including
 * `useInfiniteQuery` `{ pages: [{ thread }] }` cache entries) and `inboxKeys.threads`.
 */
export function lookupCachedCustomerName(
  queryClient: Pick<QueryClient, "getQueryData" | "getQueriesData">,
  tenantKey: string,
  threadId: string,
): string | null {
  const direct = extractCustomerNameFromCache(
    queryClient.getQueryData(inboxKeys.thread(tenantKey, threadId)),
    threadId,
  );
  if (direct !== null) return direct;

  const listEntries = queryClient.getQueriesData({
    queryKey: inboxKeys.threads(tenantKey),
  });
  for (const [, data] of listEntries) {
    const found = extractCustomerNameFromCache(data, threadId);
    if (found !== null) return found;
  }
  return null;
}

export interface DispatchInboxNotificationsDeps {
  readonly showToast: ReturnType<typeof useToast>;
  readonly announce: AnnounceFn;
}

/**
 * Dispatches planned inbox toasts and polite screen-reader announcements.
 * Uses Astryx `useAnnounce` (clear-then-rAF-set) so identical consecutive
 * open-thread announcements are always re-announced by assistive technology.
 */
export function dispatchInboxNotificationPlan(
  plan: InboxNotificationPlan,
  { showToast, announce }: DispatchInboxNotificationsDeps,
): void {
  for (const planned of plan.toasts) {
    let dismiss: ToastDismissFn | null = null;
    dismiss = showToast({
      type: planned.type,
      body: planned.body,
      uniqueID: planned.uniqueID,
      collisionBehavior: planned.collisionBehavior,
      endContent: (
        <InboxToastAction
          href={planned.actionHref}
          label={planned.actionLabel}
          onClick={() => dismiss?.()}
        />
      ),
    });
  }

  if (plan.liveAnnouncement !== null) {
    announce(plan.liveAnnouncement, "polite");
  }
}

function InboxRealtimePoller() {
  const showToast = useToast();
  const announce = useAnnounce();
  const queryClient = useQueryClient();
  const { tenantKey } = useActiveTenant();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const activeThreadId = getActiveThreadId(pathname, searchParams);
  const activeThreadIdRef = useRef<string | null>(activeThreadId);
  const trackerRef = useRef<InboxNotificationTracker | null>(null);

  useEffect(() => {
    activeThreadIdRef.current = activeThreadId;
  }, [activeThreadId]);

  const getTracker = useCallback((): InboxNotificationTracker => {
    if (trackerRef.current === null) {
      trackerRef.current = createInboxNotificationTracker();
    }
    return trackerRef.current;
  }, []);

  const lookupCustomerName = useCallback(
    (threadId: string): string | null =>
      lookupCachedCustomerName(queryClient, tenantKey, threadId),
    [queryClient, tenantKey],
  );

  const handleTenantSwitch = useCallback(() => {
    trackerRef.current?.reset();
    announce("", "polite");
  }, [announce]);

  const handleUpdates = useCallback(
    (tick: CommentUpdatesTick) => {
      const plan = getTracker().plan({
        response: tick.response,
        isInitialCursor: tick.isInitialCursor,
        activeThreadId: activeThreadIdRef.current,
        lookupCachedCustomerName: lookupCustomerName,
      });

      dispatchInboxNotificationPlan(plan, { showToast, announce });
    },
    [announce, getTracker, lookupCustomerName, showToast],
  );

  useCommentUpdates({
    onUpdates: handleUpdates,
    onTenantSwitch: handleTenantSwitch,
  });

  return null;
}

/**
 * Mounted once inside the authenticated app shell (`AppFrame`).
 * Polls `/api/comments/updates`, invalidates inbox queries, shows Astryx toasts,
 * and announces open-thread updates via Astryx's polite live region (`useAnnounce`).
 */
export function InboxRealtime() {
  return (
    <Suspense fallback={null}>
      <InboxRealtimePoller />
    </Suspense>
  );
}
