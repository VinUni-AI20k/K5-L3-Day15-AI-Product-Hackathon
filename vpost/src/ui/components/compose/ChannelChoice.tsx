"use client";

import { ChevronRight } from "lucide-react";
import { useId } from "react";

import { channelLabelIndex } from "@/ui/components/channels/channel-option-labels";
import { avatarToneStyle, channelInitials } from "@/ui/components/compose/channel-picker";
import { useChannels } from "@/ui/hooks/useChannels";
import type { PublishForm } from "@/ui/hooks/usePublishForm";

/**
 * "Kênh đăng" on the compose card — template lines 112–124: a mono FACEBOOK
 * label, the chosen Pages as pills, and a chevron opening the picker.
 *
 * This block only SUMMARISES. Choosing happens in `ChannelPickerDialog`, the
 * modal the design draws (161–191), which this row and the action bar both
 * open.
 *
 * Neither the caption nor the schedule is here: one caption per channel lives
 * in the caption block, where the text is (`CaptionBlock`), and the time lives
 * in the sticky tray beside the button that uses it (`ComposeFocus`). There is
 * exactly ONE place on this screen to set the posting time — two of them was
 * how "đăng ngay" and "hẹn giờ" could be answered twice in one post. What is
 * left here answers "where does this post go", and the second stock check that
 * can still block it after it leaves.
 *
 * Page names come from the tenant's own channel list (`/api/channels`), so the
 * pills read "Lady Fashion" rather than an id. A Page that was removed since it
 * was ticked still shows: naming it is the only way an operator can find out
 * why one channel of the lô never went anywhere (business rule 5).
 */
export function ChannelChoice({
  publish,
  onOpenPicker,
}: {
  publish: PublishForm;
  onOpenPicker: () => void;
}) {
  const blockId = useId();
  const channels = useChannels();

  const { selectedIds } = publish;
  const shown = selectedIds.slice(0, 3);
  /**
   * ONE resolve for the chips, via the shared rule (spec §3.1). It reads the
   * FULL channel list rather than `publishableChannels`: a Page that was
   * switched off is still a Page, and a chip that fell back to a raw id the
   * moment a Page left the publishable set is exactly what this task removes.
   */
  const labels = channelLabelIndex(shown, channels.data?.channels);

  return (
    <section aria-labelledby={`${blockId}-heading`} className="flex flex-col gap-2">
      <h3 id={`${blockId}-heading`} className="text-foreground text-sm font-medium">
        Kênh đăng
      </h3>

      <button
        type="button"
        onClick={onOpenPicker}
        className="border-border bg-card hover:bg-[var(--bg-subtle)] focus-visible:ring-ring focus-visible:ring-offset-background flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
      >
        <span className="bg-muted text-muted-foreground shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium">
          Facebook
        </span>

        {selectedIds.length === 0 ? (
          <span className="text-muted-foreground text-sm">
            Chưa chọn kênh nào — bấm để chọn
          </span>
        ) : (
          <span className="flex min-w-0 flex-wrap items-center gap-2">
            {shown.map((channelId) => {
              const resolved = labels.get(channelId);
              const label = resolved?.name ?? channelId;
              const gone = resolved?.note === "removed";
              const off = resolved?.note === "disabled";

              return (
                <span
                  key={channelId}
                  className="border-border bg-muted flex h-9 items-center gap-2 rounded-full border py-0 pr-3.5 pl-1"
                >
                  <span
                    aria-hidden="true"
                    style={avatarToneStyle(label)}
                    className="text-foreground flex size-7 items-center justify-center rounded-full text-xs font-semibold"
                  >
                    {channelInitials(label)}
                  </span>
                  <span className="text-foreground max-w-44 truncate text-sm font-medium">
                    {label}
                  </span>
                  {gone || off ? (
                    <span className="text-warning-foreground text-xs">
                      {gone ? "(đã gỡ)" : "(đang tắt)"}
                    </span>
                  ) : null}
                </span>
              );
            })}
            {selectedIds.length > shown.length ? (
              <span className="text-muted-foreground text-sm">
                +{selectedIds.length - shown.length}
              </span>
            ) : null}
          </span>
        )}

        <span className="flex-1" />
        <span className="text-accent-foreground shrink-0 text-sm font-medium">Sửa</span>
        <ChevronRight aria-hidden="true" className="text-muted-foreground size-4 shrink-0" />
      </button>

      <p className="text-muted-foreground text-xs">
        {selectedIds.length === 0
          ? "Mỗi kênh là một bài riêng; một kênh lỗi không dừng các kênh còn lại."
          : `Sẽ tạo ${selectedIds.length} bài, mỗi kênh một bài.`}
      </p>

      <p className="border-warning/40 bg-warning/10 text-warning-foreground rounded-xl border px-3.5 py-2.5 text-xs leading-relaxed">
        Trước khi đăng, hệ thống kiểm tra tồn kho lần thứ hai ngay trước lời gọi đăng. Nếu lúc đó
        mã đã hết hàng, bài sẽ bị chặn và không lên — dù lúc soạn vẫn báo còn hàng.
      </p>
    </section>
  );
}
