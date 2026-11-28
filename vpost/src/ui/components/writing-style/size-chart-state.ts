import {
  DEFAULT_SIZE_CHART,
  SIZE_CHART_LIMITS,
  type SizeChart,
  type SizeChartRow,
  type WritingStyleFieldError,
} from "@/ui/schemas/writing-style.schema";
import { ApiError } from "@/ui/services/api-error";
import { WritingStyleValidationError } from "@/ui/services/writing-style.api";

/**
 * Pure draft state, serialization, dirty detection, inline validation (mirroring
 * `.swarm/specs/size-advice.md`), server field-error mapping, and category tab
 * helpers for the "Bảng size" section on `/writing-style`.
 */

export const SIZE_CHART_DEFAULT_TAB = "__default__" as const;
export type SizeChartTabValue = typeof SIZE_CHART_DEFAULT_TAB | (string & {});

export interface SizeChartRowDraft {
  readonly id: string;
  readonly size: string;
  readonly weightMin: number | null;
  readonly weightMax: number | null;
  readonly heightMin: number | null;
  readonly heightMax: number | null;
}

export interface SizeChartDraft {
  readonly rows: readonly SizeChartRowDraft[];
  readonly note: string;
}

export type SizeChartCellKey =
  | "size"
  | "weightMin"
  | "weightMax"
  | "heightMin"
  | "heightMax";

export interface SizeChartRowErrors {
  readonly size?: string;
  readonly weightMin?: string;
  readonly weightMax?: string;
  readonly heightMin?: string;
  readonly heightMax?: string;
}

export type SizeChartFocusTarget =
  | {
      readonly kind: "cell";
      readonly rowIndex: number;
      readonly cell: SizeChartCellKey;
    }
  | { readonly kind: "note" }
  | { readonly kind: "table" };

export interface SizeChartValidationResult {
  readonly isValid: boolean;
  readonly tableError: string | null;
  readonly noteError: string | null;
  readonly rowErrors: Readonly<Record<number, SizeChartRowErrors>>;
  readonly firstInvalidTarget: SizeChartFocusTarget | null;
}

export interface SizeChartLimitState {
  readonly count: number;
  readonly max: number;
  readonly isAtLimit: boolean;
  readonly isOverLimit: boolean;
  readonly text: string;
}

export function sizeChartLimitState(count: number): SizeChartLimitState {
  const safeCount = Math.max(0, count);
  return {
    count: safeCount,
    max: SIZE_CHART_LIMITS.maxRows,
    isAtLimit: safeCount >= SIZE_CHART_LIMITS.maxRows,
    isOverLimit: safeCount > SIZE_CHART_LIMITS.maxRows,
    text: `${safeCount}/${SIZE_CHART_LIMITS.maxRows}`,
  };
}

export function draftFromSizeChart(chart: SizeChart): SizeChartDraft {
  return {
    rows: chart.rows.map((row, index) => ({
      id: `size-row-${index}`,
      size: row.size,
      weightMin: row.weightKg[0],
      weightMax: row.weightKg[1],
      heightMin: row.heightCm ? row.heightCm[0] : null,
      heightMax: row.heightCm ? row.heightCm[1] : null,
    })),
    note: chart.note ?? "",
  };
}

export function createDefaultSizeChartDraft(): SizeChartDraft {
  return draftFromSizeChart(DEFAULT_SIZE_CHART);
}

/**
 * Serializes a validated draft into the `SizeChart` wire payload (`{ rows, note }`).
 * Call `validateSizeChartDraft` before calling this function.
 */
export function sizeChartFromDraft(draft: SizeChartDraft): SizeChart {
  const rows: SizeChartRow[] = draft.rows.map((row) => ({
    size: row.size.trim(),
    weightKg: [row.weightMin ?? 0, row.weightMax ?? 0],
    heightCm:
      row.heightMin !== null && row.heightMax !== null
        ? [row.heightMin, row.heightMax]
        : null,
  }));
  const note = draft.note.trim();
  return {
    rows,
    note: note.length > 0 ? note : null,
  };
}

