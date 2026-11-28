import type {
  CommentUpdateAutoRepliedItem,
  CommentUpdateItem,
  CommentUpdateNeedYouItem,
  CommentUpdatesResponse,
} from "@/ui/schemas/inbox-updates.schema";

/** Up to this many non-open comment items trigger individual toasts; more group into one. */
export const MAX_INDIVIDUAL_COMMENT_TOASTS = 3;

/** Keep toast excerpts single-line and short so operators can scan them within 5 s. */
export const TOAST_EXCERPT_MAX_CHARS = 60;

/** Upper bound for per-tenant seen message IDs and thread name cache. */
export const MAX_TRACKED_ENTRIES = 500;

export const COMMENT_SENDER_FALLBACK = "Khách hàng";
export const DRAFT_CUSTOMER_FALLBACK = "khách";

export interface PlannedToast {
  readonly uniqueID: string;
  readonly type: "info";
  readonly body: string;
  readonly actionLabel: "Xem";
  readonly actionHref: string;
  readonly collisionBehavior: "ignore";
}

export interface InboxNotificationPlan {
  readonly toasts: readonly PlannedToast[];
  readonly liveAnnouncement: string | null;
}

/**
 * Extracts the currently open conversation thread ID from the URL when on `/comments`.
 * Returns `null` on other routes or when `?thread=` is absent/empty.
 */
export function getActiveThreadId(
  pathname: string | null | undefined,
  searchParams: Pick<URLSearchParams, "get"> | null | undefined,
): string | null {
  if (
    typeof pathname === "string" &&
    pathname !== "/comments" &&
    !pathname.startsWith("/comments/")
  ) {
    return null;
  }
  const raw = searchParams?.get("thread")?.trim() ?? "";
  return raw.length > 0 ? raw : null;
}

