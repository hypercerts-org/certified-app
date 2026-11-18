"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, type LucideIcon } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { useLayoutBreakpoints } from "@/hooks/use-layout-breakpoints";
import { isBottomNavVisible } from "@/lib/layout/bottom-nav-visibility";
import { isDestinationActive } from "@/lib/layout/destinations";
import { PhoneNetworkTab } from "./network-menu";
import { PhoneWorkspaceTab } from "./workspace-menu";

/**
 * The phone navigation (below 800px): a small floating pill at the bottom,
 * in every phone browser, installed app or not.
 *
 *   ( [Workspace] [Network] [Apps] )
 *
 *  - **Workspace**: opens its six sections as a small menu above the pill
 *    (workspace-menu.tsx). Always the folder icon: who you act as is the
 *    account control in the top bar, the one mark.
 *  - **Network**: opens its five pages as a menu above the pill
 *    (network-menu.tsx), so Explore, Map and Funding stay one tap away.
 *  - **Apps**.
 *
 * Settings, Help, feedback and the legal links are in the account sheet
 * (the avatar, top right; account-switcher.tsx); signed out, Help and the
 * legal links are in the site footer. Signed out the pill is Network and
 * Apps. The desktop sidebar holds the same destinations (app-sidebar.tsx).
 *
 * Each item is a 22px icon over a one-word label, at least 44px tall.
 * Re-tapping the current item on its own page scrolls back to the top.
 * The pill floats `--bottom-pill-gap` above the safe area; together they
 * are `--bottom-nav-height` (tokens.css), which bottom-pinned UI and the
 * content padding clear. Hidden on forms, /welcome, /embed and desktop
 * (bottom-nav-visibility.ts).
 */
export default function BottomNav() {
  const pathname = usePathname();
  const { isLoading, isAuthenticated } = useAuth();
  const { isDesktop } = useLayoutBreakpoints();

  if (!isBottomNavVisible({ pathname, isDesktop })) return null;

  // JS smooth scrolling isn't covered by the CSS reduced-motion block, so
  // honour the preference here.
  const scrollToTop = () => {
    const reduce = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
  };

  const tab = (href: string, label: string, Icon: LucideIcon, active: boolean, tour: string) => (
    <Link
      href={href}
      className={`bottom-nav__item${active ? " bottom-nav__item--active" : ""}`}
      onClick={(e) => {
        if (pathname !== href) return;
        e.preventDefault();
        scrollToTop();
      }}
      aria-current={active ? "page" : undefined}
      data-tour={tour}
    >
      <span className="bottom-nav__icon-wrap">
        <Icon size={22} strokeWidth={active ? 2.5 : 1.5} aria-hidden />
      </span>
      <span className="bottom-nav__label">{label}</span>
    </Link>
  );

  // While auth resolves (and on the server) the pill isn't shown: its items
  // depend on sign-in (Workspace is yours only), so an empty pill would be
  // a sliver and a guessed set could flash the wrong one. It fades in
  // complete, at its final width. The fade behind it keeps text that
  // scrolls under it from fighting its labels.
  return (
    <>
    <div className="bottom-nav-fade" aria-hidden />
    <nav
      className="bottom-nav"
      aria-label="Main navigation"
      data-pending={isLoading ? "" : undefined}
    >
      <div className="bottom-nav__inner">
        {isLoading ? null : (
          <>
            {isAuthenticated ? <PhoneWorkspaceTab /> : null}
            <PhoneNetworkTab isAuthenticated={isAuthenticated} />
            {tab("/apps", "Apps", LayoutGrid, isDestinationActive({ href: "/apps" }, pathname), "nav-apps")}
          </>
        )}
      </div>
    </nav>
    </>
  );
}
