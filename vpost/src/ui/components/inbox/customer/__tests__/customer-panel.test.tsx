import { readFileSync } from "node:fs";
import { join } from "node:path";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { CreateCustomerTagDialog } from "@/ui/components/inbox/customer/CreateCustomerTagDialog";
import {
  appendCustomerTagId,
  applyNoteDraftEdit,
  copyContactValue,
  createNoteDraftBuffer,
  evaluateNoteSaveGate,
  IDLE_COPY_FEEDBACK,
  isCustomerNotFoundError,
  isCustomerTagDuplicateError,
  removeCustomerTagId,
  syncNoteDraftBuffer,
  toggleCustomerTagId,
} from "@/ui/components/inbox/customer/customer-panel-state";
import {
  CustomerPanel,
  CustomerPanelView,
  type CustomerPanelViewProps,
} from "@/ui/components/inbox/customer/CustomerPanel";
import { CustomerPanelSkeleton } from "@/ui/components/inbox/customer/CustomerPanelSkeleton";
import { inboxKeys } from "@/ui/hooks/inbox-keys";
import {
  CUSTOMER_NOTE_MAX_LENGTH,
  CUSTOMER_TAG_COLORS,
  CUSTOMER_TAGS_MAX_PER_CUSTOMER,
  type CustomerDetail,
  type CustomerTag,
} from "@/ui/schemas/customer.schema";
import { ApiError } from "@/ui/services/api-error";
import { meKeys } from "@/ui/services/me.api";

const NOW_MS = new Date("2026-11-27T12:00:00+07:00").getTime();
const READ_ONLY_REASON =
  "Chế độ hỗ trợ chỉ được xem — bạn đang xem dữ liệu của khách, không thay đổi được gì.";

const TENANT_TAGS: CustomerTag[] = [
  { id: "tag-vip", name: "Khách VIP", color: "purple" },
  { id: "tag-cod", name: "Ship COD", color: "green" },
  { id: "tag-warn", name: "Lưu ý giao hàng", color: "orange" },
];

function sampleCustomer(overrides: Partial<CustomerDetail> = {}): CustomerDetail {
  return {
    id: "fb-user-99",
    name: "Minh Thư",
    phones: ["0912345678"],
    emails: ["minhthu@example.com"],
    firstSeenAt: "2026-11-20T08:30:00+07:00",
    lastSeenAt: "2026-11-27T11:45:00+07:00",
    commentCount: 5,
    tags: [TENANT_TAGS[0], TENANT_TAGS[1]],
    note: {
      text: "Thích đầm dáng xoè size M.",
      updatedAt: "2026-11-27T09:00:00+07:00",
    },
    recentComments: [
      {
        id: "c-201",
        threadId: "thread-current",
        text: "Mẫu G1 còn size M không shop? SĐT 0912345678",
        createdAt: "2026-11-27T11:45:00+07:00",
        postCaption: "Đầm Voan Hoa G1 màu đen",
        channelName: "WorkHardToday",
      },
      {
        id: "c-190",
        threadId: "thread-other-42",
        text: "Phí ship ra Hà Nội bao nhiêu ạ?",
        createdAt: "2026-11-25T15:10:00+07:00",
        postCaption: "Áo sơ mi lụa trắng S2",
        channelName: "WorkHardToday",
      },
    ],
    ...overrides,
  };
}

function panelProps(overrides: Partial<CustomerPanelViewProps> = {}): CustomerPanelViewProps {
  return {
    fromId: "fb-user-99",
    fallbackName: "Tên dự phòng",
    threadId: "thread-current",
    isLoading: false,
    error: null,
    customer: sampleCustomer(),
    tenantTags: TENANT_TAGS,
    nowMs: NOW_MS,
    readOnlyReason: null,
    copyFeedback: IDLE_COPY_FEEDBACK,
    isUpdatingTags: false,
    tagError: null,
    tagLimitError: null,
    isCreateTagOpen: false,
    isCreatingTag: false,
    createTagError: null,
    deletingTag: null,
    isDeletingTag: false,
    deleteTagError: null,
    tagStatusMessage: null,
    isSavingNote: false,
    noteError: null,
    noteSavedMessage: null,
    onRetry: () => {},
    onCopyContact: () => {},
    onToggleTag: () => {},
    onRemoveTag: () => {},
    onOpenCreateTag: () => {},
    onCreateTagOpenChange: () => {},
    onCreateTagSubmit: () => {},
    onRequestDeleteTag: () => {},
    onCancelDeleteTag: () => {},
    onConfirmDeleteTag: () => {},
    onSaveNote: () => {},
    ...overrides,
  };
}

