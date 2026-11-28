"use client";

import { AlertTriangle } from "lucide-react";
import { cn } from "@/shared/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/ui/components/ui/dialog";
import { formatScheduledAt } from "@/ui/schemas/scheduled.schema";

export interface PublishConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  isPending: boolean;
  isScheduled: boolean;
  scheduledAt?: string | null;
  channels: readonly { id: string; name: string; platform?: string }[];
  mediaCount: number;
  isVideo: boolean;
  productCode?: string;
  captionPreview?: string;
}

export function PublishConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  isPending,
  isScheduled,
  scheduledAt,
  channels,
  mediaCount,
  isVideo,
  productCode,
}: PublishConfirmDialogProps) {
  const isNow = !isScheduled;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-border bg-popover max-w-md gap-5 rounded-2xl border p-6 shadow-[var(--shadow-pop)]">
        <DialogHeader className="gap-2 text-left">
          <div className="flex items-start gap-3">
            <div
              aria-hidden="true"
              className="bg-warning/15 text-warning-foreground flex size-10 shrink-0 items-center justify-center rounded-xl"
            >
              <AlertTriangle className="size-5" aria-hidden="true" />
            </div>
            <div className="min-w-0 space-y-1">
              <DialogTitle className="text-lg font-semibold">
                {isNow ? "Xác nhận xuất bản bài đăng" : "Xác nhận lên lịch đăng bài"}
              </DialogTitle>
              <DialogDescription className="text-muted-foreground text-sm leading-relaxed">
                {isNow
                  ? "Bài viết sẽ được đăng trực tiếp lên mạng xã hội và không thể hoàn tác."
                  : "Bài viết sẽ vào hàng đợi và tự động xuất bản theo giờ đã hẹn."}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Thông tin tóm tắt bài đăng */}
        <div className="border-border bg-[var(--bg-subtle)] divide-border flex flex-col divide-y rounded-xl border text-sm">
          {/* Danh sách kênh */}
          <div className="flex items-start justify-between gap-3 p-3.5">
            <span className="text-muted-foreground shrink-0 font-medium">Kênh đăng</span>
            <div className="flex flex-wrap justify-end gap-1.5 text-right">
              {channels.map((ch) => (
                <span
                  key={ch.id}
                  className="border-border bg-card text-foreground rounded-full border px-2.5 py-0.5 text-xs font-medium"
                >
                  {ch.name}
                </span>
              ))}
            </div>
          </div>

          {/* Thời điểm */}
          <div className="flex items-center justify-between gap-3 p-3.5">
            <span className="text-muted-foreground font-medium">Thời điểm</span>
            <span className="text-foreground font-medium">
              {isNow
                ? "Đăng ngay"
                : scheduledAt
                  ? formatScheduledAt(scheduledAt)
                  : "Theo lịch đã chọn"}
            </span>
          </div>

          {/* Nội dung đính kèm */}
          <div className="flex items-center justify-between gap-3 p-3.5">
            <span className="text-muted-foreground font-medium">Nội dung</span>
            <span className="text-foreground font-medium">
              {productCode ? (
                <span className="mr-1.5 font-mono font-semibold">{productCode} ·</span>
              ) : null}
              <span>{isVideo ? "1 Video" : `${mediaCount} hình ảnh`}</span>
            </span>
          </div>
        </div>

        <DialogFooter className="border-border flex items-center justify-end gap-2.5 border-t pt-4">
          <button
            type="button"
            disabled={isPending}
            onClick={() => onOpenChange(false)}
            className="border-border bg-secondary text-secondary-foreground hover:bg-muted focus-visible:ring-ring focus-visible:ring-offset-background h-10 cursor-pointer rounded-lg border px-4 text-sm font-medium transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Hủy
          </button>

          <button
            type="button"
            disabled={isPending}
            onClick={onConfirm}
            className={cn(
              "bg-primary text-primary-foreground focus-visible:ring-ring focus-visible:ring-offset-background flex h-10 cursor-pointer items-center justify-center rounded-lg px-5 text-sm font-medium shadow-[var(--shadow-button)] transition-colors duration-150 outline-none hover:bg-[var(--button-primary-hover-bg)] focus-visible:ring-2 focus-visible:ring-offset-2 active:bg-[var(--button-primary-pressed-bg)]",
              isPending && "cursor-not-allowed opacity-40",
            )}
          >
            {isPending ? <span>Đang xử lý…</span> : <span>Xác nhận</span>}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
