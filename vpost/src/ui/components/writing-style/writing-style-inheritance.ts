import type { Channel } from "@/ui/schemas/channel.schema";
import {
  WRITING_STYLE_LENGTH_LABELS,
  type WritingStyle,
  type WritingStyleChannelResponse,
  type WritingStyleLength,
  type WritingStyleOverviewResponse,
} from "@/ui/schemas/writing-style.schema";

import {
  DEFAULT_SCOPE,
  hasAnyConfiguredField,
  type WritingStyleScope,
} from "./writing-style-form";

/**
 * Pure inheritance & scope-option helpers for "Phong cách viết".
 *
 * Resolution chain (`.swarm/specs/writing-style.md`):
 *   base page -> company default -> Page override
 */

export interface ScopeOption {
  readonly scope: WritingStyleScope;
  readonly kind: "default" | "channel";
  /** Display label: "Mặc định công ty" or "Riêng cho <Page>". */
  readonly label: string;
  readonly channelName: string | null;
  /** True when the Page has a configured override style. */
  readonly hasOverride: boolean;
  /** True when the backend holds a stored override row that can be deleted. */
  readonly hasStoredOverride: boolean;
  /** Badge text for Page scopes ("Đang dùng mặc định" / "Có thiết lập riêng"). */
  readonly badgeLabel: string | null;
  readonly updatedAt: string | null;
}

const MAX_PLACEHOLDER_VALUE_CHARS = 72;

function truncateInline(value: string, maxChars: number): string {
  const collapsed = value.replace(/\s+/g, " ").trim();
  if (collapsed.length <= maxChars) return collapsed;
  return `${collapsed.slice(0, maxChars - 1).trimEnd()}…`;
}

/**
 * Builds the scope list: "Mặc định công ty" followed by each connected Page
 * ("Riêng cho <Page>") plus any existing override whose channel is not in the
 * active list yet.
 */
export function buildScopeOptions(
  channels: readonly Channel[],
  overview: WritingStyleOverviewResponse | undefined,
): readonly ScopeOption[] {
  const overrideByChannelId = new Map(
    (overview?.overrides ?? []).map((item) => [item.channelId, item]),
  );

  const options: ScopeOption[] = [
    {
      scope: DEFAULT_SCOPE,
      kind: "default",
      label: "Mặc định công ty",
      channelName: null,
      hasOverride: false,
      hasStoredOverride: false,
      badgeLabel: null,
      updatedAt: overview?.updatedAt ?? null,
    },
  ];

  const seenChannelIds = new Set<string>();

  for (const channel of channels) {
    seenChannelIds.add(channel.channelId);
    const override = overrideByChannelId.get(channel.channelId);
    const channelName =
      channel.name.trim() || override?.channelName.trim() || channel.channelId;
    const hasOverride = override !== undefined && hasAnyConfiguredField(override.style);
    options.push({
      scope: channel.channelId,
      kind: "channel",
      label: `Riêng cho ${channelName}`,
      channelName,
      hasOverride,
      hasStoredOverride: override !== undefined,
      badgeLabel: hasOverride ? "Có thiết lập riêng" : "Đang dùng mặc định",
      updatedAt: override?.updatedAt ?? null,
    });
  }

  for (const override of overview?.overrides ?? []) {
    if (seenChannelIds.has(override.channelId)) continue;
    const channelName = override.channelName.trim() || override.channelId;
    const hasOverride = hasAnyConfiguredField(override.style);
    options.push({
      scope: override.channelId,
      kind: "channel",
      label: `Riêng cho ${channelName}`,
      channelName,
      hasOverride,
      hasStoredOverride: true,
      badgeLabel: hasOverride ? "Có thiết lập riêng" : "Đang dùng mặc định",
      updatedAt: override.updatedAt,
    });
  }

  return options;
}

/**
 * Returns the inherited style layer for the active scope:
 *  - For a Page scope: `overview.effectiveDefault` (base page + company default).
 *  - For the company default scope: values from `overview.effectiveDefault` that
 *    were NOT explicitly overridden in `overview.default` (i.e. true base-page
 *    defaults).
 */
