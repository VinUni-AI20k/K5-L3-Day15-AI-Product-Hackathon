import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";

import type { ApiErrorNotice as RealApiErrorNotice } from "@/ui/components/feedback/ApiErrorNotice";
import { ApiError } from "@/ui/services/api-error";

type ApiErrorNoticeProps = ComponentProps<typeof RealApiErrorNotice>;

const capturedNotices: ApiErrorNoticeProps[] = [];

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/sync",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/ui/components/feedback/ApiErrorNotice", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/ui/components/feedback/ApiErrorNotice")>();
  return {
    ApiErrorNotice: (props: ApiErrorNoticeProps) => {
      capturedNotices.push(props);
      return actual.ApiErrorNotice(props);
    },
  };
});

const mockUseActiveTenant = vi.fn();
const mockUseReadOnlyReason = vi.fn();
const mockUseCatalogSource = vi.fn();
const mockUseUpdateCatalogSource = vi.fn();
const mockUseGoogleConnection = vi.fn();
const mockUseDisconnectGoogle = vi.fn();
const mockUseSyncStatus = vi.fn();
const mockUseRunCatalogSync = vi.fn();

vi.mock("@/ui/hooks/useMe", () => ({
  useActiveTenant: () => mockUseActiveTenant(),
}));

vi.mock("@/ui/hooks/useReadOnlyReason", () => ({
  useReadOnlyReason: () => mockUseReadOnlyReason(),
}));

vi.mock("@/ui/hooks/useCatalogProducts", () => ({
  useCatalogSource: () => mockUseCatalogSource(),
  useUpdateCatalogSource: () => mockUseUpdateCatalogSource(),
}));

vi.mock("@/ui/hooks/useGoogleDrive", () => ({
  useGoogleConnection: () => mockUseGoogleConnection(),
  useDisconnectGoogle: () => mockUseDisconnectGoogle(),
}));

vi.mock("@/ui/hooks/useCatalogSync", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/ui/hooks/useCatalogSync")>();
  return {
    ...actual,
    useSyncStatus: () => mockUseSyncStatus(),
    useRunCatalogSync: () => mockUseRunCatalogSync(),
  };
});

import { CatalogSourceCard } from "@/ui/components/sync/CatalogSourceCard";
import { CatalogSourceForm } from "@/ui/components/sync/CatalogSourceForm";
import {
  GoogleConnectionPanel,
  type DisconnectGoogleMutation,
} from "@/ui/components/sync/GoogleConnectionPanel";
import { SyncScreen } from "@/ui/components/sync/SyncScreen";
import type { GoogleConnectionQuery } from "@/ui/hooks/useGoogleDrive";

/**
 * Extracts every balanced `<div ... role="alert" ...>...</div>` block from
 * static HTML so tests can verify recovery actions live INSIDE the alert region
 * rather than rendered as external siblings below it.
 */
function extractRoleAlertBlocks(html: string): string[] {
  const blocks: string[] = [];
  const openPattern = /<div\b[^>]*\brole="alert"[^>]*>/g;
  let match: RegExpExecArray | null;

  while ((match = openPattern.exec(html)) !== null) {
    const start = match.index;
    const tagPattern = /<\/?div\b[^>]*>/g;
    tagPattern.lastIndex = start;
    let depth = 0;
    let tagMatch: RegExpExecArray | null;

    while ((tagMatch = tagPattern.exec(html)) !== null) {
      if (tagMatch[0].startsWith("</")) {
        depth -= 1;
      } else {
        depth += 1;
      }
      if (depth === 0) {
        blocks.push(html.slice(start, tagPattern.lastIndex));
        break;
      }
    }
  }

  return blocks;
}

const SERVER_ERROR = new ApiError({
  code: "INTERNAL_ERROR",
  status: 500,
  userMessage: "Máy chủ tạm thời không phản hồi.",
});

function idleMutation() {
  return {
    isPending: false,
    isError: false,
    isSuccess: false,
    error: null,
    data: undefined,
    mutate: vi.fn(),
    reset: vi.fn(),
  };
}

function idleQuery(data: unknown = undefined) {
  return {
    isPending: false,
    isFetching: false,
    fetchStatus: "idle",
    isError: false,
    error: null,
    data,
    refetch: vi.fn(),
  };
}

