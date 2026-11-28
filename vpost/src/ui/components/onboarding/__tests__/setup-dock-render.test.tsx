import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DockPanel } from "@/ui/components/onboarding/SetupDock";
import type { SetupProgress } from "@/ui/schemas/setup-progress.schema";

const SAMPLE_PROGRESS: SetupProgress = {
  tenantId: "t-1",
  steps: [
    { id: "tenant", isDone: true },
    { id: "google", isDone: false },
    { id: "source", isDone: false },
    { id: "facebook", isDone: false },
    { id: "group", isDone: false },
    { id: "firstPost", isDone: false },
  ],
  doneCount: 1,
  requiredCount: 5,
  isReady: false,
};

describe("SetupDock (DockPanel) — L2 completed-step icon accessibility", () => {
  it("replaces the raw Unicode checkmark with a decorative aria-hidden Lucide Check icon", () => {
    const html = renderToStaticMarkup(
      <DockPanel isInline progress={SAMPLE_PROGRESS} onCollapse={() => {}} />,
    );

    expect(html).not.toContain("✓");

    // Extract the completed first row ("Tạo tổ chức") and verify its trailing
    // status icon is an SVG hidden from assistive technology.
    const firstRowMatch = html.match(/<li>[\s\S]*?<\/li>/);
    expect(firstRowMatch).not.toBeNull();
    const completedRow = firstRowMatch?.[0] ?? "";
    expect(completedRow).toContain("Tạo tổ chức");

    const svgs = completedRow.match(/<svg\b[^>]*>/g) ?? [];
    // Left completion badge icon + right status icon
    expect(svgs).toHaveLength(2);
    // Right status icon itself carries aria-hidden="true"
    expect(svgs[1]).toContain('aria-hidden="true"');
  });

  it("keeps locked step explanations in sr-only and shows minute estimates on pending steps", () => {
    const html = renderToStaticMarkup(
      <DockPanel isInline progress={SAMPLE_PROGRESS} onCollapse={() => {}} />,
    );

    expect(html).toContain("Cần kết nối Google Drive trước.");
    expect(html).toContain("2 ph");
  });
});
