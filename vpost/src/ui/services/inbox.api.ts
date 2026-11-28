import {
  COMMENT_REPLY_MAX_LENGTH,
  CommentBlockedErrorBodySchema,
  INBOX_DEFAULT_RUNS_LIMIT,
  InboxLikeResponseSchema,
  InboxReplyResponseSchema,
  InboxThreadDetailResponseSchema,
  InboxThreadListResponseSchema,
  InboxThreadMutationResponseSchema,
  InboxThreadRunsResponseSchema,
  parseBlockedReasons,
  type InboxLikeResponse,
  type InboxReplyResponse,
  type InboxThreadDetailResponse,
  type InboxThreadFilterChip,
  type InboxThreadListResponse,
  type InboxThreadMutationResponse,
  type InboxThreadRunsResponse,
} from "@/ui/schemas/inbox.schema";
import {
  createRequestSignal,
  isAbortError,
  isCallerSignalAborted,
  isTimeoutError,
  normalizeAbortError,
} from "@/ui/services/abort";
import { ApiError, CLIENT_ERROR_CODES } from "@/ui/services/api-error";
import {
  AI_DRAFT_TIMEOUT_MS,
  COMMENT_HIDE_TIMEOUT_MS,
  COMMENT_SEND_TIMEOUT_MS,
  CommentBlockedError,
} from "@/ui/services/comment.api";
import { apiRequest, toApiErrorBody } from "@/ui/services/http-client";

/**
 * Data layer for the conversation inbox endpoints in `.swarm/specs/inbox-contract.md`
 * and `.swarm/specs/agent-run-trace.md`:
 *  - `GET  /api/comments/threads`
 *  - `GET  /api/comments/threads/{threadId}`
 *  - `GET  /api/comments/threads/{threadId}/runs`
 *  - `POST /api/comments/threads/{threadId}/read`
 *  - `POST /api/comments/threads/{threadId}/draft`
 *  - `POST /api/comments/threads/{threadId}/reply`
 *  - `POST /api/comments/threads/{threadId}/ignore`
 *  - `POST /api/comments/threads/{threadId}/unignore`
 *  - `POST /api/comments/threads/{threadId}/attention/clear`
 *  - `POST /api/comments/{commentId}/like`
 */

function requireNonEmptyId(value: string, caller: string, userMessage: string): string {
  const id = value.trim();
  if (id.length === 0) {
    throw new ApiError({
      code: "INVALID_INPUT",
      status: 0,
      message: `${caller} requires a non-empty id`,
      userMessage,
    });
  }
  return id;
}

function requireReplyText(text: string, caller: string): string {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    throw new ApiError({
      code: "INVALID_INPUT",
      status: 0,
      message: `${caller} requires non-empty text`,
      userMessage: "Nội dung trả lời không được để trống.",
    });
  }
  if (trimmed.length > COMMENT_REPLY_MAX_LENGTH) {
    throw new ApiError({
      code: "INVALID_INPUT",
      status: 0,
      message: `${caller} text exceeds ${COMMENT_REPLY_MAX_LENGTH} characters`,
      userMessage: `Nội dung trả lời tối đa ${COMMENT_REPLY_MAX_LENGTH.toLocaleString("vi-VN")} ký tự.`,
    });
  }
  return trimmed;
}

export interface ListThreadsParams {
  readonly filter?: InboxThreadFilterChip | null;
  readonly channelId?: string | null;
  readonly postJobId?: string | null;
  readonly q?: string | null;
  readonly cursor?: string | null;
  readonly limit?: number;
}

export async function listThreads(
  params: ListThreadsParams = {},
  signal?: AbortSignal,
): Promise<InboxThreadListResponse> {
  const query = new URLSearchParams();
  if (params.filter) query.set("filter", params.filter);
  const channelId = params.channelId?.trim();
  if (channelId) query.set("channelId", channelId);
  const postJobId = params.postJobId?.trim();
  if (postJobId) query.set("postJobId", postJobId);
  const q = params.q?.trim();
  if (q) query.set("q", q);
  if (params.cursor) query.set("cursor", params.cursor);
  if (typeof params.limit === "number" && Number.isInteger(params.limit) && params.limit > 0) {
    query.set("limit", String(params.limit));
  }

  const qs = query.toString();
  return apiRequest(qs ? `/api/comments/threads?${qs}` : "/api/comments/threads", {
    schema: InboxThreadListResponseSchema,
    signal,
    malformedMessage:
      "Dữ liệu danh sách hội thoại không đúng định dạng. Hãy báo quản trị viên kiểm tra máy chủ.",
  });
}

export interface GetThreadDetailParams {
  readonly threadId: string;
  readonly before?: string | null;
  readonly limit?: number;
}