function sameNullableNumber(a: number | null, b: number | null): boolean {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  return Object.is(a, b) || a === b;
}

export function areSizeChartDraftsEqual(
  left: SizeChartDraft,
  right: SizeChartDraft,
): boolean {
  if (left.note.trim() !== right.note.trim()) return false;
  if (left.rows.length !== right.rows.length) return false;
  for (let i = 0; i < left.rows.length; i += 1) {
    const a = left.rows[i];
    const b = right.rows[i];
    if (a.size.trim() !== b.size.trim()) return false;
    if (!sameNullableNumber(a.weightMin, b.weightMin)) return false;
    if (!sameNullableNumber(a.weightMax, b.weightMax)) return false;
    if (!sameNullableNumber(a.heightMin, b.heightMin)) return false;
    if (!sameNullableNumber(a.heightMax, b.heightMax)) return false;
  }
  return true;
}

export function isSizeChartDraftDirty(
  baseline: SizeChartDraft,
  current: SizeChartDraft,
): boolean {
  return !areSizeChartDraftsEqual(baseline, current);
}

const DEFAULT_SAMPLE_DRAFT = createDefaultSizeChartDraft();

export function doesDraftMatchDefaultSample(draft: SizeChartDraft): boolean {
  return areSizeChartDraftsEqual(draft, DEFAULT_SAMPLE_DRAFT);
}

export function addSizeChartRow(
  rows: readonly SizeChartRowDraft[],
  id: string,
): readonly SizeChartRowDraft[] {
  if (rows.length >= SIZE_CHART_LIMITS.maxRows) return rows;
  return [
    ...rows,
    {
      id,
      size: "",
      weightMin: null,
      weightMax: null,
      heightMin: null,
      heightMax: null,
    },
  ];
}

export function updateSizeChartRow(
  rows: readonly SizeChartRowDraft[],
  id: string,
  patch: Partial<Omit<SizeChartRowDraft, "id">>,
): readonly SizeChartRowDraft[] {
  return rows.map((row) => (row.id === id ? { ...row, ...patch } : row));
}

export function removeSizeChartRow(
  rows: readonly SizeChartRowDraft[],
  id: string,
): readonly SizeChartRowDraft[] {
  return rows.filter((row) => row.id !== id);
}

// --- Client validation mirroring `.swarm/specs/size-advice.md` --------------

const CELL_ORDER: readonly SizeChartCellKey[] = [
  "size",
  "weightMin",
  "weightMax",
  "heightMin",
  "heightMax",
] as const;

function firstInvalidCell(
  rowErrors: Readonly<Record<number, SizeChartRowErrors>>,
  rowCount: number,
): SizeChartFocusTarget | null {
  for (let i = 0; i < rowCount; i += 1) {
    const err = rowErrors[i];
    if (!err) continue;
    for (const cell of CELL_ORDER) {
      if (err[cell]) {
        return { kind: "cell", rowIndex: i, cell };
      }
    }
  }
  return null;
}

/**
 * Validates the size chart draft against all backend constraints:
 *  - 1..12 rows
 *  - non-empty unique size names (case-insensitive after trim, <=20 chars)
 *  - weightKg required: 30..150 and min < max
 *  - heightCm optional: either both empty or both 120..210 and min < max
 *  - note optional: <=300 chars
 */
