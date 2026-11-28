"use client";

import {
  Badge,
  Button,
  HStack,
  Stack,
  Text,
  VisuallyHidden,
} from "@astryxdesign/core";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Loader2,
  Minus,
  X,
} from "lucide-react";
import { useId } from "react";

import { cn } from "@/shared/utils";
import { CommentErrorNotice } from "@/ui/components/comments/CommentErrorNotice";
import {
  AGENT_RUN_KIND_LABELS,
  AGENT_RUN_OUTCOME_LABELS,
  AGENT_RUN_STEP_STATUS_LABELS,
  AGENT_RUN_TRACE_TOGGLE_LABEL,
  formatAgentStepLabel,
  formatAgentStepTime,
  resolveCanBanBlockingStepIndices,
} from "@/ui/components/inbox/agent-run-state";
import {
  formatCommentAbsoluteTime,
  type AgentRun,
  type AgentRunOutcome,
  type AgentRunStep,
  type AgentRunStepStatus,
} from "@/ui/schemas/inbox.schema";

import "./inbox-surface.css";

function renderStepStatusIcon(status: AgentRunStepStatus) {
  switch (status) {
    case "ok":
      return (
        <Check
          className="size-4 shrink-0 inbox-trace-icon-ok"
          aria-hidden="true"
        />
      );
    case "blocked":
      return (
        <X
          className="size-4 shrink-0 inbox-trace-icon-blocked"
          aria-hidden="true"
        />
      );
    case "error":
      return (
        <X
          className="size-4 shrink-0 inbox-trace-icon-error"
          aria-hidden="true"
        />
      );
    case "skipped":
      return (
        <Minus
          className="size-4 shrink-0 inbox-trace-icon-skipped"
          aria-hidden="true"
        />
      );
    case "running":
      return (
        <Loader2
          className="size-4 shrink-0 inbox-trace-icon-running"
          aria-hidden="true"
        />
      );
  }
}

function outcomeBadgeVariant(
  outcome: AgentRunOutcome | null,
  status: AgentRun["status"],
): "green" | "purple" | "red" | "gray" {
  if (status === "running") return "purple";
  switch (outcome) {
    case "sent":
    case "draft_saved":
      return "green";
    case "would_send":
      return "purple";
    case "can_ban":
    case "failed":
      return "red";
    default:
      return status === "error" ? "red" : "gray";
  }
}

export interface AgentRunStepsListProps {
  readonly steps: readonly AgentRunStep[];
  readonly outcome: AgentRunOutcome | null;
  readonly ariaLabel?: string;
}

/**
 * Semantic ordered list of pipeline steps for a single agent run.
 * Highlights the blocking step(s) when `outcome === "can_ban"`.
 */
export function AgentRunStepsList({
  steps,
  outcome,
  ariaLabel = "Các bước xử lý của AI",
}: AgentRunStepsListProps) {
  const blockingIndices = resolveCanBanBlockingStepIndices({ outcome, steps });

  return (
    <Stack
      as="ol"
      role="list"
      aria-label={ariaLabel}
      direction="vertical"
      gap={1.5}
      padding={0}
      className="inbox-trace-steps"
    >
      {steps.map((step, index) => {
        const isBlocking = blockingIndices.has(index);
        const label = formatAgentStepLabel(step);
        const detail = step.detail?.trim() ?? "";
        const timeText = formatAgentStepTime(step.at);
        const absoluteTime = formatCommentAbsoluteTime(step.at);

        return (
          <Stack
            key={`${step.key}-${index}`}
            as="li"
            role="listitem"
            direction="vertical"
            gap={0.5}
            padding={0}
            className="inbox-trace-step"
            data-step-key={step.key}
            data-step-status={step.status}
            data-step-blocking={isBlocking ? "true" : "false"}
          >
            <HStack gap={2} align="start" justify="between" className="min-w-0">
              <HStack gap={1.5} align="start" className="min-w-0 flex-1">
                <span className="inbox-trace-icon-slot">
                  {renderStepStatusIcon(step.status)}
                </span>
                <Stack direction="vertical" gap={0.5} className="min-w-0 flex-1">
                  <HStack gap={1.5} align="center" wrap="wrap" className="min-w-0">
                    <Text
                      type="supporting"
                      size="xsm"
                      weight="medium"
                      color="inherit"
                      className={cn(
                        "break-words",
                        isBlocking
                          ? "inbox-trace-blocking-label"
                          : "inbox-trace-step-label",
                      )}
                    >
                      <VisuallyHidden>
                        {`${AGENT_RUN_STEP_STATUS_LABELS[step.status]}: `}
                      </VisuallyHidden>
                      {label}
                    </Text>
                    {isBlocking ? (
                      <Badge
                        variant="red"
                        label="Cần bạn"
                        data-blocking-badge="true"
                      />
                    ) : null}
                  </HStack>

                  {detail.length > 0 ? (
                    <Text
                      type="supporting"
                      size="xsm"
                      color="inherit"
                      className={cn(
                        "whitespace-pre-wrap break-words",
                        isBlocking
                          ? "inbox-trace-blocking-detail"
                          : "inbox-trace-step-detail",
                      )}
                    >
                      {detail}
                    </Text>
                  ) : null}
                </Stack>
              </HStack>

              <Text
                type="supporting"
                size="xsm"
                color="inherit"
                className="inbox-meta-text shrink-0"
                hasTabularNumbers
              >
                <time dateTime={step.at} title={absoluteTime}>
                  {timeText}
                </time>
              </Text>
            </HStack>
          </Stack>
        );
      })}
    </Stack>
  );
}

