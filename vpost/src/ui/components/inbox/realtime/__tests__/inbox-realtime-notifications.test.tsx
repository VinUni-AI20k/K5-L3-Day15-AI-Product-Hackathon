import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { LinkProvider, Toast } from "@astryxdesign/core";
import { useAnnounce, type AnnounceFn } from "@astryxdesign/core/hooks";
import { QueryClient } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  dispatchInboxNotificationPlan,
  InboxToastAction,
  lookupCachedCustomerName,
} from "@/ui/components/inbox/realtime/InboxRealtime";
import { inboxKeys } from "@/ui/hooks/inbox-keys";
import {
  buildThreadHref,
  createInboxNotificationTracker,
  extractCustomerNameFromCache,
  getActiveThreadId,
  truncateToastExcerpt,
} from "@/ui/components/inbox/realtime/realtime-notifications";
import { AppLink } from "@/ui/components/shell/AppLink";
import type {
  CommentUpdateItem,
  CommentUpdatesResponse,
} from "@/ui/schemas/inbox-updates.schema";

function makeItem(overrides: Partial<CommentUpdateItem> = {}): CommentUpdateItem {
  return {
    threadId: "thread-1",
    messageId: "msg-1",
    customerName: "Minh Thư",
    text: "Mẫu này còn size M không shop?",
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
    cursor: "2026-11-27T10:01:00.000Z",
    items: [],
    draftsReady: [],
    ...overrides,
  };
}