describe("CustomerPanelView states & semantics", () => {
  it("renders loading skeleton with fallbackName initials avatar until profile loads", () => {
    const html = renderToStaticMarkup(
      <CustomerPanelView
        {...panelProps({
          isLoading: true,
          customer: null,
          fallbackName: "Lan Anh",
        })}
      />,
    );

    expect(html).toContain("Lan Anh");
    expect(html).toContain('role="img" aria-label="Lan Anh"');
    expect(html).toContain('data-skeleton="customer-panel"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toContain("Chưa có thông tin khách");

    const skeletonOnly = renderToStaticMarkup(<CustomerPanelSkeleton />);
    expect(skeletonOnly).toContain('aria-hidden="true"');
  });

  it("renders 404 state with 'Chưa có thông tin khách' and no retry button", () => {
    const html = renderToStaticMarkup(
      <CustomerPanelView
        {...panelProps({
          customer: null,
          error: new ApiError({
            code: "NOT_FOUND",
            status: 404,
            userMessage: "Chưa có thông tin khách.",
          }),
        })}
      />,
    );

    expect(html).toContain("Tên dự phòng");
    expect(html).toContain("Chưa có thông tin khách");
    expect(html).not.toContain("Thử lại");
  });

  it("renders retryable error state with alert role and 'Thử lại' action", () => {
    const html = renderToStaticMarkup(
      <CustomerPanelView
        {...panelProps({
          customer: null,
          error: new ApiError({
            code: "INTERNAL",
            status: 500,
            userMessage: "Máy chủ tạm gián đoạn.",
          }),
        })}
      />,
    );

    expect(html).toContain('role="alert"');
    expect(html).toContain("Thử lại");
  });

  it('shows "Không có thông tin khách" without skeleton or requests when customer.id is empty (#7)', () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const tenantId = "00000000-0000-4000-8000-000000000001";
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    queryClient.setQueryData(meKeys.me(), {
      account: { id: "acc-1", displayName: "Operator", platformRole: null },
      tenants: [{ id: tenantId, name: "WorkHardToday", slug: "wht", plan: "pro", role: "owner" }],
      activeTenantId: tenantId,
      isBootstrapAdmin: false,
      supportSession: null,
    });

    // Connected CustomerPanel with fromId="" or whitespace must NOT get stuck in loading skeleton
    // (TanStack Query v5 disabled query has isPending: true, isLoading: false)
    for (const emptyId of ["", "   "]) {
      const connectedHtml = renderToStaticMarkup(
        <QueryClientProvider client={queryClient}>
          <CustomerPanel fromId={emptyId} fallbackName="Khách ẩn danh" threadId="thread-anon" />
        </QueryClientProvider>,
      );
      expect(connectedHtml).toContain("Khách ẩn danh");
      expect(connectedHtml).toContain("Không có thông tin khách");
      expect(connectedHtml).not.toContain('data-skeleton="customer-panel"');
      expect(connectedHtml).not.toContain("Đang tải hồ sơ khách hàng");
      expect(connectedHtml).not.toContain("Thử lại");
    }
    expect(fetchSpy).not.toHaveBeenCalled();

    // Verify neither customer nor customer-tags queries were enabled/fetched
    const customerEntry = queryClient.getQueryCache().find({
      queryKey: inboxKeys.customer(tenantId, ""),
      exact: true,
    });
    expect(customerEntry?.state.fetchStatus ?? "idle").toBe("idle");
    const tagsEntry = queryClient.getQueryCache().find({
      queryKey: inboxKeys.customerTags(tenantId),
      exact: true,
    });
    expect(tagsEntry?.state.fetchStatus ?? "idle").toBe("idle");

    // Presentational CustomerPanelView with blank / whitespace fromId also renders
    // the missing-id state and never shows a skeleton even if isLoading is true.
    for (const emptyId of ["", "   "]) {
      const viewHtml = renderToStaticMarkup(
        <CustomerPanelView
          {...panelProps({
            fromId: emptyId,
            fallbackName: null,
            isLoading: true,
            customer: null,
            error: null,
          })}
        />,
      );
      expect(viewHtml).toContain("Không có thông tin khách");
      expect(viewHtml).not.toContain('data-skeleton="customer-panel"');
      expect(viewHtml).not.toContain("Đang tải hồ sơ khách hàng");
      expect(viewHtml).not.toContain("Thử lại");
    }
  });

  it("renders loaded profile: header, collapsible buttons with aria-expanded, phones/emails with copy buttons, tags + menu, note textarea, and recent comments with current vs linked threads", () => {
    const html = renderToStaticMarkup(
      <CustomerPanelView
        {...panelProps({
          copyFeedback: {
            status: "copied",
            value: "0912345678",
            announcement: "Đã sao chép số điện thoại 0912345678",
          },
          noteSavedMessage: "Đã lưu ghi chú.",
        })}
      />,
    );

    // Header uses loaded name over fallbackName with initials avatar
    expect(html).toContain("Minh Thư");
    expect(html).toContain('role="img" aria-label="Minh Thư"');
    expect(html).not.toContain("Tên dự phòng");

    // Collapsible section headings are real <button> elements with aria-expanded
    const expandedButtons = html.match(/<button[^>]*aria-expanded="true"/g) ?? [];
    expect(expandedButtons.length).toBeGreaterThanOrEqual(4);
    expect(html).toContain("Thông tin liên hệ");
    expect(html).toContain("Nhãn khách hàng");
    expect(html).toContain("Ghi chú nội bộ");
    expect(html).toContain("Bình luận gần đây (2)");

    // Phones & emails each have a copy button + polite "Đã sao chép" live region
    expect(html).toContain("0912345678");
    expect(html).toContain("Đã sao chép số điện thoại 0912345678");
    expect(html).toContain("minhthu@example.com");
    expect(html).toContain("Sao chép email minhthu@example.com");
    expect(html).toContain('role="status" aria-live="polite"');
    expect(html).toContain("Đã sao chép");

    // Idle phone button shows "Sao chép số điện thoại ..."
    const idleHtml = renderToStaticMarkup(<CustomerPanelView {...panelProps()} />);
    expect(idleHtml).toContain("Sao chép số điện thoại 0912345678");

    // Tags use Astryx Token colors + menu lists tenant tags + "Tạo nhãn"
    expect(html).toContain('data-color="purple"');
    expect(html).toContain("Khách VIP");
    expect(html).toContain('data-color="green"');
    expect(html).toContain("Ship COD");
    expect(html).toContain("Lưu ý giao hàng");
    expect(html).toContain("Tạo nhãn");

    // Note textarea with label + explicit save button + saved message
    expect(html).toContain("Thích đầm dáng xoè size M.");
    expect(html).toContain("Lưu ghi chú");
    expect(html).toContain("Đã lưu ghi chú.");

    // Recent comments: open thread marked current (no link), other thread links to /comments?thread=<id>
    expect(html).toContain('data-current-thread="true"');
    expect(html).toContain('aria-current="true"');
    expect(html).toContain("Đang xem");
    expect(html).toContain('href="/comments?thread=thread-other-42"');
    expect(html).not.toContain('href="/comments?thread=thread-current"');
    expect(html).toContain("Đầm Voan Hoa G1 màu đen");
    expect(html).toContain("WorkHardToday");
  });

  it("disables write actions with reason in read-only mode while keeping copy buttons usable", () => {
    const html = renderToStaticMarkup(
      <CustomerPanelView
        {...panelProps({
          readOnlyReason: READ_ONLY_REASON,
        })}
      />,
    );

    expect(html).toContain(READ_ONLY_REASON);
    expect(html).toContain('aria-disabled="true"');
    // Tag pills must not render remove buttons in read-only mode
    expect(html).not.toContain("Remove Khách VIP");
    // Copy buttons remain enabled
    expect(html).toContain("Sao chép số điện thoại 0912345678");
  });

  it("renders CreateCustomerTagDialog with all 7 contract colors mapped to Astryx tokens and inline 409 error", () => {
    const html = renderToStaticMarkup(
      <CreateCustomerTagDialog
        isOpen
        isSubmitting={false}
        error={
          new ApiError({
            code: "CONFLICT",
            status: 409,
            userMessage: "Nhãn “Khách VIP” đã tồn tại.",
          })
        }
        readOnlyReason={null}
        onOpenChange={() => {}}
        onSubmit={() => {}}
      />,
    );

    expect(html).toContain("Tạo nhãn khách hàng");
    expect(html).toContain("Nhãn “Khách VIP” đã tồn tại.");
    for (const color of CUSTOMER_TAG_COLORS) {
      expect(html).toContain(`data-color="${color}"`);
    }
  });

  it('renders "Xoá nhãn" action in tag menu, confirmation AlertDialog, read-only suppression, and delete feedback (#16)', () => {
    const withTagsHtml = renderToStaticMarkup(<CustomerPanelView {...panelProps()} />);
    expect(withTagsHtml).toContain("Xoá nhãn");
    expect(withTagsHtml).toContain("Khách VIP");
    expect(withTagsHtml).toContain("Lưu ý giao hàng");

    // When the tenant has no tags yet, the delete submenu is omitted
    const noTagsHtml = renderToStaticMarkup(
      <CustomerPanelView
        {...panelProps({
          customer: sampleCustomer({ tags: [] }),
          tenantTags: [],
        })}
      />,
    );
    expect(noTagsHtml).not.toContain("Xoá nhãn");

    // Confirming a tag deletion opens a destructive AlertDialog naming the tag
    const confirmHtml = renderToStaticMarkup(
      <CustomerPanelView
        {...panelProps({
          deletingTag: TENANT_TAGS[0],
        })}
      />,
    );
    expect(confirmHtml).toContain('role="alertdialog"');
    expect(confirmHtml).toContain("Xoá nhãn “Khách VIP”?");
    expect(confirmHtml).toContain("gỡ khỏi toàn bộ khách hàng");
    expect(confirmHtml).toContain("Huỷ");
    expect(confirmHtml).toContain("Xoá nhãn");

    // Read-only mode suppresses the destructive confirmation dialog
    const readOnlyConfirmHtml = renderToStaticMarkup(
      <CustomerPanelView
        {...panelProps({
          readOnlyReason: READ_ONLY_REASON,
          deletingTag: TENANT_TAGS[0],
        })}
      />,
    );
    expect(readOnlyConfirmHtml).not.toContain('role="alertdialog"');

    // Delete error and success feedback render accessibly inside the tags section
    const feedbackHtml = renderToStaticMarkup(
      <CustomerPanelView
        {...panelProps({
          deleteTagError: new ApiError({
            code: "INTERNAL",
            status: 500,
            userMessage: "Không xoá được nhãn.",
          }),
          tagStatusMessage: "Đã xoá nhãn “Khách VIP”.",
        })}
      />,
    );
    expect(feedbackHtml).toContain('role="alert"');
    expect(feedbackHtml).toContain("Không xoá được nhãn.");
    expect(feedbackHtml).toContain("Đã xoá nhãn “Khách VIP”.");
  });

  it("wires useDeleteCustomerTag into CustomerPanel with zero unused customer hook/API exports (#16)", () => {
    const panelSource = readFileSync(
      join(process.cwd(), "src/ui/components/inbox/customer/CustomerPanel.tsx"),
      "utf8",
    );
    const hookSource = readFileSync(join(process.cwd(), "src/ui/hooks/useCustomer.ts"), "utf8");
    const apiSource = readFileSync(
      join(process.cwd(), "src/ui/services/customer.api.ts"),
      "utf8",
    );

    expect(panelSource).toContain("useDeleteCustomerTag(");

    const hookExports = [
      ...hookSource.matchAll(/^export\s+(?:async\s+)?function\s+(\w+)/gm),
    ].map((m) => m[1]);
    expect(hookExports.length).toBeGreaterThanOrEqual(6);
    for (const hookName of hookExports) {
      expect(
        panelSource,
        `Expected CustomerPanel.tsx to use exported hook ${hookName}`,
      ).toContain(hookName);
    }

    const apiExports = [
      ...apiSource.matchAll(/^export\s+(?:async\s+)?function\s+(\w+)/gm),
    ].map((m) => m[1]);
    expect(apiExports.length).toBeGreaterThanOrEqual(6);
    for (const apiName of apiExports) {
      expect(
        hookSource,
        `Expected useCustomer.ts to use exported API helper ${apiName}`,
      ).toContain(apiName);
    }
  });
});

