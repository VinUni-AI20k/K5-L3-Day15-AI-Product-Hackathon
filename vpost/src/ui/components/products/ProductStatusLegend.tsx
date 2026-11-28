"use client";

import { HStack, StatusDot, Text } from "@astryxdesign/core";

import { legendEntries } from "@/ui/components/products/product-status-legend";
import type { CatalogProduct } from "@/ui/schemas/catalog.schema";

/**
 * One line of words for the dots in the table below it.
 *
 * The dots used to explain themselves through `aria-label` + `tooltip` only. A
 * screen reader heard them; a sighted operator on a laptop had to hover each row
 * to learn what red meant, and on a touch screen — where hover does not exist —
 * never learned at all (web-multi-device: a tooltip is not a home for meaning).
 * DESIGN.md's Named Status Rule says colour is never the only channel; this is
 * that channel, always visible, costing one row of the header.
 *
 * The dots here are `aria-hidden`: the word beside each one already IS the
 * label, and letting the dot keep its own would read every entry twice.
 */
export function ProductStatusLegend({ items }: { items: readonly CatalogProduct[] }) {
  const entries = legendEntries(items);
  if (entries.length === 0) return null;

  return (
    <div className="border-border bg-sidebar/50 flex items-center gap-4 overflow-x-auto border-b px-4 py-2.5 whitespace-nowrap lg:px-6">
      <Text type="supporting" color="secondary">
        Chú giải
      </Text>
      {entries.map((entry) => (
        <HStack key={entry.variant} gap={1.5} align="center">
          <StatusDot aria-hidden variant={entry.variant} label={entry.label} />
          <Text type="supporting">{entry.label}</Text>
        </HStack>
      ))}
    </div>
  );
}