export function validateSizeChartDraft(
  draft: SizeChartDraft,
): SizeChartValidationResult {
  let tableError: string | null = null;
  let noteError: string | null = null;
  const rowErrors: Record<number, Record<SizeChartCellKey, string | undefined>> = {};

  const setCellErr = (rowIndex: number, cell: SizeChartCellKey, message: string) => {
    const existing = rowErrors[rowIndex] ?? {
      size: undefined,
      weightMin: undefined,
      weightMax: undefined,
      heightMin: undefined,
      heightMax: undefined,
    };
    if (existing[cell] === undefined) {
      existing[cell] = message;
      rowErrors[rowIndex] = existing;
    }
  };

  if (draft.rows.length < SIZE_CHART_LIMITS.minRows) {
    tableError = "Cần ít nhất 1 dòng size trong bảng.";
  } else if (draft.rows.length > SIZE_CHART_LIMITS.maxRows) {
    tableError = `Bảng size tối đa ${SIZE_CHART_LIMITS.maxRows} dòng.`;
  }

  const seenSizeIndex = new Map<string, { index: number; label: string }>();

  draft.rows.forEach((row, index) => {
    const trimmedSize = row.size.trim();
    if (trimmedSize.length === 0) {
      setCellErr(index, "size", "Nhập tên size (ví dụ: S, M, L).");
    } else if (trimmedSize.length > SIZE_CHART_LIMITS.sizeMaxChars) {
      setCellErr(
        index,
        "size",
        `Tên size tối đa ${SIZE_CHART_LIMITS.sizeMaxChars} ký tự.`,
      );
    } else {
      const normalizedKey = trimmedSize.toLocaleLowerCase("vi");
      const first = seenSizeIndex.get(normalizedKey);
      if (first !== undefined) {
        setCellErr(
          first.index,
          "size",
          `Size “${first.label}” bị trùng với dòng ${index + 1}.`,
        );
        setCellErr(
          index,
          "size",
          `Size “${trimmedSize}” bị trùng với dòng ${first.index + 1}.`,
        );
      } else {
        seenSizeIndex.set(normalizedKey, { index, label: trimmedSize });
      }
    }

    // Weight range (required, 30..150, min < max)
    const wMin = row.weightMin;
    const wMax = row.weightMax;
    const wMinInRange =
      typeof wMin === "number" &&
      Number.isFinite(wMin) &&
      wMin >= SIZE_CHART_LIMITS.weightMin &&
      wMin <= SIZE_CHART_LIMITS.weightMax;
    const wMaxInRange =
      typeof wMax === "number" &&
      Number.isFinite(wMax) &&
      wMax >= SIZE_CHART_LIMITS.weightMin &&
      wMax <= SIZE_CHART_LIMITS.weightMax;

    if (wMin === null || !Number.isFinite(wMin)) {
      setCellErr(
        index,
        "weightMin",
        `Nhập cân nặng từ (${SIZE_CHART_LIMITS.weightMin}–${SIZE_CHART_LIMITS.weightMax} kg).`,
      );
    } else if (!wMinInRange) {
      setCellErr(
        index,
        "weightMin",
        `Cân nặng phải từ ${SIZE_CHART_LIMITS.weightMin} đến ${SIZE_CHART_LIMITS.weightMax} kg.`,
      );
    }

    if (wMax === null || !Number.isFinite(wMax)) {
      setCellErr(
        index,
        "weightMax",
        `Nhập cân nặng đến (${SIZE_CHART_LIMITS.weightMin}–${SIZE_CHART_LIMITS.weightMax} kg).`,
      );
    } else if (!wMaxInRange) {
      setCellErr(
        index,
        "weightMax",
        `Cân nặng phải từ ${SIZE_CHART_LIMITS.weightMin} đến ${SIZE_CHART_LIMITS.weightMax} kg.`,
      );
    }

    if (wMinInRange && wMaxInRange && wMin >= wMax) {
      setCellErr(index, "weightMax", "Cân nặng “đến” phải lớn hơn “từ”.");
    }

    // Height range (optional pair: both empty, OR both 120..210 and min < max)
    const hMin = row.heightMin;
    const hMax = row.heightMax;
    if (hMin !== null || hMax !== null) {
      const hMinInRange =
        typeof hMin === "number" &&
        Number.isFinite(hMin) &&
        hMin >= SIZE_CHART_LIMITS.heightMin &&
        hMin <= SIZE_CHART_LIMITS.heightMax;
      const hMaxInRange =
        typeof hMax === "number" &&
        Number.isFinite(hMax) &&
        hMax >= SIZE_CHART_LIMITS.heightMin &&
        hMax <= SIZE_CHART_LIMITS.heightMax;

      if (hMin === null || !Number.isFinite(hMin)) {
        setCellErr(
          index,
          "heightMin",
          "Nhập đủ chiều cao từ và đến, hoặc để trống cả hai.",
        );
      } else if (!hMinInRange) {
        setCellErr(
          index,
          "heightMin",
          `Chiều cao phải từ ${SIZE_CHART_LIMITS.heightMin} đến ${SIZE_CHART_LIMITS.heightMax} cm.`,
        );
      }

      if (hMax === null || !Number.isFinite(hMax)) {
        setCellErr(
          index,
          "heightMax",
          "Nhập đủ chiều cao từ và đến, hoặc để trống cả hai.",
        );
      } else if (!hMaxInRange) {
        setCellErr(
          index,
          "heightMax",
          `Chiều cao phải từ ${SIZE_CHART_LIMITS.heightMin} đến ${SIZE_CHART_LIMITS.heightMax} cm.`,
        );
      }

      if (hMinInRange && hMaxInRange && hMin >= hMax) {
        setCellErr(index, "heightMax", "Chiều cao “đến” phải lớn hơn “từ”.");
      }
    }
  });

  if (draft.note.trim().length > SIZE_CHART_LIMITS.noteMaxChars) {
    noteError = `Ghi chú bảng size tối đa ${SIZE_CHART_LIMITS.noteMaxChars} ký tự.`;
  }

  const firstCell = firstInvalidCell(rowErrors, draft.rows.length);
  const firstInvalidTarget: SizeChartFocusTarget | null = firstCell
    ? firstCell
    : noteError
      ? { kind: "note" }
      : tableError
        ? { kind: "table" }
        : null;

  return {
    isValid: tableError === null && noteError === null && firstCell === null,
    tableError,
    noteError,
    rowErrors,
    firstInvalidTarget,
  };
}

