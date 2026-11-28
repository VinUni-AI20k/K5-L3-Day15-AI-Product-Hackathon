"use client";

import { Check, CheckCheck, Plus } from "lucide-react";

import { cn } from "@/shared/utils";
import { avatarToneStyle, channelInitials } from "@/ui/components/compose/channel-picker";
import type { Channel } from "@/ui/schemas/channel.schema";
import type { PublishForm } from "@/ui/hooks/usePublishForm";

export interface PostizSocialsBarProps {
  channels: readonly Channel[];
  publish: PublishForm;
  activeChannelId: string | null;
  onSelectActiveChannel: (channelId: string | null) => void;
  onOpenPicker?: () => void;
  disabled?: boolean;
}

export function PostizSocialsBar({
  channels,
  publish,
  activeChannelId,
  onSelectActiveChannel,
  onOpenPicker,
  disabled = false,
}: PostizSocialsBarProps) {
  const { selected, selectedIds, toggleChannel, setSelectedChannels } = publish;
  const isMasterActive = activeChannelId === null;
  const allSelected = channels.length > 0 && selectedIds.length === channels.length;

  const handleToggleAll = () => {
    if (disabled) return;
    if (!allSelected) {
      // Chọn tất cả các kênh và sáng lên hết
      setSelectedChannels(channels.map((c) => c.channelId));
      onSelectActiveChannel(null);
    } else {
      // Nếu đã chọn tất cả, chuyển về xem Master
      if (!isMasterActive) {
        onSelectActiveChannel(null);
      } else {
        // Nếu đang ở Master mà bấm lại -> Bỏ chọn tất cả
        setSelectedChannels([]);
      }
    }
  };

  const handleChannelClick = (channelId: string) => {
    if (disabled) return;
    const isSelected = selected.has(channelId);

    if (!isSelected) {
      // 1. Đang tắt -> 1 click BẬT NGAY (active) và chuyển tab đến kênh này
      toggleChannel(channelId, true);
      onSelectActiveChannel(channelId);
    } else {
      // 2. Đang bật -> 1 click TẮT NGAY (unactive)
      toggleChannel(channelId, false);
      if (activeChannelId === channelId) {
        onSelectActiveChannel(null);
      }
    }
  };

  return (
    <div className="border-border bg-[var(--bg-subtle)] flex flex-col gap-3 rounded-xl border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-foreground text-base font-semibold">Kênh đăng</h3>
          <span className="bg-secondary text-secondary-foreground inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium tabular-nums">
            {selectedIds.length}/{channels.length} đã chọn
          </span>
        </div>

        {onOpenPicker && (
          <button
            type="button"
            onClick={onOpenPicker}
            disabled={disabled}
            className="text-accent-foreground focus-visible:ring-ring inline-flex min-h-10 cursor-pointer items-center rounded-lg px-2 text-sm font-medium transition-colors duration-150 outline-none hover:underline focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Quản lý kênh
          </button>
        )}
      </div>

      <div className="flex items-start gap-3 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible">
        {/* Nút "Tất cả" (Select All Toggle) */}
        <div className="relative flex w-16 shrink-0 flex-col items-center gap-1.5">
          <button
            type="button"
            disabled={disabled}
            aria-pressed={allSelected}
            aria-label={allSelected ? "Bỏ chọn tất cả kênh" : "Chọn tất cả kênh"}
            onClick={handleToggleAll}
            className={cn(
              "focus-visible:ring-ring focus-visible:ring-offset-background relative flex size-12 cursor-pointer items-center justify-center rounded-full border-2 transition-colors duration-150 outline-none select-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40",
              allSelected
                ? "border-ring bg-accent text-accent-foreground"
                : "border-border bg-card text-foreground hover:border-ring/60 hover:bg-muted",
            )}
            title={allSelected ? "Bấm để bỏ chọn tất cả các kênh" : "Bấm để chọn tất cả các kênh"}
          >
            <CheckCheck className="size-5" aria-hidden="true" />
          </button>
          <span
            className={cn(
              "w-full truncate text-center text-xs transition-colors",
              allSelected ? "text-accent-foreground font-semibold" : "text-muted-foreground font-medium",
            )}
          >
            Tất cả
          </span>
        </div>

        {/* Divider */}
        <span aria-hidden="true" className="bg-border mt-2 h-8 w-px shrink-0 self-start" />

        {/* Các kênh đơn lẻ */}
        {channels.map((channel) => {
          const isSelected = selected.has(channel.channelId);
          const isFocused = activeChannelId === channel.channelId;

          return (
            <div
              key={channel.channelId}
              className="group relative flex w-16 shrink-0 flex-col items-center gap-1.5"
            >
              <button
                type="button"
                disabled={disabled}
                aria-pressed={isSelected}
                aria-label={`${channel.name} — ${isSelected ? "đã chọn" : "chưa chọn"}`}
                onClick={() => handleChannelClick(channel.channelId)}
                className={cn(
                  "focus-visible:ring-ring focus-visible:ring-offset-background relative flex size-12 cursor-pointer items-center justify-center rounded-full border-2 p-0.5 transition-colors duration-150 outline-none select-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40",
                  isSelected
                    ? isFocused
                      ? "border-ring ring-ring/30 bg-accent ring-2"
                      : "border-ring bg-accent/60"
                    : "border-border bg-card hover:border-ring/60",
                )}
                title={`${channel.name} (${isSelected ? (isFocused ? "Đang mở tab - Bấm để tắt kênh" : "Đã bật - Bấm để tắt kênh") : "Đang tắt - Bấm để bật"})`}
              >
                {/* Channel Avatar — crisp full-contrast ink on hashed accent tint */}
                <span
                  aria-hidden="true"
                  style={avatarToneStyle(channel.name)}
                  className="text-foreground flex size-full items-center justify-center rounded-full text-xs font-semibold"
                >
                  {channelInitials(channel.name)}
                </span>

                {/* Selection / Platform Badge at bottom-right */}
                <span
                  aria-hidden="true"
                  className={cn(
                    "border-card absolute -right-0.5 -bottom-0.5 flex size-5 items-center justify-center rounded-full border-2 text-xs font-semibold transition-colors",
                    isSelected
                      ? "bg-primary text-primary-foreground"
                      : "bg-card text-muted-foreground border-border border",
                  )}
                >
                  {isSelected ? (
                    <Check className="size-3" strokeWidth={3} aria-hidden="true" />
                  ) : (
                    <span>{channel.platform === "tiktok" ? "T" : "f"}</span>
                  )}
                </span>
              </button>

              {/* Channel Name */}
              <span
                className={cn(
                  "w-full truncate text-center text-xs transition-colors",
                  isFocused
                    ? "text-accent-foreground font-semibold"
                    : isSelected
                      ? "text-foreground font-medium"
                      : "text-muted-foreground",
                )}
              >
                {channel.name}
              </span>
            </div>
          );
        })}

        {/* Add Channel Button if picker available */}
        {onOpenPicker && (
          <div className="flex w-16 shrink-0 flex-col items-center gap-1.5">
            <button
              type="button"
              onClick={onOpenPicker}
              disabled={disabled}
              aria-label="Thêm kênh đăng"
              className="border-border bg-card text-muted-foreground hover:border-ring hover:bg-accent hover:text-accent-foreground focus-visible:ring-ring focus-visible:ring-offset-background flex size-12 cursor-pointer items-center justify-center rounded-full border-2 border-dashed transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40"
              title="Thêm kênh mới"
            >
              <Plus className="size-5" aria-hidden="true" />
            </button>
            <span className="text-muted-foreground text-xs font-medium">Thêm</span>
          </div>
        )}
      </div>
    </div>
  );
}
