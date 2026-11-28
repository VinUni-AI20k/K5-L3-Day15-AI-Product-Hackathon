import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  DESIGN_DARK,
  DESIGN_LIGHT,
  DESIGN_SCALE_TOKENS,
  type DesignSchemePalette,
} from "@/ui/theme/design-tokens";
import { vpostTheme } from "@/ui/theme/vpost-theme";

/**
 * Guard suite for the design system UI Foundations v2 theme (`vpost-theme.ts` → `vpost.css` + `presets.css`).
 *
 * Verifies:
 *   1. Built CSS sync: every token overridden in `vpost-theme.ts` is emitted verbatim into `:scope`
 *      of `vpost.css` (and `vpost.css` carries the `@generated` header).
 *   2. Root bridge & reduced motion: `presets.css` carries the `:root` / `:root.dark` design system
 *      bridge, `[data-astryx-theme]:not([data-theme]) { color-scheme: inherit; }`, and
 *      `@media (prefers-reduced-motion: reduce)`.
 *   3. Spec sections 1–6 invariants: 90/9/1 palette, never white text on green/orange,
 *      12px typography floor (no 10px), Hanken Grotesk Vietnamese font wiring, 4-pt spacing,
 *      small radii (<=24px, no 56px), valid soft shadows + accent-based inset state shadows
 *      (no raw hex), and interaction state tokens.
 *   4. WCAG 2.1 AA contrast (>= 4.5:1) for every text/background pair produced by the tokens
 *      in BOTH light and dark schemes, computed independently from sRGB relative luminance.
 */

const VPOST_CSS_PATH = new URL("../vpost.css", import.meta.url);
const PRESETS_CSS_PATH = new URL("../presets.css", import.meta.url);
const THEME_SOURCE_PATH = new URL("../vpost-theme.ts", import.meta.url);
const LAYOUT_PATH = new URL("../../../app/layout.tsx", import.meta.url);

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

function readBuiltCss(): string {
  const css = readFileSync(VPOST_CSS_PATH, "utf8");
  if (css.trim().length === 0) throw new Error("vpost.css is empty — re-run `astryx theme build`");
  return css;
}

function readPresetsCss(): string {
  const css = readFileSync(PRESETS_CSS_PATH, "utf8");
  if (css.trim().length === 0) throw new Error("presets.css is empty — re-run `pnpm theme:presets`");
  return css;
}

/** Declarations inside the theme root (`:scope { ... }`) of `vpost.css`. */
function themeRootDeclarations(css: string): Map<string, string> {
  const start = css.indexOf(":scope {");
  if (start < 0) {
    throw new Error("vpost.css has no `:scope` block — the theme build output changed shape");
  }
  const end = css.indexOf("\n  }", start);
  if (end < 0) throw new Error("vpost.css `:scope` block is unterminated");

  const declarations = new Map<string, string>();
  for (const line of css.slice(start, end).split("\n")) {
    const match = /^\s*(--[a-z0-9-]+)\s*:\s*(.+?);\s*$/i.exec(line);
    if (match) declarations.set(match[1], match[2]);
  }
  return declarations;
}

// --- Independent WCAG 2.1 sRGB contrast math --------------------------------