// --- Server validation error mapping ----------------------------------------

export interface SizeChartServerErrorMapping {
  readonly tableError: string | null;
  readonly noteError: string | null;
  readonly rowErrors: Readonly<Record<number, SizeChartRowErrors>>;
  readonly unmappedMessages: readonly string[];
  readonly firstInvalidTarget: SizeChartFocusTarget | null;
}

const ROW_FIELD_PATTERN =
  /^(?:chart\.|sizeChart\.)?rows(?:\[(\d+)\]|\.(\d+))(?:\.([A-Za-z0-9_]+)(?:\[(\d+)\]|\.(\d+))?)?$/;

function extractRawErrors(error: unknown): readonly WritingStyleFieldError[] {
  if (error instanceof WritingStyleValidationError) {
    return error.fields;
  }
  if (ApiError.is(error) && error.issues && error.issues.length > 0) {
    return error.issues
      .filter((issue) => issue.path.trim().length > 0 && issue.message.trim().length > 0)
      .map((issue) => ({ field: issue.path, message: issue.message }));
  }
  return [];
}

/**
 * Maps backend `400 INVALID_INPUT` field errors (`rows[0].weightKg`, `rows.1.size`,
 * `rows`, `note`, etc.) onto inline table cell/banner slots.
 */
export function mapSizeChartServerErrors(
  error: unknown,
  rowCount: number,
): SizeChartServerErrorMapping {
  const raw = extractRawErrors(error);
  let tableError: string | null = null;
  let noteError: string | null = null;
  const rowErrors: Record<number, Record<SizeChartCellKey, string | undefined>> = {};
  const unmappedMessages: string[] = [];

  const setCellErr = (rowIndex: number, cell: SizeChartCellKey, message: string) => {
    const existing = rowErrors[rowIndex] ?? {
      size: undefined,
      weightMin: undefined,
      weightMax: undefined,
      heightMin: undefined,
      heightMax: undefined,
    };
    if (existing[cell] === undefined) {
      existing[cell] = message;
      rowErrors[rowIndex] = existing;
    }
  };

  for (const entry of raw) {
    const field = entry.field.trim();
    const message = entry.message.trim();
    if (!field || !message) continue;

    if (field === "note" || field === "chart.note" || field === "sizeChart.note") {
      if (!noteError) noteError = message;
      continue;
    }
    if (field === "rows" || field === "chart.rows" || field === "sizeChart.rows") {
      if (!tableError) tableError = message;
      continue;
    }

    const match = ROW_FIELD_PATTERN.exec(field);
    if (match) {
      const idx = Number(match[1] ?? match[2]);
      const prop = match[3] ?? "";
      const tupleIdx = match[4] ?? match[5];
      if (Number.isInteger(idx) && idx >= 0) {
        if (prop === "size" || prop === "") {
          setCellErr(idx, "size", message);
          continue;
        }
        if (prop === "weightKg") {
          setCellErr(idx, tupleIdx === "0" ? "weightMin" : "weightMax", message);
          continue;
        }
        if (prop === "heightCm") {
          setCellErr(idx, tupleIdx === "0" ? "heightMin" : "heightMax", message);
          continue;
        }
      }
    }

    unmappedMessages.push(message);
  }

  const firstCell = firstInvalidCell(rowErrors, Math.max(rowCount, 12));
  const firstInvalidTarget: SizeChartFocusTarget | null = firstCell
    ? firstCell
    : noteError
      ? { kind: "note" }
      : tableError
        ? { kind: "table" }
        : null;

  return {
    tableError,
    noteError,
    rowErrors,
    unmappedMessages,
    firstInvalidTarget,
  };
}

