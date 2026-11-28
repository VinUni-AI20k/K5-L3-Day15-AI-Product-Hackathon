"use client";

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import { inboxKeys } from "@/ui/hooks/inbox-keys";
import { useActiveTenant } from "@/ui/hooks/useMe";
import {
  AUTO_REPLY_LOG_DEFAULT_LIMIT,
  type AutoReplyLogFilter,
  type AutoReplyLogResponse,
  type AutoReplySettingsListResponse,
  type AutoReplySettingUpdateInput,
  type AutoReplySettingUpdateResponse,
} from "@/ui/schemas/auto-reply.schema";
import { ApiError } from "@/ui/services/api-error";
import {
  listAutoReplyLog,
  listAutoReplySettings,
  updateAutoReplySetting,
} from "@/ui/services/auto-reply.api";

export { inboxKeys };

function shouldRetryAutoReplyQuery(failureCount: number, error: unknown): boolean {
  return ApiError.is(error) && error.isRetryable ? failureCount < 2 : false;
}

function autoReplyRetryDelay(attempt: number): number {
  return Math.min(1_000 * 2 ** attempt, 5_000);
}

/** Fetches per-Page auto-reply settings (`GET /api/comments/auto-reply-settings`). */
export function useAutoReplySettings() {
  const { tenantKey, isResolved } = useActiveTenant();

  return useQuery<AutoReplySettingsListResponse, ApiError>({
    queryKey: inboxKeys.autoReplySettings(tenantKey),
    queryFn: ({ signal }) => listAutoReplySettings(signal),
    enabled: isResolved,
    retry: shouldRetryAutoReplyQuery,
    retryDelay: autoReplyRetryDelay,
    staleTime: 15_000,
  });
}

export interface UpdateAutoReplySettingVariables {
  readonly pageId: string;
  readonly input: AutoReplySettingUpdateInput;
}

/**
 * Updates one connected Page's auto-reply configuration
 * (`PUT /api/comments/auto-reply-settings/{pageId}`).
 * Invalidates `inboxKeys.autoReplySettings(tenantKey)` only — never `inboxKeys.all`
 * or `inboxKeys.updates`.
 */
export function useUpdateAutoReplySetting() {
  const queryClient = useQueryClient();
  const { tenantKey } = useActiveTenant();

  return useMutation<
    AutoReplySettingUpdateResponse,
    ApiError,
    UpdateAutoReplySettingVariables
  >({
    mutationFn: ({ pageId, input }) => updateAutoReplySetting(pageId, input),
    retry: false,
    onSuccess: (data) => {
      queryClient.setQueryData<AutoReplySettingsListResponse>(
        inboxKeys.autoReplySettings(tenantKey),
        (prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            items: prev.items.map((item) =>
              item.pageId === data.setting.pageId ? data.setting : item,
            ),
          };
        },
      );
    },
    onSettled: () => {
      void queryClient.invalidateQueries({
        queryKey: inboxKeys.autoReplySettings(tenantKey),
      });
    },
  });
}

/**
 * Cursor-paged auto-reply execution log (`GET /api/comments/auto-reply-log`).
 * Changing any filter updates `inboxKeys.autoReplyLog` and resets pagination.
 */
export function useAutoReplyLog(
  filter: AutoReplyLogFilter,
  limit = AUTO_REPLY_LOG_DEFAULT_LIMIT,
) {
  const { tenantKey, isResolved } = useActiveTenant();

  return useInfiniteQuery<AutoReplyLogResponse, ApiError>({
    queryKey: inboxKeys.autoReplyLog(tenantKey, filter),
    queryFn: ({ pageParam, signal }) =>
      listAutoReplyLog(
        {
          pageId: filter.pageId,
          action: filter.action,
          cursor: typeof pageParam === "string" ? pageParam : null,
          limit,
        },
        signal,
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled: isResolved,
    retry: shouldRetryAutoReplyQuery,
    retryDelay: autoReplyRetryDelay,
    staleTime: 10_000,
  });
}
