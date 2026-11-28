"use client";

import {
  Badge,
  CheckboxInput,
  Divider,
  HStack,
  Item,
  Stack,
  StatusDot,
  Text,
  Token,
  Tooltip,
  VisuallyHidden,
} from "@astryxdesign/core";
import { AlertCircle, MessageSquare, Ruler, Sparkles } from "lucide-react";
import { useId, useState, type FocusEvent, type KeyboardEvent } from "react";

import { AGENT_RUN_ROW_INDICATOR_LABEL } from "@/ui/components/inbox/agent-run-state";
import {
  AWAITING_MEASUREMENTS_BADGE_LABEL,
  formatAwaitingMeasurementsTooltip,
  resolveAwaitingMeasurements,
} from "@/ui/components/inbox/auto-reply-state";
import {
  formatInboxCustomerName,
  formatInboxThreadAccessibleContext,
  isAnonymousCustomerName,
  resolveThreadFirstMessageAt,
} from "@/ui/components/inbox/inbox-customer-label";
import { InboxCustomerAvatar } from "@/ui/components/inbox/InboxCustomerAvatar";
import {
  formatCommentAbsoluteTime,
  formatCommentRelativeTime,
  formatThreadLastMessageExcerpt,
  type InboxThread,
} from "@/ui/schemas/inbox.schema";

import "./inbox-surface.css";

const MAX_VISIBLE_TAGS = 2;

export interface ConversationListItemProps {
  readonly thread: InboxThread;
  readonly firstMessageAt?: string | null;
  readonly nowMs: number;
  readonly isSelected: boolean;
  readonly isBulkMode: boolean;
  readonly isBulkSelected: boolean;
  readonly isBulkCheckboxDisabled?: boolean;
  readonly bulkDisabledReason?: string;
  readonly showDivider?: boolean;
  readonly onSelect: (threadId: string) => void;
  readonly onToggleBulkSelect: (threadId: string) => void;
}

/**
 * Single conversation row in the left inbox column.
 * Displays avatar initials, customer name, last message excerpt ("Bạn: " when
 * from Page), relative time, unread dot + count, highest-priority "Cần bạn"
 * attention badge (with reason exposed on hover, keyboard focus, and to screen
 * readers), needs-reply indicator, comment type icon, up to 2 colored tag pills
 * + "+N", and AI-draft-ready marker.
 */
