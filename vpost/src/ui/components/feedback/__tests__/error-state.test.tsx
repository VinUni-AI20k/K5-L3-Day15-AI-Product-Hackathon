import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ApiErrorNotice } from "@/ui/components/feedback/ApiErrorNotice";
import { ErrorState } from "@/ui/components/feedback/ErrorState";
import { ApiError } from "@/ui/services/api-error";

/**
 * Regression suite for the M3 contract owned by `feedback/` and its callers in
 * `access/`, `platform/`, and `tenant/`:
 *   1. `ErrorState` focuses its `role="alert"` container on mount by default
 *      (`shouldFocus = true`) and keeps `secondaryAction` inside the alert
 *      container with `flex-wrap` so mobile buttons wrap without crushing copy.
 *   2. `ApiErrorNotice` forwards `extraAction` inside `role="alert"` and keeps
 *      `shouldFocus` enabled by default.
 *   3. No `<ApiErrorNotice>` call site in `access/`, `platform/`, or `tenant/`
 *      suppresses focus with `shouldFocus={false}`.
 */

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

function readSource(relative: string): string {
  return stripComments(readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8"));
}

describe("ErrorState focus and action placement contract", () => {
  it("renders role=alert, tabIndex=-1, and keeps secondaryAction inside the alert with flex-wrap", () => {
    const markup = renderToStaticMarkup(
      <ErrorState
        title="Không lưu được"
        description="Vui lòng thử lại."
        secondaryAction={<button type="button">Đã đọc, ẩn cảnh báo</button>}
      />,
    );

    expect(markup).toMatch(/^<div\b[^>]*role="alert"[^>]*tabindex="-1"/);
    expect(markup).toContain("flex-wrap");
    expect(markup).toContain("Đã đọc, ẩn cảnh báo");
    // secondaryAction sits inside the outer role="alert" root element, not as a sibling.
    expect(markup.indexOf("Đã đọc, ẩn cảnh báo")).toBeLessThan(markup.lastIndexOf("</div>"));
  });

  it("defaults shouldFocus to true and focuses the container ref in an effect", () => {
    const source = readSource("../ErrorState.tsx");

    expect(source).toMatch(/shouldFocus\s*=\s*true/);
    expect(source).toMatch(
      /useEffect\(\(\)\s*=>\s*\{\s*if\s*\(!shouldFocus\)\s*return;\s*containerRef\.current\?\.focus\(\{\s*preventScroll:\s*true\s*\}\);\s*\},\s*\[shouldFocus\]\)/,
    );
  });
});

describe("ApiErrorNotice keeps extraAction inside role=alert", () => {
  it("renders extraAction inside the alert for non-auth errors", () => {
    const error = new ApiError({
      status: 500,
      code: "INTERNAL_ERROR",
      userMessage: "Máy chủ bận",
    });
    const markup = renderToStaticMarkup(
      <ApiErrorNotice
        error={error}
        extraAction={<button type="button">Về trang chủ</button>}
      />,
    );

    expect(markup).toMatch(/^<div\b[^>]*role="alert"/);
    expect(markup).toContain("Về trang chủ");
    expect(markup.indexOf("Về trang chủ")).toBeLessThan(markup.lastIndexOf("</div>"));
  });
});

describe("access, platform, and tenant callers do not suppress ApiErrorNotice focus", () => {
  const CALLERS = [
    "../../access/AccessRequestsScreen.tsx",
    "../../platform/PlatformScreen.tsx",
    "../../platform/SupportSessionDialog.tsx",
    "../../platform/CreatePlatformTenantDialog.tsx",
    "../../tenant/CreateTenantForm.tsx",
    "../../tenant/TenantHealthPanel.tsx",
    "../../tenant/TenantBoundary.tsx",
    "../../tenant/JoinInviteScreen.tsx",
    "../../tenant/TenantPicker.tsx",
    "../../tenant/JoinInviteForm.tsx",
  ] as const;

  it.each(CALLERS)("%s never sets shouldFocus={false} on ApiErrorNotice", (file) => {
    const source = readSource(file);
    const notices = [...source.matchAll(/<ApiErrorNotice\b[\s\S]*?\/>/g)].map((m) => m[0]);

    expect(notices.length, `${file} no longer renders ApiErrorNotice`).toBeGreaterThan(0);
    for (const notice of notices) {
      expect(notice).not.toMatch(/shouldFocus=\{\s*false\s*\}/);
    }
  });
});
