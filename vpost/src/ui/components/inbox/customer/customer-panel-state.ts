import {
  formatCommentAbsoluteTime,
  formatCommentRelativeTime,
} from "@/ui/schemas/comment.schema";
import {
  CUSTOMER_NOTE_MAX_LENGTH,
  CUSTOMER_TAGS_MAX_PER_CUSTOMER,
} from "@/ui/schemas/customer.schema";
import { ApiError } from "@/ui/services/api-error";

// --- Error classifiers ------------------------------------------------------

/** True when `GET /api/customers/{fromId}` answered 404 (no comments from this customer). */
export function isCustomerNotFoundError(error: unknown): boolean {
  return ApiError.is(error) && (error.status === 404 || error.code === "NOT_FOUND");
}

/** True when `POST /api/customer-tags` rejected a duplicate tag name with 409. */
export function isCustomerTagDuplicateError(error: unknown): boolean {
  return ApiError.is(error) && (error.status === 409 || error.code === "CONFLICT");
}

// --- Tag list mutations -----------------------------------------------------

export type TagToggleResult =
  | { readonly ok: true; readonly nextTagIds: string[]; readonly action: "add" | "remove" }
  | { readonly ok: false; readonly error: string };

/** Toggles a tag id on a customer's tag list, enforcing the 20-tag contract cap. */
export function toggleCustomerTagId(
  currentTagIds: readonly string[],
  tagId: string,
): TagToggleResult {
  const uniqueCurrent = Array.from(new Set(currentTagIds));
  if (uniqueCurrent.includes(tagId)) {
    return {
      ok: true,
      nextTagIds: uniqueCurrent.filter((id) => id !== tagId),
      action: "remove",
    };
  }
  if (uniqueCurrent.length >= CUSTOMER_TAGS_MAX_PER_CUSTOMER) {
    return {
      ok: false,
      error: `Mỗi khách hàng chỉ gắn tối đa ${CUSTOMER_TAGS_MAX_PER_CUSTOMER} nhãn.`,
    };
  }
  return {
    ok: true,
    nextTagIds: [...uniqueCurrent, tagId],
    action: "add",
  };
}

/** Removes a single tag id from a customer's tag list. */
export function removeCustomerTagId(
  currentTagIds: readonly string[],
  tagId: string,
): string[] {
  return currentTagIds.filter((id) => id !== tagId);
}

/** Appends a newly created tag id if not already present and within the 20-tag cap. */
export function appendCustomerTagId(
  currentTagIds: readonly string[],
  tagId: string,
): { readonly ok: true; readonly nextTagIds: string[] } | { readonly ok: false; readonly error: string } {
  const uniqueCurrent = Array.from(new Set(currentTagIds));
  if (uniqueCurrent.includes(tagId)) {
    return { ok: true, nextTagIds: uniqueCurrent };
  }
  if (uniqueCurrent.length >= CUSTOMER_TAGS_MAX_PER_CUSTOMER) {
    return {
      ok: false,
      error: `Mỗi khách hàng chỉ gắn tối đa ${CUSTOMER_TAGS_MAX_PER_CUSTOMER} nhãn.`,
    };
  }
  return { ok: true, nextTagIds: [...uniqueCurrent, tagId] };
}

// --- Internal note buffer & save gate ---------------------------------------

export interface NoteDraftBuffer {
  readonly fromId: string;
  readonly serverKey: string;
  readonly serverText: string;
  readonly text: string;
  readonly isDirty: boolean;
}

export function createNoteDraftBuffer(
  fromId: string,
  serverKey: string,
  serverText: string,
): NoteDraftBuffer {
  return {
    fromId,
    serverKey,
    serverText,
    text: serverText,
    isDirty: false,
  };
}

/**
 * Reconciles the local note draft with server data:
 * - switching `fromId` always resets to the new customer's note;
 * - server updates for the same customer sync cleanly unless the operator has
 *   unsaved local edits differing from the incoming server text.
 */
export function syncNoteDraftBuffer(
  buffer: NoteDraftBuffer,
  fromId: string,
  serverKey: string,
  serverText: string,
): NoteDraftBuffer {
  if (buffer.fromId !== fromId) {
    return createNoteDraftBuffer(fromId, serverKey, serverText);
  }
  if (buffer.serverKey === serverKey) {
    return buffer;
  }
  if (!buffer.isDirty || buffer.text.trim() === serverText.trim()) {
    return createNoteDraftBuffer(fromId, serverKey, serverText);
  }
  return {
    ...buffer,
    serverKey,
    serverText,
  };
}

