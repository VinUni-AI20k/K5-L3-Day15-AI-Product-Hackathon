import {
  INBOX_ANONYMOUS_CUSTOMER_PREFIX,
  formatAnonymousCustomerTime,
  formatInboxCustomerName,
  type InboxMessageTimeSource,
} from "@/ui/components/inbox/inbox-customer-label";
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

export const COMMENT_SENDER_FALLBACK = INBOX_ANONYMOUS_CUSTOMER_PREFIX;
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

export function formatCommentSender(
  customerName: string | null | undefined,
  firstMessageAt?: string | null,
): string {
  return formatInboxCustomerName(customerName, firstMessageAt);
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
  item: Pick<CommentUpdateItem, "customerName" | "text" | "createdAt">,
  resolvedSender?: string | null,
): string {
  const sender = formatCommentSender(resolvedSender ?? item.customerName, item.createdAt);
  const excerpt = truncateToastExcerpt(item.text);
  return excerpt.length > 0 ? `${sender} vừa bình luận: ${excerpt}` : `${sender} vừa bình luận`;
}

function formatOpenThreadAnnouncement(
  item: Pick<CommentUpdateItem, "customerName" | "text" | "createdAt">,
  resolvedSender?: string | null,
): string {
  const sender = formatCommentSender(resolvedSender ?? item.customerName, item.createdAt);
  const excerpt = truncateToastExcerpt(item.text);
  return excerpt.length > 0 ? `${sender}: ${excerpt}` : `${sender} vừa bình luận`;
}

