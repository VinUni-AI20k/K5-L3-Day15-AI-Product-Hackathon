import type { WritingStyleScope } from "./writing-style-form";

/**
 * Pure unsaved-changes guard logic for "Phong cách viết":
 *  - scope switch while dirty
 *  - in-app link navigation (sidebar, top bar, breadcrumbs) while dirty
 *  - browser Back/Forward (`popstate`) and tab close (`beforeunload`)
 */

export type PendingDirtyNavigation =
  | { readonly kind: "scope"; readonly nextScope: WritingStyleScope }
  | { readonly kind: "route"; readonly href: string }
  | { readonly kind: "reload" }
  | { readonly kind: "back" };

export const UNSAVED_CHANGES_DIALOG_COPY = {
  title: "Bỏ các thay đổi chưa lưu?",
  description:
    "Bạn đã chỉnh sửa phong cách viết nhưng chưa bấm Lưu. Nếu rời đi ngay bây giờ, mọi thay đổi chưa lưu sẽ bị mất.",
  actionLabel: "Rời đi và bỏ thay đổi",
  cancelLabel: "Ở lại chỉnh sửa",
} as const;

export interface LinkInterceptInput {
  readonly isDirty: boolean;
  readonly isSaving: boolean;
  readonly currentHref: string;
  readonly targetHref: string;
  readonly targetAttr?: string | null;
  readonly hasDownloadAttr?: boolean;
  readonly button?: number;
  readonly metaKey?: boolean;
  readonly ctrlKey?: boolean;
  readonly shiftKey?: boolean;
  readonly altKey?: boolean;
}

/**
 * Decides whether a document-level click on an `<a>` tag should be intercepted
 * by the unsaved-changes guard.
 *
 * Allows opening in a new tab (Cmd/Ctrl/Shift/middle-click or `target="_blank"`),
 * downloads, external origins, and same-page hash links to proceed unhindered.
 */
export function shouldInterceptAnchorNavigation(input: LinkInterceptInput): boolean {
  if (!input.isDirty || input.isSaving) return false;
  if (input.hasDownloadAttr) return false;
  if (input.targetAttr && input.targetAttr !== "_self") return false;
  if (input.button !== undefined && input.button !== 0) return false;
  if (input.metaKey || input.ctrlKey || input.shiftKey || input.altKey) return false;

  const trimmed = input.targetHref.trim();
  if (trimmed.length === 0 || trimmed.startsWith("#")) return false;
  if (trimmed.startsWith("mailto:") || trimmed.startsWith("tel:")) return false;

  try {
    const currentUrl = new URL(input.currentHref);
    const nextUrl = new URL(trimmed, currentUrl);
    if (nextUrl.origin !== currentUrl.origin) return false;
    // Same path + query (hash-only change or clicking current nav row): no loss.
    if (nextUrl.pathname === currentUrl.pathname && nextUrl.search === currentUrl.search) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function shouldWarnBeforeUnload(isDirty: boolean, isSaving: boolean): boolean {
  return isDirty && !isSaving;
}
