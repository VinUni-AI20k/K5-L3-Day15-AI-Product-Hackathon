import type { InboxMessage, InboxThread } from "@/ui/schemas/inbox.schema";

/**
 * Pure scroll & list-pinning math for the chat thread and conversation list.
 *
 * - Auto-scroll to newest only when already near the bottom; otherwise show
 *   a "Có N tin mới" pill.
 * - Loading older messages keeps the scroll position anchored.
 * - Conversation list never reorders under the pointer while scrolled; new
 *   threads accumulate behind a "Có N hội thoại mới" banner until applied.
 */

export const CHAT_BOTTOM_THRESHOLD_PX = 48;
export const CHAT_TOP_LOAD_THRESHOLD_PX = 64;
export const LIST_TOP_PIN_THRESHOLD_PX = 16;

export interface ScrollMetrics {
  readonly scrollTop: number;
  readonly clientHeight: number;
  readonly scrollHeight: number;
}

/** True when the scroll container is resting at or within `threshold` px of the bottom. */
export function isScrolledNearBottom(
  metrics: ScrollMetrics,
  threshold = CHAT_BOTTOM_THRESHOLD_PX,
): boolean {
  const distanceFromBottom =
    metrics.scrollHeight - (metrics.scrollTop + metrics.clientHeight);
  return distanceFromBottom <= threshold;
}

/** True when the scroll container is near the top edge (trigger older history fetch). */
export function isScrolledNearTop(
  scrollTop: number,
  threshold = CHAT_TOP_LOAD_THRESHOLD_PX,
): boolean {
  return scrollTop <= threshold;
}

/**
 * Computes the new `scrollTop` after older messages prepend at the top so the
 * previously visible message stays visually anchored in place.
 */
export function computeAnchoredScrollTop(params: {
  readonly prevScrollHeight: number;
  readonly prevScrollTop: number;
  readonly nextScrollHeight: number;
}): number {
  const heightDelta = Math.max(0, params.nextScrollHeight - params.prevScrollHeight);
  return params.prevScrollTop + heightDelta;
}

/** Collects all non-null `clientId` values currently present in `messages`. */
export function collectKnownClientIds(
  messages: readonly Pick<InboxMessage, "clientId">[],
): Set<string> {
  const ids = new Set<string>();
  for (const msg of messages) {
    if (msg.clientId) ids.add(msg.clientId);
  }
  return ids;
}

/**
 * Counts newly arrived trailing messages that were not present in `knownIds`.
 * - Older prepended messages (appearing before the previous newest message) do
 *   NOT count as unread trailing arrivals.
 * - Own replies reconciled from `optimistic:<clientId>` to a server Facebook ID
 *   (or still pending locally) match `previousKnownClientIds` and NEVER count
 *   as unseen arrivals.
 */
export function countNewTrailingMessages(
  previousKnownIds: ReadonlySet<string>,
  nextMessages: readonly InboxMessage[],
  previousKnownClientIds?: ReadonlySet<string>,
): number {
  if (previousKnownIds.size === 0 || nextMessages.length === 0) return 0;

  // Walk backward from newest until we hit a settled message that was already known.
  let count = 0;
  for (let i = nextMessages.length - 1; i >= 0; i -= 1) {
    const msg = nextMessages[i];
    if (previousKnownIds.has(msg.id)) {
      if (msg.delivery === "sent") break;
      continue;
    }
    if (msg.clientId && previousKnownClientIds?.has(msg.clientId)) {
      continue;
    }
    count += 1;
  }
  return count;
}

export interface ChatOlderAnchor {
  readonly threadId: string;
  readonly prevScrollHeight: number;
  readonly prevScrollTop: number;
  readonly prevFirstId: string | null;
}

export interface ChatScrollTrackerState {
  readonly initializedThreadId: string | null;
  readonly isAtBottom: boolean;
  readonly knownMessageIds: ReadonlySet<string>;
  readonly knownClientIds: ReadonlySet<string>;
  readonly lastSeenOwnSendSeq: number;
  readonly olderAnchor: ChatOlderAnchor | null;
}

export type ChatScrollTransitionEffect =
  | { readonly kind: "noop" }
  | { readonly kind: "scroll-to-bottom"; readonly resetUnseen: boolean }
  | { readonly kind: "restore-anchor"; readonly scrollTop: number }
  | { readonly kind: "increment-unseen"; readonly delta: number };

