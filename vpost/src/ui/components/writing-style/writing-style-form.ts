import {
  WRITING_STYLE_LENGTHS,
  WRITING_STYLE_LIMITS,
  isValidHashtag,
  normalizeHashtag,
  type WritingStyle,
  type WritingStyleFieldError,
  type WritingStyleLength,
} from "@/ui/schemas/writing-style.schema";
import { ApiError } from "@/ui/services/api-error";
import { WritingStyleValidationError } from "@/ui/services/writing-style.api";

/**
 * Pure form state, serialization, dirty detection, client validation, char
 * counters, list limits, and server field-error mapping for "Phong cách viết".
 *
 * Kept free of React so every rule is tested directly under Vitest's node
 * environment.
 */

export const DEFAULT_SCOPE = "default" as const;
export type WritingStyleScope = typeof DEFAULT_SCOPE | (string & {});

export interface WritingStyleListRow {
  readonly id: string;
  readonly value: string;
}

export type WritingStyleListFieldKey =
  | "hashtags.fixed"
  | "dos"
  | "donts"
  | "extraBanned"
  | "examples";

export type WritingStyleFieldKey =
  | "shopName"
  | "mentionShopName"
  | "industry"
  | "audience"
  | "voice"
  | "xungHo"
  | "selfReference"
  | "maxEmoji"
  | "length"
  | "ctaStyle"
  | "hashtags.fixed"
  | "hashtags.maxExtra"
  | "footer"
  | "dos"
  | "donts"
  | "extraBanned"
  | "examples";

/** Top-to-bottom visual order on screen, used to focus the first invalid field. */
export const FIELD_FOCUS_ORDER: readonly WritingStyleFieldKey[] = [
  "shopName",
  "mentionShopName",
  "industry",
  "audience",
  "voice",
  "xungHo",
  "selfReference",
  "maxEmoji",
  "length",
  "ctaStyle",
  "hashtags.fixed",
  "hashtags.maxExtra",
  "footer",
  "dos",
  "donts",
  "extraBanned",
  "examples",
] as const;

const KNOWN_FIELD_KEYS = new Set<string>(FIELD_FOCUS_ORDER);
const LIST_FIELD_KEYS = new Set<string>([
  "hashtags.fixed",
  "dos",
  "donts",
  "extraBanned",
  "examples",
]);

export interface WritingStyleDraft {
  readonly shopName: string;
  /** `null` means inherit from parent scope (or unset default `false` on company scope). */
  readonly mentionShopName: boolean | null;
  readonly industry: string;
  readonly audience: string;
  readonly voice: string;
  readonly xungHo: string;
  readonly selfReference: string;
  readonly maxEmoji: number | null;
  readonly length: WritingStyleLength | "";
  readonly ctaStyle: string;
  readonly hashtagsFixed: readonly WritingStyleListRow[];
  readonly hashtagsMaxExtra: number | null;
  readonly footer: string;
  readonly extraBanned: readonly WritingStyleListRow[];
  readonly dos: readonly WritingStyleListRow[];
  readonly donts: readonly WritingStyleListRow[];
  readonly examples: readonly WritingStyleListRow[];
}

function toRows(prefix: string, items: readonly string[] | undefined): readonly WritingStyleListRow[] {
  if (!items || items.length === 0) return [];
  return items.map((value, index) => ({
    id: `${prefix}-${index}`,
    value,
  }));
}

export function createEmptyDraft(): WritingStyleDraft {
  return {
    shopName: "",
    mentionShopName: null,
    industry: "",
    audience: "",
    voice: "",
    xungHo: "",
    selfReference: "",
    maxEmoji: null,
    length: "",
    ctaStyle: "",
    hashtagsFixed: [],
    hashtagsMaxExtra: null,
    footer: "",
    extraBanned: [],
    dos: [],
    donts: [],
    examples: [],
  };
}

