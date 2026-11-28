import type {
  AgentRun,
  AgentRunKind,
  AgentRunOutcome,
  AgentRunStep,
  AgentRunStepStatus,
  ParsedMeasurements,
} from "@/ui/schemas/inbox.schema";

/**
 * Pure state, matching, formatting, and accessibility helpers for the
 * comment inbox agent run trace UI (`.swarm/specs/agent-run-trace.md`).
 */

export const AGENT_RUN_TYPING_LABEL = "AI đang soạn trả lời…";
export const AGENT_RUN_LIVE_ANNOUNCEMENT = "AI đang soạn trả lời";
export const AGENT_RUN_ROW_INDICATOR_LABEL = "AI đang soạn";
export const AGENT_RUN_TRACE_TOGGLE_LABEL = "Xem quá trình xử lý";

export const AGENT_RUN_STEP_STATUS_LABELS: Record<AgentRunStepStatus, string> = {
  running: "Đang xử lý",
  ok: "Hoàn tất",
  blocked: "Bị chặn",
  skipped: "Bỏ qua",
  error: "Lỗi",
};

export const AGENT_RUN_STEP_FALLBACK_LABELS: Readonly<Record<string, string>> = {
  read: "Đọc bình luận",
  safety: "Kiểm tra an toàn",
  intent: "Phân loại câu hỏi",
  measurements: "Đọc số đo khách hàng",
  parse_measurements: "Đọc số đo khách hàng",
  facts: "Tra dữ liệu sản phẩm",
  size_chart: "Đối chiếu bảng size",
  size_match: "Chọn size phù hợp",
  size_advice: "Tư vấn size",
  compose: "Soạn câu trả lời",
  output_check: "Kiểm tra đầu ra",
  action: "Hành động",
};

export const AGENT_RUN_KIND_LABELS: Record<AgentRunKind, string> = {
  auto_reply: "Tự động trả lời",
  draft: "Tạo nháp AI",
};

export const AGENT_RUN_OUTCOME_LABELS: Record<AgentRunOutcome, string> = {
  sent: "Đã tự gửi",
  would_send: "Sẽ gửi (chạy thử)",
  can_ban: "Chuyển Cần bạn",
  draft_saved: "Đã lưu nháp AI",
  failed: "Thất bại",
  awaiting_measurements: "Đang chờ số đo",
};

const MAX_ANNOUNCED_RUN_IDS = 200;

/**
 * Claims a one-time screen-reader live announcement for `runId`.
 * Returns `true` strictly once per distinct non-empty run ID so 2 s polling ticks
 * during the same run never re-announce "AI đang soạn trả lời".
 */
export function claimAgentRunAnnouncement(
  announcedRunIds: Set<string>,
  runId: string | null | undefined,
  maxTracked = MAX_ANNOUNCED_RUN_IDS,
): boolean {
  const normalized = typeof runId === "string" ? runId.trim() : "";
  if (normalized.length === 0) return false;
  if (announcedRunIds.has(normalized)) return false;

  announcedRunIds.add(normalized);
  while (announcedRunIds.size > maxTracked) {
    const oldest = announcedRunIds.values().next().value;
    if (oldest === undefined) break;
    announcedRunIds.delete(oldest);
  }
  return true;
}

/**
 * Matches a message's `agentRunId` against the fetched thread runs list and the
 * latest `thread.agentRun`, preferring whichever copy is fresher when both exist.
 */
export function resolveMessageAgentRun(params: {
  readonly agentRunId: string | null | undefined;
  readonly runs?: readonly AgentRun[];
  readonly latestThreadRun?: AgentRun | null;
}): AgentRun | null {
  const targetId = typeof params.agentRunId === "string" ? params.agentRunId.trim() : "";
  if (targetId.length === 0) return null;

  const fromRuns = params.runs?.find((item) => item.id === targetId) ?? null;
  const fromLatest =
    params.latestThreadRun && params.latestThreadRun.id === targetId
      ? params.latestThreadRun
      : null;

  if (fromRuns && fromLatest) {
    if (fromRuns.status === "running" && fromLatest.status !== "running") {
      return fromLatest;
    }
    if (fromLatest.status === "running" && fromRuns.status !== "running") {
      return fromRuns;
    }
    return fromLatest.steps.length > fromRuns.steps.length ? fromLatest : fromRuns;
  }

  return fromRuns ?? fromLatest;
}

/**
 * Identifies the step indices to highlight as the blocking reason when a run ends
 * in `outcome === "can_ban"`. Prefers explicit `blocked` steps, then `error` steps,
 * and finally the `action` (or last) step so a `can_ban` trace always surfaces why
 * the bot handed off to the operator.
 */
