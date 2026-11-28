import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { importProductFile } from "@/ui/services/catalog.api";

/** VPOST + backend Python: file sản phẩm đi thẳng tới POST /api/vpost/catalog. */

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(
    new Response(
      JSON.stringify({ rows: 2, codes: ["A1", "A2"], skipped: [{ line: 4, reason: "thiếu mã" }] }),
      { status: 200, headers: { "content-type": "application/json" } },
    ),
  );
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("importProductFile", () => {
  it("posts the file as multipart to /api/vpost/catalog and returns the parsed result", async () => {
    const file = new File(["ma_sp,gia_ban\nA1,\nA2,450000\n,1\n"], "kho.csv", { type: "text/csv" });

    const result = await importProductFile(file);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/vpost/catalog");
    expect(init.method).toBe("POST");
    expect((init.body as FormData).get("file")).toBeInstanceOf(File);
    expect(result).toEqual({ rows: 2, codes: ["A1", "A2"], skipped: [{ line: 4, reason: "thiếu mã" }] });
  });

  it("refuses an empty file before any request", async () => {
    await expect(importProductFile(new File([], "rong.csv"))).rejects.toMatchObject({
      code: "INVALID_INPUT",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
