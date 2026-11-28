"use client";

import {
  Button,
  ChatMessage,
  ChatMessageBubble,
  HStack,
  Link,
  Stack,
  StatusDot,
  Text,
  Token,
  VisuallyHidden,
} from "@astryxdesign/core";
import { Bot, Eye, EyeOff, RotateCw, ThumbsUp } from "lucide-react";

import { cn } from "@/shared/utils";
import { CommentErrorNotice } from "@/ui/components/comments/CommentErrorNotice";
import { ModerationBadge } from "@/ui/components/comments/moderation/ModerationBadge";
import { AgentRunTrace } from "@/ui/components/inbox/AgentRunTrace";
import {
  formatInboxCustomerName,
  isAnonymousCustomerName,
} from "@/ui/components/inbox/inbox-customer-label";
import {
  INBOX_DELIVERY_LABELS,
  INBOX_HIDDEN_MESSAGE_NOTE,
  formatCommentAbsoluteTime,
  formatCommentRelativeTime,
  toSafeFacebookUrl,
  type AgentRun,
  type InboxMessage,
} from "@/ui/schemas/inbox.schema";

import "./inbox-surface.css";

export interface ChatMessageItemProps {
  readonly message: InboxMessage;
  readonly channelName: string;
  readonly threadFirstMessageAt?: string | null;
  readonly nowMs: number;
  readonly readOnlyReason: string | null;
  readonly isCoarsePointer: boolean;
  readonly isLiking: boolean;
  readonly isHiding: boolean;
  readonly actionError?: unknown;
  readonly matchedAgentRun?: AgentRun | null;
  readonly isAgentTraceExpanded?: boolean;
  readonly isLoadingAgentRuns?: boolean;
  readonly agentRunsError?: unknown;
  readonly onToggleLike: (message: InboxMessage) => void;
  readonly onToggleHide: (message: InboxMessage) => void;
  readonly onRetrySend: (message: InboxMessage) => void;
  readonly onToggleAgentTrace?: (messageId: string) => void;
  readonly onRetryAgentRuns?: () => void;
}

/**
 * Semantic list item for a single message bubble inside a conversation thread.
 * - Customer messages align left; Page messages align right.
 * - Every message states the sender explicitly for screen readers (not only via position/color).
 * - Hidden messages are dimmed with the Vietnamese visibility note.
 * - Per-message actions (Thích/Bỏ thích, Ẩn/Hiện lại, Xem trên Facebook) appear on hover AND keyboard focus.
 * - Page messages render delivery status (Đang gửi / Đã gửi / Gửi lỗi + Thử lại).
 */
