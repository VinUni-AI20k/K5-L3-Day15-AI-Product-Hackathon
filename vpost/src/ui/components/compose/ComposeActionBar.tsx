"use client";

import { CalendarClock, Info } from "lucide-react";
import { useId } from "react";

import { cn } from "@/shared/utils";

/**
 * The action row of the compose screen:
 *
 *   [Đăng ngay]  [Hẹn lịch]   (note / disabled reason right beside)
 *
 * One ink primary action, one muted secondary action, and the sentence
 * explaining either what will happen or why publishing is currently waiting.
 */
export function ComposeActionBar({
  onPublishNow,
  onSchedule,
  primaryDisabled,
  note,
  busy,
  readOnlyReason,
}: {
  onPublishNow: () => void;
  onSchedule: () => void;
  primaryDisabled: boolean;
  note: string;
  busy: boolean;
  /**
   * Support mode (M3.3): every write answers 403, so both write actions are
   * disabled and the reason is already in `note`.
   */
  readOnlyReason?: string | null;
}) {
  const noteId = useId();
  const blocked = Boolean(readOnlyReason);
  const isDisabled = primaryDisabled || blocked;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-2.5">
        {/* Nút Đăng ngay (Primary — single ink CTA of the compose screen) */}
        <button
          type="button"
          onClick={onPublishNow}
          disabled={primaryDisabled || blocked}
          aria-busy={busy}
          aria-describedby={noteId}
          title={readOnlyReason ?? undefined}
          className={cn(
            "bg-primary text-primary-foreground focus-visible:ring-ring focus-visible:ring-offset-background inline-flex h-11 min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg px-5 text-sm font-medium shadow-[var(--shadow-button)] transition-colors duration-150 outline-none hover:bg-[var(--button-primary-hover-bg)] focus-visible:ring-2 focus-visible:ring-offset-2 active:bg-[var(--button-primary-pressed-bg)]",
            "disabled:cursor-not-allowed disabled:opacity-40",
          )}
        >
          <span>Đăng ngay</span>
        </button>

        {/* Nút Hẹn lịch (Secondary — muted surface) */}
        <button
          type="button"
          onClick={onSchedule}
          disabled={primaryDisabled || blocked}
          aria-busy={busy}
          aria-describedby={noteId}
          title={readOnlyReason ?? "Mở bảng chọn ngày giờ hẹn đăng"}
          className={cn(
            "border-border bg-secondary text-secondary-foreground hover:bg-muted focus-visible:ring-ring focus-visible:ring-offset-background inline-flex h-11 min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border px-4 text-sm font-medium transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-offset-2 active:bg-[var(--color-overlay-pressed)]",
            "disabled:cursor-not-allowed disabled:opacity-40",
          )}
        >
          <CalendarClock className="size-4 shrink-0" aria-hidden="true" />
          <span>Hẹn lịch</span>
        </button>
      </div>

      {/* Status / disabled explanation right beside the action pair */}
      <p
        id={noteId}
        className={cn(
          "inline-flex items-center gap-1.5 text-sm leading-snug",
          isDisabled ? "text-muted-foreground" : "text-foreground font-medium",
        )}
      >
        {isDisabled ? (
          <Info className="text-foreground-subtle size-4 shrink-0" aria-hidden="true" />
        ) : null}
        <span>{note}</span>
      </p>
    </div>
  );
}

