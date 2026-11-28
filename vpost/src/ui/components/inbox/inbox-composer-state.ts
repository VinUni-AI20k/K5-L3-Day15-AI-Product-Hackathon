import {
  COMMENT_REPLY_MAX_LENGTH,
  INBOX_COMPOSER_WARN_THRESHOLD,
} from "@/ui/schemas/inbox.schema";
import type { CommentDraft } from "@/ui/schemas/comment.schema";

/**
 * Pure composer state helpers:
 * - Per-thread draft persistence in `sessionStorage` (guarded by `try/catch`)
 * - One-time keyboard hint dismissal in `sessionStorage`
 * - AI draft prefill resolution without clobbering operator edits
 * - Auto-grow row calculation
 * - `/` quick-reply menu trigger extraction
 * - Enter / Shift+Enter / IME / QuickReplyMenu / coarse-pointer key matrix
 */

export const COMPOSER_DRAFT_STORAGE_PREFIX = "vpost:inbox:draft:";
export const COMPOSER_BLOCKED_DRAFT_STORAGE_PREFIX = "vpost:inbox:blocked-draft:";
export const COMPOSER_HINT_SEEN_KEY = "vpost:inbox:enter-hint-seen";

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function getDefaultSessionStorage(): StorageLike | null {
  try {
    if (typeof window === "undefined") return null;
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function loadThreadDraftFromStorage(
  threadId: string,
  storage: StorageLike | null = getDefaultSessionStorage(),
): string | null {
  if (!storage || !threadId.trim()) return null;
  try {
    return storage.getItem(`${COMPOSER_DRAFT_STORAGE_PREFIX}${threadId}`);
  } catch {
    return null;
  }
}

export function saveThreadDraftToStorage(
  threadId: string,
  text: string,
  storage: StorageLike | null = getDefaultSessionStorage(),
): void {
  if (!storage || !threadId.trim()) return;
  try {
    const key = `${COMPOSER_DRAFT_STORAGE_PREFIX}${threadId}`;
    if (text.length === 0) {
      storage.removeItem(key);
    } else {
      storage.setItem(key, text);
    }
  } catch {
    // Ignore storage quota or private-mode security errors.
  }
}

export function clearThreadDraftFromStorage(
  threadId: string,
  storage: StorageLike | null = getDefaultSessionStorage(),
): void {
  if (!storage || !threadId.trim()) return;
  try {
    storage.removeItem(`${COMPOSER_DRAFT_STORAGE_PREFIX}${threadId}`);
  } catch {
    // Ignore storage errors.
  }
}

export function loadBlockedDraftFromStorage(
  threadId: string,
  storage: StorageLike | null = getDefaultSessionStorage(),
): string | null {
  if (!storage || !threadId.trim()) return null;
  try {
    return storage.getItem(`${COMPOSER_BLOCKED_DRAFT_STORAGE_PREFIX}${threadId}`);
  } catch {
    return null;
  }
}

export function saveBlockedDraftToStorage(
  threadId: string,
  text: string,
  storage: StorageLike | null = getDefaultSessionStorage(),
): void {
  if (!storage || !threadId.trim()) return;
  try {
    const key = `${COMPOSER_BLOCKED_DRAFT_STORAGE_PREFIX}${threadId}`;
    if (text.length === 0) {
      storage.removeItem(key);
    } else {
      storage.setItem(key, text);
    }
  } catch {
    // Ignore storage quota or private-mode security errors.
  }
}

export function clearBlockedDraftFromStorage(
  threadId: string,
  storage: StorageLike | null = getDefaultSessionStorage(),
): void {
  if (!storage || !threadId.trim()) return;
  try {
    storage.removeItem(`${COMPOSER_BLOCKED_DRAFT_STORAGE_PREFIX}${threadId}`);
  } catch {
    // Ignore storage errors.
  }
}

/**
 * Persists a 422 `BLOCKED` rejected reply per thread without ever clobbering
 * newer text the operator has already typed into that thread's composer.
 * - If the thread's composer draft slot is empty, restores directly there.
 * - If the thread already has newer operator text, keeps that text intact and
 *   saves the rejected text in the separate per-thread blocked recovery slot.
 */
export function persistBlockedDraftIfEmpty(
  threadId: string,
  rejectedText: string,
  storage: StorageLike | null = getDefaultSessionStorage(),
): { readonly storedInComposerDraft: boolean } {
  const existing = loadThreadDraftFromStorage(threadId, storage);
  if (existing === null || existing.trim().length === 0) {
    saveThreadDraftToStorage(threadId, rejectedText, storage);
    clearBlockedDraftFromStorage(threadId, storage);
    return { storedInComposerDraft: true };
  }
  if (existing.trim() === rejectedText.trim()) {
    clearBlockedDraftFromStorage(threadId, storage);
    return { storedInComposerDraft: true };
  }
  saveBlockedDraftToStorage(threadId, rejectedText, storage);
  return { storedInComposerDraft: false };
}

/**
 * Reconciles an incoming 422 `BLOCKED` rejection against what is currently in
 * the composer textarea without ever overwriting text the operator already typed.
 */
export function resolveBlockedRestoration(input: {
  readonly currentText: string;
  readonly rejectedText: string;
}): { readonly nextText: string; readonly preservedBlockedText: string | null } {
  if (input.currentText.trim().length === 0) {
    return { nextText: input.rejectedText, preservedBlockedText: null };
  }
  if (input.currentText.trim() === input.rejectedText.trim()) {
    return { nextText: input.currentText, preservedBlockedText: null };
  }
  return {
    nextText: input.currentText,
    preservedBlockedText: input.rejectedText,
  };
}

export function hasSeenEnterHint(
  storage: StorageLike | null = getDefaultSessionStorage(),
): boolean {
  if (!storage) return false;
  try {
    return storage.getItem(COMPOSER_HINT_SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

export function markEnterHintSeen(
  storage: StorageLike | null = getDefaultSessionStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(COMPOSER_HINT_SEEN_KEY, "1");
  } catch {
    // Ignore storage errors.
  }
}

/**
 * Resolves initial composer text for a thread:
 * 1. Saved per-thread draft in sessionStorage (operator typed earlier and returned)
 * 2. Rejected 422 BLOCKED text when the operator did not type newer text
 * 3. Thread's AI draft text when operator has not typed and draft is ready/unsent
 * 4. Empty string
 */
export function resolveInitialComposerText(input: {
  readonly storedDraft: string | null;
  readonly aiDraft: CommentDraft | null;
  readonly hasUserTyped: boolean;
  readonly blockedRejectedText?: string | null;
}): { readonly text: string; readonly source: "stored" | "blocked" | "ai" | "empty" } {
  if (input.storedDraft !== null && input.storedDraft.length > 0) {
    return { text: input.storedDraft, source: "stored" };
  }
  if (
    typeof input.blockedRejectedText === "string" &&
    input.blockedRejectedText.length > 0
  ) {
    return { text: input.blockedRejectedText, source: "blocked" };
  }
  if (
    !input.hasUserTyped &&
    input.aiDraft &&
    input.aiDraft.status !== "sent" &&
    input.aiDraft.text.trim().length > 0
  ) {
    return { text: input.aiDraft.text, source: "ai" };
  }
  return { text: "", source: "empty" };
}

/**
 * Computes auto-grow textarea row count declaratively from content length and
 * explicit newlines (no inline styles required).
 */
export function computeAutoGrowRows(text: string, minRows = 2, maxRows = 6): number {
  if (text.length === 0) return minRows;
  const lines = text.split("\n");
  let visualLines = 0;
  for (const line of lines) {
    visualLines += Math.max(1, Math.ceil(line.length / 64));
  }
  return Math.max(minRows, Math.min(maxRows, visualLines));
}

export interface QuickReplyTrigger {
  readonly open: boolean;
  readonly query: string;
}

/**
 * Typing `/` at the start of the composer opens `QuickReplyMenu` with the
 * trailing query (single-line slash command).
 */
export function extractQuickReplyTrigger(
  text: string,
  dismissed: boolean,
): QuickReplyTrigger {
  if (dismissed) return { open: false, query: "" };
  if (!text.startsWith("/") || text.includes("\n")) {
    return { open: false, query: "" };
  }
  return { open: true, query: text.slice(1) };
}

/**
 * True when composer text is only a single slash-command token (e.g. `"/"` or
 * `"/baoga"`) with no surrounding reply body. Enter must never send raw slash
 * commands directly to Facebook even after the menu is dismissed with Esc.
 */
export function isSlashCommandOnly(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.length > 0 && /^\/\S*$/.test(trimmed);
}

export interface ComposerKeyInput {
  readonly key: string;
  readonly shiftKey: boolean;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly altKey: boolean;
  readonly isComposing: boolean;
  readonly keyCode?: number;
  /** True when `QuickReplyMenu`'s registered key handler returned `true`. */
  readonly menuConsumed: boolean;
  /** True while `QuickReplyMenu` is open (Enter must never send). */
  readonly menuOpen?: boolean;
  /** True when composer text is only a raw `/command` (never sent on Enter). */
  readonly isSlashCommandOnly?: boolean;
  /** True on coarse pointer / narrow touch screens where Enter inserts a newline. */
  readonly isCoarsePointer: boolean;
  /** True when the composer is allowed to send right now. */
  readonly canSend: boolean;
}

export type ComposerKeyDecision =
  | "menu"
  | "send"
  | "newline"
  | "ignore-enter"
  | "passthrough";

/**
 * Decision matrix for composer key handling:
 * 1. QuickReplyMenu handler runs FIRST — if it consumed the key, do nothing.
 * 2. Non-Enter keys pass through normally.
 * 3. IME composition (`isComposing` / `keyCode === 229`) passes through.
 * 4. `Shift+Enter` always inserts a newline; other modified Enter combos pass through.
 * 5. While `QuickReplyMenu` is open, unmodified `Enter` never sends (`"ignore-enter"`).
 * 6. On coarse pointer / narrow screens, `Enter` inserts a newline.
 * 7. Text that is only a `/command` is never sent on `Enter` (`"ignore-enter"`).
 * 8. On fine pointer desktop with unmodified `Enter`: send if allowed, else swallow Enter.
 */
export function decideComposerKeyAction(
  input: ComposerKeyInput,
): ComposerKeyDecision {
  if (input.menuConsumed) return "menu";
  if (input.key !== "Enter") return "passthrough";
  if (input.isComposing || input.keyCode === 229) return "passthrough";
  if (input.shiftKey) return "newline";
  if (input.ctrlKey || input.metaKey || input.altKey) return "passthrough";
  if (input.menuOpen) return "ignore-enter";
  if (input.isCoarsePointer) return "newline";
  if (input.isSlashCommandOnly) return "ignore-enter";
  return input.canSend ? "send" : "ignore-enter";
}

export interface InboxComposerGateInput {
  readonly text: string;
  readonly canComment: boolean;
  readonly readOnlyReason: string | null;
  readonly isGeneratingDraft: boolean;
  readonly menuOpen?: boolean;
}

export interface InboxComposerGate {
  readonly length: number;
  readonly remainingChars: number;
  readonly showRemainingCount: boolean;
  readonly isEmpty: boolean;
  readonly isOverLimit: boolean;
  readonly canEdit: boolean;
  readonly canSend: boolean;
  readonly canGenerateDraft: boolean;
  readonly editDisabledReason: string | null;
  readonly sendDisabledReason: string | null;
  readonly generateDisabledReason: string | null;
}

/**
 * Evaluates composer controls.
 * Importantly, sending NEVER disables editing or sending a follow-up reply,
 * while an open quick-reply menu blocks sending raw `/command` text.
 */
export function evaluateInboxComposerGate(
  input: InboxComposerGateInput,
): InboxComposerGate {
  const length = input.text.length;
  const remainingChars = COMMENT_REPLY_MAX_LENGTH - length;
  const showRemainingCount = length >= INBOX_COMPOSER_WARN_THRESHOLD;
  const isEmpty = input.text.trim().length === 0;
  const isOverLimit = length > COMMENT_REPLY_MAX_LENGTH;

  const editDisabledReason =
    input.readOnlyReason ??
    (!input.canComment ? "Facebook đã khoá trả lời trên bình luận này." : null);
  const canEdit = editDisabledReason === null;

  const sendDisabledReason =
    editDisabledReason ??
    (input.menuOpen
      ? "Chọn mẫu trả lời hoặc nhấn Esc để đóng menu lệnh nhanh."
      : isEmpty
        ? "Nhập nội dung trả lời trước khi gửi."
        : isOverLimit
          ? `Nội dung vượt quá ${COMMENT_REPLY_MAX_LENGTH.toLocaleString("vi-VN")} ký tự.`
          : null);
  const canSend = sendDisabledReason === null;

  const generateDisabledReason =
    editDisabledReason ?? (input.isGeneratingDraft ? "Đang tạo nháp AI…" : null);
  const canGenerateDraft = generateDisabledReason === null;

  return {
    length,
    remainingChars,
    showRemainingCount,
    isEmpty,
    isOverLimit,
    canEdit,
    canSend,
    canGenerateDraft,
    editDisabledReason,
    sendDisabledReason,
    generateDisabledReason,
  };
}
