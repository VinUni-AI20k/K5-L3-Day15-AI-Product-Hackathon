import { defineTheme, type DefineThemeInput, type TokenName, type TokenValue } from "@astryxdesign/core/theme";
import { neutralTheme } from "@astryxdesign/theme-neutral";

import {
  DESIGN_DARK as D,
  DESIGN_LIGHT as L,
  DESIGN_SCALE_TOKENS,
} from "./design-tokens";

/**
 * VPOST design system Foundations v2 theme (`src/ui/theme/vpost-theme.ts`).
 *
 * Authoritative spec: `.swarm/specs/ui-foundations.md` sections 1–6.
 * Single source of values: `./design-tokens.ts` (shared with `root-tokens.css`
 * and audited for WCAG AA contrast in `src/ui/theme/__tests__/vpost-theme.test.ts`).
 *
 * WHY `light-dark(...)` TUPLES WORK WITH `.dark` CLASS SWITCHING:
 *   `root-tokens.css` declares `color-scheme: light` on `:root:not(.dark)` and
 *   `color-scheme: dark` on `:root.dark`. Astryx's `<Theme>` wrapper previously
 *   reset `color-scheme: light dark` on `[data-astryx-theme]` when `mode` was
 *   omitted, making `light-dark()` ignore `.dark`. `root-tokens.css` restores
 *   `color-scheme: inherit` (plus explicit `:root:not(.dark)` / `:root.dark`
 *   rules for LightningCSS) on `[data-astryx-theme]:not([data-theme])`, so every
 *   `[light, dark]` token here switches cleanly with both OS preference and
 *   `ColorSchemeToggle`.
 *
 * 90 / 9 / 1 COLOUR SEPARATION:
 *   - `--color-accent` is the ONE brand accent (`purple-strong`: #7C3AED / #A78BFA)
 *     so every Astryx focus ring, input focus border, caret, tab/nav indicator,
 *     selected ring, and link uses `purple-strong` consistently.
 *   - Primary CTA buttons (`button["variant:primary"]`) use near-black ink
 *     (`--button-primary-bg`: #111111 / #F5F5F7, `--button-primary-text`: #FFFFFF / #111111)
 *     per the 9% ink rule — never purple surfaces and never disabled-looking fills.
 *
 * BUILT, NOT RUNTIME: after editing this file, regenerate with:
 *   pnpm exec astryx theme build src/ui/theme/vpost-theme.ts
 *   pnpm theme:check
 */

