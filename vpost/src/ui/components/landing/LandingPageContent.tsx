import {
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  Bot,
  Check,
  CheckCircle2,
  Clock,
  Database,
  FileSpreadsheet,
  History,
  Layers,
  Link2,
  Lock,
  MessageSquareText,
  MessagesSquare,
  PenLine,
  ShieldCheck,
  Sparkles,
  Store,
  UserCheck,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import {
  FEATURES_SECTION,
  FEATURE_ITEMS,
  FINAL_CTA_COPY,
  FOOTER_COPY,
  HERO_COPY,
  HOW_IT_WORKS_SECTION,
  HOW_IT_WORKS_STEPS,
  LANDING_BRAND,
  LANDING_CTA_COPY,
  LANDING_NAV_LINKS,
  PAIN_OUTCOME_ITEMS,
  PAIN_OUTCOME_SECTION,
  SAFETY_ITEMS,
  SAFETY_SECTION,
  type FeatureItem,
  type HowItWorksStep,
  type PainOutcomeItem,
  type SafetyItem,
} from "@/ui/components/landing/landing-copy";
import {
  LandingCtaLink,
  LandingFinalCtaActions,
} from "@/ui/components/landing/LandingCtaLink";
import { LandingHeroVisual } from "@/ui/components/landing/LandingHeroVisual";
import { LandingProviders } from "@/ui/components/landing/LandingProviders";
import { LandingScrollReveal } from "@/ui/components/landing/LandingScrollReveal";
import { ColorSchemeToggle } from "@/ui/components/shell/ColorSchemeToggle";

import "./landing.css";

export interface LandingPageContentProps {
  /** Whether the current visitor already has an operator session. */
  readonly hasSession?: boolean;
  /** Optional Suspense-wrapped CTA overrides provided by the server route. */
  readonly topBarCta?: ReactNode;
  readonly heroCta?: ReactNode;
  readonly finalCta?: ReactNode;
}

function PainIcon({ icon }: { readonly icon: PainOutcomeItem["icon"] }) {
  switch (icon) {
    case "clock":
      return <Clock className="size-5" aria-hidden="true" />;
    case "messages":
      return <MessageSquareText className="size-5" aria-hidden="true" />;
    case "alert":
      return <AlertTriangle className="size-5" aria-hidden="true" />;
  }
}

function FeatureIcon({ icon }: { readonly icon: FeatureItem["icon"] }) {
  switch (icon) {
    case "layers":
      return <Layers className="size-5" aria-hidden="true" />;
    case "inbox":
      return <MessagesSquare className="size-5" aria-hidden="true" />;
    case "bot":
      return <Bot className="size-5" aria-hidden="true" />;
    case "pen":
      return <PenLine className="size-5" aria-hidden="true" />;
  }
}

function StepIcon({ icon }: { readonly icon: HowItWorksStep["icon"] }) {
  switch (icon) {
    case "link":
      return <Link2 className="size-5" aria-hidden="true" />;
    case "sheet":
      return <FileSpreadsheet className="size-5" aria-hidden="true" />;
    case "check":
      return <CheckCircle2 className="size-5" aria-hidden="true" />;
  }
}

function SafetyIcon({ icon }: { readonly icon: SafetyItem["icon"] }) {
  switch (icon) {
    case "database":
      return <Database className="size-5" aria-hidden="true" />;
    case "lock":
      return <Lock className="size-5" aria-hidden="true" />;
    case "user-check":
      return <UserCheck className="size-5" aria-hidden="true" />;
    case "history":
      return <History className="size-5" aria-hidden="true" />;
  }
}

/**
 * Full public landing page for VPOST (`/`).
 *
 * Follows `.swarm/specs/landing.md`, `.swarm/specs/ui-foundations.md` (90/9/1
 * neutral-ink-accent palette, 12px floor, 4-pt scale, small consistent radii),
 * and `.swarm/specs/ui-screen-pass.md`.
 */
export function LandingPageContent({
  hasSession = false,
  topBarCta,
  heroCta,
  finalCta,
}: LandingPageContentProps) {
  return (
    <LandingProviders>
      <div id="dau-trang" className="landing-root flex min-h-screen w-full flex-col">
        <a href="#noi-dung-chinh" className="landing-skip-link">
          {LANDING_BRAND.skipToContent}
        </a>

        {/* 1. Top bar */}
        <header className="landing-topbar">
          <div className="landing-container flex h-16 items-center justify-between gap-3">
            <Link
              href="/"
              aria-label={LANDING_BRAND.homeAriaLabel}
              className="focus-visible:ring-ring inline-flex items-center gap-2.5 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <span
                aria-hidden="true"
                className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground"
              >
                <Sparkles className="size-4" aria-hidden="true" />
              </span>
              <span className="text-lg font-semibold tracking-tight text-foreground">
                {LANDING_BRAND.name}
              </span>
            </Link>

            <nav
              aria-label={LANDING_BRAND.primaryNavAriaLabel}
              className="hidden items-center gap-1 md:flex"
            >
              {LANDING_NAV_LINKS.map((item) => (
                <a key={item.href} href={item.href} className="landing-nav-link">
                  {item.label}
                </a>
              ))}
            </nav>

            <div className="flex shrink-0 items-center gap-2">
              <ColorSchemeToggle />
              {topBarCta ?? <LandingCtaLink hasSession={hasSession} variant="topbar" />}
            </div>
          </div>

          {/* Mobile anchor strip: fits cleanly within 390px without horizontal scroll */}
          <nav
            aria-label="Điều hướng mục trang"
            className="border-t border-border md:hidden"
          >
            <div className="landing-container flex items-center justify-between gap-1 py-1.5">
              {LANDING_NAV_LINKS.map((item) => (
                <a key={item.href} href={item.href} className="landing-nav-link">
                  {item.label}
                </a>
              ))}
            </div>
          </nav>
        </header>

        <main id="noi-dung-chinh" className="flex-1">
          {/* 2. Hero */}
          <section aria-labelledby="hero-heading" className="landing-section-hero">
            <div className="landing-container grid grid-cols-1 items-center gap-10 lg:grid-cols-12 lg:gap-12">
              <div className="landing-hero-enter flex flex-col items-start lg:col-span-6">
                <div className="inline-flex items-center gap-2 rounded-full border border-border bg-sidebar px-3 py-1.5 text-xs font-medium text-muted-foreground">
                  <Store className="size-3.5 shrink-0 text-accent-foreground" aria-hidden="true" />
                  <span>{HERO_COPY.audienceBadge}</span>
                </div>

                <h1 id="hero-heading" className="landing-display mt-5">
                  {HERO_COPY.headline}
                </h1>

                <p className="landing-lead mt-5 max-w-xl">{HERO_COPY.supporting}</p>

                <div className="mt-7 flex w-full flex-wrap items-center gap-3">
                  {heroCta ?? <LandingCtaLink hasSession={hasSession} variant="primary" />}
                  <a
                    href={LANDING_CTA_COPY.heroSecondary.href}
                    className="landing-cta-secondary"
                  >
                    <span>{LANDING_CTA_COPY.heroSecondary.label}</span>
                    <ArrowDown className="size-4 shrink-0" aria-hidden="true" />
                  </a>
                </div>

                <p className="mt-5 flex items-start gap-2 text-sm text-foreground-subtle">
                  <ShieldCheck
                    className="mt-0.5 size-4 shrink-0 text-accent-foreground"
                    aria-hidden="true"
                  />
                  <span>{HERO_COPY.reassurance}</span>
                </p>
              </div>

              <div className="landing-hero-enter lg:col-span-6">
                <LandingHeroVisual />
              </div>
            </div>
          </section>

          {/* 3. Pain -> outcome (grounded in evidence/) */}
          <section
            id={PAIN_OUTCOME_SECTION.id}
            aria-labelledby="pain-outcome-heading"
            className="landing-section border-t border-border"
          >
            <LandingScrollReveal className="landing-container">
              <div className="max-w-2xl">
                <h2 id="pain-outcome-heading" className="landing-h2">
                  {PAIN_OUTCOME_SECTION.heading}
                </h2>
                <p className="landing-body mt-3">{PAIN_OUTCOME_SECTION.supporting}</p>
              </div>

              <div className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-3">
                {PAIN_OUTCOME_ITEMS.map((item) => (
                  <article
                    key={item.id}
                    className="landing-card flex flex-col justify-between gap-5"
                  >
                    <div className="flex flex-col gap-3">
                      <span className="landing-icon-tile-neutral">
                        <PainIcon icon={item.icon} />
                      </span>
                      <h3 className="landing-h3">{item.painTitle}</h3>
                      <p className="landing-body-small">{item.painDetail}</p>
                    </div>

                    <div className="flex flex-col gap-4">
                      <div className="flex flex-col gap-1.5 border-t border-border pt-4">
                        <span className="inline-flex items-center gap-1.5 text-sm font-medium text-accent-foreground">
                          <ArrowRight className="size-4 shrink-0" aria-hidden="true" />
                          <span>{item.outcomeLabel}</span>
                        </span>
                        <p className="landing-body-small text-foreground">
                          {item.outcomeDetail}
                        </p>
                      </div>

                      <p className="landing-caption border-t border-border pt-3">
                        {item.evidenceFootnote}
                      </p>
                    </div>
                  </article>
                ))}
              </div>
            </LandingScrollReveal>
          </section>

          {/* 4. Features (4 core capabilities) */}
          <section
            id={FEATURES_SECTION.id}
            aria-labelledby="features-heading"
            className="landing-section border-t border-border"
          >
            <LandingScrollReveal className="landing-container">
              <div className="max-w-2xl">
                <h2 id="features-heading" className="landing-h2">
                  {FEATURES_SECTION.heading}
                </h2>
                <p className="landing-body mt-3">{FEATURES_SECTION.supporting}</p>
              </div>

              <div className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-2">
                {FEATURE_ITEMS.map((feature) => (
                  <article key={feature.id} className="landing-card flex flex-col gap-4">
                    <div className="flex items-start gap-3.5">
                      <span className="landing-icon-tile">
                        <FeatureIcon icon={feature.icon} />
                      </span>
                      <h3 className="landing-h3 pt-1">{feature.title}</h3>
                    </div>

                    <p className="landing-body">{feature.description}</p>

                    <div className="mt-auto flex items-start gap-2 border-t border-border pt-3.5 text-sm text-foreground-subtle">
                      <Check
                        className="mt-0.5 size-4 shrink-0 text-accent-foreground"
                        aria-hidden="true"
                      />
                      <span>{feature.detail}</span>
                    </div>
                  </article>
                ))}
              </div>
            </LandingScrollReveal>
          </section>

          {/* 5. How it works (3 steps) */}
          <section
            id={HOW_IT_WORKS_SECTION.id}
            aria-labelledby="how-it-works-heading"
            className="landing-section landing-surface-subtle border-y border-border"
          >
            <LandingScrollReveal className="landing-container">
              <div className="max-w-2xl">
                <h2 id="how-it-works-heading" className="landing-h2">
                  {HOW_IT_WORKS_SECTION.heading}
                </h2>
                <p className="landing-body mt-3">{HOW_IT_WORKS_SECTION.supporting}</p>
              </div>

              <ol className="m-0 mt-8 grid list-none grid-cols-1 gap-5 p-0 md:grid-cols-3">
                {HOW_IT_WORKS_STEPS.map((step) => (
                  <li key={step.id} className="landing-card flex flex-col gap-4">
                    <div className="flex items-center justify-between gap-3">
                      <span className="landing-step-index">Bước {step.stepCode}</span>
                      <span className="landing-icon-tile-neutral">
                        <StepIcon icon={step.icon} />
                      </span>
                    </div>
                    <h3 className="landing-h3">{step.title}</h3>
                    <p className="landing-body-small">{step.description}</p>
                  </li>
                ))}
              </ol>
            </LandingScrollReveal>
          </section>

          {/* 6. Safety ("An toàn") */}
          <section
            id={SAFETY_SECTION.id}
            aria-labelledby="safety-heading"
            className="landing-section"
          >
            <LandingScrollReveal className="landing-container">
              <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:gap-10">
                <div className="flex flex-col gap-5 lg:col-span-5">
                  <div>
                    <h2 id="safety-heading" className="landing-h2">
                      {SAFETY_SECTION.heading}
                    </h2>
                    <p className="landing-body mt-3">{SAFETY_SECTION.supporting}</p>
                  </div>

                  <div className="landing-surface-subtle flex flex-col gap-3 rounded-xl border border-border p-5">
                    <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground">
                      <ShieldCheck className="size-3.5 shrink-0" aria-hidden="true" />
                      <span>{SAFETY_SECTION.calloutBadge}</span>
                    </span>
                    <h3 className="landing-h3">{SAFETY_SECTION.calloutTitle}</h3>
                    <p className="landing-body-small">{SAFETY_SECTION.calloutBody}</p>
                  </div>
                </div>

                <ul className="m-0 grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2 lg:col-span-7">
                  {SAFETY_ITEMS.map((item) => (
                    <li key={item.id} className="landing-card flex flex-col gap-3">
                      <span className="landing-icon-tile-neutral">
                        <SafetyIcon icon={item.icon} />
                      </span>
                      <h3 className="landing-h3">{item.title}</h3>
                      <p className="landing-body-small">{item.description}</p>
                    </li>
                  ))}
                </ul>
              </div>
            </LandingScrollReveal>
          </section>

          {/* 7. Final CTA band */}
          <section aria-labelledby="final-cta-heading" className="landing-section border-t border-border">
            <LandingScrollReveal className="landing-container">
              <div className="landing-cta-band flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
                <div className="max-w-xl">
                  <h2 id="final-cta-heading" className="landing-h2">
                    {FINAL_CTA_COPY.heading}
                  </h2>
                  <p className="landing-body mt-2.5">{FINAL_CTA_COPY.supporting}</p>
                </div>

                <div className="shrink-0">
                  {finalCta ?? <LandingFinalCtaActions hasSession={hasSession} />}
                </div>
              </div>
            </LandingScrollReveal>
          </section>
        </main>

        {/* Footer */}
        <footer className="border-t border-border bg-background py-8">
          <div className="landing-container flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span
                aria-hidden="true"
                className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground"
              >
                <Sparkles className="size-4" aria-hidden="true" />
              </span>
              <span className="text-sm font-medium text-foreground">
                {FOOTER_COPY.copyright}
              </span>
            </div>

            <nav
              aria-label={LANDING_BRAND.footerNavAriaLabel}
              className="flex flex-wrap items-center gap-x-5 gap-y-2"
            >
              {LANDING_NAV_LINKS.map((item) => (
                <a key={item.href} href={item.href} className="landing-footer-link">
                  {item.label}
                </a>
              ))}
              <Link href={FOOTER_COPY.signInHref} className="landing-text-link">
                {FOOTER_COPY.signInLabel}
              </Link>
            </nav>
          </div>
        </footer>
      </div>
    </LandingProviders>
  );
}
