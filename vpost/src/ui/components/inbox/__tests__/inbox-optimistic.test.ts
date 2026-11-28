import { describe, expect, it } from "vitest";

import {
  createOptimisticReplyMessage,
  createThreadReplyQueue,
  flattenThreadPages,
  markMessageRetrying,
  markOptimisticMessageFailed,
  mergeThreadMessages,
  pruneConfirmedOptimisticMessages,
  reconcileOptimisticMessageSent,
  removeOptimisticMessage,
  upsertOptimisticMessage,
  type OptimisticMessagesByThread,
} from "@/ui/components/inbox/inbox-optimistic";
import {
  collectKnownClientIds,
  computeAnchoredScrollTop,
  countNewTrailingMessages,
  isScrolledNearBottom,
  isScrolledNearTop,
  reconcileChatScrollState,
  reconcileVisibleThreads,
  type ChatScrollTrackerState,
} from "@/ui/components/inbox/inbox-scroll-state";
import type { InboxMessage, InboxThread } from "@/ui/schemas/inbox.schema";

function makeMessage(overrides: Partial<InboxMessage> = {}): InboxMessage {
  return {
    id: "m1",
    threadId: "t1",
    fromPage: false,
    fromId: "u1",
    fromName: "Minh Thư",
    text: "Còn size M không?",
    createdAt: "2026-11-27T10:00:00+07:00",
    permalinkUrl: null,
    isHidden: false,
    canComment: true,
    likedByPage: false,
    delivery: "sent",
    errorCode: null,
    userMessage: null,
    clientId: null,
    moderation: null,
    ...overrides,
  };
}

function makeThread(id: string, updatedAt: string): InboxThread {
  return {
    id,
    channelId: "fb-1",
    channelName: "WorkHardToday",
    pageId: "123",
    postJobId: "job-1",
    productCode: "G1",
    postCaption: "Caption",
    postUrl: null,
    postImageUrl: null,
    customer: { id: `u-${id}`, name: `Khách ${id}`, tags: [] },
    lastMessage: { id: `lm-${id}`, fromPage: false, text: "Xin chào", createdAt: updatedAt },
    needsReply: true,
    unread: true,
    unreadCount: 1,
    status: "open",
    isHidden: false,
    messageCount: 1,
    hasPhone: false,
    draft: null,
    moderation: null,
    updatedAt,
  };
}

