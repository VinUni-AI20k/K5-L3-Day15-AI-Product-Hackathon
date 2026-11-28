import { InfiniteQueryObserver, QueryClient, QueryObserver } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { isBulkRunAbort, outcomeFromError } from "@/ui/hooks/useBulkRun";
import { executeComposeDraftSave } from "@/ui/hooks/useComposeDraft";
import type { ComposeDraftPayload } from "@/ui/schemas/post-draft.schema";
import { abortWithReason, createAbortReason } from "@/ui/services/abort";
import { ApiError, CLIENT_ERROR_CODES } from "@/ui/services/api-error";
import { apiRequest } from "@/ui/services/http-client";

const SAMPLE_DRAFT: ComposeDraftPayload = {
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
};

const PageSchema = z.object({ ok: z.boolean(), nextCursor: z.string().nullable() });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("useComposeDraft — executeComposeDraftSave abort regression", () => {
  it("treats intentional and navigation AbortError as quiet aborted no-op with zero unhandledRejection", async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on("unhandledRejection", onUnhandled);

    try {
      const controller = new AbortController();
      const savePromise = executeComposeDraftSave({
        payload: SAMPLE_DRAFT,
        signal: controller.signal,
        save: (_params, signal) =>
          new Promise((_resolve, reject) => {
            signal?.addEventListener("abort", () => reject(signal.reason));
          }),
      });

      abortWithReason(controller, "compose-draft: draft discarded");
      const discardedOutcome = await savePromise;
      expect(discardedOutcome).toEqual({ kind: "aborted" });

      // External AbortError (navigation / server restart) when controller itself was not aborted
      const externalOutcome = await executeComposeDraftSave({
        payload: SAMPLE_DRAFT,
        signal: new AbortController().signal,
        save: async () => {
          throw new DOMException("PUT /api/posts/drafts aborted", "AbortError");
        },
      });
      expect(externalOutcome).toEqual({ kind: "aborted" });

      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(unhandled).toHaveLength(0);
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });

  it("still reports real ApiError and TimeoutError as error outcomes", async () => {
    const apiErr = new ApiError({
      code: CLIENT_ERROR_CODES.NETWORK,
      status: 0,
      userMessage: "Mất kết nối máy chủ.",
    });
    const networkOutcome = await executeComposeDraftSave({
      payload: SAMPLE_DRAFT,
      signal: new AbortController().signal,
      save: async () => {
        throw apiErr;
      },
    });
    expect(networkOutcome).toEqual({
      kind: "error",
      errorMessage: "Mất kết nối máy chủ.",
    });

    const timeoutOutcome = await executeComposeDraftSave({
      payload: SAMPLE_DRAFT,
      signal: new AbortController().signal,
      save: async () => {
        throw new ApiError({
          code: CLIENT_ERROR_CODES.TIMEOUT,
          status: 0,
          userMessage: "Máy chủ phản hồi quá lâu. Hãy thử lại.",
        });
      },
    });
    expect(timeoutOutcome).toEqual({
      kind: "error",
      errorMessage: "Máy chủ phản hồi quá lâu. Hãy thử lại.",
    });
  });
});

describe("useBulkRun — abort classification regression", () => {
  it("ignores intentional and external AbortError while still surfacing real errors onto the row", () => {
    const activeController = new AbortController();
    const abortedController = new AbortController();
    abortWithReason(abortedController, "bulk-run: component unmounted");

    // External navigation/restart AbortError when controller wasn't aborted yet
    expect(
      isBulkRunAbort(
        new DOMException("POST /api/posts/compose aborted", "AbortError"),
        activeController.signal,
      ),
    ).toBe(true);
    // Unmount abort via abortWithReason
    expect(isBulkRunAbort(abortedController.signal.reason, abortedController.signal)).toBe(true);

    // TimeoutError and real network ApiError must NOT be treated as benign aborts
    const timeoutErr = new ApiError({
      code: CLIENT_ERROR_CODES.TIMEOUT,
      status: 0,
      userMessage: "Máy chủ phản hồi quá lâu. Hãy thử lại.",
    });
    expect(isBulkRunAbort(timeoutErr, activeController.signal)).toBe(false);
    expect(outcomeFromError(timeoutErr)).toEqual({
      status: "error",
      reason: "Máy chủ phản hồi quá lâu. Hãy thử lại.",
      errorCode: CLIENT_ERROR_CODES.TIMEOUT,
    });

    const networkErr = new ApiError({
      code: CLIENT_ERROR_CODES.NETWORK,
      status: 0,
      userMessage: "Không kết nối được máy chủ.",
    });
    expect(isBulkRunAbort(networkErr, activeController.signal)).toBe(false);
    expect(outcomeFromError(networkErr)).toEqual({
      status: "error",
      reason: "Không kết nối được máy chủ.",
      errorCode: CLIENT_ERROR_CODES.NETWORK,
    });
  });
});

describe("TanStack Query + apiRequest cancellation lifecycle", () => {
  it("cancels in-flight QueryObserver and InfiniteQueryObserver fetches on unmount and invalidateQueries with zero unhandledRejection", async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on("unhandledRejection", onUnhandled);

    const abortReasons: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((_input: unknown, init?: RequestInit) => {
        const signal = init?.signal ?? undefined;
        return new Promise<Response>((_resolve, reject) => {
          signal?.addEventListener("abort", () => {
            const reason = signal.reason;
            abortReasons.push(reason instanceof Error ? reason.message : String(reason));
            reject(reason ?? createAbortReason("fallback"));
          });
        });
      }),
    );

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    try {
      // 1. Mount + immediate unmount (StrictMode / navigation) on a regular query
      const queryObserver = new QueryObserver(queryClient, {
        queryKey: ["members", "t1"],
        queryFn: ({ signal }) =>
          apiRequest("/api/members", { schema: PageSchema, signal, malformedMessage: "bad" }),
      });
      const unsubQuery = queryObserver.subscribe(() => {});
      await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
      unsubQuery();

      // 2. Seeded InfiniteQuery invalidated twice rapidly while fetching (inbox polling/markRead)
      queryClient.setQueryData(["inbox", "t1", "threads"], {
        pages: [{ ok: true, nextCursor: null }],
        pageParams: [null],
      });
      const infiniteObserver = new InfiniteQueryObserver(queryClient, {
        queryKey: ["inbox", "t1", "threads"],
        queryFn: ({ signal }) =>
          apiRequest("/api/comments/threads", {
            schema: PageSchema,
            signal,
            malformedMessage: "bad",
          }),
        initialPageParam: null as string | null,
        getNextPageParam: (last) => last.nextCursor,
      });
      const unsubInf = infiniteObserver.subscribe(() => {});

      void queryClient.invalidateQueries({ queryKey: ["inbox", "t1", "threads"] });
      void queryClient.invalidateQueries({ queryKey: ["inbox", "t1", "threads"] });
      await queryClient.cancelQueries({ queryKey: ["inbox", "t1", "threads"] });
      unsubInf();

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(unhandled).toHaveLength(0);
      expect(abortReasons.length).toBeGreaterThanOrEqual(2);
      expect(abortReasons.every((msg) => !/signal is aborted without reason/i.test(msg))).toBe(true);
      expect(abortReasons).toContain("GET /api/members aborted");
      expect(abortReasons).toContain("GET /api/comments/threads aborted");
    } finally {
      queryClient.clear();
      process.off("unhandledRejection", onUnhandled);
    }
  });
});
