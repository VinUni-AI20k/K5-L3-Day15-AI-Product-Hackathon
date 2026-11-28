import type { WritingStylePreviewResponse } from "@/ui/schemas/writing-style.schema";

import {
  presentWritingStyleError,
  type WritingStyleErrorView,
} from "./writing-style-errors";

/**
 * Pure presentation state + polite screen-reader announcements for the
 * "Viết thử" preview panel.
 */

export type PreviewViewState =
  | { readonly status: "idle" }
  | { readonly status: "loading" }
  | { readonly status: "write"; readonly data: WritingStylePreviewResponse }
  | { readonly status: "flag"; readonly data: WritingStylePreviewResponse }
  | { readonly status: "rate-limited"; readonly error: WritingStyleErrorView }
  | { readonly status: "error"; readonly error: WritingStyleErrorView };

export function derivePreviewViewState(input: {
  readonly isPending: boolean;
  readonly data: WritingStylePreviewResponse | undefined;
  readonly error: unknown;
}): PreviewViewState {
  if (input.isPending) return { status: "loading" };

  if (input.error) {
    const view = presentWritingStyleError(input.error, "preview");
    if (view.isRateLimited) {
      return { status: "rate-limited", error: view };
    }
    return { status: "error", error: view };
  }

  if (input.data) {
    return input.data.decision === "flag"
      ? { status: "flag", data: input.data }
      : { status: "write", data: input.data };
  }

  return { status: "idle" };
}

/**
 * Message spoken by the preview panel's `aria-live="polite"` status region so
 * assistive technology hears every state transition without stealing focus.
 */
export function buildPreviewAnnouncement(
  state: PreviewViewState,
  productCode: string | null,
): string {
  const productLabel = productCode?.trim() ? ` cho sản phẩm ${productCode.trim()}` : "";

  switch (state.status) {
    case "idle":
      return "";
    case "loading":
      return `Đang viết thử bài đăng${productLabel} theo phong cách hiện tại.`;
    case "write":
      return state.data.warnings.length > 0
        ? `Đã viết thử xong${productLabel}, có ${state.data.warnings.length} lưu ý cần xem.`
        : `Đã viết thử xong${productLabel}. Bài đạt kiểm tra.`;
    case "flag":
      return `Bản viết thử${productLabel} bị gắn cờ kiểm tra với ${state.data.reasons.length} lý do.`;
    case "rate-limited":
      return state.error.title;
    case "error":
      return `${state.error.title}. ${state.error.description}`;
  }
}

export function formatPreviewStats(data: WritingStylePreviewResponse): string {
  return `Prompt hệ thống: ${data.systemPromptChars.toLocaleString("vi-VN")} ký tự · Token vào: ${data.tokensIn.toLocaleString("vi-VN")} · Token ra: ${data.tokensOut.toLocaleString("vi-VN")}`;
}