export function resolveCanBanBlockingStepIndices(run: {
  readonly outcome: AgentRunOutcome | null;
  readonly steps: readonly AgentRunStep[];
}): Set<number> {
  const indices = new Set<number>();
  if (run.outcome !== "can_ban" || run.steps.length === 0) {
    return indices;
  }

  run.steps.forEach((step, idx) => {
    if (step.status === "blocked") {
      indices.add(idx);
    }
  });
  if (indices.size > 0) return indices;

  run.steps.forEach((step, idx) => {
    if (step.status === "error") {
      indices.add(idx);
    }
  });
  if (indices.size > 0) return indices;

  const actionIdx = run.steps.findIndex((step) => step.key === "action");
  indices.add(actionIdx >= 0 ? actionIdx : run.steps.length - 1);
  return indices;
}

/** Resolves a step's Vietnamese label, falling back cleanly to the contract step map. */
export function formatAgentStepLabel(
  step: Pick<AgentRunStep, "key" | "label">,
): string {
  const trimmed = step.label.trim();
  if (trimmed.length > 0) return trimmed;
  return AGENT_RUN_STEP_FALLBACK_LABELS[step.key] ?? step.key;
}

/**
 * Formats an agent step timestamp to `HH:mm:ss` (24-hour Vietnamese locale) so
 * operators can read sub-minute timing across sequential pipeline steps.
 */
export function formatAgentStepTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

// --- Parsed measurements extraction for size-advice traces ------------------

export interface TraceMeasurementsSummary {
  readonly heightCm: number | null;
  readonly weightKg: number | null;
  readonly size: string | null;
  readonly category: string | null;
  readonly chartRowLabel: string | null;
}

const TRACE_HEIGHT_MIN_CM = 120;
const TRACE_HEIGHT_MAX_CM = 210;
const TRACE_WEIGHT_MIN_KG = 30;
const TRACE_WEIGHT_MAX_KG = 150;

const MEASUREMENT_STEP_KEYS = new Set([
  "measurements",
  "parse_measurements",
  "size_chart",
  "size_match",
  "size_advice",
]);

function parseLocaleDecimal(raw: string): number {
  return Number(raw.replace(",", "."));
}

function isPlausibleHeight(value: number): boolean {
  return Number.isFinite(value) && value >= TRACE_HEIGHT_MIN_CM && value <= TRACE_HEIGHT_MAX_CM;
}

function isPlausibleWeight(value: number): boolean {
  return Number.isFinite(value) && value >= TRACE_WEIGHT_MIN_KG && value <= TRACE_WEIGHT_MAX_KG;
}

function extractHeightFromText(text: string): number | null {
  // 1) "1m60", "1m6", "1m 58", "1 mét 60", "1 mét 6", "1m58"
  const meterShort = /(?<!\d)([12])\s*(?:m|mét|met)\s*(\d{1,2})(?!\d)/iu.exec(text);
  if (meterShort) {
    const meters = Number(meterShort[1]);
    const tail = meterShort[2];
    const cmTail = tail.length === 1 ? Number(tail) * 10 : Number(tail);
    const cm = meters * 100 + cmTail;
    if (isPlausibleHeight(cm)) return cm;
  }

  // 2) "1.60m", "1,6m"
  const meterDecimal = /(?<!\d)([12][.,]\d{1,2})\s*(?:m|mét|met)(?!\p{L})/iu.exec(text);
  if (meterDecimal) {
    const cm = Math.round(parseLocaleDecimal(meterDecimal[1]) * 100);
    if (isPlausibleHeight(cm)) return cm;
  }

  // 3) "160cm", "160 cm", "height_cm=160", "chiều cao: 160", "cao 160"
  const cmUnit = /(?<!\d)(\d{3}(?:[.,]\d+)?)\s*cm(?!\p{L})/iu.exec(text);
  if (cmUnit) {
    const cm = parseLocaleDecimal(cmUnit[1]);
    if (isPlausibleHeight(cm)) return cm;
  }

  const labeledHeight =
    /(?:chiều\s*cao|chieu\s*cao|(?<!\p{L})cao(?!\p{L})|height(?:_cm|cm)?)\s*[:=]?\s*(\d{3}(?:[.,]\d+)?)(?!\d)/iu.exec(
      text,
    );
  if (labeledHeight) {
    const cm = parseLocaleDecimal(labeledHeight[1]);
    if (isPlausibleHeight(cm)) return cm;
  }

  return null;
}

