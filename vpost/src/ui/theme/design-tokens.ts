/**
 * design system UI Foundations v2 — single source of truth for VPOST design tokens.
 *
 * Spec: `.swarm/specs/ui-foundations.md` sections 1–6 (design system primary reference).
 *
 * Consumed by:
 *   - `src/ui/theme/vpost-theme.ts`  → builds `vpost.css` / `vpost.js` (Astryx tokens + semantic aliases)
 *   - `src/ui/theme/root-tokens.css` → root Tailwind bridge, `[data-astryx-theme]` `color-scheme`
 *     switching, and `prefers-reduced-motion: reduce` (verified in sync by `vpost-theme.test.ts`)
 *   - `src/ui/theme/__tests__/vpost-theme.test.ts` → automated WCAG AA contrast verification & token gates
 *
 * Colour rule 90 / 9 / 1:
 *   - 90% neutral : page / subtle / muted / warm surfaces, text, hairlines
 *   -  9% ink     : near-black primary CTA (#111111 / #FFFFFF; inverted in dark)
 *   -  1% accent  : purple-strong (#7C3AED light / #A78BFA dark) for focus ring, selection, links
 *   - Status hues : green (ok), orange (warning), red/pink (error), blue/indigo (info) — status only
 *
 * Contrast table (WCAG 2.1 AA, minimum 4.5:1 for normal text — verified in `vpost-theme.test.ts`):
 *
 *   Pair                                      Light (fg / bg)         Ratio    Dark (fg / bg)          Ratio
 *   ----------------------------------------  ----------------------  -------  ----------------------  -------
 *   text/primary on bg/page                   #111111 / #FFFFFF       18.88:1  #F5F5F7 / #0D0D0F       17.83:1
 *   text/primary on bg/subtle                 #111111 / #F5F5F7       17.34:1  #F5F5F7 / #161618       16.60:1
 *   text/primary on bg/muted                  #111111 / #E9E9EC       15.58:1  #F5F5F7 / #242428       14.20:1
 *   text/primary on bg/warm                   #111111 / #FAF9F6       17.94:1  #F5F5F7 / #1C1B18       15.82:1
 *   text/secondary on bg/page                 #4A4A4F / #FFFFFF        8.81:1  #A1A1A6 / #0D0D0F        7.55:1
 *   text/secondary on bg/subtle               #4A4A4F / #F5F5F7        8.09:1  #A1A1A6 / #161618        7.03:1
 *   text/secondary on bg/muted                #4A4A4F / #E9E9EC        7.27:1  #A1A1A6 / #242428        6.01:1
 *   text/tertiary on bg/page                  #6E6E73 / #FFFFFF        5.07:1  #8E8E93 / #0D0D0F        5.95:1
 *   text/tertiary on bg/subtle                #6E6E73 / #F5F5F7        4.66:1  #8E8E93 / #161618        5.54:1
 *   text/tertiary on bg/warm                  #6E6E73 / #FAF9F6        4.82:1  #8E8E93 / #1C1B18        5.28:1
 *   text/inverse on bg/inverse                #FFFFFF / #1D1D1F       16.83:1  #F5F5F7 / #2C2C30       12.77:1
 *   button/primary-text on primary-bg         #FFFFFF / #111111       18.88:1  #111111 / #F5F5F7       17.34:1
 *   button/primary-text on primary-hover      #FFFFFF / #27272A       14.89:1  #111111 / #E5E5EA       15.04:1
 *   button/primary-text on primary-pressed    #FFFFFF / #3A3A3F       11.31:1  #111111 / #D1D1D6       12.41:1
 *   on-accent on accent/purple-strong         #FFFFFF / #7C3AED        5.70:1  #111111 / #A78BFA        6.94:1
 *   text-accent (links) on bg/page            #6D28D9 / #FFFFFF        7.10:1  #C4B5FD / #0D0D0F       10.52:1
 *   text-accent (links) on bg/subtle          #6D28D9 / #F5F5F7        6.53:1  #C4B5FD / #161618        9.79:1
 *   text-accent (links) on bg/muted           #6D28D9 / #E9E9EC        5.86:1  #C4B5FD / #242428        8.38:1
 *   text-accent on accent-muted (selected)    #6D28D9 / #F3EEFF        6.25:1  #C4B5FD / #2A1F47        8.21:1
 *   text/primary on accent-muted (selected)   #111111 / #F3EEFF       16.62:1  #F5F5F7 / #2A1F47       13.92:1
 *   badge/info text on indigo fill            #FFFFFF / #4F46E5        6.29:1  #111111 / #818CF8        6.33:1
 *   badge/success text on green fill (#111)   #111111 / #34C759        8.51:1  #111111 / #30D158        9.34:1
 *   badge/warning text on orange fill (#111)  #111111 / #FF9500        8.59:1  #111111 / #FF9F0A        9.19:1
 *   badge/error text on error fill            #FFFFFF / #C81E37        5.68:1  #111111 / #FF6961        6.69:1
 *   status/success text on success-muted      #166534 / #E6F7EB        6.41:1  #86EFAC / #122B1C       10.77:1
 *   status/warning text on warning-muted      #9A3412 / #FFF3E0        6.66:1  #FDBA74 / #2E1F0D        9.45:1
 *   status/error text on error-muted          #B91C1C / #FEECEC        5.68:1  #FCA5A5 / #331618        8.72:1
 *   categorical red/orange/yellow/green/teal/cyan/blue/purple/pink/gray: all >= 5.68:1 light, >= 8.44:1 dark
 *
 * Note on `text/tertiary` (#6E6E73 light): per spec §1, it clears AA on bg/page (5.07:1),
 * bg/subtle (4.66:1), and bg/warm (4.82:1); on bg/muted (#E9E9EC) use `text/secondary` (7.27:1).
 */

