import { describe, expect, it } from "vitest";

import * as inboxSchema from "@/ui/schemas/inbox.schema";
import {
  InboxLikeResponseSchema,
  InboxMessageSchema,
  InboxReplyResponseSchema,
  InboxThreadDetailResponseSchema,
  InboxThreadListResponseSchema,
  InboxThreadMutationResponseSchema,
  InboxThreadSchema,
  formatThreadAccessibleContext,
  formatThreadLastMessageExcerpt,
  toSafeFacebookUrl,
  toSafeImageUrl,
} from "@/ui/schemas/inbox.schema";

function sampleThreadJson(overrides: Record<string, unknown> = {}) {
  return {
    id: "root-1",
    channelId: "fb-123",
    channelName: "WorkHardToday",
    pageId: "123",
    postJobId: "job-1",
    productCode: "G1",
    postCaption: "Đầm voan hoa G1 màu đen size S-L",
    postUrl: "https://www.facebook.com/123_1001",
    postImageUrl: "https://scontent.xx.fbcdn.net/v/post-1.jpg",
    customer: {
      id: "psid-99",
      name: "Minh Thư",
      tags: [
        { id: "tag-1", name: "VIP", color: "purple" },
        { id: "tag-2", name: "Hỏi size", color: "blue" },
      ],
    },
    lastMessage: {
      id: "msg-2",
      fromPage: false,
      text: "Còn size M màu đen không shop?",
      createdAt: "2026-11-27T10:15:00+07:00",
    },
    needsReply: true,
    unread: true,
    unreadCount: 2,
    status: "open",
    isHidden: false,
    messageCount: 3,
    hasPhone: false,
    draft: {
      id: "draft-1",
      status: "draft",
      text: "Dạ mẫu G1 màu đen còn size M ạ!",
      aiText: "Dạ mẫu G1 màu đen còn size M ạ!",
      reasons: [],
      warnings: [],
      errorCode: null,
      userMessage: null,
      updatedAt: "2026-11-27T10:16:00+07:00",
    },
    moderation: null,
    updatedAt: "2026-11-27T10:15:00+07:00",
    ...overrides,
  };
}

