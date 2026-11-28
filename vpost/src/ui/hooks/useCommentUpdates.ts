"use client";

import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useSyncExternalStore } from "react";

import { inboxKeys } from "@/ui/hooks/inbox-keys";
import { useActiveTenant } from "@/ui/hooks/useMe";
import type { CommentUpdatesResponse } from "@/ui/schemas/inbox-updates.schema";
import { ApiError } from "@/ui/services/api-error";
import {
  fetchCommentUpdates,
  type FetchCommentUpdatesParams,
} from "@/ui/services/inbox-updates.api";

/** Normal polling cadence while the tab is visible. */
export const COMMENT_UPDATES_POLL_INTERVAL_MS = 15_000;

/** Backoff polling cadence after consecutive background polling errors. */
export const COMMENT_UPDATES_BACKOFF_INTERVAL_MS = 60_000;

/** Consecutive errors required before backing off to 60 s. */
export const COMMENT_UPDATES_BACKOFF_ERROR_THRESHOLD = 2;

/** Window after a visibility regain in which a paired `window.focus` event is coalesced. */
const FOCUS_COALESCE_WINDOW_MS = 250;

const CURSOR_STORAGE_PREFIX = "vpost.inbox.updates-cursor.";
const LAST_TENANT_STORAGE_KEY = "vpost.inbox.updates-last-tenant";

export type SessionStorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export interface CommentUpdatesCursorStore {
  get(tenantKey: string): string | null;
  set(tenantKey: string, cursor: string): void;
  reset(tenantKey: string): void;
  /**
   * Records `nextTenantKey` as the active tenant for this tab.
   * When switching from a different tenant, clears both the previous and target
   * cursors so the newly active tenant starts fresh without replaying old toasts.
   * Returns `true` if a tenant switch occurred.
   */
  handleTenantTransition(nextTenantKey: string): boolean;
  clearAll(): void;
}

