"use client";

import { CalendarClock } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/ui/components/ui/dialog";
import { ScheduleTimeField } from "@/ui/components/scheduled/ScheduleTimeField";
import { useNowMs } from "@/ui/hooks/useNowMs";
import type { ScheduleChoice } from "@/ui/hooks/useScheduleChoice";

export interface SchedulePickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  choice: ScheduleChoice;
  onConfirmSchedule: () => void;
  disabled?: boolean;
  disabledReason?: string;
}

export function SchedulePickerDialog({
  open,
  onOpenChange,
  choice,
  onConfirmSchedule,
  disabled,
  disabledReason,
}: SchedulePickerDialogProps) {
  const nowMs = useNowMs();
  const resolved = choice.resolve();
  const isValid = resolved.ok;

  const handleConfirm = () => {
    if (!isValid) return;
    onOpenChange(false);
    onConfirmSchedule();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-border bg-popover max-w-md gap-5 rounded-2xl border p-6 shadow-[var(--shadow-pop)]">
        <DialogHeader className="gap-2 text-left">
          <div className="flex items-start gap-3">
            <div
              aria-hidden="true"
              className="bg-accent text-accent-foreground flex size-10 shrink-0 items-center justify-center rounded-xl"
            >
              <CalendarClock className="size-5" aria-hidden="true" />
            </div>
            <div className="min-w-0 space-y-1">
              <DialogTitle className="text-lg font-semibold">Hẹn lịch đăng bài</DialogTitle>
              <DialogDescription className="text-muted-foreground text-sm leading-relaxed">
                Chọn ngày và giờ bạn muốn bài viết tự động xuất bản lên các kênh đã chọn.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex flex-col gap-3 py-1">
          <ScheduleTimeField
            id="compose-schedule-time"
            label="Ngày & giờ hẹn đăng"
            value={choice.value}
            onChange={choice.setValue}
            disabled={disabled}
            disabledReason={disabledReason}
            error={choice.error}
            nowMs={nowMs}
          />
        </div>

        <DialogFooter className="border-border flex items-center justify-end gap-2.5 border-t pt-4">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="border-border bg-secondary text-secondary-foreground hover:bg-muted focus-visible:ring-ring focus-visible:ring-offset-background h-10 cursor-pointer rounded-lg border px-4 text-sm font-medium transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
          >
            Thoát
          </button>

          <button
            type="button"
            disabled={!isValid || disabled}
            onClick={handleConfirm}
            className="bg-primary text-primary-foreground focus-visible:ring-ring focus-visible:ring-offset-background flex h-10 cursor-pointer items-center justify-center rounded-lg px-5 text-sm font-medium shadow-[var(--shadow-button)] transition-colors duration-150 outline-none hover:bg-[var(--button-primary-hover-bg)] focus-visible:ring-2 focus-visible:ring-offset-2 active:bg-[var(--button-primary-pressed-bg)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Tiếp tục
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
