import { describe, expect, it } from "vitest";

import {
  DEFAULT_INBOX_LIST_FILTER,
  DEFAULT_INBOX_URL_STATE,
  EMPTY_INBOX_COUNTS,
  buildInboxListFilterKey,
  buildInboxUrl,
  getInboxFilterCount,
  hasActiveInboxFilters,
  parseInboxUrlState,
  resolveInboxListEmptyKind,
  toInboxListFilter,
} from "@/ui/components/inbox/inbox-filters";

describe("inbox-filters URL parser & builder", () => {
  it("parses defaults, all 6 filter chips, narrowing params, and active thread", () => {
    expect(parseInboxUrlState(new URLSearchParams(""))).toEqual(
      DEFAULT_INBOX_URL_STATE,
    );

    for (const chip of [
      "needs_reply",
      "unread",
      "all",
      "has_phone",
      "hidden",
      "ignored",
    ] as const) {
      const parsed = parseInboxUrlState(new URLSearchParams(`filter=${chip}`));
      expect(parsed.filter).toBe(chip);
    }

    const full = parseInboxUrlState(
      new URLSearchParams(
        "filter=unread&channelId=fb-1&postJobId=job-9&q=size+M&thread=root-7",
      ),
    );
    expect(full).toEqual({
      filter: "unread",
      channelId: "fb-1",
      postJobId: "job-9",
      q: "size M",
      thread: "root-7",
    });
  });

  it("falls back to needs_reply on invalid filters and handles legacy status links", () => {
    expect(
      parseInboxUrlState(new URLSearchParams("filter=unknown&q=   ")).filter,
    ).toBe("needs_reply");
    expect(parseInboxUrlState(new URLSearchParams("filter=unknown&q=   ")).q).toBeNull();

    // JobLogTable "Xem bình luận" builds /comments?postJobId=<id> via buildInboxUrl
    const jobLink = buildInboxUrl({
      ...DEFAULT_INBOX_URL_STATE,
      postJobId: "job-42",
    });
    expect(jobLink).toBe("/comments?postJobId=job-42");
    const parsedJobLink = parseInboxUrlState(
      new URLSearchParams(jobLink.split("?")[1] ?? ""),
    );
    expect(parsedJobLink.postJobId).toBe("job-42");
    expect(parsedJobLink.filter).toBe("needs_reply");

    expect(parseInboxUrlState(new URLSearchParams("status=ignored")).filter).toBe(
      "ignored",
    );
    expect(parseInboxUrlState(new URLSearchParams("status=all")).filter).toBe("all");
  });

  it("omits defaults when building URLs and separates list-only filter keys from thread", () => {
    expect(buildInboxUrl(DEFAULT_INBOX_URL_STATE)).toBe("/comments");

    expect(
      buildInboxUrl({
        ...DEFAULT_INBOX_URL_STATE,
        thread: "root-42",
      }),
    ).toBe("/comments?thread=root-42");

    expect(
      buildInboxUrl({
        filter: "has_phone",
        channelId: "fb-1",
        postJobId: "job-9",
        q: "0901",
        thread: "root-42",
      }),
    ).toBe("/comments?filter=has_phone&channelId=fb-1&postJobId=job-9&q=0901&thread=root-42");

    // Switching threads must not change the list filter key (so bulk selection isn't wiped).
    const stateA = { ...DEFAULT_INBOX_URL_STATE, filter: "unread" as const, thread: "t1" };
    const stateB = { ...DEFAULT_INBOX_URL_STATE, filter: "unread" as const, thread: "t2" };
    expect(buildInboxListFilterKey(toInboxListFilter(stateA))).toBe(
      buildInboxListFilterKey(toInboxListFilter(stateB)),
    );
    expect(hasActiveInboxFilters(toInboxListFilter(stateA))).toBe(true);
    expect(hasActiveInboxFilters(DEFAULT_INBOX_LIST_FILTER)).toBe(false);
  });

  it("resolves first-run, all-done, and no-result empty states and filter chip counts", () => {
    expect(
      resolveInboxListEmptyKind({
        counts: EMPTY_INBOX_COUNTS,
        filter: DEFAULT_INBOX_LIST_FILTER,
      }),
    ).toBe("first-run");

    expect(
      resolveInboxListEmptyKind({
        counts: EMPTY_INBOX_COUNTS,
        filter: { ...DEFAULT_INBOX_LIST_FILTER, q: "abc" },
      }),
    ).toBe("no-result");

    expect(
      resolveInboxListEmptyKind({
        counts: { ...EMPTY_INBOX_COUNTS, all: 8, needsReply: 0 },
        filter: DEFAULT_INBOX_LIST_FILTER,
      }),
    ).toBe("done");

    expect(
      resolveInboxListEmptyKind({
        counts: { ...EMPTY_INBOX_COUNTS, all: 8, needsReply: 0 },
        filter: { ...DEFAULT_INBOX_LIST_FILTER, filter: "unread" },
      }),
    ).toBe("no-result");

    const counts = {
      needsReply: 3,
      unread: 2,
      all: 10,
      hidden: 1,
      ignored: 4,
    };
    expect(getInboxFilterCount(counts, "needs_reply")).toBe(3);
    expect(getInboxFilterCount(counts, "unread")).toBe(2);
    expect(getInboxFilterCount(counts, "all")).toBe(10);
    expect(getInboxFilterCount(counts, "hidden")).toBe(1);
    expect(getInboxFilterCount(counts, "ignored")).toBe(4);
    expect(getInboxFilterCount(counts, "has_phone")).toBeUndefined();
    expect(getInboxFilterCount({ ...counts, hasPhone: 6 }, "has_phone")).toBe(6);
  });
});
