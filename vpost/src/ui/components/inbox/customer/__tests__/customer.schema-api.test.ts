import { readFileSync } from "node:fs";
import { join } from "node:path";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { inboxKeys } from "@/ui/hooks/inbox-keys";
import { useDeleteCustomerTag } from "@/ui/hooks/useCustomer";
import {
  buildInboxThreadHref,
  CUSTOMER_NAME_FALLBACK,
  CUSTOMER_NOTE_MAX_LENGTH,
  CUSTOMER_TAG_COLOR_LABELS,
  CUSTOMER_TAG_COLORS,
  CUSTOMER_TAG_NAME_MAX_LENGTH,
  CUSTOMER_TAG_TOKEN_COLORS,
  CUSTOMER_TAGS_MAX_PER_CUSTOMER,
  CustomerDetailResponseSchema,
  CustomerNoteMutationResponseSchema,
  CustomerTagDeleteResponseSchema,
  CustomerTagListResponseSchema,
  CustomerTagMutationResponseSchema,
  CustomerTagsUpdateResponseSchema,
  displayCustomerName,
  formatCustomerExcerpt,
  validateCustomerNoteText,
  validateCustomerTagName,
} from "@/ui/schemas/customer.schema";
import { ApiError, CLIENT_ERROR_CODES } from "@/ui/services/api-error";
import {
  createCustomerTag,
  deleteCustomerTag,
  getCustomer,
  listCustomerTags,
  saveCustomerNote,
  setCustomerTags,
} from "@/ui/services/customer.api";
import { meKeys } from "@/ui/services/me.api";

const TENANT_ID = "00000000-0000-4000-8000-000000000001";

const CUSTOMER_DETAIL_FIXTURE = {
  tenantId: TENANT_ID,
  customer: {
    id: "fb-user-99",
    name: "Minh Thư",
    phones: ["0912345678", "0988111222"],
    emails: ["minhthu@example.com"],
    firstSeenAt: "2026-11-20T08:30:00+07:00",
    lastSeenAt: "2026-11-27T11:45:00+07:00",
    commentCount: 5,
    tags: [
      { id: "tag-vip", name: "Khách VIP", color: "purple" },
      { id: "tag-cod", name: "Ship COD", color: "green" },
    ],
    note: {
      text: "Thích đầm dáng xoè size M, giao giờ hành chính.",
      updatedAt: "2026-11-27T09:00:00+07:00",
    },
    recentComments: [
      {
        id: "c-201",
        threadId: "thread-current",
        text: "Mẫu G1 còn size M không shop? Gọi mình 0912345678",
        createdAt: "2026-11-27T11:45:00+07:00",
        postCaption: "Đầm Voan Hoa G1 màu đen, size S-L, giá 890.000đ",
        channelName: "WorkHardToday",
      },
      {
        id: "c-190",
        threadId: "thread-older",
        text: "Phí ship ra Hà Nội bao nhiêu ạ?",
        createdAt: "2026-11-25T15:10:00+07:00",
        postCaption: "Áo sơ mi lụa trắng S2",
        channelName: "WorkHardToday",
      },
    ],
  },
};

