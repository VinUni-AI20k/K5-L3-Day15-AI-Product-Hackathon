import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  FEATURES_SECTION,
  FEATURE_ITEMS,
  FINAL_CTA_COPY,
  FOOTER_COPY,
  HERO_COPY,
  HERO_MOCK_SAMPLE,
  HOW_IT_WORKS_SECTION,
  HOW_IT_WORKS_STEPS,
  LANDING_BRAND,
  LANDING_CTA_COPY,
  LANDING_METADATA,
  LANDING_NAV_LINKS,
  PAIN_OUTCOME_ITEMS,
  PAIN_OUTCOME_SECTION,
  SAFETY_ITEMS,
  SAFETY_SECTION,
  getAllClaimEntries,
} from "@/ui/components/landing/landing-copy";
import { LandingPageContent } from "@/ui/components/landing/LandingPageContent";

const TEST_DIR = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = resolve(TEST_DIR, "../../../../../..");
const LANDING_CSS_PATH = resolve(TEST_DIR, "../landing.css");
const APP_PAGE_PATH = resolve(TEST_DIR, "../../../../app/page.tsx");

const FORBIDDEN_HYPE_PATTERNS: readonly RegExp[] = [
  /đột phá/iu,
  /\bsiêu\b/iu,
  /tối ưu ho[áa] mọi thứ/iu,
  /thần tốc/iu,
  /cách mạng/iu,
  /bùng nổ/iu,
  /hoàn hảo/iu,
  /\bsố\s*1\b/iu,
  /vượt trội/iu,
  /hàng đầu/iu,
];

function renderLanding(hasSession: boolean): string {
  return renderToStaticMarkup(<LandingPageContent hasSession={hasSession} />);
}

describe("LandingPageContent — structure, landmarks and sections", () => {
  it("renders exactly one h1, landmarks, skip link, and all seven required sections", () => {
    const html = renderLanding(false);

    // Exactly one h1 matching the Hero headline
    const h1Matches = html.match(/<h1\b[^>]*>/g) ?? [];
    expect(h1Matches).toHaveLength(1);
    expect(html).toContain(HERO_COPY.headline);
    expect(html).toContain(HERO_COPY.supporting);

    // Accessibility landmarks and skip link
    expect(html).toContain(`href="#noi-dung-chinh"`);
    expect(html).toContain(LANDING_BRAND.skipToContent);
    expect(html).toContain("<header");
    expect(html).toContain('<main id="noi-dung-chinh"');
    expect(html).toContain("<footer");

    // 1. Top bar anchor links
    for (const nav of LANDING_NAV_LINKS) {
      expect(html).toContain(`href="${nav.href}"`);
      expect(html).toContain(nav.label);
    }

    // 2. Hero secondary anchor + composed product mock (post preview + comment bubble pair)
    expect(html).toContain(LANDING_CTA_COPY.heroSecondary.label);
    expect(html).toContain(`href="${LANDING_CTA_COPY.heroSecondary.href}"`);
    expect(html).toContain(HERO_MOCK_SAMPLE.post.pageName);
    expect(html).toContain(HERO_MOCK_SAMPLE.post.productCodeValue);
    expect(html).toContain(HERO_MOCK_SAMPLE.comments.customerText);
    expect(html).toContain(HERO_MOCK_SAMPLE.comments.autoReplyTag);
    expect(html).toContain(HERO_MOCK_SAMPLE.comments.escalationTag);

    // 3. Pain -> outcome (3 cards + evidence footnotes)
    expect(html).toContain(PAIN_OUTCOME_SECTION.heading);
    expect(PAIN_OUTCOME_ITEMS).toHaveLength(3);
    for (const item of PAIN_OUTCOME_ITEMS) {
      expect(html).toContain(item.painTitle);
      expect(html).toContain(item.outcomeDetail);
      expect(html).toContain(item.evidenceFootnote);
    }

    // 4. Features (4 items + anchor id)
    expect(html).toContain(`id="${FEATURES_SECTION.id}"`);
    expect(html).toContain(FEATURES_SECTION.heading);
    expect(FEATURE_ITEMS).toHaveLength(4);
    for (const feature of FEATURE_ITEMS) {
      expect(html).toContain(feature.title);
      expect(html).toContain(feature.description);
    }

    // 5. How it works (3 steps + anchor id)
    expect(html).toContain(`id="${HOW_IT_WORKS_SECTION.id}"`);
    expect(html).toContain(HOW_IT_WORKS_SECTION.heading);
    expect(HOW_IT_WORKS_STEPS).toHaveLength(3);
    for (const step of HOW_IT_WORKS_STEPS) {
      expect(html).toContain(step.title);
      expect(html).toContain(step.description);
    }

    // 6. Safety ("An toàn" + 4 items + anchor id)
    expect(html).toContain(`id="${SAFETY_SECTION.id}"`);
    expect(html).toContain(SAFETY_SECTION.heading);
    expect(html).toContain(SAFETY_SECTION.calloutBadge);
    expect(SAFETY_ITEMS).toHaveLength(4);
    for (const safety of SAFETY_ITEMS) {
      expect(html).toContain(safety.title);
      expect(html).toContain(safety.description);
    }

    // 7. Final CTA band + footer (© VPOST + /signin)
    expect(html).toContain(FINAL_CTA_COPY.heading);
    expect(html).toContain(FOOTER_COPY.copyright);
    expect(html).toContain(`href="${FOOTER_COPY.signInHref}"`);
  });

  it("renders signed-out CTAs pointing to /signin when visitor has no session", () => {
    const html = renderLanding(false);

    expect(html).toContain(LANDING_CTA_COPY.signedOut.label);
    expect(html).toContain(`href="${LANDING_CTA_COPY.signedOut.href}"`);
    expect(html).toContain(LANDING_CTA_COPY.finalRegister.label);
    expect(html).toContain(`href="${LANDING_CTA_COPY.finalRegister.href}"`);
    expect(html).not.toContain(LANDING_CTA_COPY.signedIn.label);
    expect(html).not.toContain(`href="${LANDING_CTA_COPY.signedIn.href}"`);
  });

  it("switches primary CTAs to 'Vào bảng điều khiển' (/overview) when visitor has a session", () => {
    const html = renderLanding(true);

    expect(html).toContain(LANDING_CTA_COPY.signedIn.label);
    expect(html).toContain(`href="${LANDING_CTA_COPY.signedIn.href}"`);
    expect(html).not.toContain(LANDING_CTA_COPY.finalRegister.label);
    // Footer always keeps the /signin link per spec
    expect(html).toContain(`href="${FOOTER_COPY.signInHref}"`);
  });
});

