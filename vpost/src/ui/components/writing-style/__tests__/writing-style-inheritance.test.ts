import { describe, expect, it } from "vitest";

import {
  buildScopeOptions,
  inheritedLengthOptionLabel,
  inheritedListHint,
  inheritedMentionOptionLabel,
  inheritedNumberPlaceholder,
  inheritedTextPlaceholder,
  resolveInheritedBase,
} from "@/ui/components/writing-style/writing-style-inheritance";
import type { Channel } from "@/ui/schemas/channel.schema";
import type { WritingStyleOverviewResponse } from "@/ui/schemas/writing-style.schema";

const CHANNELS: readonly Channel[] = [
  {
    channelId: "page-1",
    platform: "facebook",
    name: "Nàng Thơ Hà Nội",
    externalId: "ext-1",
    status: "active",
    tokenExpiresAt: null,
  },
  {
    channelId: "page-2",
    platform: "facebook",
    name: "Nàng Thơ Sài Gòn",
    externalId: "ext-2",
    status: "active",
    tokenExpiresAt: null,
  },
];

const OVERVIEW: WritingStyleOverviewResponse = {
  tenantId: "tenant-1",
  default: {
    industry: "mỹ phẩm thiên nhiên",
    xungHo: "chị",
  },
  overrides: [
    {
      channelId: "page-1",
      channelName: "Nàng Thơ Hà Nội",
      style: { voice: "Ấm áp, tinh tế" },
      updatedAt: "2026-11-27T09:00:00Z",
    },
  ],
  effectiveDefault: {
    shopName: "",
    mentionShopName: false,
    industry: "mỹ phẩm thiên nhiên",
    audience: "",
    voice: "Váy áo nữ phong cách sang chảnh, quý phái",
    xungHo: "chị",
    selfReference: "",
    maxEmoji: 3,
    length: "medium",
    ctaStyle: "",
    hashtags: { fixed: ["#NangTho"], maxExtra: 3 },
    footer: "Được kiểm tra hàng trước khi thanh toán",
    extraBanned: ["xả kho"],
    dos: ["Nêu rõ chất liệu"],
    donts: [],
    examples: [],
  },
  updatedAt: "2026-11-27T08:00:00Z",
};

describe("scope options and inheritance badges", () => {
  it("lists company default followed by connected Pages with accurate override badges", () => {
    const options = buildScopeOptions(CHANNELS, OVERVIEW);
    expect(options).toHaveLength(3);

    expect(options[0]).toMatchObject({
      scope: "default",
      kind: "default",
      label: "Mặc định công ty",
      badgeLabel: null,
    });

    expect(options[1]).toMatchObject({
      scope: "page-1",
      kind: "channel",
      label: "Riêng cho Nàng Thơ Hà Nội",
      hasOverride: true,
      hasStoredOverride: true,
      badgeLabel: "Có thiết lập riêng",
    });

    expect(options[2]).toMatchObject({
      scope: "page-2",
      kind: "channel",
      label: "Riêng cho Nàng Thơ Sài Gòn",
      hasOverride: false,
      hasStoredOverride: false,
      badgeLabel: "Đang dùng mặc định",
    });
  });

  it("retains overrides whose channel is missing from the active channels list", () => {
    const options = buildScopeOptions([CHANNELS[1]!], OVERVIEW);
    expect(options.map((item) => item.scope)).toEqual(["default", "page-2", "page-1"]);
    expect(options[2]?.label).toBe("Riêng cho Nàng Thơ Hà Nội");
    expect(options[2]?.hasOverride).toBe(true);
  });
});

describe("inheritance placeholders", () => {
  it("resolves effectiveDefault as inherited base for Page scopes", () => {
    const inherited = resolveInheritedBase("page-2", OVERVIEW);
    expect(inherited.industry).toBe("mỹ phẩm thiên nhiên");
    expect(inherited.xungHo).toBe("chị");
    expect(inherited.voice).toBe("Váy áo nữ phong cách sang chảnh, quý phái");
    expect(inherited.maxEmoji).toBe(3);
  });

  it("only exposes base-page inherited values on company default when not set in default", () => {
    const inherited = resolveInheritedBase("default", OVERVIEW);
    // Explicitly set in overview.default -> not treated as inherited placeholder
    expect(inherited.industry).toBeUndefined();
    expect(inherited.xungHo).toBeUndefined();
    // Unset in overview.default -> inherited from base page via effectiveDefault
    expect(inherited.voice).toBe("Váy áo nữ phong cách sang chảnh, quý phái");
    expect(inherited.maxEmoji).toBe(3);
    expect(inherited.footer).toBe("Được kiểm tra hàng trước khi thanh toán");
  });

  it("formats text placeholders with Mặc định: prefix and truncates long text", () => {
    expect(inheritedTextPlaceholder("thời trang nữ", "Ví dụ")).toBe(
      "Mặc định: thời trang nữ",
    );
    expect(inheritedTextPlaceholder("   ", "Ví dụ: Shop A")).toBe("Ví dụ: Shop A");

    const longVoice = "a".repeat(120);
    const placeholder = inheritedTextPlaceholder(longVoice, "Ví dụ");
    expect(placeholder.startsWith("Mặc định: ")).toBe(true);
    expect(placeholder.endsWith("…")).toBe(true);
    expect(placeholder.length).toBeLessThanOrEqual(85);
  });

  it("formats number, length, mention, and list inheritance helpers", () => {
    expect(inheritedNumberPlaceholder(3, "0–10")).toBe("Mặc định: 3");
    expect(inheritedNumberPlaceholder(undefined, "0–10")).toBe("0–10");

    expect(inheritedLengthOptionLabel("short")).toBe("Mặc định (Ngắn (1–2 câu))");
    expect(inheritedLengthOptionLabel(undefined)).toBe("Theo mặc định");

    expect(inheritedMentionOptionLabel(true)).toBe("Mặc định (Có nhắc)");
    expect(inheritedMentionOptionLabel(false)).toBe("Mặc định (Không nhắc)");

    const replaceHint = inheritedListHint(["Mục A", "Mục B"], { itemNoun: "mục nên làm" });
    expect(replaceHint).toContain("Mặc định: 2 mục nên làm");
    expect(replaceHint).toContain("thay thế danh sách mặc định");

    const mergeHint = inheritedListHint(["xả kho"], {
      itemNoun: "cụm từ cấm",
      mergesWithParent: true,
    });
    expect(mergeHint).toContain("gộp thêm vào danh sách mặc định");
    expect(inheritedListHint([], { itemNoun: "hashtag" })).toBeNull();
  });
});
