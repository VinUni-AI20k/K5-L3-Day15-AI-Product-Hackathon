"use client";

import { Heading, Stack, Text } from "@astryxdesign/core";
import { CheckCircle2, Inbox, MessageSquare, SearchX } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/shared/utils";
import type { EmptyKind } from "@/ui/components/feedback/EmptyState";

import "./inbox-surface.css";

function defaultIconForKind(kind: EmptyKind): ReactNode {
  switch (kind) {
    case "first-run":
      return <Inbox className="size-5" aria-hidden="true" />;
    case "done":
      return <CheckCircle2 className="size-5" aria-hidden="true" />;
    case "no-result":
      return <SearchX className="size-5" aria-hidden="true" />;
    case "idle":
      return <MessageSquare className="size-5" aria-hidden="true" />;
  }
}

export interface InboxEmptyStateProps {
  readonly kind: EmptyKind;
  readonly title: string;
  readonly description: ReactNode;
  readonly action?: ReactNode;
  readonly icon?: ReactNode;
  readonly isCompact?: boolean;
  readonly className?: string;
}

/**
 * Empty state for the comment inbox and moderation dialogs:
 * accent-tinted icon tile + clear title + one concise sentence + optional action.
 * Preserves `data-empty-kind` for semantic state distinctions and tests.
 */
export function InboxEmptyState({
  kind,
  title,
  description,
  action,
  icon,
  isCompact = false,
  className,
}: InboxEmptyStateProps) {
  return (
    <div
      data-empty-kind={kind}
      data-compact={isCompact ? "true" : undefined}
      className={cn("inbox-empty-state", className)}
    >
      <div className="inbox-empty-icon-tile" aria-hidden="true">
        {icon ?? defaultIconForKind(kind)}
      </div>

      <Stack direction="vertical" gap={1} align="center">
        <Heading level={isCompact ? 4 : 3}>{title}</Heading>
        <Text type="supporting" color="secondary" className="max-w-prose">
          {description}
        </Text>
      </Stack>

      {action ? (
        <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
          {action}
        </div>
      ) : null}
    </div>
  );
}
