"use client";

import {
  ChatMessage,
  ChatMessageBubble,
  HStack,
  Stack,
  Text,
} from "@astryxdesign/core";
import { Bot } from "lucide-react";

import {
  AGENT_RUN_TYPING_LABEL,
} from "@/ui/components/inbox/agent-run-state";
import { AgentRunStepsList } from "@/ui/components/inbox/AgentRunTrace";
import type { AgentRun } from "@/ui/schemas/inbox.schema";

import "./inbox-surface.css";

export interface AgentTypingBubbleProps {
  readonly agentRun: AgentRun;
  readonly channelName: string;
}

/**
 * Live typing indicator bubble rendered at the end of the chat stream while
 * `thread.agentRun.status === "running"`.
 *
 * - Displays "AI đang soạn trả lời…" with 3 animated dots (disabled under
 *   `prefers-reduced-motion: reduce`).
 * - Streams committed pipeline steps as each 2 s poll returns them.
 * - Deliberately omits `aria-live` on this visual bubble so step updates never
 *   spam assistive technology; `ChatThreadPane` announces "AI đang soạn trả lời"
 *   once per `agentRun.id` via Astryx's polite `useAnnounce` live region.
 */
export function AgentTypingBubble({
  agentRun,
  channelName,
}: AgentTypingBubbleProps) {
  const senderLabel = channelName.trim() ? `${channelName.trim()} · Trợ lý AI` : "Trợ lý AI";

  return (
    <Stack
      direction="vertical"
      gap={1}
      padding={0}
      className="inbox-message-item"
      data-inbox="agent-typing-bubble"
      data-agent-run-id={agentRun.id}
    >
      <ChatMessage sender="user" density="balanced">
        <ChatMessageBubble
          className="inbox-bubble-typing"
          name={
            <HStack gap={1.5} align="center" justify="end" wrap="wrap">
              <Bot
                className="size-4 shrink-0 inbox-accent-icon"
                aria-hidden="true"
              />
              <Text
                type="supporting"
                size="xsm"
                weight="medium"
                color="inherit"
                className="inbox-sender-name"
              >
                {senderLabel}
              </Text>
            </HStack>
          }
        >
          <Stack direction="vertical" gap={2} className="min-w-0">
            <HStack gap={2} align="center" className="min-w-0">
              <span
                className="inbox-typing-dots"
                aria-hidden="true"
                data-inbox="typing-dots"
              >
                <span className="inbox-typing-dot" />
                <span className="inbox-typing-dot" />
                <span className="inbox-typing-dot" />
              </span>
              <Text type="label" color="primary" className="break-words">
                {AGENT_RUN_TYPING_LABEL}
              </Text>
            </HStack>

            {agentRun.steps.length > 0 ? (
              <div className="inbox-typing-steps min-w-0">
                <AgentRunStepsList
                  steps={agentRun.steps}
                  outcome={agentRun.outcome}
                  ariaLabel="Các bước AI đang xử lý"
                />
              </div>
            ) : null}
          </Stack>
        </ChatMessageBubble>
      </ChatMessage>
    </Stack>
  );
}
