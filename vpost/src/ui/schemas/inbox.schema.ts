import { z } from "zod";

import {
  InboxMessageSentBySchema,
  InboxThreadAttentionSchema,
  InboxThreadAutoReplySchema,
  type InboxMessageSentBy,
  type InboxThreadAttention,
  type InboxThreadAutoReply,
} from "@/ui/schemas/auto-reply.schema";
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
 * Mirrors `.swarm/specs/inbox-contract.md` (Threads + Like routes) and
 * `.swarm/specs/auto-reply.md` (Attention + Auto-reply metadata), reusing
 * `CommentDraftSchema`, `CommentModerationSchema`, and URL sanitizers unchanged.
 */

export {
  COMMENT_REPLY_MAX_LENGTH,
  CommentBlockedErrorBodySchema,
  InboxMessageSentBySchema,
  InboxThreadAttentionSchema,
  InboxThreadAutoReplySchema,
  displayCommentAuthor,
  filterReplyWarnings,
  formatCommentAbsoluteTime,
  formatCommentRelativeTime,
  formatSyncSummary,
  isModerationFailedCode,
  isReconnectPageCode,
  parseBlockedReasons,
  toSafeFacebookUrl,
  type InboxMessageSentBy,
  type InboxThreadAttention,
  type InboxThreadAutoReply,
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
  "can_ban",
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
  can_ban: "Cần bạn",
  needs_reply: "Cần trả lời",
  unread: "Chưa đọc",
  all: "Tất cả",
  has_phone: "Có SĐT",
  hidden: "Đã ẩn",
  ignored: "Bỏ qua",
};

export const INBOX_DEFAULT_THREADS_LIMIT = 30;
export const INBOX_DEFAULT_MESSAGES_LIMIT = 50;
export const INBOX_DEFAULT_RUNS_LIMIT = 10;
export const INBOX_COMPOSER_WARN_THRESHOLD = 1800;
export const INBOX_HIDDEN_MESSAGE_NOTE = "Đã ẩn — chỉ người viết và bạn bè họ còn thấy";

// --- Agent run trace schemas ------------------------------------------------

export const AGENT_RUN_STEP_STATUSES = [
  "running",
  "ok",
  "blocked",
  "skipped",
  "error",
] as const;
export const AgentRunStepStatusSchema = z.enum(AGENT_RUN_STEP_STATUSES);
export type AgentRunStepStatus = z.infer<typeof AgentRunStepStatusSchema>;

export const AGENT_RUN_KINDS = ["auto_reply", "draft"] as const;
export const AgentRunKindSchema = z.enum(AGENT_RUN_KINDS);
export type AgentRunKind = z.infer<typeof AgentRunKindSchema>;

export const AGENT_RUN_STATUSES = ["running", "done", "error"] as const;
export const AgentRunStatusSchema = z.enum(AGENT_RUN_STATUSES);
export type AgentRunStatus = z.infer<typeof AgentRunStatusSchema>;

export const AGENT_RUN_OUTCOMES = [
  "sent",
  "would_send",
  "can_ban",
  "draft_saved",
  "failed",
  "awaiting_measurements",
] as const;
export const AgentRunOutcomeSchema = z.enum(AGENT_RUN_OUTCOMES);
export type AgentRunOutcome = z.infer<typeof AgentRunOutcomeSchema>;

/**
 * Optional structured measurements payload attached to an agent run or step
 * (`.swarm/specs/size-advice.md`). Accepts camelCase or snake_case keys and
 * normalizes to a clean shape while staying completely optional in zod.
 */
export interface ParsedMeasurements {
  readonly heightCm: number | null;
  readonly weightKg: number | null;
  readonly size: string | null;
  readonly category: string | null;
  readonly chartRowLabel: string | null;
}

const SizeChartRangeLikeSchema = z.tuple([z.number().finite(), z.number().finite()]);

const RawChartRowLikeSchema = z.object({
  size: z.string().trim().min(1).optional(),
  weightKg: SizeChartRangeLikeSchema.nullable().optional(),
  weight_kg: SizeChartRangeLikeSchema.nullable().optional(),
  heightCm: SizeChartRangeLikeSchema.nullable().optional(),
  height_cm: SizeChartRangeLikeSchema.nullable().optional(),
});

