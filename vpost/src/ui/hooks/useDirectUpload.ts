"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { UploadResponse } from "@/ui/schemas/compose.schema";
import { abortWithReason, isAbortError, normalizeAbortError } from "@/ui/services/abort";
import { ApiError } from "@/ui/services/api-error";
import {
  confirmUpload,
  postFileToStorage,
  requestUploadTickets,
  type TicketsResponse,
} from "@/ui/services/upload.api";

import { nextProgress, planUploadOrder } from "./direct-upload-queue";

/**
 * Drives the browser -> MinIO -> confirm path (mode B, docs/07 §4.1). The
 * pure decisions (candidate shape, progress maths) live in
 * `direct-upload-queue.ts` so they are unit-testable without a DOM; the
 * orchestration itself lives in `runDirectUpload` below, exported for the
 * same reason — a hook cannot be called outside a React render, so testing
 * the ticket -> upload -> confirm flow (and the I1 rejection merge) needs a
 * plain async function `useDirectUpload` can be a thin, stateful shell
 * around.
 */

/** How many files POST at once. Three keeps a home connection responsive. */
const CONCURRENCY = 3;

export interface DirectUploadState {
  readonly isUploading: boolean;
  readonly progress: number;
  readonly error: string | null;
}

export interface UseDirectUploadResult extends DirectUploadState {
  /** Resolves to `null` when the upload was intentionally cancelled or unmounted. */
  upload: (productCode: string, files: readonly File[]) => Promise<UploadResponse | null>;
  cancel: () => void;
}

/** The three network calls `runDirectUpload` makes, injectable for tests. */
export interface DirectUploadServices {
  requestUploadTickets: typeof requestUploadTickets;
  postFileToStorage: typeof postFileToStorage;
  confirmUpload: typeof confirmUpload;
}

const defaultServices: DirectUploadServices = {
  requestUploadTickets,
  postFileToStorage,
  confirmUpload,
};

/**
 * Runs the full ticket -> upload -> confirm flow for one album and returns a
 * SINGLE `UploadResponse` whose `rejected` list carries BOTH stages'
 * refusals.
 *
 * Business rule 5 (nothing may be silently dropped) is why this merge exists:
 * a file the ticket stage refuses before ever touching MinIO (wrong
 * extension, too many files) must reach the operator exactly like one confirm
 * refuses after sniffing its bytes — same list, same screen. Before this fix
 * only the confirm-stage `rejected` ever reached the caller.
 */
export async function runDirectUpload(
  params: { productCode: string; files: readonly File[] },
  onProgress: (done: number, total: number) => void,
  controller: AbortController,
  services: DirectUploadServices = defaultServices,
): Promise<UploadResponse> {
  const tickets = await services.requestUploadTickets(
    { productCode: params.productCode, files: planUploadOrder(params.files) },
    controller.signal,
  );

  // Paired by `sourceIndex`, NEVER by file name: two same-named photos in one
  // album is ordinary, and matching by name would silently drop one with
  // nobody told.
  const jobs = tickets.issued
    .map((ticket) => ({ ticket, file: params.files[ticket.sourceIndex] }))
    .filter((job): job is { ticket: TicketsResponse["issued"][number]; file: File } => job.file !== undefined);

  // Edge case first: every file refused at the ticket stage leaves nothing to
  // upload or confirm. Calling `confirmUpload` with an empty asset list would
  // throw its own "nothing to confirm" error and BURY the real, per-file
  // reasons already sitting in `tickets.rejected`.
  if (jobs.length === 0) {
    return { accepted: [], rejected: [...tickets.rejected], warnings: [] };
  }

  let done = 0;
  // A manual worker pool instead of Promise.all: caps concurrent POSTs at
  // CONCURRENCY, and lets one failure abort the rest via `signal` rather than
  // silently confirming a partial album.
  const queue = [...jobs];
  let failure: unknown = null;

  async function worker(): Promise<void> {
    for (;;) {
      if (failure || controller.signal.aborted) return;
      const job = queue.shift();
      if (!job) return;
      try {
        await services.postFileToStorage(
          { postUrl: job.ticket.postUrl, formFields: job.ticket.formFields, file: job.file },
          controller.signal,
        );
      } catch (error) {
        // Keep the first real failure: sibling workers aborting on the shared
        // signal must never overwrite the file-named network/storage cause.
        if (failure === null || (isAbortError(failure) && !isAbortError(error))) {
          failure = error;
        }
        abortWithReason(
          controller,
          isAbortError(error)
            ? `direct-upload: upload aborted during "${job.file.name}"`
            : `direct-upload: sibling file "${job.file.name}" failed`,
        );
        throw error;
      }
      done += 1;
      onProgress(done, jobs.length);
    }
  }

  try {
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, worker));
  } catch (settledError) {
    // Prefer the recorded failure: other workers racing on the same aborted
    // signal can reject first with a generic AbortError, and that must not
    // bury the real, file-named cause.
    throw failure ?? settledError;
  }

  if (controller.signal.aborted) {
    throw normalizeAbortError(
      controller.signal.reason,
      controller.signal,
      "direct-upload: aborted before confirm",
    );
  }

  const confirmed = await services.confirmUpload(
    { productCode: params.productCode, assets: jobs.map((job) => ({ assetId: job.ticket.assetId })) },
    controller.signal,
  );

  return {
    ...confirmed,
    // I1: ticket-stage refusals first (they happened first), then whatever
    // confirm refused after sniffing the bytes.
    rejected: [...tickets.rejected, ...confirmed.rejected],
  };
}

