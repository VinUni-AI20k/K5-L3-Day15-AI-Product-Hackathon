import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  SizeChartSectionView,
  type SizeChartSectionViewProps,
} from "@/ui/components/writing-style/SizeChartSection";
import {
  SIZE_CHART_DEFAULT_TAB,
  addSizeChartRow,
  createDefaultSizeChartDraft,
  doesDraftMatchDefaultSample,
  draftFromSizeChart,
  isSizeChartDraftDirty,
  mapSizeChartServerErrors,
  mergeSizeChartCategories,
  removeSizeChartRow,
  sizeChartFromDraft,
  sizeChartLimitState,
  updateSizeChartRow,
  validateNewCategoryName,
  validateSizeChartDraft,
} from "@/ui/components/writing-style/size-chart-state";
import {
  DEFAULT_SIZE_CHART,
  FREESIZE_GUIDANCE_NOTE,
  SIZE_CHART_LIMITS,
  SizeChartResponseSchema,
} from "@/ui/schemas/writing-style.schema";
import { ApiError } from "@/ui/services/api-error";
import {
  WritingStyleValidationError,
  fetchCategorySizeChart,
  fetchDefaultSizeChart,
  saveCategorySizeChart,
  saveDefaultSizeChart,
} from "@/ui/services/writing-style.api";

function readRelativeSource(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");
}

function makeViewProps(
  overrides: Partial<SizeChartSectionViewProps> = {},
): SizeChartSectionViewProps {
  return {
    activeTab: SIZE_CHART_DEFAULT_TAB,
    categories: ["Áo", "Váy"],
    draft: createDefaultSizeChartDraft(),
    isSample: true,
    isInheritedCategory: false,
    updatedAt: null,
    isLoading: false,
    showSkeleton: false,
    loadError: null,
    isDirty: false,
    isSaving: false,
    readOnlyReason: null,
    tableError: null,
    noteError: null,
    rowErrors: {},
    unmappedServerErrors: [],
    focusTarget: null,
    notice: null,
    isAddingCategory: false,
    newCategoryInput: "",
    newCategoryError: null,
    isRestoreConfirmOpen: false,
    pendingTabSwitch: null,
    onSelectTab: () => {},
    onToggleAddCategory: () => {},
    onChangeNewCategoryInput: () => {},
    onConfirmAddCategory: () => {},
    onAddRow: () => {},
    onUpdateRow: () => {},
    onRemoveRow: () => {},
    onChangeNote: () => {},
    onRequestRestoreSample: () => {},
    onCancelRestoreSample: () => {},
    onConfirmRestoreSample: () => {},
    onCancelTabSwitch: () => {},
    onConfirmTabSwitch: () => {},
    onSave: () => {},
    onDiscard: () => {},
    onRetryLoad: () => {},
    onDismissNotice: () => {},
    ...overrides,
  };
}

function mockFetchJson(body: unknown, status = 200) {
  const spy = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    }),
  );
  vi.stubGlobal("fetch", spy);
  return spy;
}

