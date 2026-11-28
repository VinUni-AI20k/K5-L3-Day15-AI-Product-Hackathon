import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ComponentProps, ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const routerReplaceMock = vi.fn();
let currentSearchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: routerReplaceMock, push: vi.fn() }),
  usePathname: () => "/channels",
  useSearchParams: () => currentSearchParams,
}));

vi.mock("@/ui/hooks/useReadOnlyReason", () => ({
  useReadOnlyReason: () => null,
}));

let capturedOnGoToConnect: (() => void) | null = null;
let capturedShouldOpenTokenField: boolean | undefined;

vi.mock("@/ui/components/channels/ConnectedChannelsScreen", async () => {
  const actual = await vi.importActual<
    typeof import("@/ui/components/channels/ConnectedChannelsScreen")
  >("@/ui/components/channels/ConnectedChannelsScreen");
  return {
    ConnectedChannelsScreen: (props: ComponentProps<typeof actual.ConnectedChannelsScreen>) => {
      capturedOnGoToConnect = props.onGoToConnect;
      return actual.ConnectedChannelsScreen(props);
    },
  };
});

vi.mock("@/ui/components/channels/ChannelConnectPanel", async () => {
  const actual = await vi.importActual<
    typeof import("@/ui/components/channels/ChannelConnectPanel")
  >("@/ui/components/channels/ChannelConnectPanel");
  return {
    ChannelConnectPanel: (props: ComponentProps<typeof actual.ChannelConnectPanel>) => {
      capturedShouldOpenTokenField = props.shouldOpenTokenField;
      return actual.ChannelConnectPanel(props);
    },
  };
});

import { ChannelConnectPanel } from "@/ui/components/channels/ChannelConnectPanel";
import { ChannelsHub } from "@/ui/components/channels/ChannelsHub";

function renderMarkup(element: ReactElement): string {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>{element}</QueryClientProvider>,
  );
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

describe("ChannelsHub connect CTA routing (M5)", () => {
  beforeEach(() => {
    routerReplaceMock.mockReset();
    currentSearchParams = new URLSearchParams();
    capturedOnGoToConnect = null;
    capturedShouldOpenTokenField = undefined;
  });

  it("routes general Kết nối Page CTA directly to the connect tab without forcing the manual token disclosure open", () => {
    renderMarkup(<ChannelsHub tab="pages" />);

    expect(capturedOnGoToConnect).not.toBeNull();
    capturedOnGoToConnect?.();

    expect(routerReplaceMock).toHaveBeenCalledWith("/channels?tab=connect", { scroll: false });

    currentSearchParams = new URLSearchParams("tab=connect");
    const connectHtml = renderMarkup(<ChannelsHub tab="connect" />);

    expect(capturedShouldOpenTokenField).toBeUndefined();
    expect(connectHtml).toContain("Đăng nhập bằng Facebook");
    expect(connectHtml).toContain("Cách nâng cao: dán User Access Token");
    expect(connectHtml).toContain('aria-expanded="false"');
    expect(connectHtml).not.toContain('aria-expanded="true"');
  });

  it("wires onGoToConnect to goToTab('connect') in ChannelsHub without goToConnectAndFocusToken", () => {
    const source = stripComments(
      readFileSync(fileURLToPath(new URL("../ChannelsHub.tsx", import.meta.url)), "utf8"),
    );

    expect(source).toMatch(/onGoToConnect=\{\(\)\s*=>\s*goToTab\("connect"\)\}/);
    expect(source).not.toContain("goToConnectAndFocusToken");
    expect(source).not.toContain("shouldOpenTokenField");
  });

  it("keeps manual token disclosure collapsed by default in ChannelConnectPanel and opens it only when explicitly requested", () => {
    const defaultHtml = renderMarkup(<ChannelConnectPanel areWritesBlocked={false} />);
    expect(defaultHtml).toContain("Đăng nhập bằng Facebook");
    expect(defaultHtml).toContain('aria-expanded="false"');
    expect(defaultHtml).not.toContain('aria-expanded="true"');

    const manualHtml = renderMarkup(
      <ChannelConnectPanel areWritesBlocked={false} shouldOpenTokenField />,
    );
    expect(manualHtml).toContain('aria-expanded="true"');
  });
});
