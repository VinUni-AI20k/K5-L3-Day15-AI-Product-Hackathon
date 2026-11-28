import { readFileSync } from "node:fs";
import { join } from "node:path";

import { Toast } from "@astryxdesign/core";
import { InternationalizationProvider } from "@astryxdesign/core/i18n";
import { ToastViewport } from "@astryxdesign/core/Toast";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ASTRYX_LOCALE, ASTRYX_VI } from "@/ui/i18n/astryx-vi";

const ASTRYX_EN_LOCALE_PATH = join(
  process.cwd(),
  "node_modules/@astryxdesign/core/locales/en.json",
);

interface AstryxLocaleEntry {
  readonly defaultMessage: string;
  readonly description?: string;
}

function loadAstryxEnglishCatalog(): Record<string, AstryxLocaleEntry> {
  const raw = readFileSync(ASTRYX_EN_LOCALE_PATH, "utf8");
  return JSON.parse(raw) as Record<string, AstryxLocaleEntry>;
}

describe("ASTRYX_VI toast i18n", () => {
  it("translates every @astryx.toast.* key defined by the installed @astryxdesign/core", () => {
    const enCatalog = loadAstryxEnglishCatalog();
    const toastKeys = Object.keys(enCatalog).filter((key) =>
      key.startsWith("@astryx.toast."),
    );

    expect(toastKeys.length).toBeGreaterThanOrEqual(2);
    expect(toastKeys).toContain("@astryx.toast.viewport");
    expect(toastKeys).toContain("@astryx.toast.dismiss");

    for (const key of toastKeys) {
      const viEntry = ASTRYX_VI[key];
      const enMessage = enCatalog[key]?.defaultMessage ?? "";
      const viMessage = typeof viEntry === "string" ? viEntry : viEntry?.defaultMessage;

      expect(viMessage, `Missing Vietnamese translation for ${key}`).toBeTruthy();
      expect(viMessage?.trim().length).toBeGreaterThan(0);
      expect(viMessage).not.toBe(enMessage);
    }
  });

  it("renders Astryx ToastViewport and Toast screen-reader labels in Vietnamese", () => {
    const html = renderToStaticMarkup(
      <InternationalizationProvider
        locale={ASTRYX_LOCALE}
        messages={{ [ASTRYX_LOCALE]: ASTRYX_VI }}
      >
        <ToastViewport>
          <Toast
            type="info"
            body="Minh Thư vừa bình luận"
            isAutoHide
            autoHideDuration={5000}
            isExiting={false}
            onDismiss={() => {}}
          />
        </ToastViewport>
      </InternationalizationProvider>,
    );

    expect(html).toContain('role="region"');
    expect(html).toContain('aria-label="Thông báo"');
    expect(html).toContain('aria-label="Đóng thông báo"');
    expect(html).not.toContain('aria-label="Notifications"');
    expect(html).not.toContain("Dismiss notification");
  });
});
