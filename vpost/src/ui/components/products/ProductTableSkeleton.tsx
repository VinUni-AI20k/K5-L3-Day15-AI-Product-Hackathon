"use client";

import { HStack, Skeleton, Stack } from "@astryxdesign/core";

/** Column widths mirror ProductTable so the real rows land where these sat. */
const COLUMNS = [164, null, null, 112, 96, 120, 128, 104, 120] as const;
const ROWS = 8;

/**
 * Loading placeholder for the product rows. Shaped like the real table — same
 * column cadence, same row height — while clipping overflow so narrow phones
 * never scroll sideways while waiting for data.
 */
export function ProductTableSkeleton() {
  return (
    <Stack direction="vertical" gap={0} padding={0} aria-hidden="true" className="overflow-hidden">
      {Array.from({ length: ROWS }, (_, row) => (
        <HStack key={row} gap={3} padding={3} align="center" className="min-w-0">
          {COLUMNS.map((width, column) => (
            <Skeleton key={column} width={width ?? "100%"} height={16} index={row} />
          ))}
        </HStack>
      ))}
    </Stack>
  );
}
