import {
  AUTO_REPLY_DAILY_CAP_MAX,
  AUTO_REPLY_DAILY_CAP_MIN,
  AUTO_REPLY_HOURLY_CAP_MAX,
  AUTO_REPLY_HOURLY_CAP_MIN,
  AUTO_REPLY_INTENTS,
  type AutoReplyIntent,
  type AutoReplyLogFilter,
  type AutoReplyMode,
  type AutoReplySetting,
  type AutoReplySettingUpdateInput,
} from "@/ui/schemas/auto-reply.schema";

/**
 * Pure draft state, validation, live-mode confirmation gate, and log filter
 * helpers for `AutoReplySettingsPanel` and `AutoReplyLogPanel`.
 */

const VALID_INTENT_SET = new Set<string>(AUTO_REPLY_INTENTS);

export interface AutoReplySettingDraft {
  readonly enabled: boolean;
  readonly mode: AutoReplyMode;
  readonly intents: readonly AutoReplyIntent[];
  readonly hourlyCap: number | null;
  readonly dailyCap: number | null;
}

export interface AutoReplyDraftValidation {
  readonly isValid: boolean;
  readonly intentsError: string | null;
  readonly hourlyCapError: string | null;
  readonly dailyCapError: string | null;
  readonly capMismatchWarning: string | null;
}

/** Keeps only valid v1 intents (`price | size | color`) in canonical order. */
export function sanitizeAutoReplyIntents(
  intents: readonly string[],
): AutoReplyIntent[] {
  const selected = new Set<string>();
  for (const raw of intents) {
    const trimmed = raw.trim();
    if (VALID_INTENT_SET.has(trimmed)) {
      selected.add(trimmed);
    }
  }
  return AUTO_REPLY_INTENTS.filter((intent) => selected.has(intent));
}

export function settingToAutoReplyDraft(
  setting: AutoReplySetting,
): AutoReplySettingDraft {
  return {
    enabled: setting.enabled,
    mode: setting.mode,
    intents: sanitizeAutoReplyIntents(setting.intents),
    hourlyCap: setting.hourlyCap,
    dailyCap: setting.dailyCap,
  };
}

export function isAutoReplyDraftDirty(
  serverSetting: AutoReplySetting,
  draft: AutoReplySettingDraft,
): boolean {
  const baseline = settingToAutoReplyDraft(serverSetting);
  if (baseline.enabled !== draft.enabled) return true;
  if (baseline.mode !== draft.mode) return true;
  if (baseline.hourlyCap !== draft.hourlyCap) return true;
  if (baseline.dailyCap !== draft.dailyCap) return true;
  const nextIntents = sanitizeAutoReplyIntents(draft.intents);
  if (baseline.intents.length !== nextIntents.length) return true;
  return baseline.intents.some((intent, index) => intent !== nextIntents[index]);
}

/**
 * Validates intents (at least one required when enabled) and hourly/daily caps
 * (`1..200` and `1..2000`, integer only).
 */
export function validateAutoReplyDraft(
  draft: AutoReplySettingDraft,
): AutoReplyDraftValidation {
  const cleanIntents = sanitizeAutoReplyIntents(draft.intents);
  const intentsError =
    draft.enabled && cleanIntents.length === 0
      ? "Chọn ít nhất một loại câu hỏi (Giá, Size hoặc Màu) khi bật tự động trả lời."
      : null;

  const hourlyValid =
    typeof draft.hourlyCap === "number" &&
    Number.isInteger(draft.hourlyCap) &&
    draft.hourlyCap >= AUTO_REPLY_HOURLY_CAP_MIN &&
    draft.hourlyCap <= AUTO_REPLY_HOURLY_CAP_MAX;
  const hourlyCapError = hourlyValid
    ? null
    : `Giới hạn theo giờ phải là số nguyên từ ${AUTO_REPLY_HOURLY_CAP_MIN} đến ${AUTO_REPLY_HOURLY_CAP_MAX}.`;

  const dailyValid =
    typeof draft.dailyCap === "number" &&
    Number.isInteger(draft.dailyCap) &&
    draft.dailyCap >= AUTO_REPLY_DAILY_CAP_MIN &&
    draft.dailyCap <= AUTO_REPLY_DAILY_CAP_MAX;
  const dailyCapError = dailyValid
    ? null
    : `Giới hạn theo ngày phải là số nguyên từ ${AUTO_REPLY_DAILY_CAP_MIN} đến ${AUTO_REPLY_DAILY_CAP_MAX.toLocaleString("vi-VN")}.`;

  const capMismatchWarning =
    hourlyValid &&
    dailyValid &&
    draft.hourlyCap !== null &&
    draft.dailyCap !== null &&
    draft.hourlyCap > draft.dailyCap
      ? "Giới hạn theo giờ đang lớn hơn giới hạn theo ngày — hệ thống sẽ dừng khi chạm giới hạn ngày trước."
      : null;

  return {
    isValid: intentsError === null && hourlyCapError === null && dailyCapError === null,
    intentsError,
    hourlyCapError,
    dailyCapError,
    capMismatchWarning,
  };
}