export interface AgentRunTraceProps {
  readonly agentRunId: string;
  readonly run: AgentRun | null;
  readonly isExpanded: boolean;
  readonly isLoading: boolean;
  readonly error?: unknown;
  readonly align: "start" | "end";
  readonly contextExcerpt: string;
  readonly onToggle: () => void;
  readonly onRetry?: () => void;
}

/**
 * Collapsible "Xem quá trình xử lý" disclosure rendered under each bot-handled
 * message (bot-produced Page reply or bot-processed customer comment).
 * Collapsed by default; keyboard accessible via Astryx Button with `aria-expanded`.
 */
export function AgentRunTrace({
  agentRunId,
  run,
  isExpanded,
  isLoading,
  error,
  align,
  contextExcerpt,
  onToggle,
  onRetry,
}: AgentRunTraceProps) {
  const panelId = useId();
  const outcomeLabel =
    run === null
      ? null
      : run.status === "running"
        ? "Đang xử lý"
        : run.outcome !== null
          ? AGENT_RUN_OUTCOME_LABELS[run.outcome]
          : run.status === "error"
            ? "Lỗi"
            : "Hoàn tất";

  return (
    <Stack
      direction="vertical"
      gap={1.5}
      className={cn(
        "inbox-trace-root min-w-0",
        align === "end" ? "items-end" : "items-start",
      )}
      data-inbox="agent-trace"
      data-agent-run-id={agentRunId}
    >
      <HStack justify={align} align="center">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="inbox-trace-toggle inbox-touch-target"
          icon={
            isExpanded ? (
              <ChevronDown className="size-4" aria-hidden="true" />
            ) : (
              <ChevronRight className="size-4" aria-hidden="true" />
            )
          }
          label={`${AGENT_RUN_TRACE_TOGGLE_LABEL} — ${contextExcerpt}`}
          aria-expanded={isExpanded}
          aria-controls={isExpanded ? panelId : undefined}
          onClick={onToggle}
          data-inbox="agent-trace-toggle"
        >
          {AGENT_RUN_TRACE_TOGGLE_LABEL}
        </Button>
      </HStack>

      {isExpanded ? (
        <div
          id={panelId}
          className="inbox-trace-panel min-w-0 w-full"
          data-inbox="agent-trace-panel"
          data-agent-run-id={agentRunId}
          data-agent-run-outcome={run?.outcome ?? undefined}
        >
          {run ? (
            <Stack direction="vertical" gap={2} className="min-w-0">
              <HStack gap={2} align="center" justify="between" wrap="wrap">
                <Text
                  type="supporting"
                  size="xsm"
                  weight="medium"
                  color="secondary"
                >
                  {AGENT_RUN_KIND_LABELS[run.kind]}
                </Text>
                {outcomeLabel ? (
                  <Badge
                    variant={outcomeBadgeVariant(run.outcome, run.status)}
                    label={outcomeLabel}
                    data-agent-run-outcome-badge={run.outcome ?? run.status}
                  />
                ) : null}
              </HStack>

              {run.steps.length > 0 ? (
                <AgentRunStepsList steps={run.steps} outcome={run.outcome} />
              ) : (
                <Text type="supporting" size="xsm" color="secondary">
                  Chưa có bước xử lý nào được ghi nhận.
                </Text>
              )}
            </Stack>
          ) : isLoading ? (
            <HStack gap={2} align="center">
              <Loader2
                className="size-4 shrink-0 inbox-trace-icon-running"
                aria-hidden="true"
              />
              <Text type="supporting" size="xsm" color="secondary">
                Đang tải quá trình xử lý…
              </Text>
            </HStack>
          ) : error ? (
            <CommentErrorNotice
              error={error}
              shouldFocus={false}
              titleOverride="Không tải được quá trình xử lý"
              onRetry={onRetry}
            />
          ) : (
            <Text type="supporting" size="xsm" color="secondary">
              Không tìm thấy chi tiết xử lý (hệ thống chỉ lưu trong 7 ngày gần nhất).
            </Text>
          )}
        </div>
      ) : null}
    </Stack>
  );
}
