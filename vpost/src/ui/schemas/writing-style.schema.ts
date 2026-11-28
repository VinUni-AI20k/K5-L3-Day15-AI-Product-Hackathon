import { z } from "zod";

/**
 * Contracts of the "Phong cách viết" screen (`.swarm/specs/writing-style.md`).
 *
 * `ui/` never imports `core/` (one-way dependency law). Every server payload is
 * parsed through these schemas before reaching React state.
 */

export const WRITING_STYLE_LIMITS = {
  shopNameMax: 80,
  industryMax: 80,
  audienceMax: 200,
  voiceMax: 400,
  xungHoMax: 20,
  selfReferenceMax: 20,
  maxEmojiMin: 0,
  maxEmojiMax: 10,
  ctaStyleMax: 200,
  hashtagsFixedMaxItems: 5,
  hashtagsFixedMaxChars: 40,
  hashtagsMaxExtraMin: 0,
  hashtagsMaxExtraMax: 5,
  footerMax: 300,
  extraBannedMaxItems: 30,
  extraBannedMaxChars: 40,
  dosMaxItems: 10,
  dosMaxChars: 160,
  dontsMaxItems: 10,
  dontsMaxChars: 160,
  examplesMaxItems: 5,
  examplesMaxChars: 1200,
} as const;

export const WRITING_STYLE_LENGTHS = ["short", "medium", "long"] as const;
export const WritingStyleLengthSchema = z.enum(WRITING_STYLE_LENGTHS);
export type WritingStyleLength = z.infer<typeof WritingStyleLengthSchema>;

export const WRITING_STYLE_LENGTH_LABELS: Record<WritingStyleLength, string> = {
  short: "Ngắn (1–2 câu)",
  medium: "Vừa (2–4 câu)",
  long: "Dài (4–6 câu)",
};

/** Spec regex: `^#?[\p{L}\p{N}_]{1,40}$` checked on NFC-normalized, trimmed text. */
export const HASHTAG_PATTERN = /^#?[\p{L}\p{N}_]{1,40}$/u;

export function normalizeHashtag(raw: string): string {
  return raw.normalize("NFC").trim();
}

export function isValidHashtag(raw: string): boolean {
  const normalized = normalizeHashtag(raw);
  if (normalized.length === 0) return false;
  return HASHTAG_PATTERN.test(normalized);
}

export const WritingStyleHashtagsSchema = z.object({
  fixed: z
    .array(
      z
        .string()
        .transform((value) => normalizeHashtag(value))
        .refine((value) => isValidHashtag(value), {
          message: `Hashtag chỉ gồm chữ, số, dấu _ và tối đa ${WRITING_STYLE_LIMITS.hashtagsFixedMaxChars} ký tự.`,
        }),
    )
    .max(
      WRITING_STYLE_LIMITS.hashtagsFixedMaxItems,
      `Tối đa ${WRITING_STYLE_LIMITS.hashtagsFixedMaxItems} hashtag cố định.`,
    )
    .optional(),
  maxExtra: z
    .number()
    .int("Số hashtag bổ sung phải là số nguyên.")
    .min(
      WRITING_STYLE_LIMITS.hashtagsMaxExtraMin,
      `Số hashtag bổ sung tối thiểu là ${WRITING_STYLE_LIMITS.hashtagsMaxExtraMin}.`,
    )
    .max(
      WRITING_STYLE_LIMITS.hashtagsMaxExtraMax,
      `Số hashtag bổ sung tối đa là ${WRITING_STYLE_LIMITS.hashtagsMaxExtraMax}.`,
    )
    .optional(),
});
export type WritingStyleHashtags = z.infer<typeof WritingStyleHashtagsSchema>;

function boundedString(max: number, label: string) {
  return z
    .string()
    .trim()
    .max(max, `${label} tối đa ${max} ký tự.`)
    .optional();
}

function boundedList(maxItems: number, maxChars: number, label: string) {
  return z
    .array(
      z
        .string()
        .trim()
        .min(1, `${label} không được để trống.`)
        .max(maxChars, `Mỗi mục ${label.toLowerCase()} tối đa ${maxChars} ký tự.`),
    )
    .max(maxItems, `Tối đa ${maxItems} mục ${label.toLowerCase()}.`)
    .optional();
}

