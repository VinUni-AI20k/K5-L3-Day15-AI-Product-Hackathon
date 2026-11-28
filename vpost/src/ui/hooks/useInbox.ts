"use client";

import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import { useCallback } from "react";

import { inboxKeys } from "@/ui/hooks/inbox-keys";
import { useActiveTenant } from "@/ui/hooks/useMe";
import type {
  CommentMutationResponse,
  CommentSyncResponse,
} from "@/ui/schemas/comment.schema";
import {
  INBOX_DEFAULT_MESSAGES_LIMIT,
  INBOX_DEFAULT_THREADS_LIMIT,
  type InboxLikeResponse,
  type InboxListFilter,
  type InboxReplyResponse,
  type InboxThreadDetailResponse,
  type InboxThreadListResponse,
  type InboxThreadMutationResponse,
} from "@/ui/schemas/inbox.schema";
import { ApiError } from "@/ui/services/api-error";
import {
  setCommentHidden,
  syncComments,
  type SyncCommentsParams,
} from "@/ui/services/comment.api";
import {
  generateThreadDraft,
  getThreadDetail,
  ignoreThread,
  listThreads,
  markThreadRead,
  sendThreadReply,
  setCommentLiked,
  unignoreThread,
} from "@/ui/services/inbox.api";
import { moderationKeys } from "@/ui/services/moderation.api";

export { inboxKeys };

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

/** Helper to invalidate the thread list and optionally one open thread. */
export function useInvalidateInbox() {
  const queryClient = useQueryClient();
  const { tenantKey } = useActiveTenant();

  return useCallback(
    (threadId?: string | null) => {
      void queryClient.invalidateQueries({ queryKey: inboxKeys.threads(tenantKey) });
      if (threadId) {
        void queryClient.invalidateQueries({ queryKey: inboxKeys.thread(tenantKey, threadId) });
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
 */
export function useInboxThread(threadId: string | null) {
  const { tenantKey, isResolved } = useActiveTenant();
  const normalizedId = threadId?.trim() || "";

  return useInfiniteQuery<InboxThreadDetailResponse, ApiError>({
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
      void queryClient.invalidateQueries({ queryKey: inboxKeys.threads(tenantKey) });
      void queryClient.invalidateQueries({ queryKey: inboxKeys.thread(tenantKey, threadId) });
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
      void queryClient.invalidateQueries({ queryKey: inboxKeys.threads(tenantKey) });
      void queryClient.invalidateQueries({ queryKey: ["inbox", tenantKey, "thread"] as const });
      void queryClient.invalidateQueries({ queryKey: moderationKeys.all(tenantKey) });
    },
  });
}