export type ColorPair = readonly [light: string, dark: string];

export interface DesignSchemePalette {
  // 90% neutral surfaces
  readonly bgPage: string;
  readonly bgSubtle: string;
  readonly bgCard: string;
  readonly bgPopover: string;
  readonly bgMuted: string;
  readonly bgWarm: string;
  readonly bgInverse: string;
  readonly bgInvertedAstryx: string;
  readonly mediaEmpty: string;
  readonly mediaEmptyCover: string;

  // 90% neutral text & icons
  readonly textPrimary: string;
  readonly textSecondary: string;
  readonly textTertiary: string;
  readonly textDisabled: string;
  readonly textInverse: string;

  // 90% neutral borders
  readonly borderDefault: string;
  readonly borderStrong: string;

  // 9% ink — primary CTA
  readonly buttonPrimaryBg: string;
  readonly buttonPrimaryText: string;
  readonly buttonPrimaryHoverBg: string;
  readonly buttonPrimaryPressedBg: string;

  // 1% brand accent — purple-strong (focus ring, selection, links)
  readonly accentBrand: string;
  readonly onAccentBrand: string;
  readonly accentText: string;
  readonly accentMuted: string;

  // Apple-like system signal accents (spec §1)
  readonly accentBlue: string;
  readonly accentPurple: string;
  readonly accentPurpleStrong: string;
  readonly accentIndigo: string;
  readonly accentPink: string;
  readonly accentOrange: string;
  readonly accentGreen: string;

  // Status roles (status only)
  readonly successText: string;
  readonly successMuted: string;
  readonly onSuccessSolid: string;
  readonly warningText: string;
  readonly warningMuted: string;
  readonly onWarningSolid: string;
  readonly errorText: string;
  readonly errorMuted: string;
  readonly errorSolidBadgeBg: string;
  readonly onErrorSolid: string;
  readonly errorInvertedBg: string;
  readonly infoSolidBadgeBg: string;
  readonly onInfoSolid: string;
  readonly infoText: string;

  // Overlays & shadows
  readonly overlayScrim: string;
  readonly overlayHover: string;
  readonly overlayPressed: string;
  readonly shadowColor: string;
  readonly shadowCard: string;
  readonly shadowButton: string;
  readonly shadowFloat: string;
  readonly shadowPop: string;

