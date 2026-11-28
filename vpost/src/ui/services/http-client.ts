import type { z } from "zod";

import { ApiErrorBodySchema } from "@/ui/schemas/tenant-health.schema";

import {
  cancelResponseBody,
  createRequestSignal,
  isAbortError,
  isCallerSignalAborted,
  isTimeoutError,
  normalizeAbortError,
} from "./abort";
import { ApiError, CLIENT_ERROR_CODES } from "./api-error";

/**
 * THE single low-level network entry point of the UI (core-data-fetching:
 * "một điểm ra vào"). Every `*.api.ts` goes through `apiRequest`; no component,
 * hook or service calls `fetch` on its own.
 *
 * What stops here so the rest of the app never sees it:
 *  - transport failures (offline, DNS, abort, timeout) -> ApiError
 *  - non-JSON bodies from a proxy -> ApiError(MALFORMED_RESPONSE)
 *  - the `{code, message}` error envelope of app/api/_lib/http-errors.ts
 *  - schema validation of the success payload (server data is external data)
 *
 * Fail-soft rule for this codebase: NOTHING here fails soft. Every screen is an
 * operator tool — a swallowed error would show an empty panel and let someone
 * believe a sync ran or a post was composed. Callers decide how to render the
 * error (see core-feedback-states: 4xx = sửa input, 5xx = thử lại).
 */

/** A server that needs longer than this is a server problem, not a slow link. */
const DEFAULT_TIMEOUT_MS = 15_000;

export interface ApiRequestOptions<T> {
  /**
   * `PATCH` is here for the one resource that saves a FIELD rather than a
   * document (`/api/tenants/onboarding-profile`): an absent key means "leave
   * the stored answer alone", which `PUT` cannot express.
   */
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /**
   * Serialised as JSON. Omitted when absent (GET, DELETE with query params).
   *
   * A `FormData` body is passed through untouched instead (E9 upload): the
   * browser must set `content-type` itself, because only it knows the multipart
   * boundary — setting the header by hand produces a body no server can parse.
   */
  body?: unknown;
  /** Contract of the success payload — parsed before it reaches React. */
  schema: z.ZodType<T>;
  signal?: AbortSignal;
  timeoutMs?: number;
  /** Vietnamese message when the payload does not match `schema`. */
  malformedMessage: string;
}

function encodeBody(body: unknown, isForm: boolean): BodyInit | undefined {
  if (body === undefined) return undefined;
  return isForm ? (body as FormData) : JSON.stringify(body);
}

