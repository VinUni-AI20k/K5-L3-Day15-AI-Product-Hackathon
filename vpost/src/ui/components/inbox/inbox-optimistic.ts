import type {
  InboxMessage,
  InboxThreadDetailResponse,
} from "@/ui/schemas/inbox.schema";

/**
 * Pure optimistic reply state & strict `clientId`-only reconciliation.
 *
 * Rules:
 * - Every fresh send gets a new `clientId`.
 * - Reconciliation matches strictly by `clientId` (or confirmed server `id`),
 *   NEVER by message text — two identical replies stay distinct.
 * - Failed sends stay in place with their text and `clientId` intact so "Thử lại"
 *   resends using the exact same `clientId`.
 * - 422 `BLOCKED` sends are removed from the message stream and shown inline
 *   under the composer instead.
 */

export type OptimisticMessagesByThread = Readonly<
  Record<string, readonly InboxMessage[]>
>;

let fallbackCounter = 0;

/** Generates a fresh UUID `clientId` for idempotent reply submission. */
export function createClientId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  fallbackCounter += 1;
  const timeHex = Date.now().toString(16).padStart(12, "0");
  const countHex = fallbackCounter.toString(16).padStart(4, "0");
  const randHex = Math.floor(Math.random() * 0xffffffff)
    .toString(16)
    .padStart(8, "0");
  return `${timeHex.slice(0, 8)}-${timeHex.slice(8, 12)}-4${countHex.slice(1, 4)}-a${randHex.slice(0, 3)}-${randHex}${countHex}`;
}

export interface CreateOptimisticReplyInput {
  readonly threadId: string;
  readonly pageId: string;
  readonly channelName: string;
  readonly text: string;
  readonly clientId: string;
  readonly createdAt?: string;
}

/** Builds an optimistic Page message bubble in `"sending"` delivery state. */
export function createOptimisticReplyMessage(
  input: CreateOptimisticReplyInput,
): InboxMessage {
  return {
    id: `optimistic:${input.clientId}`,
    threadId: input.threadId,
    fromPage: true,
    fromId: input.pageId,
    fromName: input.channelName.trim() || "Fanpage",
    text: input.text,
    createdAt: input.createdAt ?? new Date().toISOString(),
    permalinkUrl: null,
    isHidden: false,
    canComment: true,
    likedByPage: false,
    delivery: "sending",
    errorCode: null,
    userMessage: null,
    clientId: input.clientId,
    moderation: null,
    sentBy: "operator",
    agentRunId: null,
  };
}

/** Appends a new optimistic message or replaces an existing entry with the same `clientId`. */
export function upsertOptimisticMessage(
  map: OptimisticMessagesByThread,
  message: InboxMessage,
): OptimisticMessagesByThread {
  const existing = map[message.threadId] ?? [];
  const idx =
    message.clientId !== null
      ? existing.findIndex((item) => item.clientId === message.clientId)
      : -1;
  const nextList =
    idx >= 0
      ? existing.map((item, i) => (i === idx ? message : item))
      : [...existing, message];
  return {
    ...map,
    [message.threadId]: nextList,
  };
}

/** Marks an optimistic reply as failed in place, retaining its exact text and `clientId`. */
export function markOptimisticMessageFailed(
  map: OptimisticMessagesByThread,
  params: {
    readonly threadId: string;
    readonly clientId: string;
    readonly errorCode: string | null;
    readonly userMessage: string;
  },
): OptimisticMessagesByThread {
  const existing = map[params.threadId];
  if (!existing || existing.length === 0) return map;

  let changed = false;
  const nextList = existing.map((item) => {
    if (item.clientId !== params.clientId) return item;
    changed = true;
    return {
      ...item,
      delivery: "failed" as const,
      errorCode: params.errorCode,
      userMessage: params.userMessage,
    };
  });

  if (!changed) return map;
  return {
    ...map,
    [params.threadId]: nextList,
  };
}

/**
 * Transitions a failed message (either in-memory optimistic or server-persisted
 * across reload) back to `"sending"` reusing its exact `clientId` and text.
 */
export function markMessageRetrying(
  map: OptimisticMessagesByThread,
  message: InboxMessage,
): OptimisticMessagesByThread {
  const clientId = message.clientId ?? createClientId();
  const retryingCopy: InboxMessage = {
    ...message,
    clientId,
    delivery: "sending",
    errorCode: null,
    userMessage: null,
  };
  return upsertOptimisticMessage(map, retryingCopy);
}

/** Reconciles a confirmed server reply strictly by `clientId` without touching other sends. */
export function reconcileOptimisticMessageSent(
  map: OptimisticMessagesByThread,
  params: {
    readonly threadId: string;
    readonly clientId: string;
    readonly serverMessage: InboxMessage;
  },
): OptimisticMessagesByThread {
  const existing = map[params.threadId];
  const reconciled: InboxMessage = {
    ...params.serverMessage,
    clientId: params.serverMessage.clientId ?? params.clientId,
    delivery: "sent",
    errorCode: null,
    userMessage: null,
  };

  if (!existing || existing.length === 0) {
    return {
      ...map,
      [params.threadId]: [reconciled],
    };
  }

  let matched = false;
  const nextList = existing.map((item) => {
    if (item.clientId !== params.clientId) return item;
    matched = true;
    return reconciled;
  });

  return {
    ...map,
    [params.threadId]: matched ? nextList : [...nextList, reconciled],
  };
}

