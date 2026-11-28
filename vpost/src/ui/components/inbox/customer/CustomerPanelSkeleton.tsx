"use client";

import { Divider, HStack, Skeleton, Stack } from "@astryxdesign/core";

/**
 * Loading skeleton for the body sections of `CustomerPanel` (contact info,
 * tags, internal note, and recent comments).
 */
export function CustomerPanelSkeleton() {
  return (
    <Stack
      direction="vertical"
      gap={4}
      paddingInline={4}
      paddingBlock={3}
      aria-hidden="true"
      data-skeleton="customer-panel"
    >
      {/* Contact info */}
      <Stack direction="vertical" gap={2}>
        <Skeleton width={120} height={14} index={0} />
        <HStack gap={2} align="center" justify="between">
          <Skeleton width="65%" height={16} index={0} />
          <Skeleton width={32} height={32} index={0} />
        </HStack>
        <HStack gap={2} align="center" justify="between">
          <Skeleton width="75%" height={16} index={0} />
          <Skeleton width={32} height={32} index={0} />
        </HStack>
      </Stack>

      <Divider />

      {/* Tags */}
      <Stack direction="vertical" gap={3}>
        <Skeleton width={112} height={14} index={1} />
        <HStack gap={2} wrap="wrap">
          <Skeleton width={76} height={24} index={1} />
          <Skeleton width={92} height={24} index={1} />
        </HStack>
        <Skeleton width={104} height={32} index={1} />
      </Stack>

      <Divider />

      {/* Note */}
      <Stack direction="vertical" gap={3}>
        <Skeleton width={104} height={14} index={2} />
        <Skeleton width="100%" height={92} index={2} />
        <HStack gap={2} align="center" justify="between">
          <Skeleton width={112} height={32} index={2} />
          <Skeleton width={128} height={12} index={2} />
        </HStack>
      </Stack>

      <Divider />

      {/* Recent comments */}
      <Stack direction="vertical" gap={3}>
        <Skeleton width={132} height={14} index={3} />
        {[0, 1].map((row) => (
          <Stack key={row} direction="vertical" gap={1.5}>
            <Skeleton width="90%" height={14} index={row + 3} />
            <Skeleton width="60%" height={12} index={row + 3} />
          </Stack>
        ))}
      </Stack>
    </Stack>
  );
}
