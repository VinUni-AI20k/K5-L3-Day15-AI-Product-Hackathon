import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * Regression pins for /bulk and /batches review findings M1, M2, and L3:
 * - M1: ScopeDisclosure must keep vertical padding >= radius/2 for rounded-xl
 *   (>= 7px) and give the Astryx <Collapsible> trigger a >= 40px touch target
 *   so Vietnamese diacritics never clip on the bottom border.
 * - M2: No arbitrary `[var(--...)]` Tailwind bracket classes in bulk/ or batch/.
 * - L3: The template preview `<select>` uses a full-contrast 2px focus-visible
 *   ring with 2px offset.
 */

const TAILWIND_STEP_PX = 4;

const OWNED_COMPONENT_FILES = [
  "../BulkRunScreen.tsx",
  "../BulkCodesField.tsx",
  "../BulkProgressTable.tsx",
  "../../batch/BatchChannelTable.tsx",
  "../../batch/BatchStatusScreen.tsx",
  "../../batch/BatchStatusSkeleton.tsx",
  "../../batch/BatchSummaryCard.tsx",
  "../../batch/ChannelProgress.tsx",
  "../../batch/ProgressStepper.tsx",
] as const;

function readRelative(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");
}

describe("BulkRunScreen ScopeDisclosure & preview focus ring", () => {
  it("pads ScopeDisclosure for rounded-xl (>= 7px) and gives the Collapsible trigger a >= 40px target", () => {
    const source = readRelative("../BulkRunScreen.tsx");
    const start = source.indexOf("function ScopeDisclosure(");
    expect(start, "ScopeDisclosure helper missing").toBeGreaterThan(-1);

    const block = source.slice(start);
    const sectionClass = /<section[\s\S]*?className="([^"]*)"/.exec(block)?.[1];
    expect(sectionClass, "ScopeDisclosure <section> className missing").toBeDefined();

    // rounded-xl is 14px in globals.css (@theme inline), so vertical padding must be >= 7px.
    const pyMatch = /(?:^|\s)py-(\d+(?:\.\d+)?)(?:\s|$)/.exec(sectionClass!);
    expect(pyMatch, "ScopeDisclosure <section> must declare vertical padding").not.toBeNull();
    expect(Number(pyMatch![1]) * TAILWIND_STEP_PX).toBeGreaterThanOrEqual(7);
    expect(sectionClass).toContain("bg-sidebar");

    // Astryx standalone <Collapsible> zeroes padding-block on its <button>;
    // the trigger content itself must reserve a >= 40px touch height.
    const triggerClass = /trigger=\{[\s\S]*?className="([^"]*)"/.exec(block)?.[1];
    expect(triggerClass, "ScopeDisclosure trigger className missing").toBeDefined();
    const minHMatch = /(?:^|\s)min-h-(\d+(?:\.\d+)?)(?:\s|$)/.exec(triggerClass!);
    expect(minHMatch, "ScopeDisclosure trigger must declare min-h-*").not.toBeNull();
    expect(Number(minHMatch![1]) * TAILWIND_STEP_PX).toBeGreaterThanOrEqual(40);
  });

  it("gives the preview code <select> a full-contrast 2px focus-visible ring with 2px offset", () => {
    const source = readRelative("../BulkRunScreen.tsx");
    const labelIndex = source.indexOf('aria-label="Chọn mã sản phẩm để xem trước"');
    expect(labelIndex, "preview code <select> missing").toBeGreaterThan(-1);

    const selectBlock = source.slice(labelIndex, source.indexOf("</select>", labelIndex));
    const className = /className="([^"]*)"/.exec(selectBlock)?.[1];
    expect(className, "preview code <select> className missing").toBeDefined();
    const classes = className!.split(/\s+/);

    expect(classes).toContain("focus-visible:ring-ring");
    expect(classes).toContain("focus-visible:ring-2");
    expect(classes).toContain("focus-visible:ring-offset-2");
    expect(classes).toContain("focus-visible:ring-offset-sidebar");
    expect(classes).not.toContain("focus-visible:ring-ring/40");
    expect(classes).not.toContain("focus-visible:ring-ring/30");
  });
});

describe("bulk/ and batch/ avoid arbitrary [var(--...)] Tailwind classes", () => {
  it.each(OWNED_COMPONENT_FILES)("%s has no [var(--...)] utility classes", (file) => {
    const source = readRelative(file);
    expect(source).not.toMatch(/\[var\(--/);
  });
});
