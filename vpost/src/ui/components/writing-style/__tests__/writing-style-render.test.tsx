import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type { SearchSource } from "@astryxdesign/core";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { NAV_ICONS } from "@/ui/components/shell/AppSideNav";
import { NAV_SECTIONS, flattenNavItems } from "@/ui/components/shell/nav-items";
import {
  PreviewPanel,
  type ProductPreviewOption,
} from "@/ui/components/writing-style/PreviewPanel";
import { ScopeSelector } from "@/ui/components/writing-style/ScopeSelector";
import { WritingStyleForm } from "@/ui/components/writing-style/WritingStyleForm";
import {
  addListRow,
  createEmptyDraft,
  draftFromStyle,
} from "@/ui/components/writing-style/writing-style-form";
import { buildScopeOptions } from "@/ui/components/writing-style/writing-style-inheritance";
import {
  buildPreviewAnnouncement,
  derivePreviewViewState,
} from "@/ui/components/writing-style/writing-style-preview";
import { WRITING_STYLE_LIMITS } from "@/ui/schemas/writing-style.schema";
import { ApiError } from "@/ui/services/api-error";

const EMPTY_SEARCH_SOURCE: SearchSource<ProductPreviewOption> = {
  bootstrap: () => [],
  search: () => [],
};

const SAMPLE_PRODUCT: ProductPreviewOption = {
  id: "SP001",
  label: "SP001 — Váy linen dáng dài",
  auxiliaryData: {
    code: "SP001",
    name: "Váy linen dáng dài",
    meta: "tồn 12 · 4 file",
  },
};

function readComponentSource(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");
}

describe("ScopeSelector render", () => {
  const options = buildScopeOptions(
    [
      {
        channelId: "ch-1",
        platform: "facebook",
        name: "Page A",
        externalId: "ext-1",
        status: "active",
        tokenExpiresAt: null,
      },
      {
        channelId: "ch-2",
        platform: "facebook",
        name: "Page B",
        externalId: "ext-2",
        status: "active",
        tokenExpiresAt: null,
      },
    ],
    {
      tenantId: "t-1",
      default: {},
      overrides: [
        {
          channelId: "ch-1",
          channelName: "Page A",
          style: { voice: "Trẻ trung" },
          updatedAt: "2026-11-27T08:00:00Z",
        },
      ],
      effectiveDefault: {},
      updatedAt: null,
    },
  );

  it("shows Đang dùng mặc định and hides delete button when Page has no override", () => {
    const html = renderToStaticMarkup(
      <ScopeSelector
        options={options}
        activeScope="ch-2"
        isDeleting={false}
        readOnlyReason={null}
        onSelectScope={() => undefined}
        onDeleteOverride={() => undefined}
      />,
    );

    expect(html).toContain("Đang dùng mặc định");
    expect(html).not.toContain("Xoá thiết lập riêng");
  });

  it("shows Có thiết lập riêng and Xoá thiết lập riêng when Page has an override", () => {
    const html = renderToStaticMarkup(
      <ScopeSelector
        options={options}
        activeScope="ch-1"
        isDeleting={false}
        readOnlyReason={null}
        onSelectScope={() => undefined}
        onDeleteOverride={() => undefined}
      />,
    );

    expect(html).toContain("Có thiết lập riêng");
    expect(html).toContain("Xoá thiết lập riêng");
  });

  it("disables Xoá thiết lập riêng with read-only reason in support mode", () => {
    const reason = "Chế độ hỗ trợ chỉ được xem.";
    const html = renderToStaticMarkup(
      <ScopeSelector
        options={options}
        activeScope="ch-1"
        isDeleting={false}
        readOnlyReason={reason}
        onSelectScope={() => undefined}
        onDeleteOverride={() => undefined}
      />,
    );

    expect(html).toContain('aria-disabled="true"');
    expect(html).toContain(reason);
  });
});

