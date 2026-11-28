import {
  CommentMutationResponseSchema,
  CommentSyncResponseSchema,
  type CommentFilter,
  type CommentMutationResponse,
  type CommentSyncResponse,
} from "@/ui/schemas/comment.schema";

import { ApiError } from "./api-error";
import { apiRequest } from "./http-client";

/**
 * Typed 422 BLOCKED error carrying the structured `reasons` array from
 * `POST /api/comments/threads/{id}/reply` without modifying shared `ApiError`.
 */
export class CommentBlockedError extends ApiError {
  readonly reasons: readonly string[];

  constructor(params: {
    status: number;
    userMessage: string;
    reasons: readonly string[];
    message?: string;
  }) {
    super({
      code: "BLOCKED",
      status: params.status,
      userMessage: params.userMessage,
      message: params.message ?? `BLOCKED (HTTP ${params.status})`,
    });
    this.name = "CommentBlockedError";
    this.reasons = params.reasons;
  }
}

/**
 * Shared comment transport helpers still used by the conversation inbox,
 * moderation hooks, and updates poller (`/api/comments/sync`, `/hide`).
 */

/** AI draft generation runs a model call plus up to one retry. */
export const AI_DRAFT_TIMEOUT_MS = 90_000;

/** Syncing comments pages through Graph API per published post. */
export const SYNC_TIMEOUT_MS = 60_000;

/**
 * Facebook Graph API reply/hide calls wait up to 30s server-side
 * (`codebase/facebook.py`); keep client timeout comfortably above that.
 */
export const COMMENT_SEND_TIMEOUT_MS = 45_000;
export const COMMENT_HIDE_TIMEOUT_MS = 45_000;

/** Shared query-key factory still referenced by moderation & updates invalidation. */
export const commentKeys = {
  all: (tenantKey: string) => ["comments", tenantKey] as const,
  list: (tenantKey: string, filter: CommentFilter) =>
    [
      "comments",
      tenantKey,
      "list",
      filter.status,
      filter.moderation ?? "all",
      filter.channelId ?? "all",
      filter.postJobId ?? "all",
      filter.q ?? "",
    ] as const,
};

function requireCommentId(commentId: string, caller: string): string {
  const id = commentId.trim();
  if (id.length === 0) {
    throw new ApiError({
      code: "INVALID_INPUT",
      status: 0,
      message: `${caller} requires a commentId`,
      userMessage: "Thiếu mã bình luận.",
    });
  }
  return id;
}

export interface SyncCommentsParams {
  channelId?: string | null;
  postJobId?: string | null;
  lookbackDays?: number | null;
}

export async function syncComments(
  params: SyncCommentsParams = {},
  signal?: AbortSignal,
): Promise<CommentSyncResponse> {
  const body: Record<string, unknown> = {};
  const channelId = params.channelId?.trim();
  const postJobId = params.postJobId?.trim();
  if (channelId) body.channelId = channelId;
  if (postJobId) body.postJobId = postJobId;
  if (typeof params.lookbackDays === "number" && Number.isInteger(params.lookbackDays)) {
    body.lookbackDays = params.lookbackDays;
  }

  return apiRequest("/api/comments/sync", {
    method: "POST",
    body,
    schema: CommentSyncResponseSchema,
    signal,
    timeoutMs: SYNC_TIMEOUT_MS,
    malformedMessage:
      "Kết quả đồng bộ bình luận không đúng định dạng. Hãy tải lại trang để kiểm tra.",
  });
}

export async function setCommentHidden(
  params: { commentId: string; hidden: boolean },
  signal?: AbortSignal,
): Promise<CommentMutationResponse> {
  const id = requireCommentId(params.commentId, "setCommentHidden");
  return apiRequest(`/api/comments/${encodeURIComponent(id)}/hide`, {
    method: "POST",
    body: { hidden: Boolean(params.hidden) },
    schema: CommentMutationResponseSchema,
    signal,
    timeoutMs: COMMENT_HIDE_TIMEOUT_MS,
    malformedMessage:
      "Kết quả ẩn/hiện bình luận không đúng định dạng. Hãy tải lại để kiểm tra trạng thái.",
  });
}