function formatChartRowLike(
  raw: z.infer<typeof RawChartRowLikeSchema> | string | null | undefined,
): string | null {
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (!raw || typeof raw !== "object") return null;
  const parts: string[] = [];
  if (raw.size) parts.push(`Size ${raw.size}`);
  const w = raw.weightKg ?? raw.weight_kg;
  if (w) parts.push(`${w[0]}–${w[1]} kg`);
  const h = raw.heightCm ?? raw.height_cm;
  if (h) parts.push(`${h[0]}–${h[1]} cm`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

export const ParsedMeasurementsSchema: z.ZodType<ParsedMeasurements> = z
  .object({
    heightCm: z.number().finite().nullable().optional(),
    height_cm: z.number().finite().nullable().optional(),
    weightKg: z.number().finite().nullable().optional(),
    weight_kg: z.number().finite().nullable().optional(),
    size: z.string().nullable().optional(),
    recommendedSize: z.string().nullable().optional(),
    recommended_size: z.string().nullable().optional(),
    category: z.string().nullable().optional(),
    loai: z.string().nullable().optional(),
    chartRow: z.union([RawChartRowLikeSchema, z.string()]).nullable().optional(),
    chart_row: z.union([RawChartRowLikeSchema, z.string()]).nullable().optional(),
  })
  .transform((raw): ParsedMeasurements => {
    const heightCm = raw.heightCm ?? raw.height_cm ?? null;
    const weightKg = raw.weightKg ?? raw.weight_kg ?? null;
    const rawSize = raw.size ?? raw.recommendedSize ?? raw.recommended_size ?? null;
    const size = rawSize && rawSize.trim().length > 0 ? rawSize.trim() : null;
    const rawCat = raw.category ?? raw.loai ?? null;
    const category = rawCat && rawCat.trim().length > 0 ? rawCat.trim() : null;
    const chartRowLabel = formatChartRowLike(raw.chartRow ?? raw.chart_row);
    return { heightCm, weightKg, size, category, chartRowLabel };
  });

export const AgentRunStepSchema = z.object({
  key: z.string().min(1),
  label: z.string(),
  status: AgentRunStepStatusSchema,
  detail: z
    .string()
    .nullable()
    .optional()
    .transform((value) => value ?? null),
  at: z.iso.datetime({ offset: true }),
  // Optional structured measurement fields for parallel backend rollout.
  parsedMeasurements: ParsedMeasurementsSchema.nullable().optional(),
  measurements: ParsedMeasurementsSchema.nullable().optional(),
  data: ParsedMeasurementsSchema.nullable().optional(),
});
export type AgentRunStep = z.infer<typeof AgentRunStepSchema>;

export const AgentRunSchema = z.object({
  id: z.string().min(1),
  threadId: z.string().min(1),
  commentId: z
    .string()
    .nullable()
    .optional()
    .transform((value) => value ?? null),
  kind: AgentRunKindSchema,
  status: AgentRunStatusSchema,
  outcome: AgentRunOutcomeSchema.nullable()
    .optional()
    .transform((value) => value ?? null),
  steps: z.array(AgentRunStepSchema).optional().default([]),
  startedAt: z.iso.datetime({ offset: true }),
  finishedAt: z.iso
    .datetime({ offset: true })
    .nullable()
    .optional()
    .transform((value) => value ?? null),
  // Optional structured measurement fields for parallel backend rollout.
  parsedMeasurements: ParsedMeasurementsSchema.nullable().optional(),
  measurements: ParsedMeasurementsSchema.nullable().optional(),
});
export type AgentRun = z.infer<typeof AgentRunSchema>;

export const InboxThreadRunsResponseSchema = z.object({
  tenantId: z.string().min(1),
  items: z.array(AgentRunSchema).optional().default([]),
});
export type InboxThreadRunsResponse = z.infer<typeof InboxThreadRunsResponseSchema>;

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

export interface InboxThreadStateInfo {
  readonly state: string;
  readonly productCode: string | null;
  readonly askedCommentId: string | null;
  readonly expiresAt: string | null;
}

const InboxThreadStateObjectSchema = z
  .object({
    state: z.string().min(1),
    productCode: z.string().nullable().optional(),
    product_code: z.string().nullable().optional(),
    askedCommentId: z.string().nullable().optional(),
    asked_comment_id: z.string().nullable().optional(),
    expiresAt: z.iso.datetime({ offset: true }).nullable().optional(),
    expires_at: z.iso.datetime({ offset: true }).nullable().optional(),
  })
  .transform((raw): InboxThreadStateInfo => ({
    state: raw.state,
    productCode: raw.productCode ?? raw.product_code ?? null,
    askedCommentId: raw.askedCommentId ?? raw.asked_comment_id ?? null,
    expiresAt: raw.expiresAt ?? raw.expires_at ?? null,
  }));

export const InboxThreadStateFieldSchema: z.ZodType<InboxThreadStateInfo | null> = z
  .union([InboxThreadStateObjectSchema, z.string().trim().min(1)])
  .nullable()
  .transform((value): InboxThreadStateInfo | null => {
    if (value === null) return null;
    if (typeof value === "string") {
      return {
        state: value,
        productCode: null,
        askedCommentId: null,
        expiresAt: null,
      };
    }
    return value;
  });

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
  // Optional in zod so UI deploys cleanly ahead of backend rollout; defaults to no attention / no auto-reply.
  attention: InboxThreadAttentionSchema.nullable()
    .optional()
    .transform((value) => value ?? null),
  autoReply: InboxThreadAutoReplySchema.nullable()
    .optional()
    .transform((value) => value ?? null),
  // Optional in zod so UI deploys cleanly ahead of backend rollout; defaults to null.
  agentRun: AgentRunSchema.nullable()
    .optional()
    .transform((value) => value ?? null),
  // Optional size-advice thread state fields (`awaiting_measurements`) for parallel backend rollout.
  threadState: InboxThreadStateFieldSchema.optional(),
  sizeAdvice: InboxThreadStateFieldSchema.optional(),
  awaitingMeasurements: z.boolean().nullable().optional(),
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
  // Optional in zod so UI deploys cleanly ahead of backend rollout; defaults to null (not auto-sent).
  sentBy: InboxMessageSentBySchema.nullable()
    .optional()
    .transform((value) => value ?? null),
  // Optional in zod so UI deploys cleanly ahead of backend rollout; defaults to null.
  agentRunId: z
    .string()
    .nullable()
    .optional()
    .transform((value) => {
      const trimmed = value?.trim();
      return trimmed && trimmed.length > 0 ? trimmed : null;
    }),
});
export type InboxMessage = z.infer<typeof InboxMessageSchema>;

export const InboxThreadCountsSchema = z.object({
  // Optional in zod (backend may roll out after UI); defaults to 0 ("no attention").
  canBan: z.number().int().min(0).optional().default(0),
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