export function resolveInheritedBase(
  scope: WritingStyleScope,
  overview: WritingStyleOverviewResponse | undefined,
  channelDetail?: WritingStyleChannelResponse,
): WritingStyle {
  if (!overview) return {};

  if (scope !== DEFAULT_SCOPE) {
    // On a Page scope, leaving a field blank inherits the company's effective default.
    // If channelDetail carries effective fields when overview lacks one, fill only missing keys.
    const base = overview.effectiveDefault;
    if (!channelDetail) return base;
    return {
      ...base,
      hashtags: base.hashtags ?? channelDetail.effective.hashtags,
    };
  }

  const saved = overview.default;
  const eff = overview.effectiveDefault;
  const inherited: WritingStyle = {};

  if (!saved.shopName && eff.shopName) inherited.shopName = eff.shopName;
  if (saved.mentionShopName === undefined && typeof eff.mentionShopName === "boolean") {
    inherited.mentionShopName = eff.mentionShopName;
  }
  if (!saved.industry && eff.industry) inherited.industry = eff.industry;
  if (!saved.audience && eff.audience) inherited.audience = eff.audience;
  if (!saved.voice && eff.voice) inherited.voice = eff.voice;
  if (!saved.xungHo && eff.xungHo) inherited.xungHo = eff.xungHo;
  if (!saved.selfReference && eff.selfReference) inherited.selfReference = eff.selfReference;
  if (saved.maxEmoji === undefined && typeof eff.maxEmoji === "number") {
    inherited.maxEmoji = eff.maxEmoji;
  }
  if (saved.length === undefined && eff.length !== undefined) {
    inherited.length = eff.length;
  }
  if (!saved.ctaStyle && eff.ctaStyle) inherited.ctaStyle = eff.ctaStyle;

  const inheritedFixed = !saved.hashtags?.fixed?.length ? eff.hashtags?.fixed : undefined;
  const inheritedMaxExtra =
    saved.hashtags?.maxExtra === undefined ? eff.hashtags?.maxExtra : undefined;
  if ((inheritedFixed && inheritedFixed.length > 0) || typeof inheritedMaxExtra === "number") {
    inherited.hashtags = {};
    if (inheritedFixed && inheritedFixed.length > 0) inherited.hashtags.fixed = inheritedFixed;
    if (typeof inheritedMaxExtra === "number") inherited.hashtags.maxExtra = inheritedMaxExtra;
  }

  if (!saved.footer && eff.footer) inherited.footer = eff.footer;
  if (!saved.extraBanned?.length && eff.extraBanned?.length) {
    inherited.extraBanned = eff.extraBanned;
  }
  if (!saved.dos?.length && eff.dos?.length) inherited.dos = eff.dos;
  if (!saved.donts?.length && eff.donts?.length) inherited.donts = eff.donts;
  if (!saved.examples?.length && eff.examples?.length) inherited.examples = eff.examples;

  return inherited;
}

/**
 * Formats an inherited text value as `"Mặc định: …"` when present, otherwise
 * returns the field's example placeholder.
 */
export function inheritedTextPlaceholder(
  inheritedValue: string | undefined | null,
  fallback: string,
): string {
  const trimmed = inheritedValue?.trim() ?? "";
  if (trimmed.length === 0) return fallback;
  return `Mặc định: ${truncateInline(trimmed, MAX_PLACEHOLDER_VALUE_CHARS)}`;
}

export function inheritedNumberPlaceholder(
  inheritedValue: number | undefined | null,
  fallback: string,
): string {
  if (typeof inheritedValue !== "number" || !Number.isFinite(inheritedValue)) {
    return fallback;
  }
  return `Mặc định: ${inheritedValue}`;
}

export function inheritedLengthOptionLabel(
  inheritedLength: WritingStyleLength | undefined,
): string {
  if (!inheritedLength) return "Theo mặc định";
  return `Mặc định (${WRITING_STYLE_LENGTH_LABELS[inheritedLength]})`;
}

export function inheritedMentionOptionLabel(
  inheritedMention: boolean | undefined,
): string {
  if (inheritedMention === true) return "Mặc định (Có nhắc)";
  return "Mặc định (Không nhắc)";
}

/**
 * Explains what a list field inherits when empty on a Page override (or company default).
 */
export function inheritedListHint(
  inheritedItems: readonly string[] | undefined,
  options: { readonly itemNoun: string; readonly mergesWithParent?: boolean },
): string | null {
  if (!inheritedItems || inheritedItems.length === 0) return null;
  const preview = inheritedItems
    .slice(0, 3)
    .map((item) => truncateInline(item, 28))
    .join(", ");
  const suffix = inheritedItems.length > 3 ? ` và ${inheritedItems.length - 3} mục khác` : "";
  const behavior = options.mergesWithParent
    ? "Các mục nhập ở đây sẽ gộp thêm vào danh sách mặc định."
    : "Để trống để kế thừa; thêm mục ở đây sẽ thay thế danh sách mặc định.";
  return `Mặc định: ${inheritedItems.length} ${options.itemNoun} (${preview}${suffix}). ${behavior}`;
}