export function draftFromStyle(style: WritingStyle | undefined): WritingStyleDraft {
  if (!style) return createEmptyDraft();
  return {
    shopName: style.shopName ?? "",
    mentionShopName: typeof style.mentionShopName === "boolean" ? style.mentionShopName : null,
    industry: style.industry ?? "",
    audience: style.audience ?? "",
    voice: style.voice ?? "",
    xungHo: style.xungHo ?? "",
    selfReference: style.selfReference ?? "",
    maxEmoji: typeof style.maxEmoji === "number" ? style.maxEmoji : null,
    length: style.length ?? "",
    ctaStyle: style.ctaStyle ?? "",
    hashtagsFixed: toRows("ht", style.hashtags?.fixed),
    hashtagsMaxExtra:
      typeof style.hashtags?.maxExtra === "number" ? style.hashtags.maxExtra : null,
    footer: style.footer ?? "",
    extraBanned: toRows("ban", style.extraBanned),
    dos: toRows("dos", style.dos),
    donts: toRows("donts", style.donts),
    examples: toRows("ex", style.examples),
  };
}

function nonEmptyStrings(rows: readonly WritingStyleListRow[]): string[] {
  return rows.map((row) => row.value.trim()).filter((value) => value.length > 0);
}

/**
 * Converts controlled form state into the sparse `WritingStyle` payload expected
 * by the API: empty strings, nulls, and blank list rows are omitted so empty = inherit.
 */
export function styleFromDraft(draft: WritingStyleDraft): WritingStyle {
  const out: WritingStyle = {};

  const shopName = draft.shopName.trim();
  if (shopName.length > 0) out.shopName = shopName;

  if (draft.mentionShopName !== null) out.mentionShopName = draft.mentionShopName;

  const industry = draft.industry.trim();
  if (industry.length > 0) out.industry = industry;

  const audience = draft.audience.trim();
  if (audience.length > 0) out.audience = audience;

  const voice = draft.voice.trim();
  if (voice.length > 0) out.voice = voice;

  const xungHo = draft.xungHo.trim();
  if (xungHo.length > 0) out.xungHo = xungHo;

  const selfReference = draft.selfReference.trim();
  if (selfReference.length > 0) out.selfReference = selfReference;

  if (draft.maxEmoji !== null && Number.isFinite(draft.maxEmoji)) {
    out.maxEmoji = draft.maxEmoji;
  }

  if (draft.length !== "" && WRITING_STYLE_LENGTHS.includes(draft.length)) {
    out.length = draft.length;
  }

  const ctaStyle = draft.ctaStyle.trim();
  if (ctaStyle.length > 0) out.ctaStyle = ctaStyle;

  const fixedTags = draft.hashtagsFixed
    .map((row) => normalizeHashtag(row.value))
    .filter((value) => value.length > 0);
  const hasMaxExtra = draft.hashtagsMaxExtra !== null && Number.isFinite(draft.hashtagsMaxExtra);
  if (fixedTags.length > 0 || hasMaxExtra) {
    out.hashtags = {};
    if (fixedTags.length > 0) out.hashtags.fixed = fixedTags;
    if (hasMaxExtra) out.hashtags.maxExtra = draft.hashtagsMaxExtra as number;
  }

  const footer = draft.footer.trim();
  if (footer.length > 0) out.footer = footer;

  const extraBanned = nonEmptyStrings(draft.extraBanned);
  if (extraBanned.length > 0) out.extraBanned = extraBanned;

  const dos = nonEmptyStrings(draft.dos);
  if (dos.length > 0) out.dos = dos;

  const donts = nonEmptyStrings(draft.donts);
  if (donts.length > 0) out.donts = donts;

  const examples = nonEmptyStrings(draft.examples);
  if (examples.length > 0) out.examples = examples;

  return out;
}

export function hasAnyConfiguredField(style: WritingStyle | undefined): boolean {
  if (!style) return false;
  if (style.shopName?.trim()) return true;
  if (typeof style.mentionShopName === "boolean") return true;
  if (style.industry?.trim()) return true;
  if (style.audience?.trim()) return true;
  if (style.voice?.trim()) return true;
  if (style.xungHo?.trim()) return true;
  if (style.selfReference?.trim()) return true;
  if (typeof style.maxEmoji === "number") return true;
  if (style.length !== undefined) return true;
  if (style.ctaStyle?.trim()) return true;
  if (style.hashtags?.fixed && style.hashtags.fixed.length > 0) return true;
  if (typeof style.hashtags?.maxExtra === "number") return true;
  if (style.footer?.trim()) return true;
  if (style.extraBanned && style.extraBanned.length > 0) return true;
  if (style.dos && style.dos.length > 0) return true;
  if (style.donts && style.donts.length > 0) return true;
  if (style.examples && style.examples.length > 0) return true;
  return false;
}

