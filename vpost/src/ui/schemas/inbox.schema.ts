import { z } from "zod";

import {
  COMMENT_REPLY_MAX_LENGTH,
  CommentBlockedErrorBodySchema,
  CommentDraftSchema,
  displayCommentAuthor,
  filterReplyWarnings,
  formatCommentAbsoluteTime,
  formatCommentRelativeTime,
  formatSyncSummary,
  isModerationFailedCode,
  isReconnectPageCode,
  parseBlockedReasons,
  parseSafeHttpUrl,
  toSafeFacebookUrl,
} from "@/ui/schemas/comment.schema";
import { CommentModerationSchema } from "@/ui/schemas/moderation.schema";

/**
 * Contracts for the Pancake/Messenger-style comment inbox (`/comments`).
 * Mirrors `.swarm/specs/inbox-contract.md` (Threads + Like routes) and reuses
 * `CommentDraftSchema`, `CommentModerationSchema`, and URL sanitizers unchanged.
 */

export {
  COMMENT_REPLY_MAX_LENGTH,
  CommentBlockedErrorBodySchema,
  displayCommentAuthor,
  filterReplyWarnings,
  formatCommentAbsoluteTime,
  formatCommentRelativeTime,
  formatSyncSummary,
  isModerationFailedCode,
  isReconnectPageCode,
  parseBlockedReasons,
  toSafeFacebookUrl,
};

// --- Safe URLs --------------------------------------------------------------

const httpUrl = () =>
  z
    .url()
    .refine(
      (value) => parseSafeHttpUrl(value) !== null,
      "Đường dẫn phải bắt đầu bằng http:// hoặc https://",
    );

/**
 * Accepts only safe `http(s)` image URLs or internal `/api/media/` paths so
 * untrusted `javascript:` / `data:` payloads never land in `<img src>`.
 */
export function toSafeImageUrl(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.startsWith("/api/media/")) return trimmed;
  const parsed = parseSafeHttpUrl(trimmed);
  return parsed ? parsed.href : null;
}

// --- Enums & constants ------------------------------------------------------

export const INBOX_TAG_COLORS = [
  "gray",
  "red",
  "orange",
  "yellow",
  "green",
  "blue",
  "purple",
] as const;
export const InboxTagColorSchema = z.enum(INBOX_TAG_COLORS);
export type InboxTagColor = z.infer<typeof InboxTagColorSchema>;

export const INBOX_THREAD_STATUSES = ["open", "ignored"] as const;
export const InboxThreadStatusSchema = z.enum(INBOX_THREAD_STATUSES);
export type InboxThreadStatus = z.infer<typeof InboxThreadStatusSchema>;

export const INBOX_MESSAGE_DELIVERIES = ["sent", "sending", "failed"] as const;
export const InboxMessageDeliverySchema = z.enum(INBOX_MESSAGE_DELIVERIES);
export type InboxMessageDelivery = z.infer<typeof InboxMessageDeliverySchema>;

export const INBOX_DELIVERY_LABELS: Record<InboxMessageDelivery, string> = {
  sending: "Đang gửi",
  sent: "Đã gửi",
  failed: "Gửi lỗi",
};

export const INBOX_THREAD_FILTERS = [
  "needs_reply",
  "unread",
  "all",
  "has_phone",
  "hidden",
  "ignored",
] as const;
export const InboxThreadFilterChipSchema = z.enum(INBOX_THREAD_FILTERS);
export type InboxThreadFilterChip = z.infer<typeof InboxThreadFilterChipSchema>;

export const INBOX_FILTER_LABELS: Record<InboxThreadFilterChip, string> = {
  needs_reply: "Cần trả lời",
  unread: "Chưa đọc",
  all: "Tất cả",
  has_phone: "Có SĐT",
  hidden: "Đã ẩn",
  ignored: "Bỏ qua",
};

export const INBOX_DEFAULT_THREADS_LIMIT = 30;
export const INBOX_DEFAULT_MESSAGES_LIMIT = 50;
export const INBOX_COMPOSER_WARN_THRESHOLD = 1800;
export const INBOX_HIDDEN_MESSAGE_NOTE = "Đã ẩn — chỉ người viết và bạn bè họ còn thấy";

// --- DTO schemas ------------------------------------------------------------

export const InboxTagSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  color: InboxTagColorSchema,
});
export type InboxTag = z.infer<typeof InboxTagSchema>;

export const InboxCustomerSchema = z.object({
  id: z.string(),
  name: z
    .string()
    .nullable()
    .optional()
    .transform((value) => value ?? null),
  tags: z.array(InboxTagSchema).default([]),
});
export type InboxCustomer = z.infer<typeof InboxCustomerSchema>;

export const InboxLastMessageSchema = z.object({
  id: z.string().min(1),
  fromPage: z.boolean(),
  text: z.string(),
  createdAt: z.iso.datetime({ offset: true }),
});
export type InboxLastMessage = z.infer<typeof InboxLastMessageSchema>;

