"use client";

import { TopNav, TopNavHeading } from "@astryxdesign/core";

import { AppSearch } from "@/ui/components/shell/AppSearch";
import { ColorSchemeToggle } from "@/ui/components/shell/ColorSchemeToggle";
import { OutOfTenantBadge } from "@/ui/components/shell/OutOfTenantBadge";
import { TenantSwitcher } from "@/ui/components/shell/TenantSwitcher";

/**
 * The app's identity bar: who the product is, which shop it is reading, and how
 * to search it. Branding lives here and nowhere else — Astryx warns that a
 * SideNavHeading next to a TopNav duplicates it, and two brand marks make the
 * page read as two apps.
 *
 * The account (avatar, sign-out) is NOT here: it sits at the foot of the side
 * nav, so there is one place to look for "who am I and how do I leave".
 */
export function AppTopBar({
  tenantName,
}: {
  /**
   * What the SERVER resolved for this request — the first paint, before
   * `/api/me` answers on the client. Null when no company is established yet;
   * the switcher then says so itself.
   */
  tenantName: string | null;
}) {
  return (
    <TopNav
      label="Thanh trên cùng"
      heading={<TopNavHeading heading="VPOST" headingHref="/overview" />}
      // The company is no longer a label but a control (M2.3): it says where
      // you are AND is the way out of it, plus the only door to "tạo công ty".
      //
      // The badge next to it only appears on VPOST's own admin screens, where
      // that company name is not what the screen is about. The slot is already
      // a spaced row, so the two travel as a fragment — no wrapper of our own.
      startContent={
        <div className="flex min-w-0 items-center gap-2">
          <TenantSwitcher fallbackLabel={tenantName} />
          <OutOfTenantBadge />
        </div>
      }
      // Sáng / tối, immediately left of the search (M3.4). A per-viewer
      // preference, so it lives on the chrome every operator has. Wrapped so
      // theme toggle and search pill align on the same baseline across desktop
      // and 390px mobile.
      endContent={
        <div className="vpost-topbar-actions">
          <ColorSchemeToggle />
          <AppSearch />
        </div>
      }
    />
  );
}
