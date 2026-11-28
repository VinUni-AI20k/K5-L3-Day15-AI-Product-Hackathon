"use client";

import { Globe, Heart, MessageCircle, Share2, ThumbsUp } from "lucide-react";
import Image from "next/image";
import { useState } from "react";

import { MediaThumb } from "@/ui/components/compose/MediaThumb";
import type { MediaAsset } from "@/ui/schemas/compose.schema";
import { mediaPreviewUrl } from "@/ui/services/media-preview";

export interface FacebookPreviewProps {
  channelName: string;
  avatarUrl?: string;
  caption: string;
  media: readonly MediaAsset[];
  isVideo: boolean;
  isReels?: boolean;
}

export function FacebookPreview({
  channelName,
  avatarUrl,
  caption,
  media,
  isVideo,
}: FacebookPreviewProps) {
  const [expanded, setExpanded] = useState(false);
  const cutoff = 160;
  const isCut = !expanded && caption.trim().length > cutoff;

  const firstAsset = media[0];
  const firstVideoUrl = firstAsset && isVideo ? mediaPreviewUrl(firstAsset.driveFileId) : null;

  return (
    <div className="border-border bg-card flex flex-col overflow-hidden rounded-xl border shadow-[var(--shadow-card)]">
      {/* Header */}
      <div className="border-border flex items-center gap-3 border-b px-4 py-3.5">
        <div className="bg-accent text-accent-foreground flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold">
          {avatarUrl ? (
            <Image
              src={avatarUrl}
              alt=""
              width={40}
              height={40}
              unoptimized
              className="size-full rounded-full object-cover"
            />
          ) : (
            channelName.slice(0, 2).toUpperCase() || "FB"
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-0.5 leading-tight">
          <span className="text-foreground truncate text-sm font-semibold">
            {channelName || "Page Facebook của bạn"}
          </span>
          <div className="text-foreground-subtle flex items-center gap-1 text-xs">
            <span>Vừa xong ·</span>
            <Globe className="size-3.5 shrink-0" aria-hidden="true" />
          </div>
        </div>
      </div>

      {/* Caption Text */}
      <div className="text-foreground px-4 py-3.5 text-sm leading-relaxed whitespace-pre-line">
        {caption.trim().length === 0 ? (
          <span className="text-muted-foreground italic">Chưa có nội dung bài viết…</span>
        ) : isCut ? (
          <span>
            {caption.trim().slice(0, cutoff)}…{" "}
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="text-accent-foreground focus-visible:ring-ring cursor-pointer rounded-sm font-semibold outline-none hover:underline focus-visible:ring-2"
            >
              Xem thêm
            </button>
          </span>
        ) : (
          <span>{caption.trim()}</span>
        )}
      </div>

      {/* Media Rendering */}
      {isVideo && firstVideoUrl ? (
        <div className="bg-inverse-surface relative aspect-video w-full overflow-hidden">
          <video
            src={firstVideoUrl}
            controls
            playsInline
            className="h-full w-full object-contain"
          />
        </div>
      ) : media.length === 0 ? (
        <div className="bg-[var(--bg-subtle)] text-muted-foreground flex aspect-video w-full items-center justify-center px-4 text-center text-sm">
          Chưa có hình ảnh/video đính kèm
        </div>
      ) : media.length === 1 ? (
        <div className="bg-muted relative aspect-square w-full overflow-hidden">
          <MediaThumb asset={media[0]} alt="" lazy={false} />
        </div>
      ) : (
        /* Facebook Multi-image Collage */
        <div className="bg-border grid grid-cols-[1.5fr_1fr] gap-1 p-1">
          <div className="flex flex-col gap-1">
            {media.slice(0, 2).map((asset, i) => (
              <div key={`${asset.driveFileId}-${i}`} className="bg-muted relative h-44 overflow-hidden">
                <MediaThumb asset={asset} alt="" lazy={i > 0} />
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-1">
            {media.slice(2, 5).map((asset, i) => {
              const overflow = Math.max(0, media.length - 5);
              const isLast = i === media.slice(2, 5).length - 1;
              return (
                <div
                  key={`${asset.driveFileId}-${i}`}
                  className="bg-muted relative min-h-20 flex-1 overflow-hidden"
                >
                  <MediaThumb asset={asset} alt="" />
                  {overflow > 0 && isLast && (
                    <span className="bg-inverse-surface/75 text-inverse-foreground absolute inset-0 flex items-center justify-center text-lg font-semibold">
                      +{overflow}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Social Reactions Row */}
      <div className="border-border text-muted-foreground flex flex-wrap items-center justify-between gap-2 border-t px-4 py-2.5 text-xs">
        <div className="flex items-center gap-2">
          <span className="flex items-center -space-x-1" aria-hidden="true">
            <span className="border-card bg-info/15 text-info-foreground flex size-5 items-center justify-center rounded-full border">
              <ThumbsUp className="size-3" aria-hidden="true" />
            </span>
            <span className="border-card bg-destructive/15 text-destructive flex size-5 items-center justify-center rounded-full border">
              <Heart className="size-3" aria-hidden="true" />
            </span>
          </span>
          <span>Bạn và 18 người khác</span>
        </div>
        <div>5 bình luận · 2 lượt chia sẻ</div>
      </div>

      {/* Social Action Bar (decorative preview chrome) */}
      <div className="border-border text-muted-foreground flex items-center justify-between border-t px-2 py-1.5 text-sm font-medium">
        <span className="flex min-h-10 flex-1 items-center justify-center gap-2 rounded-lg">
          <ThumbsUp className="size-4 shrink-0" aria-hidden="true" />
          <span>Thích</span>
        </span>

        <span className="flex min-h-10 flex-1 items-center justify-center gap-2 rounded-lg">
          <MessageCircle className="size-4 shrink-0" aria-hidden="true" />
          <span>Bình luận</span>
        </span>

        <span className="flex min-h-10 flex-1 items-center justify-center gap-2 rounded-lg">
          <Share2 className="size-4 shrink-0" aria-hidden="true" />
          <span>Chia sẻ</span>
        </span>
      </div>
    </div>
  );
}