  // Categorical palette (tinted chip/card/banner surface + AA text/icon/border)
  readonly categorical: {
    readonly red: { readonly bg: string; readonly border: string; readonly icon: string; readonly text: string };
    readonly orange: { readonly bg: string; readonly border: string; readonly icon: string; readonly text: string };
    readonly yellow: { readonly bg: string; readonly border: string; readonly icon: string; readonly text: string };
    readonly green: { readonly bg: string; readonly border: string; readonly icon: string; readonly text: string };
    readonly teal: { readonly bg: string; readonly border: string; readonly icon: string; readonly text: string };
    readonly cyan: { readonly bg: string; readonly border: string; readonly icon: string; readonly text: string };
    readonly blue: { readonly bg: string; readonly border: string; readonly icon: string; readonly text: string };
    readonly purple: { readonly bg: string; readonly border: string; readonly icon: string; readonly text: string };
    readonly pink: { readonly bg: string; readonly border: string; readonly icon: string; readonly text: string };
    readonly gray: { readonly bg: string; readonly border: string; readonly icon: string; readonly text: string };
  };
}

export const DESIGN_LIGHT: DesignSchemePalette = {
  // 90% neutral surfaces
  bgPage: "#FFFFFF",
  bgSubtle: "#F5F5F7",
  bgCard: "#FFFFFF",
  bgPopover: "#FFFFFF",
  bgMuted: "#E9E9EC",
  bgWarm: "#FAF9F6",
  bgInverse: "#1D1D1F",
  bgInvertedAstryx: "#1D1D1F",
  mediaEmpty: "#F0F0F3",
  mediaEmptyCover: "#E5E5EA",

  // 90% neutral text & icons
  textPrimary: "#111111",
  textSecondary: "#4A4A4F",
  textTertiary: "#6E6E73",
  textDisabled: "#8E8E93",
  textInverse: "#FFFFFF",

  // 90% neutral borders
  borderDefault: "#E5E5EA",
  borderStrong: "#D1D1D6",

  // 9% ink — primary CTA
  buttonPrimaryBg: "#111111",
  buttonPrimaryText: "#FFFFFF",
  buttonPrimaryHoverBg: "#27272A",
  buttonPrimaryPressedBg: "#3A3A3F",

  // 1% brand accent — purple-strong
  accentBrand: "#7C3AED",
  onAccentBrand: "#FFFFFF",
  accentText: "#6D28D9",
  accentMuted: "#F3EEFF",

  // Apple-like system signal accents
  accentBlue: "#007AFF",
  accentPurple: "#AF52DE",
  accentPurpleStrong: "#7C3AED",
  accentIndigo: "#4F46E5",
  accentPink: "#FF2D55",
  accentOrange: "#FF9500",
  accentGreen: "#34C759",

  // Status roles — NEVER white text on green or orange (always #111111)
  successText: "#166534",
  successMuted: "#E6F7EB",
  onSuccessSolid: "#111111",
  warningText: "#9A3412",
  warningMuted: "#FFF3E0",
  onWarningSolid: "#111111",
  errorText: "#B91C1C",
  errorMuted: "#FEECEC",
  errorSolidBadgeBg: "#C81E37",
  onErrorSolid: "#FFFFFF",
  errorInvertedBg: "#B91C1C",
  infoSolidBadgeBg: "#4F46E5",
  onInfoSolid: "#FFFFFF",
  infoText: "#0055B3",

  // Overlays & soft design system elevation (spec §5 & §6)
  overlayScrim: "rgb(17 17 17 / 45%)",
  overlayHover: "rgb(17 17 17 / 4%)",
  overlayPressed: "rgb(17 17 17 / 8%)",
  shadowColor: "rgb(0 0 0 / 8%)",
  shadowCard: "0 1px 2px rgb(0 0 0 / 4%), 0 4px 12px rgb(0 0 0 / 5%)",
  shadowButton: "0 1px 2px rgb(0 0 0 / 6%), 0 1px 1px rgb(0 0 0 / 4%)",
  shadowFloat: "0 2px 6px rgb(0 0 0 / 6%), 0 8px 24px rgb(0 0 0 / 10%)",
  shadowPop: "0 8px 20px rgb(0 0 0 / 8%), 0 20px 48px rgb(0 0 0 / 14%)",

  categorical: {
    red: { bg: "#FEECEC", border: "#F7C5C5", icon: "#B91C1C", text: "#B91C1C" },
    orange: { bg: "#FFF3E0", border: "#FCD5A4", icon: "#9A3412", text: "#9A3412" },
    yellow: { bg: "#FEF7DC", border: "#F5DC87", icon: "#713F12", text: "#713F12" },
    green: { bg: "#E6F7EB", border: "#B7E4C5", icon: "#166534", text: "#166534" },
    teal: { bg: "#E0F7F5", border: "#A7E3DC", icon: "#115E59", text: "#115E59" },
    cyan: { bg: "#E0F5FA", border: "#A5DDE9", icon: "#155E75", text: "#155E75" },
    blue: { bg: "#E8F2FF", border: "#BFD9FC", icon: "#0055B3", text: "#0055B3" },
    purple: { bg: "#F3EEFF", border: "#D6C5FA", icon: "#5B21B6", text: "#5B21B6" },
    pink: { bg: "#FCE7F3", border: "#F6BDD9", icon: "#9D174D", text: "#9D174D" },
    gray: { bg: "#E9E9EC", border: "#D1D1D6", icon: "#4A4A4F", text: "#1D1D1F" },
  },
};

