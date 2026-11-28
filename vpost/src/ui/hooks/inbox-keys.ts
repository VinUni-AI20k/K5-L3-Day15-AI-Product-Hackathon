/**
 * Single query-key factory for the comment inbox. Shared by the conversation view,
 * the customer panel, quick replies, auto-reply settings/log, and the realtime poller.
 */
export const inboxKeys = {
  all: (tenantKey: string) => ["inbox", tenantKey] as const,
  threads: (tenantKey: string) => ["inbox", tenantKey, "threads"] as const,
  threadList: (tenantKey: string, filter: Record<string, string | null>) =>
    ["inbox", tenantKey, "threads", "list", filter] as const,
  thread: (tenantKey: string, threadId: string) =>
    ["inbox", tenantKey, "thread", threadId] as const,
  threadRuns: (tenantKey: string, threadId: string) =>
    ["inbox", tenantKey, "thread-runs", threadId] as const,
  updates: (tenantKey: string) => ["inbox", tenantKey, "updates"] as const,
  customer: (tenantKey: string, fromId: string) =>
    ["inbox", tenantKey, "customer", fromId] as const,
  customerTags: (tenantKey: string) => ["inbox", tenantKey, "customer-tags"] as const,
  quickReplies: (tenantKey: string) => ["inbox", tenantKey, "quick-replies"] as const,
  autoReplySettings: (tenantKey: string) =>
    ["inbox", tenantKey, "auto-reply-settings"] as const,
  autoReplyLogAll: (tenantKey: string) =>
    ["inbox", tenantKey, "auto-reply-log"] as const,
  autoReplyLog: (
    tenantKey: string,
    filter: { readonly pageId?: string | null; readonly action?: string | null },
  ) =>
    [
      "inbox",
      tenantKey,
      "auto-reply-log",
      filter.pageId ?? "all",
      filter.action ?? "all",
    ] as const,
};