describe("size chart schema & API client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("matches the default Vietnamese women's apparel size chart from spec", () => {
    expect(DEFAULT_SIZE_CHART.rows).toEqual([
      { size: "S", weightKg: [40, 46], heightCm: [145, 155] },
      { size: "M", weightKg: [46, 52], heightCm: [150, 160] },
      { size: "L", weightKg: [52, 58], heightCm: [155, 165] },
      { size: "XL", weightKg: [58, 65], heightCm: [158, 168] },
      { size: "2XL", weightKg: [65, 72], heightCm: [160, 170] },
    ]);
  });

  it("parses wrapped, flattened, category override, and inherited response shapes while rejecting unrelated JSON", () => {
    const wrappedDefault = SizeChartResponseSchema.parse({
      tenantId: "t-1",
      chart: DEFAULT_SIZE_CHART,
      isDefault: true,
      categories: ["Váy", "Áo"],
      updatedAt: null,
    });
    expect(wrappedDefault.isSample).toBe(true);
    expect(wrappedDefault.hasCustomChart).toBe(false);
    expect(wrappedDefault.categories).toEqual(["Váy", "Áo"]);
    expect(wrappedDefault.chart.rows).toHaveLength(5);

    const flattenedCustom = SizeChartResponseSchema.parse({
      tenantId: "t-1",
      rows: [{ size: "M", weightKg: [45, 53], heightCm: null }],
      note: "Form rộng nhẹ",
      updatedAt: "2026-11-28T10:00:00Z",
    });
    expect(flattenedCustom.isSample).toBe(false);
    expect(flattenedCustom.hasCustomChart).toBe(true);
    expect(flattenedCustom.chart.rows[0]?.heightCm).toBeNull();
    expect(flattenedCustom.chart.note).toBe("Form rộng nhẹ");

    const categoryOverride = SizeChartResponseSchema.parse({
      tenantId: "t-1",
      category: "Váy",
      sizeChart: {
        rows: [{ size: "S", weightKg: [40, 47], heightCm: [148, 158] }],
        note: null,
      },
      isInherited: false,
      updatedAt: "2026-11-28T10:30:00Z",
    });
    expect(categoryOverride.category).toBe("Váy");
    expect(categoryOverride.hasCustomChart).toBe(true);
    expect(categoryOverride.isInherited).toBe(false);

    const inheritedCategory = SizeChartResponseSchema.parse({
      tenantId: "t-1",
      category: "Áo",
      chart: null,
      effective: DEFAULT_SIZE_CHART,
      updatedAt: null,
    });
    expect(inheritedCategory.category).toBe("Áo");
    expect(inheritedCategory.isInherited).toBe(true);
    expect(inheritedCategory.hasCustomChart).toBe(false);
    expect(inheritedCategory.chart.rows).toHaveLength(5);

    expect(() => SizeChartResponseSchema.parse({ hello: "world" })).toThrow();
  });

  it("calls GET/PUT /api/writing-style/size-chart and /{category} and preserves field validation errors", async () => {
    const getDef = mockFetchJson({
      tenantId: "t-1",
      chart: DEFAULT_SIZE_CHART,
      isDefault: true,
      updatedAt: null,
    });
    const defRes = await fetchDefaultSizeChart();
    expect(defRes.isSample).toBe(true);
    expect(getDef.mock.calls[0]?.[0]).toBe("/api/writing-style/size-chart");

    const putDef = mockFetchJson({
      tenantId: "t-1",
      chart: DEFAULT_SIZE_CHART,
      isDefault: false,
      updatedAt: "2026-11-28T11:00:00Z",
    });
    await saveDefaultSizeChart(DEFAULT_SIZE_CHART);
    expect(putDef.mock.calls[0]?.[0]).toBe("/api/writing-style/size-chart");
    expect(putDef.mock.calls[0]?.[1]?.method).toBe("PUT");
    expect(JSON.parse(String(putDef.mock.calls[0]?.[1]?.body ?? "{}"))).toEqual({
      rows: DEFAULT_SIZE_CHART.rows,
      note: null,
    });

    const getCat = mockFetchJson({
      tenantId: "t-1",
      category: "Váy",
      chart: DEFAULT_SIZE_CHART,
      isInherited: false,
      updatedAt: "2026-11-28T11:00:00Z",
    });
    await fetchCategorySizeChart("Váy");
    expect(getCat.mock.calls[0]?.[0]).toBe(
      `/api/writing-style/size-chart/${encodeURIComponent("Váy")}`,
    );

    const putCatErr = mockFetchJson(
      {
        code: "INVALID_INPUT",
        message: "Bảng size không hợp lệ",
        fields: [{ field: "rows[0].weightKg", message: "cân nặng từ phải nhỏ hơn đến" }],
      },
      400,
    );
    await expect(saveCategorySizeChart("Váy", DEFAULT_SIZE_CHART)).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof WritingStyleValidationError &&
        err.fields.length === 1 &&
        err.fields[0]?.field === "rows[0].weightKg",
    );
    expect(putCatErr.mock.calls[0]?.[0]).toBe(
      `/api/writing-style/size-chart/${encodeURIComponent("Váy")}`,
    );

    await expect(fetchCategorySizeChart("   ")).rejects.toBeInstanceOf(ApiError);
  });
});

