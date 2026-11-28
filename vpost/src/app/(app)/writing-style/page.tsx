import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getOperatorSession } from "@/app/_auth/session";
import { WritingStyleScreen } from "@/ui/components/writing-style/WritingStyleScreen";

/**
 * "Phong cách viết" — company default & per-Page writing style configuration.
 * Server Component session guard wrapping the client screen.
 */

export const metadata: Metadata = {
  title: "Phong cách viết — VPOST",
  robots: { index: false, follow: false },
};

/** Session-dependent: never prerendered, never cached by a proxy. */
export const dynamic = "force-dynamic";

export default async function WritingStylePage() {
  const session = await getOperatorSession("page:/writing-style");

  if (!session) redirect("/signin?returnUrl=%2Fwriting-style");

  return <WritingStyleScreen />;
}