export async function getThreadDetail(
  params: GetThreadDetailParams,
  signal?: AbortSignal,
): Promise<InboxThreadDetailResponse> {
  const id = requireNonEmptyId(params.threadId, "getThreadDetail", "Thiếu mã hội thoại.");
  const query = new URLSearchParams();
  if (params.before) query.set("before", params.before);
  if (typeof params.limit === "number" && Number.isInteger(params.limit) && params.limit > 0) {
    query.set("limit", String(params.limit));
  }
  const qs = query.toString();
  const basePath = `/api/comments/threads/${encodeURIComponent(id)}`;
  return apiRequest(qs ? `${basePath}?${qs}` : basePath, {
    schema: InboxThreadDetailResponseSchema,
    signal,
    malformedMessage:
      "Dữ liệu chi tiết hội thoại không đúng định dạng. Hãy tải lại để kiểm tra.",
  });
}

export interface ListThreadRunsParams {
  readonly threadId: string;
  readonly limit?: number;
}

export async function listThreadRuns(
  params: ListThreadRunsParams,
  signal?: AbortSignal,
): Promise<InboxThreadRunsResponse> {
  const id = requireNonEmptyId(params.threadId, "listThreadRuns", "Thiếu mã hội thoại.");
  const limit =
    typeof params.limit === "number" && Number.isInteger(params.limit) && params.limit > 0
      ? params.limit
      : INBOX_DEFAULT_RUNS_LIMIT;
  const query = new URLSearchParams({ limit: String(limit) });
  return apiRequest(
    `/api/comments/threads/${encodeURIComponent(id)}/runs?${query.toString()}`,
    {
      schema: InboxThreadRunsResponseSchema,
      signal,
      malformedMessage:
        "Dữ liệu quá trình xử lý của AI không đúng định dạng. Hãy thử tải lại.",
    },
  );
}

export async function markThreadRead(
  threadId: string,
  signal?: AbortSignal,
): Promise<InboxThreadMutationResponse> {
  const id = requireNonEmptyId(threadId, "markThreadRead", "Thiếu mã hội thoại.");
  return apiRequest(`/api/comments/threads/${encodeURIComponent(id)}/read`, {
    method: "POST",
    body: {},
    schema: InboxThreadMutationResponseSchema,
    signal,
    malformedMessage: "Kết quả đánh dấu đã đọc không đúng định dạng.",
  });
}

export async function generateThreadDraft(
  threadId: string,
  signal?: AbortSignal,
): Promise<InboxThreadMutationResponse> {
  const id = requireNonEmptyId(threadId, "generateThreadDraft", "Thiếu mã hội thoại.");
  return apiRequest(`/api/comments/threads/${encodeURIComponent(id)}/draft`, {
    method: "POST",
    body: {},
    schema: InboxThreadMutationResponseSchema,
    signal,
    timeoutMs: AI_DRAFT_TIMEOUT_MS,
    malformedMessage:
      "Kết quả tạo nháp AI không đúng định dạng. Hãy thử lại hoặc tự soạn câu trả lời.",
  });
}

/**
 * Sends a follow-up reply with an idempotent `clientId`.
 * Preserves structured 422 `BLOCKED` reasons via `CommentBlockedError` without
 * modifying shared `http-client.ts`.
 */
