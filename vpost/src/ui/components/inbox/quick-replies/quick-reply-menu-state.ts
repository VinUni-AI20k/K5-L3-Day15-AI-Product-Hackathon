import {
  applyQuickReplyPlaceholders,
  type QuickReply,
  type QuickReplyCreateInput,
  type QuickReplyUpdateInput,
} from "@/ui/schemas/quick-reply.schema";
import { ApiError } from "@/ui/services/api-error";

// --- Deterministic ARIA IDs -------------------------------------------------

/** Returns the listbox DOM id wired to `composerId` via `aria-controls`. */
export function quickReplyListboxId(composerId: string): string {
  return `${composerId}-quick-replies`;
}

/** Returns the option DOM id wired to `composerId` via `aria-activedescendant`. */
export function quickReplyOptionId(composerId: string, itemId: string): string {
  return `${composerId}-quick-reply-${itemId}`;
}

// --- Active option index navigation -----------------------------------------

/** Clamps an active index into `[0, count - 1]`, or `-1` when the list is empty. */
export function clampActiveIndex(activeIndex: number, count: number): number {
  if (count <= 0) return -1;
  if (activeIndex < 0) return 0;
  if (activeIndex >= count) return count - 1;
  return activeIndex;
}

/** Wraps active index up or down across `count` items. */
export function stepActiveIndex(
  currentIndex: number,
  direction: "up" | "down",
  count: number,
): number {
  if (count <= 0) return -1;
  const normalized = clampActiveIndex(currentIndex, count);
  if (direction === "down") {
    return (normalized + 1) % count;
  }
  return (normalized - 1 + count) % count;
}

// --- Registered key handler state machine -----------------------------------

export interface QuickReplyKeyEventLike {
  readonly key: string;
  readonly shiftKey?: boolean;
  readonly ctrlKey?: boolean;
  readonly metaKey?: boolean;
  readonly altKey?: boolean;
  readonly nativeEvent?: { readonly isComposing?: boolean; readonly keyCode?: number };
  preventDefault: () => void;
}

export interface ProcessQuickReplyKeyDownParams {
  readonly open: boolean;
  readonly items: readonly QuickReply[];
  readonly activeIndex: number;
  readonly customerName: string | null;
  readonly isLoading?: boolean;
  readonly hasError?: boolean;
  readonly onActiveIndexChange: (nextIndex: number) => void;
  readonly onPick: (text: string) => void;
  readonly onClose: () => void;
}

/**
 * Handles keyboard events forwarded by the composer while `QuickReplyMenu` is
 * open. Returns `true` when the event was consumed so the composer skips its
 * own Enter/send behavior, and `false` otherwise.
 *
 * While open, unmodified `Enter` is always consumed (including 0 matches,
 * loading, and error states) so pressing Enter in a slash command never sends
 * the raw `/...` text; when there is no selectable item it simply does nothing.
 */
export function processQuickReplyKeyDown(
  event: QuickReplyKeyEventLike,
  params: ProcessQuickReplyKeyDownParams,
): boolean {
  if (!params.open) return false;
  if (event.nativeEvent?.isComposing || event.nativeEvent?.keyCode === 229) return false;

  const hasSelectableItems =
    !params.isLoading && !params.hasError && params.items.length > 0;

  if (event.key === "Escape") {
    event.preventDefault();
    params.onClose();
    return true;
  }

  if (event.key === "ArrowDown") {
    if (!hasSelectableItems) return false;
    event.preventDefault();
    params.onActiveIndexChange(stepActiveIndex(params.activeIndex, "down", params.items.length));
    return true;
  }

  if (event.key === "ArrowUp") {
    if (!hasSelectableItems) return false;
    event.preventDefault();
    params.onActiveIndexChange(stepActiveIndex(params.activeIndex, "up", params.items.length));
    return true;
  }

  if (event.key === "Enter") {
    if (event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) {
      return false;
    }
    event.preventDefault();
    if (!hasSelectableItems) return true;
    const index = clampActiveIndex(params.activeIndex, params.items.length);
    const chosen = params.items[index];
    if (!chosen) return true;
    params.onPick(applyQuickReplyPlaceholders(chosen.text, params.customerName));
    return true;
  }

  return false;
}

// --- Composer ARIA synchronization ------------------------------------------

export interface AriaAttributeTarget {
  setAttribute: (name: string, value: string) => void;
  removeAttribute: (name: string) => void;
}

/**
 * Wires `aria-controls`, `aria-expanded`, `aria-haspopup`, and
 * `aria-activedescendant` on the composer textarea element while open, and
 * removes all four when closed without writing `aria-expanded="false"` or
 * touching attributes owned by the composer.
 */
export function syncComposerAriaAttributes(
  target: AriaAttributeTarget | null,
  params: {
    readonly open: boolean;
    readonly hasListbox: boolean;
    readonly listboxId: string;
    readonly activeOptionId: string | null;
  },
): void {
  if (!target) return;

  if (params.open) {
    target.setAttribute("aria-haspopup", "listbox");
    target.setAttribute("aria-expanded", "true");
    if (params.hasListbox) {
      target.setAttribute("aria-controls", params.listboxId);
    } else {
      target.removeAttribute("aria-controls");
    }
    if (params.hasListbox && params.activeOptionId) {
      target.setAttribute("aria-activedescendant", params.activeOptionId);
    } else {
      target.removeAttribute("aria-activedescendant");
    }
    return;
  }

  target.removeAttribute("aria-haspopup");
  target.removeAttribute("aria-expanded");
  target.removeAttribute("aria-controls");
  target.removeAttribute("aria-activedescendant");
}

// --- CRUD dialog helpers ----------------------------------------------------

/** True when create/update failed due to duplicate shortcut (HTTP 409 CONFLICT). */
export function isQuickReplyDuplicateError(error: unknown): boolean {
  return ApiError.is(error) && (error.status === 409 || error.code === "CONFLICT");
}

export function getDuplicateShortcutMessage(error: unknown): string {
  if (ApiError.is(error) && error.userMessage.trim().length > 0) {
    return error.userMessage;
  }
  return "Phím tắt này đã tồn tại. Vui lòng chọn phím tắt khác.";
}

/** Builds a minimal PATCH payload containing only fields modified from `original`. */
export function buildQuickReplyPatch(
  original: QuickReply,
  next: QuickReplyCreateInput,
): QuickReplyUpdateInput {
  const patch: QuickReplyUpdateInput = {};
  if (next.shortcut !== original.shortcut) patch.shortcut = next.shortcut;
  if (next.title !== original.title) patch.title = next.title;
  if (next.text !== original.text) patch.text = next.text;
  return patch;
}

export function hasQuickReplyPatchChanges(patch: QuickReplyUpdateInput): boolean {
  return (
    patch.shortcut !== undefined ||
    patch.title !== undefined ||
    patch.text !== undefined
  );
}