/** Strictly type-checked overrides of Astryx built-in core + domain tokens. */
const CORE_TOKENS: Partial<Record<TokenName, TokenValue>> = {
  // --- Typography (Hanken Grotesk + readable design system scale, 12px floor) ---
  "--font-family-body": DESIGN_SCALE_TOKENS["--font-family-body"],
  "--font-family-heading": DESIGN_SCALE_TOKENS["--font-family-heading"],
  "--font-family-code": DESIGN_SCALE_TOKENS["--font-family-code"],
  "--font-size-4xs": DESIGN_SCALE_TOKENS["--font-size-4xs"],
  "--font-size-3xs": DESIGN_SCALE_TOKENS["--font-size-3xs"],
  "--font-size-2xs": DESIGN_SCALE_TOKENS["--font-size-2xs"],
  "--font-size-xs": DESIGN_SCALE_TOKENS["--font-size-xs"],
  "--font-size-sm": DESIGN_SCALE_TOKENS["--font-size-sm"],
  "--font-size-base": DESIGN_SCALE_TOKENS["--font-size-base"],
  "--font-size-lg": DESIGN_SCALE_TOKENS["--font-size-lg"],
  "--font-size-xl": DESIGN_SCALE_TOKENS["--font-size-xl"],
  "--font-size-2xl": DESIGN_SCALE_TOKENS["--font-size-2xl"],
  "--font-size-3xl": DESIGN_SCALE_TOKENS["--font-size-3xl"],
  "--font-size-4xl": DESIGN_SCALE_TOKENS["--font-size-4xl"],
  "--font-size-5xl": DESIGN_SCALE_TOKENS["--font-size-5xl"],
  "--text-display-1-size": DESIGN_SCALE_TOKENS["--text-display-1-size"],
  "--text-display-1-weight": DESIGN_SCALE_TOKENS["--text-display-1-weight"],
  "--text-display-1-leading": DESIGN_SCALE_TOKENS["--text-display-1-leading"],
  "--text-display-2-size": DESIGN_SCALE_TOKENS["--text-display-2-size"],
  "--text-display-2-weight": DESIGN_SCALE_TOKENS["--text-display-2-weight"],
  "--text-display-2-leading": DESIGN_SCALE_TOKENS["--text-display-2-leading"],
  "--text-display-3-size": DESIGN_SCALE_TOKENS["--text-display-3-size"],
  "--text-display-3-weight": DESIGN_SCALE_TOKENS["--text-display-3-weight"],
  "--text-display-3-leading": DESIGN_SCALE_TOKENS["--text-display-3-leading"],
  "--text-heading-1-size": DESIGN_SCALE_TOKENS["--text-heading-1-size"],
  "--text-heading-1-weight": DESIGN_SCALE_TOKENS["--text-heading-1-weight"],
  "--text-heading-1-leading": DESIGN_SCALE_TOKENS["--text-heading-1-leading"],
  "--text-heading-2-size": DESIGN_SCALE_TOKENS["--text-heading-2-size"],
  "--text-heading-2-weight": DESIGN_SCALE_TOKENS["--text-heading-2-weight"],
  "--text-heading-2-leading": DESIGN_SCALE_TOKENS["--text-heading-2-leading"],
  "--text-heading-3-size": DESIGN_SCALE_TOKENS["--text-heading-3-size"],
  "--text-heading-3-weight": DESIGN_SCALE_TOKENS["--text-heading-3-weight"],
  "--text-heading-3-leading": DESIGN_SCALE_TOKENS["--text-heading-3-leading"],
  "--text-heading-4-size": DESIGN_SCALE_TOKENS["--text-heading-4-size"],
  "--text-heading-4-weight": DESIGN_SCALE_TOKENS["--text-heading-4-weight"],
  "--text-heading-4-leading": DESIGN_SCALE_TOKENS["--text-heading-4-leading"],
  "--text-heading-5-size": DESIGN_SCALE_TOKENS["--text-heading-5-size"],
  "--text-heading-5-weight": DESIGN_SCALE_TOKENS["--text-heading-5-weight"],
  "--text-heading-5-leading": DESIGN_SCALE_TOKENS["--text-heading-5-leading"],
  "--text-heading-6-size": DESIGN_SCALE_TOKENS["--text-heading-6-size"],
  "--text-heading-6-weight": DESIGN_SCALE_TOKENS["--text-heading-6-weight"],
  "--text-heading-6-leading": DESIGN_SCALE_TOKENS["--text-heading-6-leading"],
  "--text-large-size": DESIGN_SCALE_TOKENS["--text-large-size"],
  "--text-large-weight": DESIGN_SCALE_TOKENS["--text-large-weight"],
  "--text-large-leading": DESIGN_SCALE_TOKENS["--text-large-leading"],
  "--text-body-size": DESIGN_SCALE_TOKENS["--text-body-size"],
  "--text-body-weight": DESIGN_SCALE_TOKENS["--text-body-weight"],
  "--text-body-leading": DESIGN_SCALE_TOKENS["--text-body-leading"],
  "--text-label-size": DESIGN_SCALE_TOKENS["--text-label-size"],
  "--text-label-weight": DESIGN_SCALE_TOKENS["--text-label-weight"],
  "--text-label-leading": DESIGN_SCALE_TOKENS["--text-label-leading"],
  "--text-code-size": DESIGN_SCALE_TOKENS["--text-code-size"],
  "--text-code-weight": DESIGN_SCALE_TOKENS["--text-code-weight"],
  "--text-code-leading": DESIGN_SCALE_TOKENS["--text-code-leading"],
  "--text-supporting-size": DESIGN_SCALE_TOKENS["--text-supporting-size"],
  "--text-supporting-weight": DESIGN_SCALE_TOKENS["--text-supporting-weight"],
  "--text-supporting-leading": DESIGN_SCALE_TOKENS["--text-supporting-leading"],

  // --- 90% Neutral surfaces ---
  "--color-background-body": [L.bgPage, D.bgPage],
  "--color-background-surface": [L.bgSubtle, D.bgSubtle],
  "--color-background-card": [L.bgCard, D.bgCard],
  "--color-background-popover": [L.bgPopover, D.bgPopover],
  "--color-background-muted": [L.bgMuted, D.bgMuted],
  "--color-background-inverted": [L.bgInvertedAstryx, D.bgInvertedAstryx],
  "--color-background-error-inverted": L.errorInvertedBg,
  "--color-neutral": [L.bgMuted, D.bgMuted],

  // --- 90% Neutral text & icons ---
  "--color-text-primary": [L.textPrimary, D.textPrimary],
  "--color-text-secondary": [L.textSecondary, D.textSecondary],
  "--color-text-disabled": [L.textDisabled, D.textDisabled],
  "--color-icon-primary": [L.textPrimary, D.textPrimary],
  "--color-icon-secondary": [L.textSecondary, D.textSecondary],
  "--color-icon-disabled": [L.textDisabled, D.textDisabled],
  "--color-on-dark": "#FFFFFF",
  "--color-on-light": "#111111",

  // --- 1% Brand accent (purple-strong: focus ring, selection, links) ---
  "--color-accent": [L.accentBrand, D.accentBrand],
  "--color-on-accent": [L.onAccentBrand, D.onAccentBrand],
  "--color-text-accent": [L.accentText, D.accentText],
  "--color-icon-accent": [L.accentText, D.accentText],
  "--color-accent-muted": [L.accentMuted, D.accentMuted],

  // --- Status hues (status only; NEVER white text on green or orange) ---
  "--color-success": [L.successText, D.successText],
  "--color-success-muted": [L.successMuted, D.successMuted],
  "--color-on-success": L.onSuccessSolid,
  "--color-warning": [L.warningText, D.warningText],
  "--color-warning-muted": [L.warningMuted, D.warningMuted],
  "--color-on-warning": L.onWarningSolid,
  "--color-error": [L.errorText, D.errorText],
  "--color-error-muted": [L.errorMuted, D.errorMuted],
  "--color-on-error": [L.onErrorSolid, D.onErrorSolid],

  // --- Borders, loading, overlays ---
  "--color-border": [L.borderDefault, D.borderDefault],
  "--color-border-emphasized": [L.borderStrong, D.borderStrong],
  "--color-skeleton": [L.bgMuted, D.bgMuted],
  "--color-track": [L.bgMuted, D.bgMuted],
  "--color-shadow": [L.shadowColor, D.shadowColor],
  "--color-overlay": [L.overlayScrim, D.overlayScrim],
  "--color-overlay-hover": [L.overlayHover, D.overlayHover],
  "--color-overlay-pressed": [L.overlayPressed, D.overlayPressed],
  "--color-tint-hover": ["#111111", "#FFFFFF"],

  // --- Syntax neutral alignment ---
  "--color-syntax-background": [L.bgSubtle, D.bgSubtle],
  "--color-syntax-variable": [L.textPrimary, D.textPrimary],
  "--color-syntax-comment": [L.textTertiary, D.textTertiary],
  "--color-syntax-operator": [L.textTertiary, D.textTertiary],

  // --- Categorical palette (Apple-like design system tints, WCAG AA verified) ---
  "--color-background-red": [L.categorical.red.bg, D.categorical.red.bg],
  "--color-border-red": [L.categorical.red.border, D.categorical.red.border],
  "--color-icon-red": [L.categorical.red.icon, D.categorical.red.icon],
  "--color-text-red": [L.categorical.red.text, D.categorical.red.text],

  "--color-background-orange": [L.categorical.orange.bg, D.categorical.orange.bg],
  "--color-border-orange": [L.categorical.orange.border, D.categorical.orange.border],
  "--color-icon-orange": [L.categorical.orange.icon, D.categorical.orange.icon],
  "--color-text-orange": [L.categorical.orange.text, D.categorical.orange.text],

  "--color-background-yellow": [L.categorical.yellow.bg, D.categorical.yellow.bg],
  "--color-border-yellow": [L.categorical.yellow.border, D.categorical.yellow.border],
  "--color-icon-yellow": [L.categorical.yellow.icon, D.categorical.yellow.icon],
  "--color-text-yellow": [L.categorical.yellow.text, D.categorical.yellow.text],

  "--color-background-green": [L.categorical.green.bg, D.categorical.green.bg],
  "--color-border-green": [L.categorical.green.border, D.categorical.green.border],
  "--color-icon-green": [L.categorical.green.icon, D.categorical.green.icon],
  "--color-text-green": [L.categorical.green.text, D.categorical.green.text],

  "--color-background-teal": [L.categorical.teal.bg, D.categorical.teal.bg],
  "--color-border-teal": [L.categorical.teal.border, D.categorical.teal.border],
  "--color-icon-teal": [L.categorical.teal.icon, D.categorical.teal.icon],
  "--color-text-teal": [L.categorical.teal.text, D.categorical.teal.text],

  "--color-background-cyan": [L.categorical.cyan.bg, D.categorical.cyan.bg],
  "--color-border-cyan": [L.categorical.cyan.border, D.categorical.cyan.border],
  "--color-icon-cyan": [L.categorical.cyan.icon, D.categorical.cyan.icon],
  "--color-text-cyan": [L.categorical.cyan.text, D.categorical.cyan.text],

  "--color-background-blue": [L.categorical.blue.bg, D.categorical.blue.bg],
  "--color-border-blue": [L.categorical.blue.border, D.categorical.blue.border],
  "--color-icon-blue": [L.categorical.blue.icon, D.categorical.blue.icon],
  "--color-text-blue": [L.categorical.blue.text, D.categorical.blue.text],

  "--color-background-purple": [L.categorical.purple.bg, D.categorical.purple.bg],
  "--color-border-purple": [L.categorical.purple.border, D.categorical.purple.border],
  "--color-icon-purple": [L.categorical.purple.icon, D.categorical.purple.icon],
  "--color-text-purple": [L.categorical.purple.text, D.categorical.purple.text],

  "--color-background-pink": [L.categorical.pink.bg, D.categorical.pink.bg],
  "--color-border-pink": [L.categorical.pink.border, D.categorical.pink.border],
  "--color-icon-pink": [L.categorical.pink.icon, D.categorical.pink.icon],
  "--color-text-pink": [L.categorical.pink.text, D.categorical.pink.text],

  "--color-background-gray": [L.categorical.gray.bg, D.categorical.gray.bg],
  "--color-border-gray": [L.categorical.gray.border, D.categorical.gray.border],
  "--color-icon-gray": [L.categorical.gray.icon, D.categorical.gray.icon],
  "--color-text-gray": [L.categorical.gray.text, D.categorical.gray.text],

  // --- 4-pt Spacing scale ---
  "--spacing-0": DESIGN_SCALE_TOKENS["--spacing-0"],
  "--spacing-0-5": DESIGN_SCALE_TOKENS["--spacing-0-5"],
  "--spacing-1": DESIGN_SCALE_TOKENS["--spacing-1"],
  "--spacing-1-5": DESIGN_SCALE_TOKENS["--spacing-1-5"],
  "--spacing-2": DESIGN_SCALE_TOKENS["--spacing-2"],
  "--spacing-3": DESIGN_SCALE_TOKENS["--spacing-3"],
  "--spacing-4": DESIGN_SCALE_TOKENS["--spacing-4"],
  "--spacing-5": DESIGN_SCALE_TOKENS["--spacing-5"],
  "--spacing-6": DESIGN_SCALE_TOKENS["--spacing-6"],
  "--spacing-7": DESIGN_SCALE_TOKENS["--spacing-7"],
  "--spacing-8": DESIGN_SCALE_TOKENS["--spacing-8"],
  "--spacing-9": DESIGN_SCALE_TOKENS["--spacing-9"],
  "--spacing-10": DESIGN_SCALE_TOKENS["--spacing-10"],
  "--spacing-11": DESIGN_SCALE_TOKENS["--spacing-11"],
  "--spacing-12": DESIGN_SCALE_TOKENS["--spacing-12"],

  // --- Small consistent radii (§4 — 56px removed; page=13px, chat=18px <=24px) ---
  "--radius-none": DESIGN_SCALE_TOKENS["--radius-none"],
  "--radius-inner": DESIGN_SCALE_TOKENS["--radius-inner"],
  "--radius-element": DESIGN_SCALE_TOKENS["--radius-element"],
  "--radius-container": DESIGN_SCALE_TOKENS["--radius-container"],
  "--radius-page": DESIGN_SCALE_TOKENS["--radius-page"],
  "--radius-chat": DESIGN_SCALE_TOKENS["--radius-chat"],
  "--radius-full": DESIGN_SCALE_TOKENS["--radius-full"],

  // --- Soft elevation + accent/status inset state shadows (§5 — zero raw hex) ---
  "--shadow-low": "var(--shadow-card)",
  "--shadow-med": "var(--shadow-float)",
  "--shadow-high": "var(--shadow-pop)",
  "--shadow-inset-hover": DESIGN_SCALE_TOKENS["--shadow-inset-hover"],
  "--shadow-inset-selected": DESIGN_SCALE_TOKENS["--shadow-inset-selected"],
  "--shadow-inset-success": DESIGN_SCALE_TOKENS["--shadow-inset-success"],
  "--shadow-inset-warning": DESIGN_SCALE_TOKENS["--shadow-inset-warning"],
  "--shadow-inset-error": DESIGN_SCALE_TOKENS["--shadow-inset-error"],
};

