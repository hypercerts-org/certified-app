"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth/auth-context";
import { useLayoutBreakpoints } from "@/hooks/use-layout-breakpoints";
import { isBottomNavVisible } from "@/lib/layout/bottom-nav-visibility";
import { destinationsFor, isDestinationActive } from "@/lib/layout/destinations";

/**
 * Phone bottom tab bar (below 800px), in every phone browser: Workspace,
 * then the network (Feed, Explore, Apps) — the same destinations, in the
 * same order, as the desktop top bar. Signed out it shows the public two
 * (Explore, Apps).
 * Tabs are destinations only: creating lives in the top bar's `+`, and
 * feedback in the account sheet. No tab is ever hidden per account.
 *
 * Each tab is a 24px icon over a one-word label, at least 44px tall, with
 * safe-area padding below. Re-tapping the current tab on its own page
 * scrolls back to the top.
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

  // Each item carries a visible label (tooltips are suppressed on touch),
  // so the text is the accessible name. While auth resolves the bar keeps
  // its height but shows no tabs, so the signed-out set never flashes.
  return (
    <nav className="bottom-nav" aria-label="Main navigation">
      <div className="bottom-nav__inner">
        {isLoading
          ? null
          : destinationsFor(isAuthenticated).map((dest) => {
              const Icon = dest.icon;
              const active = isDestinationActive(dest, pathname);
              return (
                <Link
                  key={dest.key}
                  href={dest.href}
                  className={`bottom-nav__item${active ? " bottom-nav__item--active" : ""}`}
                  onClick={(e) => {
                    if (pathname !== dest.href) return;
                    e.preventDefault();
                    scrollToTop();
                  }}
                  aria-current={active ? "page" : undefined}
                  data-tour={dest.tour}
                >
                  <span className="bottom-nav__icon-wrap">
                    <Icon size={24} strokeWidth={active ? 2.5 : 1.5} aria-hidden />
                  </span>
                  <span className="bottom-nav__label">{dest.label}</span>
                </Link>
              );
            })}
      </div>
    </nav>
  );
}
