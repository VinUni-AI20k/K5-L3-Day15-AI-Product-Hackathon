import { describe, expect, it } from "vitest";

import {
  shouldInterceptAnchorNavigation,
  shouldWarnBeforeUnload,
} from "@/ui/components/writing-style/writing-style-dirty-guard";

describe("unsaved-changes dirty guard", () => {
  it("warns on tab close only when dirty and not mid-save", () => {
    expect(shouldWarnBeforeUnload(false, false)).toBe(false);
    expect(shouldWarnBeforeUnload(true, false)).toBe(true);
    expect(shouldWarnBeforeUnload(true, true)).toBe(false);
  });

  it("intercepts same-origin in-app link clicks to another route while dirty", () => {
    expect(
      shouldInterceptAnchorNavigation({
        isDirty: true,
        isSaving: false,
        currentHref: "https://app.vpost.vn/writing-style",
        targetHref: "/posts",
        button: 0,
      }),
    ).toBe(true);

    expect(
      shouldInterceptAnchorNavigation({
        isDirty: true,
        isSaving: false,
        currentHref: "https://app.vpost.vn/writing-style",
        targetHref: "/channels?tab=connected",
        button: 0,
      }),
    ).toBe(true);
  });

  it("does not intercept when clean, saving, opening a new tab, downloading, or staying on the same route", () => {
    const base = {
      isDirty: true,
      isSaving: false,
      currentHref: "https://app.vpost.vn/writing-style",
      targetHref: "/posts",
      button: 0,
    };

    expect(shouldInterceptAnchorNavigation({ ...base, isDirty: false })).toBe(false);
    expect(shouldInterceptAnchorNavigation({ ...base, isSaving: true })).toBe(false);
    expect(shouldInterceptAnchorNavigation({ ...base, targetAttr: "_blank" })).toBe(false);
    expect(shouldInterceptAnchorNavigation({ ...base, hasDownloadAttr: true })).toBe(false);
    expect(shouldInterceptAnchorNavigation({ ...base, metaKey: true })).toBe(false);
    expect(shouldInterceptAnchorNavigation({ ...base, ctrlKey: true })).toBe(false);
    expect(shouldInterceptAnchorNavigation({ ...base, shiftKey: true })).toBe(false);
    expect(shouldInterceptAnchorNavigation({ ...base, button: 1 })).toBe(false);
    expect(shouldInterceptAnchorNavigation({ ...base, targetHref: "#section-voice" })).toBe(
      false,
    );
    expect(
      shouldInterceptAnchorNavigation({ ...base, targetHref: "/writing-style#top" }),
    ).toBe(false);
    expect(
      shouldInterceptAnchorNavigation({ ...base, targetHref: "https://external.example/docs" }),
    ).toBe(false);
    expect(
      shouldInterceptAnchorNavigation({ ...base, targetHref: "mailto:support@vpost.vn" }),
    ).toBe(false);
  });
});