function arraysEqual(a: readonly string[] | undefined, b: readonly string[] | undefined): boolean {
  const left = a ?? [];
  const right = b ?? [];
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i += 1) {
    if (left[i] !== right[i]) return false;
  }
  return true;
}

/**
 * Compares the normalized payloads that would be saved, so adding an untouched
 * empty list row or typing-and-deleting whitespace never triggers a false dirty
 * state.
 */
export function isDraftDirty(initial: WritingStyleDraft, current: WritingStyleDraft): boolean {
  const a = styleFromDraft(initial);
  const b = styleFromDraft(current);

  if (a.shopName !== b.shopName) return true;
  if (a.mentionShopName !== b.mentionShopName) return true;
  if (a.industry !== b.industry) return true;
  if (a.audience !== b.audience) return true;
  if (a.voice !== b.voice) return true;
  if (a.xungHo !== b.xungHo) return true;
  if (a.selfReference !== b.selfReference) return true;
  if (a.maxEmoji !== b.maxEmoji) return true;
  if (a.length !== b.length) return true;
  if (a.ctaStyle !== b.ctaStyle) return true;
  if (!arraysEqual(a.hashtags?.fixed, b.hashtags?.fixed)) return true;
  if (a.hashtags?.maxExtra !== b.hashtags?.maxExtra) return true;
  if (a.footer !== b.footer) return true;
  if (!arraysEqual(a.extraBanned, b.extraBanned)) return true;
  if (!arraysEqual(a.dos, b.dos)) return true;
  if (!arraysEqual(a.donts, b.donts)) return true;
  if (!arraysEqual(a.examples, b.examples)) return true;

  return false;
}

// --- List row helpers + limit calculations ----------------------------------

export interface ListLimitState {
  readonly count: number;
  readonly max: number;
  readonly remaining: number;
  readonly isAtLimit: boolean;
  readonly isOverLimit: boolean;
  readonly text: string;
}

export function listLimitState(count: number, max: number): ListLimitState {
  const safeCount = Math.max(0, count);
  const remaining = Math.max(0, max - safeCount);
  return {
    count: safeCount,
    max,
    remaining,
    isAtLimit: safeCount >= max,
    isOverLimit: safeCount > max,
    text: `${safeCount}/${max}`,
  };
}

export function addListRow(
  rows: readonly WritingStyleListRow[],
  max: number,
  id: string,
): readonly WritingStyleListRow[] {
  if (rows.length >= max) return rows;
  return [...rows, { id, value: "" }];
}

export function updateListRow(
  rows: readonly WritingStyleListRow[],
  id: string,
  value: string,
): readonly WritingStyleListRow[] {
  return rows.map((row) => (row.id === id ? { ...row, value } : row));
}

export function removeListRow(
  rows: readonly WritingStyleListRow[],
  id: string,
): readonly WritingStyleListRow[] {
  return rows.filter((row) => row.id !== id);
}

// --- Character counter near limits ------------------------------------------

export interface CharCounterState {
  readonly visible: boolean;
  readonly length: number;
  readonly max: number;
  readonly remaining: number;
  readonly isNearLimit: boolean;
  readonly isOverLimit: boolean;
  readonly tone: "secondary" | "warning" | "error";
  readonly text: string;
}

/**
 * Reveals the character counter once the operator approaches the limit (≥75%
 * of max, or within 5 characters on short limits) or exceeds it.
 */
