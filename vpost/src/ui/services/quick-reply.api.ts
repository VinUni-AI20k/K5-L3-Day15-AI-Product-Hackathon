import {
  QuickReplyDeleteResponseSchema,
  QuickReplyListResponseSchema,
  QuickReplyMutationResponseSchema,
  validateQuickReplyForm,
  validateQuickReplyShortcut,
  validateQuickReplyText,
  validateQuickReplyTitle,
  type QuickReplyCreateInput,
  type QuickReplyDeleteResponse,
  type QuickReplyListResponse,
  type QuickReplyMutationResponse,
  type QuickReplyUpdateInput,
} from "@/ui/schemas/quick-reply.schema";

import { ApiError } from "./api-error";
import { apiRequest } from "./http-client";

/**
 * Data layer for `/api/quick-replies*`.
 * Every response is parsed with zod via `apiRequest`.
 */

function requireTemplateId(raw: string, caller: string): string {
  const id = raw.trim();
  if (id.length === 0) {
    throw new ApiError({
      code: "INVALID_INPUT",
      status: 0,
      message: `${caller} requires a non-empty template id`,
      userMessage: "Thiếu mã mẫu trả lời.",
    });
  }
  return id;
}

export async function listQuickReplies(
  signal?: AbortSignal,
): Promise<QuickReplyListResponse> {
  return apiRequest("/api/quick-replies", {
    schema: QuickReplyListResponseSchema,
    signal,
    malformedMessage:
      "Danh sách mẫu trả lời nhanh không đúng định dạng. Hãy báo quản trị viên kiểm tra máy chủ.",
  });
}

export async function createQuickReply(
  input: QuickReplyCreateInput,
  signal?: AbortSignal,
): Promise<QuickReplyMutationResponse> {
  const checked = validateQuickReplyForm(input);
  if (!checked.ok) {
    const firstError =
      checked.errors.shortcut ??
      checked.errors.title ??
      checked.errors.text ??
      "Thông tin mẫu trả lời chưa hợp lệ.";
    throw new ApiError({
      code: "INVALID_INPUT",
      status: 0,
      message: `createQuickReply invalid input: ${firstError}`,
      userMessage: firstError,
    });
  }

  return apiRequest("/api/quick-replies", {
    method: "POST",
    body: checked.data,
    schema: QuickReplyMutationResponseSchema,
    signal,
    malformedMessage:
      "Kết quả tạo mẫu trả lời không đúng định dạng. Hãy tải lại danh sách để kiểm tra.",
  });
}

export async function updateQuickReply(
  params: { id: string; patch: QuickReplyUpdateInput },
  signal?: AbortSignal,
): Promise<QuickReplyMutationResponse> {
  const id = requireTemplateId(params.id, "updateQuickReply");
  const body: QuickReplyUpdateInput = {};

  if (params.patch.shortcut !== undefined) {
    const err = validateQuickReplyShortcut(params.patch.shortcut);
    if (err) {
      throw new ApiError({
        code: "INVALID_INPUT",
        status: 0,
        message: `updateQuickReply invalid shortcut: ${err}`,
        userMessage: err,
      });
    }
    body.shortcut = params.patch.shortcut.trim();
  }

  if (params.patch.title !== undefined) {
    const err = validateQuickReplyTitle(params.patch.title);
    if (err) {
      throw new ApiError({
        code: "INVALID_INPUT",
        status: 0,
        message: `updateQuickReply invalid title: ${err}`,
        userMessage: err,
      });
    }
    body.title = params.patch.title.trim();
  }

  if (params.patch.text !== undefined) {
    const err = validateQuickReplyText(params.patch.text);
    if (err) {
      throw new ApiError({
        code: "INVALID_INPUT",
        status: 0,
        message: `updateQuickReply invalid text: ${err}`,
        userMessage: err,
      });
    }
    body.text = params.patch.text.trim();
  }

  return apiRequest(`/api/quick-replies/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body,
    schema: QuickReplyMutationResponseSchema,
    signal,
    malformedMessage:
      "Kết quả cập nhật mẫu trả lời không đúng định dạng. Hãy tải lại danh sách để kiểm tra.",
  });
}

export async function deleteQuickReply(
  id: string,
  signal?: AbortSignal,
): Promise<QuickReplyDeleteResponse> {
  const templateId = requireTemplateId(id, "deleteQuickReply");
  return apiRequest(`/api/quick-replies/${encodeURIComponent(templateId)}`, {
    method: "DELETE",
    schema: QuickReplyDeleteResponseSchema,
    signal,
    malformedMessage:
      "Kết quả xoá mẫu trả lời không đúng định dạng. Hãy tải lại danh sách để kiểm tra.",
  });
}
