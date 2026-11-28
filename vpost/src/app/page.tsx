import type { Metadata } from "next";
import { unstable_rethrow } from "next/navigation";
import { cache, Suspense } from "react";

import { getOperatorSession } from "@/app/_auth/session";
import { LANDING_METADATA } from "@/ui/components/landing/landing-copy";
import {
  LandingCtaLink,
  LandingFinalCtaActions,
} from "@/ui/components/landing/LandingCtaLink";
import { LandingPageContent } from "@/ui/components/landing/LandingPageContent";

export const metadata: Metadata = {
  title: LANDING_METADATA.title,
  description: LANDING_METADATA.description,
  alternates: {
    canonical: LANDING_METADATA.canonical,
  },
  openGraph: {
    title: LANDING_METADATA.title,
    description: LANDING_METADATA.description,
    url: LANDING_METADATA.canonical,
    siteName: LANDING_METADATA.siteName,
    locale: "vi_VN",
    type: "website",
  },
};

/**
 * Memoised per-request session check for the public landing page.
 *
 * Kept inside `<Suspense>`-bounded CTA islands rather than at the top of the
 * page component (and without `force-dynamic`) so the page shell stays
 * statically-friendly while signed-in operators still see "Vào bảng điều khiển".
 */
const readLandingHasSession = cache(async (): Promise<boolean> => {
  try {
    const session = await getOperatorSession("page:/");
    return session !== null;
  } catch (error) {
    unstable_rethrow(error);
    return false;
  }
});

async function SessionCtaLink({ variant }: { readonly variant: "primary" | "topbar" }) {
  const hasSession = await readLandingHasSession();
  return <LandingCtaLink hasSession={hasSession} variant={variant} />;
}

async function SessionFinalCtaActions() {
  const hasSession = await readLandingHasSession();
  return <LandingFinalCtaActions hasSession={hasSession} />;
}

export default function LandingPage() {
  return (
    <LandingPageContent
      topBarCta={
        <Suspense fallback={<LandingCtaLink hasSession={false} variant="topbar" />}>
          <SessionCtaLink variant="topbar" />
        </Suspense>
      }
      heroCta={
        <Suspense fallback={<LandingCtaLink hasSession={false} variant="primary" />}>
          <SessionCtaLink variant="primary" />
        </Suspense>
      }
      finalCta={
        <Suspense fallback={<LandingFinalCtaActions hasSession={false} />}>
          <SessionFinalCtaActions />
        </Suspense>
      }
    />
  );
}