export function charCounterState(value: string, max: number): CharCounterState {
  const length = value.length;
  const remaining = max - length;
  const isOverLimit = length > max;
  const nearThreshold = Math.min(Math.ceil(max * 0.75), Math.max(1, max - 5));
  const isNearLimit = !isOverLimit && length >= nearThreshold;
  const visible = isOverLimit || isNearLimit;
  const tone = isOverLimit ? "error" : isNearLimit ? "warning" : "secondary";

  return {
    visible,
    length,
    max,
    remaining,
    isNearLimit,
    isOverLimit,
    tone,
    text: `${length}/${max}`,
  };
}

// --- Client validation ------------------------------------------------------

export type FieldErrorMap = Partial<Record<WritingStyleFieldKey, string>>;
export type ListItemErrorMap = Partial<Record<WritingStyleListFieldKey, Record<number, string>>>;

export interface WritingStyleValidationResult {
  readonly isValid: boolean;
  readonly fieldErrors: FieldErrorMap;
  readonly itemErrors: ListItemErrorMap;
  readonly firstInvalidField: WritingStyleFieldKey | null;
  readonly firstInvalidItemIndex: number | null;
}

function setItemError(
  itemErrors: ListItemErrorMap,
  key: WritingStyleListFieldKey,
  index: number,
  message: string,
): void {
  const existing = itemErrors[key] ?? {};
  if (existing[index] === undefined) {
    existing[index] = message;
    itemErrors[key] = existing;
  }
}

export function firstInvalidFocusTarget(
  fieldErrors: FieldErrorMap,
  itemErrors: ListItemErrorMap,
): { field: WritingStyleFieldKey | null; itemIndex: number | null } {
  for (const key of FIELD_FOCUS_ORDER) {
    const perItem = LIST_FIELD_KEYS.has(key)
      ? itemErrors[key as WritingStyleListFieldKey]
      : undefined;
    if (perItem) {
      const indices = Object.keys(perItem)
        .map(Number)
        .filter((index) => Number.isInteger(index) && index >= 0)
        .sort((a, b) => a - b);
      if (indices.length > 0) {
        return { field: key, itemIndex: indices[0] };
      }
    }
    if (fieldErrors[key]) {
      return { field: key, itemIndex: null };
    }
  }
  return { field: null, itemIndex: null };
}