describe("size chart state, limits, validation, and server error mapping", () => {
  it("enforces <=12 row limit, tracks dirty state cleanly, and detects sample parity", () => {
    const baseline = createDefaultSizeChartDraft();
    expect(doesDraftMatchDefaultSample(baseline)).toBe(true);
    expect(isSizeChartDraftDirty(baseline, baseline)).toBe(false);

    // Whitespace-only note edit is not dirty
    expect(isSizeChartDraftDirty(baseline, { ...baseline, note: "   " })).toBe(false);

    // Modifying a cell marks dirty and breaks sample parity
    const editedRows = updateSizeChartRow(baseline.rows, baseline.rows[0].id, {
      weightMax: 47,
    });
    const edited = { ...baseline, rows: editedRows };
    expect(isSizeChartDraftDirty(baseline, edited)).toBe(true);
    expect(doesDraftMatchDefaultSample(edited)).toBe(false);

    // Add rows up to cap (12)
    let rows = baseline.rows;
    for (let i = 0; i < 20; i += 1) {
      rows = addSizeChartRow(rows, `new-${i}`);
    }
    expect(rows).toHaveLength(SIZE_CHART_LIMITS.maxRows);
    expect(sizeChartLimitState(rows.length)).toMatchObject({
      count: 12,
      max: 12,
      isAtLimit: true,
      isOverLimit: false,
      text: "12/12",
    });

    // Remove row works cleanly
    const shrunk = removeSizeChartRow(baseline.rows, baseline.rows[0].id);
    expect(shrunk).toHaveLength(4);
    expect(shrunk.map((r) => r.size)).toEqual(["M", "L", "XL", "2XL"]);
  });

  it("validates uniqueness, weight 30-150 min<max, optional height 120-210 min<max, <=12 rows, and note", () => {
    // Default sample passes
    expect(validateSizeChartDraft(createDefaultSizeChartDraft()).isValid).toBe(true);

    // Optional null height passes
    const noHeightDraft = draftFromSizeChart({
      rows: [{ size: "Freesize", weightKg: [40, 55], heightCm: null }],
      note: null,
    });
    expect(validateSizeChartDraft(noHeightDraft).isValid).toBe(true);
    expect(sizeChartFromDraft(noHeightDraft).rows[0]?.heightCm).toBeNull();

    // 0 rows fails
    const emptyRes = validateSizeChartDraft({ rows: [], note: "" });
    expect(emptyRes.isValid).toBe(false);
    expect(emptyRes.tableError).toContain("ít nhất 1 dòng");

    // >12 rows fails
    const tooManyRows = Array.from({ length: 13 }, (_, idx) => ({
      id: `r-${idx}`,
      size: `S${idx}`,
      weightMin: 40 + idx,
      weightMax: 45 + idx,
      heightMin: null,
      heightMax: null,
    }));
    const overMaxRes = validateSizeChartDraft({ rows: tooManyRows, note: "" });
    expect(overMaxRes.isValid).toBe(false);
    expect(overMaxRes.tableError).toContain("12");

    // Duplicate size (case-insensitive), bad weight range, weight min>=max, half-filled height, bad height range, long note
    const badDraft = {
      rows: [
        {
          id: "r0",
          size: "M",
          weightMin: 25,
          weightMax: 160,
          heightMin: 150,
          heightMax: null,
        },
        {
          id: "r1",
          size: " m ",
          weightMin: 60,
          weightMax: 55,
          heightMin: 115,
          heightMax: 215,
        },
        {
          id: "r2",
          size: "L",
          weightMin: 50,
          weightMax: 60,
          heightMin: 165,
          heightMax: 160,
        },
      ],
      note: "a".repeat(301),
    };
    const res = validateSizeChartDraft(badDraft);
    expect(res.isValid).toBe(false);
    expect(res.rowErrors[0]?.size).toContain("trùng");
    expect(res.rowErrors[1]?.size).toContain("trùng");
    expect(res.rowErrors[0]?.weightMin).toContain("30 đến 150");
    expect(res.rowErrors[0]?.weightMax).toContain("30 đến 150");
    expect(res.rowErrors[0]?.heightMax).toContain("để trống cả hai");
    expect(res.rowErrors[1]?.weightMax).toContain("lớn hơn");
    expect(res.rowErrors[1]?.heightMin).toContain("120 đến 210");
    expect(res.rowErrors[1]?.heightMax).toContain("120 đến 210");
    expect(res.rowErrors[2]?.heightMax).toContain("lớn hơn");
    expect(res.noteError).toContain("300");
    expect(res.firstInvalidTarget).toEqual({ kind: "cell", rowIndex: 0, cell: "size" });
  });

  it("maps server validation fields and validates category tab names", () => {
    const err = new WritingStyleValidationError({
      code: "INVALID_INPUT",
      status: 400,
      userMessage: "Dữ liệu không hợp lệ",
      fields: [
        { field: "rows[1].size", message: "Size bị trùng" },
        { field: "rows.2.weightKg[0]", message: "Cân nặng tối thiểu từ 30 kg" },
        { field: "rows[2].heightCm", message: "Chiều cao không hợp lệ" },
        { field: "note", message: "Ghi chú quá dài" },
        { field: "unknownField", message: "Lỗi khác" },
      ],
    });
    const mapped = mapSizeChartServerErrors(err, 5);
    expect(mapped.rowErrors[1]?.size).toBe("Size bị trùng");
    expect(mapped.rowErrors[2]?.weightMin).toBe("Cân nặng tối thiểu từ 30 kg");
    expect(mapped.rowErrors[2]?.heightMax).toBe("Chiều cao không hợp lệ");
    expect(mapped.noteError).toBe("Ghi chú quá dài");
    expect(mapped.unmappedMessages).toEqual(["Lỗi khác"]);

    expect(
      mergeSizeChartCategories({
        serverCategories: ["Váy", "default"],
        catalogCategories: ["váy", "Áo", "Quần"],
        customCategories: ["Đầm"],
      }),
    ).toEqual(["Áo", "Đầm", "Quần", "Váy"]);

    expect(validateNewCategoryName("", ["Váy"])).toContain("Nhập tên loại");
    expect(validateNewCategoryName("Mặc định", ["Váy"])).toContain("Mặc định");
    expect(validateNewCategoryName("váy", ["Váy"])).toContain("đã có");
    expect(validateNewCategoryName("Áo khoác", ["Váy"])).toBeNull();
  });
});

