"use client";

import { useId, useRef, useState, type DragEvent } from "react";
import { Plus, Trash2, Video as VideoIcon, GripVertical } from "lucide-react";

import { cn } from "@/shared/utils";
import { MediaThumb } from "@/ui/components/compose/MediaThumb";
import type { MediaAsset, MediaKind } from "@/ui/schemas/compose.schema";

export interface InlineMediaGridProps {
  media: readonly MediaAsset[];
  mediaKind: MediaKind;
  onReorder?: (next: MediaAsset[]) => void;
  onRemove?: (index: number) => void;
  onAddFiles?: (files: File[]) => void;
  disabled?: boolean;
  maxFiles?: number;
}

export function InlineMediaGrid({
  media,
  mediaKind,
  onReorder,
  onRemove,
  onAddFiles,
  disabled = false,
  maxFiles = mediaKind === "video" ? 1 : 10,
}: InlineMediaGridProps) {
  const inputId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  const canAddMore = media.length < maxFiles;
  const isVideo = mediaKind === "video";

  const handleFileDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    if (disabled || !canAddMore) return;

    const files = Array.from(e.dataTransfer.files).filter((file) => {
      if (isVideo) return file.type.startsWith("video/");
      return file.type.startsWith("image/");
    });

    if (files.length > 0 && onAddFiles) {
      onAddFiles(files.slice(0, maxFiles - media.length));
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || disabled) return;
    const files = Array.from(e.target.files);
    if (files.length > 0 && onAddFiles) {
      onAddFiles(files.slice(0, maxFiles - media.length));
    }
    e.target.value = "";
  };

  const handleItemDragStart = (e: DragEvent<HTMLDivElement>, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.setData("text/plain", String(index));
  };

  const handleItemDropOn = (e: DragEvent<HTMLDivElement>, targetIndex: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === targetIndex || !onReorder) return;
    const next = [...media];
    const [moved] = next.splice(draggedIndex, 1);
    next.splice(targetIndex, 0, moved);
    onReorder(next);
    setDraggedIndex(null);
  };

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center gap-3">
        {media.map((asset, index) => (
          <div
            key={`${asset.driveFileId}-${index}`}
            draggable={!disabled && media.length > 1}
            onDragStart={(e) => handleItemDragStart(e, index)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => handleItemDropOn(e, index)}
            className={cn(
              "border-border bg-muted group relative size-22 shrink-0 overflow-hidden rounded-lg border transition-colors duration-150",
              draggedIndex === index && "ring-ring opacity-50 ring-2",
              media.length > 1 && "cursor-grab active:cursor-grabbing",
            )}
          >
            <MediaThumb asset={asset} alt={asset.fileName} lazy={index > 0} />

            {/* Top Badge: Ảnh bìa (Cover) */}
            {index === 0 && !isVideo && (
              <span className="bg-inverse-surface/90 text-inverse-foreground absolute top-1.5 left-1.5 rounded-sm px-2 py-0.5 text-xs font-medium backdrop-blur-xs">
                Bìa
              </span>
            )}

            {/* Video Indicator */}
            {isVideo && (
              <span className="bg-inverse-surface/90 text-inverse-foreground absolute bottom-1.5 left-1.5 flex items-center gap-1 rounded-sm px-2 py-0.5 text-xs font-medium backdrop-blur-xs">
                <VideoIcon className="size-3.5" aria-hidden="true" />
                <span>Clip</span>
              </span>
            )}

            {/* Hover / Focus Actions: Drag Grip & Delete */}
            {!disabled && (
              <div className="bg-inverse-surface/60 absolute inset-0 flex items-center justify-between p-1.5 opacity-0 transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100">
                {media.length > 1 && (
                  <span className="text-inverse-foreground" aria-hidden="true">
                    <GripVertical className="size-4" aria-hidden="true" />
                  </span>
                )}
                <span className="flex-1" />
                {onRemove && (
                  <button
                    type="button"
                    aria-label={`Xoá ${asset.fileName}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemove(index);
                    }}
                    className="bg-destructive text-primary-foreground focus-visible:ring-ring flex size-8 cursor-pointer items-center justify-center rounded-full transition-opacity duration-150 outline-none hover:opacity-90 focus-visible:ring-2"
                    title="Xoá file này"
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                  </button>
                )}
              </div>
            )}
          </div>
        ))}

        {/* Dropzone Tile at the end */}
        {canAddMore && (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleFileDrop}
            className="shrink-0"
          >
            <input
              ref={fileInputRef}
              id={inputId}
              type="file"
              accept={
                isVideo
                  ? "video/mp4,video/quicktime,video/webm"
                  : "image/jpeg,image/png,image/webp"
              }
              multiple={!isVideo}
              onChange={handleFileInputChange}
              disabled={disabled}
              className="sr-only"
            />
            <button
              type="button"
              disabled={disabled}
              onClick={() => !disabled && fileInputRef.current?.click()}
              className={cn(
                "border-border bg-card text-muted-foreground hover:border-ring hover:bg-accent hover:text-accent-foreground focus-visible:ring-ring focus-visible:ring-offset-background flex size-22 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed px-1 transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
                isDragOver && "border-ring bg-accent text-accent-foreground",
                disabled && "cursor-not-allowed opacity-40",
              )}
            >
              <Plus className="size-5" aria-hidden="true" />
              <span className="text-center text-xs leading-tight font-medium">
                {isVideo ? "Thêm video" : "Thêm ảnh"}
              </span>
            </button>
          </div>
        )}
      </div>

      <p className="text-muted-foreground text-xs leading-relaxed">
        {isVideo
          ? "Đăng 1 video clip cho bài viết."
          : `Đã chọn ${media.length}/${maxFiles} ảnh. Kéo thả để đổi ảnh bìa.`}
      </p>
    </div>
  );
}
