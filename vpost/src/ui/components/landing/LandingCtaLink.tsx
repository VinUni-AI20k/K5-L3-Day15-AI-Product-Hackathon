import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { LANDING_CTA_COPY } from "@/ui/components/landing/landing-copy";

export interface LandingCtaLinkProps {
  readonly hasSession: boolean;
  readonly variant?: "primary" | "topbar";
}

/**
 * Navigation CTA that switches between `/signin` ("Đăng nhập") and `/overview`
 * ("Vào bảng điều khiển") when the visitor already holds an operator session.
 */
export function LandingCtaLink({
  hasSession,
  variant = "primary",
}: LandingCtaLinkProps) {
  const target = hasSession ? LANDING_CTA_COPY.signedIn : LANDING_CTA_COPY.signedOut;
  const className = variant === "topbar" ? "landing-cta-topbar" : "landing-cta-primary";

  return (
    <Link href={target.href} className={className} data-landing-cta={variant}>
      <span>{target.label}</span>
      <ArrowRight className="size-4 shrink-0" aria-hidden="true" />
    </Link>
  );
}

/**
 * Action group in the final CTA band: keeps one solid ink primary CTA and
 * adds the secondary register link only for visitors who are not signed in.
 */
export function LandingFinalCtaActions({ hasSession }: { readonly hasSession: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <LandingCtaLink hasSession={hasSession} variant="primary" />
      {hasSession ? null : (
        <Link href={LANDING_CTA_COPY.finalRegister.href} className="landing-cta-secondary">
          {LANDING_CTA_COPY.finalRegister.label}
        </Link>
      )}
    </div>
  );
}
