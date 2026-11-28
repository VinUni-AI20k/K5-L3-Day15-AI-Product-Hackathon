import { readFileSync } from "node:fs";
import { join } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  resolveOverviewCommentsState,
  type OverviewCommentsState,
} from "@/ui/components/overview/overview-model";
import { OverviewCommentsWidget } from "@/ui/components/overview/OverviewCommentsWidget";
import type { InboxThread, InboxThreadCounts } from "@/ui/schemas/inbox.schema";

const NOW_MS = Date.parse("2026-11-28T05:30:00.000Z");

function sampleThread(id: string, overrides: Partial<InboxThread> = {}): InboxThread {
  return {
    id,
    channelId: "fb-1",
    channelName: "WorkHardToday",
    pageId: "100",
    postJobId: "job-1",
    productCode: "G1",
    postCaption: "Đầm hoa G1",
    postUrl: "https://www.facebook.com/100_1",
    postImageUrl: null,
    customer: { id: `psid-${id}`, name: "Minh Thư", tags: [] },
    lastMessage: {
      id: `msg-${id}`,
      fromPage: false,
      text: "Mẫu này còn size M không shop?",
      createdAt: "2026-11-28T05:25:00.000Z",
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
    attention: null,
    autoReply: null,
    agentRun: null,
    updatedAt: "2026-11-28T05:25:00.000Z",
    ...overrides,
  };
}

function sampleCounts(overrides: Partial<InboxThreadCounts> = {}): InboxThreadCounts {
  return {
    canBan: 0,
    needsReply: 0,
    unread: 0,
    all: 0,
    hidden: 0,
    ignored: 0,
    ...overrides,
  };
}

describe("OverviewCommentsWidget", () => {
  it("renders newest threads with customer name, excerpt, time, /comments?thread=<id> link, and Cần bạn count", () => {
    const state = resolveOverviewCommentsState({
      hasData: true,
      isError: false,
      threads: [
        sampleThread("th-1", {
          customer: { id: "c-1", name: "Minh Thư", tags: [] },
          lastMessage: {
            id: "m-1",
            fromPage: false,
            text: "Mẫu này còn size M không shop?",
            createdAt: "2026-11-28T05:25:00.000Z",
          },
          attention: {
            tag: "can_ban",
            reason: "Khách hỏi phí ship",
            since: "2026-11-28T05:25:00.000Z",
          },
          updatedAt: "2026-11-28T05:25:00.000Z",
        }),
        sampleThread("th/2", {
          customer: { id: "c-2", name: "Lan Anh", tags: [] },
          unread: false,
          lastMessage: {
            id: "m-2",
            fromPage: true,
            text: "Dạ shop đã gửi bảng size cho chị ạ!",
            createdAt: "2026-11-28T04:30:00.000Z",
          },
          updatedAt: "2026-11-28T04:30:00.000Z",
        }),
      ],
      counts: sampleCounts({ all: 9, canBan: 2 }),
    });

    const html = renderToStaticMarkup(
      <OverviewCommentsWidget state={state} nowMs={NOW_MS} />,
    );

    expect(html).toContain("Bình luận");
    expect(html).toContain("Cần bạn (2)");
    expect(html).toContain('href="/comments?filter=can_ban"');
    expect(html).toContain("Xem tất cả (9)");
    expect(html).toContain("Minh Thư");
    expect(html).toContain("Mẫu này còn size M không shop?");
    expect(html).toContain("5 phút trước");
    expect(html).toContain('href="/comments?thread=th-1"');
    expect(html).toContain("Lan Anh");
    expect(html).toContain("Bạn: Dạ shop đã gửi bảng size cho chị ạ!");
    expect(html).toContain("1 giờ trước");
    expect(html).toContain('href="/comments?thread=th%2F2"');
    expect(html).not.toContain("Chưa có bình luận nào.");
  });

  it("omits the Cần bạn count pill when canBanCount is 0", () => {
    const state = resolveOverviewCommentsState({
      hasData: true,
      isError: false,
      threads: [sampleThread("th-1")],
      counts: sampleCounts({ all: 1, canBan: 0 }),
    });

    const html = renderToStaticMarkup(
      <OverviewCommentsWidget state={state} nowMs={NOW_MS} />,
    );

    expect(html).toContain("Minh Thư");
    expect(html).not.toContain("filter=can_ban");
    expect(html).not.toContain("Cần bạn");
  });

  it("renders a loading skeleton (not a false empty state) while fetching", () => {
    const state: OverviewCommentsState = { kind: "loading" };
    const html = renderToStaticMarkup(
      <OverviewCommentsWidget state={state} nowMs={NOW_MS} />,
    );

    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("Đang tải bình luận…");
    expect(html).not.toContain("Chưa có bình luận nào.");
  });

  it("renders an error alert with retry action when loading fails", () => {
    const state: OverviewCommentsState = {
      kind: "error",
      message: "Không kết nối được máy chủ.",
    };
    const html = renderToStaticMarkup(
      <OverviewCommentsWidget state={state} nowMs={NOW_MS} onRetry={() => {}} />,
    );

    expect(html).toContain('role="alert"');
    expect(html).toContain("Không tải được bình luận");
    expect(html).toContain("Không kết nối được máy chủ.");
    expect(html).toContain("Thử lại");
    expect(html).not.toContain("Chưa có bình luận nào.");
  });

  it("renders the empty state only when the inbox truly has no threads", () => {
    const state: OverviewCommentsState = { kind: "empty", canBanCount: 0 };
    const html = renderToStaticMarkup(
      <OverviewCommentsWidget state={state} nowMs={NOW_MS} />,
    );

    expect(html).toContain("Chưa có bình luận nào.");
    expect(html).toContain('href="/comments"');
  });

  it("OverviewScreen wires the widget to useInboxThreads (inbox.api.ts) rather than a hardcoded empty card", () => {
    const source = readFileSync(
      join(process.cwd(), "src/ui/components/overview/OverviewScreen.tsx"),
      "utf8",
    );
    expect(source).toContain("useInboxThreads");
    expect(source).toContain("OverviewCommentsWidget");
    expect(source).not.toContain("Chưa có bình luận nào.");
  });
});