describe("Landing copy honesty guards", () => {
  it("contains zero forbidden hype words across all landing copy", () => {
    const allTexts = [
      ...getAllClaimEntries().map((entry) => ({ path: entry.path, text: entry.text })),
      { path: "mock.caption", text: HERO_MOCK_SAMPLE.post.caption },
      { path: "mock.reply", text: HERO_MOCK_SAMPLE.comments.pageReplyText },
    ];

    const violations: string[] = [];
    for (const item of allTexts) {
      for (const pattern of FORBIDDEN_HYPE_PATTERNS) {
        if (pattern.test(item.text)) {
          violations.push(`${item.path} matched ${pattern.source}: "${item.text}"`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("allows digits in claims ONLY when paired with an existing evidence/ source", () => {
    const entries = getAllClaimEntries();
    const unsourced: string[] = [];

    for (const entry of entries) {
      if (!/\d/.test(entry.text)) continue;

      if (!entry.evidenceSource || entry.evidenceSource.trim().length === 0) {
        unsourced.push(`${entry.path} contains digits without evidenceSource: "${entry.text}"`);
        continue;
      }

      const sourcePaths = entry.evidenceSource
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean);

      for (const relPath of sourcePaths) {
        if (!relPath.startsWith("evidence/")) {
          unsourced.push(`${entry.path} source must live under evidence/: "${relPath}"`);
          continue;
        }
        const absPath = resolve(REPO_ROOT, relPath);
        if (!existsSync(absPath)) {
          unsourced.push(`${entry.path} references missing evidence file: "${relPath}"`);
        }
      }
    }

    expect(unsourced).toEqual([]);
  });
});

describe("Landing route metadata, CSS tokens, and static-friendliness", () => {
  it("exports required title, canonical URL, Open Graph, and avoids force-dynamic in page.tsx", () => {
    expect(LANDING_METADATA.title).toBe("VPOST — Đăng bài và trả lời bình luận cho shop online");
    expect(LANDING_METADATA.canonical).toBe("https://vpost.vannt.asia");
    expect(LANDING_METADATA.description.length).toBeGreaterThan(20);

    const pageSource = readFileSync(APP_PAGE_PATH, "utf8");
    expect(pageSource).toContain("export const metadata: Metadata");
    expect(pageSource).toContain("canonical: LANDING_METADATA.canonical");
    expect(pageSource).toContain("openGraph:");
    expect(pageSource).toContain("getOperatorSession");
    expect(pageSource).not.toContain('dynamic = "force-dynamic"');
  });

  it("keeps landing.css token-only with scroll-margin and prefers-reduced-motion rules", () => {
    const css = readFileSync(LANDING_CSS_PATH, "utf8");
    expect(css).toContain("scroll-margin-top");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,6}\b/);
  });
});
