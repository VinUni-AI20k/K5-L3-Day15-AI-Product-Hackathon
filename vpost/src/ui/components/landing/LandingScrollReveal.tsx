"use client";

import { useEffect, useRef, type ReactNode } from "react";

import { cn } from "@/shared/utils";

/**
 * Progressive-enhancement scroll reveal for landing sections.
 *
 * Resting state in SSR and before hydration is `opacity: 1`, so content is
 * never stuck invisible when JS is disabled, during static capture, or when
 * `prefers-reduced-motion: reduce` is active. Only sections strictly below the
 * initial viewport animate softly on scroll-in via DOM data attributes (zero
 * extra React re-renders, zero framer-motion bundle cost).
 */
export function LandingScrollReveal({
  children,
  className,
}: {
  readonly children: ReactNode;
  readonly className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const prefersReduced =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced || typeof IntersectionObserver === "undefined") return;

    const rect = element.getBoundingClientRect();
    if (rect.top <= window.innerHeight * 0.94) return;

    element.dataset.reveal = "pending";

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            element.dataset.reveal = "visible";
            observer.disconnect();
            break;
          }
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -32px 0px" },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className={cn("landing-reveal", className)}>
      {children}
    </div>
  );
}
