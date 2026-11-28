import type { z } from "zod";

import {
  WritingStyleChannelResponseSchema,
  WritingStyleErrorBodySchema,
  WritingStyleOverviewResponseSchema,
  WritingStylePreviewResponseSchema,
  type WritingStyle,
  type WritingStyleChannelResponse,
  type WritingStyleFieldError,
  type WritingStyleOverviewResponse,
  type WritingStylePreviewResponse,
} from "@/ui/schemas/writing-style.schema";

import { ApiError, CLIENT_ERROR_CODES } from "./api-error";
import { apiRequest, apiRequestNoContent, toApiErrorBody } from "./http-client";

/**
 * Data layer for the "Phong cách viết" screen (`.swarm/specs/writing-style.md`):
 *  - `GET    /api/writing-style`
 *  - `PUT    /api/writing-style`
 *  - `GET    /api/writing-style/{channelId}`
 *  - `PUT    /api/writing-style/{channelId}`
 *  - `DELETE /api/writing-style/{channelId}`
 *  - `POST   /api/writing-style/preview`
 */

const DEFAULT_TIMEOUT_MS = 15_000;
/** Preview runs an LLM generation call — give it the same generous timeout as AI drafts. */
export const WRITING_STYLE_PREVIEW_TIMEOUT_MS = 90_000;

export const writingStyleKeys = {
  all: (tenantKey: string) => ["writing-style", tenantKey] as const,
  overview: (tenantKey: string) => ["writing-style", tenantKey, "overview"] as const,
  channel: (tenantKey: string, channelId: string) =>
    ["writing-style", tenantKey, "channel", channelId] as const,
};

/**
 * Typed validation error carrying the spec's `fields: [{ field, message }]`
 * array while also populating `ApiError.issues` so shared error surfaces read
 * it without modifying `http-client.ts` or `api-error.ts`.
 */
export class WritingStyleValidationError extends ApiError {
  readonly fields: readonly WritingStyleFieldError[];

  constructor(params: {
    code: string;
    status: number;
    userMessage: string;
    fields: readonly WritingStyleFieldError[];
    message?: string;
  }) {
    super({
      code: params.code,
      status: params.status,
      userMessage: params.userMessage,
      message: params.message ?? `${params.code} (HTTP ${params.status})`,
      issues: params.fields.map((entry) => ({
        path: entry.field,
        message: entry.message,
      })),
    });
    this.name = "WritingStyleValidationError";
    this.fields = params.fields;
  }
}

/**
 * Parses error payloads from writing-style endpoints, preserving `fields` when
 * the Python backend returns `{ code: "INVALID_INPUT", message, fields }`.
 */
export function parseWritingStyleErrorBody(status: number, payload: unknown): ApiError {
  const parsed = WritingStyleErrorBodySchema.safeParse(payload);
  if (parsed.success && parsed.data.fields && parsed.data.fields.length > 0) {
    return new WritingStyleValidationError({
      code: parsed.data.code,
      status,
      userMessage: parsed.data.message,
      fields: parsed.data.fields,
    });
  }
  return toApiErrorBody(status, payload);
}

function requireChannelId(channelId: string, caller: string): string {
  const trimmed = channelId.trim();
  if (trimmed.length === 0) {
    throw new ApiError({
      code: "INVALID_INPUT",
      status: 0,
      message: `${caller} requires a non-empty channelId`,
      userMessage: "Thiếu mã Page để thao tác phong cách viết.",
    });
  }
  return trimmed;
}

/**
 * Mutation request helper preserving structured `fields` errors without editing
 * shared `http-client.ts`.
 */
