import { z } from "zod";

/**
 * Contracts for automatic comment replies (price / size / colour) and "Cần bạn"
 * attention metadata. Mirrors `.swarm/specs/auto-reply.md` § API:
 *  - `GET  /api/comments/auto-reply-settings`
 *  - `PUT  /api/comments/auto-reply-settings/{pageId}`
 *  - `GET  /api/comments/auto-reply-log`
 *  - Shared enums/objects embedded on `InboxThread` and `InboxMessage`
 */

// --- Constants --------------------------------------------------------------

export const AUTO_REPLY_HOURLY_CAP_MIN = 1;
export const AUTO_REPLY_HOURLY_CAP_MAX = 200;
export const AUTO_REPLY_HOURLY_CAP_DEFAULT = 30;

export const AUTO_REPLY_DAILY_CAP_MIN = 1;
export const AUTO_REPLY_DAILY_CAP_MAX = 2000;
export const AUTO_REPLY_DAILY_CAP_DEFAULT = 200;

export const AUTO_REPLY_LOG_DEFAULT_LIMIT = 20;

export const AUTO_REPLY_LIVE_CONFIRM_COPY =
  "Bật chạy thật: câu trả lời sẽ được đăng công khai lên Facebook";

// --- Enums & schemas --------------------------------------------------------

export const INBOX_ATTENTION_TAGS = ["can_ban"] as const;
export const InboxAttentionTagSchema = z.enum(INBOX_ATTENTION_TAGS);
export type InboxAttentionTag = z.infer<typeof InboxAttentionTagSchema>;

export const AUTO_REPLY_MODES = ["dry_run", "live"] as const;
export const AutoReplyModeSchema = z.enum(AUTO_REPLY_MODES);
export type AutoReplyMode = z.infer<typeof AutoReplyModeSchema>;

export const AUTO_REPLY_INTENTS = ["price", "size", "color"] as const;
export const AutoReplyIntentSchema = z.enum(AUTO_REPLY_INTENTS);
export type AutoReplyIntent = z.infer<typeof AutoReplyIntentSchema>;

export const AUTO_REPLY_ACTIONS = ["sent", "would_send", "skipped", "failed"] as const;
export const AutoReplyActionSchema = z.enum(AUTO_REPLY_ACTIONS);
export type AutoReplyAction = z.infer<typeof AutoReplyActionSchema>;

export const INBOX_MESSAGE_SENT_BY = ["operator", "auto"] as const;
export const InboxMessageSentBySchema = z.enum(INBOX_MESSAGE_SENT_BY);
export type InboxMessageSentBy = z.infer<typeof InboxMessageSentBySchema>;

// --- Vietnamese labels & metadata -------------------------------------------

export interface AutoReplyIntentMeta {
  readonly value: AutoReplyIntent;
  readonly label: string;
  readonly description: string;
}

export const AUTO_REPLY_INTENT_META: readonly AutoReplyIntentMeta[] = [
  {
    value: "price",
    label: "Giá",
    description:
      "Tự động báo giá bán lấy trực tiếp từ dữ liệu sản phẩm gắn với bài viết (không dùng AI viết nội dung).",
  },
  {
    value: "size",
    label: "Size",
    description:
      "Tự động liệt kê các size đang còn hàng của sản phẩm gắn với bài viết.",
  },
  {
    value: "color",
    label: "Màu",
    description:
      "Tự động liệt kê các màu đang còn hàng của sản phẩm gắn với bài viết.",
  },
] as const;

export const AUTO_REPLY_INTENT_LABELS: Record<AutoReplyIntent, string> = {
  price: "Giá",
  size: "Size",
  color: "Màu",
};

export const AUTO_REPLY_MODE_LABELS: Record<AutoReplyMode, string> = {
  dry_run: "Chạy thử",
  live: "Chạy thật",
};

export const AUTO_REPLY_ACTION_LABELS: Record<AutoReplyAction, string> = {
  sent: "Đã gửi",
  would_send: "Sẽ gửi (chạy thử)",
  skipped: "Bỏ qua",
  failed: "Thất bại",
};

// --- Thread & message embedded schemas --------------------------------------

export const InboxThreadAttentionSchema = z.object({
  tag: InboxAttentionTagSchema,
  reason: z.string(),
  since: z.iso.datetime({ offset: true }),
});
export type InboxThreadAttention = z.infer<typeof InboxThreadAttentionSchema>;

