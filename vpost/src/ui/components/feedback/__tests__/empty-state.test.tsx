import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { EmptyState, type EmptyHeadingLevel } from "@/ui/components/feedback/EmptyState";

/**
 * Regression suite for M4: migrating screens from `@astryxdesign/core`'s
 * `EmptyState` to `@/ui/components/feedback/EmptyState` must preserve semantic
 * heading levels in the document outline (`<h2>`/`<h3>`/`<h4>`) without
 * altering visual styling, while keeping `<p>` as the default when omitted.
 */

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

describe("EmptyState heading semantics", () => {
  it("renders a plain <p> when headingLevel is omitted", () => {
    const markup = renderToStaticMarkup(
      <EmptyState kind="idle" title="Chưa có dữ liệu" description="Mô tả trạng thái trống." />,
    );

    expect(markup).toContain(
      '<p class="text-foreground text-base leading-6 font-semibold">Chưa có dữ liệu</p>',
    );
    expect(markup).not.toMatch(/<h[1-6]\b/);
  });

  it.each([1, 2, 3, 4, 5, 6] as const satisfies readonly EmptyHeadingLevel[])(
    "renders an <h%i> with unchanged visual classes when headingLevel={%i}",
    (level) => {
      const markup = renderToStaticMarkup(
        <EmptyState
          kind="no-result"
          headingLevel={level}
          title="Không tìm thấy kết quả"
          description="Thử đổi bộ lọc."
        />,
      );

      expect(markup).toContain(
        `<h${level} class="text-foreground text-base leading-6 font-semibold">Không tìm thấy kết quả</h${level}>`,
      );
    },
  );
});

describe("migrated screens preserve their EmptyState heading levels", () => {
  const EXPECTED: readonly (readonly [string, number, number])[] = [
    ["../../access/AccessForbidden.tsx", 3, 1],
    ["../../access/AccessRequestsScreen.tsx", 4, 3],
    ["../../platform/PlatformForbidden.tsx", 2, 1],
    ["../../platform/PlatformScreen.tsx", 3, 1],
  ];

  it.each(EXPECTED)("%s sets headingLevel={%i} on all %i EmptyState block(s)", (file, level, count) => {
    const source = stripComments(
      readFileSync(fileURLToPath(new URL(file, import.meta.url)), "utf8"),
    );
    const blocks = [...source.matchAll(/<EmptyState\b[\s\S]*?\/>/g)].map((m) => m[0]);

    expect(blocks).toHaveLength(count);
    for (const block of blocks) {
      expect(block).toContain(`headingLevel={${level}}`);
    }
  });
});
