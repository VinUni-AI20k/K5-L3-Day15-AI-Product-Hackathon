import { describe, expect, it } from "vitest";

import {
  INBOX_ANONYMOUS_CUSTOMER_PREFIX,
  formatAnonymousCustomerTime,
  formatInboxCustomerName,
  formatInboxThreadAccessibleContext,
  formatThreadCustomerName,
  isAnonymousCustomerLabel,
  isAnonymousCustomerName,
  resolveThreadFirstMessageAt,
  type InboxThreadTimeSource,
} from "@/ui/components/inbox/inbox-customer-label";

function sampleThreadSource(
  overrides: Partial<InboxThreadTimeSource> = {},
): InboxThreadTimeSource {
  return {
    id: "root-1",
    lastMessage: {
      id: "msg-2",
      fromPage: true,
      text: "Dạ shop đã inbox ạ",
      createdAt: "2026-11-27T11:45:00.000Z",
    },
    updatedAt: "2026-11-27T11:45:00.000Z",
    ...overrides,
  };
}

describe("inbox-customer-label shared fallback helper", () => {
  it("formats ISO timestamps as HH:mm dd/MM in Vietnam time (Asia/Ho_Chi_Minh)", () => {
    expect(formatAnonymousCustomerTime("2026-11-27T11:30:00.000Z")).toBe("18:30 27/11");
    expect(formatAnonymousCustomerTime("2026-11-27T09:05:00+07:00")).toBe("09:05 27/11");
    expect(formatAnonymousCustomerTime("2026-01-05T17:00:00.000Z")).toBe("00:00 06/01");
    expect(formatAnonymousCustomerTime("2026-03-04T01:02:00+07:00")).toBe("01:02 04/03");

    expect(formatAnonymousCustomerTime(null)).toBeNull();
    expect(formatAnonymousCustomerTime(undefined)).toBeNull();
    expect(formatAnonymousCustomerTime("   ")).toBeNull();
    expect(formatAnonymousCustomerTime("not-a-date")).toBeNull();
  });

  it("returns trimmed customer.name when present, and 'Khách Facebook · HH:mm dd/MM' when null/empty", () => {
    expect(formatInboxCustomerName("  Minh Thư  ", "2026-11-27T09:05:00+07:00")).toBe(
      "Minh Thư",
    );
    expect(formatInboxCustomerName(null, "2026-11-27T09:05:00+07:00")).toBe(
      "Khách Facebook · 09:05 27/11",
    );
    expect(formatInboxCustomerName("", "2026-11-27T11:30:00.000Z")).toBe(
      "Khách Facebook · 18:30 27/11",
    );
    expect(formatInboxCustomerName("   ", "2026-11-27T09:05:00+07:00")).toBe(
      "Khách Facebook · 09:05 27/11",
    );
    expect(formatInboxCustomerName(undefined, null)).toBe(INBOX_ANONYMOUS_CUSTOMER_PREFIX);
    expect(formatInboxCustomerName("", "invalid")).toBe(INBOX_ANONYMOUS_CUSTOMER_PREFIX);
  });

  it("detects anonymous customer names and formatted fallback labels", () => {
    expect(isAnonymousCustomerName(null)).toBe(true);
    expect(isAnonymousCustomerName("")).toBe(true);
    expect(isAnonymousCustomerName("   ")).toBe(true);
    expect(isAnonymousCustomerName("Lan Anh")).toBe(false);

    expect(isAnonymousCustomerLabel("Khách Facebook")).toBe(true);
    expect(isAnonymousCustomerLabel("Khách Facebook · 09:05 27/11")).toBe(true);
    expect(isAnonymousCustomerLabel("Lan Anh")).toBe(false);
    expect(isAnonymousCustomerLabel(null)).toBe(false);
  });

  it("resolves first message timestamp from explicit field, root/earliest message, or thread summary", () => {
    // 1. Explicit firstMessageAt / createdAt on thread wins
    expect(
      resolveThreadFirstMessageAt(
        sampleThreadSource({ firstMessageAt: "2026-11-27T08:00:00+07:00" }),
        [{ id: "root-1", createdAt: "2026-11-27T09:00:00+07:00", delivery: "sent" }],
      ),
    ).toBe("2026-11-27T08:00:00+07:00");

    expect(
      resolveThreadFirstMessageAt(
        sampleThreadSource({ createdAt: "2026-11-27T08:15:00+07:00" }),
      ),
    ).toBe("2026-11-27T08:15:00+07:00");

    // 2. Root message (id === thread.id) wins over later replies and lastMessage.createdAt
    expect(
      resolveThreadFirstMessageAt(sampleThreadSource(), [
        { id: "msg-later", createdAt: "2026-11-27T10:30:00+07:00", delivery: "sent" },
        { id: "root-1", createdAt: "2026-11-27T09:10:00+07:00", delivery: "sent" },
      ]),
    ).toBe("2026-11-27T09:10:00+07:00");

    // 3. When root message is omitted (>50 msgs), picks earliest persisted message (ignoring failed drafts)
    expect(
      resolveThreadFirstMessageAt(sampleThreadSource(), [
        { id: "draft-fail", createdAt: "2026-11-27T08:00:00+07:00", delivery: "failed" },
        { id: "msg-52", createdAt: "2026-11-27T10:20:00+07:00", delivery: "sent" },
        { id: "msg-51", createdAt: "2026-11-27T10:05:00+07:00", delivery: "sent" },
      ]),
    ).toBe("2026-11-27T10:05:00+07:00");

    // 4. List summary fallback: lastMessage.createdAt, then updatedAt
    expect(resolveThreadFirstMessageAt(sampleThreadSource())).toBe(
      "2026-11-27T11:45:00.000Z",
    );
  });

  it("formats thread customer names and accessible row contexts consistently", () => {
    const anonThread = {
      ...sampleThreadSource(),
      customer: { id: "", name: null, tags: [] },
    };

    expect(formatThreadCustomerName(anonThread)).toBe("Khách Facebook · 18:45 27/11");
    expect(formatThreadCustomerName(anonThread, "2026-11-27T09:10:00+07:00")).toBe(
      "Khách Facebook · 09:10 27/11",
    );

    expect(
      formatInboxThreadAccessibleContext(anonThread, "2026-11-27T09:10:00+07:00"),
    ).toBe("Khách Facebook · 09:10 27/11: “Dạ shop đã inbox ạ”");
  });
});