function sampleMessageJson(overrides: Record<string, unknown> = {}) {
  return {
    id: "msg-1",
    threadId: "root-1",
    fromPage: false,
    fromId: "psid-99",
    fromName: "Minh Thư",
    text: "Mẫu này giá bao nhiêu ạ?",
    createdAt: "2026-11-27T10:00:00+07:00",
    permalinkUrl: "https://www.facebook.com/123_1001?comment_id=msg-1",
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

describe("inbox.schema parsing", () => {
  it("parses valid Thread, ThreadListResponse, and tolerates optional hasPhone count", () => {
    const response = InboxThreadListResponseSchema.parse({
      tenantId: "tenant-1",
      items: [sampleThreadJson()],
      nextCursor: "cur-2",
      limit: 30,
      counts: {
        needsReply: 5,
        unread: 3,
        all: 12,
        hidden: 1,
        ignored: 2,
      },
    });

    expect(response.items).toHaveLength(1);
    expect(response.items[0].customer.name).toBe("Minh Thư");
    expect(response.counts.hasPhone).toBeUndefined();

    const withHasPhone = InboxThreadListResponseSchema.parse({
      tenantId: "tenant-1",
      items: [],
      nextCursor: null,
      limit: 30,
      counts: {
        needsReply: 0,
        unread: 0,
        all: 0,
        hidden: 0,
        ignored: 0,
        hasPhone: 4,
      },
    });
    expect(withHasPhone.counts.hasPhone).toBe(4);
  });

  it("handles null/missing customer name, fromName, moderation, and empty tags", () => {
    const parsedThread = InboxThreadSchema.parse(
      sampleThreadJson({
        postUrl: null,
        postImageUrl: null,
        customer: { id: "", name: undefined },
        canComment: false,
        draft: null,
        moderation: undefined,
      }),
    );
    expect(parsedThread.customer.name).toBeNull();
    expect(parsedThread.customer.tags).toEqual([]);
    expect(parsedThread.canComment).toBe(false);
    expect(parsedThread.moderation).toBeNull();

    const parsedMessage = InboxMessageSchema.parse(
      sampleMessageJson({
        fromName: undefined,
        permalinkUrl: null,
        moderation: undefined,
      }),
    );
    expect(parsedMessage.fromName).toBeNull();
    expect(parsedMessage.moderation).toBeNull();
  });

  it("parses ThreadDetailResponse, ReplyResponse, MutationResponse, and LikeResponse", () => {
    const detail = InboxThreadDetailResponseSchema.parse({
      tenantId: "tenant-1",
      thread: sampleThreadJson(),
      messages: [sampleMessageJson()],
      olderCursor: "before-1",
    });
    expect(detail.messages).toHaveLength(1);
    expect(detail.olderCursor).toBe("before-1");

    const reply = InboxReplyResponseSchema.parse({
      tenantId: "tenant-1",
      thread: sampleThreadJson({ needsReply: false }),
      message: sampleMessageJson({
        id: "msg-reply-1",
        fromPage: true,
        fromId: "123",
        fromName: "WorkHardToday",
        text: "Dạ giá 890k ạ!",
        clientId: "550e8400-e29b-41d4-a716-446655440000",
      }),
    });
    expect(reply.message.clientId).toBe("550e8400-e29b-41d4-a716-446655440000");

    const mut = InboxThreadMutationResponseSchema.parse({
      tenantId: "tenant-1",
      thread: sampleThreadJson({ status: "ignored" }),
    });
    expect(mut.thread.status).toBe("ignored");

    const like = InboxLikeResponseSchema.parse({
      tenantId: "tenant-1",
      commentId: "msg-1",
      liked: true,
    });
    expect(like.liked).toBe(true);
  });

  it("does not export removed dead draft-patch or unused re-export contracts", () => {
    expect("InboxPatchDraftResponseSchema" in inboxSchema).toBe(false);
    expect("CommentCheckSchema" in inboxSchema).toBe(false);
    expect("COMMENT_AUTHOR_FALLBACK" in inboxSchema).toBe(false);
    expect("isPermissionMissingCode" in inboxSchema).toBe(false);
  });

  it("rejects invalid tag colors, thread statuses, delivery states, and unsafe URLs", () => {
    expect(() =>
      InboxThreadSchema.parse(
        sampleThreadJson({
          customer: {
            id: "u1",
            name: "An",
            tags: [{ id: "t1", name: "Bad", color: "neon" }],
          },
        }),
      ),
    ).toThrow();

    expect(() =>
      InboxThreadSchema.parse(sampleThreadJson({ status: "closed" })),
    ).toThrow();

    expect(() =>
      InboxThreadSchema.parse(sampleThreadJson({ postUrl: "javascript:alert(1)" })),
    ).toThrow();

    expect(() =>
      InboxMessageSchema.parse(sampleMessageJson({ delivery: "queued" })),
    ).toThrow();

    expect(() =>
      InboxMessageSchema.parse(
        sampleMessageJson({ permalinkUrl: "data:text/html,<b>hi</b>" }),
      ),
    ).toThrow();
  });

  it("sanitizes image and Facebook URLs and formats row excerpts", () => {
    expect(toSafeImageUrl("https://scontent.fbcdn.net/a.jpg")).toBe(
      "https://scontent.fbcdn.net/a.jpg",
    );
    expect(toSafeImageUrl("/api/media/file-1")).toBe("/api/media/file-1");
    expect(toSafeImageUrl("/api/media/preview/upload_01")).toBe(
      "/api/media/preview/upload_01",
    );
    // /uploads/ paths are not proxied by Next.js or stored on VPOST published posts
    expect(toSafeImageUrl("/uploads/1-abc.jpg")).toBeNull();
    expect(toSafeImageUrl("javascript:alert(1)")).toBeNull();
    expect(toSafeImageUrl("data:image/svg+xml,<svg/>")).toBeNull();
    expect(toSafeImageUrl("https://user:pass@cdn.example.com/a.jpg")).toBeNull();

    expect(toSafeFacebookUrl("https://www.facebook.com/123_1")).toBe(
      "https://www.facebook.com/123_1",
    );
    expect(toSafeFacebookUrl("https://evil.example.com/123")).toBeNull();

    expect(
      formatThreadLastMessageExcerpt({ fromPage: true, text: "Dạ còn hàng ạ" }),
    ).toBe("Bạn: Dạ còn hàng ạ");
    expect(
      formatThreadLastMessageExcerpt({ fromPage: false, text: "Giá sao shop?" }),
    ).toBe("Giá sao shop?");

    expect(
      formatThreadAccessibleContext({
        customer: { id: "u1", name: null, tags: [] },
        lastMessage: {
          id: "m1",
          fromPage: false,
          text: "Còn size M không shop?",
          createdAt: "2026-11-27T10:00:00+07:00",
        },
      }),
    ).toBe("Khách hàng Facebook: “Còn size M không shop?”");
  });
});
