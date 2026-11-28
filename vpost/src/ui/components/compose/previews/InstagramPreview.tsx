"use client";

import {
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Heart,
  MessageCircle,
  MoreHorizontal,
  Send,
} from "lucide-react";
import Image from "next/image";
import { useState } from "react";

import { MediaThumb } from "@/ui/components/compose/MediaThumb";
import type { MediaAsset } from "@/ui/schemas/compose.schema";
import { mediaPreviewUrl } from "@/ui/services/media-preview";

export interface InstagramPreviewProps {
  channelName: string;
  avatarUrl?: string;
  caption: string;
  media: readonly MediaAsset[];
  isVideo: boolean;
}

export function InstagramPreview({
  channelName,
  avatarUrl,
  caption,
  media,
  isVideo,
}: InstagramPreviewProps) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const firstAsset = media[0];
  const firstVideoUrl = firstAsset && isVideo ? mediaPreviewUrl(firstAsset.driveFileId) : null;
  const username = channelName ? channelName.toLowerCase().replace(/\s+/g, "_") : "vpost_fashion";

  return (
    <div className="border-border bg-card flex flex-col overflow-hidden rounded-xl border shadow-[var(--shadow-card)]">
      {/* Header */}
      <div className="border-border flex items-center justify-between border-b px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          {/* Story Ring Avatar using semantic accent tokens */}
          <div className="rounded-full bg-gradient-to-tr from-[var(--accent-orange)] via-[var(--accent-pink)] to-[var(--accent-purple-strong)] p-0.5">
            <div className="bg-card text-foreground flex size-9 items-center justify-center overflow-hidden rounded-full text-xs font-semibold">
              {avatarUrl ? (
                <Image
                  src={avatarUrl}
                  alt=""
                  width={36}
                  height={36}
                  unoptimized
                  className="size-full object-cover"
                />
              ) : (
                channelName.slice(0, 2).toUpperCase() || "IG"
              )}
            </div>
          </div>
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-foreground truncate text-sm leading-tight font-semibold">
              {username}
            </span>
            <span className="text-foreground-subtle text-xs">Âm thanh gốc</span>
          </div>
        </div>

        <MoreHorizontal
          className="text-muted-foreground size-5 shrink-0"
          aria-hidden="true"
        />
      </div>

      {/* Media Rendering */}
      {isVideo && firstVideoUrl ? (
        <div className="bg-inverse-surface relative aspect-square w-full overflow-hidden">
          <video
            src={firstVideoUrl}
            controls
            playsInline
            className="size-full object-cover"
          />
        </div>
      ) : media.length === 0 ? (
        <div className="bg-[var(--bg-subtle)] text-muted-foreground flex aspect-square w-full items-center justify-center px-4 text-center text-sm">
          Chưa có hình ảnh Instagram
        </div>
      ) : (
        <div className="bg-muted relative aspect-square w-full overflow-hidden">
          <MediaThumb asset={media[currentSlide] ?? media[0]} alt="" lazy={false} />
          {media.length > 1 && (
            <div className="bg-inverse-surface/80 text-inverse-foreground absolute top-3 right-3 rounded-full px-2.5 py-0.5 text-xs font-medium tabular-nums backdrop-blur-xs">
              {currentSlide + 1}/{media.length}
            </div>
          )}

          {/* Slider Prev / Next Controls if multi-image */}
          {media.length > 1 && (
            <div className="pointer-events-none absolute inset-x-2 top-1/2 flex -translate-y-1/2 items-center justify-between">
              <button
                type="button"
                aria-label="Ảnh trước"
                onClick={() => setCurrentSlide((prev) => (prev > 0 ? prev - 1 : media.length - 1))}
                className="bg-inverse-surface/75 hover:bg-inverse-surface text-inverse-foreground focus-visible:ring-ring pointer-events-auto flex size-10 cursor-pointer items-center justify-center rounded-full backdrop-blur-xs transition-colors duration-150 outline-none focus-visible:ring-2"
              >
                <ChevronLeft className="size-5" aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label="Ảnh tiếp theo"
                onClick={() => setCurrentSlide((prev) => (prev < media.length - 1 ? prev + 1 : 0))}
                className="bg-inverse-surface/75 hover:bg-inverse-surface text-inverse-foreground focus-visible:ring-ring pointer-events-auto flex size-10 cursor-pointer items-center justify-center rounded-full backdrop-blur-xs transition-colors duration-150 outline-none focus-visible:ring-2"
              >
                <ChevronRight className="size-5" aria-hidden="true" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Action Bar (decorative preview chrome) */}
      <div className="text-foreground flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-4">
          <Heart className="size-5 shrink-0" aria-hidden="true" />
          <MessageCircle className="size-5 shrink-0" aria-hidden="true" />
          <Send className="size-5 shrink-0" aria-hidden="true" />
        </div>
        <Bookmark className="size-5 shrink-0" aria-hidden="true" />
      </div>

      {/* Likes */}
      <div className="text-foreground px-4 text-sm font-semibold">128 lượt thích</div>

      {/* Caption with bold username */}
      <div className="text-foreground px-4 pt-1.5 pb-4 text-sm leading-relaxed">
        <strong className="text-foreground mr-1.5 font-semibold">{username}</strong>
        <span className="whitespace-pre-line">
          {caption.trim() || <span className="text-muted-foreground italic">Chưa có caption…</span>}
        </span>
        <p className="text-muted-foreground mt-2 text-xs">Xem tất cả 12 bình luận</p>
        <p className="text-foreground-subtle mt-1 text-xs">Vừa xong</p>
      </div>
    </div>
  );
}