/** Collapses whitespace and trims long comment text for toast and live-region copy. */
export function truncateToastExcerpt(
  text: string,
  maxChars = TOAST_EXCERPT_MAX_CHARS,
): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, maxChars).trimEnd()}…`;
}

export function formatCommentSender(customerName: string | null | undefined): string {
  const trimmed = typeof customerName === "string" ? customerName.trim() : "";
  return trimmed.length > 0 ? trimmed : COMMENT_SENDER_FALLBACK;
}

export function formatDraftCustomer(customerName: string | null | undefined): string {
  const trimmed = typeof customerName === "string" ? customerName.trim() : "";
  return trimmed.length > 0 ? trimmed : DRAFT_CUSTOMER_FALLBACK;
}

export function buildThreadHref(threadId: string): string {
  return `/comments?thread=${encodeURIComponent(threadId)}`;
}

/**
 * Builds the deduplication key for a `needYou` ("Cần bạn") escalation item.
 * Uses `threadId + since` when the server provides `since`, and falls back
 * cleanly to `threadId + normalized reason` if `since` is omitted.
 */
export function buildNeedYouDedupeKey(
  item: Pick<CommentUpdateNeedYouItem, "threadId" | "since" | "reason">,
): string {
  const since = typeof item.since === "string" ? item.since.trim() : "";
  if (since.length > 0) {
    return `${item.threadId}:${since}`;
  }
  const normalizedReason = item.reason.replace(/\s+/g, " ").trim();
  return `${item.threadId}:reason:${normalizedReason}`;
}

function formatSingleCommentToastBody(
  item: Pick<CommentUpdateItem, "customerName" | "text">,
): string {
  const sender = formatCommentSender(item.customerName);
  const excerpt = truncateToastExcerpt(item.text);
  return excerpt.length > 0 ? `${sender} vừa bình luận: ${excerpt}` : `${sender} vừa bình luận`;
}

function formatOpenThreadAnnouncement(
  item: Pick<CommentUpdateItem, "customerName" | "text">,
): string {
  const sender = formatCommentSender(item.customerName);
  const excerpt = truncateToastExcerpt(item.text);
  return excerpt.length > 0 ? `${sender}: ${excerpt}` : `${sender} vừa bình luận`;
}

function formatNeedYouCopy(
  senderName: string | null | undefined,
  reason: string,
): string {
  const sender = formatCommentSender(senderName);
  const reasonExcerpt = truncateToastExcerpt(reason);
  return reasonExcerpt.length > 0
    ? `Cần bạn: ${sender} — ${reasonExcerpt}`
    : `Cần bạn: ${sender}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readThreadCustomerName(candidate: unknown, threadId: string): string | null {
  if (!isRecord(candidate)) return null;
  if (candidate.id !== threadId) return null;
  const customer = candidate.customer;
  if (!isRecord(customer)) return null;
  if (typeof customer.name !== "string") return null;
  const trimmed = customer.name.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Best-effort customer name lookup against cached inbox thread/list query payloads
 * (`{ thread }`, `{ items }`, or TanStack infinite `{ pages: [{ thread }] }` / `{ pages: [{ items }] }`).
 */
export function extractCustomerNameFromCache(cached: unknown, threadId: string): string | null {
  if (!isRecord(cached)) return null;

  if ("thread" in cached) {
    const direct = readThreadCustomerName(cached.thread, threadId);
    if (direct !== null) return direct;
  }

  if (Array.isArray(cached.items)) {
    for (const item of cached.items) {
      const found = readThreadCustomerName(item, threadId);
      if (found !== null) return found;
    }
  }

  if (Array.isArray(cached.pages)) {
    for (const page of cached.pages) {
      if (!isRecord(page)) continue;
      if ("thread" in page) {
        const found = readThreadCustomerName(page.thread, threadId);
        if (found !== null) return found;
      }
      if (Array.isArray(page.items)) {
        for (const item of page.items) {
          const found = readThreadCustomerName(item, threadId);
          if (found !== null) return found;
        }
      }
    }
  }

  return null;
}

function trimBoundedSet(set: Set<string>, limit: number): void {
  while (set.size > limit) {
    const oldest = set.values().next().value;
    if (oldest === undefined) break;
    set.delete(oldest);
  }
}

function trimBoundedMap<V>(map: Map<string, V>, limit: number): void {
  while (map.size > limit) {
    const oldest = map.keys().next().value;
    if (oldest === undefined) break;
    map.delete(oldest);
  }
}

export interface PlanInboxNotificationsInput {
  readonly response: CommentUpdatesResponse;
  readonly isInitialCursor: boolean;
  readonly activeThreadId: string | null;
  readonly lookupCachedCustomerName?: (threadId: string) => string | null;
}

export interface InboxNotificationTracker {
  plan(input: PlanInboxNotificationsInput): InboxNotificationPlan;
  reset(): void;
}

/**
 * Stateful per-tenant planner for comment updates notifications:
 * - Never emits toasts on the initial cursor bootstrap.
 * - Deduplicates customer comment items by `messageId` across ticks and within a tick.
 * - Suppresses toasts for the currently open thread (`?thread=` === `threadId`) and emits
 *   a polite live-region announcement (`sender + short text`) instead.
 * - Shows up to 3 individual comment toasts, or 1 grouped "Có N bình luận mới" toast (>3).
 * - Shows an info toast "Đã có nháp AI cho <Tên hoặc 'khách'>" for non-open `draftsReady`.
 * - Shows "Cần bạn: {Tên} — {reason}" toasts with "Xem" for `needYou`, deduped by
 *   `threadId + since` (fallback `threadId + reason`), or polite live announcement when
 *   that thread is already open.
 * - Updates `autoReplied` silently (never shows a toast; emits polite live-region copy only).
 */
export function createInboxNotificationTracker(
  maxTracked = MAX_TRACKED_ENTRIES,
): InboxNotificationTracker {
  const seenMessageIds = new Set<string>();
  const seenNeedYouKeys = new Set<string>();
  const seenAutoRepliedKeys = new Set<string>();
  const customerNamesByThread = new Map<string, string>();

  return {
    reset(): void {
      seenMessageIds.clear();
      seenNeedYouKeys.clear();
      seenAutoRepliedKeys.clear();
      customerNamesByThread.clear();
    },

    plan({
      response,
      isInitialCursor,
      activeThreadId,
      lookupCachedCustomerName,
    }: PlanInboxNotificationsInput): InboxNotificationPlan {
      if (isInitialCursor) {
        return { toasts: [], liveAnnouncement: null };
      }

      const freshItems: CommentUpdateItem[] = [];
      for (const item of response.items) {
        const trimmedName = item.customerName?.trim() ?? "";
        if (trimmedName.length > 0) {
          customerNamesByThread.set(item.threadId, trimmedName);
          trimBoundedMap(customerNamesByThread, maxTracked);
        }

        if (seenMessageIds.has(item.messageId)) continue;
        seenMessageIds.add(item.messageId);
        trimBoundedSet(seenMessageIds, maxTracked);
        freshItems.push(item);
      }

      const openThreadItems: CommentUpdateItem[] = [];
      const toastableItems: CommentUpdateItem[] = [];
      for (const item of freshItems) {
        if (activeThreadId !== null && item.threadId === activeThreadId) {
          openThreadItems.push(item);
        } else {
          toastableItems.push(item);
        }
      }

      const toasts: PlannedToast[] = [];

      if (toastableItems.length > 0 && toastableItems.length <= MAX_INDIVIDUAL_COMMENT_TOASTS) {
        for (const item of toastableItems) {
          toasts.push({
            uniqueID: `inbox-comment-${item.messageId}`,
            type: "info",
            body: formatSingleCommentToastBody(item),
            actionLabel: "Xem",
            actionHref: buildThreadHref(item.threadId),
            collisionBehavior: "ignore",
          });
        }
      } else if (toastableItems.length > MAX_INDIVIDUAL_COMMENT_TOASTS) {
        toasts.push({
          uniqueID: `inbox-comments-group-${response.cursor}`,
          type: "info",
          body: `Có ${toastableItems.length} bình luận mới`,
          actionLabel: "Xem",
          actionHref: "/comments",
          collisionBehavior: "ignore",
        });
      }

      const openThreadDraftLabels: string[] = [];
      const uniqueDraftThreadIds = new Set(response.draftsReady);
      for (const threadId of uniqueDraftThreadIds) {
        const resolvedName =
          customerNamesByThread.get(threadId) ?? lookupCachedCustomerName?.(threadId) ?? null;
        const customerLabel = formatDraftCustomer(resolvedName);

        if (activeThreadId !== null && threadId === activeThreadId) {
          openThreadDraftLabels.push(customerLabel);
        } else {
          toasts.push({
            uniqueID: `inbox-draft-${threadId}`,
            type: "info",
            body: `Đã có nháp AI cho ${customerLabel}`,
            actionLabel: "Xem",
            actionHref: buildThreadHref(threadId),
            collisionBehavior: "ignore",
          });
        }
      }

      // "Cần bạn" escalations: deduped by threadId + since (fallback threadId + reason).
      const openNeedYouAnnouncements: string[] = [];
      for (const item of response.needYou ?? []) {
        const trimmedName = item.customerName?.trim() ?? "";
        if (trimmedName.length > 0) {
          customerNamesByThread.set(item.threadId, trimmedName);
          trimBoundedMap(customerNamesByThread, maxTracked);
        }

        const dedupeKey = buildNeedYouDedupeKey(item);
        if (seenNeedYouKeys.has(dedupeKey)) continue;
        seenNeedYouKeys.add(dedupeKey);
        trimBoundedSet(seenNeedYouKeys, maxTracked);

        const resolvedName =
          trimmedName ||
          customerNamesByThread.get(item.threadId) ||
          lookupCachedCustomerName?.(item.threadId) ||
          null;
        const copy = formatNeedYouCopy(resolvedName, item.reason);

        if (activeThreadId !== null && item.threadId === activeThreadId) {
          openNeedYouAnnouncements.push(copy);
        } else {
          toasts.push({
            uniqueID: `inbox-need-you-${dedupeKey}`,
            type: "info",
            body: copy,
            actionLabel: "Xem",
            actionHref: buildThreadHref(item.threadId),
            collisionBehavior: "ignore",
          });
        }
      }

      // Auto-replied updates: silent (never show a toast; polite live region only).
      const freshAutoReplied: CommentUpdateAutoRepliedItem[] = [];
      for (const item of response.autoReplied ?? []) {
        const dedupeKey = `${item.threadId}:${item.messageId}`;
        if (seenAutoRepliedKeys.has(dedupeKey)) continue;
        seenAutoRepliedKeys.add(dedupeKey);
        trimBoundedSet(seenAutoRepliedKeys, maxTracked);
        freshAutoReplied.push(item);
      }

      const liveParts: string[] = [];
      for (const item of openThreadItems) {
        liveParts.push(formatOpenThreadAnnouncement(item));
      }
      for (const label of openThreadDraftLabels) {
        liveParts.push(`Đã có nháp AI cho ${label}`);
      }
      for (const msg of openNeedYouAnnouncements) {
        liveParts.push(msg);
      }
      if (freshAutoReplied.length === 1) {
        const single = freshAutoReplied[0];
        const resolvedName =
          customerNamesByThread.get(single.threadId) ??
          lookupCachedCustomerName?.(single.threadId) ??
          null;
        liveParts.push(
          resolvedName
            ? `Đã tự động trả lời cho ${resolvedName}`
            : "Đã tự động trả lời 1 bình luận",
        );
      } else if (freshAutoReplied.length > 1) {
        liveParts.push(`Đã tự động trả lời ${freshAutoReplied.length} bình luận`);
      }

      return {
        toasts,
        liveAnnouncement: liveParts.length > 0 ? liveParts.join(" · ") : null,
      };
    },
  };
}
