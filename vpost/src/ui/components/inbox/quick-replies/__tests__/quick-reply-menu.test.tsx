import { readFileSync } from "node:fs";
import { join } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  buildQuickReplyPatch,
  hasQuickReplyPatchChanges,
  isQuickReplyDuplicateError,
  processQuickReplyKeyDown,
  quickReplyListboxId,
  quickReplyOptionId,
  syncComposerAriaAttributes,
  type QuickReplyKeyEventLike,
} from "@/ui/components/inbox/quick-replies/quick-reply-menu-state";
import {
  QuickReplyManageDialogView,
  type QuickReplyManageDialogViewProps,
} from "@/ui/components/inbox/quick-replies/QuickReplyManageDialog";
import {
  QuickReplyMenuView,
  type QuickReplyMenuViewProps,
} from "@/ui/components/inbox/quick-replies/QuickReplyMenu";
import type { QuickReply } from "@/ui/schemas/quick-reply.schema";
import { ApiError } from "@/ui/services/api-error";

const READ_ONLY_REASON =
  "Chế độ hỗ trợ chỉ được xem — bạn đang xem dữ liệu của khách, không thay đổi được gì.";

const SAMPLE_ITEMS: QuickReply[] = [
  {
    id: "qr-1",
    shortcut: "bao_gia",
    title: "Báo giá sản phẩm",
    text: "Chào {ten_khach}, mẫu này giá 890.000đ ạ.",
    updatedAt: "2026-11-27T10:00:00+07:00",
  },
  {
    id: "qr-2",
    shortcut: "phi-ship",
    title: "Phí giao hàng",
    text: "Dạ chào {ten_khach}, phí ship toàn quốc 30.000đ ạ.",
    updatedAt: "2026-11-27T10:15:00+07:00",
  },
];

function makeKeyEvent(
  key: string,
  extra: Partial<Omit<QuickReplyKeyEventLike, "key" | "preventDefault">> = {},
): QuickReplyKeyEventLike & { preventDefault: ReturnType<typeof vi.fn> } {
  return {
    key,
    shiftKey: false,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    preventDefault: vi.fn(),
    ...extra,
  };
}

function menuProps(overrides: Partial<QuickReplyMenuViewProps> = {}): QuickReplyMenuViewProps {
  return {
    open: true,
    query: "",
    customerName: "Minh Thư",
    composerId: "inbox-composer",
    isLoading: false,
    error: null,
    totalCount: SAMPLE_ITEMS.length,
    items: SAMPLE_ITEMS,
    activeIndex: 0,
    onActiveIndexChange: () => {},
    onPickItem: () => {},
    onRetry: () => {},
    onOpenManage: () => {},
    ...overrides,
  };
}

function manageProps(
  overrides: Partial<QuickReplyManageDialogViewProps> = {},
): QuickReplyManageDialogViewProps {
  return {
    isOpen: true,
    isLoading: false,
    loadError: null,
    items: SAMPLE_ITEMS,
    customerName: "Minh Thư",
    readOnlyReason: null,
    formMode: { type: "closed" },
    formValues: { shortcut: "", title: "", text: "" },
    fieldErrors: {},
    isSaving: false,
    saveError: null,
    deletingItem: null,
    isDeleting: false,
    deleteError: null,
    statusMessage: null,
    onOpenChange: () => {},
    onRetryLoad: () => {},
    onStartCreate: () => {},
    onStartEdit: () => {},
    onCancelForm: () => {},
    onFormChange: () => {},
    onSubmitForm: () => {},
    onRequestDelete: () => {},
    onCancelDelete: () => {},
    onConfirmDelete: () => {},
    ...overrides,
  };
}