export function applyNoteDraftEdit(
  buffer: NoteDraftBuffer,
  nextText: string,
): NoteDraftBuffer {
  return {
    ...buffer,
    text: nextText,
    isDirty: nextText.trim() !== buffer.serverText.trim(),
  };
}

export interface NoteSaveGate {
  readonly canEdit: boolean;
  readonly canSave: boolean;
  readonly isDirty: boolean;
  readonly isOverMaxLength: boolean;
  readonly validationError: string | null;
  readonly saveDisabledReason: string | null;
}

export function evaluateNoteSaveGate(params: {
  text: string;
  serverText: string;
  isSaving: boolean;
  readOnlyReason: string | null;
}): NoteSaveGate {
  const isDirty = params.text.trim() !== params.serverText.trim();
  const isOverMaxLength = params.text.length > CUSTOMER_NOTE_MAX_LENGTH;
  const validationError = isOverMaxLength
    ? `Ghi chú vượt quá ${CUSTOMER_NOTE_MAX_LENGTH.toLocaleString("vi-VN")} ký tự.`
    : null;

  const canEdit = params.readOnlyReason === null && !params.isSaving;
  const canSave = canEdit && isDirty && !isOverMaxLength;

  let saveDisabledReason: string | null = null;
  if (params.readOnlyReason) {
    saveDisabledReason = params.readOnlyReason;
  } else if (params.isSaving) {
    saveDisabledReason = "Đang lưu ghi chú…";
  } else if (validationError) {
    saveDisabledReason = validationError;
  } else if (!isDirty) {
    saveDisabledReason = "Chưa có thay đổi để lưu.";
  }

  return {
    canEdit,
    canSave,
    isDirty,
    isOverMaxLength,
    validationError,
    saveDisabledReason,
  };
}

// --- Clipboard copy helper --------------------------------------------------

export type ContactCopyKind = "phone" | "email";

export interface ContactCopyFeedback {
  readonly status: "idle" | "copied" | "failed";
  readonly value: string | null;
  readonly announcement: string;
}

export const IDLE_COPY_FEEDBACK: ContactCopyFeedback = {
  status: "idle",
  value: null,
  announcement: "",
};

export interface ClipboardWriter {
  writeText: (text: string) => Promise<void>;
}

/**
 * Copies a phone number or email via the Clipboard API without ever throwing.
 * Returns a polite Vietnamese announcement ("Đã sao chép …") on success or a
 * manual-copy fallback message when the clipboard is unavailable or denied.
 */
export async function copyContactValue(
  rawValue: string,
  kind: ContactCopyKind,
  clipboard?: ClipboardWriter | null,
): Promise<ContactCopyFeedback> {
  const value = rawValue.trim();
  if (value.length === 0) {
    return {
      status: "failed",
      value: null,
      announcement: "Không có nội dung để sao chép.",
    };
  }

  const writer: ClipboardWriter | null =
    clipboard !== undefined
      ? clipboard
      : typeof navigator !== "undefined" &&
          typeof navigator.clipboard?.writeText === "function"
        ? navigator.clipboard
        : null;

  if (!writer || typeof writer.writeText !== "function") {
    return {
      status: "failed",
      value,
      announcement: "Không thể sao chép tự động — hãy chọn và sao chép thủ công.",
    };
  }

  try {
    await writer.writeText(value);
    const kindLabel = kind === "phone" ? "số điện thoại" : "email";
    return {
      status: "copied",
      value,
      announcement: `Đã sao chép ${kindLabel} ${value}`,
    };
  } catch {
    return {
      status: "failed",
      value,
      announcement: "Không thể sao chép tự động — hãy chọn và sao chép thủ công.",
    };
  }
}

// --- Timestamp formatting ---------------------------------------------------

export function formatRecentCommentTime(
  iso: string,
  nowMs: number,
): { readonly label: string; readonly absolute: string } {
  const absolute = formatCommentAbsoluteTime(iso);
  const relative = formatCommentRelativeTime(iso, nowMs);
  return {
    label: relative || absolute,
    absolute,
  };
}