/** A 502 from a proxy returns HTML; parsing it must not throw a raw SyntaxError. */
async function readJson(
  response: Response,
  callerSignal: AbortSignal | undefined,
  fallbackReason: string,
): Promise<unknown> {
  if (isCallerSignalAborted(callerSignal)) {
    cancelResponseBody(response);
    throw normalizeAbortError(callerSignal?.reason, callerSignal, fallbackReason);
  }
  try {
    return await response.json();
  } catch (cause) {
    if (isCallerSignalAborted(callerSignal)) {
      throw normalizeAbortError(cause, callerSignal, fallbackReason);
    }
    if (isTimeoutError(cause)) {
      throw new ApiError({
        code: CLIENT_ERROR_CODES.TIMEOUT,
        status: 0,
        message: cause instanceof Error ? cause.message : String(cause),
        userMessage: "Máy chủ phản hồi quá lâu. Hãy thử lại.",
        cause,
      });
    }
    if (isAbortError(cause)) {
      throw normalizeAbortError(cause, callerSignal, fallbackReason);
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
}

/** Maps the shared `{code, message, issues?}` envelope onto ApiError. */
export function toApiErrorBody(status: number, payload: unknown): ApiError {
  const parsed = ApiErrorBodySchema.safeParse(payload);

  // The server always answers with {code, message}; anything else means a proxy
  // or a framework page answered instead — do not invent a friendly message.
  if (!parsed.success) {
    return new ApiError({
      code: CLIENT_ERROR_CODES.MALFORMED_RESPONSE,
      status,
      message: `Unrecognised error body for HTTP ${status}`,
      userMessage: "Máy chủ trả về lỗi không xác định. Hãy thử lại sau ít phút.",
    });
  }

  return new ApiError({
    code: parsed.data.code,
    status,
    userMessage: parsed.data.message,
    message: `${parsed.data.code} (HTTP ${status})`,
    issues: parsed.data.issues,
  });
}

/** Everything both entry points share: the fetch itself and its failure modes. */
async function sendRequest(
  path: string,
  options: Omit<ApiRequestOptions<unknown>, "schema" | "malformedMessage">,
  requestSignal: AbortSignal,
  fallbackReason: string,
): Promise<Response> {
  const method = options.method ?? "GET";

  if (isCallerSignalAborted(options.signal)) {
    throw normalizeAbortError(options.signal?.reason, options.signal, fallbackReason);
  }

  let response: Response;
  try {
    const isForm = options.body instanceof FormData;
    response = await fetch(path, {
      method,
      headers:
        options.body === undefined || isForm
          ? { accept: "application/json" }
          : { accept: "application/json", "content-type": "application/json" },
      body: encodeBody(options.body, isForm),
      // Session-scoped operator data: never served from an HTTP cache.
      cache: "no-store",
      signal: requestSignal,
    });
  } catch (cause) {
    // An abort asked for by the caller (component unmounted, query cancelled,
    // navigation) is not a failure to report — normalize its reason and rethrow
    // so TanStack Query or the calling hook can drop it cleanly.
    if (isCallerSignalAborted(options.signal)) {
      throw normalizeAbortError(cause, options.signal, fallbackReason);
    }

    const isTimeout = isTimeoutError(cause);
    if (!isTimeout && isAbortError(cause)) {
      throw normalizeAbortError(cause, options.signal, fallbackReason);
    }

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

  return response;
}

export async function apiRequest<T>(path: string, options: ApiRequestOptions<T>): Promise<T> {
  const method = options.method ?? "GET";
  const fallbackReason = `${method} ${path} aborted`;
  const { signal: requestSignal, cleanup } = createRequestSignal(
    options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    options.signal,
    fallbackReason,
  );

  let response: Response;
  let payload: unknown;
  try {
    response = await sendRequest(path, options, requestSignal, fallbackReason);
    payload = await readJson(response, options.signal, fallbackReason);
  } finally {
    cleanup();
  }

  if (!response.ok) throw toApiErrorBody(response.status, payload);

  const parsed = options.schema.safeParse(payload);
  if (!parsed.success) {
    throw new ApiError({
      code: CLIENT_ERROR_CODES.MALFORMED_RESPONSE,
      status: response.status,
      // Paths only: the payload itself may hold operator data we must not log.
      message: `${method} ${path} payload failed validation: ${parsed.error.issues
        .map((issue) => issue.path.join("."))
        .join(", ")}`,
      userMessage: options.malformedMessage,
    });
  }

  return parsed.data;
}

/**
 * Same entry point for an endpoint that answers 204 (DELETE /api/posts/drafts).
 *
 * A 204 has no body at all, so `apiRequest` cannot serve it: parsing an empty
 * body would raise MALFORMED_RESPONSE on a call that succeeded. The failure path
 * is unchanged — an error still carries a body, and it is read the same way.
 */
export async function apiRequestNoContent(
  path: string,
  options: Omit<ApiRequestOptions<unknown>, "schema" | "malformedMessage">,
): Promise<void> {
  const method = options.method ?? "GET";
  const fallbackReason = `${method} ${path} aborted`;
  const { signal: requestSignal, cleanup } = createRequestSignal(
    options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    options.signal,
    fallbackReason,
  );

  try {
    const response = await sendRequest(path, options, requestSignal, fallbackReason);
    if (response.ok) return;

    throw toApiErrorBody(response.status, await readJson(response, options.signal, fallbackReason));
  } finally {
    cleanup();
  }
}