/** Removes an optimistic bubble by `clientId` (used on 422 `BLOCKED` rejections). */
export function removeOptimisticMessage(
  map: OptimisticMessagesByThread,
  params: { readonly threadId: string; readonly clientId: string },
): OptimisticMessagesByThread {
  const existing = map[params.threadId];
  if (!existing || existing.length === 0) return map;
  const nextList = existing.filter((item) => item.clientId !== params.clientId);
  if (nextList.length === existing.length) return map;
  if (nextList.length === 0) {
    const next = { ...map };
    delete next[params.threadId];
    return next;
  }
  return {
    ...map,
    [params.threadId]: nextList,
  };
}

/**
 * Drops optimistic entries that are now confirmed in `serverMessages` by `clientId`
 * or server `id`. Pending (`sending`) or locally failed entries stay untouched.
 */
export function pruneConfirmedOptimisticMessages(
  map: OptimisticMessagesByThread,
  threadId: string,
  serverMessages: readonly InboxMessage[],
): OptimisticMessagesByThread {
  const existing = map[threadId];
  if (!existing || existing.length === 0) return map;

  const serverSentClientIds = new Set<string>();
  const serverSentIds = new Set<string>();
  for (const msg of serverMessages) {
    if (msg.delivery === "sent") {
      serverSentIds.add(msg.id);
      if (msg.clientId) serverSentClientIds.add(msg.clientId);
    }
  }

  const remaining = existing.filter((opt) => {
    if (opt.delivery !== "sent") return true;
    if (opt.clientId && serverSentClientIds.has(opt.clientId)) return false;
    if (serverSentIds.has(opt.id)) return false;
    return true;
  });

  if (remaining.length === existing.length) return map;
  if (remaining.length === 0) {
    const next = { ...map };
    delete next[threadId];
    return next;
  }
  return {
    ...map,
    [threadId]: remaining,
  };
}

/**
 * Flattens reverse-paginated `GET /api/comments/threads/{id}` pages into
 * chronological oldest → newest order, deduplicating by message `id`.
 */
export function flattenThreadPages(
  pages: readonly InboxThreadDetailResponse[],
): InboxMessage[] {
  if (pages.length === 0) return [];
  const seenIds = new Set<string>();
  const ordered: InboxMessage[] = [];
  // Page 0 holds the newest slice; subsequent pages hold older slices.
  for (let i = pages.length - 1; i >= 0; i -= 1) {
    for (const msg of pages[i].messages) {
      if (seenIds.has(msg.id)) continue;
      seenIds.add(msg.id);
      ordered.push(msg);
    }
  }
  return ordered;
}

/**
 * Merges server messages with local optimistic/retrying messages strictly by
 * `clientId` (and server `id`), NEVER by text content.
 *
 * - When a server message shares a `clientId` with a local entry:
 *   - If the local entry is actively retrying (`sending`) or has a newer local
 *     retry failure/confirmation while the server copy is still `failed`, the
 *     local state overlays the server entry IN PLACE.
 *   - Otherwise the server message wins and the optimistic copy is omitted.
 * - Unmatched optimistic entries are appended in order at the bottom.
 */
export function mergeThreadMessages(
  serverMessages: readonly InboxMessage[],
  optimisticMessages: readonly InboxMessage[],
): InboxMessage[] {
  if (optimisticMessages.length === 0) {
    return [...serverMessages];
  }

  const optByClientId = new Map<string, InboxMessage>();
  const optById = new Map<string, InboxMessage>();
  for (const opt of optimisticMessages) {
    if (opt.clientId) optByClientId.set(opt.clientId, opt);
    if (!opt.id.startsWith("optimistic:")) optById.set(opt.id, opt);
  }

  const consumedClientIds = new Set<string>();
  const consumedIds = new Set<string>();

  const merged = serverMessages.map((serverMsg) => {
    const matchedOpt =
      (serverMsg.clientId ? optByClientId.get(serverMsg.clientId) : undefined) ??
      optById.get(serverMsg.id);

    if (!matchedOpt) return serverMsg;

    if (matchedOpt.clientId) consumedClientIds.add(matchedOpt.clientId);
    consumedIds.add(matchedOpt.id);

    // Server already confirmed `sent` — server is authoritative.
    if (serverMsg.delivery === "sent") {
      return serverMsg;
    }

    // Server still shows `failed` (or `sending`), while client is actively
    // retrying or just received confirmation — overlay in place.
    return matchedOpt;
  });

  for (const opt of optimisticMessages) {
    if (opt.clientId && consumedClientIds.has(opt.clientId)) continue;
    if (consumedIds.has(opt.id)) continue;
    merged.push(opt);
  }

  return merged;
}

export interface ThreadReplyQueue {
  /**
   * Queues a reply dispatch sequentially per `threadId` so rapid consecutive
   * sends on the same thread wait for the previous one to settle before firing,
   * avoiding backend `409 CONFLICT` collisions while keeping sends on different
   * threads concurrent.
   */
  enqueue<T>(threadId: string, task: () => Promise<T>): Promise<T>;
  /** True while at least one reply dispatch is queued or in flight for `threadId`. */
  isBusy(threadId: string): boolean;
}

/** Creates an isolated per-thread FIFO queue for reply & retry mutations. */
export function createThreadReplyQueue(): ThreadReplyQueue {
  const tails = new Map<string, Promise<void>>();

  return {
    enqueue<T>(threadId: string, task: () => Promise<T>): Promise<T> {
      const prev = tails.get(threadId) ?? Promise.resolve();
      const result = prev.then(() => task());
      const settled = result.then(
        () => undefined,
        () => undefined,
      );
      tails.set(threadId, settled);
      void settled.then(() => {
        if (tails.get(threadId) === settled) {
          tails.delete(threadId);
        }
      });
      return result;
    },
    isBusy(threadId: string): boolean {
      return tails.has(threadId);
    },
  };
}
