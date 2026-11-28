import { describe, expect, it } from "vitest";

import {
  addListRow,
  charCounterState,
  createEmptyDraft,
  draftFromStyle,
  isDraftDirty,
  listLimitState,
  mapServerFieldErrors,
  removeListRow,
  styleFromDraft,
  updateListRow,
  validateWritingStyleDraft,
} from "@/ui/components/writing-style/writing-style-form";
import { WRITING_STYLE_LIMITS } from "@/ui/schemas/writing-style.schema";
import { ApiError } from "@/ui/services/api-error";
import { WritingStyleValidationError } from "@/ui/services/writing-style.api";

describe("draft serialization and dirty detection", () => {
  it("omits empty strings, nulls, and blank list rows so empty means inherit", () => {
    const draft = {
      ...createEmptyDraft(),
      shopName: "  Nàng Thơ  ",
      voice: "   ",
      maxEmoji: null,
      hashtagsFixed: [
        { id: "1", value: "  #VayDep " },
        { id: "2", value: "   " },
      ],
      dos: [{ id: "d1", value: "" }],
    };

    expect(styleFromDraft(draft)).toEqual({
      shopName: "Nàng Thơ",
      hashtags: { fixed: ["#VayDep"] },
    });
  });

  it("ignores untouched empty rows and whitespace-only edits in isDraftDirty", () => {
    const initial = draftFromStyle({ voice: "Nhẹ nhàng", dos: ["Nhắc chất vải"] });

    // Adding an empty row without typing yet is not dirty
    const withBlankRow = {
      ...initial,
      dos: addListRow(initial.dos, WRITING_STYLE_LIMITS.dosMaxItems, "dos-new"),
    };
    expect(isDraftDirty(initial, withBlankRow)).toBe(false);

    // Typing real text flips dirty to true
    const edited = {
      ...withBlankRow,
      dos: updateListRow(withBlankRow.dos, "dos-new", "Nêu rõ form dáng"),
    };
    expect(isDraftDirty(initial, edited)).toBe(true);

    // Removing the added row returns to clean
    const reverted = {
      ...edited,
      dos: removeListRow(edited.dos, "dos-new"),
    };
    expect(isDraftDirty(initial, reverted)).toBe(false);
  });
});

describe("list limits and character counters", () => {
  it("enforces max items on addListRow and reports limit state", () => {
    let rows = createEmptyDraft().hashtagsFixed;
    for (let i = 0; i < 8; i += 1) {
      rows = addListRow(rows, WRITING_STYLE_LIMITS.hashtagsFixedMaxItems, `ht-${i}`);
    }
    expect(rows).toHaveLength(WRITING_STYLE_LIMITS.hashtagsFixedMaxItems);

    const atLimit = listLimitState(rows.length, WRITING_STYLE_LIMITS.hashtagsFixedMaxItems);
    expect(atLimit.isAtLimit).toBe(true);
    expect(atLimit.isOverLimit).toBe(false);
    expect(atLimit.remaining).toBe(0);
    expect(atLimit.text).toBe("5/5");

    const overLimit = listLimitState(11, WRITING_STYLE_LIMITS.dosMaxItems);
    expect(overLimit.isOverLimit).toBe(true);
    expect(overLimit.text).toBe("11/10");
  });

  it("shows char counters near and over limits", () => {
    const far = charCounterState("ngắn", 80);
    expect(far.visible).toBe(false);
    expect(far.tone).toBe("secondary");

    const near = charCounterState("a".repeat(65), 80);
    expect(near.visible).toBe(true);
    expect(near.isNearLimit).toBe(true);
    expect(near.tone).toBe("warning");
    expect(near.text).toBe("65/80");

    const over = charCounterState("a".repeat(82), 80);
    expect(over.visible).toBe(true);
    expect(over.isOverLimit).toBe(true);
    expect(over.tone).toBe("error");
    expect(over.text).toBe("82/80");

    // Short limit (xungHo max 20) reveals within 5 chars of max
    const nearShort = charCounterState("a".repeat(16), 20);
    expect(nearShort.visible).toBe(true);
    expect(nearShort.tone).toBe("warning");
  });
});