export const InboxThreadAutoReplySchema = z.object({
  lastAction: AutoReplyActionSchema,
  text: z
    .string()
    .nullable()
    .optional()
    .transform((value) => value ?? null),
  reason: z
    .string()
    .nullable()
    .optional()
    .transform((value) => value ?? null),
  at: z.iso.datetime({ offset: true }),
});
export type InboxThreadAutoReply = z.infer<typeof InboxThreadAutoReplySchema>;

// --- Settings & log DTO schemas ---------------------------------------------

export const AutoReplySettingSchema = z.object({
  pageId: z.string().min(1),
  channelId: z.string().min(1),
  pageName: z.string(),
  enabled: z.boolean().optional().default(false),
  mode: AutoReplyModeSchema.optional().default("dry_run"),
  intents: z
    .array(AutoReplyIntentSchema)
    .optional()
    .default([...AUTO_REPLY_INTENTS]),
  hourlyCap: z
    .number()
    .int()
    .min(AUTO_REPLY_HOURLY_CAP_MIN)
    .max(AUTO_REPLY_HOURLY_CAP_MAX)
    .optional()
    .default(AUTO_REPLY_HOURLY_CAP_DEFAULT),
  dailyCap: z
    .number()
    .int()
    .min(AUTO_REPLY_DAILY_CAP_MIN)
    .max(AUTO_REPLY_DAILY_CAP_MAX)
    .optional()
    .default(AUTO_REPLY_DAILY_CAP_DEFAULT),
  updatedAt: z.iso
    .datetime({ offset: true })
    .nullable()
    .optional()
    .transform((value) => value ?? null),
});
export type AutoReplySetting = z.infer<typeof AutoReplySettingSchema>;

export const AutoReplySettingsListResponseSchema = z.object({
  tenantId: z.string().min(1),
  items: z.array(AutoReplySettingSchema),
});
export type AutoReplySettingsListResponse = z.infer<
  typeof AutoReplySettingsListResponseSchema
>;

export const AutoReplySettingUpdateInputSchema = z
  .object({
    enabled: z.boolean(),
    mode: AutoReplyModeSchema,
    intents: z.array(AutoReplyIntentSchema),
    hourlyCap: z
      .number()
      .int()
      .min(AUTO_REPLY_HOURLY_CAP_MIN)
      .max(AUTO_REPLY_HOURLY_CAP_MAX)
      .optional(),
    dailyCap: z
      .number()
      .int()
      .min(AUTO_REPLY_DAILY_CAP_MIN)
      .max(AUTO_REPLY_DAILY_CAP_MAX)
      .optional(),
    confirmLive: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.enabled && data.intents.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["intents"],
        message:
          "Chọn ít nhất một loại câu hỏi (Giá, Size hoặc Màu) khi bật tự động trả lời.",
      });
    }
  });
export type AutoReplySettingUpdateInput = z.infer<
  typeof AutoReplySettingUpdateInputSchema
>;

export const AutoReplySettingUpdateResponseSchema = z.object({
  tenantId: z.string().min(1),
  setting: AutoReplySettingSchema,
});
export type AutoReplySettingUpdateResponse = z.infer<
  typeof AutoReplySettingUpdateResponseSchema
>;

export const AutoReplyLogEntrySchema = z.object({
  id: z.string().min(1),
  pageId: z.string(),
  threadId: z.string().min(1),
  commentId: z.string().min(1),
  intents: z.array(AutoReplyIntentSchema).optional().default([]),
  action: AutoReplyActionSchema,
  reason: z
    .string()
    .nullable()
    .optional()
    .transform((value) => value ?? null),
  text: z
    .string()
    .nullable()
    .optional()
    .transform((value) => value ?? null),
  createdAt: z.iso.datetime({ offset: true }),
});
export type AutoReplyLogEntry = z.infer<typeof AutoReplyLogEntrySchema>;

export const AutoReplyLogResponseSchema = z.object({
  tenantId: z.string().min(1),
  items: z.array(AutoReplyLogEntrySchema),
  nextCursor: z
    .string()
    .nullable()
    .optional()
    .transform((value) => value ?? null),
});
export type AutoReplyLogResponse = z.infer<typeof AutoReplyLogResponseSchema>;

export const AutoReplyLogFilterSchema = z.object({
  pageId: z.string().min(1).nullable(),
  action: AutoReplyActionSchema.nullable(),
});
export type AutoReplyLogFilter = z.infer<typeof AutoReplyLogFilterSchema>;

export const DEFAULT_AUTO_REPLY_LOG_FILTER: AutoReplyLogFilter = {
  pageId: null,
  action: null,
};
