"use client";

import {
  Bookmark,
  Heart,
  MessageCircle,
  Music,
  Plus,
  Search,
  Share2,
} from "lucide-react";
import Image from "next/image";
import { type FC, type ReactNode } from "react";

import { MediaThumb } from "@/ui/components/compose/MediaThumb";
import type { MediaAsset } from "@/ui/schemas/compose.schema";
import { mediaPreviewUrl } from "@/ui/services/media-preview";

export interface TikTokPreviewProps {
  channelName: string;
  avatarUrl?: string;
  caption: string;
  media: readonly MediaAsset[];
  isVideo: boolean;
}

const TikTokItem: FC<{ icon: ReactNode; num: string }> = ({ icon, num }) => (
  <div className="flex flex-col items-center gap-1">
    <div className="bg-inverse-surface/75 text-inverse-foreground flex size-10 items-center justify-center rounded-full backdrop-blur-xs">
      {icon}
    </div>
    <div className="text-inverse-foreground text-xs font-medium tabular-nums">{num}</div>
  </div>
);

export function TikTokPreview({
  channelName,
  avatarUrl,
  caption,
  media,
  isVideo,
}: TikTokPreviewProps) {
  const firstAsset = media[0];
  const firstVideoUrl = firstAsset && isVideo ? mediaPreviewUrl(firstAsset.driveFileId) : null;
  const username = channelName ? channelName.toLowerCase().replace(/\s+/g, "_") : "vpost_fashion";

  return (
    <div className="border-border bg-inverse-surface text-inverse-foreground relative mx-auto aspect-9/16 w-full max-w-85 overflow-hidden rounded-xl border shadow-[var(--shadow-card)] select-none">
      {/* Background Media */}
      {isVideo && firstVideoUrl ? (
        <video
          src={firstVideoUrl}
          autoPlay
          loop
          muted
          playsInline
          className="size-full object-cover"
        />
      ) : firstAsset ? (
        <div className="relative size-full">
          <MediaThumb asset={firstAsset} alt="" lazy={false} />
        </div>
      ) : (
        <div className="text-inverse-foreground/75 flex size-full items-center justify-center px-4 text-center text-sm">
          Chưa có video/ảnh TikTok
        </div>
      )}

      {/* Top Navigation */}
      <div className="from-inverse-surface/80 absolute inset-x-0 top-0 z-10 flex items-center justify-between bg-gradient-to-b to-transparent p-4">
        <div className="flex items-center gap-3.5 text-sm font-medium">
          <span className="text-inverse-foreground/70">Đang follow</span>
          <span className="border-inverse-foreground border-b-2 pb-0.5 font-semibold">
            Dành cho bạn
          </span>
        </div>
        <Search className="size-5 shrink-0" aria-hidden="true" />
      </div>

      {/* Right Action Rail */}
      <div className="absolute right-3 bottom-16 z-10 flex flex-col items-center gap-3">
        {/* Avatar with follow badge */}
        <div className="relative mb-1">
          <div className="border-inverse-foreground bg-inverse-surface text-inverse-foreground flex size-10 items-center justify-center overflow-hidden rounded-full border-2 text-xs font-semibold">
            {avatarUrl ? (
              <Image
                src={avatarUrl}
                alt=""
                width={40}
                height={40}
                unoptimized
                className="size-full object-cover"
              />
            ) : (
              channelName.slice(0, 2).toUpperCase() || "TT"
            )}
          </div>
          <div
            aria-hidden="true"
            className="bg-destructive text-inverse-foreground absolute -bottom-1.5 left-1/2 flex size-4 -translate-x-1/2 items-center justify-center rounded-full"
          >
            <Plus className="size-3" strokeWidth={3} aria-hidden="true" />
          </div>
        </div>

        <TikTokItem num="1.3M" icon={<Heart className="size-5" aria-hidden="true" />} />
        <TikTokItem num="10.7K" icon={<MessageCircle className="size-5" aria-hidden="true" />} />
        <TikTokItem num="1.2K" icon={<Bookmark className="size-5" aria-hidden="true" />} />
        <TikTokItem num="340" icon={<Share2 className="size-5" aria-hidden="true" />} />

        {/* Spinning Music Disk */}
        <div
          aria-hidden="true"
          className="border-inverse-foreground/30 bg-inverse-surface mt-1 flex size-9 items-center justify-center rounded-full border-2 motion-safe:animate-spin"
        >
          <Music className="size-4" aria-hidden="true" />
        </div>
      </div>

      {/* Bottom Caption Overlay */}
      <div className="from-inverse-surface/95 via-inverse-surface/65 absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t to-transparent p-4 pt-12 pr-16">
        <div className="text-sm font-semibold">@{username}</div>
        <div className="text-inverse-foreground/90 mt-1 line-clamp-4 text-sm leading-relaxed whitespace-pre-line">
          {caption.trim() || (
            <span className="text-inverse-foreground/70 italic">Chưa có nội dung TikTok…</span>
          )}
        </div>
        <div className="text-inverse-foreground/80 mt-2 flex items-center gap-2 text-xs">
          <Music className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">Âm thanh gốc — {channelName || "VPOST"}</span>
        </div>
      </div>
    </div>
  );
}