async function writingStyleJsonRequest<T>(
  path: string,
  options: {
    method: "PUT" | "POST";
    body: unknown;
    schema: z.ZodType<T>;
    malformedMessage: string;
    timeoutMs?: number;
    signal?: AbortSignal;
  },
): Promise<T> {
  const timeout = AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const combinedSignal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;

  let response: Response;
  try {
    response = await fetch(path, {
      method: options.method,
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify(options.body),
      cache: "no-store",
      signal: combinedSignal,
    });
  } catch (cause) {
    if (options.signal?.aborted) throw cause;
    const isTimeout = cause instanceof DOMException && cause.name === "TimeoutError";
    throw new ApiError({
      code: isTimeout ? CLIENT_ERROR_CODES.TIMEOUT : CLIENT_ERROR_CODES.NETWORK,
      status: 0,
      message: cause instanceof Error ? cause.message : String(cause),
      userMessage: isTimeout
        ? "Máy chủ phản hồi quá lâu. Hãy thử lại."
        : "Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.",
      cause,
    });
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (cause) {
    throw new ApiError({
      code: CLIENT_ERROR_CODES.MALFORMED_RESPONSE,
      status: response.status,
      message: "Response body is not valid JSON",
      userMessage:
        "Máy chủ trả về dữ liệu không đọc được. Hãy thử lại; nếu vẫn lỗi, báo quản trị viên.",
      cause,
    });
  }

  if (!response.ok) {
    throw parseWritingStyleErrorBody(response.status, payload);
  }

  const parsed = options.schema.safeParse(payload);
  if (!parsed.success) {
    throw new ApiError({
      code: CLIENT_ERROR_CODES.MALFORMED_RESPONSE,
      status: response.status,
      message: `${options.method} ${path} payload failed validation: ${parsed.error.issues
        .map((issue) => issue.path.join("."))
        .join(", ")}`,
      userMessage: options.malformedMessage,
    });
  }

  return parsed.data;
}

export async function fetchWritingStyleOverview(
  signal?: AbortSignal,
): Promise<WritingStyleOverviewResponse> {
  return apiRequest("/api/writing-style", {
    schema: WritingStyleOverviewResponseSchema,
    signal,
    malformedMessage:
      "Dữ liệu phong cách viết trả về không đúng định dạng. Hãy báo quản trị viên kiểm tra máy chủ.",
  });
}

export async function saveDefaultWritingStyle(
  style: WritingStyle,
  signal?: AbortSignal,
): Promise<WritingStyleOverviewResponse> {
  return writingStyleJsonRequest("/api/writing-style", {
    method: "PUT",
    body: { style },
    schema: WritingStyleOverviewResponseSchema,
    signal,
    malformedMessage:
      "Kết quả lưu phong cách viết không đúng định dạng. Hãy tải lại trang để kiểm tra dữ liệu đã lưu.",
  });
}

export async function fetchChannelWritingStyle(
  channelId: string,
  signal?: AbortSignal,
): Promise<WritingStyleChannelResponse> {
  const id = requireChannelId(channelId, "fetchChannelWritingStyle");
  return apiRequest(`/api/writing-style/${encodeURIComponent(id)}`, {
    schema: WritingStyleChannelResponseSchema,
    signal,
    malformedMessage:
      "Dữ liệu phong cách riêng của Page không đúng định dạng. Hãy báo quản trị viên kiểm tra máy chủ.",
  });
}

export async function saveChannelWritingStyle(
  channelId: string,
  style: WritingStyle,
  signal?: AbortSignal,
): Promise<WritingStyleChannelResponse> {
  const id = requireChannelId(channelId, "saveChannelWritingStyle");
  return writingStyleJsonRequest(`/api/writing-style/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: { style },
    schema: WritingStyleChannelResponseSchema,
    signal,
    malformedMessage:
      "Kết quả lưu phong cách riêng của Page không đúng định dạng. Hãy tải lại trang để kiểm tra.",
  });
}

export async function deleteChannelWritingStyle(
  channelId: string,
  signal?: AbortSignal,
): Promise<void> {
  const id = requireChannelId(channelId, "deleteChannelWritingStyle");
  return apiRequestNoContent(`/api/writing-style/${encodeURIComponent(id)}`, {
    method: "DELETE",
    signal,
  });
}

export interface PreviewWritingStyleParams {
  readonly channelId?: string | null;
  readonly productCode: string;
  readonly style?: WritingStyle;
}

export async function previewWritingStyle(
  params: PreviewWritingStyleParams,
  signal?: AbortSignal,
): Promise<WritingStylePreviewResponse> {
  const productCode = params.productCode.trim();
  if (productCode.length === 0) {
    throw new ApiError({
      code: "INVALID_INPUT",
      status: 0,
      message: "previewWritingStyle requires a productCode",
      userMessage: "Vui lòng chọn sản phẩm trước khi viết thử.",
    });
  }

  const body: Record<string, unknown> = { productCode };
  const channelId = params.channelId?.trim();
  if (channelId) body.channelId = channelId;
  if (params.style !== undefined) body.style = params.style;

  return writingStyleJsonRequest("/api/writing-style/preview", {
    method: "POST",
    body,
    schema: WritingStylePreviewResponseSchema,
    timeoutMs: WRITING_STYLE_PREVIEW_TIMEOUT_MS,
    signal,
    malformedMessage:
      "Kết quả viết thử không đúng định dạng. Hãy thử lại hoặc báo quản trị viên kiểm tra máy chủ.",
  });
}