export const DESIGN_DARK: DesignSchemePalette = {
  // 90% neutral surfaces
  bgPage: "#0D0D0F",
  bgSubtle: "#161618",
  bgCard: "#161618",
  bgPopover: "#1E1E22",
  bgMuted: "#242428",
  bgWarm: "#1C1B18",
  bgInverse: "#2C2C30",
  bgInvertedAstryx: "#F5F5F7",
  mediaEmpty: "#1C1C20",
  mediaEmptyCover: "#26262B",

  // 90% neutral text & icons
  textPrimary: "#F5F5F7",
  textSecondary: "#A1A1A6",
  textTertiary: "#8E8E93",
  textDisabled: "#636366",
  textInverse: "#F5F5F7",

  // 90% neutral borders
  borderDefault: "#2C2C30",
  borderStrong: "#3F3F46",

  // 9% ink — inverted primary CTA in dark
  buttonPrimaryBg: "#F5F5F7",
  buttonPrimaryText: "#111111",
  buttonPrimaryHoverBg: "#E5E5EA",
  buttonPrimaryPressedBg: "#D1D1D6",

  // 1% brand accent — purple-strong lifted for dark surfaces
  accentBrand: "#A78BFA",
  onAccentBrand: "#111111",
  accentText: "#C4B5FD",
  accentMuted: "#2A1F47",

  // Apple-like system signal accents (dark variants)
  accentBlue: "#3B82F6",
  accentPurple: "#C084FC",
  accentPurpleStrong: "#A78BFA",
  accentIndigo: "#818CF8",
  accentPink: "#FF375F",
  accentOrange: "#FF9F0A",
  accentGreen: "#30D158",

  // Status roles — NEVER white text on green or orange (always #111111)
  successText: "#86EFAC",
  successMuted: "#122B1C",
  onSuccessSolid: "#111111",
  warningText: "#FDBA74",
  warningMuted: "#2E1F0D",
  onWarningSolid: "#111111",
  errorText: "#FCA5A5",
  errorMuted: "#331618",
  errorSolidBadgeBg: "#FF6961",
  onErrorSolid: "#111111",
  errorInvertedBg: "#B91C1C",
  infoSolidBadgeBg: "#818CF8",
  onInfoSolid: "#111111",
  infoText: "#93C5FD",

  // Overlays & dark elevation (deeper drop + subtle 1px top/rim bezel)
  overlayScrim: "rgb(0 0 0 / 72%)",
  overlayHover: "rgb(255 255 255 / 6%)",
  overlayPressed: "rgb(255 255 255 / 12%)",
  shadowColor: "rgb(0 0 0 / 45%)",
  shadowCard:
    "0 1px 2px rgb(0 0 0 / 30%), 0 4px 12px rgb(0 0 0 / 35%), inset 0 0 0 1px rgb(255 255 255 / 6%)",
  shadowButton: "0 1px 2px rgb(0 0 0 / 35%), inset 0 1px 0 rgb(255 255 255 / 6%)",
  shadowFloat:
    "0 2px 6px rgb(0 0 0 / 40%), 0 8px 24px rgb(0 0 0 / 50%), inset 0 0 0 1px rgb(255 255 255 / 10%)",
  shadowPop:
    "0 8px 20px rgb(0 0 0 / 50%), 0 20px 48px rgb(0 0 0 / 65%), inset 0 0 0 1px rgb(255 255 255 / 12%)",

  categorical: {
    red: { bg: "#331618", border: "#7F2329", icon: "#FCA5A5", text: "#FCA5A5" },
    orange: { bg: "#2E1F0D", border: "#7A4512", icon: "#FDBA74", text: "#FDBA74" },
    yellow: { bg: "#2B2410", border: "#735814", icon: "#FDE047", text: "#FDE047" },
    green: { bg: "#122B1C", border: "#1E663A", icon: "#86EFAC", text: "#86EFAC" },
    teal: { bg: "#112A2A", border: "#1E615E", icon: "#5EEAD4", text: "#5EEAD4" },
    cyan: { bg: "#112830", border: "#1C5C70", icon: "#67E8F9", text: "#67E8F9" },
    blue: { bg: "#172542", border: "#284B8C", icon: "#93C5FD", text: "#93C5FD" },
    purple: { bg: "#261B3F", border: "#553696", icon: "#D8B4FE", text: "#D8B4FE" },
    pink: { bg: "#331625", border: "#802454", icon: "#F9A8D4", text: "#F9A8D4" },
    gray: { bg: "#242428", border: "#3F3F46", icon: "#A1A1A6", text: "#F5F5F7" },
  },
};

