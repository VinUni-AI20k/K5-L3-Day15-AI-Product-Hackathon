"use client";

import { HStack, Skeleton, Stack } from "@astryxdesign/core";

/** Column widths mirror AccessRequestTable (7 columns) so the real rows land where these sat. */
const COLUMNS = [140, null, 140, 170, 140, 170, null] as const;
const ROWS = 5;

/**
 * Loading placeholder for the access requests. Shaped like the real table —
 * same column widths, same row height — so nothing jumps when the data lands
 * (web-feedback-states §1: a skeleton that does not match is worse than none).
 */
export function AccessRequestTableSkeleton() {
  return (
    <div
      className="bg-card border-border overflow-hidden rounded-xl border"
      aria-hidden="true"
    >
      <Stack direction="vertical" gap={0} padding={0}>
        {Array.from({ length: ROWS }, (_, row) => (
          <div key={row} className={row > 0 ? "border-border border-t" : undefined}>
            <HStack gap={3} padding={4} align="center">
              {COLUMNS.map((width, column) => (
                <Skeleton key={column} width={width ?? "100%"} height={16} index={row} />
              ))}
            </HStack>
          </div>
        ))}
      </Stack>
    </div>
  );
}
