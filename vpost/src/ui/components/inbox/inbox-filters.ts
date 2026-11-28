import {
  INBOX_THREAD_FILTERS,
  InboxThreadFilterChipSchema,
  type InboxListFilter,
  type InboxThreadCounts,
  type InboxThreadFilterChip,
  type InboxUrlState,
} from "@/ui/schemas/inbox.schema";

/**
 * Canonical URL filter and thread selection helpers for `/comments`.
 * One parser, one URL builder: defaults are omitted and invalid values fall
 * back to defaults.
 */

export const INBOX_FILTER_CHIPS = INBOX_THREAD_FILTERS;

export const DEFAULT_INBOX_FILTER_CHIP: InboxThreadFilterChip = "needs_reply";

export const DEFAULT_INBOX_LIST_FILTER: InboxListFilter = {
  filter: DEFAULT_INBOX_FILTER_CHIP,
  channelId: null,
  postJobId: null,
  q: null,
};

export const DEFAULT_INBOX_URL_STATE: InboxUrlState = {
  ...DEFAULT_INBOX_LIST_FILTER,
  thread: null,
};

export const EMPTY_INBOX_COUNTS: InboxThreadCounts = {
  canBan: 0,
  needsReply: 0,
  unread: 0,
  all: 0,
  hidden: 0,
  ignored: 0,
};

type SearchParamInput =
  | URLSearchParams
  | Readonly<Record<string, string | string[] | undefined>>;

function readParam(params: SearchParamInput, key: string): string | null {
  if (params instanceof URLSearchParams) return params.get(key);
  const raw = params[key];
  if (typeof raw === "string") return raw;
  return Array.isArray(raw) && typeof raw[0] === "string" ? raw[0] : null;
}

function cleanOptional(value: string | null): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function parseLegacyStatusFallback(rawStatus: string | null): InboxThreadFilterChip | null {
  switch (rawStatus?.trim()) {
    case "unreplied":
      return "needs_reply";
    case "ignored":
      return "ignored";
    case "all":
    case "replied":
      return "all";
    default:
      return null;
  }
}

/**
 * Parses `/comments?filter=&channelId=&postJobId=&q=&thread=`.
 * Invalid or unknown filter values fall back to `"needs_reply"`.
 */
export function parseInboxUrlState(params: SearchParamInput): InboxUrlState {
  const rawFilter = readParam(params, "filter")?.trim();
  const parsedFilter = InboxThreadFilterChipSchema.safeParse(rawFilter);
  const filter: InboxThreadFilterChip = parsedFilter.success
    ? parsedFilter.data
    : (parseLegacyStatusFallback(readParam(params, "status")) ?? DEFAULT_INBOX_FILTER_CHIP);

  return {
    filter,
    channelId: cleanOptional(readParam(params, "channelId")),
    postJobId: cleanOptional(readParam(params, "postJobId")),
    q: cleanOptional(readParam(params, "q")),
    thread: cleanOptional(readParam(params, "thread")),
  };
}

/** Extracts the list-only filter portion (excluding `?thread=`). */
export function toInboxListFilter(state: InboxUrlState): InboxListFilter {
  return {
    filter: state.filter,
    channelId: state.channelId,
    postJobId: state.postJobId,
    q: state.q,
  };
}

/**
 * Single query-string builder for `/comments`.
 * Defaults (`filter=needs_reply`) and empty/null parameters are never written.
 */
export function buildInboxSearchParams(state: InboxUrlState): URLSearchParams {
  const params = new URLSearchParams();
  if (state.filter !== DEFAULT_INBOX_FILTER_CHIP) {
    params.set("filter", state.filter);
  }
  const channelId = cleanOptional(state.channelId);
  if (channelId) params.set("channelId", channelId);
  const postJobId = cleanOptional(state.postJobId);
  if (postJobId) params.set("postJobId", postJobId);
  const q = cleanOptional(state.q);
  if (q) params.set("q", q);
  const thread = cleanOptional(state.thread);
  if (thread) params.set("thread", thread);
  return params;
}

/** Builds the canonical `/comments` URL for the given filter and active thread state. */
export function buildInboxUrl(state: InboxUrlState, pathname = "/comments"): string {
  const query = buildInboxSearchParams(state).toString();
  return query.length > 0 ? `${pathname}?${query}` : pathname;
}

/** Canonical list-only filter signature (resets bulk selection when list filters change). */
export function buildInboxListFilterKey(filter: InboxListFilter): string {
  return buildInboxSearchParams({ ...filter, thread: null }).toString();
}

/** True when any narrowing filter (`channelId`, `postJobId`, `q`) is active. */
export function hasNarrowingInboxFilters(filter: InboxListFilter): boolean {
  return filter.channelId !== null || filter.postJobId !== null || filter.q !== null;
}

/** True when the list view differs from the default inbox view. */
export function hasActiveInboxFilters(filter: InboxListFilter): boolean {
  return filter.filter !== DEFAULT_INBOX_FILTER_CHIP || hasNarrowingInboxFilters(filter);
}

/** Returns the count badge value for a filter chip, or `undefined` when omitted by the contract. */
export function getInboxFilterCount(
  counts: InboxThreadCounts,
  chip: InboxThreadFilterChip,
): number | undefined {
  switch (chip) {
    case "can_ban":
      return counts.canBan;
    case "needs_reply":
      return counts.needsReply;
    case "unread":
      return counts.unread;
    case "all":
      return counts.all;
    case "has_phone":
      return counts.hasPhone;
    case "hidden":
      return counts.hidden;
    case "ignored":
      return counts.ignored;
  }
}

export type InboxListEmptyKind = "first-run" | "done" | "can-ban-clear" | "no-result";

/**
 * Classifies an empty thread list into:
 * - `"first-run"`: tenant has zero threads overall and no narrowing filter
 * - `"done"`: default `needs_reply` tab has 0 waiting threads while other threads exist
 * - `"can-ban-clear"`: `can_ban` tab has 0 escalated threads while other threads exist
 * - `"no-result"`: current filter/search returned nothing (show clear-filters CTA)
 */
export function resolveInboxListEmptyKind(input: {
  readonly counts: InboxThreadCounts;
  readonly filter: InboxListFilter;
}): InboxListEmptyKind {
  if (input.counts.all === 0) {
    return hasNarrowingInboxFilters(input.filter) ? "no-result" : "first-run";
  }
  if (
    input.filter.filter === "can_ban" &&
    input.counts.canBan === 0 &&
    !hasNarrowingInboxFilters(input.filter)
  ) {
    return "can-ban-clear";
  }
  if (
    input.filter.filter === "needs_reply" &&
    input.counts.needsReply === 0 &&
    !hasNarrowingInboxFilters(input.filter)
  ) {
    return "done";
  }
  return "no-result";
}