describe("QuickReplyMenu key handling (consumed vs not consumed)", () => {
  it("consumes ArrowDown, ArrowUp, Enter, and Escape when open with items", () => {
    const onActiveIndexChange = vi.fn();
    const onPick = vi.fn();
    const onClose = vi.fn();

    // ArrowDown: 0 -> 1
    const down1 = makeKeyEvent("ArrowDown");
    expect(
      processQuickReplyKeyDown(down1, {
        open: true,
        items: SAMPLE_ITEMS,
        activeIndex: 0,
        customerName: "Minh Thư",
        onActiveIndexChange,
        onPick,
        onClose,
      }),
    ).toBe(true);
    expect(down1.preventDefault).toHaveBeenCalledTimes(1);
    expect(onActiveIndexChange).toHaveBeenLastCalledWith(1);

    // ArrowDown wraps: 1 -> 0
    const downWrap = makeKeyEvent("ArrowDown");
    expect(
      processQuickReplyKeyDown(downWrap, {
        open: true,
        items: SAMPLE_ITEMS,
        activeIndex: 1,
        customerName: "Minh Thư",
        onActiveIndexChange,
        onPick,
        onClose,
      }),
    ).toBe(true);
    expect(onActiveIndexChange).toHaveBeenLastCalledWith(0);

    // ArrowUp wraps: 0 -> 1
    const upWrap = makeKeyEvent("ArrowUp");
    expect(
      processQuickReplyKeyDown(upWrap, {
        open: true,
        items: SAMPLE_ITEMS,
        activeIndex: 0,
        customerName: "Minh Thư",
        onActiveIndexChange,
        onPick,
        onClose,
      }),
    ).toBe(true);
    expect(upWrap.preventDefault).toHaveBeenCalledTimes(1);
    expect(onActiveIndexChange).toHaveBeenLastCalledWith(1);

    // Enter picks active item and replaces {ten_khach} with customerName
    const enterNamed = makeKeyEvent("Enter");
    expect(
      processQuickReplyKeyDown(enterNamed, {
        open: true,
        items: SAMPLE_ITEMS,
        activeIndex: 1,
        customerName: "Minh Thư",
        onActiveIndexChange,
        onPick,
        onClose,
      }),
    ).toBe(true);
    expect(enterNamed.preventDefault).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenLastCalledWith(
      "Dạ chào Minh Thư, phí ship toàn quốc 30.000đ ạ.",
    );

    // Enter picks active item with fallback "bạn" when customerName is null
    const enterFallback = makeKeyEvent("Enter");
    expect(
      processQuickReplyKeyDown(enterFallback, {
        open: true,
        items: SAMPLE_ITEMS,
        activeIndex: 0,
        customerName: null,
        onActiveIndexChange,
        onPick,
        onClose,
      }),
    ).toBe(true);
    expect(onPick).toHaveBeenLastCalledWith("Chào bạn, mẫu này giá 890.000đ ạ.");

    // Escape closes
    const esc = makeKeyEvent("Escape");
    expect(
      processQuickReplyKeyDown(esc, {
        open: true,
        items: SAMPLE_ITEMS,
        activeIndex: 0,
        customerName: "Minh Thư",
        onActiveIndexChange,
        onPick,
        onClose,
      }),
    ).toBe(true);
    expect(esc.preventDefault).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does NOT consume normal typing, Shift+Enter, IME composing, closed menu, or Arrows when filtered list is empty", () => {
    const onActiveIndexChange = vi.fn();
    const onPick = vi.fn();
    const onClose = vi.fn();

    // Closed menu never consumes
    for (const key of ["ArrowDown", "ArrowUp", "Enter", "Escape"]) {
      const ev = makeKeyEvent(key);
      expect(
        processQuickReplyKeyDown(ev, {
          open: false,
          items: SAMPLE_ITEMS,
          activeIndex: 0,
          customerName: "Minh Thư",
          onActiveIndexChange,
          onPick,
          onClose,
        }),
      ).toBe(false);
      expect(ev.preventDefault).not.toHaveBeenCalled();
    }

    // Shift+Enter, Ctrl+Enter, normal letters, Backspace, Tab
    const unconsumedEvents = [
      makeKeyEvent("Enter", { shiftKey: true }),
      makeKeyEvent("Enter", { ctrlKey: true }),
      makeKeyEvent("Enter", { nativeEvent: { isComposing: true } }),
      makeKeyEvent("a"),
      makeKeyEvent("Backspace"),
      makeKeyEvent("Tab"),
      makeKeyEvent("ArrowLeft"),
    ];
    for (const ev of unconsumedEvents) {
      expect(
        processQuickReplyKeyDown(ev, {
          open: true,
          items: SAMPLE_ITEMS,
          activeIndex: 0,
          customerName: "Minh Thư",
          onActiveIndexChange,
          onPick,
          onClose,
        }),
      ).toBe(false);
      expect(ev.preventDefault).not.toHaveBeenCalled();
    }

    // Empty filtered list: ArrowDown/ArrowUp are NOT consumed, but Escape IS consumed
    for (const key of ["ArrowDown", "ArrowUp"]) {
      const ev = makeKeyEvent(key);
      expect(
        processQuickReplyKeyDown(ev, {
          open: true,
          items: [],
          activeIndex: 0,
          customerName: "Minh Thư",
          onActiveIndexChange,
          onPick,
          onClose,
        }),
      ).toBe(false);
    }

    const escEmpty = makeKeyEvent("Escape");
    expect(
      processQuickReplyKeyDown(escEmpty, {
        open: true,
        items: [],
        activeIndex: 0,
        customerName: "Minh Thư",
        onActiveIndexChange,
        onPick,
        onClose,
      }),
    ).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("consumes unmodified Enter in every open non-selectable state (0 matches, loading, error) and does nothing (#1)", () => {
    const scenarios = [
      { label: "0 matches", items: [] as QuickReply[], isLoading: false, hasError: false },
      { label: "loading (empty)", items: [] as QuickReply[], isLoading: true, hasError: false },
      {
        label: "loading (even with items)",
        items: SAMPLE_ITEMS,
        isLoading: true,
        hasError: false,
      },
      { label: "error (empty)", items: [] as QuickReply[], isLoading: false, hasError: true },
      {
        label: "error (even with items)",
        items: SAMPLE_ITEMS,
        isLoading: false,
        hasError: true,
      },
    ];

    for (const scenario of scenarios) {
      const onActiveIndexChange = vi.fn();
      const onPick = vi.fn();
      const onClose = vi.fn();
      const enter = makeKeyEvent("Enter");

      const consumed = processQuickReplyKeyDown(enter, {
        open: true,
        items: scenario.items,
        activeIndex: 0,
        customerName: "Minh Thư",
        isLoading: scenario.isLoading,
        hasError: scenario.hasError,
        onActiveIndexChange,
        onPick,
        onClose,
      });

      expect(consumed, `Enter must be consumed in state: ${scenario.label}`).toBe(true);
      expect(enter.preventDefault, `preventDefault in state: ${scenario.label}`).toHaveBeenCalledTimes(
        1,
      );
      expect(onPick).not.toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();
      expect(onActiveIndexChange).not.toHaveBeenCalled();

      // Escape still closes in loading/error/empty states
      const esc = makeKeyEvent("Escape");
      expect(
        processQuickReplyKeyDown(esc, {
          open: true,
          items: scenario.items,
          activeIndex: 0,
          customerName: "Minh Thư",
          isLoading: scenario.isLoading,
          hasError: scenario.hasError,
          onActiveIndexChange,
          onPick,
          onClose,
        }),
      ).toBe(true);
      expect(onClose).toHaveBeenCalledTimes(1);
    }

    // IME keyCode 229 passes through without consuming
    const ime229 = makeKeyEvent("Enter", { nativeEvent: { isComposing: false, keyCode: 229 } });
    expect(
      processQuickReplyKeyDown(ime229, {
        open: true,
        items: [],
        activeIndex: 0,
        customerName: "Minh Thư",
        onActiveIndexChange: vi.fn(),
        onPick: vi.fn(),
        onClose: vi.fn(),
      }),
    ).toBe(false);
    expect(ime229.preventDefault).not.toHaveBeenCalled();
  });

  it("wires and cleans up aria-haspopup, aria-expanded, aria-controls, and aria-activedescendant on the composer element (#17)", () => {
    const attrs = new Map<string, string>([
      ["aria-invalid", "true"],
      ["aria-describedby", "composer-blocked-error"],
    ]);
    const setAttribute = vi.fn((name: string, value: string) => {
      attrs.set(name, value);
    });
    const removeAttribute = vi.fn((name: string) => {
      attrs.delete(name);
    });
    const fakeComposer = { setAttribute, removeAttribute };

    const listboxId = quickReplyListboxId("inbox-composer");
    const optionId = quickReplyOptionId("inbox-composer", "qr-2");

    syncComposerAriaAttributes(fakeComposer, {
      open: true,
      hasListbox: true,
      listboxId,
      activeOptionId: optionId,
    });
    expect(attrs.get("aria-haspopup")).toBe("listbox");
    expect(attrs.get("aria-expanded")).toBe("true");
    expect(attrs.get("aria-controls")).toBe(listboxId);
    expect(attrs.get("aria-activedescendant")).toBe(optionId);
    expect(attrs.get("aria-invalid")).toBe("true");
    expect(attrs.get("aria-describedby")).toBe("composer-blocked-error");

    // Open but empty (no listbox rendered) removes broken IDREF pointers
    syncComposerAriaAttributes(fakeComposer, {
      open: true,
      hasListbox: false,
      listboxId,
      activeOptionId: null,
    });
    expect(attrs.has("aria-controls")).toBe(false);
    expect(attrs.has("aria-activedescendant")).toBe(false);

    // Closed removes all menu ARIA attributes without writing aria-expanded="false"
    // or touching the composer's own attributes
    setAttribute.mockClear();
    syncComposerAriaAttributes(fakeComposer, {
      open: false,
      hasListbox: false,
      listboxId,
      activeOptionId: null,
    });
    expect(setAttribute).not.toHaveBeenCalled();
    expect(attrs.has("aria-haspopup")).toBe(false);
    expect(attrs.has("aria-expanded")).toBe(false);
    expect(attrs.has("aria-controls")).toBe(false);
    expect(attrs.has("aria-activedescendant")).toBe(false);
    expect(attrs.get("aria-invalid")).toBe("true");
    expect(attrs.get("aria-describedby")).toBe("composer-blocked-error");
  });

  it("computes minimal PATCH diffs and identifies 409 duplicate shortcut conflicts", () => {
    const unchanged = buildQuickReplyPatch(SAMPLE_ITEMS[0], {
      shortcut: SAMPLE_ITEMS[0].shortcut,
      title: SAMPLE_ITEMS[0].title,
      text: SAMPLE_ITEMS[0].text,
    });
    expect(hasQuickReplyPatchChanges(unchanged)).toBe(false);

    const changed = buildQuickReplyPatch(SAMPLE_ITEMS[0], {
      shortcut: SAMPLE_ITEMS[0].shortcut,
      title: "Tiêu đề mới",
      text: SAMPLE_ITEMS[0].text,
    });
    expect(changed).toEqual({ title: "Tiêu đề mới" });
    expect(hasQuickReplyPatchChanges(changed)).toBe(true);

    expect(
      isQuickReplyDuplicateError(
        new ApiError({ code: "CONFLICT", status: 409, userMessage: "Trùng phím tắt" }),
      ),
    ).toBe(true);
  });
});

describe("QuickReplyMenuView & QuickReplyManageDialogView rendering", () => {
  it("renders nothing when closed, and renders listbox with aria-activedescendant ids and substituted preview when open", () => {
    expect(renderToStaticMarkup(<QuickReplyMenuView {...menuProps({ open: false })} />)).toBe("");

    const openHtml = renderToStaticMarkup(
      <QuickReplyMenuView {...menuProps({ activeIndex: 1, customerName: "Minh Thư" })} />,
    );
    expect(openHtml).toContain(`id="${quickReplyListboxId("inbox-composer")}"`);
    expect(openHtml).toContain('role="listbox"');
    expect(openHtml).toContain(`id="${quickReplyOptionId("inbox-composer", "qr-1")}"`);
    expect(openHtml).toContain(`id="${quickReplyOptionId("inbox-composer", "qr-2")}"`);
    expect(openHtml).toContain('role="option"');
    expect(openHtml).toContain('aria-selected="true"');
    expect(openHtml).toContain("/bao_gia");
    expect(openHtml).toContain("/phi-ship");
    expect(openHtml).toContain("Chào Minh Thư, mẫu này giá 890.000đ ạ.");
    expect(openHtml).toContain("Quản lý mẫu trả lời");

    // Fallback "bạn" when customerName is null
    const fallbackHtml = renderToStaticMarkup(
      <QuickReplyMenuView {...menuProps({ customerName: null })} />,
    );
    expect(fallbackHtml).toContain("Chào bạn, mẫu này giá 890.000đ ạ.");
  });

  it("renders loading, error, and empty states with 'Quản lý mẫu trả lời' CTA", () => {
    const loadingHtml = renderToStaticMarkup(
      <QuickReplyMenuView {...menuProps({ isLoading: true, totalCount: 0, items: [] })} />,
    );
    expect(loadingHtml).toContain('data-skeleton="quick-reply-menu"');

    const errorHtml = renderToStaticMarkup(
      <QuickReplyMenuView
        {...menuProps({
          totalCount: 0,
          items: [],
          error: new ApiError({
            code: "INTERNAL",
            status: 500,
            userMessage: "Không tải được mẫu trả lời.",
          }),
        })}
      />,
    );
    expect(errorHtml).toContain('role="alert"');
    expect(errorHtml).toContain("Thử lại");

    const emptyFirstRun = renderToStaticMarkup(
      <QuickReplyMenuView {...menuProps({ totalCount: 0, items: [] })} />,
    );
    expect(emptyFirstRun).toContain('data-empty-kind="first-run"');
    expect(emptyFirstRun).toContain("Quản lý mẫu trả lời");

    const emptyFiltered = renderToStaticMarkup(
      <QuickReplyMenuView {...menuProps({ query: "xyz", totalCount: 2, items: [] })} />,
    );
    expect(emptyFiltered).toContain('data-empty-kind="no-result"');
    expect(emptyFiltered).toContain("Quản lý mẫu trả lời");
  });

  it("renders management dialog: template list, inline form validation + 409 duplicate error, delete confirmation, and read-only mode", () => {
    // Form with inline validation errors + live placeholder preview
    const validationHtml = renderToStaticMarkup(
      <QuickReplyManageDialogView
        {...manageProps({
          formMode: { type: "create" },
          formValues: {
            shortcut: "INVALID!",
            title: "",
            text: "Xin chào {ten_khach}!",
          },
          fieldErrors: {
            shortcut:
              "Phím tắt chỉ gồm chữ thường không dấu (a–z), số (0–9), gạch ngang (-) hoặc gạch dưới (_).",
            title: "Nhập tiêu đề mẫu trả lời.",
          },
        })}
      />,
    );
    expect(validationHtml).toContain("Quản lý mẫu trả lời nhanh");
    expect(validationHtml).toContain("Tạo mẫu trả lời mới");
    expect(validationHtml).toContain("Phím tắt chỉ gồm chữ thường không dấu");
    expect(validationHtml).toContain("Nhập tiêu đề mẫu trả lời.");
    expect(validationHtml).toContain("Xin chào Minh Thư!");

    // 409 duplicate shortcut shown inline on shortcut field
    const duplicateHtml = renderToStaticMarkup(
      <QuickReplyManageDialogView
        {...manageProps({
          formMode: { type: "create" },
          formValues: { shortcut: "bao_gia", title: "Giá", text: "890k" },
          saveError: new ApiError({
            code: "CONFLICT",
            status: 409,
            userMessage: "Phím tắt /bao_gia đã tồn tại.",
          }),
        })}
      />,
    );
    expect(duplicateHtml).toContain("Phím tắt /bao_gia đã tồn tại.");
    expect(duplicateHtml).toContain('aria-invalid="true"');

    // Delete confirmation renders AlertDialog
    const confirmDeleteHtml = renderToStaticMarkup(
      <QuickReplyManageDialogView
        {...manageProps({
          deletingItem: SAMPLE_ITEMS[0],
        })}
      />,
    );
    expect(confirmDeleteHtml).toContain('role="alertdialog"');
    expect(confirmDeleteHtml).toContain("Xoá mẫu “/bao_gia”?");
    expect(confirmDeleteHtml).toContain("Xoá mẫu");
    expect(confirmDeleteHtml).toContain("Huỷ");

    // Read-only disables write buttons and suppresses delete AlertDialog
    const readOnlyHtml = renderToStaticMarkup(
      <QuickReplyManageDialogView
        {...manageProps({
          readOnlyReason: READ_ONLY_REASON,
          deletingItem: SAMPLE_ITEMS[0],
        })}
      />,
    );
    expect(readOnlyHtml).toContain(READ_ONLY_REASON);
    expect(readOnlyHtml).toContain('aria-disabled="true"');
    expect(readOnlyHtml).not.toContain('role="alertdialog"');
  });

  it("uses Astryx components and tokens only (no raw hex, inline styles, or raw form controls)", () => {
    const files = [
      "src/ui/components/inbox/quick-replies/QuickReplyMenu.tsx",
      "src/ui/components/inbox/quick-replies/QuickReplyManageDialog.tsx",
    ];
    for (const rel of files) {
      const source = readFileSync(join(process.cwd(), rel), "utf8");
      expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(source).not.toContain("style={{");
      expect(source).not.toMatch(/<(button|input|textarea)\b/);
    }
  });
});
