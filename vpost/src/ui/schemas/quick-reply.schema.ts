import { z } from "zod";

/**
 * Contracts for "/" quick-reply templates in the comment inbox composer.
 * Mirrors `.swarm/specs/inbox-contract.md` §Quick replies (`/api/quick-replies*`).
 */

export const QUICK_REPLY_SHORTCUT_REGEX = /^[a-z0-9_-]{1,24}$/;
export const QUICK_REPLY_SHORTCUT_MAX_LENGTH = 24;
export const QUICK_REPLY_TITLE_MAX_LENGTH = 80;
export const QUICK_REPLY_TEXT_MAX_LENGTH = 2000;
export const QUICK_REPLY_CUSTOMER_PLACEHOLDER = "{ten_khach}";
export const QUICK_REPLY_CUSTOMER_FALLBACK = "bạn";

// --- DTOs -------------------------------------------------------------------

export const QuickReplySchema = z.object({
  id: z.string().min(1),
  shortcut: z.string().regex(QUICK_REPLY_SHORTCUT_REGEX),
  title: z.string().min(1).max(QUICK_REPLY_TITLE_MAX_LENGTH),
  text: z.string().min(1).max(QUICK_REPLY_TEXT_MAX_LENGTH),
  updatedAt: z.iso.datetime({ offset: true }),
});
export type QuickReply = z.infer<typeof QuickReplySchema>;

export const QuickReplyListResponseSchema = z.object({
  tenantId: z.string().min(1),
  items: z.array(QuickReplySchema),
});
export type QuickReplyListResponse = z.infer<typeof QuickReplyListResponseSchema>;

export const QuickReplyMutationResponseSchema = z.object({
  tenantId: z.string().min(1),
  item: QuickReplySchema,
});
export type QuickReplyMutationResponse = z.infer<typeof QuickReplyMutationResponseSchema>;

export const QuickReplyDeleteResponseSchema = z.object({
  tenantId: z.string().min(1),
  id: z.string().min(1),
});
export type QuickReplyDeleteResponse = z.infer<typeof QuickReplyDeleteResponseSchema>;

export const QuickReplyCreateInputSchema = z.object({
  shortcut: z.string().regex(QUICK_REPLY_SHORTCUT_REGEX),
  title: z.string().min(1).max(QUICK_REPLY_TITLE_MAX_LENGTH),
  text: z.string().min(1).max(QUICK_REPLY_TEXT_MAX_LENGTH),
});
export type QuickReplyCreateInput = z.infer<typeof QuickReplyCreateInputSchema>;

export const QuickReplyUpdateInputSchema = QuickReplyCreateInputSchema.partial();
export type QuickReplyUpdateInput = z.infer<typeof QuickReplyUpdateInputSchema>;

// --- Pure validation, filtering & placeholder helpers -----------------------

export interface QuickReplyFieldErrors {
  readonly shortcut?: string;
  readonly title?: string;
  readonly text?: string;
}

export type QuickReplyFormValidationResult =
  | { readonly ok: true; readonly data: QuickReplyCreateInput }
  | { readonly ok: false; readonly errors: QuickReplyFieldErrors };

export function validateQuickReplyShortcut(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return "Nhập phím tắt (ví dụ: bao_gia, phi-ship).";
  }
  if (trimmed.length > QUICK_REPLY_SHORTCUT_MAX_LENGTH) {
    return `Phím tắt tối đa ${QUICK_REPLY_SHORTCUT_MAX_LENGTH} ký tự.`;
  }
  if (!QUICK_REPLY_SHORTCUT_REGEX.test(trimmed)) {
    return "Phím tắt chỉ gồm chữ thường không dấu (a–z), số (0–9), gạch ngang (-) hoặc gạch dưới (_).";
  }
  return null;
}

export function validateQuickReplyTitle(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return "Nhập tiêu đề mẫu trả lời.";
  }
  if (trimmed.length > QUICK_REPLY_TITLE_MAX_LENGTH) {
    return `Tiêu đề tối đa ${QUICK_REPLY_TITLE_MAX_LENGTH} ký tự.`;
  }
  return null;
}

export function validateQuickReplyText(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return "Nhập nội dung mẫu trả lời.";
  }
  if (trimmed.length > QUICK_REPLY_TEXT_MAX_LENGTH) {
    return `Nội dung tối đa ${QUICK_REPLY_TEXT_MAX_LENGTH.toLocaleString("vi-VN")} ký tự.`;
  }
  return null;
}

export function validateQuickReplyForm(values: {
  shortcut: string;
  title: string;
  text: string;
}): QuickReplyFormValidationResult {
  const shortcutError = validateQuickReplyShortcut(values.shortcut);
  const titleError = validateQuickReplyTitle(values.title);
  const textError = validateQuickReplyText(values.text);

  if (shortcutError || titleError || textError) {
    return {
      ok: false,
      errors: {
        ...(shortcutError ? { shortcut: shortcutError } : {}),
        ...(titleError ? { title: titleError } : {}),
        ...(textError ? { text: textError } : {}),
      },
    };
  }

  return {
    ok: true,
    data: {
      shortcut: values.shortcut.trim(),
      title: values.title.trim(),
      text: values.text.trim(),
    },
  };
}

/**
 * Replaces every `{ten_khach}` placeholder with the trimmed customer name,
 * falling back to `"bạn"` when missing or blank. Uses a replacer function so
 * literal `$` characters inside customer names are never interpreted specially.
 */
export function applyQuickReplyPlaceholders(
  text: string,
  customerName: string | null | undefined,
): string {
  const trimmed = typeof customerName === "string" ? customerName.trim() : "";
  const replacement = trimmed.length > 0 ? trimmed : QUICK_REPLY_CUSTOMER_FALLBACK;
  return text.replaceAll(QUICK_REPLY_CUSTOMER_PLACEHOLDER, () => replacement);
}

function foldVietnameseForSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "d")
    .toLowerCase();
}

/**
 * Filters quick-reply templates by `query` across `shortcut` and `title`
 * (case- and Vietnamese-diacritic-insensitive), preserving the input order.
 */
export function filterQuickReplies(
  items: readonly QuickReply[],
  query: string,
): QuickReply[] {
  const trimmed = query.trim();
  if (trimmed.length === 0) return [...items];

  const lowerNeedle = trimmed.toLowerCase();
  const foldedNeedle = foldVietnameseForSearch(trimmed);

  return items.filter((item) => {
    if (
      item.shortcut.toLowerCase().includes(lowerNeedle) ||
      item.title.toLowerCase().includes(lowerNeedle)
    ) {
      return true;
    }
    return (
      foldVietnameseForSearch(item.shortcut).includes(foldedNeedle) ||
      foldVietnameseForSearch(item.title).includes(foldedNeedle)
    );
  });
}
