import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import {
  abortWithReason,
  createAbortReason,
  forwardAbortSignal,
  isAbortError,
  isTimeoutError,
  normalizeAbortError,
  suppressAbortRejection,
} from "@/ui/services/abort";
import { ApiError, CLIENT_ERROR_CODES } from "@/ui/services/api-error";
import { beaconComposeDraft } from "@/ui/services/draft.api";
import { apiRequest, apiRequestNoContent } from "@/ui/services/http-client";
import { sendThreadReply } from "@/ui/services/inbox.api";
import { postFileToStorage } from "@/ui/services/upload.api";
import { saveDefaultWritingStyle } from "@/ui/services/writing-style.api";

const OkSchema = z.object({ ok: z.boolean() });

function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("abort helpers", () => {
  it("aborts controllers with a meaningful AbortError reason instead of a reasonless abort", () => {
    const controller = new AbortController();
    abortWithReason(controller, "screen unmounted");

    expect(controller.signal.aborted).toBe(true);
    expect(controller.signal.reason).toBeInstanceOf(DOMException);
    expect((controller.signal.reason as DOMException).name).toBe("AbortError");
    expect((controller.signal.reason as DOMException).message).toBe("screen unmounted");

    // Calling again or on null/undefined is a safe no-op.
    expect(() => abortWithReason(controller, "second reason")).not.toThrow();
    expect(() => abortWithReason(null, "ignored")).not.toThrow();
    expect(() => abortWithReason(undefined, "ignored")).not.toThrow();
    expect((controller.signal.reason as DOMException).message).toBe("screen unmounted");
  });

  it("distinguishes intentional AbortError from TimeoutError and real network/server errors", () => {
    const abortErr = createAbortReason("navigation cancelled");
    const timeoutErr = new DOMException("The operation timed out", "TimeoutError");
    const apiTimeout = new ApiError({
      code: CLIENT_ERROR_CODES.TIMEOUT,
      status: 0,
      userMessage: "Timeout",
    });
    const apiNetwork = new ApiError({
      code: CLIENT_ERROR_CODES.NETWORK,
      status: 0,
      userMessage: "Offline",
    });
    const apiWrappedAbort = new ApiError({
      code: CLIENT_ERROR_CODES.NETWORK,
      status: 0,
      userMessage: "Aborted",
      cause: abortErr,
    });

    const abortedController = new AbortController();
    abortWithReason(abortedController, "cancelled");

    expect(isAbortError(abortErr)).toBe(true);
    expect(isAbortError(apiWrappedAbort)).toBe(true);
    expect(isAbortError(new TypeError("Failed to fetch"))).toBe(false);
    expect(isAbortError(apiNetwork)).toBe(false);

    // TimeoutError must NEVER be misclassified as a benign abort — even if a caller signal also aborted.
    expect(isTimeoutError(timeoutErr)).toBe(true);
    expect(isTimeoutError(apiTimeout)).toBe(true);
    expect(isAbortError(timeoutErr)).toBe(false);
    expect(isAbortError(timeoutErr, abortedController.signal)).toBe(false);
    expect(isAbortError(apiTimeout, abortedController.signal)).toBe(false);
  });

  it("replaces reasonless Chromium/TanStack abort messages with a meaningful fallback reason", () => {
    const bare = new AbortController();
    bare.abort();

    const normalized = normalizeAbortError(
      new DOMException("signal is aborted without reason", "AbortError"),
      bare.signal,
      "GET /api/members aborted",
    );

    expect(normalized).toBeInstanceOf(DOMException);
    expect(normalized.name).toBe("AbortError");
    expect(normalized.message).toBe("GET /api/members aborted");

    const explicit = new AbortController();
    abortWithReason(explicit, "tenant switched");
    expect(
      normalizeAbortError(explicit.signal.reason, explicit.signal, "GET /api/members aborted")
        .message,
    ).toBe("tenant switched");
  });

  it("forwards bare caller abort signals with a meaningful AbortError reason", () => {
    const caller = new AbortController();
    const { signal, cleanup } = forwardAbortSignal(caller.signal, "GET /api/me aborted");
    expect(signal).toBeDefined();

    caller.abort();
    expect(signal?.aborted).toBe(true);
    expect((signal?.reason as DOMException).name).toBe("AbortError");
    expect((signal?.reason as DOMException).message).toBe("GET /api/me aborted");
    cleanup();
  });

  it("suppressAbortRejection swallows AbortError with zero unhandledRejection events", async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => {
      unhandled.push(reason);
    };
    process.on("unhandledRejection", onUnhandled);
    try {
      suppressAbortRejection(
        Promise.reject(new DOMException("signal is aborted without reason", "AbortError")),
      );
      await flushMicrotasks();
      expect(unhandled).toHaveLength(0);
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });
});