export function ChatMessageItem({
  message,
  channelName,
  threadFirstMessageAt,
  nowMs,
  readOnlyReason,
  isCoarsePointer,
  isLiking,
  isHiding,
  actionError,
  matchedAgentRun = null,
  isAgentTraceExpanded = false,
  isLoadingAgentRuns = false,
  agentRunsError,
  onToggleLike,
  onToggleHide,
  onRetrySend,
  onToggleAgentTrace,
  onRetryAgentRuns,
}: ChatMessageItemProps) {
  const isAnonymousSender =
    !message.fromPage && isAnonymousCustomerName(message.fromName);
  const senderDisplayName = message.fromPage
    ? channelName.trim() || "Fanpage"
    : formatInboxCustomerName(
        message.fromName,
        threadFirstMessageAt ?? message.createdAt,
      );

  const isAutoReplied = message.fromPage && message.sentBy === "auto";

  const screenReaderSenderPrefix = message.fromPage
    ? isAutoReplied
      ? `Trang ${senderDisplayName} (Tự động trả lời): `
      : `Trang ${senderDisplayName} (Bạn): `
    : isAnonymousSender
      ? `${senderDisplayName}: `
      : `Khách hàng ${senderDisplayName}: `;

  const relativeTime = formatCommentRelativeTime(message.createdAt, nowMs);
  const absoluteTime = formatCommentAbsoluteTime(message.createdAt);
  const safePermalinkUrl = toSafeFacebookUrl(message.permalinkUrl);
  const isPersisted = message.delivery === "sent";
  const isPersistedCustomerMessage = isPersisted && !message.fromPage;
  const isFailed = message.fromPage && message.delivery === "failed";
  const isSending = message.fromPage && message.delivery === "sending";

  const canMutateMessage = isPersistedCustomerMessage && readOnlyReason === null;
  const excerptForAria =
    message.text.replace(/\s+/g, " ").trim().slice(0, 32) || "tin nhắn";

  const actionsClassName = cn(
    "inbox-message-actions",
    isCoarsePointer
      ? "opacity-100"
      : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-within:opacity-100",
  );
  const metaJustify = message.fromPage ? "end" : "start";

  return (
    <Stack
      as="li"
      role="listitem"
      direction="vertical"
      gap={1}
      padding={0}
      className="group inbox-message-item"
      data-message-id={message.id}
      data-message-sender={message.fromPage ? "page" : "customer"}
      data-message-sent-by={message.sentBy ?? undefined}
      data-message-delivery={message.delivery}
      data-message-hidden={message.isHidden ? "true" : "false"}
      data-client-id={message.clientId ?? undefined}
      data-agent-run-id={message.agentRunId ?? undefined}
    >
      <ChatMessage
        sender={message.fromPage ? "user" : "assistant"}
        density="balanced"
      >
        <ChatMessageBubble
          className={cn(
            message.fromPage ? "inbox-bubble-page" : "inbox-bubble-customer",
            message.isHidden && "opacity-60",
          )}
          name={
            <HStack gap={1.5} align="center" justify={metaJustify} wrap="wrap">
              <Text
                type="supporting"
                size="xsm"
                weight="medium"
                color="inherit"
                className="inbox-sender-name"
              >
                <VisuallyHidden>{screenReaderSenderPrefix}</VisuallyHidden>
                {message.fromPage ? `${senderDisplayName} (Bạn)` : senderDisplayName}
              </Text>
              {isAutoReplied ? (
                <Token
                  label="Tự động trả lời"
                  icon={<Bot className="size-4" aria-hidden="true" />}
                  color="purple"
                  size="sm"
                  data-message-auto-reply="true"
                />
              ) : null}
              {message.likedByPage ? (
                <Token
                  label="Đã thích"
                  icon={<ThumbsUp className="size-4" aria-hidden="true" />}
                  color="blue"
                  size="sm"
                />
              ) : null}
              <ModerationBadge moderation={message.moderation} />
            </HStack>
          }
          metadata={
            <Stack direction="vertical" gap={1}>
              <HStack gap={2} align="center" justify={metaJustify} wrap="wrap">
                <Text
                  type="supporting"
                  size="xsm"
                  color="inherit"
                  className="inbox-meta-text"
                  hasTabularNumbers
                >
                  <time dateTime={message.createdAt} title={absoluteTime}>
                    {relativeTime ? `${relativeTime} · ${absoluteTime}` : absoluteTime}
                  </time>
                </Text>

                {message.fromPage ? (
                  <HStack gap={1} align="center">
                    {isSending ? (
                      <StatusDot
                        variant="accent"
                        label={INBOX_DELIVERY_LABELS.sending}
                        isPulsing
                        aria-hidden="true"
                      />
                    ) : isFailed ? (
                      <StatusDot
                        variant="error"
                        label={INBOX_DELIVERY_LABELS.failed}
                        aria-hidden="true"
                      />
                    ) : null}
                    <Text
                      type="supporting"
                      size="xsm"
                      color="inherit"
                      className={cn(
                        isFailed ? "text-destructive font-medium" : "inbox-meta-text",
                      )}
                    >
                      {INBOX_DELIVERY_LABELS[message.delivery]}
                    </Text>
                  </HStack>
                ) : null}
              </HStack>

              {message.isHidden ? (
                <Text
                  type="supporting"
                  size="xsm"
                  color="inherit"
                  className="inbox-meta-text"
                >
                  {INBOX_HIDDEN_MESSAGE_NOTE}
                </Text>
              ) : null}

              {/* Failed send inline error + Retry reusing the same clientId */}
              {isFailed ? (
                <HStack
                  gap={2}
                  align="center"
                  justify={metaJustify}
                  wrap="wrap"
                  role="alert"
                >
                  <Text
                    type="supporting"
                    size="xsm"
                    color="inherit"
                    className="text-destructive font-medium"
                  >
                    {message.userMessage?.trim() ||
                      "Gửi bình luận lên Facebook thất bại."}
                  </Text>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="inbox-touch-target"
                    icon={<RotateCw className="size-4" aria-hidden="true" />}
                    label={`Thử lại gửi “${excerptForAria}”`}
                    isDisabled={readOnlyReason !== null}
                    tooltip={readOnlyReason ?? undefined}
                    onClick={() => onRetrySend(message)}
                  >
                    Thử lại
                  </Button>
                </HStack>
              ) : null}

              {/* Per-message actions: visible on hover AND keyboard focus */}
              {isPersistedCustomerMessage || safePermalinkUrl ? (
                <HStack
                  gap={1.5}
                  align="center"
                  justify={metaJustify}
                  wrap="wrap"
                  className={actionsClassName}
                  data-message-actions="true"
                >
                  {isPersistedCustomerMessage ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="inbox-touch-target"
                      icon={<ThumbsUp className="size-4" aria-hidden="true" />}
                      label={`${message.likedByPage ? "Bỏ thích" : "Thích"} bình luận “${excerptForAria}”`}
                      isLoading={isLiking}
                      isDisabled={!canMutateMessage || isLiking}
                      tooltip={readOnlyReason ?? undefined}
                      onClick={() => onToggleLike(message)}
                    >
                      {message.likedByPage ? "Bỏ thích" : "Thích"}
                    </Button>
                  ) : null}

                  {isPersistedCustomerMessage ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="inbox-touch-target"
                      icon={
                        message.isHidden ? (
                          <Eye className="size-4" aria-hidden="true" />
                        ) : (
                          <EyeOff className="size-4" aria-hidden="true" />
                        )
                      }
                      label={`${message.isHidden ? "Hiện lại" : "Ẩn"} bình luận “${excerptForAria}”`}
                      isLoading={isHiding}
                      isDisabled={!canMutateMessage || isHiding}
                      tooltip={readOnlyReason ?? undefined}
                      onClick={() => onToggleHide(message)}
                    >
                      {message.isHidden ? "Hiện lại" : "Ẩn"}
                    </Button>
                  ) : null}

                  {safePermalinkUrl ? (
                    <Link
                      href={safePermalinkUrl}
                      isExternalLink
                      newTabLabel="(mở ở tab mới)"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inbox-subtle-link"
                    >
                      Xem trên Facebook
                      <VisuallyHidden> — {excerptForAria}</VisuallyHidden>
                    </Link>
                  ) : null}
                </HStack>
              ) : null}

              {actionError ? (
                <CommentErrorNotice
                  error={actionError}
                  shouldFocus={false}
                  titleOverride="Không thực hiện được thao tác trên bình luận"
                />
              ) : null}

              {message.agentRunId ? (
                <AgentRunTrace
                  agentRunId={message.agentRunId}
                  run={matchedAgentRun}
                  isExpanded={isAgentTraceExpanded}
                  isLoading={isLoadingAgentRuns}
                  error={agentRunsError}
                  align={metaJustify}
                  contextExcerpt={excerptForAria}
                  onToggle={() => onToggleAgentTrace?.(message.id)}
                  onRetry={onRetryAgentRuns}
                />
              ) : null}
            </Stack>
          }
        >
          {message.text.trim().length > 0 ? (
            <Text
              type="body"
              color="inherit"
              className="whitespace-pre-wrap break-words"
            >
              {message.text}
            </Text>
          ) : (
            <Text type="supporting" color="inherit" className="opacity-80">
              (Bình luận không có nội dung chữ — xem ảnh hoặc nhãn dán trên Facebook)
            </Text>
          )}
        </ChatMessageBubble>
      </ChatMessage>
    </Stack>
  );
}