export interface ExecuteDirectUploadParams {
  readonly productCode: string;
  readonly files: readonly File[];
  readonly controller: AbortController;
  readonly onStateChange: (
    updater: DirectUploadState | ((prev: DirectUploadState) => DirectUploadState),
  ) => void;
  readonly isMounted?: () => boolean;
  readonly services?: DirectUploadServices;
}

/**
 * Stateful upload runner shared between `useDirectUpload` and unit tests:
 * treats intentional aborts (cancel, unmount, navigation) as a clean `null`
 * no-op without setting error UI or leaking an unhandled `AbortError`, while
 * still surfacing real network/server errors.
 */
export async function executeDirectUpload({
  productCode,
  files,
  controller,
  onStateChange,
  isMounted = () => true,
  services = defaultServices,
}: ExecuteDirectUploadParams): Promise<UploadResponse | null> {
  const safeSetState = (
    updater: DirectUploadState | ((prev: DirectUploadState) => DirectUploadState),
  ) => {
    if (isMounted()) onStateChange(updater);
  };

  safeSetState({ isUploading: true, progress: 0, error: null });

  try {
    const result = await runDirectUpload(
      { productCode, files },
      (done, total) => safeSetState((prev) => ({ ...prev, progress: nextProgress(done, total) })),
      controller,
      services,
    );

    safeSetState({ isUploading: false, progress: 100, error: null });
    return result;
  } catch (error) {
    // Only treat the failure as an intentional cancel when the error itself is
    // an abort (a sibling-file network failure also aborts the shared controller,
    // so checking `isAbortError(error)` alone preserves real upload failures!).
    if (isAbortError(error)) {
      safeSetState({ isUploading: false, progress: 0, error: null });
      return null;
    }

    // Never swallowed: a Vietnamese message reaches the operator and the
    // error is rethrown so the caller's own error handling still runs.
    const message = ApiError.is(error)
      ? error.userMessage
      : error instanceof Error
        ? error.message
        : "Tải file lên thất bại.";
    safeSetState({ isUploading: false, progress: 0, error: message });
    throw error;
  }
}

export function useDirectUpload(): UseDirectUploadResult {
  const [state, setState] = useState<DirectUploadState>({
    isUploading: false,
    progress: 0,
    error: null,
  });
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortWithReason(abortRef.current, "direct-upload: component unmounted");
      abortRef.current = null;
    };
  }, []);

  const cancel = useCallback(() => {
    abortWithReason(abortRef.current, "direct-upload: cancelled by operator");
    abortRef.current = null;
    setState({ isUploading: false, progress: 0, error: null });
  }, []);

  const upload = useCallback(
    async (productCode: string, files: readonly File[]): Promise<UploadResponse | null> => {
      abortWithReason(abortRef.current, "direct-upload: superseded by new upload");
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        return await executeDirectUpload({
          productCode,
          files,
          controller,
          onStateChange: setState,
          isMounted: () => mountedRef.current,
        });
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
      }
    },
    [],
  );

  return { ...state, upload, cancel };
}
