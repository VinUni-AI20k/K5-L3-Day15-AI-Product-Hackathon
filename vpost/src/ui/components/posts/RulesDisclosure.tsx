"use client";

import { Collapsible } from "@astryxdesign/core";
import type { ReactNode } from "react";

/**
 * "Chi tiết quy tắc", folded (spec §3.4).
 *
 * The rules of a screen — múi giờ, who is holding a post, what re-running does
 * to stock — are read ONCE and then remembered; leaving them open as a
 * five-sentence paragraph makes every later visit pay for that first read. The
 * intro above keeps two sentences, this keeps everything else, and nothing was
 * deleted: the wave-2 brief says change the dose, not the information.
 *
 * Closed by default (`defaultIsOpen` is `true` in Astryx). It stays closed on
 * every visit — remembering "this operator has read it" needs per-user
 * persistence, which the spec explicitly left out of this wave.
 */
export function RulesDisclosure({
  children,
  label = "Chi tiết quy tắc",
}: {
  children: ReactNode;
  label?: string;
}) {
  return (
    <div className="border-border bg-card max-w-prose rounded-xl border px-4 py-2 transition-colors duration-150 ease-out">
      <Collapsible
        defaultIsOpen={false}
        trigger={<span className="text-foreground text-sm leading-5 font-medium">{label}</span>}
      >
        <div className="text-muted-foreground space-y-2 pt-1 pb-3 text-sm leading-relaxed">
          {children}
        </div>
      </Collapsible>
    </div>
  );
}