export const InboxThreadSchema = z.object({
  id: z.string().min(1),
  channelId: z.string().min(1),
  channelName: z.string(),
  pageId: z.string(),
  postJobId: z.string(),
  productCode: z.string(),
  postCaption: z.string(),
  postUrl: httpUrl().nullable(),
  postImageUrl: z.string().nullable(),
  customer: InboxCustomerSchema,
  lastMessage: InboxLastMessageSchema,
  needsReply: z.boolean(),
  unread: z.boolean(),
  unreadCount: z.number().int().min(0),
  status: InboxThreadStatusSchema,
  isHidden: z.boolean(),
  canComment: z.boolean().optional(),
  messageCount: z.number().int().min(0),
  hasPhone: z.boolean(),
  draft: CommentDraftSchema.nullable(),
  moderation: CommentModerationSchema.nullable()
    .optional()
    .transform((value) => value ?? null),
  updatedAt: z.iso.datetime({ offset: true }),
});
export type InboxThread = z.infer<typeof InboxThreadSchema>;

export const InboxMessageSchema = z.object({
  id: z.string().min(1),
  threadId: z.string().min(1),
  fromPage: z.boolean(),
  fromId: z.string(),
  fromName: z
    .string()
    .nullable()
    .optional()
    .transform((value) => value ?? null),
  text: z.string(),
  createdAt: z.iso.datetime({ offset: true }),
  permalinkUrl: httpUrl().nullable(),
  isHidden: z.boolean(),
  canComment: z.boolean(),
  likedByPage: z.boolean(),
  delivery: InboxMessageDeliverySchema,
  errorCode: z.string().nullable(),
  userMessage: z.string().nullable(),
  clientId: z.string().nullable(),
  moderation: CommentModerationSchema.nullable()
    .optional()
    .transform((value) => value ?? null),
});
export type InboxMessage = z.infer<typeof InboxMessageSchema>;

export const InboxThreadCountsSchema = z.object({
  needsReply: z.number().int().min(0),
  unread: z.number().int().min(0),
  all: z.number().int().min(0),
  hidden: z.number().int().min(0),
  ignored: z.number().int().min(0),
  // Optional: `inbox-contract.md` §Threads lists the five keys above, while
  // `inbox-ui.md` mentions counts across filter chips including `has_phone`.
  hasPhone: z.number().int().min(0).optional(),
});
export type InboxThreadCounts = z.infer<typeof InboxThreadCountsSchema>;

export const InboxThreadListResponseSchema = z.object({
  tenantId: z.string().min(1),
  items: z.array(InboxThreadSchema),
  nextCursor: z.string().nullable(),
  limit: z.number().int().min(1),
  counts: InboxThreadCountsSchema,
});
export type InboxThreadListResponse = z.infer<typeof InboxThreadListResponseSchema>;

export const InboxThreadDetailResponseSchema = z.object({
  tenantId: z.string().min(1),
  thread: InboxThreadSchema,
  messages: z.array(InboxMessageSchema),
  olderCursor: z.string().nullable(),
});
export type InboxThreadDetailResponse = z.infer<typeof InboxThreadDetailResponseSchema>;

export const InboxThreadMutationResponseSchema = z.object({
  tenantId: z.string().min(1),
  thread: InboxThreadSchema,
});
export type InboxThreadMutationResponse = z.infer<typeof InboxThreadMutationResponseSchema>;

export const InboxReplyResponseSchema = z.object({
  tenantId: z.string().min(1),
  thread: InboxThreadSchema,
  message: InboxMessageSchema,
});
export type InboxReplyResponse = z.infer<typeof InboxReplyResponseSchema>;

export const InboxLikeResponseSchema = z.object({
  tenantId: z.string().min(1),
  commentId: z.string().min(1),
  liked: z.boolean(),
});
export type InboxLikeResponse = z.infer<typeof InboxLikeResponseSchema>;

// --- URL filter state -------------------------------------------------------

export const InboxUrlStateSchema = z.object({
  filter: InboxThreadFilterChipSchema,
  channelId: z.string().min(1).nullable(),
  postJobId: z.string().min(1).nullable(),
  q: z.string().min(1).nullable(),
  thread: z.string().min(1).nullable(),
});
export type InboxUrlState = z.infer<typeof InboxUrlStateSchema>;

export type InboxListFilter = Omit<InboxUrlState, "thread">;

// --- Formatting helpers -----------------------------------------------------

const ACCESSIBLE_EXCERPT_LIMIT = 40;

/**
 * Formats an unambiguous Vietnamese row label ("Minh Thư: “Còn size M không?”")
 * so bulk checkboxes and row buttons stay distinct for screen readers.
 */
export function formatThreadAccessibleContext(
  thread: Pick<InboxThread, "customer" | "lastMessage">,
): string {
  const author = displayCommentAuthor(thread.customer.name);
  const cleaned = thread.lastMessage.text.replace(/\s+/g, " ").trim();
  if (cleaned.length === 0) return author;
  const excerpt =
    cleaned.length <= ACCESSIBLE_EXCERPT_LIMIT
      ? cleaned
      : `${cleaned.slice(0, ACCESSIBLE_EXCERPT_LIMIT).trimEnd()}…`;
  return `${author}: “${excerpt}”`;
}

/** Excerpt shown on a conversation row with "Bạn: " prefix when the last message is from the Page. */
export function formatThreadLastMessageExcerpt(
  lastMessage: Pick<InboxLastMessage, "fromPage" | "text">,
): string {
  const cleaned = lastMessage.text.replace(/\s+/g, " ").trim();
  const body = cleaned.length > 0 ? cleaned : "(Không có nội dung chữ)";
  return lastMessage.fromPage ? `Bạn: ${body}` : body;
}
