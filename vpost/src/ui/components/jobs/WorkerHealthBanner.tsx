"use client";

import { AlertTriangle, Info } from "lucide-react";

import { Button } from "@/ui/components/ui/button";
import { cn } from "@/shared/utils";

import type { WorkerHealthNotice, WorkerHealthTone } from "./present-worker-health";

/**
 * The banner that breaks the silence on /jobs: it says nothing at all while the
 * publish machine is healthy, and three different things when it is not.
 *
 * Presentational — it neither fetches nor decides. `presentWorkerHealth` owns
 * the decision (and is tested on its own), which is what keeps "khi nào KHÔNG
 * hiện banner" provable.
 *
 * It sits in the normal flow above the filter bar: it must be the first thing
 * read, without covering the log or replacing any of the screen's four states.
 */

const TONE_STYLES: Record<WorkerHealthTone, string> = {
  // Posts are stuck right now.
  critical: "border-destructive/40 bg-destructive/10 text-destructive",
  // Something is wrong but nothing is lost yet.
  warning: "border-warning/40 bg-warning/10 text-warning-foreground",
  // We could not take the reading; the log itself is unaffected.
  muted: "border-border bg-muted/50 text-muted-foreground",
};

export function WorkerHealthBanner({
  notice,
  onRecheck,
  isChecking = false,
  className,
}: {
  /** null = healthy, or nothing known yet. Renders nothing. */
  notice: WorkerHealthNotice | null;
  onRecheck?: () => void;
  isChecking?: boolean;
  className?: string;
}) {
  if (!notice) return null;

  const Icon = notice.tone === "muted" ? Info : AlertTriangle;

  return (
    <div
      data-notice-kind={notice.kind}
      // Only the "posts are stuck" case interrupts a screen reader mid-task;
      // the softer ones are announced politely (web-feedback-states rule 4).
      role={notice.tone === "critical" ? "alert" : "status"}
      aria-live={notice.tone === "critical" ? "assertive" : "polite"}
      className={cn(
        "flex flex-wrap items-start justify-between gap-3 rounded-xl border p-4 text-sm transition-colors duration-150 ease-out",
        TONE_STYLES[notice.tone],
        className,
      )}
    >
      <div className="flex min-w-0 max-w-prose items-start gap-3">
        <Icon aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
        <div className="min-w-0 space-y-1">
          <p className="font-semibold">{notice.title}</p>
          <p className="leading-relaxed">{notice.description}</p>
          <p className="font-medium">{notice.action}</p>
        </div>
      </div>

      {onRecheck ? (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={onRecheck}
          disabled={isChecking}
          className="min-h-10 shrink-0 px-3 sm:min-h-8"
        >
          {isChecking ? "Đang kiểm tra…" : "Kiểm tra lại"}
        </Button>
      ) : null}
    </div>
  );
}