/**
 * Pure state transition for `ChatThreadPane`'s layout scroll effect:
 * 1. Thread switch (`initializedThreadId !== threadId`) ALWAYS takes precedence
 *    over any pending `olderAnchor` from the previous thread and resets scroll/
 *    known/unseen state cleanly even when switching directly to a cached thread.
 * 2. Older history prepend restores the scroll anchor for the SAME thread only.
 * 3. Operator's own send jumps to bottom and clears unseen count.
 * 4. Subsequent arrivals auto-scroll when at bottom, or bump unseen count for
 *    genuinely new messages (excluding own reconciled `clientId`s).
 */
export function reconcileChatScrollState(params: {
  readonly state: ChatScrollTrackerState;
  readonly threadId: string | null;
  readonly messages: readonly InboxMessage[];
  readonly lastOwnSendSeq: number;
  readonly scrollHeight: number;
  readonly hasScrollElement: boolean;
}): {
  readonly nextState: ChatScrollTrackerState;
  readonly effect: ChatScrollTransitionEffect;
} {
  const { state, threadId, messages, lastOwnSendSeq, scrollHeight, hasScrollElement } = params;

  // 1. Thread switch always clears stale anchor/known state first.
  if (state.initializedThreadId !== threadId) {
    if (!hasScrollElement || !threadId || messages.length === 0) {
      return {
        nextState: {
          initializedThreadId: null,
          isAtBottom: true,
          knownMessageIds: new Set(),
          knownClientIds: new Set(),
          lastSeenOwnSendSeq: lastOwnSendSeq,
          olderAnchor: null,
        },
        effect: { kind: "noop" },
      };
    }

    return {
      nextState: {
        initializedThreadId: threadId,
        isAtBottom: true,
        knownMessageIds: new Set(messages.map((m) => m.id)),
        knownClientIds: collectKnownClientIds(messages),
        lastSeenOwnSendSeq: lastOwnSendSeq,
        olderAnchor: null,
      },
      effect: { kind: "scroll-to-bottom", resetUnseen: true },
    };
  }

  if (!hasScrollElement || !threadId || messages.length === 0) {
    return { nextState: state, effect: { kind: "noop" } };
  }

  const firstId = messages[0]?.id ?? null;

  // 2. Restore scroll anchor when older history prepended at the top of the SAME thread.
  if (
    state.olderAnchor &&
    state.olderAnchor.threadId === threadId &&
    firstId !== null &&
    firstId !== state.olderAnchor.prevFirstId
  ) {
    const anchoredTop = computeAnchoredScrollTop({
      prevScrollHeight: state.olderAnchor.prevScrollHeight,
      prevScrollTop: state.olderAnchor.prevScrollTop,
      nextScrollHeight: scrollHeight,
    });
    return {
      nextState: {
        ...state,
        olderAnchor: null,
        knownMessageIds: new Set(messages.map((m) => m.id)),
        knownClientIds: collectKnownClientIds(messages),
      },
      effect: { kind: "restore-anchor", scrollTop: anchoredTop },
    };
  }

  // 3. Operator just sent a reply -> jump to bottom to show their bubble.
  if (lastOwnSendSeq !== state.lastSeenOwnSendSeq) {
    return {
      nextState: {
        ...state,
        lastSeenOwnSendSeq: lastOwnSendSeq,
        isAtBottom: true,
        knownMessageIds: new Set(messages.map((m) => m.id)),
        knownClientIds: collectKnownClientIds(messages),
      },
      effect: { kind: "scroll-to-bottom", resetUnseen: true },
    };
  }

  // 4. Subsequent messages arriving in the same thread.
  const addedAtBottom = countNewTrailingMessages(
    state.knownMessageIds,
    messages,
    state.knownClientIds,
  );
  const nextKnownIds = new Set(messages.map((m) => m.id));
  const nextKnownClientIds = collectKnownClientIds(messages);

  if (addedAtBottom > 0) {
    if (state.isAtBottom) {
      return {
        nextState: {
          ...state,
          knownMessageIds: nextKnownIds,
          knownClientIds: nextKnownClientIds,
        },
        effect: { kind: "scroll-to-bottom", resetUnseen: true },
      };
    }
    return {
      nextState: {
        ...state,
        knownMessageIds: nextKnownIds,
        knownClientIds: nextKnownClientIds,
      },
      effect: { kind: "increment-unseen", delta: addedAtBottom },
    };
  }

  return {
    nextState: {
      ...state,
      knownMessageIds: nextKnownIds,
      knownClientIds: nextKnownClientIds,
    },
    effect: { kind: "noop" },
  };
}

