import type { TokenColor } from "@astryxdesign/core";
import { z } from "zod";

/**
 * Contracts for the customer sidebar panel in the comment inbox.
 * Mirrors `.swarm/specs/inbox-contract.md` §Customers (`/api/customers/*`, `/api/customer-tags*`).
 */

export const CUSTOMER_TAG_COLORS = [
  "gray",
  "red",
  "orange",
  "yellow",
  "green",
  "blue",
  "purple",
] as const;

export const CustomerTagColorSchema = z.enum(CUSTOMER_TAG_COLORS);
export type CustomerTagColor = z.infer<typeof CustomerTagColorSchema>;

export const CUSTOMER_TAG_COLOR_LABELS: Readonly<Record<CustomerTagColor, string>> = {
  gray: "Xám",
  red: "Đỏ",
  orange: "Cam",
  yellow: "Vàng",
  green: "Xanh lá",
  blue: "Xanh dương",
  purple: "Tím",
};

/** Maps contract tag colors 1-to-1 to Astryx `Token` color tokens (zero raw hex). */
export const CUSTOMER_TAG_TOKEN_COLORS: Readonly<Record<CustomerTagColor, TokenColor>> = {
  gray: "gray",
  red: "red",
  orange: "orange",
  yellow: "yellow",
  green: "green",
  blue: "blue",
  purple: "purple",
};

export const CUSTOMER_NOTE_MAX_LENGTH = 2000;
export const CUSTOMER_TAG_NAME_MAX_LENGTH = 40;
export const CUSTOMER_TAGS_MAX_PER_CUSTOMER = 20;
export const CUSTOMER_NAME_FALLBACK = "Khách hàng Facebook";

// --- DTOs -------------------------------------------------------------------

export const CustomerTagSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  color: CustomerTagColorSchema,
});
export type CustomerTag = z.infer<typeof CustomerTagSchema>;

export const CustomerNoteSchema = z.object({
  text: z.string(),
  updatedAt: z.iso.datetime({ offset: true }),
});
export type CustomerNote = z.infer<typeof CustomerNoteSchema>;

export const CustomerRecentCommentSchema = z.object({
  id: z.string().min(1),
  threadId: z.string().min(1),
  text: z.string(),
  createdAt: z.iso.datetime({ offset: true }),
  postCaption: z.string(),
  channelName: z.string(),
});
export type CustomerRecentComment = z.infer<typeof CustomerRecentCommentSchema>;

export const CustomerDetailSchema = z.object({
  id: z.string().min(1),
  name: z
    .string()
    .nullable()
    .optional()
    .transform((value) => value ?? null),
  phones: z.array(z.string()),
  emails: z.array(z.string()),
  firstSeenAt: z.iso.datetime({ offset: true }),
  lastSeenAt: z.iso.datetime({ offset: true }),
  commentCount: z.number().int().min(0),
  tags: z.array(CustomerTagSchema),
  note: CustomerNoteSchema.nullable(),
  recentComments: z.array(CustomerRecentCommentSchema),
});
export type CustomerDetail = z.infer<typeof CustomerDetailSchema>;

export const CustomerDetailResponseSchema = z.object({
  tenantId: z.string().min(1),
  customer: CustomerDetailSchema,
});
export type CustomerDetailResponse = z.infer<typeof CustomerDetailResponseSchema>;

export const CustomerNoteMutationResponseSchema = z.object({
  tenantId: z.string().min(1),
  note: CustomerNoteSchema.nullable(),
});
export type CustomerNoteMutationResponse = z.infer<typeof CustomerNoteMutationResponseSchema>;

export const CustomerTagListResponseSchema = z.object({
  tenantId: z.string().min(1),
  items: z.array(CustomerTagSchema),
});
export type CustomerTagListResponse = z.infer<typeof CustomerTagListResponseSchema>;

export const CustomerTagMutationResponseSchema = z.object({
  tenantId: z.string().min(1),
  item: CustomerTagSchema,
});
export type CustomerTagMutationResponse = z.infer<typeof CustomerTagMutationResponseSchema>;

export const CustomerTagDeleteResponseSchema = z.object({
  tenantId: z.string().min(1),
  id: z.string().min(1),
});
export type CustomerTagDeleteResponse = z.infer<typeof CustomerTagDeleteResponseSchema>;

export const CustomerTagsUpdateResponseSchema = z.object({
  tenantId: z.string().min(1),
  tags: z.array(CustomerTagSchema),
});
export type CustomerTagsUpdateResponse = z.infer<typeof CustomerTagsUpdateResponseSchema>;

// --- Pure formatting & validation helpers -----------------------------------

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; error: string };

/** Resolves customer display name from loaded profile, thread fallback, or standard Vietnamese default. */
export function displayCustomerName(
  name: string | null | undefined,
  fallbackName?: string | null,
): string {
  const loaded = typeof name === "string" ? name.trim() : "";
  if (loaded.length > 0) return loaded;
  const fallback = typeof fallbackName === "string" ? fallbackName.trim() : "";
  if (fallback.length > 0) return fallback;
  return CUSTOMER_NAME_FALLBACK;
}

/** Validates internal note text (0..2000; empty clears the stored note). */
export function validateCustomerNoteText(raw: string): ValidationResult<string> {
  const trimmed = raw.trim();
  if (trimmed.length > CUSTOMER_NOTE_MAX_LENGTH) {
    return {
      ok: false,
      error: `Ghi chú tối đa ${CUSTOMER_NOTE_MAX_LENGTH.toLocaleString("vi-VN")} ký tự.`,
    };
  }
  return { ok: true, value: trimmed };
}

/** Validates a new customer tag name (1..40 chars after trimming). */
export function validateCustomerTagName(raw: string): ValidationResult<string> {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return { ok: false, error: "Nhập tên nhãn." };
  }
  if (trimmed.length > CUSTOMER_TAG_NAME_MAX_LENGTH) {
    return {
      ok: false,
      error: `Tên nhãn tối đa ${CUSTOMER_TAG_NAME_MAX_LENGTH} ký tự.`,
    };
  }
  return { ok: true, value: trimmed };
}

/** Collapses whitespace and truncates comment or post caption excerpts cleanly. */
export function formatCustomerExcerpt(text: string, maxChars = 120): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length <= maxChars) return cleaned;
  return `${cleaned.slice(0, maxChars).trimEnd()}…`;
}

/** Builds the canonical inbox URL for navigating to another thread. */
export function buildInboxThreadHref(threadId: string): string {
  return `/comments?thread=${encodeURIComponent(threadId)}`;
}