export async function sendThreadReply(
  params: { threadId: string; text: string; clientId: string },
  signal?: AbortSignal,
): Promise<InboxReplyResponse> {
  const id = requireNonEmptyId(params.threadId, "sendThreadReply", "Thiếu mã hội thoại.");
  const text = requireReplyText(params.text, "sendThreadReply");
  const clientId = requireNonEmptyId(
    params.clientId,
    "sendThreadReply",
    "Thiếu mã định danh tin gửi (clientId).",
  );
  const path = `/api/comments/threads/${encodeURIComponent(id)}/reply`;

  const fallbackReason = `POST ${path} aborted`;
  const { signal: combinedSignal, cleanup } = createRequestSignal(
    COMMENT_SEND_TIMEOUT_MS,
    signal,
    fallbackReason,
  );

  let response: Response;
  let payload: unknown;
  try {
    try {
      response = await fetch(path, {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
        },
        body: JSON.stringify({ text, clientId }),
        cache: "no-store",
        signal: combinedSignal,
      });
    } catch (cause) {
      if (isCallerSignalAborted(signal)) {
        throw normalizeAbortError(cause, signal, fallbackReason);
      }
      const isTimeout = isTimeoutError(cause);
      if (!isTimeout && isAbortError(cause)) {
        throw normalizeAbortError(cause, signal, fallbackReason);
      }
      throw new ApiError({
        code: isTimeout ? CLIENT_ERROR_CODES.TIMEOUT : CLIENT_ERROR_CODES.NETWORK,
        status: 0,
        message: cause instanceof Error ? cause.message : String(cause),
        userMessage: isTimeout
          ? "Máy chủ phản hồi quá lâu. Hãy bấm Thử lại."
          : "Không kết nối được máy chủ. Kiểm tra mạng rồi bấm Thử lại.",
        cause,
      });
    }

    try {
      payload = await response.json();
    } catch (cause) {
      if (isCallerSignalAborted(signal) || (!isTimeoutError(cause) && isAbortError(cause))) {
        throw normalizeAbortError(cause, signal, fallbackReason);
      }
      if (isTimeoutError(cause)) {
        throw new ApiError({
          code: CLIENT_ERROR_CODES.TIMEOUT,
          status: 0,
          message: cause instanceof Error ? cause.message : String(cause),
          userMessage: "Máy chủ phản hồi quá lâu. Hãy bấm Thử lại.",
          cause,
        });
      }
      throw new ApiError({
        code: CLIENT_ERROR_CODES.MALFORMED_RESPONSE,
        status: response.status,
        message: "Response body is not valid JSON",
        userMessage:
          "Máy chủ trả về dữ liệu không đọc được. Hãy thử lại; nếu vẫn lỗi, báo quản trị viên.",
        cause,
      });
    }
  } finally {
    cleanup();
  }

  if (!response.ok) {
    if (response.status === 422) {
      const blocked = CommentBlockedErrorBodySchema.safeParse(payload);
      if (blocked.success) {
        throw new CommentBlockedError({
          status: response.status,
          userMessage: blocked.data.message,
          reasons: parseBlockedReasons(blocked.data.message, blocked.data.reasons),
        });
      }
    }
    throw toApiErrorBody(response.status, payload);
  }

  const parsed = InboxReplyResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new ApiError({
      code: CLIENT_ERROR_CODES.MALFORMED_RESPONSE,
      status: response.status,
      message: `POST ${path} payload failed validation: ${parsed.error.issues
        .map((issue) => issue.path.join("."))
        .join(", ")}`,
      userMessage:
        "Kết quả gửi trả lời không đúng định dạng. Hãy kiểm tra lại trên Facebook trước khi gửi lại.",
    });
  }

  return parsed.data;
}

export async function ignoreThread(
  threadId: string,
  signal?: AbortSignal,
): Promise<InboxThreadMutationResponse> {
  const id = requireNonEmptyId(threadId, "ignoreThread", "Thiếu mã hội thoại.");
  return apiRequest(`/api/comments/threads/${encodeURIComponent(id)}/ignore`, {
    method: "POST",
    body: {},
    schema: InboxThreadMutationResponseSchema,
    signal,
    malformedMessage: "Kết quả bỏ qua hội thoại không đúng định dạng. Hãy tải lại danh sách.",
  });
}

export async function unignoreThread(
  threadId: string,
  signal?: AbortSignal,
): Promise<InboxThreadMutationResponse> {
  const id = requireNonEmptyId(threadId, "unignoreThread", "Thiếu mã hội thoại.");
  return apiRequest(`/api/comments/threads/${encodeURIComponent(id)}/unignore`, {
    method: "POST",
    body: {},
    schema: InboxThreadMutationResponseSchema,
    signal,
    malformedMessage: "Kết quả khôi phục hội thoại không đúng định dạng. Hãy tải lại danh sách.",
  });
}

export async function clearThreadAttention(
  threadId: string,
  signal?: AbortSignal,
): Promise<InboxThreadMutationResponse> {
  const id = requireNonEmptyId(threadId, "clearThreadAttention", "Thiếu mã hội thoại.");
  return apiRequest(`/api/comments/threads/${encodeURIComponent(id)}/attention/clear`, {
    method: "POST",
    body: {},
    schema: InboxThreadMutationResponseSchema,
    signal,
    malformedMessage:
      "Kết quả gỡ nhãn “Cần bạn” không đúng định dạng. Hãy tải lại hội thoại để kiểm tra.",
  });
}

export async function setCommentLiked(
  params: { commentId: string; liked: boolean },
  signal?: AbortSignal,
): Promise<InboxLikeResponse> {
  const id = requireNonEmptyId(params.commentId, "setCommentLiked", "Thiếu mã bình luận.");
  return apiRequest(`/api/comments/${encodeURIComponent(id)}/like`, {
    method: "POST",
    body: { liked: Boolean(params.liked) },
    schema: InboxLikeResponseSchema,
    signal,
    timeoutMs: COMMENT_HIDE_TIMEOUT_MS,
    malformedMessage: "Kết quả thích/bỏ thích bình luận không đúng định dạng. Hãy thử lại.",
  });
}
