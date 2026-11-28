"use client";

import { X } from "lucide-react";
import { useId } from "react";

import { cn } from "@/shared/utils";
import { ScheduleTimeField } from "@/ui/components/scheduled/ScheduleTimeField";
import { useNowMs } from "@/ui/hooks/useNowMs";
import type { ScheduleChoice } from "@/ui/hooks/useScheduleChoice";

/**
 * "Đăng ngay" / "Hẹn giờ đăng" (E8.1 UI) — one control, used by the compose
 * wizard (step 3) and by the bulk screen (core-component-reuse).
 *
 * Radios, not a switch: two named options make the default visible. "Đăng ngay"
 * is preselected, and the scheduled branch only appears once it is chosen —
 * nothing on screen while it is irrelevant.
 */
export function SchedulePicker({
  choice,
  disabled,
  disabledReason,
  scopeNote,
  hideModeChoice = false,
}: {
  choice: ScheduleChoice;
  disabled?: boolean;
  /**
   * WHY the control is locked, forwarded to the time field. Only THIS screen
   * knows — "đang chạy lô" and "chế độ hỗ trợ chỉ được xem" are both `disabled`
   * here but are not the same sentence to an operator.
   */
  disabledReason?: string;
  /** What "mọi kênh" means on this screen (one post vs a whole run). */
  scopeNote: string;
  /**
   * Drops the two radios and keeps the time fields.
   */
  hideModeChoice?: boolean;
}) {
  const groupId = useId();
  const fieldId = `${groupId}-at`;
  const nowMs = useNowMs();

  return (
    <fieldset className="flex flex-col gap-3" aria-describedby={`${groupId}-hint`}>
      <legend className="text-foreground text-sm font-medium">Thời điểm đăng</legend>
      <p id={`${groupId}-hint`} className="text-muted-foreground text-xs leading-relaxed">
        {scopeNote}
      </p>

      {(hideModeChoice ? [] : MODE_OPTIONS).map((option) => (
        <label
          key={option.mode}
          className={cn(
            "bg-card border-border hover:bg-[var(--bg-subtle)] has-checked:border-ring has-checked:bg-accent/60 has-checked:ring-ring flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition-colors duration-150 has-checked:ring-1",
            "has-focus-visible:ring-ring has-focus-visible:ring-2",
            disabled && "cursor-not-allowed opacity-40",
          )}
        >
          <input
            type="radio"
            name={groupId}
            value={option.mode}
            className="peer sr-only"
            checked={choice.mode === option.mode}
            disabled={disabled}
            onChange={() => choice.setMode(option.mode)}
          />
          <span
            aria-hidden="true"
            className="border-input peer-checked:border-ring peer-checked:bg-ring mt-0.5 size-4 shrink-0 rounded-full border-2 transition-colors duration-150"
          />
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="text-foreground text-sm font-medium">{option.label}</span>
            <span className="text-muted-foreground text-xs leading-relaxed">{option.hint}</span>
          </span>
        </label>
      ))}

      {choice.mode === "scheduled" ? (
        <div className="border-border bg-[var(--bg-subtle)] flex flex-col gap-3.5 rounded-xl border p-4">
          <div className="border-border flex items-center justify-between gap-2 border-b pb-2.5">
            <span className="text-foreground text-sm font-medium">Cài đặt giờ hẹn đăng</span>
            <button
              type="button"
              onClick={() => choice.setMode("now")}
              className="text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-ring inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-colors duration-150 outline-none focus-visible:ring-2"
            >
              <X className="size-4 shrink-0" aria-hidden="true" />
              <span>Đóng</span>
            </button>
          </div>
          <ScheduleTimeField
            id={fieldId}
            label="Chọn ngày & giờ hẹn đăng"
            value={choice.value}
            onChange={choice.setValue}
            disabled={disabled}
            disabledReason={disabledReason}
            error={choice.error}
            nowMs={nowMs}
          />
        </div>
      ) : null}
    </fieldset>
  );
}

/** The two branches, named. Radios, not a switch: the default stays visible. */
const MODE_OPTIONS = [
  {
    mode: "now" as const,
    label: "Đăng ngay",
    hint: "Bài vào hàng đợi ngay khi tạo lô; các kênh vẫn được đăng giãn cách theo cấu hình.",
  },
  {
    mode: "scheduled" as const,
    label: "Hẹn giờ đăng",
    hint: "Bài chờ tới giờ đã hẹn. Trước khi tới giờ vẫn đổi giờ hoặc huỷ được ở màn “Bài đã hẹn”.",
  },
] as const;