function extractWeightFromText(text: string): number | null {
  // 1) "50kg", "50 kg", "50.5kg", "50 ký", "50 kí", "50 ki"
  const kgUnit = /(?<!\d)(\d{2,3}(?:[.,]\d+)?)\s*(?:kg|ký|kí|ki)(?!\p{L})/iu.exec(text);
  if (kgUnit) {
    const kg = parseLocaleDecimal(kgUnit[1]);
    if (isPlausibleWeight(kg)) return kg;
  }

  // 2) "cân nặng: 50", "nặng 50", "weight=50", "weight_kg=50"
  const labeledWeight =
    /(?:cân\s*nặng|can\s*nang|(?<!\p{L})nặng(?!\p{L})|(?<!\p{L})nang(?!\p{L})|weight(?:_kg|kg)?)\s*[:=]?\s*(\d{2,3}(?:[.,]\d+)?)(?!\d)/iu.exec(
      text,
    );
  if (labeledWeight) {
    const kg = parseLocaleDecimal(labeledWeight[1]);
    if (isPlausibleWeight(kg)) return kg;
  }

  return null;
}

function mergeStructuredMeasurements(
  target: {
    heightCm: number | null;
    weightKg: number | null;
    size: string | null;
    category: string | null;
    chartRowLabel: string | null;
  },
  source: ParsedMeasurements | null | undefined,
): void {
  if (!source) return;
  if (target.heightCm === null && source.heightCm !== null) {
    target.heightCm = source.heightCm;
  }
  if (target.weightKg === null && source.weightKg !== null) {
    target.weightKg = source.weightKg;
  }
  if (target.size === null && source.size !== null) {
    target.size = source.size;
  }
  if (target.category === null && source.category !== null) {
    target.category = source.category;
  }
  if (target.chartRowLabel === null && source.chartRowLabel !== null) {
    target.chartRowLabel = source.chartRowLabel;
  }
}

/**
 * Extracts parsed customer height/weight measurements (and matched chart row
 * metadata when provided) from an `AgentRun`.
 *
 * Checks structured optional fields on the run and its steps first, then falls
 * back to parsing explicit height/weight tokens from step details so both
 * structured and detail-text backend formats render cleanly.
 */
export function extractTraceMeasurements(
  run: Pick<AgentRun, "steps" | "parsedMeasurements" | "measurements"> | null | undefined,
): TraceMeasurementsSummary | null {
  if (!run) return null;

  const acc: {
    heightCm: number | null;
    weightKg: number | null;
    size: string | null;
    category: string | null;
    chartRowLabel: string | null;
  } = {
    heightCm: null,
    weightKg: null,
    size: null,
    category: null,
    chartRowLabel: null,
  };

  mergeStructuredMeasurements(acc, run.parsedMeasurements);
  mergeStructuredMeasurements(acc, run.measurements);

  for (const step of run.steps) {
    mergeStructuredMeasurements(acc, step.parsedMeasurements);
    mergeStructuredMeasurements(acc, step.measurements);
    mergeStructuredMeasurements(acc, step.data);
  }

  // Fallback: inspect step detail text (prioritizing measurement/size steps first)
  if (acc.heightCm === null || acc.weightKg === null) {
    // Only measurement/size steps: other steps' free text ("AI đã soạn nháp (122 ký tự)")
    // must never be read as a measurement.
    const prioritizedSteps = run.steps.filter((step) => MEASUREMENT_STEP_KEYS.has(step.key));
    for (const step of prioritizedSteps) {
      const detail = step.detail?.trim() ?? "";
      if (detail.length === 0) continue;
      if (acc.heightCm === null) {
        acc.heightCm = extractHeightFromText(detail);
      }
      if (acc.weightKg === null) {
        acc.weightKg = extractWeightFromText(detail);
      }
      if (acc.heightCm !== null && acc.weightKg !== null) break;
    }
  }

  if (
    acc.heightCm === null &&
    acc.weightKg === null &&
    acc.size === null &&
    acc.chartRowLabel === null
  ) {
    return null;
  }

  return acc;
}

function formatMeasurementNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(value).replace(".", ",");
}

export function formatTraceMeasurementTokens(
  summary: TraceMeasurementsSummary,
): readonly string[] {
  const tokens: string[] = [];
  if (summary.heightCm !== null) {
    tokens.push(`Cao ${formatMeasurementNumber(summary.heightCm)} cm`);
  }
  if (summary.weightKg !== null) {
    tokens.push(`Nặng ${formatMeasurementNumber(summary.weightKg)} kg`);
  }
  if (summary.size !== null) {
    tokens.push(`Gợi ý size ${summary.size}`);
  }
  if (summary.category !== null) {
    tokens.push(`Bảng size: ${summary.category}`);
  }
  return tokens;
}
