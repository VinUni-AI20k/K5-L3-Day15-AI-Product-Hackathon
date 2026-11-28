/**
 * Generates `src/ui/theme/presets.css` from:
 *   1. design system UI Foundations v2 (`src/ui/theme/design-tokens.ts`) — the
 *      app-wide `:root` / `:root.dark` tokens, the `[data-astryx-theme]`
 *      `color-scheme: inherit` bridge, and the `prefers-reduced-motion: reduce`
 *      override for motion/transition tokens;
 *   2. The preset swatch table (`src/shared/appearance-presets.ts`) — scoped to
 *      nested `[data-theme-preset="…"]:not(:root)` previews on `/platform/appearance`.
 *
 *   pnpm run theme:presets          write the stylesheet
 *   pnpm run theme:presets --check  fail if the committed file is stale
 *
 * WHY `:root:not(.dark)` / `:root.dark` LIVE HERE (UNLAYERED):
 *   `app/globals.css` imports `presets.css` before its legacy `:root` and
 *   `.dark` blocks. Unlayered `:root:not(.dark), :root[data-theme-preset]`
 *   (0,2,0) and `:root.dark, :root.dark[data-theme-preset]` (0,2,0 / 0,3,0)
 *   outrank bare `:root` / `.dark` (0,1,0) regardless of import order — so
 *   `<body>`, Tailwind utilities, and portalled dialogs adopt design system cleanly
 *   without touching `app/globals.css` or any screen/component file.
 *
 * WHY `[data-astryx-theme]:not([data-theme]) { color-scheme: inherit; }`:
 *   Astryx's `<Theme>` defaults to `mode="system"`, applying a `@layer
 *   astryx-base` class that sets `color-scheme: light dark`. That caused every
 *   `light-dark()` token in `vpost.css` and `astryx.css` to follow the OS
 *   instead of `<html class="dark">`. Unlayered `color-scheme: inherit` restores
 *   class-driven light/dark switching while still respecting explicit
 *   `<Theme mode="light|dark">` and `<MediaTheme>`.
 */

import { writeFileSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  APPEARANCE_PRESETS,
  APPEARANCE_PRESET_ATTRIBUTE,
  APPEARANCE_TOKEN_NAMES,
  derivePresetTokens,
  type AppearancePreset,
  type AppearanceScheme,
} from "../src/shared/appearance-presets";
import {
  DESIGN_DARK,
  DESIGN_LIGHT,
  buildRootSchemeTokens,
} from "../src/ui/theme/design-tokens";

const OUTPUT_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../src/ui/theme/presets.css",
);

function formatDeclarations(tokens: Readonly<Record<string, string>>): string {
  return Object.entries(tokens)
    .map(([name, value]) => `  ${name}: ${value};`)
    .join("\n");
}

function renderDesignRoot(): string[] {
  const lightTokens = buildRootSchemeTokens(DESIGN_LIGHT);
  const darkTokens = buildRootSchemeTokens(DESIGN_DARK);

  return [
    "/* design system UI Foundations v2 — app-wide root tokens (90/9/1 neutral palette,",
    " * readable 12px+ type scale, 4-pt spacing, <=24px radii, soft elevation, states). */",
    `:root:not(.dark),\n:root[${APPEARANCE_PRESET_ATTRIBUTE}] {`,
    formatDeclarations(lightTokens),
    "}",
    "",
    `:root.dark,\n:root.dark[${APPEARANCE_PRESET_ATTRIBUTE}] {`,
    formatDeclarations(darkTokens),
    "}",
    "",
    "/* Inherit class-switched color-scheme from <html> so light-dark() tokens in",
    " * vpost.css and @astryxdesign/core flip with ColorSchemeToggle (.dark). */",
    "[data-astryx-theme]:not([data-theme]) {",
    "  color-scheme: inherit;",
    "}",
    "",
    "/* Respect prefers-reduced-motion for design system transition & slide tokens (§6). */",
    "@media (prefers-reduced-motion: reduce) {",
    "  :root,",
    "  [data-astryx-theme] {",
    "    --motion-hover: 0ms;",
    "    --motion-panel: 0ms;",
    "    --motion-item-slide: 0px;",
    "    --transition-interactive: none;",
    "    --transition-panel: none;",
    "  }",
    "}",
    "",
  ];
}

/**
 * Nested swatch preview selector only (`:not(:root)`), so `<PresetSwatch>` on
 * `/platform/appearance` continues to preview each stored preset without
 * overriding the app-wide design system root palette on `<html>`.
 */
function swatchSelectorFor(preset: AppearancePreset, scheme: AppearanceScheme): string {
  const attribute = `[${APPEARANCE_PRESET_ATTRIBUTE}="${preset.id}"]:not(:root)`;
  return scheme === "light" ? attribute : `.dark ${attribute}`;
}

function blockFor(preset: AppearancePreset, scheme: AppearanceScheme): string {
  const tokens = derivePresetTokens(preset, scheme);
  const declarations = APPEARANCE_TOKEN_NAMES.map(
    (name) => `  ${name}: ${tokens[name]};`,
  ).join("\n");
  return `${swatchSelectorFor(preset, scheme)} {\n${declarations}\n}`;
}

function render(): string {
  const blocks = APPEARANCE_PRESETS.flatMap((preset) => {
    const dye =
      preset.chromaScale === 1
        ? "chroma gốc"
        : `chroma ${Math.round(preset.chromaScale * 100)}% (sRGB không giữ nổi chroma gốc ở hue này)`;
    const cloth =
      preset.groundShift === 0
        ? "nền giữ nguyên bản gốc"
        : `nền xoay ${preset.groundShift}°, chroma x${preset.surfaceChromaScale} (mực x${preset.inkChromaScale}), cắt theo gamut từng lớp`;

    return [
      `/* ${preset.label} swatch preview — nhuộm hue ${preset.hue}, ${dye}; ${cloth}.`,
      ` * ${preset.description} */`,
      blockFor(preset, "light"),
      blockFor(preset, "dark"),
      "",
    ];
  });

  return [
    "/*",
    " * @generated by `pnpm run theme:presets` — do not edit manually.",
    " * Sources: src/ui/theme/design-tokens.ts, src/shared/appearance-presets.ts",
    " *",
    " * App-wide design system root tokens + color-scheme/reduced-motion bridges,",
    " * followed by nested swatch preview scopes for /platform/appearance.",
    " */",
    "",
    ...renderDesignRoot(),
    ...blocks,
  ]
    .join("\n")
    .replace(/\n+$/, "\n");
}

const rendered = render();
const isCheck = process.argv.includes("--check");

if (!isCheck) {
  writeFileSync(OUTPUT_PATH, rendered, "utf8");
  console.log(`Wrote design system root tokens + ${APPEARANCE_PRESETS.length} preset swatches to ${OUTPUT_PATH}`);
  process.exit(0);
}

let committed: string;
try {
  committed = readFileSync(OUTPUT_PATH, "utf8");
} catch (cause) {
  console.error(`presets.css is missing (${String(cause)}). Run: pnpm run theme:presets`);
  process.exit(1);
}

if (committed !== rendered) {
  console.error("presets.css is stale — run: pnpm run theme:presets");
  process.exit(1);
}

console.log("presets.css is up to date.");