function formatNeedYouCopy(
  senderName: string | null | undefined,
  reason: string,
  fallbackTime?: string | null,
): string {
  const sender = formatCommentSender(senderName, fallbackTime);
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

function isMatchingThreadRecord(
  candidate: unknown,
  threadId: string,
): candidate is Record<string, unknown> {
  return isRecord(candidate) && candidate.id === threadId;
}

function readExplicitThreadFirstTime(candidate: Record<string, unknown>): string | null {
  for (const key of ["firstMessageAt", "createdAt"] as const) {
    const value = candidate[key];
    if (typeof value === "string" && formatAnonymousCustomerTime(value) !== null) {
      return value.trim();
    }
  }
  return null;
}

function readSummaryThreadTime(candidate: Record<string, unknown>): string | null {
  const lastMessage = candidate.lastMessage;
  if (
    isRecord(lastMessage) &&
    typeof lastMessage.createdAt === "string" &&
    formatAnonymousCustomerTime(lastMessage.createdAt) !== null
  ) {
    return lastMessage.createdAt.trim();
  }
  if (
    typeof candidate.updatedAt === "string" &&
    formatAnonymousCustomerTime(candidate.updatedAt) !== null
  ) {
    return candidate.updatedAt.trim();
  }
  return null;
}

function collectCachedMessages(
  container: Record<string, unknown>,
  out: InboxMessageTimeSource[],
): void {
  if (!Array.isArray(container.messages)) return;
  for (const item of container.messages) {
    if (!isRecord(item)) continue;
    if (typeof item.id !== "string" || typeof item.createdAt !== "string") continue;
    const delivery =
      item.delivery === "sent" || item.delivery === "sending" || item.delivery === "failed"
        ? item.delivery
        : undefined;
    out.push({ id: item.id, createdAt: item.createdAt, delivery });
  }
}

function pickEarliestIso(candidates: readonly string[]): string | null {
  let best: string | null = null;
  let bestMs = Number.POSITIVE_INFINITY;
  for (const iso of candidates) {
    if (formatAnonymousCustomerTime(iso) === null) continue;
    const ms = Date.parse(iso);
    if (ms < bestMs) {
      bestMs = ms;
      best = iso;
    }
  }
  return best;
}

/**
 * Best-effort customer display label lookup against cached inbox thread/list query payloads
 * (`{ thread, messages? }`, `{ items }`, or TanStack infinite `{ pages: [{ thread, messages? }] }`
 * / `{ pages: [{ items }] }`). Prefers any real `customer.name` across pages; for anonymous
 * threads (`customer.name` null/empty), derives `"Khách Facebook · HH:mm dd/MM"` from the
 * thread's first message timestamp.
 */
export function extractCustomerNameFromCache(cached: unknown, threadId: string): string | null {
  if (!isRecord(cached)) return null;

  const matchedThreads: Record<string, unknown>[] = [];
  const matchedMessages: InboxMessageTimeSource[] = [];

  if ("thread" in cached) {
    const direct = readThreadCustomerName(cached.thread, threadId);
    if (direct !== null) return direct;
    if (isMatchingThreadRecord(cached.thread, threadId)) {
      matchedThreads.push(cached.thread);
      collectCachedMessages(cached, matchedMessages);
    }
  }

  if (Array.isArray(cached.items)) {
    for (const item of cached.items) {
      const found = readThreadCustomerName(item, threadId);
      if (found !== null) return found;
      if (isMatchingThreadRecord(item, threadId)) {
        matchedThreads.push(item);
      }
    }
  }

  if (Array.isArray(cached.pages)) {
    for (const page of cached.pages) {
      if (!isRecord(page)) continue;
      if ("thread" in page) {
        const found = readThreadCustomerName(page.thread, threadId);
        if (found !== null) return found;
        if (isMatchingThreadRecord(page.thread, threadId)) {
          matchedThreads.push(page.thread);
          collectCachedMessages(page, matchedMessages);
        }
      }
      if (Array.isArray(page.items)) {
        for (const item of page.items) {
          const found = readThreadCustomerName(item, threadId);
          if (found !== null) return found;
          if (isMatchingThreadRecord(item, threadId)) {
            matchedThreads.push(item);
          }
        }
      }
    }
  }

  if (matchedThreads.length === 0) return null;

  const explicitTimes = matchedThreads
    .map(readExplicitThreadFirstTime)
    .filter((value): value is string => value !== null);
  const explicitFirst = pickEarliestIso(explicitTimes);
  if (explicitFirst) {
    return formatInboxCustomerName(null, explicitFirst);
  }

  if (matchedMessages.length > 0) {
    const rootMsg = matchedMessages.find((msg) => msg.id === threadId);
    if (rootMsg && formatAnonymousCustomerTime(rootMsg.createdAt) !== null) {
      return formatInboxCustomerName(null, rootMsg.createdAt);
    }
    const persisted = matchedMessages.filter(
      (msg) => msg.delivery === undefined || msg.delivery === "sent",
    );
    const pool = persisted.length > 0 ? persisted : matchedMessages;
    const earliestMsg = pickEarliestIso(pool.map((msg) => msg.createdAt));
    if (earliestMsg) {
      return formatInboxCustomerName(null, earliestMsg);
    }
  }

  const summaryTimes = matchedThreads
    .map(readSummaryThreadTime)
    .filter((value): value is string => value !== null);
  const summaryFirst = pickEarliestIso(summaryTimes);
  if (summaryFirst) {
    return formatInboxCustomerName(null, summaryFirst);
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
  const fallbackLabelsByThread = new Map<string, string>();

  function rememberRealName(threadId: string, name: string | null | undefined): string {
    const trimmed = typeof name === "string" ? name.trim() : "";
    if (trimmed.length > 0) {
      customerNamesByThread.set(threadId, trimmed);
      trimBoundedMap(customerNamesByThread, maxTracked);
    }
    return trimmed;
  }

  function rememberFallbackLabel(
    threadId: string,
    fallbackTime: string | null | undefined,
  ): string | null {
    const existing = fallbackLabelsByThread.get(threadId);
    if (existing) return existing;
    if (formatAnonymousCustomerTime(fallbackTime) === null) return null;
    const label = formatInboxCustomerName(null, fallbackTime);
    fallbackLabelsByThread.set(threadId, label);
    trimBoundedMap(fallbackLabelsByThread, maxTracked);
    return label;
  }

  function resolveThreadCustomerLabel(
    threadId: string,
    explicitName: string | null | undefined,
    fallbackTime: string | null | undefined,
    lookupCachedCustomerName?: (threadId: string) => string | null,
  ): string | null {
    const trimmed = rememberRealName(threadId, explicitName);
    if (trimmed.length > 0) return trimmed;

    const knownName = customerNamesByThread.get(threadId);
    if (knownName) return knownName;

    const cached = lookupCachedCustomerName?.(threadId)?.trim() ?? "";
    if (cached.length > 0) return cached;

    return rememberFallbackLabel(threadId, fallbackTime);
  }

  return {
    reset(): void {
      seenMessageIds.clear();
      seenNeedYouKeys.clear();
      seenAutoRepliedKeys.clear();
      customerNamesByThread.clear();
      fallbackLabelsByThread.clear();
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
        resolveThreadCustomerLabel(
          item.threadId,
          item.customerName,
          item.createdAt,
          lookupCachedCustomerName,
        );

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
          const sender = resolveThreadCustomerLabel(
            item.threadId,
            item.customerName,
            item.createdAt,
            lookupCachedCustomerName,
          );
          toasts.push({
            uniqueID: `inbox-comment-${item.messageId}`,
            type: "info",
            body: formatSingleCommentToastBody(item, sender),
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
        const resolvedName = resolveThreadCustomerLabel(
          threadId,
          null,
          null,
          lookupCachedCustomerName,
        );
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
        const resolvedName = resolveThreadCustomerLabel(
          item.threadId,
          item.customerName,
          item.since,
          lookupCachedCustomerName,
        );

        const dedupeKey = buildNeedYouDedupeKey(item);
        if (seenNeedYouKeys.has(dedupeKey)) continue;
        seenNeedYouKeys.add(dedupeKey);
        trimBoundedSet(seenNeedYouKeys, maxTracked);

        const copy = formatNeedYouCopy(resolvedName, item.reason, item.since);

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
        const sender = resolveThreadCustomerLabel(
          item.threadId,
          item.customerName,
          item.createdAt,
          lookupCachedCustomerName,
        );
        liveParts.push(formatOpenThreadAnnouncement(item, sender));
      }
      for (const label of openThreadDraftLabels) {
        liveParts.push(`Đã có nháp AI cho ${label}`);
      }
      for (const msg of openNeedYouAnnouncements) {
        liveParts.push(msg);
      }
      if (freshAutoReplied.length === 1) {
        const single = freshAutoReplied[0];
        const resolvedName = resolveThreadCustomerLabel(
          single.threadId,
          null,
          null,
          lookupCachedCustomerName,
        );
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
