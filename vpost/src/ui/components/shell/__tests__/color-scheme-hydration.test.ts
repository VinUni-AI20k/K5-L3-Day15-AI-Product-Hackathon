import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * The dark-mode bootstrap script (`COLOR_SCHEME_BOOTSTRAP_SCRIPT`) runs
 * synchronously before hydration when the viewer preference is `"system"` and
 * adds `.dark` to `document.documentElement`. Without `suppressHydrationWarning`
 * on `<html>`, React reports a root `<html className>` hydration mismatch on
 * every route in dark OS mode (surfacing as a Next dev overlay issue on
 * `/overview`, `/comments`, `/compose`, etc.).
 *
 * Pinned here in the same structural-test style as `scroll-containment.test.ts`
 * so a cleanup pass does not accidentally remove the attribute.
 */
function readLayoutSource(): string {
  const source = readFileSync(
    fileURLToPath(new URL("../../../../app/layout.tsx", import.meta.url)),
    "utf8",
  );
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

describe("root html dark-mode hydration contract", () => {
  it("sets suppressHydrationWarning on <html> alongside the bootstrap script", () => {
    const layout = readLayoutSource();
    const htmlOpenTag = layout.match(/<html\b[^>]*>/)?.[0] ?? "";

    expect(layout).toContain("COLOR_SCHEME_BOOTSTRAP_SCRIPT");
    expect(htmlOpenTag, "expected root <html> opening tag in app/layout.tsx").not.toBe("");
    expect(htmlOpenTag).toContain("suppressHydrationWarning");
  });
});
