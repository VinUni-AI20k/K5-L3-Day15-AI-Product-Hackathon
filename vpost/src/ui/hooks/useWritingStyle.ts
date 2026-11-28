"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useActiveTenant } from "@/ui/hooks/useMe";
import type {
  SizeChart,
  SizeChartResponse,
  WritingStyle,
  WritingStyleChannelResponse,
  WritingStyleOverviewResponse,
  WritingStylePreviewResponse,
} from "@/ui/schemas/writing-style.schema";
import { ApiError } from "@/ui/services/api-error";
import { listCatalogProducts } from "@/ui/services/catalog.api";
import {
  deleteChannelWritingStyle,
  fetchCategorySizeChart,
  fetchChannelWritingStyle,
  fetchDefaultSizeChart,
  fetchWritingStyleOverview,
  previewWritingStyle,
  saveCategorySizeChart,
  saveChannelWritingStyle,
  saveDefaultSizeChart,
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

// --- Size chart hooks (`.swarm/specs/size-advice.md`) -----------------------

export function useDefaultSizeChart() {
  const { tenantKey, isResolved } = useActiveTenant();

  return useQuery<SizeChartResponse, ApiError>({
    queryKey: writingStyleKeys.sizeChartDefault(tenantKey),
    queryFn: ({ signal }) => fetchDefaultSizeChart(signal),
    enabled: isResolved,
    retry: (failureCount, error) =>
      ApiError.is(error) && error.isRetryable ? failureCount < 2 : false,
    retryDelay: (attempt) => Math.min(1_000 * 2 ** attempt, 5_000),
    staleTime: 30_000,
  });
}

export function useCategorySizeChart(category: string | null) {
  const { tenantKey, isResolved } = useActiveTenant();
  const normalized = category?.trim() ?? "";

  return useQuery<SizeChartResponse, ApiError>({
    queryKey: writingStyleKeys.sizeChartCategory(tenantKey, normalized),
    queryFn: ({ signal }) => fetchCategorySizeChart(normalized, signal),
    enabled: isResolved && normalized.length > 0,
    retry: (failureCount, error) =>
      ApiError.is(error) && error.isRetryable ? failureCount < 2 : false,
    retryDelay: (attempt) => Math.min(1_000 * 2 ** attempt, 5_000),
    staleTime: 30_000,
  });
}

export interface SaveSizeChartVariables {
  /** `null` = company default size chart; non-empty string = per-category override. */
  readonly category: string | null;
  readonly chart: SizeChart;
}

export function useSaveSizeChart() {
  const queryClient = useQueryClient();
  const { tenantKey } = useActiveTenant();

  return useMutation<SizeChartResponse, ApiError, SaveSizeChartVariables>({
    mutationFn: ({ category, chart }) => {
      const normalized = category?.trim() ?? "";
      return normalized.length > 0
        ? saveCategorySizeChart(normalized, chart)
        : saveDefaultSizeChart(chart);
    },
    retry: false,
    onSuccess: (result, variables) => {
      const normalized = variables.category?.trim() ?? "";
      if (normalized.length > 0) {
        queryClient.setQueryData(
          writingStyleKeys.sizeChartCategory(tenantKey, normalized),
          result,
        );
        void queryClient.invalidateQueries({
          queryKey: writingStyleKeys.sizeChartDefault(tenantKey),
        });
      } else {
        queryClient.setQueryData(writingStyleKeys.sizeChartDefault(tenantKey), result);
        void queryClient.invalidateQueries({
          queryKey: writingStyleKeys.sizeChartAll(tenantKey),
        });
      }
    },
  });
}

/**
 * Discovers distinct product categories (`loai`) from the tenant's catalog so
 * the "Bảng size" section can offer per-category override tabs out of the box.
 */
export function useSizeChartCatalogCategories() {
  const { tenantKey, isResolved } = useActiveTenant();

  return useQuery<readonly string[], ApiError>({
    queryKey: writingStyleKeys.sizeChartCategories(tenantKey),
    queryFn: async ({ signal }) => {
      const res = await listCatalogProducts(
        { filter: { status: null, q: null }, limit: 100 },
        signal,
      );
      const seen = new Set<string>();
      const categories: string[] = [];
      for (const item of res.items) {
        const raw = item.category?.trim() ?? "";
        if (raw.length === 0) continue;
        const key = raw.toLocaleLowerCase("vi");
        if (seen.has(key)) continue;
        seen.add(key);
        categories.push(raw);
      }
      return categories.sort((a, b) => a.localeCompare(b, "vi"));
    },
    enabled: isResolved,
    retry: false,
    staleTime: 60_000,
  });
}
