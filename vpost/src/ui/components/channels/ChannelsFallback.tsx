"use client";

import { HStack, Layout, LayoutContent, LayoutHeader, Skeleton, Stack } from "@astryxdesign/core";

import { ChannelTableSkeleton } from "@/ui/components/channels/ChannelTableSkeleton";
import type { ChannelsTab } from "@/ui/components/channels/channels-tabs";

/**
 * Suspense fallback for the "Kênh" hub. Mirrors the real frame — header block,
 * tab strip, then the body of the tab that is actually opening — so the layout
 * does not jump when `useSearchParams()` resolves (CLS = 0,
 * web-feedback-states rule 1). `aria-hidden`: grey boxes are not content.
 */
export function ChannelsFallback({ tab }: { tab: ChannelsTab }) {
  return (
    <Layout
      height="fill"
      aria-hidden="true"
      header={
        <LayoutHeader hasDivider>
          <div className="w-full space-y-4 px-4 py-4 sm:px-6 sm:py-5">
            <Stack direction="vertical" gap={2}>
              <Skeleton width={120} height={28} />
              <Skeleton width="100%" height={16} />
            </Stack>
            <HStack gap={2}>
              <Skeleton width={140} height={32} />
              <Skeleton width={110} height={32} />
              <Skeleton width={130} height={32} />
            </HStack>
          </div>
        </LayoutHeader>
      }
      content={
        <LayoutContent padding={0}>
          <ChannelsTabFallback tab={tab} />
        </LayoutContent>
      }
    />
  );
}

function ChannelsTabFallback({ tab }: { tab: ChannelsTab }) {
  if (tab === "connect") {
    return (
      <div className="w-full max-w-4xl space-y-4 px-4 py-6 sm:px-6 sm:py-8">
        <Skeleton width={200} height={24} />
        <Skeleton width="100%" height={56} />
        <HStack gap={2}>
          <Skeleton width={180} height={40} />
          <Skeleton width={200} height={40} />
        </HStack>
      </div>
    );
  }

  if (tab === "groups") {
    return (
      <div className="w-full max-w-5xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
        <Skeleton width={160} height={28} />
        <Skeleton width="100%" height={160} />
        <Skeleton width={120} height={20} />
        <Skeleton width="100%" height={96} />
        <Skeleton width="100%" height={96} />
      </div>
    );
  }

  return (
    <Stack direction="vertical">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
        <HStack gap={3} align="center">
          <Skeleton width={160} height={24} />
          <Skeleton width={60} height={16} />
        </HStack>
        <HStack gap={2} align="center">
          <Skeleton width={96} height={32} />
          <Skeleton width={124} height={32} />
        </HStack>
      </div>
      <ChannelTableSkeleton />
    </Stack>
  );
}
