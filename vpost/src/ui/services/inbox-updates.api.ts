import {
  CommentUpdatesResponseSchema,
  type CommentUpdatesResponse,
} from "@/ui/schemas/inbox-updates.schema";

import { apiRequest } from "./http-client";

export interface FetchCommentUpdatesParams {
  since?: string | null;
}

/**
 * Builds the request path for `GET /api/comments/updates`.
 * Omits `since` when absent/blank so the server returns an initial cursor without historical items.
 */
export function buildCommentUpdatesPath(params: FetchCommentUpdatesParams = {}): string {
  const since = params.since?.trim();
  if (!since) return "/api/comments/updates";
  const query = new URLSearchParams({ since });
  return `/api/comments/updates?${query.toString()}`;
}

/**
 * Fetches incremental customer comments and newly-ready AI drafts for the active tenant.
 * Cheap DB-only endpoint; never calls Facebook Graph API.
 */
export async function fetchCommentUpdates(
  params: FetchCommentUpdatesParams = {},
  signal?: AbortSignal,
): Promise<CommentUpdatesResponse> {
  return apiRequest(buildCommentUpdatesPath(params), {
    schema: CommentUpdatesResponseSchema,
    signal,
    malformedMessage: "Dữ liệu cập nhật bình luận không đúng định dạng.",
  });
}