// --- Category tab helpers ---------------------------------------------------

export function mergeSizeChartCategories(sources: {
  readonly serverCategories?: readonly string[];
  readonly catalogCategories?: readonly string[];
  readonly customCategories?: readonly string[];
}): readonly string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  const push = (raw: string) => {
    const trimmed = raw.trim();
    if (trimmed.length === 0) return;
    const key = trimmed.toLocaleLowerCase("vi");
    if (key === "default" || key === "mặc định" || key === SIZE_CHART_DEFAULT_TAB) return;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(trimmed);
  };

  for (const item of sources.serverCategories ?? []) push(item);
  for (const item of sources.catalogCategories ?? []) push(item);
  for (const item of sources.customCategories ?? []) push(item);

  return out.sort((a, b) => a.localeCompare(b, "vi"));
}

export function validateNewCategoryName(
  raw: string,
  existingCategories: readonly string[],
): string | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return "Nhập tên loại sản phẩm (ví dụ: Váy, Áo, Quần).";
  }
  if (trimmed.length > SIZE_CHART_LIMITS.categoryMaxChars) {
    return `Tên loại sản phẩm tối đa ${SIZE_CHART_LIMITS.categoryMaxChars} ký tự.`;
  }
  const key = trimmed.toLocaleLowerCase("vi");
  if (key === "default" || key === "mặc định" || key === SIZE_CHART_DEFAULT_TAB) {
    return "Tên này trùng với bảng Mặc định — hãy nhập tên loại sản phẩm cụ thể.";
  }
  if (existingCategories.some((cat) => cat.toLocaleLowerCase("vi") === key)) {
    return `Loại “${trimmed}” đã có trong danh sách tab.`;
  }
  return null;
}

export function isNotFoundApiError(error: unknown): boolean {
  return ApiError.is(error) && (error.status === 404 || error.code === "NOT_FOUND");
}
