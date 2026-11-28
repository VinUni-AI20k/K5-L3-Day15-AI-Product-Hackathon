"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useActiveTenant } from "@/ui/hooks/useMe";
import type {
  WritingStyle,
  WritingStyleChannelResponse,
  WritingStyleOverviewResponse,
  WritingStylePreviewResponse,
} from "@/ui/schemas/writing-style.schema";
import { ApiError } from "@/ui/services/api-error";
import {
  deleteChannelWritingStyle,
  fetchChannelWritingStyle,
  fetchWritingStyleOverview,
  previewWritingStyle,
  saveChannelWritingStyle,
  saveDefaultWritingStyle,
  writingStyleKeys,
  type PreviewWritingStyleParams,
} from "@/ui/services/writing-style.api";

/**
 * Logic layer of the "Phong cách viết" screen (docs/07 §4.1).
 *
 * Writes and LLM previews never auto-retry: re-sending a save or hitting the
 * 10/min preview rate limit twice makes failures worse.
 */

export function useWritingStyleOverview() {
  const { tenantKey, isResolved } = useActiveTenant();

  return useQuery<WritingStyleOverviewResponse, ApiError>({
    queryKey: writingStyleKeys.overview(tenantKey),
    queryFn: ({ signal }) => fetchWritingStyleOverview(signal),
    enabled: isResolved,
    retry: (failureCount, error) =>
      ApiError.is(error) && error.isRetryable ? failureCount < 2 : false,
    retryDelay: (attempt) => Math.min(1_000 * 2 ** attempt, 5_000),
    staleTime: 30_000,
  });
}

export function useChannelWritingStyle(channelId: string | null) {
  const { tenantKey, isResolved } = useActiveTenant();
  const id = channelId?.trim() ?? "";

  return useQuery<WritingStyleChannelResponse, ApiError>({
    queryKey: writingStyleKeys.channel(tenantKey, id),
    queryFn: ({ signal }) => fetchChannelWritingStyle(id, signal),
    enabled: isResolved && id.length > 0,
    retry: (failureCount, error) =>
      ApiError.is(error) && error.isRetryable ? failureCount < 2 : false,
    retryDelay: (attempt) => Math.min(1_000 * 2 ** attempt, 5_000),
    staleTime: 30_000,
  });
}

export type SaveWritingStyleResult =
  | { readonly scope: "default"; readonly data: WritingStyleOverviewResponse }
  | { readonly scope: string; readonly data: WritingStyleChannelResponse };

export function useSaveWritingStyle() {
  const queryClient = useQueryClient();
  const { tenantKey } = useActiveTenant();

  return useMutation<
    SaveWritingStyleResult,
    ApiError,
    { readonly scope: string; readonly style: WritingStyle }
  >({
    mutationFn: async ({ scope, style }) => {
      if (scope === "default") {
        const data = await saveDefaultWritingStyle(style);
        return { scope: "default", data };
      }
      const data = await saveChannelWritingStyle(scope, style);
      return { scope, data };
    },
    retry: false,
    onSuccess: (result) => {
      if (result.scope === "default") {
        queryClient.setQueryData(writingStyleKeys.overview(tenantKey), result.data);
        // Updating the company default affects inherited effective styles on all Pages.
        void queryClient.invalidateQueries({ queryKey: writingStyleKeys.all(tenantKey) });
      } else {
        queryClient.setQueryData(writingStyleKeys.channel(tenantKey, result.scope), result.data);
        void queryClient.invalidateQueries({ queryKey: writingStyleKeys.overview(tenantKey) });
      }
    },
  });
}

export function useDeleteChannelWritingStyle() {
  const queryClient = useQueryClient();
  const { tenantKey } = useActiveTenant();

  return useMutation<void, ApiError, { readonly channelId: string }>({
    mutationFn: ({ channelId }) => deleteChannelWritingStyle(channelId),
    retry: false,
    onSettled: (_data, _error, variables) => {
      void queryClient.invalidateQueries({ queryKey: writingStyleKeys.overview(tenantKey) });
      void queryClient.invalidateQueries({
        queryKey: writingStyleKeys.channel(tenantKey, variables.channelId),
      });
    },
  });
}

export function usePreviewWritingStyle() {
  return useMutation<WritingStylePreviewResponse, ApiError, PreviewWritingStyleParams>({
    mutationFn: (params) => previewWritingStyle(params),
    retry: false,
  });
}
