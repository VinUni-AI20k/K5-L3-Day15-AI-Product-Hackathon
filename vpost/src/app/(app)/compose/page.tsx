import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { getOperatorSession } from "@/app/_auth/session";
import { ComposeFocus } from "@/ui/components/compose/ComposeFocus";

/**
 * "Soạn bài" (E3 + E4) — ONE screen, per the approved ComposeFocus design.
 * Server Component guard, client screen.
 *
 * It reads `?code=` (deep link from the product list) from the query string, so
 * it must sit under a <Suspense> boundary — `useSearchParams()` suspends until
 * the request's search params are known.
 */

export const metadata: Metadata = {
  title: "Soạn bài — VPOST",
  robots: { index: false, follow: false },
};

/** Session-dependent: never prerendered, never cached by a proxy. */
export const dynamic = "force-dynamic";

export default async function ComposePage() {
  const session = await getOperatorSession("page:/compose");

  // Defence in depth: middleware already blocks this route, but a Server
  // Component must not trust that it was reached through the guard.
  if (!session) redirect("/signin?returnUrl=%2Fcompose");

  // Full-bleed: the screen owns its own scroll region, palette and action bar,
  // so it takes the whole content area of the shell rather than sitting in a
  // centred column (docs/07 §4.1 + core-layout-shell §fixed shell).
  return (
    <div className="h-full min-h-0">
      <Suspense fallback={<ComposeFallback />}>
        <ComposeFocus />
      </Suspense>
    </div>
  );
}

/** The same two columns at the same sizes as the screen, so nothing jumps. */
function ComposeFallback() {
  return (
    <div aria-hidden="true" className="bg-background h-full min-h-0 motion-safe:animate-pulse">
      <div className="mx-auto flex w-full max-w-screen-2xl flex-col gap-6 px-4 py-6 lg:px-6 lg:py-8">
        <div className="border-border flex items-center gap-3 border-b pb-5">
          <div className="bg-muted size-10 shrink-0 rounded-xl" />
          <div className="space-y-2">
            <div className="bg-muted h-7 w-48 rounded-md" />
            <div className="bg-muted h-4 w-72 max-w-full rounded-md" />
          </div>
        </div>
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
          <div className="flex flex-col gap-6 lg:col-span-7">
            <div className="border-border bg-card h-80 w-full rounded-xl border" />
            <div className="border-border bg-card h-96 w-full rounded-xl border" />
          </div>
          <div className="border-border bg-card h-128 w-full rounded-xl border lg:col-span-5" />
        </div>
      </div>
    </div>
  );
}