describe("optimistic reconciliation by clientId (never by text)", () => {
  it("reconciles two identical-text sends independently using clientId only", () => {
    const serverBase = [makeMessage({ id: "root-1", threadId: "t1" })];
    let map: OptimisticMessagesByThread = {};

    // Operator sends the EXACT SAME text twice in quick succession
    const opt1 = createOptimisticReplyMessage({
      threadId: "t1",
      pageId: "123",
      channelName: "WorkHardToday",
      text: "Cảm ơn bạn nhé!",
      clientId: "cid-1",
      createdAt: "2026-11-27T10:01:00+07:00",
    });
    const opt2 = createOptimisticReplyMessage({
      threadId: "t1",
      pageId: "123",
      channelName: "WorkHardToday",
      text: "Cảm ơn bạn nhé!",
      clientId: "cid-2",
      createdAt: "2026-11-27T10:01:05+07:00",
    });

    map = upsertOptimisticMessage(map, opt1);
    map = upsertOptimisticMessage(map, opt2);

    // Both optimistic bubbles appear in the merged stream
    const bothSending = mergeThreadMessages(serverBase, map.t1 ?? []);
    expect(bothSending).toHaveLength(3);
    expect(bothSending[1].clientId).toBe("cid-1");
    expect(bothSending[1].delivery).toBe("sending");
    expect(bothSending[2].clientId).toBe("cid-2");
    expect(bothSending[2].delivery).toBe("sending");

    // Server confirms cid-1 ONLY — cid-2 must stay "sending" even though its text matches!
    const confirmed1 = makeMessage({
      id: "srv-msg-1",
      threadId: "t1",
      fromPage: true,
      text: "Cảm ơn bạn nhé!",
      delivery: "sent",
      clientId: "cid-1",
      createdAt: "2026-11-27T10:01:01+07:00",
    });
    map = reconcileOptimisticMessageSent(map, {
      threadId: "t1",
      clientId: "cid-1",
      serverMessage: confirmed1,
    });

    const afterFirstConfirm = mergeThreadMessages(
      [...serverBase, confirmed1],
      map.t1 ?? [],
    );
    expect(afterFirstConfirm).toHaveLength(3);
    expect(afterFirstConfirm[1].id).toBe("srv-msg-1");
    expect(afterFirstConfirm[1].delivery).toBe("sent");
    expect(afterFirstConfirm[2].clientId).toBe("cid-2");
    expect(afterFirstConfirm[2].delivery).toBe("sending");

    // Pruning drops only cid-1, preserving cid-2
    map = pruneConfirmedOptimisticMessages(map, "t1", [...serverBase, confirmed1]);
    expect(map.t1).toHaveLength(1);
    expect(map.t1?.[0].clientId).toBe("cid-2");
  });

  it("keeps failed send in place with exact text and reuses clientId on retry (optimistic + persisted)", () => {
    const serverBase = [makeMessage({ id: "root-1", threadId: "t1" })];
    let map: OptimisticMessagesByThread = {};

    const opt = createOptimisticReplyMessage({
      threadId: "t1",
      pageId: "123",
      channelName: "WorkHardToday",
      text: "Dạ mẫu G1 giá 890.000đ ạ",
      clientId: "cid-retry-1",
    });
    map = upsertOptimisticMessage(map, opt);
    map = markOptimisticMessageFailed(map, {
      threadId: "t1",
      clientId: "cid-retry-1",
      errorCode: "UPSTREAM_ERROR",
      userMessage: "Facebook tạm gián đoạn.",
    });

    const failedList = mergeThreadMessages(serverBase, map.t1 ?? []);
    expect(failedList[1].delivery).toBe("failed");
    expect(failedList[1].text).toBe("Dạ mẫu G1 giá 890.000đ ạ");
    expect(failedList[1].clientId).toBe("cid-retry-1");
    expect(failedList[1].userMessage).toBe("Facebook tạm gián đoạn.");

    // Retry reuses the EXACT SAME clientId and stays in place
    map = markMessageRetrying(map, failedList[1]);
    const retryingList = mergeThreadMessages(serverBase, map.t1 ?? []);
    expect(retryingList).toHaveLength(2);
    expect(retryingList[1].delivery).toBe("sending");
    expect(retryingList[1].clientId).toBe("cid-retry-1");
    expect(retryingList[1].text).toBe("Dạ mẫu G1 giá 890.000đ ạ");

    // Persisted failed message after reload overlays in place without duplicating
    const persistedFailed = makeMessage({
      id: "srv-fail-9",
      threadId: "t1",
      fromPage: true,
      text: "Tin lỗi từ phiên trước",
      delivery: "failed",
      errorCode: "UPSTREAM_ERROR",
      userMessage: "Lỗi mạng",
      clientId: "cid-persisted-9",
    });
    const retryPersistedMap = markMessageRetrying({}, persistedFailed);
    const mergedReload = mergeThreadMessages(
      [serverBase[0], persistedFailed],
      retryPersistedMap.t1 ?? [],
    );
    expect(mergedReload).toHaveLength(2);
    expect(mergedReload[1].delivery).toBe("sending");
    expect(mergedReload[1].clientId).toBe("cid-persisted-9");
    expect(mergedReload[1].text).toBe("Tin lỗi từ phiên trước");
  });

  it("removes optimistic bubble on 422 BLOCKED and flattens older pages oldest -> newest", () => {
    let map: OptimisticMessagesByThread = {};
    const opt = createOptimisticReplyMessage({
      threadId: "t1",
      pageId: "123",
      channelName: "Page",
      text: "Freeship",
      clientId: "cid-blocked",
    });
    map = upsertOptimisticMessage(map, opt);
    map = removeOptimisticMessage(map, { threadId: "t1", clientId: "cid-blocked" });
    expect(map.t1).toBeUndefined();

    const t = makeThread("t1", "2026-11-27T10:05:00+07:00");
    const flattened = flattenThreadPages([
      {
        tenantId: "tn",
        thread: t,
        messages: [makeMessage({ id: "m3" }), makeMessage({ id: "m4" })],
        olderCursor: "c1",
      },
      {
        tenantId: "tn",
        thread: t,
        messages: [makeMessage({ id: "m1" }), makeMessage({ id: "m2" }), makeMessage({ id: "m3" })],
        olderCursor: null,
      },
    ]);
    expect(flattened.map((m) => m.id)).toEqual(["m1", "m2", "m3", "m4"]);
  });
});