describe("inbox notification planner", () => {
  it("emits no toasts or announcements on initial cursor bootstrap", () => {
    const tracker = createInboxNotificationTracker();
    const plan = tracker.plan({
      response: makeResponse({
        items: [makeItem()],
        draftsReady: ["thread-1"],
      }),
      isInitialCursor: true,
      activeThreadId: null,
    });

    expect(plan.toasts).toEqual([]);
    expect(plan.liveAnnouncement).toBeNull();
  });

  it("shows individual toasts for 1 to 3 new comments with short body and /comments?thread=<id> link", () => {
    const tracker = createInboxNotificationTracker();
    const longText =
      "Chị muốn hỏi mẫu đầm voan hoa này còn màu đen size M không em, ship về Đà Nẵng hết mấy ngày vậy shop ơi?";

    const plan = tracker.plan({
      response: makeResponse({
        items: [
          makeItem({ threadId: "th/1", messageId: "m-1", customerName: "Lan Anh", text: longText }),
          makeItem({ threadId: "th-2", messageId: "m-2", customerName: null, text: "Inbox giá giúp mình" }),
          makeItem({ threadId: "th-3", messageId: "m-3", customerName: "Hải Yến", text: "   " }),
        ],
      }),
      isInitialCursor: false,
      activeThreadId: null,
    });

    expect(plan.toasts).toHaveLength(3);
    expect(plan.toasts[0]).toEqual({
      uniqueID: "inbox-comment-m-1",
      type: "info",
      body: `Lan Anh vừa bình luận: ${truncateToastExcerpt(longText)}`,
      actionLabel: "Xem",
      actionHref: "/comments?thread=th%2F1",
      collisionBehavior: "ignore",
    });
    expect(plan.toasts[0]?.body.endsWith("…")).toBe(true);

    expect(plan.toasts[1]).toEqual({
      uniqueID: "inbox-comment-m-2",
      type: "info",
      body: "Khách hàng vừa bình luận: Inbox giá giúp mình",
      actionLabel: "Xem",
      actionHref: "/comments?thread=th-2",
      collisionBehavior: "ignore",
    });

    expect(plan.toasts[2]).toEqual({
      uniqueID: "inbox-comment-m-3",
      type: "info",
      body: "Hải Yến vừa bình luận",
      actionLabel: "Xem",
      actionHref: "/comments?thread=th-3",
      collisionBehavior: "ignore",
    });
    expect(plan.liveAnnouncement).toBeNull();
  });

  it("deduplicates comments by messageId within a tick and across subsequent ticks", () => {
    const tracker = createInboxNotificationTracker();

    const first = tracker.plan({
      response: makeResponse({
        items: [
          makeItem({ threadId: "th-1", messageId: "dup-1", text: "Giá sao shop?" }),
          makeItem({ threadId: "th-1", messageId: "dup-1", text: "Giá sao shop?" }),
        ],
      }),
      isInitialCursor: false,
      activeThreadId: null,
    });
    expect(first.toasts).toHaveLength(1);
    expect(first.toasts[0]?.uniqueID).toBe("inbox-comment-dup-1");

    const second = tracker.plan({
      response: makeResponse({
        cursor: "2026-11-27T10:02:00.000Z",
        items: [
          makeItem({ threadId: "th-1", messageId: "dup-1", text: "Giá sao shop?" }),
          makeItem({ threadId: "th-2", messageId: "fresh-2", customerName: "Tuấn", text: "Còn hàng không?" }),
        ],
      }),
      isInitialCursor: false,
      activeThreadId: null,
    });
    expect(second.toasts).toHaveLength(1);
    expect(second.toasts[0]?.uniqueID).toBe("inbox-comment-fresh-2");
    expect(second.toasts[0]?.body).toBe("Tuấn vừa bình luận: Còn hàng không?");
  });

  it("groups more than 3 new comments into one 'Có N bình luận mới' toast linking to /comments", () => {
    const tracker = createInboxNotificationTracker();
    const items = [1, 2, 3, 4, 5].map((n) =>
      makeItem({
        threadId: `th-${n}`,
        messageId: `m-${n}`,
        customerName: `Khách ${n}`,
        text: `Bình luận số ${n}`,
      }),
    );

    const plan = tracker.plan({
      response: makeResponse({ cursor: "c-group", items }),
      isInitialCursor: false,
      activeThreadId: null,
    });

    expect(plan.toasts).toEqual([
      {
        uniqueID: "inbox-comments-group-c-group",
        type: "info",
        body: "Có 5 bình luận mới",
        actionLabel: "Xem",
        actionHref: "/comments",
        collisionBehavior: "ignore",
      },
    ]);
  });

  it("emits info toasts for draftsReady using known customer name or 'khách' fallback", () => {
    const tracker = createInboxNotificationTracker();

    const plan = tracker.plan({
      response: makeResponse({
        items: [makeItem({ threadId: "th-from-item", messageId: "m-1", customerName: "Ngọc Hà" })],
        draftsReady: ["th-from-item", "th-from-cache", "th-unknown"],
      }),
      isInitialCursor: false,
      activeThreadId: null,
      lookupCachedCustomerName: (threadId) =>
        threadId === "th-from-cache" ? "Quang Huy" : null,
    });

    const draftToasts = plan.toasts.filter((t) => t.uniqueID.startsWith("inbox-draft-"));
    expect(draftToasts).toEqual([
      {
        uniqueID: "inbox-draft-th-from-item",
        type: "info",
        body: "Đã có nháp AI cho Ngọc Hà",
        actionLabel: "Xem",
        actionHref: buildThreadHref("th-from-item"),
        collisionBehavior: "ignore",
      },
      {
        uniqueID: "inbox-draft-th-from-cache",
        type: "info",
        body: "Đã có nháp AI cho Quang Huy",
        actionLabel: "Xem",
        actionHref: buildThreadHref("th-from-cache"),
        collisionBehavior: "ignore",
      },
      {
        uniqueID: "inbox-draft-th-unknown",
        type: "info",
        body: "Đã có nháp AI cho khách",
        actionLabel: "Xem",
        actionHref: buildThreadHref("th-unknown"),
        collisionBehavior: "ignore",
      },
    ]);
  });

  it("suppresses toasts for the currently open thread and announces sender + short text in the polite live region", () => {
    const tracker = createInboxNotificationTracker();

    // Only open-thread messages + draft -> zero toasts, polite live region carries both
    const openOnly = tracker.plan({
      response: makeResponse({
        items: [
          makeItem({
            threadId: "th-open",
            messageId: "m-open-1",
            customerName: "Minh Thư",
            text: "Shop ơi kiểm tra đơn giúp mình",
          }),
        ],
        draftsReady: ["th-open"],
      }),
      isInitialCursor: false,
      activeThreadId: "th-open",
    });

    expect(openOnly.toasts).toEqual([]);
    expect(openOnly.liveAnnouncement).toBe(
      "Minh Thư: Shop ơi kiểm tra đơn giúp mình · Đã có nháp AI cho Minh Thư",
    );

    // Mixed tick: 1 open-thread message + 4 background-thread messages
    // -> open thread goes to live region, background 4 group into "Có 4 bình luận mới"
    const mixed = tracker.plan({
      response: makeResponse({
        cursor: "c-mixed",
        items: [
          makeItem({
            threadId: "th-open",
            messageId: "m-open-2",
            customerName: "Minh Thư",
            text: "Cảm ơn shop nhiều",
          }),
          makeItem({ threadId: "th-a", messageId: "m-a" }),
          makeItem({ threadId: "th-b", messageId: "m-b" }),
          makeItem({ threadId: "th-c", messageId: "m-c" }),
          makeItem({ threadId: "th-d", messageId: "m-d" }),
        ],
      }),
      isInitialCursor: false,
      activeThreadId: "th-open",
    });

    expect(mixed.toasts).toEqual([
      {
        uniqueID: "inbox-comments-group-c-mixed",
        type: "info",
        body: "Có 4 bình luận mới",
        actionLabel: "Xem",
        actionHref: "/comments",
        collisionBehavior: "ignore",
      },
    ]);
    expect(mixed.liveAnnouncement).toBe("Minh Thư: Cảm ơn shop nhiều");
  });

  it("resets dedupe and customer name state on tenant switch", () => {
    const tracker = createInboxNotificationTracker();
    tracker.plan({
      response: makeResponse({
        items: [makeItem({ threadId: "th-1", messageId: "m-1", customerName: "Tên Tenant 1" })],
      }),
      isInitialCursor: false,
      activeThreadId: null,
    });

    tracker.reset();

    const afterReset = tracker.plan({
      response: makeResponse({
        items: [makeItem({ threadId: "th-1", messageId: "m-1", customerName: "Tên Tenant 2" })],
        draftsReady: ["th-other"],
      }),
      isInitialCursor: false,
      activeThreadId: null,
    });

    expect(afterReset.toasts[0]?.body).toContain("Tên Tenant 2");
    expect(afterReset.toasts[1]?.body).toBe("Đã có nháp AI cho khách");
  });

  it("resolves active thread id only on /comments and extracts customer names from cached query shapes", () => {
    expect(getActiveThreadId("/comments", new URLSearchParams("thread=th-99"))).toBe("th-99");
    expect(getActiveThreadId("/comments", new URLSearchParams("filter=all&thread=th-99"))).toBe("th-99");
    expect(getActiveThreadId("/comments", new URLSearchParams())).toBeNull();
    expect(getActiveThreadId("/posts", new URLSearchParams("thread=th-99"))).toBeNull();

    expect(
      extractCustomerNameFromCache(
        { thread: { id: "th-1", customer: { name: "Ngọc Anh" } } },
        "th-1",
      ),
    ).toBe("Ngọc Anh");
    expect(
      extractCustomerNameFromCache(
        {
          pages: [
            { items: [{ id: "th-2", customer: { name: "Hoàng Nam" } }] },
          ],
        },
        "th-2",
      ),
    ).toBe("Hoàng Nam");
    expect(
      extractCustomerNameFromCache(
        {
          pages: [
            {
              tenantId: "tenant-1",
              thread: { id: "th-infinite", customer: { id: "c-1", name: "Lan Anh", tags: [] } },
              messages: [],
              olderCursor: null,
            },
          ],
          pageParams: [null],
        },
        "th-infinite",
      ),
    ).toBe("Lan Anh");
    expect(
      extractCustomerNameFromCache(
        {
          pages: [
            { thread: { id: "th-infinite-fallback", customer: { name: "   " } }, messages: [] },
            { thread: { id: "th-infinite-fallback", customer: { name: "Bảo Trâm" } }, messages: [] },
          ],
          pageParams: [null, "cursor-1"],
        },
        "th-infinite-fallback",
      ),
    ).toBe("Bảo Trâm");
    expect(
      extractCustomerNameFromCache(
        {
          pages: [
            { thread: { id: "th-other", customer: { name: "Lan Anh" } }, messages: [] },
          ],
        },
        "th-infinite",
      ),
    ).toBeNull();
    expect(extractCustomerNameFromCache({ items: [] }, "th-missing")).toBeNull();
  });

  it("names the customer on draftsReady toasts when only the infinite-query thread cache is populated", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(inboxKeys.thread("tenant-1", "th-direct"), {
      pages: [
        {
          tenantId: "tenant-1",
          thread: { id: "th-direct", customer: { id: "cust-1", name: "Lan Anh", tags: [] } },
          messages: [],
          olderCursor: null,
        },
      ],
      pageParams: [null],
    });

    const tracker = createInboxNotificationTracker();
    const plan = tracker.plan({
      response: makeResponse({ draftsReady: ["th-direct"] }),
      isInitialCursor: false,
      activeThreadId: null,
      lookupCachedCustomerName: (threadId) =>
        lookupCachedCustomerName(queryClient, "tenant-1", threadId),
    });

    expect(plan.toasts).toEqual([
      {
        uniqueID: "inbox-draft-th-direct",
        type: "info",
        body: "Đã có nháp AI cho Lan Anh",
        actionLabel: "Xem",
        actionHref: buildThreadHref("th-direct"),
        collisionBehavior: "ignore",
      },
    ]);
    queryClient.clear();
  });
});

