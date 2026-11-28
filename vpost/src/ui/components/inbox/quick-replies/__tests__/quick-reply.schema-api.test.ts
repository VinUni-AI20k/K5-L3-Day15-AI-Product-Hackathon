import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  applyQuickReplyPlaceholders,
  filterQuickReplies,
  QUICK_REPLY_CUSTOMER_FALLBACK,
  QUICK_REPLY_SHORTCUT_MAX_LENGTH,
  QUICK_REPLY_TEXT_MAX_LENGTH,
  QUICK_REPLY_TITLE_MAX_LENGTH,
  QuickReplyDeleteResponseSchema,
  QuickReplyListResponseSchema,
  QuickReplyMutationResponseSchema,
  QuickReplySchema,
  validateQuickReplyForm,
  type QuickReply,
} from "@/ui/schemas/quick-reply.schema";
import { ApiError, CLIENT_ERROR_CODES } from "@/ui/services/api-error";
import {
  createQuickReply,
  deleteQuickReply,
  listQuickReplies,
  updateQuickReply,
} from "@/ui/services/quick-reply.api";

const TENANT_ID = "00000000-0000-4000-8000-000000000001";

const SAMPLE_TEMPLATES: QuickReply[] = [
  {
    id: "qr-1",
    shortcut: "bao_gia",
    title: "Báo giá sản phẩm",
    text: "Chào {ten_khach}, mẫu này giá 890.000đ ạ. {ten_khach} mặc size nào để shop kiểm tra ạ?",
    updatedAt: "2026-11-27T10:00:00+07:00",
  },
  {
    id: "qr-2",
    shortcut: "phi-ship",
    title: "Phí vận chuyển toàn quốc",
    text: "Dạ chào {ten_khach}, phí ship toàn quốc 30.000đ, đơn từ 500.000đ miễn ship ạ.",
    updatedAt: "2026-11-27T10:15:00+07:00",
  },
  {
    id: "qr-3",
    shortcut: "size_s_l",
    title: "Hướng dẫn chọn size",
    text: "Shop có đủ size S (45–50kg), M (51–56kg), L (57–63kg) ạ.",
    updatedAt: "2026-11-27T10:30:00+07:00",
  },
];

describe("quick-reply.schema parsing, placeholders, filtering & CRUD validation", () => {
  it("parses valid quick-reply list, mutation, and delete responses", () => {
    expect(
      QuickReplyListResponseSchema.parse({ tenantId: TENANT_ID, items: SAMPLE_TEMPLATES }).items,
    ).toHaveLength(3);

    expect(
      QuickReplyMutationResponseSchema.parse({
        tenantId: TENANT_ID,
        item: SAMPLE_TEMPLATES[0],
      }).item.shortcut,
    ).toBe("bao_gia");

    expect(
      QuickReplyDeleteResponseSchema.parse({ tenantId: TENANT_ID, id: "qr-1" }).id,
    ).toBe("qr-1");
  });

  it("rejects shortcuts breaking ^[a-z0-9_-]{1,24}$ and out-of-bounds title/text lengths", () => {
    expect(
      QuickReplySchema.safeParse({ ...SAMPLE_TEMPLATES[0], shortcut: "BAO_GIA" }).success,
    ).toBe(false);
    expect(
      QuickReplySchema.safeParse({ ...SAMPLE_TEMPLATES[0], shortcut: "bao gia" }).success,
    ).toBe(false);
    expect(
      QuickReplySchema.safeParse({
        ...SAMPLE_TEMPLATES[0],
        shortcut: "a".repeat(QUICK_REPLY_SHORTCUT_MAX_LENGTH + 1),
      }).success,
    ).toBe(false);
    expect(
      QuickReplySchema.safeParse({
        ...SAMPLE_TEMPLATES[0],
        title: "t".repeat(QUICK_REPLY_TITLE_MAX_LENGTH + 1),
      }).success,
    ).toBe(false);
    expect(
      QuickReplySchema.safeParse({
        ...SAMPLE_TEMPLATES[0],
        text: "x".repeat(QUICK_REPLY_TEXT_MAX_LENGTH + 1),
      }).success,
    ).toBe(false);
  });

  it("replaces every {ten_khach} with customerName or 'bạn' fallback and preserves $ characters", () => {
    const template =
      "Chào {ten_khach}, cảm ơn {ten_khach} đã quan tâm đến sản phẩm của shop!";
    expect(applyQuickReplyPlaceholders(template, "Minh Thư")).toBe(
      "Chào Minh Thư, cảm ơn Minh Thư đã quan tâm đến sản phẩm của shop!",
    );
    expect(applyQuickReplyPlaceholders(template, "  Lan Anh  ")).toBe(
      "Chào Lan Anh, cảm ơn Lan Anh đã quan tâm đến sản phẩm của shop!",
    );
    expect(applyQuickReplyPlaceholders(template, null)).toBe(
      `Chào ${QUICK_REPLY_CUSTOMER_FALLBACK}, cảm ơn ${QUICK_REPLY_CUSTOMER_FALLBACK} đã quan tâm đến sản phẩm của shop!`,
    );
    expect(applyQuickReplyPlaceholders(template, "   ")).toBe(
      `Chào ${QUICK_REPLY_CUSTOMER_FALLBACK}, cảm ơn ${QUICK_REPLY_CUSTOMER_FALLBACK} đã quan tâm đến sản phẩm của shop!`,
    );
    expect(applyQuickReplyPlaceholders("Chào {ten_khach}!", "Shop $& $$ $1")).toBe(
      "Chào Shop $& $$ $1!",
    );
  });

  it("filters templates by shortcut and title (including Vietnamese diacritics)", () => {
    expect(filterQuickReplies(SAMPLE_TEMPLATES, "")).toHaveLength(3);
    expect(filterQuickReplies(SAMPLE_TEMPLATES, "phi").map((i) => i.id)).toEqual(["qr-2"]);
    expect(filterQuickReplies(SAMPLE_TEMPLATES, "van chuyen").map((i) => i.id)).toEqual(["qr-2"]);
    expect(filterQuickReplies(SAMPLE_TEMPLATES, "BÁO GIÁ").map((i) => i.id)).toEqual(["qr-1"]);
    expect(filterQuickReplies(SAMPLE_TEMPLATES, "size").map((i) => i.id)).toEqual(["qr-3"]);
    expect(filterQuickReplies(SAMPLE_TEMPLATES, "khong_khop")).toEqual([]);
  });

  it("validates CRUD form inputs (shortcut regex, title 1..80, text 1..2000)", () => {
    expect(
      validateQuickReplyForm({
        shortcut: "  gia_si-01  ",
        title: "  Báo giá sỉ  ",
        text: "  Chào {ten_khach}, inbox shop nhé!  ",
      }),
    ).toEqual({
      ok: true,
      data: {
        shortcut: "gia_si-01",
        title: "Báo giá sỉ",
        text: "Chào {ten_khach}, inbox shop nhé!",
      },
    });

    const invalidAll = validateQuickReplyForm({ shortcut: "", title: "   ", text: "" });
    expect(invalidAll.ok).toBe(false);
    if (!invalidAll.ok) {
      expect(invalidAll.errors.shortcut).toBeTruthy();
      expect(invalidAll.errors.title).toBeTruthy();
      expect(invalidAll.errors.text).toBeTruthy();
    }

    for (const badShortcut of [
      "GIA",
      "bao gia",
      "/gia",
      "giá",
      "gia!",
      "a".repeat(QUICK_REPLY_SHORTCUT_MAX_LENGTH + 1),
    ]) {
      const res = validateQuickReplyForm({
        shortcut: badShortcut,
        title: "Tiêu đề hợp lệ",
        text: "Nội dung hợp lệ",
      });
      expect(res.ok, `Expected shortcut "${badShortcut}" to fail`).toBe(false);
    }

    const overTitle = validateQuickReplyForm({
      shortcut: "ok_1",
      title: "a".repeat(QUICK_REPLY_TITLE_MAX_LENGTH + 1),
      text: "Nội dung hợp lệ",
    });
    expect(overTitle.ok).toBe(false);

    const overText = validateQuickReplyForm({
      shortcut: "ok_1",
      title: "Tiêu đề",
      text: "a".repeat(QUICK_REPLY_TEXT_MAX_LENGTH + 1),
    });
    expect(overText.ok).toBe(false);
  });
});

