"use client";

import { Text } from "@astryxdesign/core";
import { ExternalLink, ImageOff } from "lucide-react";
import { useState } from "react";

import { isSafeHttpUrl } from "@/ui/components/products/product-detail-helpers";

/**
 * Product photo thumbnails inside the inspector. Every valid http(s) thumbnail
 * links directly to the original image with `rel="noopener noreferrer"` so
 * operators can inspect details at full resolution without losing their place.
 */
export function ProductImagesGrid({
  code,
  images,
}: {
  code: string;
  images: readonly string[];
}) {
  const safeImages = images.map((url) => url.trim()).filter(isSafeHttpUrl);

  if (safeImages.length === 0) {
    return (
      <Text type="supporting" color="secondary">
        Chưa có ảnh sản phẩm cho mã này.
      </Text>
    );
  }

  return (
    <div className="grid min-w-0 max-w-full grid-cols-3 gap-2">
      {safeImages.map((url, index) => (
        <ProductImageTile key={`${url}:${index}`} code={code} url={url} index={index} />
      ))}
    </div>
  );
}

function ProductImageTile({
  code,
  url,
  index,
}: {
  code: string;
  url: string;
  index: number;
}) {
  const [failed, setFailed] = useState(false);

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Mở ảnh gốc ${index + 1} của mã ${code} trong tab mới`}
      className="group relative block aspect-square overflow-hidden rounded-md border border-border bg-media-empty transition-colors duration-150 ease-out hover:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
    >
      {failed ? (
        <span className="flex size-full flex-col items-center justify-center gap-1 p-2 text-center text-muted-foreground">
          <ImageOff className="size-4 shrink-0" aria-hidden="true" />
          <span className="text-xs leading-tight">Không tải được</span>
        </span>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- ảnh ngoài từ cột ảnh sản phẩm, không qua next/image
        <img
          src={url}
          alt={`Ảnh ${index + 1} của sản phẩm ${code}`}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className="size-full object-cover"
        />
      )}

      <span
        aria-hidden="true"
        className="pointer-events-none absolute right-1.5 bottom-1.5 flex size-6 items-center justify-center rounded-md bg-inverse-surface/80 text-inverse-foreground opacity-0 transition-opacity duration-150 ease-out group-hover:opacity-100 group-focus-visible:opacity-100 motion-reduce:transition-none"
      >
        <ExternalLink className="size-4" aria-hidden="true" />
      </span>
    </a>
  );
}