/**
 * Compares two threads using the backend's exact `(updatedAt, id)` ordering.
 * Returns `> 0` when `a` is newer than `b`, `< 0` when `a` is older than `b`.
 */
function compareThreadOrder(
  a: Pick<InboxThread, "id" | "updatedAt">,
  b: Pick<InboxThread, "id" | "updatedAt">,
): number {
  const ta = Date.parse(a.updatedAt);
  const tb = Date.parse(b.updatedAt);
  if (Number.isFinite(ta) && Number.isFinite(tb) && ta !== tb) {
    return ta - tb;
  }
  if (a.updatedAt !== b.updatedAt) {
    return a.updatedAt < b.updatedAt ? -1 : 1;
  }
  if (a.id === b.id) return 0;
  return a.id < b.id ? -1 : 1;
}

export interface PinnedThreadListResult {
  readonly visible: readonly InboxThread[];
  readonly pendingNewCount: number;
}

/**
 * Prevents the conversation list from jumping/reordering under the operator's
 * pointer while scrolled down, while still rendering infinite-scroll page 2+:
 * - At the top (`!isListScrolled`): renders `latestFromServer` directly.
 * - While scrolled (`isListScrolled`):
 *   - Keeps existing pinned rows in their original order with fields refreshed
 *     in place (unread badge, lastMessage, tags).
 *   - Appends newly paginated older threads (strictly older than the oldest
 *     pinned snapshot entry by `(updatedAt, id)`) at the bottom without
 *     triggering the "Có N hội thoại mới" banner.
 *   - Counts only genuinely new arrivals (at/above the pinned snapshot) or
 *     existing rows bumped ahead of the top pinned row in `pendingNewCount`.
 */
export function reconcileVisibleThreads(params: {
  readonly currentVisible: readonly InboxThread[];
  readonly latestFromServer: readonly InboxThread[];
  readonly isListScrolled: boolean;
}): PinnedThreadListResult {
  if (!params.isListScrolled || params.currentVisible.length === 0) {
    return {
      visible: params.latestFromServer,
      pendingNewCount: 0,
    };
  }

  const latestById = new Map<string, InboxThread>();
  const serverIndexById = new Map<string, number>();
  for (let i = 0; i < params.latestFromServer.length; i += 1) {
    const thread = params.latestFromServer[i];
    latestById.set(thread.id, thread);
    if (!serverIndexById.has(thread.id)) {
      serverIndexById.set(thread.id, i);
    }
  }

  // Anchor tail to the oldest item in the pinned snapshot so paginated older pages
  // append cleanly even if the snapshot's last row later left the filter or updated.
  let tailAnchor = params.currentVisible[0];
  for (let i = 1; i < params.currentVisible.length; i += 1) {
    if (compareThreadOrder(params.currentVisible[i], tailAnchor) < 0) {
      tailAnchor = params.currentVisible[i];
    }
  }

  const visibleIds = new Set<string>();
  const pinned: InboxThread[] = [];
  for (const prev of params.currentVisible) {
    const fresh = latestById.get(prev.id);
    if (fresh) {
      pinned.push(fresh);
      visibleIds.add(fresh.id);
    }
  }

  if (pinned.length === 0) {
    return {
      visible: params.latestFromServer,
      pendingNewCount: 0,
    };
  }

  const headAnchor = pinned[0];
  const headServerIndex = serverIndexById.get(headAnchor.id) ?? 0;
  const appendedOlder: InboxThread[] = [];
  let pendingNewCount = 0;

  for (let i = 0; i < params.latestFromServer.length; i += 1) {
    const thread = params.latestFromServer[i];
    const promotedAheadOfHead = i < headServerIndex;
    if (!visibleIds.has(thread.id)) {
      if (!promotedAheadOfHead && compareThreadOrder(thread, tailAnchor) < 0) {
        appendedOlder.push(thread);
        visibleIds.add(thread.id);
      } else {
        pendingNewCount += 1;
      }
    } else if (
      thread.id !== headAnchor.id &&
      (promotedAheadOfHead || compareThreadOrder(thread, headAnchor) > 0)
    ) {
      pendingNewCount += 1;
    }
  }

  return {
    visible: appendedOlder.length > 0 ? [...pinned, ...appendedOlder] : pinned,
    pendingNewCount,
  };
}