beforeEach(() => {
  capturedNotices.length = 0;
  mockUseActiveTenant.mockReturnValue({ tenantKey: "t-1", isResolved: true });
  mockUseReadOnlyReason.mockReturnValue(null);
  mockUseCatalogSource.mockReturnValue(idleQuery({ state: "not_configured", tenantId: "t-1" }));
  mockUseUpdateCatalogSource.mockReturnValue(idleMutation());
  mockUseGoogleConnection.mockReturnValue(idleQuery({ state: "not_connected" }));
  mockUseDisconnectGoogle.mockReturnValue(idleMutation());
  mockUseSyncStatus.mockReturnValue(idleQuery({ state: "never_synced" }));
  mockUseRunCatalogSync.mockReturnValue(idleMutation());
});

describe("M3 — mutation error alerts keep default focus and render extraAction inside role='alert'", () => {
  it("GoogleConnectionPanel keeps shouldFocus={false} on initial-load query error and puts connect link inside role='alert'", () => {
    const connection = {
      ...idleQuery(),
      isError: true,
      error: SERVER_ERROR,
    } as unknown as GoogleConnectionQuery;
    const disconnect = idleMutation() as unknown as DisconnectGoogleMutation;

    const html = renderToStaticMarkup(
      <GoogleConnectionPanel
        connection={connection}
        disconnect={disconnect}
        outcome={null}
        onDismissOutcome={() => {}}
        onPickSource={() => {}}
        isPicking={false}
      />,
    );

    expect(capturedNotices).toHaveLength(1);
    expect(capturedNotices[0]?.shouldFocus).toBe(false);
    expect(capturedNotices[0]?.extraAction).toBeDefined();

    const alerts = extractRoleAlertBlocks(html);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toContain("Kết nối Google Drive");
  });

  it("CatalogSourceCard focuses disconnect mutation errors and keeps dismiss action inside role='alert'", () => {
    mockUseDisconnectGoogle.mockReturnValue({
      ...idleMutation(),
      isError: true,
      error: SERVER_ERROR,
    });

    const html = renderToStaticMarkup(<CatalogSourceCard lastRunHealth="unknown" />);

    expect(capturedNotices).toHaveLength(1);
    expect(capturedNotices[0]?.shouldFocus).not.toBe(false);
    expect(capturedNotices[0]?.extraAction).toBeDefined();

    const alerts = extractRoleAlertBlocks(html);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toContain("Đã đọc, ẩn cảnh báo");
  });

  it("CatalogSourceCard keeps shouldFocus={false} on initial-load source query error", () => {
    mockUseCatalogSource.mockReturnValue({
      ...idleQuery(),
      isError: true,
      error: SERVER_ERROR,
    });

    renderToStaticMarkup(<CatalogSourceCard lastRunHealth="unknown" />);

    expect(capturedNotices).toHaveLength(1);
    expect(capturedNotices[0]?.shouldFocus).toBe(false);
  });

  it("CatalogSourceForm does not suppress focus on manual-source update mutation error", () => {
    mockUseUpdateCatalogSource.mockReturnValue({
      ...idleMutation(),
      isError: true,
      error: SERVER_ERROR,
    });

    const html = renderToStaticMarkup(<CatalogSourceForm onSaved={() => {}} />);

    expect(capturedNotices).toHaveLength(1);
    expect(capturedNotices[0]?.shouldFocus).not.toBe(false);
    expect(extractRoleAlertBlocks(html)).toHaveLength(1);
  });

  it("SyncScreen focuses run mutation error and keeps 'Tải lại trạng thái' inside role='alert'", () => {
    mockUseRunCatalogSync.mockReturnValue({
      ...idleMutation(),
      isError: true,
      error: SERVER_ERROR,
    });

    const html = renderToStaticMarkup(<SyncScreen />);

    expect(capturedNotices).toHaveLength(1);
    expect(capturedNotices[0]?.shouldFocus).not.toBe(false);
    expect(capturedNotices[0]?.extraAction).toBeDefined();

    const alerts = extractRoleAlertBlocks(html);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toContain("Tải lại trạng thái");
  });

  it("SyncScreen keeps shouldFocus={false} on initial-load status query error", () => {
    mockUseSyncStatus.mockReturnValue({
      ...idleQuery(),
      isError: true,
      error: SERVER_ERROR,
    });

    renderToStaticMarkup(<SyncScreen />);

    expect(capturedNotices).toHaveLength(1);
    expect(capturedNotices[0]?.shouldFocus).toBe(false);
  });
});
