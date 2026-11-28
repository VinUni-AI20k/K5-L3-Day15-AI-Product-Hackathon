import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { BatchChannelStatus } from "@/ui/schemas/post-batch.schema";

import { BatchChannelTable } from "../BatchChannelTable";

/**
 * Presentational and accessibility regressions for BatchChannelTable.
 *
 * Uses `renderToStaticMarkup` (vitest runs in `environment: "node"` with no
 * jsdom) to assert directly on the emitted HTML for the search input focus
 * ring (L3) and semantic token classes (M2).
 */

function makeChannel(overrides: Partial<BatchChannelStatus> = {}): BatchChannelStatus {
  return {
    channelId: "fb-1",
    postJobId: "job-1",
    status: "published",
    productOrigin: "sheet",
    attemptCount: 1,
    publishedPostId: "123",
    publishedUrl: "https://facebook.com/post-123",
    publishedAt: "2054-08-13T03:00:00.000Z",
    lastErrorCode: null,
    userMessage: "Đã đăng.",
    progress: null,
    ...overrides,
  };
}

describe("BatchChannelTable — focus ring and token contract", () => {
  it("gives the search input a full-contrast 2px focus-visible ring with 2px offset", () => {
    const html = renderToStaticMarkup(
      <BatchChannelTable channels={[makeChannel()]} progressSteps={["Chuẩn bị", "Đăng bài"]} />,
    );

    const inputTag = html.match(/<input\b[^>]*>/)?.[0];
    expect(inputTag, "expected channel search <input>").toBeDefined();

    const classMatch = inputTag!.match(/class="([^"]*)"/);
    expect(classMatch, "expected class attribute on search <input>").not.toBeNull();
    const classes = classMatch![1].split(/\s+/);

    // ui-foundations §6 / review L3: 2px accent ring at full contrast with 2px offset.
    expect(classes).toContain("focus-visible:ring-ring");
    expect(classes).toContain("focus-visible:ring-2");
    expect(classes).toContain("focus-visible:ring-offset-2");
    expect(classes).toContain("focus-visible:ring-offset-background");
    expect(classes).not.toContain("focus-visible:ring-ring/40");
    expect(classes).not.toContain("focus-visible:ring-ring/30");
  });

  it("uses semantic token utilities rather than arbitrary [var(--...)] classes", () => {
    const html = renderToStaticMarkup(
      <BatchChannelTable channels={[makeChannel()]} progressSteps={["Chuẩn bị", "Đăng bài"]} />,
    );

    expect(html).not.toMatch(/\[var\(--/);
    expect(html).toContain("bg-sidebar");
    expect(html).toContain("hover:bg-sidebar/70");
  });
});
