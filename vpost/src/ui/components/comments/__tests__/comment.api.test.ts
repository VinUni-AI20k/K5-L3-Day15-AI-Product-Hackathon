import { afterEach, describe, expect, it, vi } from "vitest";

import type { CommentFilter } from "@/ui/schemas/comment.schema";
import { ApiError } from "@/ui/services/api-error";
import {
  COMMENT_HIDE_TIMEOUT_MS,
  COMMENT_SEND_TIMEOUT_MS,
  CommentBlockedError,
  commentKeys,
  setCommentHidden,
} from "@/ui/services/comment.api";

const BASE_COMMENT_FILTER: CommentFilter = {
  status: "unreplied",
  moderation: null,
  channelId: null,
  postJobId: null,
  q: null,
};

const SAMPLE_MUTATION_RESPONSE = {
  tenantId: "00000000-0000-4000-8000-000000000001",
  comment: {
    id: "c1",
    channelId: "fb-123",
    channelName: "WorkHardToday",
    pageId: "123",
    postJobId: "job-1",
    productCode: "G1",
    postCaption: "Đầm Voan Hoa G1",
    postUrl: "https://www.facebook.com/123_1001",
    fromName: "Minh Thư",
    message: "Giá bao nhiêu ạ?",
    createdAt: "2026-11-27T10:00:00.000Z",
    permalinkUrl: "https://www.facebook.com/123_1001?comment_id=c1",
    isHidden: false,
    canComment: true,
    status: "replied",
    pageReplies: [],
    draft: null,
    moderation: null,
  },
};

describe("comment.api timeouts, commentKeys, and CommentBlockedError", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses timeoutMs >= 45_000 for setCommentHidden and exposes send timeout", async () => {
    expect(COMMENT_SEND_TIMEOUT_MS).toBeGreaterThanOrEqual(45_000);
    expect(COMMENT_HIDE_TIMEOUT_MS).toBeGreaterThanOrEqual(45_000);

    const timeoutSpy = vi.spyOn(AbortSignal, "timeout");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(
      async () =>
        new Response(JSON.stringify(SAMPLE_MUTATION_RESPONSE), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );

    await setCommentHidden({ commentId: "c1", hidden: true });
    expect(timeoutSpy).toHaveBeenLastCalledWith(COMMENT_HIDE_TIMEOUT_MS);
    expect(fetchSpy).toHaveBeenLastCalledWith(
      "/api/comments/c1/hide",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ hidden: true }),
      }),
    );
  });

  it("includes moderation filter in commentKeys.list and constructs typed CommentBlockedError", () => {
    const keyDefault = commentKeys.list("t1", BASE_COMMENT_FILTER);
    const keyFlagged = commentKeys.list("t1", {
      ...BASE_COMMENT_FILTER,
      moderation: "flagged",
    });
    expect(keyDefault).not.toEqual(keyFlagged);
    expect(keyFlagged).toContain("flagged");

    const blocked = new CommentBlockedError({
      status: 422,
      userMessage: "Nội dung bị chặn",
      reasons: ["có cụm cấm 'freeship'"],
    });
    expect(blocked).toBeInstanceOf(ApiError);
    expect(blocked.code).toBe("BLOCKED");
    expect(blocked.reasons).toEqual(["có cụm cấm 'freeship'"]);
  });
});
