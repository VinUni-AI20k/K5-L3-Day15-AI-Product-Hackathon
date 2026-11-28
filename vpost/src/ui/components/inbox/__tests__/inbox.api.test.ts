import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/ui/services/api-error";
import { CommentBlockedError } from "@/ui/services/comment.api";
import {
  generateThreadDraft,
  getThreadDetail,
  ignoreThread,
  listThreads,
  markThreadRead,
  sendThreadReply,
  setCommentLiked,
  unignoreThread,
} from "@/ui/services/inbox.api";

const SAMPLE_THREAD = {
  id: "root-1",
  channelId: "fb-123",
  channelName: "WorkHardToday",
  pageId: "123",
  postJobId: "job-1",
  productCode: "G1",
  postCaption: "Đầm hoa G1",
  postUrl: "https://www.facebook.com/123_1001",
  postImageUrl: null,
  customer: { id: "psid-1", name: "Minh Thư", tags: [] },
  lastMessage: {
    id: "root-1",
    fromPage: false,
    text: "Còn hàng không ạ?",
    createdAt: "2026-11-27T10:00:00+07:00",
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
  updatedAt: "2026-11-27T10:00:00+07:00",
};

const SAMPLE_MESSAGE = {
  id: "msg-reply-1",
  threadId: "root-1",
  fromPage: true,
  fromId: "123",
  fromName: "WorkHardToday",
  text: "Dạ còn đủ size ạ!",
  createdAt: "2026-11-27T10:01:00+07:00",
  permalinkUrl: "https://www.facebook.com/123_1001?comment_id=msg-reply-1",
  isHidden: false,
  canComment: true,
  likedByPage: false,
  delivery: "sent",
  errorCode: null,
  userMessage: null,
  clientId: "cid-1",
  moderation: null,
};

function mockFetchJson(body: unknown, status = 200) {
  const spy = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    }),
  );
  vi.stubGlobal("fetch", spy);
  return spy;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("inbox.api", () => {
  it("requests GET /api/comments/threads with filter params and parses response", async () => {
    const spy = mockFetchJson({
      tenantId: "t1",
      items: [SAMPLE_THREAD],
      nextCursor: "c2",
      limit: 30,
      counts: { needsReply: 1, unread: 1, all: 5, hidden: 0, ignored: 1 },
    });

    const res = await listThreads({
      filter: "has_phone",
      channelId: "fb-123",
      postJobId: "job-1",
      q: "size M",
      cursor: "c1",
      limit: 30,
    });

    expect(res.items).toHaveLength(1);
    const url = String(spy.mock.calls[0]?.[0] ?? "");
    expect(url).toContain("/api/comments/threads?");
    expect(url).toContain("filter=has_phone");
    expect(url).toContain("channelId=fb-123");
    expect(url).toContain("postJobId=job-1");
    expect(url).toContain("q=size+M");
    expect(url).toContain("cursor=c1");
    expect(url).toContain("limit=30");
  });

  it("calls GET thread detail, POST read, draft, ignore, and unignore", async () => {
    const detailSpy = mockFetchJson({
      tenantId: "t1",
      thread: SAMPLE_THREAD,
      messages: [SAMPLE_MESSAGE],
      olderCursor: "old-1",
    });
    const detail = await getThreadDetail({
      threadId: "root-1",
      before: "cur-0",
      limit: 50,
    });
    expect(detail.olderCursor).toBe("old-1");
    expect(detailSpy.mock.calls[0][0]).toBe(
      "/api/comments/threads/root-1?before=cur-0&limit=50",
    );

    const readSpy = mockFetchJson({
      tenantId: "t1",
      thread: { ...SAMPLE_THREAD, unread: false, unreadCount: 0 },
    });
    await markThreadRead("root-1");
    expect(readSpy.mock.calls[0][0]).toBe("/api/comments/threads/root-1/read");

    const draftSpy = mockFetchJson({ tenantId: "t1", thread: SAMPLE_THREAD });
    await generateThreadDraft("root-1");
    expect(draftSpy.mock.calls[0][0]).toBe("/api/comments/threads/root-1/draft");

    const ignoreSpy = mockFetchJson({
      tenantId: "t1",
      thread: { ...SAMPLE_THREAD, status: "ignored" },
    });
    await ignoreThread("root-1");
    expect(ignoreSpy.mock.calls[0][0]).toBe("/api/comments/threads/root-1/ignore");

    const unignoreSpy = mockFetchJson({ tenantId: "t1", thread: SAMPLE_THREAD });
    await unignoreThread("root-1");
    expect(unignoreSpy.mock.calls[0][0]).toBe(
      "/api/comments/threads/root-1/unignore",
    );
  });

  it("sends POST /api/comments/threads/{id}/reply with text + clientId and surfaces 422 BLOCKED reasons", async () => {
    const okSpy = mockFetchJson({
      tenantId: "t1",
      thread: { ...SAMPLE_THREAD, needsReply: false },
      message: SAMPLE_MESSAGE,
    });

    const okRes = await sendThreadReply({
      threadId: "root-1",
      text: "  Dạ còn đủ size ạ!  ",
      clientId: "cid-1",
    });
    expect(okRes.message.id).toBe("msg-reply-1");
    const init = okSpy.mock.calls[0]?.[1];
    expect(JSON.parse(String(init?.body ?? "{}"))).toEqual({
      text: "Dạ còn đủ size ạ!",
      clientId: "cid-1",
    });

    mockFetchJson(
      {
        code: "BLOCKED",
        message: "Nội dung bị chặn bởi quy tắc thương hiệu",
        reasons: ["chứa cụm cấm 'freeship'", "sai giá bán"],
      },
      422,
    );

    await expect(
      sendThreadReply({
        threadId: "root-1",
        text: "Freeship 500k",
        clientId: "cid-2",
      }),
    ).rejects.toSatisfy((err: unknown) => {
      return (
        err instanceof CommentBlockedError &&
        err.status === 422 &&
        err.code === "BLOCKED" &&
        err.reasons.length === 2 &&
        err.reasons[0] === "chứa cụm cấm 'freeship'"
      );
    });
  });

  it("calls POST /api/comments/{id}/like and rejects invalid client inputs", async () => {
    const likeSpy = mockFetchJson({
      tenantId: "t1",
      commentId: "msg-1",
      liked: true,
    });
    const res = await setCommentLiked({ commentId: "msg-1", liked: true });
    expect(res.liked).toBe(true);
    expect(likeSpy.mock.calls[0][0]).toBe("/api/comments/msg-1/like");
    const init = likeSpy.mock.calls[0]?.[1];
    expect(JSON.parse(String(init?.body ?? "{}"))).toEqual({ liked: true });

    await expect(
      sendThreadReply({ threadId: "root-1", text: "   ", clientId: "cid-1" }),
    ).rejects.toBeInstanceOf(ApiError);

    await expect(
      sendThreadReply({
        threadId: "root-1",
        text: "a".repeat(2001),
        clientId: "cid-1",
      }),
    ).rejects.toBeInstanceOf(ApiError);

    await expect(
      sendThreadReply({ threadId: "root-1", text: "ok", clientId: "   " }),
    ).rejects.toBeInstanceOf(ApiError);
  });
});