describe("client validation and focus order", () => {
  it("validates fields and selects the topmost invalid field in visual order", () => {
    const draft = {
      ...createEmptyDraft(),
      voice: "v".repeat(401),
      hashtagsFixed: [
        { id: "h0", value: "#hop_le" },
        { id: "h1", value: "#khong hop le!" },
      ],
      examples: [{ id: "e0", value: "e".repeat(1201) }],
    };

    const result = validateWritingStyleDraft(draft);
    expect(result.isValid).toBe(false);
    expect(result.fieldErrors.voice).toContain("400");
    expect(result.itemErrors["hashtags.fixed"]?.[1]).toBeDefined();
    expect(result.itemErrors.examples?.[0]).toContain("1200");
    // `voice` comes before `hashtags.fixed` and `examples`
    expect(result.firstInvalidField).toBe("voice");
    expect(result.firstInvalidItemIndex).toBeNull();
  });

  it("focuses the exact invalid row index when the first error is inside a list", () => {
    const draft = {
      ...createEmptyDraft(),
      hashtagsFixed: [
        { id: "h0", value: "#ok" },
        { id: "h1", value: "#bad-tag" },
      ],
    };

    const result = validateWritingStyleDraft(draft);
    expect(result.isValid).toBe(false);
    expect(result.firstInvalidField).toBe("hashtags.fixed");
    expect(result.firstInvalidItemIndex).toBe(1);
  });
});

describe("server field-error mapping", () => {
  it("maps WritingStyleValidationError fields array onto form fields and 1-based list items", () => {
    const error = new WritingStyleValidationError({
      code: "INVALID_INPUT",
      status: 400,
      userMessage: "Dữ liệu không hợp lệ",
      fields: [
        { field: "dos", message: "mục 2 tối đa 160 ký tự" },
        { field: "xungHo", message: "cách gọi khách tối đa 20 ký tự" },
        { field: "hashtags.maxExtra", message: "tối đa 5 hashtag bổ sung" },
      ],
    });

    const mapped = mapServerFieldErrors(error);
    expect(mapped.fieldErrors.xungHo).toBe("cách gọi khách tối đa 20 ký tự");
    expect(mapped.fieldErrors["hashtags.maxExtra"]).toBe("tối đa 5 hashtag bổ sung");
    expect(mapped.fieldErrors.dos).toBe("mục 2 tối đa 160 ký tự");
    // 1-based "mục 2" maps to 0-based row index 1
    expect(mapped.itemErrors.dos?.[1]).toBe("mục 2 tối đa 160 ký tự");
    expect(mapped.unmappedMessages).toEqual([]);
    // `xungHo` is visually above `hashtags.maxExtra` and `dos`
    expect(mapped.firstInvalidField).toBe("xungHo");
  });

  it("maps standard ApiError.issues, strips style. prefix, parses indexed paths, and keeps unknown paths", () => {
    const error = new ApiError({
      code: "INVALID_INPUT",
      status: 400,
      userMessage: "Không hợp lệ",
      issues: [
        { path: "style.hashtags.fixed[1]", message: "Hashtag chứa ký tự lạ" },
        { path: "style.voice", message: "Giọng văn quá dài" },
        { path: "style", message: "Payload phải là object" },
      ],
    });

    const mapped = mapServerFieldErrors(error);
    expect(mapped.fieldErrors.voice).toBe("Giọng văn quá dài");
    expect(mapped.itemErrors["hashtags.fixed"]?.[1]).toBe("Hashtag chứa ký tự lạ");
    expect(mapped.fieldErrors["hashtags.fixed"]).toBe("Hashtag chứa ký tự lạ");
    expect(mapped.unmappedMessages).toEqual(["Payload phải là object"]);
    expect(mapped.firstInvalidField).toBe("voice");
  });
});