describe("WritingStyleForm render", () => {
  it("renders all 6 sections, inherited placeholders, save bar, and error aria-describedby links", () => {
    const draft = {
      ...createEmptyDraft(),
      xungHo: "a".repeat(18), // near limit (20) -> counter visible
    };

    const html = renderToStaticMarkup(
      <WritingStyleForm
        scopeLabel="Riêng cho Page A"
        isChannelScope
        draft={draft}
        inheritedStyle={{
          industry: "thời trang nữ",
          voice: "Nhẹ nhàng, sang trọng",
          xungHo: "nàng",
          maxEmoji: 3,
          length: "medium",
          footer: "Được kiểm tra hàng trước khi thanh toán",
        }}
        fieldErrors={{
          voice: "Giọng văn tối đa 400 ký tự.",
          length: "Độ dài không hợp lệ.",
        }}
        itemErrors={{}}
        unmappedServerErrors={[]}
        focusTarget={null}
        isDirty
        isSaving={false}
        readOnlyReason={null}
        onChangeDraft={() => undefined}
        onSubmit={() => undefined}
        onDiscard={() => undefined}
      />,
    );

    // 6 sections from spec
    expect(html).toContain("Thông tin shop");
    expect(html).toContain("Giọng văn &amp; xưng hô");
    expect(html).toContain("Độ dài &amp; cấu trúc");
    expect(html).toContain("Hashtag &amp; chân bài");
    expect(html).toContain("Nên / Không nên");
    expect(html).toContain("Bài mẫu của shop");

    // Inherited placeholders
    expect(html).toContain("Mặc định: thời trang nữ");
    expect(html).toContain("Mặc định: Nhẹ nhàng, sang trọng");
    expect(html).toContain("Mặc định: 3");

    // Near-limit char counter
    expect(html).toContain("18/20");

    // Field error linked via aria-describedby
    expect(html).toContain("Giọng văn tối đa 400 ký tự.");
    expect(html).toContain("aria-describedby=");

    // Save bar buttons
    expect(html).toContain("Lưu");
    expect(html).toContain("Huỷ thay đổi");
  });

  it("shows list limit badge and disables Add button when hashtags reach 5/5", () => {
    let fixed = createEmptyDraft().hashtagsFixed;
    for (let i = 0; i < WRITING_STYLE_LIMITS.hashtagsFixedMaxItems; i += 1) {
      fixed = addListRow(fixed, WRITING_STYLE_LIMITS.hashtagsFixedMaxItems, `h-${i}`);
    }

    const html = renderToStaticMarkup(
      <WritingStyleForm
        scopeLabel="Mặc định công ty"
        isChannelScope={false}
        draft={{ ...createEmptyDraft(), hashtagsFixed: fixed }}
        inheritedStyle={{}}
        fieldErrors={{}}
        itemErrors={{}}
        unmappedServerErrors={[]}
        focusTarget={null}
        isDirty={false}
        isSaving={false}
        readOnlyReason={null}
        onChangeDraft={() => undefined}
        onSubmit={() => undefined}
        onDiscard={() => undefined}
      />,
    );

    expect(html).toContain("5/5 mục");
    expect(html).toContain("Đã đạt giới hạn tối đa 5 mục.");
  });

  it("disables controls with reason and avoids native disabled in read-only sessions", () => {
    const reason = "Chế độ hỗ trợ chỉ được xem — không thay đổi được gì.";
    const html = renderToStaticMarkup(
      <WritingStyleForm
        scopeLabel="Mặc định công ty"
        isChannelScope={false}
        draft={draftFromStyle({ shopName: "Shop A" })}
        inheritedStyle={{}}
        fieldErrors={{}}
        itemErrors={{}}
        unmappedServerErrors={[]}
        focusTarget={null}
        isDirty={false}
        isSaving={false}
        readOnlyReason={reason}
        onChangeDraft={() => undefined}
        onSubmit={() => undefined}
        onDiscard={() => undefined}
      />,
    );

    expect(html).toContain(reason);
    expect(html).toContain('aria-disabled="true"');
    // Every focusable field & button stays focusable via aria-disabled (Astryx NumberInput
    // only sets native disabled on its non-tabbable `tabindex="-1"` stepper buttons).
    const inputsAndTextareas = html.match(/<(?:input|textarea) [^>]*>/g) ?? [];
    expect(inputsAndTextareas.length).toBeGreaterThan(0);
    for (const tag of inputsAndTextareas) {
      expect(tag).not.toContain(' disabled=""');
    }
    const tabbableButtons = (html.match(/<button [^>]*>/g) ?? []).filter(
      (tag) => !tag.includes('tabindex="-1"'),
    );
    expect(tabbableButtons.length).toBeGreaterThan(0);
    for (const tag of tabbableButtons) {
      expect(tag).not.toContain(' disabled=""');
      expect(tag).toContain('aria-disabled="true"');
    }
  });
});