describe("http-client abort handling", () => {
  it("short-circuits before calling fetch when caller signal is already aborted", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const controller = new AbortController();
    controller.abort();

    const error = await apiRequest("/api/members", {
      schema: OkSchema,
      signal: controller.signal,
      malformedMessage: "bad",
    }).catch((e: unknown) => e);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(error).toBeInstanceOf(DOMException);
    expect((error as DOMException).name).toBe("AbortError");
    expect((error as DOMException).message).toBe("GET /api/members aborted");
  });

  it("normalizes mid-flight reasonless aborts (TanStack Query style) to a meaningful AbortError", async () => {
    let seenSignal: AbortSignal | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn((_input: unknown, init?: RequestInit) => {
        seenSignal = init?.signal ?? undefined;
        return new Promise<Response>((_resolve, reject) => {
          seenSignal?.addEventListener("abort", () => {
            reject(seenSignal?.reason ?? new DOMException("signal is aborted without reason", "AbortError"));
          });
        });
      }),
    );

    const caller = new AbortController();
    const requestPromise = apiRequest("/api/catalog/source", {
      schema: OkSchema,
      signal: caller.signal,
      malformedMessage: "bad",
    });

    caller.abort();

    const error = await requestPromise.catch((e: unknown) => e);
    expect(ApiError.is(error)).toBe(false);
    expect(error).toBeInstanceOf(DOMException);
    expect((error as DOMException).name).toBe("AbortError");
    expect((error as DOMException).message).toBe("GET /api/catalog/source aborted");
    expect((seenSignal?.reason as DOMException | undefined)?.message).toBe(
      "GET /api/catalog/source aborted",
    );
  });

  it("cancels unread response body cleanly if aborted right after headers arrive", async () => {
    const cancelSpy = vi.fn(async () => undefined);
    const controller = new AbortController();

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        controller.abort();
        return {
          ok: true,
          status: 200,
          body: { cancel: cancelSpy },
          json: vi.fn(async () => ({ ok: true })),
        } as unknown as Response;
      }),
    );

    const error = await apiRequest("/api/me", {
      schema: OkSchema,
      signal: controller.signal,
      malformedMessage: "bad",
    }).catch((e: unknown) => e);

    expect(cancelSpy).toHaveBeenCalledTimes(1);
    expect(isAbortError(error)).toBe(true);
    expect((error as DOMException).message).toBe("GET /api/me aborted");
  });

  it("preserves TimeoutError as ApiError(TIMEOUT) and network failures as ApiError(NETWORK)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
      }),
    );

    await expect(
      apiRequest("/api/me", {
        schema: OkSchema,
        malformedMessage: "bad",
      }),
    ).rejects.toMatchObject({ code: CLIENT_ERROR_CODES.TIMEOUT, status: 0 });

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );

    await expect(
      apiRequestNoContent("/api/posts/drafts", {
        method: "DELETE",
      }),
    ).rejects.toMatchObject({ code: CLIENT_ERROR_CODES.NETWORK, status: 0 });
  });

  it("short-circuits pre-aborted requests across writing-style, inbox, and upload direct-fetch helpers", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const controller = new AbortController();
    abortWithReason(controller, "navigation away");

    await expect(
      saveDefaultWritingStyle(
        {
          voice: "Thân thiện",
          hashtags: { fixed: [], maxExtra: 2 },
        },
        controller.signal,
      ),
    ).rejects.toMatchObject({ name: "AbortError", message: "navigation away" });

    await expect(
      sendThreadReply(
        { threadId: "th-1", text: "Chào chị ạ", clientId: "cid-1" },
        controller.signal,
      ),
    ).rejects.toMatchObject({ name: "AbortError", message: "navigation away" });

    await expect(
      postFileToStorage(
        {
          postUrl: "https://storage.local/upload",
          formFields: { key: "k" },
          file: new File(["x"], "a.jpg", { type: "image/jpeg" }),
        },
        controller.signal,
      ),
    ).rejects.toMatchObject({ name: "AbortError", message: "navigation away" });

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("beaconComposeDraft ignores AbortError quietly without console.warn or unhandledRejection", async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on("unhandledRejection", onUnhandled);

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal("window", {});
    vi.stubGlobal("navigator", { sendBeacon: () => false });
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new DOMException("signal is aborted without reason", "AbortError"))),
    );

    try {
      const ok = beaconComposeDraft({
        payload: {
          savedAt: "2026-11-28T05:00:00.000Z",
          step: "san-pham",
          composeKey: "",
          productCode: "SP01",
          color: "",
          mediaKind: "image",
          videoTarget: "facebook_video",
          source: "drive",
          captions: {},
          captionOverrides: {},
          albumOrder: [],
          selectedChannelIds: [],
          shareCaption: false,
          schedule: { mode: "now", value: "" },
        },
      });
      expect(ok).toBe(true);
      await flushMicrotasks();
      expect(unhandled).toHaveLength(0);
      expect(warnSpy).not.toHaveBeenCalled();
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });
});