describe("customer.schema parsing & helpers", () => {
  it("parses valid customer detail, note, and tag payloads from the inbox contract", () => {
    const parsedDetail = CustomerDetailResponseSchema.parse(CUSTOMER_DETAIL_FIXTURE);
    expect(parsedDetail.customer.id).toBe("fb-user-99");
    expect(parsedDetail.customer.phones).toEqual(["0912345678", "0988111222"]);
    expect(parsedDetail.customer.tags).toHaveLength(2);
    expect(parsedDetail.customer.recentComments).toHaveLength(2);

    const parsedNullNameAndNote = CustomerDetailResponseSchema.parse({
      ...CUSTOMER_DETAIL_FIXTURE,
      customer: {
        ...CUSTOMER_DETAIL_FIXTURE.customer,
        name: null,
        note: null,
        phones: [],
        emails: [],
        tags: [],
        recentComments: [],
      },
    });
    expect(parsedNullNameAndNote.customer.name).toBeNull();
    expect(parsedNullNameAndNote.customer.note).toBeNull();

    expect(
      CustomerNoteMutationResponseSchema.parse({
        tenantId: TENANT_ID,
        note: null,
      }).note,
    ).toBeNull();

    expect(
      CustomerTagListResponseSchema.parse({
        tenantId: TENANT_ID,
        items: CUSTOMER_TAG_COLORS.map((color, idx) => ({
          id: `t-${idx}`,
          name: CUSTOMER_TAG_COLOR_LABELS[color],
          color,
        })),
      }).items,
    ).toHaveLength(CUSTOMER_TAG_COLORS.length);

    expect(
      CustomerTagMutationResponseSchema.parse({
        tenantId: TENANT_ID,
        item: { id: "tag-1", name: "Ưu tiên", color: "red" },
      }).item.color,
    ).toBe("red");

    expect(
      CustomerTagDeleteResponseSchema.parse({ tenantId: TENANT_ID, id: "tag-1" }).id,
    ).toBe("tag-1");

    expect(
      CustomerTagsUpdateResponseSchema.parse({
        tenantId: TENANT_ID,
        tags: [{ id: "tag-1", name: "Ưu tiên", color: "orange" }],
      }).tags,
    ).toHaveLength(1);
  });

  it("rejects out-of-contract tag colors and malformed timestamps", () => {
    const badColor = CustomerTagMutationResponseSchema.safeParse({
      tenantId: TENANT_ID,
      item: { id: "t-1", name: "Lạ", color: "#ff0000" },
    });
    expect(badColor.success).toBe(false);

    const badTime = CustomerNoteMutationResponseSchema.safeParse({
      tenantId: TENANT_ID,
      note: { text: "ok", updatedAt: "not-a-timestamp" },
    });
    expect(badTime.success).toBe(false);
  });

  it("maps every contract tag color to an Astryx design token color (no raw hex)", () => {
    for (const color of CUSTOMER_TAG_COLORS) {
      expect(CUSTOMER_TAG_COLOR_LABELS[color]).toBeTruthy();
      expect(CUSTOMER_TAG_TOKEN_COLORS[color]).toBe(color);
      expect(CUSTOMER_TAG_TOKEN_COLORS[color]).not.toMatch(/^#/);
    }
  });

  it("validates note text (0..2000; empty clears), tag names (1..40), names, excerpts, and thread hrefs", () => {
    expect(displayCustomerName("  Minh Thư ", "Fallback")).toBe("Minh Thư");
    expect(displayCustomerName(null, "Tên từ hội thoại")).toBe("Tên từ hội thoại");
    expect(displayCustomerName("   ", "   ")).toBe(CUSTOMER_NAME_FALLBACK);

    expect(validateCustomerNoteText("")).toEqual({ ok: true, value: "" });
    expect(validateCustomerNoteText("   ")).toEqual({ ok: true, value: "" });
    expect(validateCustomerNoteText("a".repeat(CUSTOMER_NOTE_MAX_LENGTH))).toEqual({
      ok: true,
      value: "a".repeat(CUSTOMER_NOTE_MAX_LENGTH),
    });
    expect(validateCustomerNoteText("a".repeat(CUSTOMER_NOTE_MAX_LENGTH + 1)).ok).toBe(false);

    expect(validateCustomerTagName("   ").ok).toBe(false);
    expect(validateCustomerTagName(" Khách VIP ")).toEqual({ ok: true, value: "Khách VIP" });
    expect(validateCustomerTagName("a".repeat(CUSTOMER_TAG_NAME_MAX_LENGTH + 1)).ok).toBe(false);

    expect(formatCustomerExcerpt("  Xin   chào\nshop  ", 20)).toBe("Xin chào shop");
    expect(formatCustomerExcerpt("1234567890", 5)).toBe("12345…");
    expect(buildInboxThreadHref("thread/1?a=b")).toBe("/comments?thread=thread%2F1%3Fa%3Db");
  });
});

describe("customer.api service", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("calls all customer & tag endpoints and parses every response with zod", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify(CUSTOMER_DETAIL_FIXTURE), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            tenantId: TENANT_ID,
            note: { text: "Ghi chú mới", updatedAt: "2026-11-27T12:00:00+07:00" },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            tenantId: TENANT_ID,
            items: [{ id: "tag-1", name: "Khách VIP", color: "purple" }],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            tenantId: TENANT_ID,
            item: { id: "tag-2", name: "Đã mua", color: "green" },
          }),
          { status: 201, headers: { "content-type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            tenantId: TENANT_ID,
            tags: [
              { id: "tag-1", name: "Khách VIP", color: "purple" },
              { id: "tag-2", name: "Đã mua", color: "green" },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ tenantId: TENANT_ID, id: "tag-2" }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );

    const detail = await getCustomer("fb-user-99");
    expect(detail.customer.name).toBe("Minh Thư");
    expect(fetchSpy).toHaveBeenNthCalledWith(
      1,
      "/api/customers/fb-user-99",
      expect.objectContaining({ method: "GET" }),
    );

    const savedNote = await saveCustomerNote({ fromId: "fb-user-99", text: "Ghi chú mới" });
    expect(savedNote.note?.text).toBe("Ghi chú mới");
    expect(fetchSpy).toHaveBeenNthCalledWith(
      2,
      "/api/customers/fb-user-99/note",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ text: "Ghi chú mới" }),
      }),
    );

    const tagsList = await listCustomerTags();
    expect(tagsList.items).toHaveLength(1);
    expect(fetchSpy).toHaveBeenNthCalledWith(
      3,
      "/api/customer-tags",
      expect.objectContaining({ method: "GET" }),
    );

    const createdTag = await createCustomerTag({ name: "Đã mua", color: "green" });
    expect(createdTag.item.id).toBe("tag-2");
    expect(fetchSpy).toHaveBeenNthCalledWith(
      4,
      "/api/customer-tags",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ name: "Đã mua", color: "green" }),
      }),
    );

    const updatedTags = await setCustomerTags({
      fromId: "fb-user-99",
      tagIds: ["tag-1", "tag-2", "tag-1"],
    });
    expect(updatedTags.tags).toHaveLength(2);
    expect(fetchSpy).toHaveBeenNthCalledWith(
      5,
      "/api/customers/fb-user-99/tags",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ tagIds: ["tag-1", "tag-2"] }),
      }),
    );

    const deleted = await deleteCustomerTag("tag-2");
    expect(deleted.id).toBe("tag-2");
    expect(fetchSpy).toHaveBeenNthCalledWith(
      6,
      "/api/customer-tags/tag-2",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("maps 404, 409, malformed payloads, and client-side cap errors into ApiError", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ code: "NOT_FOUND", message: "Chưa có thông tin khách." }),
          { status: 404, headers: { "content-type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ code: "CONFLICT", message: "Tên nhãn đã tồn tại." }),
          { status: 409, headers: { "content-type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ tenantId: TENANT_ID, customer: { id: "" } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );

    await expect(getCustomer("missing")).rejects.toMatchObject({
      code: "NOT_FOUND",
      status: 404,
    });

    await expect(createCustomerTag({ name: "VIP", color: "purple" })).rejects.toMatchObject({
      code: "CONFLICT",
      status: 409,
    });

    await expect(getCustomer("bad-shape")).rejects.toMatchObject({
      code: CLIENT_ERROR_CODES.MALFORMED_RESPONSE,
    });

    const tooManyTags = Array.from(
      { length: CUSTOMER_TAGS_MAX_PER_CUSTOMER + 1 },
      (_, idx) => `t-${idx}`,
    );
    await expect(
      setCustomerTags({ fromId: "fb-user-99", tagIds: tooManyTags }),
    ).rejects.toBeInstanceOf(ApiError);

    await expect(
      saveCustomerNote({
        fromId: "fb-user-99",
        text: "x".repeat(CUSTOMER_NOTE_MAX_LENGTH + 1),
      }),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it("gates useCustomer hooks on active tenant resolution and invalidates inboxKeys.customer, customerTags, and threads", () => {
    const hookSource = readFileSync(
      join(process.cwd(), "src/ui/hooks/useCustomer.ts"),
      "utf8",
    );
    expect(hookSource).toContain("enabled: isResolved");
    expect(hookSource).toContain("inboxKeys.customer(");
    expect(hookSource).toContain("inboxKeys.customerTags(");
    expect(hookSource).toContain("inboxKeys.threads(");
  });

  it("useDeleteCustomerTag deletes via API and invalidates customerTags, threads, thread, and all cached customer profiles without touching updates or quick-replies (#16)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ tenantId: TENANT_ID, id: "tag-2" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    queryClient.setQueryData(meKeys.me(), {
      account: { id: "acc-1", displayName: "Operator", platformRole: null },
      tenants: [{ id: TENANT_ID, name: "WorkHardToday", slug: "wht", plan: "pro", role: "owner" }],
      activeTenantId: TENANT_ID,
      isBootstrapAdmin: false,
      supportSession: null,
    });
    queryClient.setQueryData(inboxKeys.customerTags(TENANT_ID), { tenantId: TENANT_ID, items: [] });
    queryClient.setQueryData(inboxKeys.threads(TENANT_ID), { items: [] });
    queryClient.setQueryData(inboxKeys.thread(TENANT_ID, "thread-1"), { id: "thread-1" });
    queryClient.setQueryData(inboxKeys.customer(TENANT_ID, "fb-user-99"), CUSTOMER_DETAIL_FIXTURE);
    queryClient.setQueryData(inboxKeys.customer(TENANT_ID, "fb-user-other"), CUSTOMER_DETAIL_FIXTURE);
    queryClient.setQueryData(inboxKeys.updates(TENANT_ID), { cursor: "c1" });
    queryClient.setQueryData(inboxKeys.quickReplies(TENANT_ID), { tenantId: TENANT_ID, items: [] });

    let capturedMutation: ReturnType<typeof useDeleteCustomerTag> | null = null;
    function Harness() {
      capturedMutation = useDeleteCustomerTag();
      return null;
    }

    renderToStaticMarkup(
      createElement(QueryClientProvider, { client: queryClient }, createElement(Harness)),
    );
    expect(capturedMutation).not.toBeNull();

    const result = await capturedMutation!.mutateAsync({ tagId: "tag-2", fromId: "fb-user-99" });
    expect(result).toEqual({ tenantId: TENANT_ID, id: "tag-2" });
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/customer-tags/tag-2",
      expect.objectContaining({ method: "DELETE" }),
    );

    const isInvalidated = (queryKey: readonly unknown[]) =>
      queryClient.getQueryCache().find({ queryKey, exact: true })?.state.isInvalidated;

    expect(isInvalidated(inboxKeys.customerTags(TENANT_ID))).toBe(true);
    expect(isInvalidated(inboxKeys.threads(TENANT_ID))).toBe(true);
    expect(isInvalidated(inboxKeys.thread(TENANT_ID, "thread-1"))).toBe(true);
    expect(isInvalidated(inboxKeys.customer(TENANT_ID, "fb-user-99"))).toBe(true);
    expect(isInvalidated(inboxKeys.customer(TENANT_ID, "fb-user-other"))).toBe(true);
    expect(isInvalidated(inboxKeys.updates(TENANT_ID))).toBe(false);
    expect(isInvalidated(inboxKeys.quickReplies(TENANT_ID))).toBe(false);
  });
});