/** Additive design system semantic tokens available inside `[data-astryx-theme="vpost"]`. */
const DESIGN_ADDITIVE_TOKENS: Record<`--${string}`, TokenValue> = {
  // Semantic surfaces & text
  "--bg-page": [L.bgPage, D.bgPage],
  "--bg-subtle": [L.bgSubtle, D.bgSubtle],
  "--bg-muted": [L.bgMuted, D.bgMuted],
  "--bg-warm": [L.bgWarm, D.bgWarm],
  "--bg-inverse": [L.bgInverse, D.bgInverse],
  "--text-primary": [L.textPrimary, D.textPrimary],
  "--text-secondary": [L.textSecondary, D.textSecondary],
  "--text-tertiary": [L.textTertiary, D.textTertiary],
  "--text-inverse": [L.textInverse, D.textInverse],
  "--border-default": [L.borderDefault, D.borderDefault],
  "--border-strong": [L.borderStrong, D.borderStrong],

  // Primary CTA (9% ink)
  "--button-primary-bg": [L.buttonPrimaryBg, D.buttonPrimaryBg],
  "--button-primary-text": [L.buttonPrimaryText, D.buttonPrimaryText],
  "--button-primary-hover-bg": [L.buttonPrimaryHoverBg, D.buttonPrimaryHoverBg],
  "--button-primary-pressed-bg": [L.buttonPrimaryPressedBg, D.buttonPrimaryPressedBg],

  // Apple-like system signal hues
  "--accent-blue": [L.accentBlue, D.accentBlue],
  "--accent-purple": [L.accentPurple, D.accentPurple],
  "--accent-purple-strong": [L.accentPurpleStrong, D.accentPurpleStrong],
  "--accent-indigo": [L.accentIndigo, D.accentIndigo],
  "--accent-pink": [L.accentPink, D.accentPink],
  "--accent-orange": [L.accentOrange, D.accentOrange],
  "--accent-green": [L.accentGreen, D.accentGreen],

  // Additive type tokens
  "--text-lead-size": DESIGN_SCALE_TOKENS["--text-lead-size"],
  "--text-lead-weight": DESIGN_SCALE_TOKENS["--text-lead-weight"],
  "--text-lead-leading": DESIGN_SCALE_TOKENS["--text-lead-leading"],
  "--text-body-small-size": DESIGN_SCALE_TOKENS["--text-body-small-size"],
  "--text-body-small-weight": DESIGN_SCALE_TOKENS["--text-body-small-weight"],
  "--text-body-small-leading": DESIGN_SCALE_TOKENS["--text-body-small-leading"],
  "--text-caption-size": DESIGN_SCALE_TOKENS["--text-caption-size"],
  "--text-caption-weight": DESIGN_SCALE_TOKENS["--text-caption-weight"],
  "--text-caption-leading": DESIGN_SCALE_TOKENS["--text-caption-leading"],

  // design system 4-pt spacing scale
  "--space-0-5": DESIGN_SCALE_TOKENS["--space-0-5"],
  "--space-1": DESIGN_SCALE_TOKENS["--space-1"],
  "--space-1-5": DESIGN_SCALE_TOKENS["--space-1-5"],
  "--space-2": DESIGN_SCALE_TOKENS["--space-2"],
  "--space-3": DESIGN_SCALE_TOKENS["--space-3"],
  "--space-4": DESIGN_SCALE_TOKENS["--space-4"],
  "--space-5": DESIGN_SCALE_TOKENS["--space-5"],
  "--space-6": DESIGN_SCALE_TOKENS["--space-6"],
  "--space-7": DESIGN_SCALE_TOKENS["--space-7"],
  "--space-8": DESIGN_SCALE_TOKENS["--space-8"],
  "--space-9": DESIGN_SCALE_TOKENS["--space-9"],
  "--space-card-padding": DESIGN_SCALE_TOKENS["--space-card-padding"],
  "--space-gutter-desktop": DESIGN_SCALE_TOKENS["--space-gutter-desktop"],
  "--space-gutter-mobile": DESIGN_SCALE_TOKENS["--space-gutter-mobile"],
  "--space-section-gap": DESIGN_SCALE_TOKENS["--space-section-gap"],

  // design system radius tokens (xs6 / sm8 / md10 / lg13 / xl24 / pill999)
  "--radius": DESIGN_SCALE_TOKENS["--radius"],
  "--radius-xs": DESIGN_SCALE_TOKENS["--radius-xs"],
  "--radius-sm": DESIGN_SCALE_TOKENS["--radius-sm"],
  "--radius-md": DESIGN_SCALE_TOKENS["--radius-md"],
  "--radius-lg": DESIGN_SCALE_TOKENS["--radius-lg"],
  "--radius-xl": DESIGN_SCALE_TOKENS["--radius-xl"],
  "--radius-pill": DESIGN_SCALE_TOKENS["--radius-pill"],
  "--radius-chat-tail": DESIGN_SCALE_TOKENS["--radius-chat-tail"],

  // design system elevation shadows (Card, Button, Float, Pop — per-layer light-dark colors)
  "--shadow-card": DESIGN_SCALE_TOKENS["--shadow-card"],
  "--shadow-button": DESIGN_SCALE_TOKENS["--shadow-button"],
  "--shadow-float": DESIGN_SCALE_TOKENS["--shadow-float"],
  "--shadow-pop": DESIGN_SCALE_TOKENS["--shadow-pop"],

  // Interaction states & motion (§6)
  "--focus-ring-width": DESIGN_SCALE_TOKENS["--focus-ring-width"],
  "--focus-ring-offset": DESIGN_SCALE_TOKENS["--focus-ring-offset"],
  "--focus-ring-color": DESIGN_SCALE_TOKENS["--focus-ring-color"],
  "--focus-ring": DESIGN_SCALE_TOKENS["--focus-ring"],
  "--state-hover-bg": DESIGN_SCALE_TOKENS["--state-hover-bg"],
  "--state-hover-overlay": DESIGN_SCALE_TOKENS["--state-hover-overlay"],
  "--state-pressed-overlay": DESIGN_SCALE_TOKENS["--state-pressed-overlay"],
  "--state-selected-bg": DESIGN_SCALE_TOKENS["--state-selected-bg"],
  "--state-selected-bar": DESIGN_SCALE_TOKENS["--state-selected-bar"],
  "--state-selected-text": DESIGN_SCALE_TOKENS["--state-selected-text"],
  "--state-disabled-opacity": DESIGN_SCALE_TOKENS["--state-disabled-opacity"],
  "--state-disabled-cursor": DESIGN_SCALE_TOKENS["--state-disabled-cursor"],
  "--ease-out": DESIGN_SCALE_TOKENS["--ease-out"],
  "--motion-hover": DESIGN_SCALE_TOKENS["--motion-hover"],
  "--motion-panel": DESIGN_SCALE_TOKENS["--motion-panel"],
  "--motion-item-slide": DESIGN_SCALE_TOKENS["--motion-item-slide"],
  "--transition-interactive": DESIGN_SCALE_TOKENS["--transition-interactive"],
  "--transition-panel": DESIGN_SCALE_TOKENS["--transition-panel"],
};