describe("customer-panel-state behaviors (copy, tags, note save)", () => {
  it("copies phone and email via Clipboard API and fails gracefully when unavailable or denied", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const okPhone = await copyContactValue("0912345678", "phone", { writeText });
    expect(writeText).toHaveBeenCalledWith("0912345678");
    expect(okPhone.status).toBe("copied");
    expect(okPhone.announcement).toContain("Đã sao chép");
    expect(okPhone.announcement).toContain("0912345678");

    const okEmail = await copyContactValue("minhthu@example.com", "email", { writeText });
    expect(okEmail.status).toBe("copied");
    expect(okEmail.announcement).toContain("Đã sao chép");

    const unavailable = await copyContactValue("0912345678", "phone", null);
    expect(unavailable.status).toBe("failed");
    expect(unavailable.announcement).toContain("thủ công");

    const denied = await copyContactValue("0912345678", "phone", {
      writeText: vi.fn().mockRejectedValue(new Error("NotAllowedError")),
    });
    expect(denied.status).toBe("failed");
    expect(denied.announcement).toContain("thủ công");

    const empty = await copyContactValue("   ", "phone", { writeText });
    expect(empty.status).toBe("failed");
  });

  it("handles tag add, remove, and 20-tag limit enforcement", () => {
    expect(toggleCustomerTagId(["t1"], "t2")).toEqual({
      ok: true,
      nextTagIds: ["t1", "t2"],
      action: "add",
    });

    expect(toggleCustomerTagId(["t1", "t2"], "t1")).toEqual({
      ok: true,
      nextTagIds: ["t2"],
      action: "remove",
    });

    expect(removeCustomerTagId(["t1", "t2", "t3"], "t2")).toEqual(["t1", "t3"]);

    const full = Array.from(
      { length: CUSTOMER_TAGS_MAX_PER_CUSTOMER },
      (_, idx) => `t-${idx}`,
    );
    expect(toggleCustomerTagId(full, "t-extra").ok).toBe(false);
    expect(appendCustomerTagId(full, "t-extra").ok).toBe(false);
    expect(appendCustomerTagId(full, "t-0")).toEqual({ ok: true, nextTagIds: full });
  });

  it("tracks note draft buffer across customer switches, edits, clearing, 2000-char limit, and read-only mode", () => {
    const initial = createNoteDraftBuffer("u1", "u1:v1:hello", "hello");
    const edited = applyNoteDraftEdit(initial, "updated note");
    expect(edited.isDirty).toBe(true);

    // Background refetch for same customer does not wipe unsaved edits
    const refetched = syncNoteDraftBuffer(edited, "u1", "u1:v2:hello2", "hello2");
    expect(refetched.text).toBe("updated note");
    expect(refetched.isDirty).toBe(true);

    // Switching to another customer always resets draft
    const switched = syncNoteDraftBuffer(edited, "u2", "u2:none:", "");
    expect(switched.fromId).toBe("u2");
    expect(switched.text).toBe("");
    expect(switched.isDirty).toBe(false);

    // Unchanged note cannot be saved
    expect(
      evaluateNoteSaveGate({
        text: "hello",
        serverText: "hello",
        isSaving: false,
        readOnlyReason: null,
      }).canSave,
    ).toBe(false);

    // Clearing an existing note IS allowed to save (empty clears)
    expect(
      evaluateNoteSaveGate({
        text: "",
        serverText: "hello",
        isSaving: false,
        readOnlyReason: null,
      }).canSave,
    ).toBe(true);

    // Exceeding 2000 chars blocks save with Vietnamese error
    const overLimit = evaluateNoteSaveGate({
      text: "a".repeat(CUSTOMER_NOTE_MAX_LENGTH + 1),
      serverText: "",
      isSaving: false,
      readOnlyReason: null,
    });
    expect(overLimit.canSave).toBe(false);
    expect(overLimit.isOverMaxLength).toBe(true);
    expect(overLimit.validationError).toContain("2.000");

    // Read-only disables both edit and save with reason
    const ro = evaluateNoteSaveGate({
      text: "changed",
      serverText: "",
      isSaving: false,
      readOnlyReason: READ_ONLY_REASON,
    });
    expect(ro.canEdit).toBe(false);
    expect(ro.canSave).toBe(false);
    expect(ro.saveDisabledReason).toBe(READ_ONLY_REASON);

    // Error classifiers
    expect(
      isCustomerNotFoundError(new ApiError({ code: "NOT_FOUND", status: 404, userMessage: "x" })),
    ).toBe(true);
    expect(
      isCustomerTagDuplicateError(new ApiError({ code: "CONFLICT", status: 409, userMessage: "x" })),
    ).toBe(true);
  });

  it("uses Astryx tokens and primitives without raw hex, inline styles, or arbitrary Tailwind values", () => {
    const files = [
      "src/ui/components/inbox/customer/CustomerPanel.tsx",
      "src/ui/components/inbox/customer/CreateCustomerTagDialog.tsx",
      "src/ui/components/inbox/customer/CustomerPanelSkeleton.tsx",
    ];
    for (const rel of files) {
      const source = readFileSync(join(process.cwd(), rel), "utf8");
      expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(source).not.toContain("style={{");
      expect(source).not.toMatch(/<(button|input|textarea)\b/);
    }
  });
});