describe("SizeChartSectionView rendering, accessibility, read-only, and token hygiene", () => {
  it("renders default sample chart with accessible table semantics, tabs, freesize note, and save bar", () => {
    const html = renderToStaticMarkup(<SizeChartSectionView {...makeViewProps()} />);

    expect(html).toContain("Bảng size");
    expect(html).toContain("Bảng size mẫu");
    expect(html).toContain("Khôi phục bảng mẫu");
    expect(html).toContain(FREESIZE_GUIDANCE_NOTE);
    expect(html).toContain("5/12 dòng");

    // Accessible semantic table
    expect(html).toContain("<table ");
    expect(html).toContain("<caption ");
    expect(html).toContain('scope="col"');
    expect(html).toContain("Cân nặng từ (kg)");
    expect(html).toContain("Cân nặng đến (kg)");
    expect(html).toContain("Chiều cao từ (cm)");
    expect(html).toContain("Chiều cao đến (cm)");
    expect(html).toContain("Cân nặng từ (kg) — size S");
    expect(html).toContain("Chiều cao đến (cm) — size 2XL");

    // Default + per-category tabs
    expect(html).toContain('aria-label="Phạm vi bảng size theo loại sản phẩm"');
    expect(html).toContain("Mặc định");
    expect(html).toContain("Váy");
    expect(html).toContain("Áo");

    // Save bar buttons
    expect(html).toContain("Lưu bảng size");
    expect(html).toContain("Huỷ thay đổi");
  });

  it("renders category inherited state, inline validation errors, restore confirm, and dirty tab-switch confirm", () => {
    const html = renderToStaticMarkup(
      <SizeChartSectionView
        {...makeViewProps({
          activeTab: "Váy",
          isSample: false,
          isInheritedCategory: true,
          isDirty: true,
          tableError: "Bảng size chưa đủ thông tin.",
          rowErrors: {
            0: {
              size: "Size “S” bị trùng với dòng 2.",
              weightMax: "Cân nặng “đến” phải lớn hơn “từ”.",
            },
          },
          isRestoreConfirmOpen: true,
          pendingTabSwitch: SIZE_CHART_DEFAULT_TAB,
        })}
      />,
    );

    expect(html).toContain("Đang dùng bảng mặc định");
    expect(html).toContain("Chưa có bảng size riêng cho loại “Váy”");
    expect(html).toContain("Size “S” bị trùng với dòng 2.");
    expect(html).toContain("Cân nặng “đến” phải lớn hơn “từ”.");
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain("Khôi phục bảng size mẫu?");
    expect(html).toContain("Bỏ các thay đổi chưa lưu?");
    expect(html).toContain('role="alertdialog"');
  });

  it("disables all controls via aria-disabled in read-only sessions without native disabled on inputs/tabbable buttons", () => {
    const reason = "Chế độ hỗ trợ chỉ được xem.";
    const html = renderToStaticMarkup(
      <SizeChartSectionView {...makeViewProps({ readOnlyReason: reason, isDirty: true })} />,
    );

    expect(html).toContain(reason);
    expect(html).toContain('aria-disabled="true"');

    const inputsAndTextareas = html.match(/<(?:input|textarea) [^>]*>/g) ?? [];
    expect(inputsAndTextareas.length).toBeGreaterThan(0);
    for (const tag of inputsAndTextareas) {
      expect(tag).not.toContain(' disabled=""');
    }
  });

  it("enforces token-only CSS and Astryx-only primitives in SizeChartSection and size-chart.css", () => {
    const componentSrc = readRelativeSource("../SizeChartSection.tsx");
    expect(componentSrc).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(componentSrc).not.toContain("style={{");
    expect(componentSrc).not.toMatch(
      /\b(?:w|h|min-w|max-w|min-h|max-h|p|px|py|m|mx|my|text|bg|border|rounded)-\[/,
    );
    expect(componentSrc).not.toMatch(/<(?:button|input|textarea|select)\b/);

    const cssSrc = readRelativeSource("../size-chart.css");
    expect(cssSrc).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(cssSrc).not.toMatch(/rgb\(|rgba\(|hsl\(|oklch\(/);
  });
});