export function validateWritingStyleDraft(
  draft: WritingStyleDraft,
): WritingStyleValidationResult {
  const fieldErrors: FieldErrorMap = {};
  const itemErrors: ListItemErrorMap = {};

  const checkMaxLen = (
    key: WritingStyleFieldKey,
    value: string,
    max: number,
    label: string,
  ) => {
    if (value.trim().length > max) {
      fieldErrors[key] = `${label} tối đa ${max} ký tự.`;
    }
  };

  checkMaxLen("shopName", draft.shopName, WRITING_STYLE_LIMITS.shopNameMax, "Tên shop");
  checkMaxLen("industry", draft.industry, WRITING_STYLE_LIMITS.industryMax, "Ngành hàng");
  checkMaxLen(
    "audience",
    draft.audience,
    WRITING_STYLE_LIMITS.audienceMax,
    "Đối tượng khách hàng",
  );
  checkMaxLen("voice", draft.voice, WRITING_STYLE_LIMITS.voiceMax, "Giọng văn");
  checkMaxLen("xungHo", draft.xungHo, WRITING_STYLE_LIMITS.xungHoMax, "Cách gọi khách");
  checkMaxLen(
    "selfReference",
    draft.selfReference,
    WRITING_STYLE_LIMITS.selfReferenceMax,
    "Cách shop tự xưng",
  );
  checkMaxLen("ctaStyle", draft.ctaStyle, WRITING_STYLE_LIMITS.ctaStyleMax, "Phong cách CTA");
  checkMaxLen("footer", draft.footer, WRITING_STYLE_LIMITS.footerMax, "Chân bài");

  if (draft.maxEmoji !== null) {
    if (
      !Number.isInteger(draft.maxEmoji) ||
      draft.maxEmoji < WRITING_STYLE_LIMITS.maxEmojiMin ||
      draft.maxEmoji > WRITING_STYLE_LIMITS.maxEmojiMax
    ) {
      fieldErrors.maxEmoji = `Số emoji tối đa phải là số nguyên từ ${WRITING_STYLE_LIMITS.maxEmojiMin} đến ${WRITING_STYLE_LIMITS.maxEmojiMax}.`;
    }
  }

  if (draft.hashtagsMaxExtra !== null) {
    if (
      !Number.isInteger(draft.hashtagsMaxExtra) ||
      draft.hashtagsMaxExtra < WRITING_STYLE_LIMITS.hashtagsMaxExtraMin ||
      draft.hashtagsMaxExtra > WRITING_STYLE_LIMITS.hashtagsMaxExtraMax
    ) {
      fieldErrors["hashtags.maxExtra"] = `Số hashtag bổ sung phải là số nguyên từ ${WRITING_STYLE_LIMITS.hashtagsMaxExtraMin} đến ${WRITING_STYLE_LIMITS.hashtagsMaxExtraMax}.`;
    }
  }

  // hashtags.fixed
  const nonEmptyTags = draft.hashtagsFixed.filter((row) => row.value.trim().length > 0);
  if (nonEmptyTags.length > WRITING_STYLE_LIMITS.hashtagsFixedMaxItems) {
    fieldErrors["hashtags.fixed"] = `Tối đa ${WRITING_STYLE_LIMITS.hashtagsFixedMaxItems} hashtag cố định.`;
  }
  draft.hashtagsFixed.forEach((row, index) => {
    const trimmed = row.value.trim();
    if (trimmed.length === 0) return;
    if (!isValidHashtag(trimmed)) {
      const message = `Hashtag chỉ gồm chữ, số, dấu _ và tối đa ${WRITING_STYLE_LIMITS.hashtagsFixedMaxChars} ký tự.`;
      setItemError(itemErrors, "hashtags.fixed", index, message);
      if (!fieldErrors["hashtags.fixed"]) {
        fieldErrors["hashtags.fixed"] = `Mục ${index + 1}: ${message}`;
      }
    }
  });

  const validateList = (
    key: Exclude<WritingStyleListFieldKey, "hashtags.fixed">,
    rows: readonly WritingStyleListRow[],
    maxItems: number,
    maxChars: number,
    label: string,
  ) => {
    const nonEmpty = rows.filter((row) => row.value.trim().length > 0);
    if (nonEmpty.length > maxItems) {
      fieldErrors[key] = `Tối đa ${maxItems} ${label}.`;
    }
    rows.forEach((row, index) => {
      const trimmed = row.value.trim();
      if (trimmed.length === 0) return;
      if (trimmed.length > maxChars) {
        const message = `Tối đa ${maxChars} ký tự.`;
        setItemError(itemErrors, key, index, message);
        if (!fieldErrors[key]) {
          fieldErrors[key] = `Mục ${index + 1} tối đa ${maxChars} ký tự.`;
        }
      }
    });
  };

  validateList(
    "dos",
    draft.dos,
    WRITING_STYLE_LIMITS.dosMaxItems,
    WRITING_STYLE_LIMITS.dosMaxChars,
    "mục nên làm",
  );
  validateList(
    "donts",
    draft.donts,
    WRITING_STYLE_LIMITS.dontsMaxItems,
    WRITING_STYLE_LIMITS.dontsMaxChars,
    "mục không nên làm",
  );
  validateList(
    "extraBanned",
    draft.extraBanned,
    WRITING_STYLE_LIMITS.extraBannedMaxItems,
    WRITING_STYLE_LIMITS.extraBannedMaxChars,
    "cụm từ cấm bổ sung",
  );
  validateList(
    "examples",
    draft.examples,
    WRITING_STYLE_LIMITS.examplesMaxItems,
    WRITING_STYLE_LIMITS.examplesMaxChars,
    "bài mẫu",
  );

  const first = firstInvalidFocusTarget(fieldErrors, itemErrors);
  return {
    isValid: first.field === null,
    fieldErrors,
    itemErrors,
    firstInvalidField: first.field,
    firstInvalidItemIndex: first.itemIndex,
  };
}

// --- Server field-error mapping ---------------------------------------------

