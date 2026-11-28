"use client";

import { HStack, Layout, LayoutContent, LayoutHeader, Skeleton, Stack } from "@astryxdesign/core";

import { AccessRequestTableSkeleton } from "@/ui/components/access/AccessRequestTableSkeleton";
import type { MembersTab } from "@/ui/components/members/members-tabs";
import { MemberTableSkeleton } from "@/ui/components/members/MemberTableSkeleton";

/**
 * Suspense fallback for the "Thành viên" hub. Mirrors the real frame — header
 * block, tab strip, then the body of the tab that is actually opening — so the
 * layout does not jump when `useSearchParams()` resolves (CLS = 0,
 * web-feedback-states rule 1). `aria-hidden`: grey boxes are not content.
 */
export function MembersFallback({ tab }: { tab: MembersTab }) {
  return (
    <Layout
      height="fill"
      aria-hidden="true"
      header={
        <LayoutHeader hasDivider>
          <div className="w-full space-y-4 px-4 py-4 sm:px-6 sm:py-5">
            <Stack direction="vertical" gap={2}>
              <Skeleton width={140} height={28} />
              <Skeleton width="100%" height={16} />
            </Stack>
            <HStack gap={2}>
              <Skeleton width={120} height={32} />
              <Skeleton width={110} height={32} />
              <Skeleton width={140} height={32} />
            </HStack>
          </div>
        </LayoutHeader>
      }
      content={
        <LayoutContent padding={0}>
          <MembersTabFallback tab={tab} />
        </LayoutContent>
      }
    />
  );
}

function MembersTabFallback({ tab }: { tab: MembersTab }) {
  if (tab === "invites") {
    return (
      <div className="w-full max-w-5xl space-y-4 px-4 py-6 sm:px-6 sm:py-8">
        <Skeleton width={160} height={24} />
        <Skeleton width="100%" height={16} />
        <HStack gap={3} wrap="wrap">
          <Skeleton width={280} height={40} />
          <Skeleton width={140} height={40} />
        </HStack>
        <Skeleton width="100%" height={16} />
        <Skeleton width="100%" height={16} />
      </div>
    );
  }

  if (tab === "history") {
    return (
      <Stack direction="vertical">
        <div className="space-y-2 px-4 py-4 sm:px-6 sm:py-5">
          <Skeleton width={180} height={24} />
          <Skeleton width="100%" height={16} />
          <HStack gap={3} wrap="wrap">
            <Skeleton width={280} height={32} />
            <Skeleton width={96} height={32} />
          </HStack>
        </div>
        <AccessRequestTableSkeleton />
      </Stack>
    );
  }

  return (
    <Stack direction="vertical">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6 sm:py-5">
        <HStack gap={3} align="center">
          <Skeleton width={200} height={24} />
          <Skeleton width={90} height={16} />
        </HStack>
        <Skeleton width={96} height={32} />
      </div>
      <MemberTableSkeleton />
    </Stack>
  );
}
