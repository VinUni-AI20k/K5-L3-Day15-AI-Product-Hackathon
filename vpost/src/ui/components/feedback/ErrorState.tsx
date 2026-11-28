"use client";

import { Button } from "@astryxdesign/core";
import { AlertCircle } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useRef } from "react";

import { cn } from "@/shared/utils";

export interface ErrorStateProps {
  title: string;
  /** What happened + why + what to do next. Vietnamese, no stack traces. */
  description: string;
  /** One line per reason when an error has several (e.g. video specs). */
  details?: readonly string[];
  /** Short reference shown to operators for support ("Mã: a91f..."). */
  referenceCode?: string;
  /** Omit to hide the retry button (403/404 — retrying is pointless). */
  onRetry?: () => void;
  retryLabel?: string;
  /** Extra action rendered next to retry (e.g. "Về trang chủ"). */
  secondaryAction?: ReactNode;
  /**
   * Whether to pull focus onto the message when it appears. Default `true`,
   * which is what every caller relied on before this prop existed.
   *
   * Set `false` for a message that is NOT the whole screen's answer — a notice
   * about one of several sources on a dashboard, for instance. Focus is a
   * single resource: two boundaries mounting together would fight over it, and
   * stealing it from someone mid-sentence is worse than staying put, since
   * `role="alert"` announces the text either way.
   */
  shouldFocus?: boolean;
  className?: string;
}

/**
 * Shared error block for route/segment/widget boundaries.
 * Presentational only: no fetching, no business branching.
 *
 * Follows the design system icon tile + sentence + one action pattern: calm surface,
 * semantic error icon tile, readable hierarchy, and keyboard-only focus ring so
 * programmatic focus never draws an unexpected border around the card on mount.
 */
export function ErrorState({
  title,
  description,
  details,
  referenceCode,
  onRetry,
  retryLabel = "Thử lại",
  secondaryAction,
  shouldFocus = true,
  className,
}: ErrorStateProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Move focus to the alert so keyboard/screen-reader users land on the message.
  //
  // `preventScroll`: the focus moves, the viewport does NOT. An error that is
  // already on screen when the page settles — a restored draft whose code no
  // longer exists, say — was dragging the scroll container down to itself, so
  // "Soạn bài" and the draft line were off screen before the operator had
  // touched anything. The message still announces (`role="alert"`) and still
  // holds focus, so the next Tab continues from here.
  useEffect(() => {
    if (!shouldFocus) return;
    containerRef.current?.focus({ preventScroll: true });
  }, [shouldFocus]);

  return (
    <div
      ref={containerRef}
      role="alert"
      tabIndex={-1}
      className={cn(
        "bg-card border-border focus-visible:ring-ring focus-visible:ring-offset-background flex flex-col gap-4 rounded-xl border p-5 outline-none focus-visible:ring-2 focus-visible:ring-offset-2 sm:flex-row sm:items-start sm:p-6",
        className,
      )}
    >
      <div
        aria-hidden="true"
        className="bg-destructive/10 text-destructive flex size-10 shrink-0 items-center justify-center rounded-lg"
      >
        <AlertCircle className="size-5" aria-hidden="true" />
      </div>

      <div className="min-w-0 flex-1 space-y-1.5">
        <p className="text-foreground text-base leading-6 font-semibold">{title}</p>
        <p className="text-muted-foreground max-w-prose text-sm leading-relaxed">{description}</p>

        {details && details.length > 0 ? (
          <ul className="text-muted-foreground mt-2 list-disc space-y-1 ps-5 text-sm leading-relaxed">
            {details.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        ) : null}

        {referenceCode ? (
          <p className="text-foreground-subtle pt-1 font-mono text-xs leading-4">
            Mã tham chiếu: {referenceCode}
          </p>
        ) : null}

        {onRetry || secondaryAction ? (
          <div className="flex flex-wrap items-center gap-2 pt-3">
            {onRetry ? (
              <Button
                type="button"
                variant="primary"
                size="md"
                label={retryLabel}
                onClick={onRetry}
              />
            ) : null}
            {secondaryAction}
          </div>
        ) : null}
      </div>
    </div>
  );
}
