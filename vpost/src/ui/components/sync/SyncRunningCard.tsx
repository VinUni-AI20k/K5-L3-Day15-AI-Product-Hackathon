"use client";

import { ProgressBar } from "@astryxdesign/core";
import { Loader2 } from "lucide-react";
import { useId } from "react";

/**
 * The panel shown while a sync is running.
 *
 * Deliberately WITHOUT a percentage, an ETA or a file counter: `POST
 * /api/catalog/sync` runs the whole read in one request and only answers when it
 * is done, so the browser has no progress to report. A bar that filled itself up
 * would be a made-up number (core-long-running-jobs: describe the step, never
 * invent a percentage), and "chặng 1/3" would be a guess — the server does not
 * say which stage it is in.
 *
 * What it can say honestly is what is happening and how long it may take.
 */
export function SyncRunningCard() {
  const headingId = `${useId()}-running`;

  return (
    <section
      aria-labelledby={headingId}
      aria-busy="true"
      className="bg-card border-border space-y-3 rounded-xl border p-5"
    >
      <div className="flex items-center gap-2.5">
        <Loader2
          aria-hidden="true"
          className="text-accent-foreground size-4 shrink-0 motion-safe:animate-spin"
        />
        <h2 id={headingId} className="text-foreground text-base font-semibold">
          Đang đọc Drive và Sheet
        </h2>
      </div>

      {/* Indeterminate on purpose: it signals ongoing work without inventing a percentage. */}
      <ProgressBar label="Đang đọc Drive và Sheet" isLabelHidden isIndeterminate variant="accent" />

      <p className="text-muted-foreground text-sm leading-relaxed">
        Chưa có số liệu cho tới khi lần chạy kết thúc — hệ thống không báo được tiến độ giữa chừng.
        Thư mục lớn có thể mất vài phút. Kết quả sẽ hiện ngay bên dưới khi xong.
      </p>
    </section>
  );
}