export const vpostTheme = defineTheme({
  name: "vpost",
  extends: neutralTheme,
  tokens: {
    ...CORE_TOKENS,
    ...DESIGN_ADDITIVE_TOKENS,
  } as DefineThemeInput["tokens"],
  components: {
    /**
     * Button:
     *   - Focus ring offset tightened to 2px (spec §6).
     *   - Primary CTA uses near-black ink with white text (inverted in dark) —
     *     never looks disabled and keeps the 9% ink / 1% purple accent split.
     *   - Disabled opacity aligned to 40% + not-allowed (spec §6).
     */
    button: {
      base: {
        "--button-focus-offset": "var(--focus-ring-offset)",
        ":disabled": {
          opacity: "var(--state-disabled-opacity)",
          cursor: "var(--state-disabled-cursor)",
        },
      },
      "variant:primary": {
        backgroundColor: "var(--button-primary-bg)",
        color: "var(--button-primary-text)",
        boxShadow: "var(--shadow-button)",
        ":hover:not(:disabled)": {
          backgroundColor: "var(--button-primary-hover-bg)",
          backgroundImage: "none",
        },
        ":active:not(:disabled)": {
          backgroundColor: "var(--button-primary-pressed-bg)",
          backgroundImage: "none",
        },
      },
      "variant:secondary": {
        backgroundColor: "var(--bg-muted)",
        color: "var(--text-primary)",
      },
      "variant:destructive": {
        backgroundColor: "var(--color-error-muted)",
        color: "var(--color-error)",
      },
    },

    /**
     * Semantic filled badges aligned to design system §1 contrast rules:
     *   - NEVER white text on orange or green — always #111111 text.
     *   - White text allowed on indigo (6.29:1) and deep crimson error (5.68:1) in light;
     *     inverted dark text on lifted dark fills.
     */
    badge: {
      "variant:info": {
        backgroundColor: `light-dark(${L.infoSolidBadgeBg}, ${D.infoSolidBadgeBg})`,
        color: `light-dark(${L.onInfoSolid}, ${D.onInfoSolid})`,
      },
      "variant:success": {
        backgroundColor: "var(--accent-green)",
        color: "var(--color-on-success)",
      },
      "variant:warning": {
        backgroundColor: "var(--accent-orange)",
        color: "var(--color-on-warning)",
      },
      "variant:error": {
        backgroundColor: `light-dark(${L.errorSolidBadgeBg}, ${D.errorSolidBadgeBg})`,
        color: `light-dark(${L.onErrorSolid}, ${D.onErrorSolid})`,
      },
    },

    /**
     * Warning banner uses orange text/icon to match the design system orange warning
     * surface (`--color-warning-muted`: #FFF3E0 light / #2E1F0D dark).
     */
    banner: {
      "status:warning": {
        "--color-text-primary": "var(--color-text-orange)",
        "--color-text-secondary": "var(--color-text-orange)",
        "--color-warning": "var(--color-text-orange)",
      },
    },

    /**
     * Status dots follow the design system status hues + brand purple-strong accent
     * (replacing neutralTheme's raw #0074e2 blue).
     */
    statusdot: {
      "variant:success": { backgroundColor: "var(--accent-green)" },
      "variant:warning": { backgroundColor: "var(--accent-orange)" },
      "variant:error": { backgroundColor: `light-dark(${L.errorSolidBadgeBg}, ${D.errorSolidBadgeBg})` },
      "variant:accent": { backgroundColor: "var(--color-accent)" },
    },

    /**
     * ProgressBar fills use brand accent + design system status hues instead of
     * neutralTheme's hardcoded #0074e2 / #198100 / #ffce2f / #e33f4a hexes.
     */
    progressbar: {
      "variant:accent": { "--color-accent": "var(--accent-purple-strong)" },
      "variant:success": { "--color-success": "var(--accent-green)" },
      "variant:warning": { "--color-warning": "var(--accent-orange)" },
      "variant:error": {
        "--color-error": `light-dark(${L.errorSolidBadgeBg}, ${D.errorSolidBadgeBg})`,
      },
    },

    /**
     * Card & Section padding per spec §3 (cards 20–24px, sections 16px) so
     * rounded containers (13px) always satisfy padding >= radius / 2.
     */
    card: {
      base: {
        padding: "var(--spacing-5)",
      },
    },
    section: {
      base: {
        padding: "var(--spacing-4)",
      },
    },

    /**
     * Modals use elevated popover surface + xl (24px) radius per spec §4.
     */
    dialog: {
      base: {
        backgroundColor: "var(--color-background-popover)",
        borderRadius: "var(--radius-xl)",
      },
    },

    /**
     * Keep `LayoutContent` positioned so `sr-only` descendants anchor to the
     * scroll box rather than stretching `documentElement.scrollHeight`
     * (pinned by `src/ui/components/shell/__tests__/scroll-containment.test.ts`).
     */
    "layout-content": {
      base: { position: "relative" },
    },
  },
});
