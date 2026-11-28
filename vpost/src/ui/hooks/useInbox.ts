"use client";

import {
  isCancelledError,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import { useCallback, useEffect, useRef } from "react";

import { inboxKeys } from "@/ui/hooks/inbox-keys";
import {
  readDocumentVisible,
  useDocumentVisible,
} from "@/ui/hooks/useCommentUpdates";
import { useActiveTenant } from "@/ui/hooks/useMe";
import type {
  CommentMutationResponse,
  CommentSyncResponse,
} from "@/ui/schemas/comment.schema";
import {
  INBOX_DEFAULT_MESSAGES_LIMIT,
  INBOX_DEFAULT_RUNS_LIMIT,
  INBOX_DEFAULT_THREADS_LIMIT,
  type InboxLikeResponse,
  type InboxListFilter,
  type InboxReplyResponse,
  type InboxThread,
  type InboxThreadDetailResponse,
  type InboxThreadListResponse,
  type InboxThreadMutationResponse,
  type InboxThreadRunsResponse,
} from "@/ui/schemas/inbox.schema";
import { isAbortError, suppressAbortRejection } from "@/ui/services/abort";
import { ApiError } from "@/ui/services/api-error";
import {
  setCommentHidden,
  syncComments,
  type SyncCommentsParams,
} from "@/ui/services/comment.api";
import {
  clearThreadAttention,
  generateThreadDraft,
  getThreadDetail,
  ignoreThread,
  listThreadRuns,
  listThreads,
  markThreadRead,
  sendThreadReply,
  setCommentLiked,
  unignoreThread,
} from "@/ui/services/inbox.api";
import { moderationKeys } from "@/ui/services/moderation.api";

export { inboxKeys };

/** Fast polling interval while the active thread has an agent run in progress. */
export const AGENT_RUN_POLL_INTERVAL_MS = 2_000;

/** True when a thread's latest agent run is currently executing. */
export function isAgentRunRunning(
  thread: Pick<InboxThread, "agentRun"> | null | undefined,
): boolean {
  return thread?.agentRun?.status === "running";
}

function isTerminalThreadMissingError(error: unknown): boolean {
  if (!ApiError.is(error)) return false;
  return (
    error.status === 404 ||
    error.code === "NOT_FOUND" ||
    error.code === "COMMENT_NOT_FOUND" ||
    error.code === "THREAD_NOT_FOUND"
  );
}

/**
 * Computes the TanStack Query `refetchInterval` for a single thread detail query:
 * polls every 2 s ONLY while `thread.agentRun.status === "running"` and the tab is
 * visible; stops immediately once done, errored (404), or hidden.
 */
export function nextAgentRunPollIntervalMs(
  data: InfiniteData<InboxThreadDetailResponse> | undefined,
  isVisible: boolean,
  error?: unknown,
): number | false {
  if (!isVisible) return false;
  if (isTerminalThreadMissingError(error)) return false;
  const latestThread = data?.pages[0]?.thread;
  return isAgentRunRunning(latestThread) ? AGENT_RUN_POLL_INTERVAL_MS : false;
}

function shouldRetryInboxQuery(failureCount: number, error: unknown): boolean {
  return ApiError.is(error) && error.isRetryable ? failureCount < 2 : false;
}

function inboxRetryDelay(attempt: number): number {
  return Math.min(1_000 * 2 ** attempt, 5_000);
}

/** Normalizes list filters into the stable record expected by `inboxKeys.threadList`. */
export function toThreadListFilterRecord(
  filter: InboxListFilter,
): Record<string, string | null> {
  return {
    filter: filter.filter,
    channelId: filter.channelId,
    postJobId: filter.postJobId,
    q: filter.q,
  };
}

function isInboxCancellation(error: unknown): boolean {
  return isAbortError(error) || isCancelledError(error);
}

/** Helper to invalidate the thread list and optionally one open thread. */
export function useInvalidateInbox() {
  const queryClient = useQueryClient();
  const { tenantKey } = useActiveTenant();

  return useCallback(
    (threadId?: string | null) => {
      suppressAbortRejection(
        queryClient.invalidateQueries({ queryKey: inboxKeys.threads(tenantKey) }),
        isInboxCancellation,
      );
      if (threadId) {
        suppressAbortRejection(
          queryClient.invalidateQueries({ queryKey: inboxKeys.thread(tenantKey, threadId) }),
          isInboxCancellation,
        );
      }
    },
    [queryClient, tenantKey],
  );
}

/**
 * Cursor-paged conversation thread list (`GET /api/comments/threads`).
 * Changing any filter updates the `inboxKeys.threadList` key and resets pagination.
 */
export function useInboxThreads(filter: InboxListFilter) {
  const { tenantKey, isResolved } = useActiveTenant();

  return useInfiniteQuery<InboxThreadListResponse, ApiError>({
    queryKey: inboxKeys.threadList(tenantKey, toThreadListFilterRecord(filter)),
    queryFn: ({ pageParam, signal }) =>
      listThreads(
        {
          filter: filter.filter,
          channelId: filter.channelId,
          postJobId: filter.postJobId,
          q: filter.q,
          cursor: typeof pageParam === "string" ? pageParam : null,
          limit: INBOX_DEFAULT_THREADS_LIMIT,
        },
        signal,
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled: isResolved,
    retry: shouldRetryInboxQuery,
    retryDelay: inboxRetryDelay,
    staleTime: 10_000,
  });
}

/**
 * Single conversation thread with reverse-paginated older history
 * (`GET /api/comments/threads/{threadId}?before=&limit=`).
 * Polls this thread every 2 s ONLY while `thread.agentRun.status === "running"`
 * and the browser tab is visible; stops when done or hidden, and syncs list/runs
 * caches once a running run finishes.
 */
export function useInboxThread(threadId: string | null) {
  const queryClient = useQueryClient();
  const { tenantKey, isResolved } = useActiveTenant();
  const isVisible = useDocumentVisible();
  const normalizedId = threadId?.trim() || "";

  const query = useInfiniteQuery<InboxThreadDetailResponse, ApiError>({
    queryKey: inboxKeys.thread(tenantKey, normalizedId),
    queryFn: ({ pageParam, signal }) =>
      getThreadDetail(
        {
          threadId: normalizedId,
          before: typeof pageParam === "string" ? pageParam : null,
          limit: INBOX_DEFAULT_MESSAGES_LIMIT,
        },
        signal,
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.olderCursor,
    enabled: isResolved && normalizedId.length > 0,
    retry: shouldRetryInboxQuery,
    retryDelay: inboxRetryDelay,
    staleTime: 10_000,
    refetchIntervalInBackground: false,
    refetchInterval: (q) =>
      nextAgentRunPollIntervalMs(
        q.state.data,
        isVisible && readDocumentVisible(),
        q.state.error,
      ),
  });

  const latestThread = query.data?.pages[0]?.thread ?? null;
  const isRunning = isAgentRunRunning(latestThread);
  const prevVisibleRef = useRef(isVisible);
  const refetchRef = useRef(query.refetch);

  useEffect(() => {
    refetchRef.current = query.refetch;
  }, [query.refetch]);

  // Catch up immediately when returning to a visible tab while this thread's run is active.
  useEffect(() => {
    const wasVisible = prevVisibleRef.current;
    prevVisibleRef.current = isVisible;
    if (!wasVisible && isVisible && isRunning && isResolved && normalizedId.length > 0) {
      suppressAbortRejection(
        refetchRef.current({ cancelRefetch: false }),
        isInboxCancellation,
      );
    }
  }, [isRunning, isResolved, isVisible, normalizedId]);

  // When a running agent run completes on this thread, refresh the list row & runs trace.
  const prevRunningRef = useRef<{ threadId: string; running: boolean }>({
    threadId: normalizedId,
    running: false,
  });

  useEffect(() => {
    const prev = prevRunningRef.current;
    prevRunningRef.current = { threadId: normalizedId, running: isRunning };
    if (
      isResolved &&
      normalizedId.length > 0 &&
      prev.threadId === normalizedId &&
      prev.running &&
      !isRunning
    ) {
      suppressAbortRejection(
        queryClient.invalidateQueries({ queryKey: inboxKeys.threads(tenantKey) }),
        isInboxCancellation,
      );
      suppressAbortRejection(
        queryClient.invalidateQueries({
          queryKey: inboxKeys.threadRuns(tenantKey, normalizedId),
        }),
        isInboxCancellation,
      );
    }
  }, [isResolved, isRunning, normalizedId, queryClient, tenantKey]);

  return query;
}

/**
 * Fetches recent agent runs for a thread (`GET /api/comments/threads/{threadId}/runs?limit=10`).
 * Lazy-loaded only when the operator expands a message's "Xem quá trình xử lý" panel.
 */
export function useInboxThreadRuns(threadId: string | null, enabled: boolean) {
  const { tenantKey, isResolved } = useActiveTenant();
  const normalizedId = threadId?.trim() || "";

  return useQuery<InboxThreadRunsResponse, ApiError>({
    queryKey: inboxKeys.threadRuns(tenantKey, normalizedId),
    queryFn: ({ signal }) =>
      listThreadRuns(
        {
          threadId: normalizedId,
          limit: INBOX_DEFAULT_RUNS_LIMIT,
        },
        signal,
      ),
    enabled: isResolved && enabled && normalizedId.length > 0,
    retry: shouldRetryInboxQuery,
    retryDelay: inboxRetryDelay,
    staleTime: 10_000,
  });
}

/** Marks a thread as read when opened (`POST /api/comments/threads/{threadId}/read`). */
export function useMarkThreadRead() {
  const queryClient = useQueryClient();
  const { tenantKey } = useActiveTenant();

  return useMutation<InboxThreadMutationResponse, ApiError, { threadId: string }>({
    mutationFn: ({ threadId }) => markThreadRead(threadId),
    retry: false,
    onSuccess: (res, { threadId }) => {
      queryClient.setQueryData<InfiniteData<InboxThreadDetailResponse>>(
        inboxKeys.thread(tenantKey, threadId),
        (prev) => {
          if (!prev || prev.pages.length === 0) return prev;
          return {
            ...prev,
            pages: prev.pages.map((page, index) =>
              index === 0 ? { ...page, thread: res.thread } : page,
            ),
          };
        },
      );
    },
    onSettled: (_data, _error, { threadId }) => {
      suppressAbortRejection(
        queryClient.invalidateQueries({ queryKey: inboxKeys.threads(tenantKey) }),
        isInboxCancellation,
      );
      suppressAbortRejection(
        queryClient.invalidateQueries({ queryKey: inboxKeys.thread(tenantKey, threadId) }),
        isInboxCancellation,
      );
    },
  });
}

/** Generates/regenerates an AI draft for a thread (`POST /api/comments/threads/{threadId}/draft`). */
export function useGenerateThreadDraft() {
  const invalidate = useInvalidateInbox();

  return useMutation<InboxThreadMutationResponse, ApiError, { threadId: string }>({
    mutationFn: ({ threadId }) => generateThreadDraft(threadId),
    retry: false,
    onSettled: (_data, _error, { threadId }) => invalidate(threadId),
  });
}

/**
 * Sends a Page reply with idempotent `clientId` (`POST /api/comments/threads/{threadId}/reply`).
 * Never auto-retried; invalidates threads list + open thread on settle.
 */
export function useSendThreadReply() {
  const invalidate = useInvalidateInbox();

  return useMutation<
    InboxReplyResponse,
    ApiError,
    { threadId: string; text: string; clientId: string }
  >({
    mutationFn: (params) => sendThreadReply(params),
    retry: false,
    onSettled: (_data, _error, { threadId }) => invalidate(threadId),
  });
}

/** Marks a thread ignored (`POST /api/comments/threads/{threadId}/ignore`). */
export function useIgnoreThread() {
  const invalidate = useInvalidateInbox();

  return useMutation<InboxThreadMutationResponse, ApiError, { threadId: string }>({
    mutationFn: ({ threadId }) => ignoreThread(threadId),
    retry: false,
    onSettled: (_data, _error, { threadId }) => invalidate(threadId),
  });
}

/** Restores an ignored thread (`POST /api/comments/threads/{threadId}/unignore`). */
export function useUnignoreThread() {
  const invalidate = useInvalidateInbox();

  return useMutation<InboxThreadMutationResponse, ApiError, { threadId: string }>({
    mutationFn: ({ threadId }) => unignoreThread(threadId),
    retry: false,
    onSettled: (_data, _error, { threadId }) => invalidate(threadId),
  });
}

/**
 * Clears the "Cần bạn" attention flag on a thread
 * (`POST /api/comments/threads/{threadId}/attention/clear`).
 * Updates the cached thread immediately on success and invalidates only
 * `inboxKeys.threads` and `inboxKeys.thread(threadId)`.
 */
export function useClearThreadAttention() {
  const queryClient = useQueryClient();
  const { tenantKey } = useActiveTenant();

  return useMutation<InboxThreadMutationResponse, ApiError, { threadId: string }>({
    mutationFn: ({ threadId }) => clearThreadAttention(threadId),
    retry: false,
    onSuccess: (res, { threadId }) => {
      queryClient.setQueryData<InfiniteData<InboxThreadDetailResponse>>(
        inboxKeys.thread(tenantKey, threadId),
        (prev) => {
          if (!prev || prev.pages.length === 0) return prev;
          return {
            ...prev,
            pages: prev.pages.map((page, index) =>
              index === 0 ? { ...page, thread: res.thread } : page,
            ),
          };
        },
      );
    },
    onSettled: (_data, _error, { threadId }) => {
      suppressAbortRejection(
        queryClient.invalidateQueries({ queryKey: inboxKeys.threads(tenantKey) }),
        isInboxCancellation,
      );
      suppressAbortRejection(
        queryClient.invalidateQueries({ queryKey: inboxKeys.thread(tenantKey, threadId) }),
        isInboxCancellation,
      );
    },
  });
}

/** Likes or unlikes a single message (`POST /api/comments/{commentId}/like`). */
export function useSetMessageLiked() {
  const invalidate = useInvalidateInbox();

  return useMutation<
    InboxLikeResponse,
    ApiError,
    { threadId: string; commentId: string; liked: boolean }
  >({
    mutationFn: ({ commentId, liked }) => setCommentLiked({ commentId, liked }),
    retry: false,
    onSettled: (_data, _error, { threadId }) => invalidate(threadId),
  });
}

/** Hides or unhides a single message (`POST /api/comments/{commentId}/hide`). */
export function useSetMessageHidden() {
  const invalidate = useInvalidateInbox();

  return useMutation<
    CommentMutationResponse,
    ApiError,
    { threadId: string; commentId: string; hidden: boolean }
  >({
    mutationFn: ({ commentId, hidden }) => setCommentHidden({ commentId, hidden }),
    retry: false,
    onSettled: (_data, _error, { threadId }) => invalidate(threadId),
  });
}

/**
 * Triggers on-demand comment sync and refreshes inbox thread + moderation caches.
 * Deliberately avoids `inboxKeys.all(tenantKey)` so manual sync never triggers
 * an out-of-band `/api/comments/updates` poll or refetches quick replies / tags.
 */
export function useInboxSyncComments() {
  const queryClient = useQueryClient();
  const { tenantKey } = useActiveTenant();

  return useMutation<CommentSyncResponse, ApiError, SyncCommentsParams | undefined>({
    mutationFn: (params) => syncComments(params ?? {}),
    retry: false,
    onSettled: () => {
      suppressAbortRejection(
        queryClient.invalidateQueries({ queryKey: inboxKeys.threads(tenantKey) }),
        isInboxCancellation,
      );
      suppressAbortRejection(
        queryClient.invalidateQueries({ queryKey: ["inbox", tenantKey, "thread"] as const }),
        isInboxCancellation,
      );
      suppressAbortRejection(
        queryClient.invalidateQueries({ queryKey: moderationKeys.all(tenantKey) }),
        isInboxCancellation,
      );
    },
  });
}
