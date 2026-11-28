import type {
  AgentRun,
  AgentRunKind,
  AgentRunOutcome,
  AgentRunStep,
  AgentRunStepStatus,
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
  facts: "Tra dữ liệu sản phẩm",
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
