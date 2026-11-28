"use client";

import { ExternalLink, Search } from "lucide-react";
import { useId, useMemo, useState } from "react";

import { cn } from "@/shared/utils";
import {
  countChannelStatuses,
  filterBatchChannels,
  showsStatusPill,
  type ChannelStatusFilter,
} from "@/ui/components/batch/batch-channel-filter";
import { ChannelProgress } from "@/ui/components/batch/ChannelProgress";
import {
  channelLabelIndex,
  channelSentenceName,
} from "@/ui/components/channels/channel-option-labels";
import { ChannelNameCell } from "@/ui/components/channels/ChannelNameCell";
import { JobStatusBadge } from "@/ui/components/post/PostStatusBadge";
import type { Channel } from "@/ui/schemas/channel.schema";
import {
  facebookPostUrl,
  formatDateTime,
  type BatchChannelStatus,
} from "@/ui/schemas/post-batch.schema";

export function BatchChannelTable({
  channels,
  progressSteps,
  tenantChannels,
}: {
  channels: readonly BatchChannelStatus[];
  progressSteps: readonly string[];
  tenantChannels?: readonly Channel[];
}) {
  const searchId = useId();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ChannelStatusFilter>("all");

  // Memoised, because this Map is a dependency of the filter below: rebuilding
  // it every render made that `useMemo` recompute every render too.
  const labels = useMemo(
    () => channelLabelIndex(channels.map((channel) => channel.channelId), tenantChannels),
    [channels, tenantChannels],
  );

  const filteredChannels = useMemo(
    () => filterBatchChannels(channels, statusFilter, search, labels),
    [channels, statusFilter, search, labels],
  );

  const counts = useMemo(() => countChannelStatuses(channels), [channels]);

  return (
    <section aria-labelledby="batch-channels-heading" className="flex flex-col gap-4">
      {/* Header & Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 id="batch-channels-heading" className="text-foreground text-lg font-semibold">
            Kết quả theo từng kênh
          </h2>
          <span className="text-muted-foreground font-mono text-xs tabular-nums">
            ({filteredChannels.length}/{channels.length} kênh)
          </span>
        </div>

        {/* Filter Chips + Search */}
        <div className="flex w-full flex-wrap items-center gap-2.5 sm:w-auto">
          {/* Status Filter Chips — single horizontally scrollable row on mobile */}
          <div
            role="group"
            aria-label="Lọc theo trạng thái kênh"
            className="flex max-w-full items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0"
          >
            <button
              type="button"
              aria-pressed={statusFilter === "all"}
              onClick={() => setStatusFilter("all")}
              className={cn(
                "focus-visible:ring-ring inline-flex min-h-10 shrink-0 cursor-pointer items-center rounded-full px-3.5 text-xs font-medium whitespace-nowrap transition-colors duration-150 outline-none focus-visible:ring-2",
                statusFilter === "all"
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-secondary-foreground hover:bg-muted",
              )}
            >
              Tất cả ({counts.all})
            </button>
            <button
              type="button"
              aria-pressed={statusFilter === "published"}
              onClick={() => setStatusFilter("published")}
              className={cn(
                "focus-visible:ring-ring inline-flex min-h-10 shrink-0 cursor-pointer items-center rounded-full px-3.5 text-xs font-medium whitespace-nowrap transition-colors duration-150 outline-none focus-visible:ring-2",
                statusFilter === "published"
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-secondary-foreground hover:bg-muted",
              )}
            >
              Đã đăng ({counts.published})
            </button>
            {/* Kept while it is the ACTIVE filter even at zero: this screen polls,
                so a retry that succeeds would otherwise remove the very pill that
                is filtering, leaving an empty table and no way back. */}
            {showsStatusPill(counts.active, "active", statusFilter) && (
              <button
                type="button"
                aria-pressed={statusFilter === "active"}
                onClick={() => setStatusFilter("active")}
                className={cn(
                  "focus-visible:ring-ring inline-flex min-h-10 shrink-0 cursor-pointer items-center rounded-full px-3.5 text-xs font-medium whitespace-nowrap transition-colors duration-150 outline-none focus-visible:ring-2",
                  statusFilter === "active"
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-secondary-foreground hover:bg-muted",
                )}
              >
                Đang chạy ({counts.active})
              </button>
            )}
            {showsStatusPill(counts.issues, "issues", statusFilter) && (
              <button
                type="button"
                aria-pressed={statusFilter === "issues"}
                onClick={() => setStatusFilter("issues")}
                className={cn(
                  "focus-visible:ring-ring inline-flex min-h-10 shrink-0 cursor-pointer items-center rounded-full px-3.5 text-xs font-medium whitespace-nowrap transition-colors duration-150 outline-none focus-visible:ring-2",
                  statusFilter === "issues"
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-secondary-foreground hover:bg-muted",
                )}
              >
                Lỗi/Chặn ({counts.issues})
              </button>
            )}
          </div>

          {/* Search Box */}
          <div className="relative w-full sm:w-56">
            <label htmlFor={searchId} className="sr-only">
              Tìm trong danh sách kênh của lô này
            </label>
            <Search
              aria-hidden="true"
              className="text-foreground-subtle pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
            />
            <input
              id={searchId}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm tên kênh hoặc mã…"
              className="border-input bg-card text-foreground placeholder:text-foreground-subtle focus-visible:border-ring focus-visible:ring-ring focus-visible:ring-offset-background h-10 w-full rounded-lg border pr-3 pl-9 text-sm transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
            />
          </div>
        </div>
      </div>

      {/* Table Container */}
      <div
        className="border-border bg-card overflow-x-auto rounded-xl border"
        tabIndex={0}
        role="region"
        aria-label="Bảng kết quả theo kênh"
      >
        <table className="w-full min-w-160 border-collapse text-sm">
          <caption className="sr-only">
            Trạng thái đăng bài của từng kênh trong lô, kèm số lần thử và lý do lỗi
          </caption>
          <thead className="border-border bg-sidebar text-muted-foreground border-b text-xs font-medium">
            <tr className="text-left">
              <th scope="col" className="px-4 py-3 whitespace-nowrap">
                Kênh Facebook
              </th>
              <th scope="col" className="w-36 px-4 py-3 whitespace-nowrap">
                Trạng thái
              </th>
              <th scope="col" className="w-28 px-4 py-3 text-center whitespace-nowrap">
                Số lần thử
              </th>
              <th scope="col" className="px-4 py-3 whitespace-nowrap">
                Kết quả chi tiết
              </th>
            </tr>
          </thead>
          <tbody className="divide-border divide-y">
            {filteredChannels.length === 0 ? (
              <tr>
                <td colSpan={4} className="text-muted-foreground py-8 text-center text-sm">
                  Không tìm thấy kênh nào khớp với bộ lọc hiện tại.
                </td>
              </tr>
            ) : (
              filteredChannels.map((channel) => {
                const link =
                  channel.publishedUrl ??
                  (channel.publishedPostId ? facebookPostUrl(channel.publishedPostId) : null);

                return (
                  <tr
                    key={channel.postJobId}
                    className="hover:bg-sidebar/70 align-top transition-colors duration-150"
                  >
                    {/* Channel info — the row's header, so a screen reader can
                        name which channel a status cell belongs to. */}
                    <th scope="row" className="px-4 py-3.5 text-left">
                      <div className="text-foreground font-medium">
                        <ChannelNameCell
                          channelId={channel.channelId}
                          label={labels.get(channel.channelId)}
                        />
                      </div>
                    </th>

                    {/* Status Badge */}
                    <td className="px-4 py-3.5">
                      <JobStatusBadge status={channel.status} />
                    </td>

                    {/* Attempt Count */}
                    <td className="text-muted-foreground px-4 py-3.5 text-center font-mono text-xs tabular-nums">
                      {channel.attemptCount}
                    </td>

                    {/* Result & Actions */}
                    <td className="px-4 py-3.5">
                      <div className="flex flex-col gap-1.5">
                        <p
                          className={cn(
                            "text-sm leading-relaxed",
                            channel.status === "published"
                              ? "text-foreground font-medium"
                              : channel.status === "failed" || channel.status === "blocked"
                                ? "text-destructive"
                                : "text-muted-foreground",
                          )}
                        >
                          {channel.userMessage}
                        </p>

                        {/* Direct Facebook Post Link */}
                        {link && (
                          <div className="pt-0.5">
                            <a
                              href={link}
                              target="_blank"
                              rel="noreferrer noopener"
                              className="bg-accent text-accent-foreground hover:bg-accent/80 focus-visible:ring-ring inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors duration-150 outline-none focus-visible:ring-2"
                            >
                              <span>Mở bài viết trên Facebook</span>
                              <ExternalLink className="size-3.5 shrink-0" aria-hidden="true" />
                            </a>
                          </div>
                        )}

                        {channel.publishedAt && (
                          <span className="text-muted-foreground font-mono text-xs tabular-nums">
                            Đã đăng: {formatDateTime(channel.publishedAt)}
                          </span>
                        )}

                        {channel.lastErrorCode && (
                          <span className="text-foreground-subtle font-mono text-xs">
                            Mã lỗi: {channel.lastErrorCode}
                          </span>
                        )}

                        {/* Live progress when running */}
                        {channel.progress && (
                          <div className="pt-1">
                            <ChannelProgress
                              progress={channel.progress}
                              steps={progressSteps}
                              channelLabel={channelSentenceName(channel.channelId, labels)}
                              statusMessage={channel.userMessage}
                            />
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