/**
 * Scheme-independent scale tokens shared between `vpost.css` and `root-tokens.css`.
 *
 * Typography (§2): 12px hard floor (no 10px anywhere), 16/26 reading body,
 * 14/21 dense UI, H1 28/32, H2 22/30, H3 18/26, Display 56/60.
 * Spacing (§3): 4-pt scale (space/1=4 .. space/9=96; halves 2, 6 for small controls).
 * Radius (§4): xs=6, sm=8, md=10, lg=13, xl=24, pill=999; page=13, chat=18 (<=24).
 * Motion & States (§6): hover/press 165ms (150–200ms), panel 225ms (200–250ms),
 * 4px list slide, focus ring 2px/2px, disabled 40% + not-allowed.
 */
export const DESIGN_SCALE_TOKENS = {
  // Typography — Hanken Grotesk via --font-app-sans, JetBrains Mono via --font-app-mono
  "--font-family-body":
    'var(--font-app-sans), "Hanken Grotesk", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  "--font-family-heading":
    'var(--font-app-sans), "Hanken Grotesk", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  "--font-family-code":
    'var(--font-app-mono), ui-monospace, "SF Mono", Monaco, Consolas, "Liberation Mono", "Courier New", monospace',

  // Raw font-size scale — 12px (0.75rem) hard floor, 10px removed
  "--font-size-4xs": "0.75rem", // 12px floor
  "--font-size-3xs": "0.75rem", // 12px floor
  "--font-size-2xs": "0.75rem", // 12px floor
  "--font-size-xs": "0.75rem", // 12px — Caption
  "--font-size-sm": "0.875rem", // 14px — Body/Small (dense UI), Label
  "--font-size-base": "1rem", // 16px — Body/Base (reading text)
  "--font-size-lg": "1.125rem", // 18px — H3 card title, Body/Lead
  "--font-size-xl": "1.375rem", // 22px — H2 section
  "--font-size-2xl": "1.75rem", // 28px — H1 page title
  "--font-size-3xl": "2.25rem", // 36px — Display 3
  "--font-size-4xl": "2.75rem", // 44px — Display 2
  "--font-size-5xl": "3.5rem", // 56px — Display 1 (marketing only)

  // Semantic Astryx type scale mapped to design system §2
  "--text-display-1-size": "var(--font-size-5xl)", // 56px
  "--text-display-1-weight": "var(--font-weight-semibold)", // 600
  "--text-display-1-leading": "1.0714", // 60px
  "--text-display-2-size": "var(--font-size-4xl)", // 44px
  "--text-display-2-weight": "var(--font-weight-semibold)", // 600
  "--text-display-2-leading": "1.1364", // 50px
  "--text-display-3-size": "var(--font-size-3xl)", // 36px
  "--text-display-3-weight": "var(--font-weight-semibold)", // 600
  "--text-display-3-leading": "1.1667", // 42px
  "--text-heading-1-size": "var(--font-size-2xl)", // 28px
  "--text-heading-1-weight": "var(--font-weight-semibold)", // 600
  "--text-heading-1-leading": "1.1429", // 32px
  "--text-heading-2-size": "var(--font-size-xl)", // 22px
  "--text-heading-2-weight": "var(--font-weight-semibold)", // 600
  "--text-heading-2-leading": "1.3636", // 30px
  "--text-heading-3-size": "var(--font-size-lg)", // 18px
  "--text-heading-3-weight": "var(--font-weight-semibold)", // 600
  "--text-heading-3-leading": "1.4444", // 26px
  "--text-heading-4-size": "var(--font-size-base)", // 16px
  "--text-heading-4-weight": "var(--font-weight-semibold)", // 600
  "--text-heading-4-leading": "1.5", // 24px
  "--text-heading-5-size": "var(--font-size-sm)", // 14px
  "--text-heading-5-weight": "var(--font-weight-semibold)", // 600
  "--text-heading-5-leading": "1.4286", // 20px
  "--text-heading-6-size": "var(--font-size-xs)", // 12px (never 10px)
  "--text-heading-6-weight": "var(--font-weight-semibold)", // 600
  "--text-heading-6-leading": "1.3333", // 16px
  "--text-large-size": "var(--font-size-lg)", // 18px — Body/Lead
  "--text-large-weight": "var(--font-weight-normal)", // 400
  "--text-large-leading": "1.5556", // 28px
  "--text-body-size": "var(--font-size-base)", // 16px — Body/Base
  "--text-body-weight": "var(--font-weight-normal)", // 400
  "--text-body-leading": "1.625", // 26px
  "--text-label-size": "var(--font-size-sm)", // 14px — Label
  "--text-label-weight": "var(--font-weight-medium)", // 500
  "--text-label-leading": "1.4286", // 20px
  "--text-code-size": "var(--font-size-sm)", // 14px
  "--text-code-weight": "var(--font-weight-normal)", // 400
  "--text-code-leading": "1.5", // 21px
  "--text-supporting-size": "var(--font-size-sm)", // 14px — Body/Small (dense UI)
  "--text-supporting-weight": "var(--font-weight-normal)", // 400
  "--text-supporting-leading": "1.5", // 21px

  // Additive design system type tokens
  "--text-lead-size": "var(--font-size-lg)",
  "--text-lead-weight": "var(--font-weight-normal)",
  "--text-lead-leading": "1.5556",
  "--text-body-small-size": "var(--font-size-sm)",
  "--text-body-small-weight": "var(--font-weight-normal)",
  "--text-body-small-leading": "1.5",
  "--text-caption-size": "var(--font-size-xs)",
  "--text-caption-weight": "var(--font-weight-medium)",
  "--text-caption-leading": "1.3333",

  // Astryx linear 4-pt spacing tokens (kept intact for Stack/Layout gap & padding props)
  "--spacing-0": "0px",
  "--spacing-0-5": "2px",
  "--spacing-1": "4px",
  "--spacing-1-5": "6px",
  "--spacing-2": "8px",
  "--spacing-3": "12px",
  "--spacing-4": "16px",
  "--spacing-5": "20px",
  "--spacing-6": "24px",
  "--spacing-7": "28px",
  "--spacing-8": "32px",
  "--spacing-9": "36px",
  "--spacing-10": "40px",
  "--spacing-11": "44px",
  "--spacing-12": "48px",

  // design system 4-pt semantic spacing scale (§3)
  "--space-0-5": "2px",
  "--space-1": "4px",
  "--space-1-5": "6px",
  "--space-2": "8px",
  "--space-3": "12px",
  "--space-4": "16px",
  "--space-5": "24px",
  "--space-6": "32px",
  "--space-7": "48px",
  "--space-8": "64px",
  "--space-9": "96px",
  "--space-card-padding": "20px",
  "--space-gutter-desktop": "24px",
  "--space-gutter-mobile": "16px",
  "--space-section-gap": "32px",

  // Radius — small and consistent (§4), 56px removed
  "--radius": "0.625rem", // 10px base for Tailwind --radius-sm/md/lg/xl calc() in globals.css
  "--radius-none": "0px",
  "--radius-xs": "6px",
  "--radius-sm": "8px",
  "--radius-md": "10px",
  "--radius-lg": "13px",
  "--radius-xl": "24px",
  "--radius-pill": "999px",
  "--radius-inner": "6px", // xs — nested corners & chat tail
  "--radius-element": "10px", // md — buttons & inputs
  "--radius-container": "13px", // lg — cards & panels
  "--radius-page": "13px", // lg (<=24) — stops AppShell clipping top-left headings
  "--radius-chat": "18px", // <=24 — chat bubbles (tail corner uses --radius-inner 6px)
  "--radius-chat-tail": "6px",
  "--radius-full": "9999px",

  // Soft design system elevation shadows (§5) — per-layer light-dark(<color>, <color>)
  // because CSS light-dark() only accepts <color> values, never full box-shadow lists.
  "--shadow-card":
    "0 1px 2px light-dark(rgb(0 0 0 / 4%), rgb(0 0 0 / 30%)), 0 4px 12px light-dark(rgb(0 0 0 / 5%), rgb(0 0 0 / 35%)), inset 0 0 0 1px light-dark(transparent, rgb(255 255 255 / 6%))",
  "--shadow-button":
    "0 1px 2px light-dark(rgb(0 0 0 / 6%), rgb(0 0 0 / 35%)), 0 1px 1px light-dark(rgb(0 0 0 / 4%), transparent), inset 0 1px 0 light-dark(transparent, rgb(255 255 255 / 6%))",
  "--shadow-float":
    "0 2px 6px light-dark(rgb(0 0 0 / 6%), rgb(0 0 0 / 40%)), 0 8px 24px light-dark(rgb(0 0 0 / 10%), rgb(0 0 0 / 50%)), inset 0 0 0 1px light-dark(transparent, rgb(255 255 255 / 10%))",
  "--shadow-pop":
    "0 8px 20px light-dark(rgb(0 0 0 / 8%), rgb(0 0 0 / 50%)), 0 20px 48px light-dark(rgb(0 0 0 / 14%), rgb(0 0 0 / 65%)), inset 0 0 0 1px light-dark(transparent, rgb(255 255 255 / 12%))",

  // Inset state shadows — accent/status tokens, zero raw hex (§5)
  "--shadow-inset-hover": "inset 0 0 0 2px color-mix(in srgb, var(--color-accent) 30%, transparent)",
  "--shadow-inset-selected":
    "inset 0 0 0 2px color-mix(in srgb, var(--color-accent) 55%, transparent)",
  "--shadow-inset-success":
    "inset 0 0 0 2px color-mix(in srgb, var(--color-success) 35%, transparent)",
  "--shadow-inset-warning":
    "inset 0 0 0 2px color-mix(in srgb, var(--color-warning) 40%, transparent)",
  "--shadow-inset-error":
    "inset 0 0 0 2px color-mix(in srgb, var(--color-error) 35%, transparent)",

  // Interaction state & motion tokens (§6)
  "--focus-ring-width": "2px",
  "--focus-ring-offset": "2px",
  "--focus-ring-color": "var(--color-accent)",
  "--focus-ring": "0 0 0 2px var(--bg-page), 0 0 0 4px var(--color-accent)",
  "--state-hover-bg": "var(--bg-subtle)",
  "--state-hover-overlay": "var(--color-overlay-hover)",
  "--state-pressed-overlay": "var(--color-overlay-pressed)",
  "--state-selected-bg": "var(--color-accent-muted)",
  "--state-selected-bar": "var(--color-accent)",
  "--state-selected-text": "var(--color-text-accent)",
  "--state-disabled-opacity": "0.4",
  "--state-disabled-cursor": "not-allowed",
  "--ease-out": "cubic-bezier(0.22, 1, 0.36, 1)",
  "--motion-hover": "165ms", // 150–200ms hover/press band (= --duration-fast-max)
  "--motion-panel": "225ms", // 200–250ms panel band (= --duration-medium-min)
  "--motion-item-slide": "4px", // new list items fade + 4px slide
  "--transition-interactive":
    "background-color var(--motion-hover) var(--ease-out), border-color var(--motion-hover) var(--ease-out), color var(--motion-hover) var(--ease-out), box-shadow var(--motion-hover) var(--ease-out), opacity var(--motion-hover) var(--ease-out)",
  "--transition-panel":
    "opacity var(--motion-panel) var(--ease-out), transform var(--motion-panel) var(--ease-out)",
} as const;