/**
 * True whenever saving `draft` transitions a Page into live public auto-replying:
 * - switching `mode` from `dry_run` to `live`, OR
 * - turning `enabled` from `false` to `true` while `mode === "live"`.
 */
export function needsLiveModeConfirm(
  serverSetting: Pick<AutoReplySetting, "enabled" | "mode">,
  draft: Pick<AutoReplySettingDraft, "enabled" | "mode">,
): boolean {
  if (draft.mode !== "live") return false;
  return serverSetting.mode !== "live" || (!serverSetting.enabled && draft.enabled);
}

/**
 * Builds the `PUT /api/comments/auto-reply-settings/{pageId}` body from a validated draft.
 * Includes `confirmLive: true` ONLY when `draft.mode === "live"` AND `confirmedLive === true`.
 */
export function buildAutoReplyUpdatePayload(
  draft: AutoReplySettingDraft,
  options: { readonly confirmedLive: boolean },
): AutoReplySettingUpdateInput {
  return {
    enabled: draft.enabled,
    mode: draft.mode,
    intents: sanitizeAutoReplyIntents(draft.intents),
    ...(typeof draft.hourlyCap === "number" ? { hourlyCap: draft.hourlyCap } : {}),
    ...(typeof draft.dailyCap === "number" ? { dailyCap: draft.dailyCap } : {}),
    ...(draft.mode === "live" && options.confirmedLive ? { confirmLive: true } : {}),
  };
}

export interface AutoReplySaveGateInput {
  readonly isDirty: boolean;
  readonly isSaving: boolean;
  readonly readOnlyReason: string | null;
  readonly validation: AutoReplyDraftValidation;
}

export interface AutoReplySaveGate {
  readonly canEdit: boolean;
  readonly canSave: boolean;
  readonly canReset: boolean;
  readonly editDisabledReason: string | null;
  readonly saveDisabledReason: string | null;
}

export function evaluateAutoReplySaveGate(
  input: AutoReplySaveGateInput,
): AutoReplySaveGate {
  const readOnly = input.readOnlyReason?.trim() || null;
  if (readOnly !== null) {
    return {
      canEdit: false,
      canSave: false,
      canReset: false,
      editDisabledReason: readOnly,
      saveDisabledReason: readOnly,
    };
  }
  if (input.isSaving) {
    return {
      canEdit: false,
      canSave: false,
      canReset: false,
      editDisabledReason: "Đang lưu cài đặt tự động trả lời…",
      saveDisabledReason: "Đang lưu cài đặt tự động trả lời…",
    };
  }
  if (!input.validation.isValid) {
    const firstError =
      input.validation.intentsError ??
      input.validation.hourlyCapError ??
      input.validation.dailyCapError ??
      "Thông số cài đặt chưa hợp lệ.";
    return {
      canEdit: true,
      canSave: false,
      canReset: input.isDirty,
      editDisabledReason: null,
      saveDisabledReason: firstError,
    };
  }
  return {
    canEdit: true,
    canSave: input.isDirty,
    canReset: input.isDirty,
    editDisabledReason: null,
    saveDisabledReason: input.isDirty ? null : "Chưa có thay đổi nào cần lưu.",
  };
}

export function hasActiveAutoReplyLogFilters(filter: AutoReplyLogFilter): boolean {
  return filter.pageId !== null || filter.action !== null;
}

export function resolveAutoReplyLogEmptyKind(
  filter: AutoReplyLogFilter,
): "first-run" | "no-result" {
  return hasActiveAutoReplyLogFilters(filter) ? "no-result" : "first-run";
}