describe("quick-reply.api service", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("calls GET, POST, PATCH, and DELETE /api/quick-replies and validates responses", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ tenantId: TENANT_ID, items: SAMPLE_TEMPLATES }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ tenantId: TENANT_ID, item: SAMPLE_TEMPLATES[0] }), {
          status: 201,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            tenantId: TENANT_ID,
            item: { ...SAMPLE_TEMPLATES[0], title: "Báo giá mới" },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ tenantId: TENANT_ID, id: "qr-1" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );

    const listed = await listQuickReplies();
    expect(listed.items).toHaveLength(3);
    expect(fetchSpy).toHaveBeenNthCalledWith(
      1,
      "/api/quick-replies",
      expect.objectContaining({ method: "GET" }),
    );

    const created = await createQuickReply({
      shortcut: "bao_gia",
      title: "Báo giá sản phẩm",
      text: "Chào {ten_khach}, giá 890k ạ.",
    });
    expect(created.item.id).toBe("qr-1");
    expect(fetchSpy).toHaveBeenNthCalledWith(
      2,
      "/api/quick-replies",
      expect.objectContaining({ method: "POST" }),
    );

    const updated = await updateQuickReply({
      id: "qr-1",
      patch: { title: "Báo giá mới" },
    });
    expect(updated.item.title).toBe("Báo giá mới");
    expect(fetchSpy).toHaveBeenNthCalledWith(
      3,
      "/api/quick-replies/qr-1",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ title: "Báo giá mới" }),
      }),
    );

    const deleted = await deleteQuickReply("qr-1");
    expect(deleted.id).toBe("qr-1");
    expect(fetchSpy).toHaveBeenNthCalledWith(
      4,
      "/api/quick-replies/qr-1",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("maps 409 CONFLICT, malformed payloads, and client-side invalid input to ApiError", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ code: "CONFLICT", message: "Phím tắt bao_gia đã tồn tại." }),
          { status: 409, headers: { "content-type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ tenantId: TENANT_ID, items: [{ id: "bad" }] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );

    await expect(
      createQuickReply({ shortcut: "bao_gia", title: "Giá", text: "890k" }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      status: 409,
    });

    await expect(listQuickReplies()).rejects.toMatchObject({
      code: CLIENT_ERROR_CODES.MALFORMED_RESPONSE,
    });

    await expect(
      createQuickReply({ shortcut: "INVALID!", title: "Giá", text: "890k" }),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it("gates useQuickReplies on active tenant resolution and invalidates inboxKeys.quickReplies", () => {
    const hookSource = readFileSync(
      join(process.cwd(), "src/ui/hooks/useQuickReplies.ts"),
      "utf8",
    );
    expect(hookSource).toContain("enabled: isResolved");
    expect(hookSource).toContain("inboxKeys.quickReplies(");
  });
});