describe("InboxRealtime markup & AppFrame wiring", () => {
  it("renders toast action through AppLink with real href and without leaking Astryx `to` prop", () => {
    const html = renderToStaticMarkup(
      <LinkProvider component={AppLink}>
        <Toast
          type="info"
          body="Minh Thư vừa bình luận: Giá bao nhiêu ạ?"
          endContent={<InboxToastAction href="/comments?thread=th-42" label="Xem" />}
          isAutoHide
          autoHideDuration={5000}
          isExiting={false}
          onDismiss={() => {}}
        />
      </LinkProvider>,
    );

    expect(html).toContain("Minh Thư vừa bình luận: Giá bao nhiêu ạ?");
    expect(html).toContain('href="/comments?thread=th-42"');
    expect(html).toContain(">Xem<");
    expect(html).not.toMatch(/\sto="/);
  });

  it("re-announces identical consecutive open-thread updates via Astryx useAnnounce polite live region", () => {
    vi.useFakeTimers();

    interface FakeLiveRegionElement {
      attrs: Record<string, string>;
      style: { cssText: string };
      isConnected: boolean;
      mutations: string[];
      setAttribute(name: string, value: string): void;
      remove(): void;
      textContent: string;
    }

    const createdElements: FakeLiveRegionElement[] = [];
    const rafQueue: FrameRequestCallback[] = [];

    const makeElement = (): FakeLiveRegionElement => {
      let currentText = "";
      const el: FakeLiveRegionElement = {
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
          return currentText;
        },
        set textContent(next: string) {
          currentText = next;
          this.mutations.push(next);
        },
      };
      createdElements.push(el);
      return el;
    };

    vi.stubGlobal("document", {
      createElement: () => makeElement(),
      body: {
        appendChild: (el: FakeLiveRegionElement) => {
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
    function CaptureAnnounce() {
      announce = useAnnounce();
      return null;
    }
    renderToStaticMarkup(<CaptureAnnounce />);

    try {
      const tracker = createInboxNotificationTracker();
      const showToast = vi.fn(() => () => {});
      const lookup = (threadId: string) => (threadId === "th-open" ? "Lan Anh" : null);

      const firstDraftPlan = tracker.plan({
        response: makeResponse({ cursor: "c-1", draftsReady: ["th-open"] }),
        isInitialCursor: false,
        activeThreadId: "th-open",
        lookupCachedCustomerName: lookup,
      });
      dispatchInboxNotificationPlan(firstDraftPlan, { showToast, announce });

      const politeRegion = createdElements.find(
        (el) => el.attrs["data-astryx-live-region"] === "polite",
      );
      expect(politeRegion).toBeDefined();
      expect(politeRegion?.attrs.role).toBe("status");
      expect(politeRegion?.attrs["aria-live"]).toBe("polite");
      expect(politeRegion?.attrs["aria-atomic"]).toBe("true");
      expect(politeRegion?.style.cssText).toContain("position:absolute");
      expect(politeRegion?.style.cssText).toContain("overflow:hidden");

      // First announcement clears then writes on the animation frame.
      expect(politeRegion?.mutations).toEqual([""]);
      rafQueue.shift()?.(16);
      expect(politeRegion?.mutations).toEqual(["", "Đã có nháp AI cho Lan Anh"]);

      // Second consecutive tick with the EXACT same announcement text must clear
      // and re-set so assistive technology announces the repeat update.
      const secondDraftPlan = tracker.plan({
        response: makeResponse({ cursor: "c-2", draftsReady: ["th-open"] }),
        isInitialCursor: false,
        activeThreadId: "th-open",
        lookupCachedCustomerName: lookup,
      });
      dispatchInboxNotificationPlan(secondDraftPlan, { showToast, announce });
      expect(politeRegion?.mutations).toEqual(["", "Đã có nháp AI cho Lan Anh", ""]);
      rafQueue.shift()?.(32);
      expect(politeRegion?.mutations).toEqual([
        "",
        "Đã có nháp AI cho Lan Anh",
        "",
        "Đã có nháp AI cho Lan Anh",
      ]);

      // Two identical consecutive open-thread comments with distinct messageIds also re-announce.
      const commentPlan1 = tracker.plan({
        response: makeResponse({
          cursor: "c-3",
          items: [makeItem({ threadId: "th-open", messageId: "m-10", customerName: "Lan Anh", text: "Ok shop" })],
        }),
        isInitialCursor: false,
        activeThreadId: "th-open",
      });
      dispatchInboxNotificationPlan(commentPlan1, { showToast, announce });
      rafQueue.shift()?.(48);

      const commentPlan2 = tracker.plan({
        response: makeResponse({
          cursor: "c-4",
          items: [makeItem({ threadId: "th-open", messageId: "m-11", customerName: "Lan Anh", text: "Ok shop" })],
        }),
        isInitialCursor: false,
        activeThreadId: "th-open",
      });
      dispatchInboxNotificationPlan(commentPlan2, { showToast, announce });
      rafQueue.shift()?.(64);

      expect(politeRegion?.mutations.slice(-4)).toEqual([
        "",
        "Lan Anh: Ok shop",
        "",
        "Lan Anh: Ok shop",
      ]);
      expect(showToast).not.toHaveBeenCalled();

      // Empty announce (used on tenant switch) clears lingering text.
      announce("", "polite");
      expect(politeRegion?.textContent).toBe("");
    } finally {
      announce("", "polite");
      for (const el of createdElements) {
        el.isConnected = false;
      }
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });

  it("mounts Astryx LayerProvider and <InboxRealtime /> once inside AppFrame", () => {
    const source = readFileSync(
      fileURLToPath(new URL("../../../shell/AppFrame.tsx", import.meta.url)),
      "utf8",
    );
    const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

    expect(code.match(/<LayerProvider\b/g) ?? []).toHaveLength(1);
    expect(code.match(/<InboxRealtime\s*\/>/g) ?? []).toHaveLength(1);
    // LayerProvider must live inside LinkProvider + Theme so Toast links route via AppLink.
    expect(code.indexOf("<LinkProvider component={AppLink}>")).toBeLessThan(
      code.indexOf("<LayerProvider"),
    );
    expect(code.indexOf("<Theme theme={vpostTheme}>")).toBeLessThan(
      code.indexOf("<LayerProvider"),
    );
  });

  it("announces open-thread updates via Astryx useAnnounce rather than a static React string live region", () => {
    const source = readFileSync(
      fileURLToPath(new URL("../InboxRealtime.tsx", import.meta.url)),
      "utf8",
    );
    const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

    expect(code).toContain("useAnnounce");
    expect(code).not.toContain("setLiveAnnouncement");
  });
});
