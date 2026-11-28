"use client";

import { HStack, Skeleton, Stack } from "@astryxdesign/core";

/** Column widths mirror ChannelTable so the real rows land where these sat. */
const COLUMNS = [120, null, 170, 104, 160, 220] as const;
const ROWS = 5;

/**
 * Loading placeholder for the connected Pages. Shaped like the real table —
 * same column widths, same row height — so nothing jumps when the data lands
 * (web-feedback-states §1: a skeleton that does not match is worse than none).
 */
export function ChannelTableSkeleton() {
  return (
    <div className="px-4 pb-6 sm:px-6" aria-hidden="true">
      <div className="border-border bg-card overflow-hidden rounded-xl border">
        <Stack direction="vertical" gap={0} padding={0}>
          {Array.from({ length: ROWS }, (_, row) => (
            <HStack key={row} gap={3} padding={3} align="center">
              {COLUMNS.map((width, column) => (
                <Skeleton key={column} width={width ?? "100%"} height={16} index={row} />
              ))}
            </HStack>
          ))}
        </Stack>
      </div>
    </div>
  );
}
