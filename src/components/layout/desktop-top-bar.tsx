"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CircleHelp } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { useHasPageHeader, useNavbarValues } from "@/lib/navbar-context";
import { useMounted } from "@/hooks/use-mounted";
import { destinationsFor, isDestinationActive } from "@/lib/layout/destinations";
import Button from "@/components/ui/button";
import Badge from "@/components/ui/badge";
import Wordmark from "@/components/ui/wordmark";
import GlobalSearch from "@/components/search/global-search";
import { DesktopAccountMenu } from "./account-menu";
import { DesktopNewMenu } from "./new-menu";

/**
 * Desktop chrome (≥800px). One row:
 *   [wordmark] [Beta] [Workspace] | [Feed] [Explore] [Apps]   [search] [New] [account]
 *   Signed out: [wordmark] [Beta] [Explore] [Apps]        [search] [Help] [Sign in]
 *
 * A divider separates your Workspace from the network (Feed, Explore,
 * Apps): the two groups in `destinations.ts`.
 *
 * The destinations drop their icons at 800–1099px, so the full wordmark
 * fits beside them (layout.css).
 *
 * Nothing page-specific lives here: pages carry their own back link and
 * title (`<PageHeader>`) and their own section tabs, in the page, at every
 * width. The search field steps aside on /explore, which has its own.
 *
 * Pages render a `<PageHeader>` (their visible h1); a page without one
 * keeps a visually hidden `<h1>` here, so every page has exactly one
 * (DESIGN.md §3.6).
 *
 * The bar scrolls with the page. It is hidden below 800px by CSS — the
 * phone `<Navbar />` and `<BottomNav />` handle that range.
 */
export default function DesktopTopBar() {
  const pathname = usePathname();

  const { isLoading: authLoading, isAuthenticated, openSignIn } = useAuth();
  const navbarValues = useNavbarValues();
  const { pageTitle, desktopTitle, breadcrumb } = navbarValues;
  // The bar sits in its own Suspense boundary, which can hydrate after the
  // page has already published its title (or after auth resolved). Until
  // mounted, render exactly what the server did: no title, no auth-shaped
  // controls. That keeps hydration clean.
  const mounted = useMounted();
  const isLoading = authLoading || !mounted;
  const hasPageHeader = useHasPageHeader();

  // Editorial pages use LandingTopBar; suppress the app chrome.
  // Embeds render bare (board-only) inside a third-party iframe.
  if (
    pathname === "/welcome" ||
    pathname === "/terms" ||
    pathname === "/privacy" ||
    pathname === "/imprint" ||
    pathname === "/dsa" ||
    (pathname?.startsWith("/embed") ?? false)
  ) return null;

  // The wordmark goes Home for signed-in viewers and to /welcome once we
  // know the viewer is signed out (while auth resolves it points Home; that
  // page's own guard sends a signed-out visitor on).
  const brandHref = !isLoading && !isAuthenticated ? "/welcome" : "/home";

  // Explore has its own search box at the top of the page; a second one
  // here would be two ways to do the same thing.
  const showSearch = !(pathname === "/explore" || pathname?.startsWith("/explore/"));

  // Fallback h1 for pages without a <PageHeader>: the record's name on
  // detail pages (desktopTitle), else the page title, else the breadcrumb.
  const breadcrumbText = breadcrumb
    ? [breadcrumb.left.text, breadcrumb.right?.text].filter(Boolean).join(" / ")
    : null;
  const fallbackTitle = desktopTitle ?? pageTitle ?? breadcrumbText;

  return (
    <header className="desktop-top-bar" aria-label="App chrome">
      {mounted && !hasPageHeader && fallbackTitle ? (
        <h1 className="sr-only">{fallbackTitle}</h1>
      ) : null}
      <div className="desktop-top-bar__row desktop-top-bar__row--chrome">
        <div className="desktop-top-bar__left">
          <div className="desktop-top-bar__brand-group">
            <Link href={brandHref} className="desktop-top-bar__brand" aria-label="Certified home">
              <Wordmark variant="certified-app" height={18} decorative />
            </Link>
            <Badge variant="tag" compact>
              Beta
            </Badge>
          </div>
          {/* Destinations wait for auth, so a signed-in viewer never sees
              the signed-out set flash first. */}
          {!isLoading ? (
            <nav className="desktop-top-bar__nav" aria-label="Main navigation">
              {destinationsFor(isAuthenticated).map((dest, i, all) => {
                const Icon = dest.icon;
                const active = isDestinationActive(dest, pathname);
                const startsGroup = i > 0 && all[i - 1].group !== dest.group;
                return (
                  <React.Fragment key={dest.key}>
                    {startsGroup ? (
                      <span className="desktop-top-bar__divider" aria-hidden />
                    ) : null}
                    <Link
                      href={dest.href}
                      className="desktop-top-bar__nav-link"
                      aria-current={active ? "page" : undefined}
                      data-tour={dest.tour}
                    >
                      <Icon size={20} strokeWidth={1.5} aria-hidden />
                      <span>{dest.label}</span>
                    </Link>
                  </React.Fragment>
                );
              })}
            </nav>
          ) : null}
        </div>

        <div className="desktop-top-bar__right">
          {/* `/` and Cmd/Ctrl+K focus it. Also the tour's "search the
              network" spotlight. "Search", not "Search Certified": the
              field shrinks to 120px at 800px, which clipped the longer
              placeholder. */}
          {showSearch ? (
            <div className="desktop-top-bar__search" data-tour="navbar-search">
              <GlobalSearch placeholder="Search" />
            </div>
          ) : null}

          {isLoading ? null : isAuthenticated ? (
            <>
              <DesktopNewMenu />
              <DesktopAccountMenu />
            </>
          ) : (
            <>
              {/* Signed-in viewers reach Help from the account menu;
                  visitors have no menu, so it sits beside Sign in. */}
              <Link
                href="/help"
                className="desktop-top-bar__nav-link"
                aria-current={isDestinationActive({ href: "/help" }, pathname) ? "page" : undefined}
              >
                <CircleHelp size={20} strokeWidth={1.5} aria-hidden />
                <span>Help</span>
              </Link>
              <Button variant="primary" size="sm" onClick={openSignIn}>
                Sign in
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
