import { Button } from "@astryxdesign/core";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/ui/hooks/useMe", () => ({
  useActiveTenant: () => ({
    role: "owner",
    tenant: { id: "t-1", name: "Công ty A" },
    isResolved: true,
  }),
  useMe: () => ({
    data: { account: { platformRole: null } },
  }),
}));

vi.mock("@/ui/hooks/useMembers", () => ({
  useMembers: () => ({
    data: { items: [] },
    isPending: false,
    fetchStatus: "idle",
    isError: false,
    error: null,
    isFetching: false,
    refetch: vi.fn(),
  }),
  useUpdateMemberRole: () => ({
    isPending: false,
    isError: false,
    error: null,
    variables: undefined,
    reset: vi.fn(),
    mutate: vi.fn(),
  }),
  useRemoveMember: () => ({
    isPending: false,
    isError: false,
    error: null,
    variables: undefined,
    reset: vi.fn(),
    mutate: vi.fn(),
  }),
}));

vi.mock("@/ui/hooks/useInvites", () => ({
  useInvites: () => ({
    data: { items: [] },
    isPending: false,
    fetchStatus: "idle",
    isError: false,
    error: null,
    refetch: vi.fn(),
  }),
  useCreateInvite: () => ({
    isPending: false,
    isError: false,
    isSuccess: false,
    error: null,
    data: undefined,
    reset: vi.fn(),
    mutate: vi.fn(),
  }),
  useRevokeInvite: () => ({
    isPending: false,
    isError: false,
    error: null,
    variables: undefined,
    reset: vi.fn(),
    mutate: vi.fn(),
  }),
}));

vi.mock("@/ui/hooks/useDelayedFlag", () => ({
  useDelayedFlag: () => false,
}));

vi.mock("@/ui/hooks/useNowMs", () => ({
  useNowMs: () => Date.UTC(2026, 10, 28, 3, 0, 0),
}));

import { MembersScreen } from "@/ui/components/members/MembersScreen";

function extractButtonClass(html: string): string {
  const match = html.match(/<button[^>]*class="([^"]+)"/);
  if (!match?.[1]) throw new Error(`No button class found in: ${html}`);
  return match[1];
}

function getAllButtonTags(html: string): string[] {
  return html.match(/<button\b[\s\S]*?<\/button>/g) ?? [];
}

describe("MembersScreen empty state button hierarchy (L1)", () => {
  const primaryClasses = new Set(
    extractButtonClass(renderToStaticMarkup(<Button variant="primary" label="probe" />)).split(
      /\s+/,
    ),
  );
  const secondaryClasses = new Set(
    extractButtonClass(renderToStaticMarkup(<Button variant="secondary" label="probe" />)).split(
      /\s+/,
    ),
  );
  // Classes present on primary Astryx buttons and absent on secondary ones.
  const primaryOnlyClasses = [...primaryClasses].filter((cls) => !secondaryClasses.has(cls));

  function isPrimaryButton(buttonHtml: string): boolean {
    const classes = new Set(extractButtonClass(buttonHtml).split(/\s+/));
    return primaryOnlyClasses.length > 0 && primaryOnlyClasses.every((cls) => classes.has(cls));
  }

  it("keeps a single primary CTA (Tạo link mời) when showInvites is enabled and the member list is empty", () => {
    const html = renderToStaticMarkup(<MembersScreen />);

    expect(html).toContain("<h3");
    expect(html).toContain("Danh sách thành viên đang trống");

    const buttons = getAllButtonTags(html);
    const primaryButtons = buttons.filter(isPrimaryButton);
    const reloadButtons = buttons.filter((button) => button.includes("Tải lại"));

    expect(primaryButtons).toHaveLength(1);
    expect(primaryButtons[0]).toContain("Tạo link mời");
    expect(reloadButtons.length).toBeGreaterThanOrEqual(2);
    for (const reloadButton of reloadButtons) {
      expect(isPrimaryButton(reloadButton)).toBe(false);
    }
  });

  it("renders the empty-state Tải lại button as secondary in hub mode (showInvites=false)", () => {
    const html = renderToStaticMarkup(<MembersScreen showInvites={false} />);

    expect(html).toContain("Danh sách thành viên đang trống");

    const buttons = getAllButtonTags(html);
    const primaryButtons = buttons.filter(isPrimaryButton);
    const reloadButtons = buttons.filter((button) => button.includes("Tải lại"));

    expect(primaryButtons).toHaveLength(0);
    expect(reloadButtons).toHaveLength(2);
  });
});
