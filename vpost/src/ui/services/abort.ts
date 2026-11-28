import { ApiError, CLIENT_ERROR_CODES } from "./api-error";

/**
 * Shared abort & cancellation helpers for the UI transport and hook layers.
 *
 * Why this exists:
 *  - Calling `controller.abort()` with no argument makes Chromium create a
 *    native `DOMException("signal is aborted without reason", "AbortError")`
 *    with an empty stack trace. Passing a `DOMException(reason, "AbortError")`
 *    keeps `error.name === "AbortError"` AND makes logs meaningful.
 *  - `AbortSignal.timeout(ms)` rejects with `DOMException(..., "TimeoutError")`,
 *    which is a real failure and must NEVER be mistaken for an intentional abort.
 */

const GENERIC_ABORT_MESSAGE_PATTERN =
  /^(?:signal is aborted without reason|the operation was aborted\.?|this operation was aborted\.?|the user aborted a request\.?)$/i;

/** Builds a standard `AbortError` DOMException carrying a meaningful reason. */
export function createAbortReason(reason: string): DOMException {
  const message = reason.trim();
  return new DOMException(message.length > 0 ? message : "Request was aborted", "AbortError");
}

/**
 * Aborts an `AbortController` with a meaningful `AbortError` DOMException.
 * Safe to call on `null`, `undefined`, or an already-aborted controller.
 */
export function abortWithReason(
  controller: AbortController | null | undefined,
  reason: string,
): void {
  if (!controller || controller.signal.aborted) return;
  controller.abort(createAbortReason(reason));
}

/** True when `error` represents a client timeout (never a benign caller abort). */
export function isTimeoutError(error: unknown): boolean {
  if (ApiError.is(error)) return error.code === CLIENT_ERROR_CODES.TIMEOUT;
  if (error instanceof DOMException) return error.name === "TimeoutError";
  if (error instanceof Error) return error.name === "TimeoutError";
  if (typeof error === "object" && error !== null && "name" in error) {
    return (error as { name?: unknown }).name === "TimeoutError";
  }
  return false;
}

/** True when a caller-owned `AbortSignal` was aborted for cancellation (not timeout). */
export function isCallerSignalAborted(signal?: AbortSignal): boolean {
  return Boolean(signal?.aborted) && !isTimeoutError(signal?.reason);
}

/**
 * True when `error` (or the caller's `signal`) indicates an intentional or
 * navigation/unmount abort. Always returns `false` for `TimeoutError` and
 * real network errors (`TypeError: Failed to fetch`, HTTP 4xx/5xx `ApiError`).
 */
export function isAbortError(error: unknown, signal?: AbortSignal): boolean {
  if (isCallerSignalAborted(signal)) return true;
  if (isTimeoutError(error)) return false;
  if (ApiError.is(error)) {
    return error.cause !== undefined && isAbortError(error.cause);
  }
  if (error instanceof DOMException) return error.name === "AbortError";
  if (error instanceof Error) return error.name === "AbortError";
  if (typeof error === "object" && error !== null && "name" in error) {
    return (error as { name?: unknown }).name === "AbortError";
  }
  return false;
}

function isMeaningfulAbortMessage(message: string): boolean {
  const trimmed = message.trim();
  return trimmed.length > 0 && !GENERIC_ABORT_MESSAGE_PATTERN.test(trimmed);
}

function extractMeaningfulAbort(value: unknown): DOMException | null {
  if (value instanceof DOMException) {
    if (value.name === "AbortError" && isMeaningfulAbortMessage(value.message)) {
      return value;
    }
    return null;
  }
  if (value instanceof Error) {
    if (isMeaningfulAbortMessage(value.message)) {
      return createAbortReason(value.message);
    }
    return null;
  }
  if (typeof value === "string" && isMeaningfulAbortMessage(value)) {
    return createAbortReason(value);
  }
  return null;
}

/**
 * Normalizes any abort rejection (including bare `controller.abort()` calls
 * from libraries like TanStack Query) into an `AbortError` DOMException with
 * a meaningful message instead of `"signal is aborted without reason"`.
 */
export function normalizeAbortError(
  cause: unknown,
  signal?: AbortSignal,
  fallbackReason = "Request was aborted",
): DOMException {
  if (isCallerSignalAborted(signal)) {
    const fromSignal = extractMeaningfulAbort(signal?.reason);
    if (fromSignal) return fromSignal;
  }
  const fromCause = extractMeaningfulAbort(cause);
  if (fromCause) return fromCause;
  return createAbortReason(fallbackReason);
}

/**
 * Forwards an optional caller `AbortSignal` through a local controller so
 * reasonless aborts (e.g. TanStack Query calling `abortController.abort()`)
 * still carry a meaningful `AbortError` reason into `fetch()`.
 *
 * Call `cleanup()` in a `finally` block once the request and body read settle.
 */
export function forwardAbortSignal(
  callerSignal: AbortSignal | undefined,
  fallbackReason: string,
): { signal: AbortSignal | undefined; cleanup: () => void } {
  if (!callerSignal) {
    return { signal: undefined, cleanup: () => {} };
  }

  const forwarded = new AbortController();
  const forwardAbort = () => {
    if (forwarded.signal.aborted) return;
    if (isTimeoutError(callerSignal.reason)) {
      forwarded.abort(callerSignal.reason);
      return;
    }
    forwarded.abort(normalizeAbortError(callerSignal.reason, callerSignal, fallbackReason));
  };

  if (callerSignal.aborted) {
    forwardAbort();
    return { signal: forwarded.signal, cleanup: () => {} };
  }

  callerSignal.addEventListener("abort", forwardAbort, { once: true });
  return {
    signal: forwarded.signal,
    cleanup: () => {
      callerSignal.removeEventListener("abort", forwardAbort);
    },
  };
}

/**
 * Combines `AbortSignal.timeout(timeoutMs)` with an optional caller signal,
 * normalizing reasonless caller aborts while keeping `TimeoutError` intact.
 */
export function createRequestSignal(
  timeoutMs: number,
  callerSignal: AbortSignal | undefined,
  fallbackReason: string,
): { signal: AbortSignal; cleanup: () => void } {
  const timeout = AbortSignal.timeout(timeoutMs);
  if (!callerSignal) {
    return { signal: timeout, cleanup: () => {} };
  }

  const forwarded = forwardAbortSignal(callerSignal, fallbackReason);
  return {
    signal: forwarded.signal ? AbortSignal.any([forwarded.signal, timeout]) : timeout,
    cleanup: forwarded.cleanup,
  };
}