export interface ServerFieldErrorMapping {
  readonly fieldErrors: FieldErrorMap;
  readonly itemErrors: ListItemErrorMap;
  readonly unmappedMessages: readonly string[];
  readonly firstInvalidField: WritingStyleFieldKey | null;
  readonly firstInvalidItemIndex: number | null;
}

const INDEXED_PATH_PATTERN = /^([A-Za-z0-9_.]+?)(?:\.(\d+)|\[(\d+)\])$/;
const VIETNAMESE_ITEM_INDEX_PATTERN = /^mục\s+(\d+)\b/i;

function extractRawFieldErrors(error: unknown): readonly WritingStyleFieldError[] {
  if (error instanceof WritingStyleValidationError) {
    return error.fields;
  }
  if (ApiError.is(error) && error.issues && error.issues.length > 0) {
    return error.issues
      .filter((issue) => issue.path.trim().length > 0 && issue.message.trim().length > 0)
      .map((issue) => ({ field: issue.path, message: issue.message }));
  }
  if (
    typeof error === "object" &&
    error !== null &&
    "fields" in error &&
    Array.isArray((error as { fields?: unknown }).fields)
  ) {
    return (error as { fields: unknown[] }).fields.filter(
      (item): item is WritingStyleFieldError =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as { field?: unknown }).field === "string" &&
        typeof (item as { message?: unknown }).message === "string",
    );
  }
  return [];
}

/**
 * Maps server 400 `INVALID_INPUT` errors (`fields: [{ field, message }]` or
 * `issues: [{ path, message }]`) onto form fields and list row indices.
 * Unknown or root-level paths are kept in `unmappedMessages` so nothing is lost.
 */
export function mapServerFieldErrors(error: unknown): ServerFieldErrorMapping {
  const raw = extractRawFieldErrors(error);
  const fieldErrors: FieldErrorMap = {};
  const itemErrors: ListItemErrorMap = {};
  const unmappedMessages: string[] = [];

  for (const entry of raw) {
    const cleanedField = entry.field.trim().replace(/^style\./, "");
    const message = entry.message.trim();
    if (!cleanedField || !message) continue;

    // 1. Direct match on a known field key (e.g. "voice", "hashtags.fixed", "dos")
    if (KNOWN_FIELD_KEYS.has(cleanedField)) {
      const key = cleanedField as WritingStyleFieldKey;
      if (!fieldErrors[key]) {
        fieldErrors[key] = message;
      }
      // Backend validator reports 1-based item errors as `{ field: "dos", message: "mục 2 ..." }`.
      if (LIST_FIELD_KEYS.has(key)) {
        const match = VIETNAMESE_ITEM_INDEX_PATTERN.exec(message);
        if (match) {
          const zeroBased = Number(match[1]) - 1;
          if (Number.isInteger(zeroBased) && zeroBased >= 0) {
            setItemError(itemErrors, key as WritingStyleListFieldKey, zeroBased, message);
          }
        }
      }
      continue;
    }

    // 2. Indexed list path (e.g. "dos.0", "hashtags.fixed[1]")
    const indexed = INDEXED_PATH_PATTERN.exec(cleanedField);
    if (indexed && LIST_FIELD_KEYS.has(indexed[1])) {
      const listKey = indexed[1] as WritingStyleListFieldKey;
      const index = Number(indexed[2] ?? indexed[3]);
      if (Number.isInteger(index) && index >= 0) {
        setItemError(itemErrors, listKey, index, message);
      }
      if (!fieldErrors[listKey]) {
        fieldErrors[listKey] = message;
      }
      continue;
    }

    // 3. Parent "hashtags" object error maps onto hashtags.fixed so it surfaces inline
    if (cleanedField === "hashtags") {
      if (!fieldErrors["hashtags.fixed"]) {
        fieldErrors["hashtags.fixed"] = message;
      }
      continue;
    }

    unmappedMessages.push(message);
  }

  const first = firstInvalidFocusTarget(fieldErrors, itemErrors);
  return {
    fieldErrors,
    itemErrors,
    unmappedMessages,
    firstInvalidField: first.field,
    firstInvalidItemIndex: first.itemIndex,
  };
}