function parseHexRgb(hex: string): readonly [number, number, number] {
  const clean = hex.trim().replace(/^#/, "");
  if (!/^[0-9a-f]{6}$/i.test(clean)) {
    throw new Error(`Expected 6-digit hex colour, received: ${hex}`);
  }
  return [
    Number.parseInt(clean.slice(0, 2), 16),
    Number.parseInt(clean.slice(2, 4), 16),
    Number.parseInt(clean.slice(4, 6), 16),
  ];
}

function compositeOver(
  fgHex: string,
  bgHex: string,
  alpha: number,
): readonly [number, number, number] {
  const [fr, fg, fb] = parseHexRgb(fgHex);
  const [br, bg, bb] = parseHexRgb(bgHex);
  return [
    fr * alpha + br * (1 - alpha),
    fg * alpha + bg * (1 - alpha),
    fb * alpha + bb * (1 - alpha),
  ];
}

function relativeLuminance(rgb: readonly [number, number, number]): number {
  const [r, g, b] = rgb.map((channel) => {
    const s = channel / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatioRgb(
  fg: readonly [number, number, number],
  bg: readonly [number, number, number],
): number {
  const l1 = relativeLuminance(fg);
  const l2 = relativeLuminance(bg);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

function contrastRatio(fgHex: string, bgHex: string): number {
  return contrastRatioRgb(parseHexRgb(fgHex), parseHexRgb(bgHex));
}

function remToPx(value: string): number {
  const match = /^([\d.]+)rem$/.exec(value.trim());
  if (!match) throw new Error(`Expected rem value, received: ${value}`);
  return Number(match[1]) * 16;
}

function pxValue(value: string): number {
  const match = /^([\d.]+)px$/.exec(value.trim());
  if (!match) throw new Error(`Expected px value, received: ${value}`);
  return Number(match[1]);
}

// --- 1. Build sync ----------------------------------------------------------

describe("vpost.css is the build of vpost-theme.ts", () => {
  const builtCss = readBuiltCss();
  const declarations = themeRootDeclarations(builtCss);

  it("emits every token declared in vpost-theme.ts verbatim in :scope", () => {
    const source = stripComments(readFileSync(THEME_SOURCE_PATH, "utf8"));
    // Match token keys in CORE_TOKENS / DESIGN_ADDITIVE_TOKENS (excluding component overrides).
    const tokensSection = source.slice(0, source.indexOf("export const vpostTheme"));
    const declared = [...tokensSection.matchAll(/^\s*"(--[a-z0-9-]+)":/gm)].map((m) => m[1]);
    const uniqueDeclared = [...new Set(declared)];

    expect(uniqueDeclared.length).toBeGreaterThan(100);
    for (const token of uniqueDeclared) {
      const expected = vpostTheme.tokens[token];
      expect(expected, `${token} missing from resolved vpostTheme.tokens`).toBeTypeOf("string");
      expect(
        declarations.get(token),
        `vpost.css is stale for ${token} — re-run \`pnpm exec astryx theme build src/ui/theme/vpost-theme.ts\``,
      ).toBe(expected);
    }
  });

  it("declares itself @generated from vpost-theme.ts", () => {
    const header = builtCss.slice(0, 400);
    expect(header).toContain("@generated");
    expect(header).toContain("src/ui/theme/vpost-theme.ts");
  });

  it("preserves all Astryx duration tokens consumed by onboarding and shell motion", () => {
    for (const name of [
      "--duration-fast-min",
      "--duration-fast",
      "--duration-fast-max",
      "--duration-medium-min",
      "--duration-medium",
      "--duration-medium-max",
      "--duration-slow-min",
      "--duration-slow",
      "--duration-slow-max",
    ]) {
      expect(declarations.get(name), `${name} must remain defined`).toMatch(/^\d+ms$/);
    }
  });
});

// --- 2. Root Tailwind bridge, dark mode & reduced motion --------------------

describe("presets.css root bridge, dark-mode switching and reduced motion", () => {
  const presetsCss = readPresetsCss();

  it("is @generated and applies design system light & dark tokens to :root", () => {
    expect(presetsCss.slice(0, 300)).toContain("@generated");
    expect(presetsCss).toContain(":root:not(.dark),\n:root[data-theme-preset] {");
    expect(presetsCss).toContain(":root.dark,\n:root.dark[data-theme-preset] {");
    expect(presetsCss).toContain(`--background: ${DESIGN_LIGHT.bgPage};`);
    expect(presetsCss).toContain(`--background: ${DESIGN_DARK.bgPage};`);
    expect(presetsCss).toContain(`--primary: ${DESIGN_LIGHT.buttonPrimaryBg};`);
    expect(presetsCss).toContain(`--primary: ${DESIGN_DARK.buttonPrimaryBg};`);
    expect(presetsCss).toContain(`--ring: ${DESIGN_LIGHT.accentBrand};`);
    expect(presetsCss).toContain(`--ring: ${DESIGN_DARK.accentBrand};`);
  });

  it("restores color-scheme: inherit on [data-astryx-theme]:not([data-theme]) so .dark switches light-dark()", () => {
    expect(presetsCss).toMatch(
      /\[data-astryx-theme\]:not\(\[data-theme\]\)\s*\{\s*color-scheme:\s*inherit;\s*\}/,
    );
  });

  it("respects prefers-reduced-motion: reduce for transition and motion tokens", () => {
    const match = /@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?)\n\}/.exec(presetsCss);
    expect(match, "missing @media (prefers-reduced-motion: reduce) block").not.toBeNull();
    const block = match![1];
    expect(block).toContain("--motion-hover: 0ms;");
    expect(block).toContain("--motion-panel: 0ms;");
    expect(block).toContain("--motion-item-slide: 0px;");
    expect(block).toContain("--transition-interactive: none;");
    expect(block).toContain("--transition-panel: none;");
  });
});

// --- 3. design system sections 1–6 invariants ------------------------------------

describe("design system foundations invariants (spec sections 1–6)", () => {
  const builtCss = readBuiltCss();
  const declarations = themeRootDeclarations(builtCss);

  it("section 1: enforces 90/9/1 colour split and NEVER puts white text on green or orange", () => {
    // Primary CTA: near-black on white in light, inverted in dark
    expect(DESIGN_LIGHT.buttonPrimaryBg).toBe("#111111");
    expect(DESIGN_LIGHT.buttonPrimaryText).toBe("#FFFFFF");
    expect(DESIGN_DARK.buttonPrimaryBg).toBe("#F5F5F7");
    expect(DESIGN_DARK.buttonPrimaryText).toBe("#111111");

    // Brand accent: purple-strong
    expect(declarations.get("--color-accent")).toBe(
      `light-dark(${DESIGN_LIGHT.accentBrand}, ${DESIGN_DARK.accentBrand})`,
    );

    // Spec §1: NEVER white on orange or green — use #111111 text
    expect(DESIGN_LIGHT.onSuccessSolid).toBe("#111111");
    expect(DESIGN_DARK.onSuccessSolid).toBe("#111111");
    expect(DESIGN_LIGHT.onWarningSolid).toBe("#111111");
    expect(DESIGN_DARK.onWarningSolid).toBe("#111111");
    expect(declarations.get("--color-on-success")).toBe("#111111");
    expect(declarations.get("--color-on-warning")).toBe("#111111");
  });

  it("section 2: enforces 12px minimum font size (removes 10px) and spec type scale", () => {
    const sizeTokens = [
      "--font-size-4xs",
      "--font-size-3xs",
      "--font-size-2xs",
      "--font-size-xs",
      "--font-size-sm",
      "--font-size-base",
      "--font-size-lg",
      "--font-size-xl",
      "--font-size-2xl",
      "--font-size-3xl",
      "--font-size-4xl",
      "--font-size-5xl",
    ];
    for (const token of sizeTokens) {
      const value = declarations.get(token);
      expect(value, `${token} missing`).toBeDefined();
      expect(remToPx(value!), `${token} (${value}) is below the 12px floor`).toBeGreaterThanOrEqual(
        12,
      );
    }

    // Spec §2 exact sizes & line heights
    expect(remToPx(declarations.get("--font-size-xs")!)).toBe(12); // Caption 12/16
    expect(remToPx(declarations.get("--font-size-sm")!)).toBe(14); // Body/Small 14/21
    expect(remToPx(declarations.get("--font-size-base")!)).toBe(16); // Body/Base 16/26
    expect(remToPx(declarations.get("--font-size-lg")!)).toBe(18); // H3 18/26, Lead 18/28
    expect(remToPx(declarations.get("--font-size-xl")!)).toBe(22); // H2 22/30
    expect(remToPx(declarations.get("--font-size-2xl")!)).toBe(28); // H1 28/32
    expect(remToPx(declarations.get("--font-size-5xl")!)).toBe(56); // Display 56/60

    expect(declarations.get("--text-body-leading")).toBe("1.625"); // 16 * 1.625 = 26
    expect(declarations.get("--text-supporting-leading")).toBe("1.5"); // 14 * 1.5 = 21
    expect(declarations.get("--text-caption-leading")).toBe("1.3333"); // 12 * 1.3333 = 16
  });

  it("section 2: wires Hanken Grotesk (latin + vietnamese) in layout.tsx and theme fonts", () => {
    const layout = readFileSync(LAYOUT_PATH, "utf8");
    expect(layout).toContain("Hanken_Grotesk");
    expect(layout).toContain('subsets: ["latin", "vietnamese"]');
    expect(layout).toContain('variable: "--font-app-sans"');

    expect(declarations.get("--font-family-body")).toContain("var(--font-app-sans)");
    expect(declarations.get("--font-family-heading")).toContain("var(--font-app-sans)");
    expect(declarations.get("--font-family-body")).toContain('"Hanken Grotesk"');
  });

  it("section 3: defines a 4-pt spacing scale", () => {
    const expectedSpace: Record<string, number> = {
      "--space-0-5": 2,
      "--space-1": 4,
      "--space-1-5": 6,
      "--space-2": 8,
      "--space-3": 12,
      "--space-4": 16,
      "--space-5": 24,
      "--space-6": 32,
      "--space-7": 48,
      "--space-8": 64,
      "--space-9": 96,
    };
    for (const [token, px] of Object.entries(expectedSpace)) {
      expect(pxValue(declarations.get(token)!), token).toBe(px);
    }
  });

  it("section 4: uses small consistent radii (xs6/sm8/md10/lg13/xl24/pill) and removes 56px", () => {
    expect(declarations.get("--radius-xs")).toBe("6px");
    expect(declarations.get("--radius-sm")).toBe("8px");
    expect(declarations.get("--radius-md")).toBe("10px");
    expect(declarations.get("--radius-lg")).toBe("13px");
    expect(declarations.get("--radius-xl")).toBe("24px");
    expect(declarations.get("--radius-pill")).toBe("999px");

    expect(pxValue(declarations.get("--radius-inner")!)).toBe(6);
    expect(pxValue(declarations.get("--radius-element")!)).toBe(10);
    expect(pxValue(declarations.get("--radius-container")!)).toBe(13);
    expect(pxValue(declarations.get("--radius-page")!)).toBeLessThanOrEqual(24);
    expect(pxValue(declarations.get("--radius-chat")!)).toBeLessThanOrEqual(24);
    expect(builtCss).not.toContain("56px");
  });

  it("section 5: defines Card/Button/Float/Pop shadows with valid CSS and zero raw hex in inset shadows", () => {
    for (const token of ["--shadow-card", "--shadow-button", "--shadow-float", "--shadow-pop"]) {
      const value = declarations.get(token);
      expect(value, `${token} missing`).toBeDefined();
      // CSS light-dark() only accepts <color>, never a full box-shadow list
      expect(value).not.toMatch(/^light-dark\(/);
      expect(value).toContain("light-dark(");
    }

    for (const token of [
      "--shadow-inset-hover",
      "--shadow-inset-selected",
      "--shadow-inset-success",
      "--shadow-inset-warning",
      "--shadow-inset-error",
    ]) {
      const value = declarations.get(token) ?? "";
      expect(value, `${token} must not contain raw hex`).not.toMatch(/#[0-9a-f]{3,8}/i);
      expect(value, `${token} must reference semantic colour token`).toContain("var(--color-");
    }
  });

  it("section 6: defines hover, pressed, focus-visible, selected and disabled state tokens", () => {
    expect(declarations.get("--focus-ring-width")).toBe("2px");
    expect(declarations.get("--focus-ring-offset")).toBe("2px");
    expect(declarations.get("--focus-ring-color")).toBe("var(--color-accent)");
    expect(declarations.get("--state-disabled-opacity")).toBe("0.4");
    expect(declarations.get("--state-disabled-cursor")).toBe("not-allowed");
    expect(declarations.get("--state-selected-bg")).toBe("var(--color-accent-muted)");
    expect(declarations.get("--state-selected-bar")).toBe("var(--color-accent)");
    expect(DESIGN_SCALE_TOKENS["--motion-hover"]).toBe("165ms");
    expect(DESIGN_SCALE_TOKENS["--motion-panel"]).toBe("225ms");
    expect(DESIGN_SCALE_TOKENS["--motion-item-slide"]).toBe("4px");
  });
});

// --- 4. Automated WCAG 2.1 AA contrast verification -------------------------

const WCAG_AA_NORMAL_TEXT = 4.5;

const SCHEMES: readonly (readonly ["light" | "dark", DesignSchemePalette])[] = [
  ["light", DESIGN_LIGHT],
  ["dark", DESIGN_DARK],
];

describe.each(SCHEMES)("WCAG 2.1 AA contrast table (%s scheme)", (scheme, p) => {
  it("meets >= 4.5:1 for every semantic text/background pair", () => {
    const pairs: readonly (readonly [string, string, string])[] = [
      // Neutral text on neutral surfaces
      ["text/primary on bg/page", p.textPrimary, p.bgPage],
      ["text/primary on bg/subtle", p.textPrimary, p.bgSubtle],
      ["text/primary on bg/card", p.textPrimary, p.bgCard],
      ["text/primary on bg/popover", p.textPrimary, p.bgPopover],
      ["text/primary on bg/muted", p.textPrimary, p.bgMuted],
      ["text/primary on bg/warm", p.textPrimary, p.bgWarm],
      ["text/secondary on bg/page", p.textSecondary, p.bgPage],
      ["text/secondary on bg/subtle", p.textSecondary, p.bgSubtle],
      ["text/secondary on bg/card", p.textSecondary, p.bgCard],
      ["text/secondary on bg/muted", p.textSecondary, p.bgMuted],
      ["text/secondary on bg/warm", p.textSecondary, p.bgWarm],
      ["text/tertiary on bg/page", p.textTertiary, p.bgPage],
      ["text/tertiary on bg/subtle", p.textTertiary, p.bgSubtle],
      ["text/tertiary on bg/warm", p.textTertiary, p.bgWarm],

      // Inverse surfaces (floating dock, toasts, tooltips)
      ["text/inverse on bg/inverse", p.textInverse, p.bgInverse],
      [
        "Astryx MediaTheme text on inverted surface",
        scheme === "light" ? "#FFFFFF" : "#111111",
        p.bgInvertedAstryx,
      ],
      ["error-inverted toast white text on errorInvertedBg", "#FFFFFF", p.errorInvertedBg],

      // Primary CTA (resting, hover, pressed)
      ["button/primary-text on primary-bg", p.buttonPrimaryText, p.buttonPrimaryBg],
      ["button/primary-text on primary-hover-bg", p.buttonPrimaryText, p.buttonPrimaryHoverBg],
      ["button/primary-text on primary-pressed-bg", p.buttonPrimaryText, p.buttonPrimaryPressedBg],

      // Brand accent (purple-strong): solid fill, links, selected wash
      ["on-accent on accent/purple-strong", p.onAccentBrand, p.accentBrand],
      ["text-accent (links) on bg/page", p.accentText, p.bgPage],
      ["text-accent (links) on bg/subtle", p.accentText, p.bgSubtle],
      ["text-accent (links) on bg/muted", p.accentText, p.bgMuted],
      ["text-accent (links) on bg/warm", p.accentText, p.bgWarm],
      ["text-accent on accent-muted (selected)", p.accentText, p.accentMuted],
      ["text/primary on accent-muted (selected)", p.textPrimary, p.accentMuted],

      // Signal solid fills allowed for text (spec §1)
      ["on-info on indigo badge fill", p.onInfoSolid, p.infoSolidBadgeBg],
      ["#111111 on green badge fill", p.onSuccessSolid, p.accentGreen],
      ["#111111 on orange badge fill", p.onWarningSolid, p.accentOrange],
      ["on-error on solid error badge fill", p.onErrorSolid, p.errorSolidBadgeBg],

      // Status text on tinted status surfaces and neutral surfaces
      ["status/success text on success-muted", p.successText, p.successMuted],
      ["status/success text on bg/page", p.successText, p.bgPage],
      ["status/success text on bg/card", p.successText, p.bgCard],
      ["status/warning text on warning-muted", p.warningText, p.warningMuted],
      ["status/warning text on bg/page", p.warningText, p.bgPage],
      ["status/warning text on bg/card", p.warningText, p.bgCard],
      ["status/error text on error-muted", p.errorText, p.errorMuted],
      ["status/error text on bg/page", p.errorText, p.bgPage],
      ["status/error text on bg/card", p.errorText, p.bgCard],
      ["status/info text on bg/page", p.infoText, p.bgPage],
      ["status/info text on bg/card", p.infoText, p.bgCard],

      // All 10 categorical badge/banner ramps
      ...Object.entries(p.categorical).map(
        ([hue, ramp]) => [`categorical/${hue} text on ${hue} bg`, ramp.text, ramp.bg] as const,
      ),
    ];

    for (const [label, fg, bg] of pairs) {
      const ratio = contrastRatio(fg, bg);
      expect(
        ratio,
        `${scheme} / ${label} (${fg} on ${bg}) = ${ratio.toFixed(2)}:1 < ${WCAG_AA_NORMAL_TEXT}:1`,
      ).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
    }
  });

  it("meets >= 4.5:1 for alpha-tinted Tailwind status badges and destructive buttons", () => {
    const tintedPairs: readonly (readonly [string, string, readonly [number, number, number]])[] = [
      [
        "badge success text on bg-success/10",
        p.successText,
        compositeOver(p.accentGreen, p.bgCard, 0.1),
      ],
      [
        "badge warning text on bg-warning/10",
        p.warningText,
        compositeOver(p.accentOrange, p.bgCard, 0.1),
      ],
      [
        "destructive button resting (10% light / 20% dark)",
        p.errorText,
        compositeOver(p.errorText, p.bgCard, scheme === "light" ? 0.1 : 0.2),
      ],
      [
        "destructive button hover (20% light / 30% dark)",
        p.errorText,
        compositeOver(p.errorText, p.bgCard, scheme === "light" ? 0.2 : 0.3),
      ],
    ];

    for (const [label, fg, bgRgb] of tintedPairs) {
      const ratio = contrastRatioRgb(parseHexRgb(fg), bgRgb);
      expect(
        ratio,
        `${scheme} / ${label} = ${ratio.toFixed(2)}:1 < ${WCAG_AA_NORMAL_TEXT}:1`,
      ).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
    }
  });
});
