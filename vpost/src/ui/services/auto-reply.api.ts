import {
  AUTO_REPLY_INTENTS,
  AUTO_REPLY_LIVE_CONFIRM_COPY,
  AUTO_REPLY_LOG_DEFAULT_LIMIT,
  AutoReplyLogResponseSchema,
  AutoReplySettingsListResponseSchema,
  AutoReplySettingUpdateInputSchema,
  AutoReplySettingUpdateResponseSchema,
  type AutoReplyAction,
  type AutoReplyIntent,
  type AutoReplyLogResponse,
  type AutoReplySettingsListResponse,
  type AutoReplySettingUpdateInput,
  type AutoReplySettingUpdateResponse,
} from "@/ui/schemas/auto-reply.schema";

import { ApiError } from "./api-error";
import { apiRequest } from "./http-client";

/**
 * Data layer for automatic comment-reply settings and log endpoints
 * (`.swarm/specs/auto-reply.md` § API):
 *  - `GET /api/comments/auto-reply-settings`
 *  - `PUT /api/comments/auto-reply-settings/{pageId}`
 *  - `GET /api/comments/auto-reply-log`
 */

function requireNonEmptyId(value: string, caller: string, userMessage: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new ApiError({
      code: "INVALID_INPUT",
      status: 0,
      message: `${caller} requires a non-empty identifier`,
      userMessage,
    });
  }
  return trimmed;
}

const VALID_INTENT_SET = new Set<string>(AUTO_REPLY_INTENTS);

function dedupeIntents(intents: readonly string[]): AutoReplyIntent[] {
  const selected = new Set<string>();
  for (const raw of intents) {
    const trimmed = raw.trim();
    if (VALID_INTENT_SET.has(trimmed)) {
      selected.add(trimmed);
    }
  }
  return AUTO_REPLY_INTENTS.filter((intent) => selected.has(intent));
}

export async function listAutoReplySettings(
  signal?: AbortSignal,
): Promise<AutoReplySettingsListResponse> {
  return apiRequest("/api/comments/auto-reply-settings", {
    schema: AutoReplySettingsListResponseSchema,
    signal,
    malformedMessage:
      "Dữ liệu cài đặt tự động trả lời không đúng định dạng. Hãy báo quản trị viên kiểm tra máy chủ.",
  });
}

/**
 * Saves per-Page auto-reply configuration (`PUT /api/comments/auto-reply-settings/{pageId}`).
 * Enforces explicit `confirmLive: true` when mode is `"live"` and validates intents & caps.
 */
export async function updateAutoReplySetting(
  pageId: string,
  input: AutoReplySettingUpdateInput,
  signal?: AbortSignal,
): Promise<AutoReplySettingUpdateResponse> {
  const safePageId = requireNonEmptyId(
    pageId,
    "updateAutoReplySetting",
    "Thiếu mã Fanpage cần lưu cài đặt tự động trả lời.",
  );

  if (input.mode === "live" && input.confirmLive !== true) {
    throw new ApiError({
      code: "CONFIRM_REQUIRED",
      status: 400,
      message: "Live auto-reply mode requires explicit confirmLive=true",
      userMessage: `${AUTO_REPLY_LIVE_CONFIRM_COPY}. Vui lòng xác nhận trước khi lưu.`,
    });
  }

  const candidate: AutoReplySettingUpdateInput = {
    enabled: input.enabled,
    mode: input.mode,
    intents: dedupeIntents(input.intents),
    ...(input.hourlyCap !== undefined ? { hourlyCap: input.hourlyCap } : {}),
    ...(input.dailyCap !== undefined ? { dailyCap: input.dailyCap } : {}),
    ...(input.mode === "live" ? { confirmLive: true } : {}),
  };

  const validated = AutoReplySettingUpdateInputSchema.safeParse(candidate);
  if (!validated.success) {
    const firstIssue = validated.error.issues[0];
    throw new ApiError({
      code: "INVALID_INPUT",
      status: 400,
      message: `updateAutoReplySetting invalid input: ${validated.error.issues
        .map((issue) => issue.path.join("."))
        .join(", ")}`,
      userMessage:
        firstIssue?.message ||
        "Thông số cài đặt tự động trả lời không hợp lệ. Vui lòng kiểm tra lại.",
    });
  }

  return apiRequest(`/api/comments/auto-reply-settings/${encodeURIComponent(safePageId)}`, {
    method: "PUT",
    body: validated.data,
    schema: AutoReplySettingUpdateResponseSchema,
    signal,
    malformedMessage:
      "Kết quả lưu cài đặt tự động trả lời không đúng định dạng. Hãy tải lại trang để kiểm tra.",
  });
}

export interface ListAutoReplyLogParams {
  readonly pageId?: string | null;
  readonly action?: AutoReplyAction | null;
  readonly cursor?: string | null;
  readonly limit?: number;
}

export async function listAutoReplyLog(
  params: ListAutoReplyLogParams = {},
  signal?: AbortSignal,
): Promise<AutoReplyLogResponse> {
  const query = new URLSearchParams();
  const pageId = params.pageId?.trim();
  if (pageId) query.set("pageId", pageId);
  if (params.action) query.set("action", params.action);
  if (params.cursor) query.set("cursor", params.cursor);
  const limit = params.limit ?? AUTO_REPLY_LOG_DEFAULT_LIMIT;
  if (Number.isInteger(limit) && limit >= 1 && limit <= 100) {
    query.set("limit", String(limit));
  }

  const qs = query.toString();
  return apiRequest(qs ? `/api/comments/auto-reply-log?${qs}` : "/api/comments/auto-reply-log", {
    schema: AutoReplyLogResponseSchema,
    signal,
    malformedMessage:
      "Dữ liệu nhật ký tự động trả lời không đúng định dạng. Hãy báo quản trị viên kiểm tra máy chủ.",
  });
}