export const WritingStyleSchema = z.object({
  shopName: boundedString(WRITING_STYLE_LIMITS.shopNameMax, "Tên shop"),
  mentionShopName: z.boolean().optional(),
  industry: boundedString(WRITING_STYLE_LIMITS.industryMax, "Ngành hàng"),
  audience: boundedString(WRITING_STYLE_LIMITS.audienceMax, "Đối tượng khách hàng"),
  voice: boundedString(WRITING_STYLE_LIMITS.voiceMax, "Giọng văn"),
  xungHo: boundedString(WRITING_STYLE_LIMITS.xungHoMax, "Cách gọi khách"),
  selfReference: boundedString(WRITING_STYLE_LIMITS.selfReferenceMax, "Cách shop tự xưng"),
  maxEmoji: z
    .number()
    .int("Số emoji tối đa phải là số nguyên.")
    .min(
      WRITING_STYLE_LIMITS.maxEmojiMin,
      `Số emoji tối thiểu là ${WRITING_STYLE_LIMITS.maxEmojiMin}.`,
    )
    .max(
      WRITING_STYLE_LIMITS.maxEmojiMax,
      `Số emoji tối đa là ${WRITING_STYLE_LIMITS.maxEmojiMax}.`,
    )
    .optional(),
  length: WritingStyleLengthSchema.optional(),
  ctaStyle: boundedString(WRITING_STYLE_LIMITS.ctaStyleMax, "Phong cách CTA"),
  hashtags: WritingStyleHashtagsSchema.optional(),
  footer: boundedString(WRITING_STYLE_LIMITS.footerMax, "Chân bài"),
  extraBanned: boundedList(
    WRITING_STYLE_LIMITS.extraBannedMaxItems,
    WRITING_STYLE_LIMITS.extraBannedMaxChars,
    "Cụm từ cấm bổ sung",
  ),
  dos: boundedList(
    WRITING_STYLE_LIMITS.dosMaxItems,
    WRITING_STYLE_LIMITS.dosMaxChars,
    "Nên làm",
  ),
  donts: boundedList(
    WRITING_STYLE_LIMITS.dontsMaxItems,
    WRITING_STYLE_LIMITS.dontsMaxChars,
    "Không nên làm",
  ),
  examples: boundedList(
    WRITING_STYLE_LIMITS.examplesMaxItems,
    WRITING_STYLE_LIMITS.examplesMaxChars,
    "Bài mẫu",
  ),
});
export type WritingStyle = z.infer<typeof WritingStyleSchema>;

/** Normalizes `""`, `null`, or missing timestamps into `string | null`. */
const NullableTimestampSchema = z
  .string()
  .nullable()
  .optional()
  .transform((value) => (typeof value === "string" && value.trim().length > 0 ? value : null));

export const WritingStyleOverrideItemSchema = z.object({
  channelId: z.string().min(1),
  channelName: z.string(),
  style: WritingStyleSchema,
  updatedAt: NullableTimestampSchema,
});
export type WritingStyleOverrideItem = z.infer<typeof WritingStyleOverrideItemSchema>;

/** Response of `GET /api/writing-style` and `PUT /api/writing-style`. */
export const WritingStyleOverviewResponseSchema = z.object({
  tenantId: z.string().min(1),
  default: WritingStyleSchema,
  overrides: z.array(WritingStyleOverrideItemSchema),
  effectiveDefault: WritingStyleSchema,
  updatedAt: NullableTimestampSchema,
});
export type WritingStyleOverviewResponse = z.infer<typeof WritingStyleOverviewResponseSchema>;

/** Response of `GET /api/writing-style/{channelId}` and `PUT /api/writing-style/{channelId}`. */
export const WritingStyleChannelResponseSchema = z.object({
  tenantId: z.string().min(1),
  channelId: z.string().min(1),
  style: WritingStyleSchema,
  effective: WritingStyleSchema,
  updatedAt: NullableTimestampSchema,
});
export type WritingStyleChannelResponse = z.infer<typeof WritingStyleChannelResponseSchema>;

export const WritingStylePreviewReasonSchema = z.object({
  field: z.string(),
  issue: z.string(),
});
export type WritingStylePreviewReason = z.infer<typeof WritingStylePreviewReasonSchema>;

/** Response of `POST /api/writing-style/preview`. */
export const WritingStylePreviewResponseSchema = z.object({
  tenantId: z.string().min(1),
  decision: z.enum(["write", "flag"]),
  post: z.string(),
  reasons: z.array(WritingStylePreviewReasonSchema),
  warnings: z.array(z.string()),
  systemPromptChars: z.number().int().min(0),
  tokensIn: z.number().int().min(0),
  tokensOut: z.number().int().min(0),
});
export type WritingStylePreviewResponse = z.infer<typeof WritingStylePreviewResponseSchema>;

/** Field-level validation error emitted by `PUT /api/writing-style*` and preview. */
export const WritingStyleFieldErrorSchema = z.object({
  field: z.string().min(1),
  message: z.string().min(1),
});
export type WritingStyleFieldError = z.infer<typeof WritingStyleFieldErrorSchema>;

/**
 * Accepts both the writing-style spec envelope (`fields: [{field, message}]`)
 * and the shared Next API envelope (`issues: [{path, message}]`).
 */
export const WritingStyleErrorBodySchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  fields: z.array(WritingStyleFieldErrorSchema).optional(),
  issues: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
});
export type WritingStyleErrorBody = z.infer<typeof WritingStyleErrorBodySchema>;

export function formatWritingStyleDate(iso: string | null): string {
  if (!iso) return "Chưa từng lưu";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}
