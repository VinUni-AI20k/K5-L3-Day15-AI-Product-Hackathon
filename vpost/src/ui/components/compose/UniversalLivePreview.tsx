"use client";

import { Camera, Clapperboard, Globe } from "lucide-react";
import { useId, useState } from "react";

import { cn } from "@/shared/utils";
import { FacebookPreview } from "@/ui/components/compose/previews/FacebookPreview";
import { InstagramPreview } from "@/ui/components/compose/previews/InstagramPreview";
import { TikTokPreview } from "@/ui/components/compose/previews/TikTokPreview";
import type { MediaAsset, VideoTarget } from "@/ui/schemas/compose.schema";

export type PreviewPlatform = "facebook" | "tiktok" | "instagram";

export interface UniversalLivePreviewProps {
  caption: string;
  channelName: string;
  channelPlatform?: "facebook" | "tiktok";
  avatarUrl?: string;
  videoTarget?: VideoTarget;
  media: readonly MediaAsset[];
  isVideo: boolean;
  className?: string;
}

const PREVIEW_PLATFORMS = [
  { id: "facebook" as const, label: "Facebook", icon: Globe },
  { id: "tiktok" as const, label: "TikTok", icon: Clapperboard },
  { id: "instagram" as const, label: "Instagram", icon: Camera },
] as const;

export function UniversalLivePreview({
  caption,
  channelName,
  channelPlatform = "facebook",
  avatarUrl,
  videoTarget = "facebook_video",
  media,
  isVideo,
  className,
}: UniversalLivePreviewProps) {
  const groupId = useId();
  const [userPlatformOverride, setUserPlatformOverride] = useState<PreviewPlatform | null>(null);
  const activePlatform: PreviewPlatform =
    userPlatformOverride ?? (channelPlatform === "tiktok" ? "tiktok" : "facebook");

  const activeLabel =
    PREVIEW_PLATFORMS.find((platform) => platform.id === activePlatform)?.label ?? "Facebook";

  return (
    <aside
      aria-labelledby={`${groupId}-heading`}
      className={cn("flex w-full min-w-0 flex-col gap-4", className)}
    >
      <span id={`${groupId}-heading`} className="sr-only">
        Xem trước bài đăng theo từng nền tảng
      </span>

      {/* Platform Switcher Tabs */}
      <div
        role="tablist"
        aria-label="Chọn nền tảng xem trước"
        className="border-border bg-card flex items-center gap-1.5 overflow-x-auto rounded-xl border p-1.5"
      >
        {PREVIEW_PLATFORMS.map((platform) => {
          const Icon = platform.icon;
          const isActive = activePlatform === platform.id;

          return (
            <button
              key={platform.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setUserPlatformOverride(platform.id)}
              className={cn(
                "focus-visible:ring-ring focus-visible:ring-offset-background inline-flex min-h-10 shrink-0 cursor-pointer items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium whitespace-nowrap transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
                isActive
                  ? "border-ring/40 bg-accent text-accent-foreground border font-semibold"
                  : "text-muted-foreground hover:bg-[var(--bg-subtle)] hover:text-foreground border border-transparent",
              )}
            >
              <Icon className="size-4 shrink-0" aria-hidden="true" />
              <span>{platform.label}</span>
            </button>
          );
        })}
      </div>

      {/* Platform-Specific Preview Renderers */}
      <div className="w-full">
        {activePlatform === "facebook" && (
          <FacebookPreview
            channelName={channelName}
            avatarUrl={avatarUrl}
            caption={caption}
            media={media}
            isVideo={isVideo}
            isReels={videoTarget === "facebook_reels"}
          />
        )}

        {activePlatform === "tiktok" && (
          <TikTokPreview
            channelName={channelName}
            avatarUrl={avatarUrl}
            caption={caption}
            media={media}
            isVideo={isVideo}
          />
        )}

        {activePlatform === "instagram" && (
          <InstagramPreview
            channelName={channelName}
            avatarUrl={avatarUrl}
            caption={caption}
            media={media}
            isVideo={isVideo}
          />
        )}
      </div>

      <p className="text-muted-foreground text-center text-xs leading-relaxed">
        Xem trước mô phỏng giao diện hiển thị trên {activeLabel}.
      </p>
    </aside>
  );
}
