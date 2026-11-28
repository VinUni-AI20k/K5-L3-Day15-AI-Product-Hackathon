"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { inboxKeys } from "@/ui/hooks/inbox-keys";
import { useActiveTenant } from "@/ui/hooks/useMe";
import type {
  CustomerDetailResponse,
  CustomerNoteMutationResponse,
  CustomerTagColor,
  CustomerTagDeleteResponse,
  CustomerTagListResponse,
  CustomerTagMutationResponse,
  CustomerTagsUpdateResponse,
} from "@/ui/schemas/customer.schema";
import { ApiError } from "@/ui/services/api-error";
import {
  createCustomerTag,
  deleteCustomerTag,
  getCustomer,
  listCustomerTags,
  saveCustomerNote,
  setCustomerTags,
} from "@/ui/services/customer.api";

function retryIfRetryable(failureCount: number, error: ApiError): boolean {
  return ApiError.is(error) && error.isRetryable ? failureCount < 2 : false;
}

/** Fetches the full customer profile (phones, emails, tags, note, recent comments). */
export function useCustomer(fromId: string | null | undefined) {
  const { tenantKey, isResolved } = useActiveTenant();
  const normalizedId = typeof fromId === "string" ? fromId.trim() : "";

  return useQuery<CustomerDetailResponse, ApiError>({
    queryKey: inboxKeys.customer(tenantKey, normalizedId),
    queryFn: ({ signal }) => getCustomer(normalizedId, signal),
    enabled: isResolved && normalizedId.length > 0,
    retry: retryIfRetryable,
    retryDelay: (attempt) => Math.min(1_000 * 2 ** attempt, 5_000),
    staleTime: 15_000,
  });
}

/** Fetches all customer tags belonging to the active tenant. */
export function useCustomerTags(options?: { enabled?: boolean }) {
  const { tenantKey, isResolved } = useActiveTenant();

  return useQuery<CustomerTagListResponse, ApiError>({
    queryKey: inboxKeys.customerTags(tenantKey),
    queryFn: ({ signal }) => listCustomerTags(signal),
    enabled: isResolved && (options?.enabled ?? true),
    retry: retryIfRetryable,
    retryDelay: (attempt) => Math.min(1_000 * 2 ** attempt, 5_000),
    staleTime: 30_000,
  });
}

/** Saves (or clears when empty) the operator's internal note for a customer. */
export function useSaveCustomerNote() {
  const queryClient = useQueryClient();
  const { tenantKey } = useActiveTenant();

  return useMutation<CustomerNoteMutationResponse, ApiError, { fromId: string; text: string }>({
    mutationFn: (params) => saveCustomerNote(params),
    retry: false,
    onSettled: (_data, _error, variables) => {
      void queryClient.invalidateQueries({
        queryKey: inboxKeys.customer(tenantKey, variables.fromId),
      });
    },
  });
}

/** Replaces the full tag list attached to a customer and refreshes thread rows where tags appear. */
export function useSetCustomerTags() {
  const queryClient = useQueryClient();
  const { tenantKey } = useActiveTenant();

  return useMutation<
    CustomerTagsUpdateResponse,
    ApiError,
    { fromId: string; tagIds: readonly string[] }
  >({
    mutationFn: (params) => setCustomerTags(params),
    retry: false,
    onSettled: (_data, _error, variables) => {
      void queryClient.invalidateQueries({
        queryKey: inboxKeys.customer(tenantKey, variables.fromId),
      });
      void queryClient.invalidateQueries({
        queryKey: inboxKeys.threads(tenantKey),
      });
    },
  });
}

/** Creates a new tenant customer tag. */
export function useCreateCustomerTag() {
  const queryClient = useQueryClient();
  const { tenantKey } = useActiveTenant();

  return useMutation<
    CustomerTagMutationResponse,
    ApiError,
    { name: string; color: CustomerTagColor }
  >({
    mutationFn: (params) => createCustomerTag(params),
    retry: false,
    onSettled: () => {
      void queryClient.invalidateQueries({
        queryKey: inboxKeys.customerTags(tenantKey),
      });
      void queryClient.invalidateQueries({
        queryKey: inboxKeys.threads(tenantKey),
      });
    },
  });
}

/** Deletes a tenant customer tag and refreshes customer profiles & threads. */
export function useDeleteCustomerTag() {
  const queryClient = useQueryClient();
  const { tenantKey } = useActiveTenant();

  return useMutation<
    CustomerTagDeleteResponse,
    ApiError,
    { tagId: string; fromId?: string }
  >({
    mutationFn: ({ tagId }) => deleteCustomerTag(tagId),
    retry: false,
    onSettled: () => {
      void queryClient.invalidateQueries({
        queryKey: inboxKeys.customerTags(tenantKey),
      });
      void queryClient.invalidateQueries({
        queryKey: inboxKeys.threads(tenantKey),
      });
      void queryClient.invalidateQueries({
        queryKey: ["inbox", tenantKey, "thread"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["inbox", tenantKey, "customer"],
      });
    },
  });
}
