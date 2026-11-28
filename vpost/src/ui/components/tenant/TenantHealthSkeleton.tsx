"use client";

import { Card, HStack, Skeleton, Stack } from "@astryxdesign/core";

/**
 * Loading placeholder for TenantHealthCard. Heights mirror the real card so the
 * layout does not shift when data arrives (web-feedback-states rule 1: CLS = 0).
 * `aria-hidden` because a screen reader has nothing to gain from grey boxes —
 * the live region next to it announces "đang kiểm tra".
 */
export function TenantHealthSkeleton() {
  return (
    <Card padding={5} aria-hidden="true">
      <Stack direction="vertical" gap={4}>
        <HStack gap={4} justify="between" align="center">
          <Skeleton width={160} height={22} index={0} />
          <Skeleton width={96} height={24} index={1} />
        </HStack>
        <Stack direction="vertical" gap={2}>
          <Skeleton width="75%" height={16} index={2} />
          <Skeleton width="55%" height={16} index={3} />
          <Skeleton width="65%" height={16} index={4} />
        </Stack>
      </Stack>
    </Card>
  );
}