export function ConversationListItem({
  thread,
  firstMessageAt,
  nowMs,
  isSelected,
  isBulkMode,
  isBulkSelected,
  isBulkCheckboxDisabled = false,
  bulkDisabledReason,
  showDivider = false,
  onSelect,
  onToggleBulkSelect,
}: ConversationListItemProps) {
  const attentionDescId = useId();
  const [isAttentionTooltipFocused, setIsAttentionTooltipFocused] = useState(false);

  const resolvedFirstMessageAt = firstMessageAt ?? resolveThreadFirstMessageAt(thread);
  const isAnonymous = isAnonymousCustomerName(thread.customer.name);
  const customerName = formatInboxCustomerName(
    thread.customer.name,
    resolvedFirstMessageAt,
  );
  const excerpt = formatThreadLastMessageExcerpt(thread.lastMessage);
  const accessibleContext = formatInboxThreadAccessibleContext(
    thread,
    resolvedFirstMessageAt,
  );
  const relativeTime = formatCommentRelativeTime(thread.updatedAt, nowMs);
  const absoluteTime = formatCommentAbsoluteTime(thread.updatedAt);

  const visibleTags = thread.customer.tags.slice(0, MAX_VISIBLE_TAGS);
  const overflowTagCount = Math.max(0, thread.customer.tags.length - MAX_VISIBLE_TAGS);

  const hasReadyDraft =
    thread.needsReply &&
    thread.draft !== null &&
    (thread.draft.status === "draft" || thread.draft.status === "flagged");
  const isDraftFlagged = thread.draft?.status === "flagged";

  const showUnreadBadge = thread.unread && thread.unreadCount > 0;
  const isAgentRunning = thread.agentRun?.status === "running";
  const awaitingMeasurements = resolveAwaitingMeasurements(thread, nowMs);
  const awaitingTooltip = awaitingMeasurements
    ? formatAwaitingMeasurementsTooltip(awaitingMeasurements)
    : null;

  const attention = thread.attention;
  const attentionReason = attention?.reason.trim() ?? "";
  const attentionLabel = attention
    ? attentionReason.length > 0
      ? `Cần bạn: ${attentionReason}`
      : "Cần bạn"
    : null;

  function handleRowFocus(event: FocusEvent<HTMLElement>) {
    if (!attention) return;
    try {
      if (event.target.matches(":focus-visible")) {
        setIsAttentionTooltipFocused(true);
      }
    } catch {
      setIsAttentionTooltipFocused(true);
    }
  }

  function handleRowBlur() {
    if (isAttentionTooltipFocused) {
      setIsAttentionTooltipFocused(false);
    }
  }

  function handleRowKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape" && isAttentionTooltipFocused) {
      setIsAttentionTooltipFocused(false);
    }
  }

  return (
    <Stack
      as="li"
      role="listitem"
      direction="vertical"
      gap={0}
      padding={0}
      className="inbox-thread-row"
      data-row="inbox-thread"
      data-thread-id={thread.id}
      data-unread={thread.unread ? "true" : "false"}
      data-needs-reply={thread.needsReply ? "true" : "false"}
      data-attention={attention ? attention.tag : "none"}
      data-attention-reason={attentionReason || undefined}
      data-awaiting-measurements={awaitingMeasurements ? "true" : "false"}
      data-agent-run-status={thread.agentRun?.status ?? "idle"}
      data-selected={isSelected ? "true" : "false"}
    >
      <Item
        as="div"
        align="start"
        density="balanced"
        isSelected={isSelected}
        className="inbox-thread-item"
        aria-describedby={attention ? attentionDescId : undefined}
        onClick={() => onSelect(thread.id)}
        onFocus={handleRowFocus}
        onBlur={handleRowBlur}
        onKeyDown={handleRowKeyDown}
        startContent={
          <HStack gap={2} align="center">
            {isBulkMode ? (
              <CheckboxInput
                label={`Chọn hội thoại của ${accessibleContext}`}
                isLabelHidden
                size="sm"
                value={isBulkSelected}
                isDisabled={isBulkCheckboxDisabled}
                disabledMessage={bulkDisabledReason}
                onChange={() => onToggleBulkSelect(thread.id)}
              />
            ) : null}
            <InboxCustomerAvatar
              customerId={thread.customer.id}
              threadId={thread.id}
              name={customerName}
              isAnonymous={isAnonymous}
              size="md"
            />
          </HStack>
        }
        label={
          <HStack gap={2} align="center" justify="between" className="min-w-0">
            <HStack gap={1.5} align="center" className="min-w-0">
              {thread.unread ? (
                <StatusDot
                  variant="accent"
                  label="Chưa đọc"
                  aria-hidden="true"
                />
              ) : null}
              <Text
                type="body"
                weight={thread.unread ? "semibold" : "medium"}
                maxLines={1}
                hasTruncateTooltip={false}
              >
                {customerName}
              </Text>
              {thread.unread ? (
                <VisuallyHidden>
                  {showUnreadBadge
                    ? ` (${thread.unreadCount} tin chưa đọc)`
                    : " (chưa đọc)"}
                </VisuallyHidden>
              ) : null}
            </HStack>

            <HStack gap={1} align="center" className="shrink-0">
              <MessageSquare
                className="size-4 shrink-0 inbox-meta-text"
                aria-hidden="true"
              />
              <VisuallyHidden>Bình luận</VisuallyHidden>
              <Text
                type="supporting"
                size="xsm"
                color="inherit"
                className="inbox-meta-text"
                hasTabularNumbers
              >
                <time dateTime={thread.updatedAt} title={absoluteTime}>
                  {relativeTime || absoluteTime}
                </time>
              </Text>
            </HStack>
          </HStack>
        }
        description={
          <Stack direction="vertical" gap={1.5} className="min-w-0">
            <HStack gap={2} align="center" justify="between" className="min-w-0">
              <Text
                type="supporting"
                color={thread.unread ? "primary" : "secondary"}
                weight={thread.unread ? "medium" : "normal"}
                maxLines={1}
                hasTruncateTooltip={false}
              >
                {excerpt}
              </Text>
              {showUnreadBadge ? (
                <Badge
                  variant="info"
                  label={thread.unreadCount}
                  className="tabular-nums"
                  aria-hidden="true"
                />
              ) : null}
            </HStack>

            <HStack gap={1.5} align="center" wrap="wrap">
              {attention && attentionLabel ? (
                <>
                  <Tooltip
                    content={attentionLabel}
                    placement="above"
                    focusTrigger="never"
                    isOpen={isAttentionTooltipFocused ? true : undefined}
                  >
                    <span className="inline-flex" title={attentionLabel}>
                      <Badge
                        variant="error"
                        icon={<AlertCircle className="size-4" aria-hidden="true" />}
                        label="Cần bạn"
                        data-attention-badge="can_ban"
                      />
                    </span>
                  </Tooltip>
                  <VisuallyHidden id={attentionDescId}>
                    {` — ${attentionLabel}`}
                  </VisuallyHidden>
                </>
              ) : null}

              {isAgentRunning ? (
                <span className="inline-flex" data-agent-run-indicator="running">
                  <Token
                    label={AGENT_RUN_ROW_INDICATOR_LABEL}
                    icon={
                      <StatusDot
                        variant="accent"
                        label={AGENT_RUN_ROW_INDICATOR_LABEL}
                        isPulsing
                        aria-hidden="true"
                      />
                    }
                    color="purple"
                    size="sm"
                  />
                </span>
              ) : null}

              {awaitingMeasurements && awaitingTooltip ? (
                <Tooltip content={awaitingTooltip} placement="above" focusTrigger="never">
                  <span className="inline-flex" title={awaitingTooltip}>
                    <Badge
                      variant="info"
                      icon={<Ruler className="size-4" aria-hidden="true" />}
                      label={AWAITING_MEASUREMENTS_BADGE_LABEL}
                      data-awaiting-measurements-badge="true"
                    />
                  </span>
                </Tooltip>
              ) : null}

              {thread.needsReply ? (
                <Token label="Cần trả lời" color="orange" size="sm" />
              ) : null}

              {thread.status === "ignored" ? (
                <Token label="Bỏ qua" color="gray" size="sm" />
              ) : null}

              {thread.isHidden ? (
                <Token label="Đã ẩn" color="gray" size="sm" />
              ) : null}

              {hasReadyDraft ? (
                <Token
                  label={isDraftFlagged ? "AI cần kiểm tra" : "Có nháp AI"}
                  icon={<Sparkles className="size-4" aria-hidden="true" />}
                  color={isDraftFlagged ? "orange" : "purple"}
                  size="sm"
                />
              ) : null}

              {visibleTags.map((tag) => (
                <Token
                  key={tag.id}
                  label={tag.name}
                  color={tag.color}
                  size="sm"
                />
              ))}

              {overflowTagCount > 0 ? (
                <Token
                  label={`+${overflowTagCount}`}
                  color="gray"
                  size="sm"
                />
              ) : null}
            </HStack>
          </Stack>
        }
      />
      {showDivider ? <Divider /> : null}
    </Stack>
  );
}
