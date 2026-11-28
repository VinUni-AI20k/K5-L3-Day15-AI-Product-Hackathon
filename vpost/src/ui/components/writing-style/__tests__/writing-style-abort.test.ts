import { describe, expect, it, vi } from "vitest";

import { createWritingStyleProductSearchSource } from "@/ui/components/writing-style/WritingStyleScreen";
import type { CatalogProductsResponse } from "@/ui/schemas/catalog.schema";
import { ApiError, CLIENT_ERROR_CODES } from "@/ui/services/api-error";

describe("createWritingStyleProductSearchSource — abort handling regression", () => {
  it("aborts superseded, cancelled, and unmounted searches with meaningful reasons and sets no error state", async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on("unhandledRejection", onUnhandled);

    const setCatalogError = vi.fn();
    const signals: AbortSignal[] = [];

    const fetchProducts = vi.fn(
      (_params: unknown, signal?: AbortSignal) =>
        new Promise<CatalogProductsResponse>((_resolve, reject) => {
          if (signal) signals.push(signal);
          signal?.addEventListener("abort", () => {
            reject(signal.reason);
          });
        }),
    );

    const source = createWritingStyleProductSearchSource({
      setCatalogError,
      fetchProducts: fetchProducts as unknown as typeof import("@/ui/services/catalog.api").listCatalogProducts,
    });

    try {
      const first = source.search("SP01");
      const second = source.search("SP02");

      // Superseding the first search aborts it with a meaningful reason, never blank.
      expect(signals[0]?.aborted).toBe(true);
      expect((signals[0]?.reason as DOMException).name).toBe("AbortError");
      expect((signals[0]?.reason as DOMException).message).toBe(
        "writing-style: product search superseded",
      );
      await expect(first).resolves.toEqual([]);

      // Explicit cancel() aborts the active search with a meaningful reason.
      source.cancel?.();
      expect(signals[1]?.aborted).toBe(true);
      expect((signals[1]?.reason as DOMException).name).toBe("AbortError");
      expect((signals[1]?.reason as DOMException).message).toBe(
        "writing-style: product search cancelled",
      );
      await expect(second).resolves.toEqual([]);

      // Unmount dispose() aborts with component-unmounted reason.
      const third = source.search("SP03");
      source.dispose("writing-style: component unmounted");
      expect(signals[2]?.aborted).toBe(true);
      expect((signals[2]?.reason as DOMException).message).toBe(
        "writing-style: component unmounted",
      );
      await expect(third).resolves.toEqual([]);

      expect(setCatalogError).not.toHaveBeenCalled();
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(unhandled).toHaveLength(0);
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });

  it("treats an external/navigation AbortError (when controller.signal is not aborted) as a quiet no-op", async () => {
    // Regression: before the fix, the catch block only checked `controller.signal.aborted`,
    // so an external AbortError fell through and painted `catalogError`.
    const setCatalogError = vi.fn();

    const fetchProducts = vi.fn(async () => {
      throw new DOMException("GET /api/catalog/products aborted", "AbortError");
    });

    const source = createWritingStyleProductSearchSource({
      setCatalogError,
      fetchProducts: fetchProducts as unknown as typeof import("@/ui/services/catalog.api").listCatalogProducts,
    });

    await expect(source.search("AO01")).resolves.toEqual([]);
    expect(setCatalogError).not.toHaveBeenCalled();
  });

  it("still surfaces real network/API errors via setCatalogError and offers manual code entry", async () => {
    const setCatalogError = vi.fn();

    const fetchProducts = vi.fn(async () => {
      throw new ApiError({
        code: CLIENT_ERROR_CODES.NETWORK,
        status: 0,
        userMessage: "Không kết nối được máy chủ.",
      });
    });

    const source = createWritingStyleProductSearchSource({
      setCatalogError,
      fetchProducts: fetchProducts as unknown as typeof import("@/ui/services/catalog.api").listCatalogProducts,
    });

    const options = await source.search("ao01");
    expect(setCatalogError).toHaveBeenCalledTimes(1);
    expect(setCatalogError.mock.calls[0]?.[0]).toContain("Bạn vẫn có thể gõ thẳng mã sản phẩm");
    expect(options).toEqual([
      expect.objectContaining({
        id: "AO01",
        auxiliaryData: expect.objectContaining({ code: "AO01", isManual: true }),
      }),
    ]);
  });
});
