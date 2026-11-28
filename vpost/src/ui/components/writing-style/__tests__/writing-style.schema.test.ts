import { describe, expect, it } from "vitest";

import {
  WritingStyleChannelResponseSchema,
  WritingStyleOverviewResponseSchema,
  WritingStylePreviewResponseSchema,
  WritingStyleSchema,
  isValidHashtag,
} from "@/ui/schemas/writing-style.schema";
import { ApiError } from "@/ui/services/api-error";
import {
  WritingStyleValidationError,
  parseWritingStyleErrorBody,
} from "@/ui/services/writing-style.api";

describe("writing-style schema parsing", () => {
  it("parses a full GET /api/writing-style overview fixture", () => {
    const fixture = {
      tenantId: "tenant-1",
      default: {
        shopName: "Nàng Thơ Boutique",
        mentionShopName: false,
        industry: "thời trang nữ",
        audience: "Nữ văn phòng 24–35 tuổi",
        voice: "Nhẹ nhàng, chọn lọc từ ngữ tinh tế",
        xungHo: "nàng",
        selfReference: "shop",
        maxEmoji: 3,
        length: "medium",
        ctaStyle: "Nhắc khách nhắn chiều cao, cân nặng để chọn size",
        hashtags: {
          fixed: ["#NàngThơ", "vay_cong_so"],
          maxExtra: 3,
        },
        footer: "Được kiểm tra hàng trước khi thanh toán",
        extraBanned: ["xả kho", "giá sốc"],
        dos: ["Nhấn mạnh form dáng và chất vải"],
        donts: ["Không viết in hoa cả câu"],
        examples: ["Mẫu đầm linen mới về, form chữ A nhẹ nhàng cho nàng đi làm."],
      },
      overrides: [
        {
          channelId: "ch-1",
          channelName: "Nàng Thơ Sài Gòn",
          style: {
            xungHo: "chị",
            maxEmoji: 2,
          },
          updatedAt: "2026-11-27T10:15:00Z",
        },
      ],
      effectiveDefault: {
        shopName: "Nàng Thơ Boutique",
        mentionShopName: false,
        industry: "thời trang nữ",
        audience: "Nữ văn phòng 24–35 tuổi",
        voice: "Nhẹ nhàng, chọn lọc từ ngữ tinh tế",
        xungHo: "nàng",
        selfReference: "shop",
        maxEmoji: 3,
        length: "medium",
        ctaStyle: "Nhắc khách nhắn chiều cao, cân nặng để chọn size",
        hashtags: { fixed: ["#NàngThơ", "vay_cong_so"], maxExtra: 3 },
        footer: "Được kiểm tra hàng trước khi thanh toán",
        extraBanned: ["xả kho", "giá sốc"],
        dos: ["Nhấn mạnh form dáng và chất vải"],
        donts: ["Không viết in hoa cả câu"],
        examples: ["Mẫu đầm linen mới về, form chữ A nhẹ nhàng cho nàng đi làm."],
      },
      updatedAt: "2026-11-27T10:00:00Z",
    };

    const parsed = WritingStyleOverviewResponseSchema.parse(fixture);
    expect(parsed.tenantId).toBe("tenant-1");
    expect(parsed.default.xungHo).toBe("nàng");
    expect(parsed.overrides).toHaveLength(1);
    expect(parsed.overrides[0]?.channelName).toBe("Nàng Thơ Sài Gòn");
    expect(parsed.updatedAt).toBe("2026-11-27T10:00:00Z");
  });

  it("normalizes empty or null updatedAt timestamps to null", () => {
    const parsed = WritingStyleOverviewResponseSchema.parse({
      tenantId: "tenant-1",
      default: {},
      overrides: [
        { channelId: "ch-1", channelName: "Page A", style: {}, updatedAt: "" },
      ],
      effectiveDefault: {
        shopName: "",
        mentionShopName: false,
        industry: "thời trang nữ",
        audience: "",
        voice: "",
        xungHo: "nàng",
        selfReference: "",
        maxEmoji: 3,
        length: "medium",
        ctaStyle: "",
        hashtags: { fixed: [], maxExtra: 3 },
        footer: "",
        extraBanned: [],
        dos: [],
        donts: [],
        examples: [],
      },
      updatedAt: null,
    });

    expect(parsed.updatedAt).toBeNull();
    expect(parsed.overrides[0]?.updatedAt).toBeNull();
  });

  it("parses GET /api/writing-style/{channelId} response", () => {
    const parsed = WritingStyleChannelResponseSchema.parse({
      tenantId: "tenant-1",
      channelId: "ch-1",
      style: { voice: "Trẻ trung, gần gũi" },
      effective: {
        industry: "thời trang nữ",
        voice: "Trẻ trung, gần gũi",
        xungHo: "bạn",
        maxEmoji: 4,
        length: "short",
      },
    });

    expect(parsed.channelId).toBe("ch-1");
    expect(parsed.style.voice).toBe("Trẻ trung, gần gũi");
    expect(parsed.effective.length).toBe("short");
    expect(parsed.updatedAt).toBeNull();
  });

  it("parses POST /api/writing-style/preview write and flag responses", () => {
    const written = WritingStylePreviewResponseSchema.parse({
      tenantId: "tenant-1",
      decision: "write",
      post: "Mẫu váy mới lên dáng gọn nhẹ cho nàng đi làm.\n#vaycongso",
      reasons: [],
      warnings: ["Thiếu ghi chú chất vải trong dữ liệu sản phẩm"],
      systemPromptChars: 1420,
      tokensIn: 612,
      tokensOut: 148,
    });
    expect(written.decision).toBe("write");
    expect(written.warnings).toHaveLength(1);

    const flagged = WritingStylePreviewResponseSchema.parse({
      tenantId: "tenant-1",
      decision: "flag",
      post: "",
      reasons: [{ field: "inventory", issue: "Sản phẩm đã hết hàng" }],
      warnings: [],
      systemPromptChars: 1420,
      tokensIn: 0,
      tokensOut: 0,
    });
    expect(flagged.decision).toBe("flag");
    expect(flagged.reasons[0]?.field).toBe("inventory");
  });

  it("enforces string, numeric, enum, hashtag, and list bounds", () => {
    expect(WritingStyleSchema.safeParse({ shopName: "a".repeat(81) }).success).toBe(false);
    expect(WritingStyleSchema.safeParse({ industry: "a".repeat(81) }).success).toBe(false);
    expect(WritingStyleSchema.safeParse({ audience: "a".repeat(201) }).success).toBe(false);
    expect(WritingStyleSchema.safeParse({ voice: "a".repeat(401) }).success).toBe(false);
    expect(WritingStyleSchema.safeParse({ xungHo: "a".repeat(21) }).success).toBe(false);
    expect(WritingStyleSchema.safeParse({ selfReference: "a".repeat(21) }).success).toBe(false);
    expect(WritingStyleSchema.safeParse({ ctaStyle: "a".repeat(201) }).success).toBe(false);
    expect(WritingStyleSchema.safeParse({ footer: "a".repeat(301) }).success).toBe(false);

    expect(WritingStyleSchema.safeParse({ maxEmoji: -1 }).success).toBe(false);
    expect(WritingStyleSchema.safeParse({ maxEmoji: 11 }).success).toBe(false);
    expect(WritingStyleSchema.safeParse({ maxEmoji: 2.5 }).success).toBe(false);
    expect(WritingStyleSchema.safeParse({ length: "extra-long" }).success).toBe(false);

    expect(
      WritingStyleSchema.safeParse({ hashtags: { fixed: ["a", "b", "c", "d", "e", "f"] } })
        .success,
    ).toBe(false);
    expect(
      WritingStyleSchema.safeParse({ hashtags: { fixed: ["#bad tag"] } }).success,
    ).toBe(false);
    expect(WritingStyleSchema.safeParse({ hashtags: { maxExtra: 6 } }).success).toBe(false);

    expect(
      WritingStyleSchema.safeParse({ extraBanned: Array.from({ length: 31 }, (_, i) => `t${i}`) })
        .success,
    ).toBe(false);
    expect(WritingStyleSchema.safeParse({ extraBanned: ["a".repeat(41)] }).success).toBe(false);
    expect(
      WritingStyleSchema.safeParse({ dos: Array.from({ length: 11 }, (_, i) => `d${i}`) })
        .success,
    ).toBe(false);
    expect(WritingStyleSchema.safeParse({ dos: ["a".repeat(161)] }).success).toBe(false);
    expect(
      WritingStyleSchema.safeParse({ donts: Array.from({ length: 11 }, (_, i) => `n${i}`) })
        .success,
    ).toBe(false);
    expect(
      WritingStyleSchema.safeParse({ examples: Array.from({ length: 6 }, (_, i) => `e${i}`) })
        .success,
    ).toBe(false);
    expect(WritingStyleSchema.safeParse({ examples: ["a".repeat(1201)] }).success).toBe(false);
  });

  it("validates Unicode Vietnamese hashtags accurately", () => {
    expect(isValidHashtag("#ThờiTrangNữ_2026")).toBe(true);
    expect(isValidHashtag("vay_cong_so")).toBe(true);
    expect(isValidHashtag("#")).toBe(false);
    expect(isValidHashtag("#có dấu cách")).toBe(false);
    expect(isValidHashtag("#gach-ngang")).toBe(false);
    expect(isValidHashtag(`#${"a".repeat(41)}`)).toBe(false);
  });

  it("preserves structured fields from 400 INVALID_INPUT and 429 RATE_LIMITED error bodies", () => {
    const validationErr = parseWritingStyleErrorBody(400, {
      code: "INVALID_INPUT",
      message: "Dữ liệu phong cách viết không hợp lệ",
      fields: [
        { field: "voice", message: "giọng văn tối đa 400 ký tự" },
        { field: "hashtags.fixed", message: "tối đa 5 hashtag cố định" },
      ],
    });

    expect(validationErr).toBeInstanceOf(WritingStyleValidationError);
    expect(ApiError.is(validationErr)).toBe(true);
    expect((validationErr as WritingStyleValidationError).fields).toHaveLength(2);
    expect(validationErr.issues).toEqual([
      { path: "voice", message: "giọng văn tối đa 400 ký tự" },
      { path: "hashtags.fixed", message: "tối đa 5 hashtag cố định" },
    ]);

    const rateErr = parseWritingStyleErrorBody(429, {
      code: "RATE_LIMITED",
      message: "Quá giới hạn 10 lần/phút",
    });
    expect(ApiError.is(rateErr)).toBe(true);
    expect(rateErr.status).toBe(429);
    expect(rateErr.code).toBe("RATE_LIMITED");
  });
});
