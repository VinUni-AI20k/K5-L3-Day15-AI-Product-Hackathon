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
  VisuallyHidden,
} from "@astryxdesign/core";
import { MessageSquare, Sparkles } from "lucide-react";

import { InboxCustomerAvatar } from "@/ui/components/inbox/InboxCustomerAvatar";
import {
  displayCommentAuthor,
  formatCommentAbsoluteTime,
  formatCommentRelativeTime,
  formatThreadAccessibleContext,
  formatThreadLastMessageExcerpt,
  type InboxThread,
} from "@/ui/schemas/inbox.schema";

import "./inbox-surface.css";

const MAX_VISIBLE_TAGS = 2;

export interface ConversationListItemProps {
  readonly thread: InboxThread;
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
 * from Page), relative time, unread dot + count, needs-reply indicator,
 * comment type icon, up to 2 colored tag pills + "+N", and AI-draft-ready marker.
 */
export function ConversationListItem({
  thread,
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
  const customerName = displayCommentAuthor(thread.customer.name);
  const excerpt = formatThreadLastMessageExcerpt(thread.lastMessage);
  const accessibleContext = formatThreadAccessibleContext(thread);
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
      data-selected={isSelected ? "true" : "false"}
    >
      <Item
        as="div"
        align="start"
        density="balanced"
        isSelected={isSelected}
        className="inbox-thread-item"
        onClick={() => onSelect(thread.id)}
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
              name={customerName}
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