/**
 * Root Tailwind / shadcn + design system token values for a single colour scheme.
 * Mirrored in `src/ui/theme/root-tokens.css` for `:root:not(.dark)` (light) and
 * `:root.dark` (dark) — verified in sync by `vpost-theme.test.ts` — so `<body>`,
 * Tailwind utilities, and portalled dialogs share the exact same design system
 * palette as Astryx.
 */
export function buildRootSchemeTokens(
  palette: DesignSchemePalette,
): Readonly<Record<string, string>> {
  return {
    // Tailwind / shadcn bridge tokens (consumed by `app/globals.css` @theme inline)
    "--background": palette.bgPage,
    "--foreground": palette.textPrimary,
    "--foreground-subtle": palette.textTertiary,
    "--card": palette.bgCard,
    "--card-foreground": palette.textPrimary,
    "--popover": palette.bgPopover,
    "--popover-foreground": palette.textPrimary,
    "--primary": palette.buttonPrimaryBg,
    "--primary-foreground": palette.buttonPrimaryText,
    "--secondary": palette.bgMuted,
    "--secondary-foreground": palette.textPrimary,
    "--muted": palette.bgMuted,
    "--muted-foreground": palette.textSecondary,
    "--accent": palette.accentMuted,
    "--accent-foreground": palette.accentText,
    "--destructive": palette.errorText,
    "--warning": palette.accentOrange,
    "--warning-foreground": palette.warningText,
    "--success": palette.accentGreen,
    "--success-foreground": palette.successText,
    "--info": palette.accentBlue,
    "--info-foreground": palette.infoText,
    "--media-empty": palette.mediaEmpty,
    "--media-empty-cover": palette.mediaEmptyCover,
    "--inverse-surface": palette.bgInverse,
    "--inverse-foreground": palette.textInverse,
    "--border": palette.borderDefault,
    "--input": palette.borderStrong,
    "--ring": palette.accentBrand,
    "--chart-1": palette.accentPurpleStrong,
    "--chart-2": palette.accentBlue,
    "--chart-3": palette.accentGreen,
    "--chart-4": palette.accentOrange,
    "--chart-5": palette.accentPink,
    "--sidebar": palette.bgSubtle,
    "--sidebar-foreground": palette.textPrimary,
    "--sidebar-primary": palette.buttonPrimaryBg,
    "--sidebar-primary-foreground": palette.buttonPrimaryText,
    "--sidebar-accent": palette.accentMuted,
    "--sidebar-accent-foreground": palette.accentText,
    "--sidebar-border": palette.borderDefault,
    "--sidebar-ring": palette.accentBrand,

    // design system semantic aliases (available on :root for portals & Tailwind consumers)
    "--bg-page": palette.bgPage,
    "--bg-subtle": palette.bgSubtle,
    "--bg-muted": palette.bgMuted,
    "--bg-warm": palette.bgWarm,
    "--bg-inverse": palette.bgInverse,
    "--text-primary": palette.textPrimary,
    "--text-secondary": palette.textSecondary,
    "--text-tertiary": palette.textTertiary,
    "--text-inverse": palette.textInverse,
    "--border-default": palette.borderDefault,
    "--border-strong": palette.borderStrong,
    "--button-primary-bg": palette.buttonPrimaryBg,
    "--button-primary-text": palette.buttonPrimaryText,
    "--button-primary-hover-bg": palette.buttonPrimaryHoverBg,
    "--button-primary-pressed-bg": palette.buttonPrimaryPressedBg,
    "--accent-blue": palette.accentBlue,
    "--accent-purple": palette.accentPurple,
    "--accent-purple-strong": palette.accentPurpleStrong,
    "--accent-indigo": palette.accentIndigo,
    "--accent-pink": palette.accentPink,
    "--accent-orange": palette.accentOrange,
    "--accent-green": palette.accentGreen,
    ...DESIGN_SCALE_TOKENS,

    // Scheme-resolved elevation shadows (overwrite the light-dark() defaults above
    // on :root / :root.dark so consumers outside [data-astryx-theme] get exact values)
    "--shadow-card": palette.shadowCard,
    "--shadow-button": palette.shadowButton,
    "--shadow-float": palette.shadowFloat,
    "--shadow-pop": palette.shadowPop,
    "--shadow-low": palette.shadowCard,
    "--shadow-med": palette.shadowFloat,
    "--shadow-high": palette.shadowPop,
  };
}
