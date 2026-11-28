"use client";

import { LinkProvider, Theme } from "@astryxdesign/core";
import { InternationalizationProvider } from "@astryxdesign/core/i18n";
import type { ReactNode } from "react";

import { AppLink } from "@/ui/components/shell/AppLink";
import { ASTRYX_LOCALE, ASTRYX_VI } from "@/ui/i18n/astryx-vi";
import { vpostTheme } from "@/ui/theme/vpost";

/**
 * Client provider boundary for the public landing page (`/`), matching
 * `AppFrame` and `SignInScreen` so Astryx components inherit `vpostTheme`,
 * Vietnamese built-in strings, and Next.js routing via `AppLink`.
 */
export function LandingProviders({ children }: { readonly children: ReactNode }) {
  return (
    <LinkProvider component={AppLink}>
      <InternationalizationProvider
        locale={ASTRYX_LOCALE}
        messages={{ [ASTRYX_LOCALE]: ASTRYX_VI }}
      >
        <Theme theme={vpostTheme}>{children}</Theme>
      </InternationalizationProvider>
    </LinkProvider>
  );
}
