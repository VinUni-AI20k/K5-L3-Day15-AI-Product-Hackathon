"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { inboxKeys } from "@/ui/hooks/inbox-keys";
import { useActiveTenant } from "@/ui/hooks/useMe";
import type {
  QuickReplyCreateInput,
  QuickReplyDeleteResponse,
  QuickReplyListResponse,
  QuickReplyMutationResponse,
  QuickReplyUpdateInput,
} from "@/ui/schemas/quick-reply.schema";
import { ApiError } from "@/ui/services/api-error";
import {
  createQuickReply,
  deleteQuickReply,
  listQuickReplies,
  updateQuickReply,
} from "@/ui/services/quick-reply.api";

function retryIfRetryable(failureCount: number, error: ApiError): boolean {
  return ApiError.is(error) && error.isRetryable ? failureCount < 2 : false;
}

/** Lists all "/" quick-reply templates for the active tenant (sorted by shortcut). */
export function useQuickReplies(options?: { enabled?: boolean }) {
  const { tenantKey, isResolved } = useActiveTenant();

  return useQuery<QuickReplyListResponse, ApiError>({
    queryKey: inboxKeys.quickReplies(tenantKey),
    queryFn: ({ signal }) => listQuickReplies(signal),
    enabled: isResolved && (options?.enabled ?? true),
    retry: retryIfRetryable,
    retryDelay: (attempt) => Math.min(1_000 * 2 ** attempt, 5_000),
    staleTime: 30_000,
  });
}

/** Creates a new quick-reply template. */
export function useCreateQuickReply() {
  const queryClient = useQueryClient();
  const { tenantKey } = useActiveTenant();

  return useMutation<QuickReplyMutationResponse, ApiError, QuickReplyCreateInput>({
    mutationFn: (input) => createQuickReply(input),
    retry: false,
    onSettled: () => {
      void queryClient.invalidateQueries({
        queryKey: inboxKeys.quickReplies(tenantKey),
      });
    },
  });
}

/** Updates an existing quick-reply template (partial PATCH). */
export function useUpdateQuickReply() {
  const queryClient = useQueryClient();
  const { tenantKey } = useActiveTenant();

  return useMutation<
    QuickReplyMutationResponse,
    ApiError,
    { id: string; patch: QuickReplyUpdateInput }
  >({
    mutationFn: (params) => updateQuickReply(params),
    retry: false,
    onSettled: () => {
      void queryClient.invalidateQueries({
        queryKey: inboxKeys.quickReplies(tenantKey),
      });
    },
  });
}

/** Deletes a quick-reply template. */
export function useDeleteQuickReply() {
  const queryClient = useQueryClient();
  const { tenantKey } = useActiveTenant();

  return useMutation<QuickReplyDeleteResponse, ApiError, string>({
    mutationFn: (id) => deleteQuickReply(id),
    retry: false,
    onSettled: () => {
      void queryClient.invalidateQueries({
        queryKey: inboxKeys.quickReplies(tenantKey),
      });
    },
  });
}
