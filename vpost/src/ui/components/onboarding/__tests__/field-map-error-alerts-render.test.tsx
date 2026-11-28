import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";

import type { ApiErrorNotice as RealApiErrorNotice } from "@/ui/components/feedback/ApiErrorNotice";
import type { CatalogFieldMap, CatalogProfileReport } from "@/ui/schemas/catalog-mapping.schema";
import { ApiError } from "@/ui/services/api-error";

type ApiErrorNoticeProps = ComponentProps<typeof RealApiErrorNotice>;

const capturedNotices: ApiErrorNoticeProps[] = [];
const mockUseProfilePreview = vi.fn();

vi.mock("@/ui/components/feedback/ApiErrorNotice", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/ui/components/feedback/ApiErrorNotice")>();
  return {
    ApiErrorNotice: (props: ApiErrorNoticeProps) => {
      capturedNotices.push(props);
      return actual.ApiErrorNotice(props);
    },
  };
});

vi.mock("@/ui/hooks/useCatalogMapping", () => ({
  useProfilePreview: () => mockUseProfilePreview(),
}));

import { FieldMapForm } from "../FieldMapForm";

const MAP: CatalogFieldMap = {
  code: "Mã sản phẩm",
  name: "Tên sản phẩm",
  description: "Mô tả",
  category: null,
  season: null,
  stock: "Tồn",
  note: null,
  colors: null,
  mediaLink: null,
};

const REPORT: CatalogProfileReport = {
  tenantId: "00000000-0000-0000-0000-000000000001",
  spreadsheetId: "sheet-1",
  sheetName: "Mẫu 2026",
  textSource: null,
  driveFolderId: "folder-1",
  stockPolicyMode: "numeric",
  sheet: {
    columns: ["Mã sản phẩm", "Tên sản phẩm", "Mô tả", "Tồn"],
    duplicateColumns: [],
    totalRows: 10,
    emptyRows: 0,
    productsParsed: 10,
    rowsRejected: 0,
    rejectionGroups: [],
    duplicateCodes: 0,
    conflictingCodes: [],
  },
  fieldMap: {
    fieldMap: MAP,
    source: "tenant",
    fields: [],
    unmappedColumns: [],
    priceLikeColumns: [],
    issues: [],
  },
  media: null,
  mediaProfileSuggestion: null,
  crossCheck: null,
  topIssues: [],
  warnings: [],
};

const SERVER_ERROR = new ApiError({
  code: "INTERNAL_ERROR",
  status: 500,
  userMessage: "Không lưu được ánh xạ.",
});

function renderForm(saveError: unknown = null): string {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <FieldMapForm
        report={REPORT}
        storedFieldMap={MAP}
        storedStockPolicy={{ mode: "numeric" }}
        storedMediaProfile={null}
        isSaving={false}
        saveError={saveError}
        readOnlyReason={null}
        onDirtyChange={() => {}}
        onSave={() => {}}
      />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  capturedNotices.length = 0;
  mockUseProfilePreview.mockReturnValue({
    isPending: false,
    isError: false,
    error: null,
    data: undefined,
    mutate: vi.fn(),
  });
});

describe("FieldMapForm — M3 mutation error focus", () => {
  it("keeps default focus enabled when saving the field map fails", () => {
    const html = renderForm(SERVER_ERROR);

    expect(capturedNotices).toHaveLength(1);
    expect(capturedNotices[0]?.source).toBe("Lưu ánh xạ");
    expect(capturedNotices[0]?.shouldFocus).not.toBe(false);
    expect(html).toContain('role="alert"');
    expect(html).toContain("Lưu ánh xạ");
  });

  it("keeps default focus enabled when running the preview dry-run fails", () => {
    mockUseProfilePreview.mockReturnValue({
      isPending: false,
      isError: true,
      error: SERVER_ERROR,
      data: undefined,
      mutate: vi.fn(),
    });

    const html = renderForm(null);

    expect(capturedNotices).toHaveLength(1);
    expect(capturedNotices[0]?.source).toBe("Báo cáo thử nghiệm");
    expect(capturedNotices[0]?.shouldFocus).not.toBe(false);
    expect(html).toContain('role="alert"');
    expect(html).toContain("Báo cáo thử nghiệm");
  });
});