function getBrowserSessionStorage(): SessionStorageLike | null {
  try {
    if (typeof window === "undefined") return null;
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function safeStorageGet(storage: SessionStorageLike | null, key: string): string | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(key);
    if (typeof raw !== "string") return null;
    const trimmed = raw.trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch {
    return null;
  }
}

function safeStorageSet(storage: SessionStorageLike | null, key: string, value: string): void {
  if (!storage) return;
  try {
    storage.setItem(key, value);
  } catch {
    // Private browsing / quota errors fall back cleanly to the in-memory map.
  }
}

function safeStorageRemove(storage: SessionStorageLike | null, key: string): void {
  if (!storage) return;
  try {
    storage.removeItem(key);
  } catch {
    // Ignore storage removal errors; in-memory state is already cleared.
  }
}

/**
 * Per-tenant cursor store backed by an in-memory Map and `sessionStorage` (try/catch).
 * Accepting a storage resolver lets tests inject an isolated or throwing storage double.
 */
export function createCommentUpdatesCursorStore(
  resolveStorage: () => SessionStorageLike | null = getBrowserSessionStorage,
): CommentUpdatesCursorStore {
  const inMemory = new Map<string, string>();
  let lastTenantKey: string | null = null;

  const keyFor = (tenantKey: string): string => `${CURSOR_STORAGE_PREFIX}${tenantKey}`;

  const reset = (tenantKey: string): void => {
    inMemory.delete(tenantKey);
    safeStorageRemove(resolveStorage(), keyFor(tenantKey));
  };

  return {
    get(tenantKey: string): string | null {
      const cached = inMemory.get(tenantKey);
      if (cached && cached.length > 0) return cached;

      const persisted = safeStorageGet(resolveStorage(), keyFor(tenantKey));
      if (persisted !== null) {
        inMemory.set(tenantKey, persisted);
        return persisted;
      }
      return null;
    },

    set(tenantKey: string, cursor: string): void {
      const trimmed = cursor.trim();
      if (trimmed.length === 0) return;
      inMemory.set(tenantKey, trimmed);
      safeStorageSet(resolveStorage(), keyFor(tenantKey), trimmed);
    },

    reset,

    handleTenantTransition(nextTenantKey: string): boolean {
      const storage = resolveStorage();
      const prev = lastTenantKey ?? safeStorageGet(storage, LAST_TENANT_STORAGE_KEY);
      lastTenantKey = nextTenantKey;
      safeStorageSet(storage, LAST_TENANT_STORAGE_KEY, nextTenantKey);

      if (prev !== null && prev !== nextTenantKey) {
        reset(prev);
        reset(nextTenantKey);
        return true;
      }
      return false;
    },

    clearAll(): void {
      const storage = resolveStorage();
      for (const tenantKey of inMemory.keys()) {
        safeStorageRemove(storage, keyFor(tenantKey));
      }
      inMemory.clear();
      lastTenantKey = null;
      safeStorageRemove(storage, LAST_TENANT_STORAGE_KEY);
    },
  };
}

const defaultCursorStore = createCommentUpdatesCursorStore();

/** Computes the next TanStack Query polling interval based on visibility and error streak. */
export function nextCommentUpdatesIntervalMs(
  consecutiveErrors: number,
  isVisible: boolean,
): number | false {
  if (!isVisible) return false;
  return consecutiveErrors >= COMMENT_UPDATES_BACKOFF_ERROR_THRESHOLD
    ? COMMENT_UPDATES_BACKOFF_INTERVAL_MS
    : COMMENT_UPDATES_POLL_INTERVAL_MS;
}

/**
 * Invalidates conversation list and each affected thread whenever an updates tick
 * reports new items or ready AI drafts.
 */
export function invalidateInboxOnUpdates(
  queryClient: QueryClient,
  tenantKey: string,
  response: Pick<CommentUpdatesResponse, "items" | "draftsReady">,
): void {
  if (response.items.length === 0 && response.draftsReady.length === 0) return;

  const affectedThreadIds = new Set<string>();
  for (const item of response.items) affectedThreadIds.add(item.threadId);
  for (const threadId of response.draftsReady) affectedThreadIds.add(threadId);

  void queryClient.invalidateQueries({ queryKey: inboxKeys.threads(tenantKey) });
  for (const threadId of affectedThreadIds) {
    void queryClient.invalidateQueries({ queryKey: inboxKeys.thread(tenantKey, threadId) });
  }
}

export interface CommentUpdatesTick {
  readonly tenantKey: string;
  readonly response: CommentUpdatesResponse;
  readonly isInitialCursor: boolean;
}

export type CommentUpdatesFetcher = (
  params: FetchCommentUpdatesParams,
  signal?: AbortSignal,
) => Promise<CommentUpdatesResponse>;

export interface CommentUpdatesPollerState {
  consecutiveErrors: number;
  activeTenantKey: string;
  isActive: boolean;
}

export interface CreateCommentUpdatesQueryFnParams {
  queryClient: QueryClient;
  tenantKey: string;
  tenantId: string | null;
  cursorStore: CommentUpdatesCursorStore;
  state: CommentUpdatesPollerState;
  fetcher?: CommentUpdatesFetcher;
  onUpdates?: (tick: CommentUpdatesTick) => void;
  onTenantSwitch?: () => void;
}

function isInvalidUpdatesCursorError(error: unknown): boolean {
  return ApiError.is(error) && error.status === 400 && error.code === "INVALID_INPUT";
}

/**
 * Creates the TanStack Query `queryFn` that manages cursor bootstrap, backoff accounting,
 * invalid-cursor self-healing, tenant mismatch protection, cache invalidation, and
 * notification callback dispatch.
 * Exported so unit tests can exercise real `QueryClient` + `QueryObserver` polling in Node.
 */
export function createCommentUpdatesQueryFn({
  queryClient,
  tenantKey,
  tenantId,
  cursorStore,
  state,
  fetcher = fetchCommentUpdates,
  onUpdates,
  onTenantSwitch,
}: CreateCommentUpdatesQueryFnParams): (context: {
  signal: AbortSignal;
}) => Promise<CommentUpdatesTick> {
  return async ({ signal }) => {
    if (cursorStore.handleTenantTransition(tenantKey)) {
      state.consecutiveErrors = 0;
      onTenantSwitch?.();
    }

    const since = cursorStore.get(tenantKey);
    let isInitialCursor = since === null;

    let response: CommentUpdatesResponse;
    try {
      response = await fetcher({ since }, signal);
    } catch (error) {
      if (
        since !== null &&
        !signal.aborted &&
        state.isActive &&
        state.activeTenantKey === tenantKey &&
        isInvalidUpdatesCursorError(error)
      ) {
        // Corrupt or obsolete stored cursor: reset it and restart immediately from a fresh cursor.
        cursorStore.reset(tenantKey);
        isInitialCursor = true;
        try {
          response = await fetcher({ since: null }, signal);
        } catch (retryError) {
          if (!signal.aborted) {
            state.consecutiveErrors += 1;
          }
          throw retryError;
        }
      } else {
        // Aborts caused by unmount or tenant change are cancellations, not server errors.
        if (!signal.aborted) {
          state.consecutiveErrors += 1;
        }
        throw error;
      }
    }

    state.consecutiveErrors = 0;

    // Ignore stale in-flight responses if the operator switched tenant or logged out mid-flight.
    if (!state.isActive || state.activeTenantKey !== tenantKey) {
      return { tenantKey, response, isInitialCursor };
    }
    if (tenantId !== null && response.tenantId !== tenantId) {
      return { tenantKey, response, isInitialCursor };
    }

    cursorStore.set(tenantKey, response.cursor);

    const tick: CommentUpdatesTick = {
      tenantKey,
      response,
      isInitialCursor,
    };

    if (!isInitialCursor) {
      invalidateInboxOnUpdates(queryClient, tenantKey, response);
      onUpdates?.(tick);
    }

    return tick;
  };
}

function readDocumentVisible(): boolean {
  if (typeof document === "undefined") return true;
  return document.visibilityState !== "hidden";
}

function subscribeDocumentVisibility(onChange: () => void): () => void {
  if (typeof document === "undefined") return () => {};
  document.addEventListener("visibilitychange", onChange);
  return () => {
    document.removeEventListener("visibilitychange", onChange);
  };
}

function useDocumentVisible(): boolean {
  return useSyncExternalStore(
    subscribeDocumentVisibility,
    readDocumentVisible,
    () => false,
  );
}

export interface UseCommentUpdatesOptions {
  /** Override to disable polling even when a tenant is resolved. Defaults to `true`. */
  enabled?: boolean;
  /** Called on each non-initial updates tick after inbox queries have been invalidated. */
  onUpdates?: (tick: CommentUpdatesTick) => void;
  /** Called when the active tenant changes and cursor/dedupe state should reset. */
  onTenantSwitch?: () => void;
  /** Optional cursor store override (defaults to tab-wide memory + sessionStorage store). */
  cursorStore?: CommentUpdatesCursorStore;
}

/**
 * Polls `/api/comments/updates` via TanStack Query for the active authenticated tenant.
 *
 * - First fetch omits `since` to establish a cursor without toasting historical comments.
 * - Polls every 15 s while the document is visible; stops when hidden.
 * - Immediately fetches with the stored cursor when visibility or window focus returns.
 * - Backs off to 60 s after consecutive failures; never surfaces background error toasts.
 * - Resets cursor on tenant switch; stops polling on unmount (logout).
 */
export function useCommentUpdates(options: UseCommentUpdatesOptions = {}) {
  const {
    enabled = true,
    onUpdates,
    onTenantSwitch,
    cursorStore = defaultCursorStore,
  } = options;

  const queryClient = useQueryClient();
  const { tenantId, tenantKey, isResolved } = useActiveTenant();
  const isVisible = useDocumentVisible();

  const onUpdatesRef = useRef(onUpdates);
  const onTenantSwitchRef = useRef(onTenantSwitch);
  const pollerStateRef = useRef<CommentUpdatesPollerState>({
    consecutiveErrors: 0,
    activeTenantKey: tenantKey,
    isActive: true,
  });
  const lastVisibilityRegainAtRef = useRef(0);

  useEffect(() => {
    onUpdatesRef.current = onUpdates;
    onTenantSwitchRef.current = onTenantSwitch;
  }, [onUpdates, onTenantSwitch]);

  useEffect(() => {
    const state = pollerStateRef.current;
    state.isActive = true;
    return () => {
      state.isActive = false;
    };
  }, []);

  // Track tenant transitions as soon as a tenant is resolved so switching resets cursor & dedupe.
  useEffect(() => {
    pollerStateRef.current.activeTenantKey = tenantKey;
    if (!isResolved) return;
    if (cursorStore.handleTenantTransition(tenantKey)) {
      pollerStateRef.current.consecutiveErrors = 0;
      onTenantSwitchRef.current?.();
    }
  }, [cursorStore, isResolved, tenantKey]);

  const queryEnabled = enabled && isResolved && isVisible;

  const query = useQuery<CommentUpdatesTick, ApiError>({
    queryKey: inboxKeys.updates(tenantKey),
    queryFn: ({ signal }) => {
      pollerStateRef.current.activeTenantKey = tenantKey;
      const run = createCommentUpdatesQueryFn({
        queryClient,
        tenantKey,
        tenantId,
        cursorStore,
        state: pollerStateRef.current,
        onUpdates: (tick) => onUpdatesRef.current?.(tick),
        onTenantSwitch: () => onTenantSwitchRef.current?.(),
      });
      return run({ signal });
    },
    enabled: queryEnabled,
    // Background poller uses its own 15 s / 60 s cadence instead of burst retries.
    retry: false,
    staleTime: 0,
    gcTime: 0,
    // Handled explicitly below so both visibilitychange and window focus catch up once.
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    refetchIntervalInBackground: false,
    refetchInterval: () =>
      nextCommentUpdatesIntervalMs(
        pollerStateRef.current.consecutiveErrors,
        isVisible && readDocumentVisible(),
      ),
  });

  const refetchRef = useRef(query.refetch);
  useEffect(() => {
    refetchRef.current = query.refetch;
  }, [query.refetch]);

  // Catch up immediately on visibility regain or window focus regain without duplicating
  // when browsers emit both events back-to-back.
  useEffect(() => {
    if (!enabled || !isResolved) return;
    if (typeof document === "undefined" || typeof window === "undefined") return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        lastVisibilityRegainAtRef.current = Date.now();
      }
    };

    const handleWindowFocus = () => {
      if (document.visibilityState === "hidden") return;
      if (Date.now() - lastVisibilityRegainAtRef.current < FOCUS_COALESCE_WINDOW_MS) {
        return;
      }
      void refetchRef.current({ cancelRefetch: false });
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleWindowFocus);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleWindowFocus);
    };
  }, [enabled, isResolved, tenantKey]);

  return query;
}
