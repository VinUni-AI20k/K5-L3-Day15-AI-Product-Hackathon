"use client";

import { AlertCircle, Flame, Moon, Sparkles, Sun, Utensils } from "lucide-react";

import { cn } from "@/shared/utils";
import { Input } from "@/ui/components/ui/input";
import {
  MAX_SCHEDULE_AHEAD_DAYS,
  formatCountdown,
  formatScheduledAt,
  scheduleInputBounds,
  timeZoneLabel,
  toDateTimeLocalValue,
  validateScheduleInput,
} from "@/ui/schemas/scheduled.schema";

export interface ScheduleTimeFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  disabledReason?: string;
  error?: string | null;
  nowMs: number;
}

const GOLDEN_HOURS = [
  { label: "08:00 (Sáng)", hour: 8, minute: 0, icon: Sun },
  { label: "11:30 (Trưa)", hour: 11, minute: 30, icon: Utensils },
  { label: "15:30 (Chiều)", hour: 15, minute: 30, icon: Sparkles },
  { label: "19:30 (Tối vàng)", hour: 19, minute: 30, icon: Flame },
  { label: "20:30 (Tối)", hour: 20, minute: 30, icon: Moon },
] as const;

const DAY_MS = 86_400_000;
const MIN_BUFFER_MS = 60_000;

function parseDateTimeLocal(raw: string): Date | null {
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Computes a valid local `datetime-local` value for a golden-hour shortcut.
 * Keeps the operator's chosen date when that slot is still in the future;
 * otherwise tries today's slot and rolls over to tomorrow if today's has passed.
 */
function resolveGoldenHourValue(
  selectedDate: Date | null,
  nowMs: number,
  slotHour: number,
  slotMinute: number,
): string {
  const referenceMs = nowMs > 0 ? nowMs : Date.now();
  const now = new Date(referenceMs);
  const baseDate = selectedDate ?? now;

  const candidate = new Date(
    baseDate.getFullYear(),
    baseDate.getMonth(),
    baseDate.getDate(),
    slotHour,
    slotMinute,
    0,
    0,
  );
  if (candidate.getTime() > referenceMs + MIN_BUFFER_MS) {
    return toDateTimeLocalValue(candidate);
  }

  const todaySlot = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    slotHour,
    slotMinute,
    0,
    0,
  );
  if (todaySlot.getTime() > referenceMs + MIN_BUFFER_MS) {
    return toDateTimeLocalValue(todaySlot);
  }

  const tomorrow = new Date(referenceMs + DAY_MS);
  return toDateTimeLocalValue(
    new Date(
      tomorrow.getFullYear(),
      tomorrow.getMonth(),
      tomorrow.getDate(),
      slotHour,
      slotMinute,
      0,
      0,
    ),
  );
}

export function ScheduleTimeField({
  id,
  label,
  value,
  onChange,
  disabled,
  disabledReason,
  error,
  nowMs,
}: ScheduleTimeFieldProps) {
  const zone = timeZoneLabel();
  const trimmed = typeof value === "string" ? value.trim() : "";
  const bounds = nowMs > 0 ? scheduleInputBounds(nowMs) : null;
  const verdict = nowMs > 0 && trimmed.length > 0 ? validateScheduleInput(trimmed, nowMs) : null;

  const parsedSelected = parseDateTimeLocal(trimmed);
  const selectedHour = parsedSelected ? parsedSelected.getHours() : null;
  const selectedMinute = parsedSelected ? parsedSelected.getMinutes() : null;

  const hintId = `${id}-hint`;
  const lockedId = `${id}-locked`;
  const errorId = `${id}-error`;

  const lockedMessage = disabled && disabledReason?.trim() ? disabledReason : null;
  const serverError = error?.trim() ? error : null;
  const displayError = serverError ?? (verdict && !verdict.ok ? verdict.message : null);
  const hasError = Boolean(displayError);

  const describedByIds = [hintId];
  if (lockedMessage) describedByIds.push(lockedId);
  if (displayError) describedByIds.push(errorId);

  return (
    <div className="flex w-full flex-col gap-3">
      <label htmlFor={id} className="text-foreground text-sm font-medium">
        {label}
      </label>

      <Input
        id={id}
        type="datetime-local"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        min={bounds?.min}
        max={bounds?.max}
        disabled={disabled}
        aria-describedby={describedByIds.join(" ")}
        aria-invalid={hasError ? true : undefined}
        className="bg-card h-11 rounded-lg font-mono text-sm"
      />

      <p id={hintId} className="text-muted-foreground text-xs leading-relaxed">
        Múi giờ {zone} · hẹn trước tối đa {MAX_SCHEDULE_AHEAD_DAYS} ngày.
      </p>

      <div className="flex w-full flex-col gap-2 pt-0.5">
        <span className="text-foreground text-sm font-medium">Khung giờ vàng gợi ý</span>
        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:flex-wrap">
          {GOLDEN_HOURS.map((slot) => {
            const isMatch = selectedHour === slot.hour && selectedMinute === slot.minute;
            const Icon = slot.icon;

            return (
              <button
                key={slot.label}
                type="button"
                disabled={disabled}
                aria-pressed={isMatch}
                onClick={() =>
                  onChange(resolveGoldenHourValue(parsedSelected, nowMs, slot.hour, slot.minute))
                }
                className={cn(
                  "focus-visible:ring-ring focus-visible:ring-offset-background inline-flex min-h-10 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-3.5 text-xs font-medium whitespace-nowrap transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
                  "disabled:cursor-not-allowed disabled:opacity-40",
                  isMatch
                    ? "border-ring bg-accent text-accent-foreground font-semibold"
                    : "border-border bg-card text-foreground hover:bg-[var(--bg-subtle)]",
                )}
              >
                <Icon
                  className={cn(
                    "size-4 shrink-0",
                    isMatch ? "text-accent-foreground" : "text-muted-foreground",
                  )}
                  aria-hidden="true"
                />
                <span>{slot.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {verdict?.ok ? (
        <p className="text-muted-foreground pt-0.5 text-xs leading-relaxed">
          Sẽ đăng lúc{" "}
          <span className="text-foreground font-semibold">{formatScheduledAt(verdict.iso)}</span> (
          {zone}) — {formatCountdown(verdict.delayMs)}.
        </p>
      ) : null}

      {displayError ? (
        <p
          id={errorId}
          role="alert"
          className="text-destructive flex items-center gap-1.5 pt-0.5 text-xs font-medium"
        >
          <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
          <span>{displayError}</span>
        </p>
      ) : null}

      {lockedMessage ? (
        <p id={lockedId} className="text-muted-foreground text-xs">
          {lockedMessage}
        </p>
      ) : null}
    </div>
  );
}
