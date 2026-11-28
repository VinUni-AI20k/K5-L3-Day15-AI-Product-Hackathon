"use client";

import { ChevronDown } from "lucide-react";

import { cn } from "@/shared/utils";

/**
 * The control that turns a folded row ("× 5 kênh") back into the channels it
 * stands for. One component for both /posts tables so the two disclosures
 * cannot drift apart (core-component-reuse).
 *
 * A real `<button aria-expanded aria-controls>`, not a row click: the row also
 * holds links and buttons, and a clickable row swallows them. The chevron is
 * decoration — the label already says "5 kênh", so colour and rotation carry
 * nothing on their own (core-accessibility §5).
 */
export function FoldToggle({
  isOpen,
  onToggle,
  controls,
  label,
  srSuffix,
}: {
  isOpen: boolean;
  onToggle: () => void;
  /** Id of the panel this opens — it exists whether open or closed. */
  controls: string;
  /** What the operator reads: "5 kênh". */
  label: string;
  /** Which row this belongs to, for a screen reader hearing it out of context. */
  srSuffix: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={isOpen}
      aria-controls={controls}
      className="text-foreground hover:bg-muted/60 active:bg-muted focus-visible:ring-ring -mx-2 inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-medium transition-colors duration-150 ease-out outline-none focus-visible:ring-2 focus-visible:ring-offset-2 sm:min-h-8"
    >
      <ChevronDown
        aria-hidden="true"
        className={cn(
          "text-muted-foreground size-4 shrink-0 duration-150 ease-out motion-safe:transition-transform",
          isOpen ? "" : "-rotate-90",
        )}
      />
      {label}
      <span className="sr-only">
        {isOpen ? " — ẩn danh sách kênh" : " — xem danh sách kênh"}
        {srSuffix}
      </span>
    </button>
  );
}