describe("scroll anchoring, new-message detection, thread switching, list pinning, and reply queuing", () => {
  it("detects bottom/top edges, anchors scroll on older prepend, and counts trailing new messages only", () => {
    expect(
      isScrolledNearBottom({ scrollTop: 460, clientHeight: 500, scrollHeight: 1000 }),
    ).toBe(true);
    expect(
      isScrolledNearBottom({ scrollTop: 300, clientHeight: 500, scrollHeight: 1000 }),
    ).toBe(false);
    expect(isScrolledNearTop(40)).toBe(true);
    expect(isScrolledNearTop(120)).toBe(false);

    expect(
      computeAnchoredScrollTop({
        prevScrollHeight: 800,
        prevScrollTop: 20,
        nextScrollHeight: 1400,
      }),
    ).toBe(620);

    // Prepended older message m0 does NOT count as trailing new; m3 & m4 at end DO count.
    const known = new Set(["m1", "m2"]);
    expect(
      countNewTrailingMessages(known, [
        makeMessage({ id: "m0" }),
        makeMessage({ id: "m1" }),
        makeMessage({ id: "m2" }),
      ]),
    ).toBe(0);
    expect(
      countNewTrailingMessages(known, [
        makeMessage({ id: "m1" }),
        makeMessage({ id: "m2" }),
        makeMessage({ id: "m3" }),
        makeMessage({ id: "m4" }),
      ]),
    ).toBe(2);
  });

  it("keeps list pinned while scrolled, appends page 2+ older threads, and never shows a fake new-threads banner", () => {
    const t1 = makeThread("t1", "2026-11-27T10:00:00+07:00");
    const t2 = makeThread("t2", "2026-11-27T09:00:00+07:00");
    const t3New = makeThread("t3", "2026-11-27T10:05:00+07:00");

    // While scrolled down: existing rows stay in their order and t3New accumulates in pendingNewCount
    const pinned = reconcileVisibleThreads({
      currentVisible: [t1, t2],
      latestFromServer: [t3New, t1, t2],
      isListScrolled: true,
    });
    expect(pinned.visible.map((t) => t.id)).toEqual(["t1", "t2"]);
    expect(pinned.pendingNewCount).toBe(1);

    // When back at top: applies latestFromServer immediately
    const unpinned = reconcileVisibleThreads({
      currentVisible: [t1, t2],
      latestFromServer: [t3New, t1, t2],
      isListScrolled: false,
    });
    expect(unpinned.visible.map((t) => t.id)).toEqual(["t3", "t1", "t2"]);
    expect(unpinned.pendingNewCount).toBe(0);

    // Finding #2: infinite scroll loads page 2 (older threads) while scrolled down
    const page1 = Array.from({ length: 30 }, (_, idx) => {
      const minute = String(59 - idx).padStart(2, "0");
      return makeThread(`t-${String(idx + 1).padStart(2, "0")}`, `2026-11-27T10:${minute}:00+07:00`);
    });
    const page2 = Array.from({ length: 30 }, (_, idx) => {
      const minute = String(29 - idx).padStart(2, "0");
      return makeThread(`t-${String(idx + 31).padStart(2, "0")}`, `2026-11-27T10:${minute}:00+07:00`);
    });
    const afterPage2 = reconcileVisibleThreads({
      currentVisible: page1,
      latestFromServer: [...page1, ...page2],
      isListScrolled: true,
    });
    expect(afterPage2.visible).toHaveLength(60);
    expect(afterPage2.visible[0].id).toBe("t-01");
    expect(afterPage2.visible[59].id).toBe("t-60");
    expect(afterPage2.pendingNewCount).toBe(0);

    // Tie-broken by id on identical updatedAt (same cursor rule as backend)
    const tieTail = makeThread("thread-b", "2026-11-27T08:00:00+07:00");
    const tieNextPage = makeThread("thread-a", "2026-11-27T08:00:00+07:00");
    const afterTiePage = reconcileVisibleThreads({
      currentVisible: [t1, tieTail],
      latestFromServer: [t1, tieTail, tieNextPage],
      isListScrolled: true,
    });
    expect(afterTiePage.visible.map((t) => t.id)).toEqual(["t1", "thread-b", "thread-a"]);
    expect(afterTiePage.pendingNewCount).toBe(0);

    // Simultaneous page 2 load + genuine new arrival at top: page 2 renders, only genuine arrival counted
    const genuineNew = makeThread("t-new", "2026-11-27T11:05:00+07:00");
    const afterPage2AndNew = reconcileVisibleThreads({
      currentVisible: page1,
      latestFromServer: [genuineNew, ...page1, ...page2],
      isListScrolled: true,
    });
    expect(afterPage2AndNew.visible).toHaveLength(60);
    expect(afterPage2AndNew.visible[0].id).toBe("t-01");
    expect(afterPage2AndNew.visible[59].id).toBe("t-60");
    expect(afterPage2AndNew.pendingNewCount).toBe(1);

    // Bumped existing row (t-05 updated ahead of t-01) + page 2 loaded: keeps stable order, counts 1 pending
    const bumpedT5 = makeThread("t-05", "2026-11-27T11:10:00+07:00");
    const afterBumpedAndPage2 = reconcileVisibleThreads({
      currentVisible: page1,
      latestFromServer: [
        bumpedT5,
        ...page1.filter((item) => item.id !== "t-05"),
        ...page2,
      ],
      isListScrolled: true,
    });
    expect(afterBumpedAndPage2.visible).toHaveLength(60);
    expect(afterBumpedAndPage2.visible[0].id).toBe("t-01");
    expect(afterBumpedAndPage2.visible[4].id).toBe("t-05");
    expect(afterBumpedAndPage2.visible[4].updatedAt).toBe("2026-11-27T11:10:00+07:00");
    expect(afterBumpedAndPage2.visible[59].id).toBe("t-60");
    expect(afterBumpedAndPage2.pendingNewCount).toBe(1);
  });

  it("resets scroll anchor & unseen state on cached thread switch and ignores own reconciled sends", () => {
    const threadAMsgs = [makeMessage({ id: "a1", threadId: "A" })];
    const threadBMsgs = [
      makeMessage({ id: "b1", threadId: "B" }),
      makeMessage({ id: "b2", threadId: "B" }),
    ];

    // Thread A was scrolled up with an active older-history anchor
    const stateOnA: ChatScrollTrackerState = {
      initializedThreadId: "A",
      isAtBottom: false,
      knownMessageIds: new Set(threadAMsgs.map((m) => m.id)),
      knownClientIds: collectKnownClientIds(threadAMsgs),
      lastSeenOwnSendSeq: 1,
      olderAnchor: {
        threadId: "A",
        prevScrollHeight: 800,
        prevScrollTop: 20,
        prevFirstId: "a1",
      },
    };

    // Finding 11a: switching directly to cached Thread B must clear A's olderAnchor and jump to bottom
    const switchToB = reconcileChatScrollState({
      state: stateOnA,
      threadId: "B",
      messages: threadBMsgs,
      lastOwnSendSeq: 1,
      scrollHeight: 1200,
      hasScrollElement: true,
    });
    expect(switchToB.effect).toEqual({ kind: "scroll-to-bottom", resetUnseen: true });
    expect(switchToB.nextState.initializedThreadId).toBe("B");
    expect(switchToB.nextState.olderAnchor).toBeNull();
    expect(switchToB.nextState.isAtBottom).toBe(true);

    // Finding 11b: operator sends reply on B, then scrolls up before server replaces optimistic:<clientId>
    const ownOptimistic = createOptimisticReplyMessage({
      threadId: "B",
      pageId: "123",
      channelName: "WorkHardToday",
      text: "Dạ còn size M ạ",
      clientId: "cid-own-1",
    });
    const afterSend = reconcileChatScrollState({
      state: switchToB.nextState,
      threadId: "B",
      messages: [...threadBMsgs, ownOptimistic],
      lastOwnSendSeq: 2,
      scrollHeight: 1300,
      hasScrollElement: true,
    });
    expect(afterSend.effect).toEqual({ kind: "scroll-to-bottom", resetUnseen: true });

    // Operator scrolls up while reply is still in flight
    const scrolledUpState: ChatScrollTrackerState = {
      ...afterSend.nextState,
      isAtBottom: false,
    };

    // Server responds 200 and replaces optimistic:cid-own-1 with real fb-reply-999 carrying same clientId
    const reconciledOwn = makeMessage({
      id: "fb-reply-999",
      threadId: "B",
      fromPage: true,
      text: "Dạ còn size M ạ",
      delivery: "sent",
      clientId: "cid-own-1",
    });
    const afterReconcile = reconcileChatScrollState({
      state: scrolledUpState,
      threadId: "B",
      messages: [...threadBMsgs, reconciledOwn],
      lastOwnSendSeq: 2,
      scrollHeight: 1300,
      hasScrollElement: true,
    });
    expect(afterReconcile.effect).toEqual({ kind: "noop" });

    // Real customer follow-up arriving alongside own reconciliation still counts as 1 unseen message
    const customerFollowUp = makeMessage({
      id: "b3-cust",
      threadId: "B",
      fromPage: false,
      text: "Cho mình đặt 1 cái nhé",
      clientId: null,
    });
    const withCustomerBeforeOwn = reconcileChatScrollState({
      state: scrolledUpState,
      threadId: "B",
      messages: [...threadBMsgs, customerFollowUp, reconciledOwn],
      lastOwnSendSeq: 2,
      scrollHeight: 1400,
      hasScrollElement: true,
    });
    expect(withCustomerBeforeOwn.effect).toEqual({ kind: "increment-unseen", delta: 1 });
  });

  it("queues rapid consecutive replies sequentially per thread while allowing parallel sends across threads", async () => {
    const queue = createThreadReplyQueue();
    const events: string[] = [];

    let resolveA1!: () => void;
    let resolveA2!: () => void;
    let resolveB1!: () => void;

    const pA1 = queue.enqueue("thread-A", async () => {
      events.push("A1:start");
      await new Promise<void>((resolve) => {
        resolveA1 = resolve;
      });
      events.push("A1:end");
      return "ok-A1";
    });

    const pA2 = queue.enqueue("thread-A", async () => {
      events.push("A2:start");
      await new Promise<void>((resolve) => {
        resolveA2 = resolve;
      });
      events.push("A2:end");
      return "ok-A2";
    });

    const pB1 = queue.enqueue("thread-B", async () => {
      events.push("B1:start");
      await new Promise<void>((resolve) => {
        resolveB1 = resolve;
      });
      events.push("B1:end");
      return "ok-B1";
    });

    // Wait a microtask tick so initial tasks start
    await Promise.resolve();
    expect(events).toEqual(["A1:start", "B1:start"]);
    expect(queue.isBusy("thread-A")).toBe(true);
    expect(queue.isBusy("thread-B")).toBe(true);

    // Thread B finishes independently while Thread A #1 is still in flight
    resolveB1();
    expect(await pB1).toBe("ok-B1");
    expect(events).toEqual(["A1:start", "B1:start", "B1:end"]);

    // Thread A #2 MUST NOT start until Thread A #1 settles
    resolveA1();
    expect(await pA1).toBe("ok-A1");
    await Promise.resolve();
    expect(events).toEqual(["A1:start", "B1:start", "B1:end", "A1:end", "A2:start"]);

    resolveA2();
    expect(await pA2).toBe("ok-A2");
    expect(events).toEqual([
      "A1:start",
      "B1:start",
      "B1:end",
      "A1:end",
      "A2:start",
      "A2:end",
    ]);

    // Queue recovers cleanly after a rejected task on the same thread
    const pFail = queue.enqueue("thread-A", async () => {
      events.push("A3:fail");
      throw new Error("boom");
    });
    const pAfterFail = queue.enqueue("thread-A", async () => {
      events.push("A4:recovered");
      return "ok-A4";
    });

    await expect(pFail).rejects.toThrow("boom");
    expect(await pAfterFail).toBe("ok-A4");
    await Promise.resolve();
    await Promise.resolve();
    expect(queue.isBusy("thread-A")).toBe(false);
    expect(queue.isBusy("thread-B")).toBe(false);
  });
});