describe("PreviewPanel states and polite live region", () => {
  function renderPreview(input: {
    isPending?: boolean;
    data?: Parameters<typeof derivePreviewViewState>[0]["data"];
    error?: unknown;
    isDirty?: boolean;
  }) {
    const viewState = derivePreviewViewState({
      isPending: input.isPending ?? false,
      data: input.data,
      error: input.error ?? null,
    });
    const announcement = buildPreviewAnnouncement(viewState, SAMPLE_PRODUCT.id);
    const html = renderToStaticMarkup(
      <PreviewPanel
        scopeLabel="Mặc định công ty"
        isDirty={input.isDirty ?? true}
        selectedProduct={SAMPLE_PRODUCT}
        onSelectProduct={() => undefined}
        searchSource={EMPTY_SEARCH_SOURCE}
        catalogError={null}
        viewState={viewState}
        announcement={announcement}
        readOnlyReason={null}
        onRunPreview={() => undefined}
      />,
    );
    return { viewState, announcement, html };
  }

  it("renders idle state with polite live region", () => {
    const { viewState, html } = renderPreview({});
    expect(viewState.status).toBe("idle");
    expect(html).toContain("Chưa có bản viết thử");
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain("Đang dùng bản chưa lưu");
  });

  it("renders loading state with busy indicator and polite announcement", () => {
    const { viewState, announcement, html } = renderPreview({ isPending: true });
    expect(viewState.status).toBe("loading");
    expect(announcement).toContain("Đang viết thử");
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain(announcement);
  });

  it("renders write decision with post body, warnings, and token counts", () => {
    const { viewState, announcement, html } = renderPreview({
      data: {
        tenantId: "t-1",
        decision: "write",
        post: "Đầm linen mới về, form đẹp gọn dáng cho nàng công sở.",
        reasons: [],
        warnings: ["Nên bổ sung ghi chú bảo quản vải"],
        systemPromptChars: 1350,
        tokensIn: 520,
        tokensOut: 110,
      },
    });

    expect(viewState.status).toBe("write");
    expect(announcement).toContain("có 1 lưu ý");
    expect(html).toContain("Đạt kiểm tra");
    expect(html).toContain("Đầm linen mới về");
    expect(html).toContain("Nên bổ sung ghi chú bảo quản vải");
    expect(html).toContain("520");
    expect(html).toContain("110");
  });

  it("renders flag decision with structured reasons", () => {
    const { viewState, announcement, html } = renderPreview({
      data: {
        tenantId: "t-1",
        decision: "flag",
        post: "",
        reasons: [{ field: "stock", issue: "Hết hàng toàn bộ các size" }],
        warnings: [],
        systemPromptChars: 1200,
        tokensIn: 0,
        tokensOut: 0,
      },
    });

    expect(viewState.status).toBe("flag");
    expect(announcement).toContain("bị gắn cờ kiểm tra với 1 lý do");
    expect(html).toContain("Bài bị gắn cờ kiểm tra");
    expect(html).toContain("stock:");
    expect(html).toContain("Hết hàng toàn bộ các size");
  });

  it("renders 429 RATE_LIMITED state with wait-and-retry guidance", () => {
    const { viewState, announcement, html } = renderPreview({
      error: new ApiError({
        code: "RATE_LIMITED",
        status: 429,
        userMessage: "Quá 10 lần viết thử trong 1 phút.",
      }),
    });

    expect(viewState.status).toBe("rate-limited");
    expect(announcement).toContain("10 lần/phút");
    expect(html).toContain("10 lần/phút");
    expect(html).toContain("Thử lại");
  });

  it("renders non-retryable 404 error without a retry button and retryable 500 with retry", () => {
    const notFound = renderPreview({
      error: new ApiError({
        code: "PRODUCT_NOT_FOUND",
        status: 404,
        userMessage: "Không tìm thấy mã SP001.",
      }),
    });
    expect(notFound.viewState.status).toBe("error");
    expect(notFound.html).toContain("Không tìm thấy mã SP001.");
    expect(notFound.html).not.toContain("Thử lại");

    const serverErr = renderPreview({
      error: new ApiError({
        code: "AI_PROVIDER_ERROR",
        status: 502,
        userMessage: "Nhà cung cấp AI tạm thời gián đoạn.",
      }),
    });
    expect(serverErr.viewState.status).toBe("error");
    expect(serverErr.html).toContain("Thử lại");
  });
});

describe("navigation wiring and Astryx token discipline", () => {
  it("registers Phong cách viết in Cài đặt nav section with a side-nav icon", () => {
    const flat = flattenNavItems(NAV_SECTIONS);
    expect(flat).toContainEqual({
      href: "/writing-style",
      label: "Phong cách viết",
      section: "Cài đặt",
    });
    expect(NAV_ICONS["/writing-style"]).toBeDefined();
  });

  it("uses Astryx primitives and semantic classes without raw hex, inline styles, or raw form elements", () => {
    const files = [
      "../ScopeSelector.tsx",
      "../ListFieldEditor.tsx",
      "../WritingStyleForm.tsx",
      "../PreviewPanel.tsx",
      "../WritingStyleScreen.tsx",
    ];

    for (const file of files) {
      const source = readComponentSource(file);
      // No raw hex colors in code
      expect(source, `${file} must not hardcode hex colors`).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      // No inline styles
      expect(source, `${file} must not use inline styles`).not.toContain("style={{");
      // No raw HTML form elements where Astryx primitives exist
      expect(source, `${file} must not render raw <input>`).not.toMatch(/<input\b/);
      expect(source, `${file} must not render raw <textarea>`).not.toMatch(/<textarea\b/);
      expect(source, `${file} must not render raw <select>`).not.toMatch(/<select\b/);
      expect(source, `${file} must not render raw <button>`).not.toMatch(/<button\b/);
    }

    const screenSource = readComponentSource("../WritingStyleScreen.tsx");
    expect(screenSource).toContain("useReadOnlyReason()");
    expect(screenSource).toContain("lg:grid-cols-12");
    expect(screenSource).toContain("lg:sticky");
  });
});
