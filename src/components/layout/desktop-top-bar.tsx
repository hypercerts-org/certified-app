"use client";

import React, { useMemo } from "react";
import { parseActor } from "@/lib/urls"
import {
  CERT_DETAIL_TABS,
  PROJECT_DETAIL_TABS,
  type DetailTab,
} from "@/lib/detail-tabs"
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useIsNotFound } from "./not-found-marker";
import { useAuth } from "@/lib/auth/auth-context";
import { useHasPageHeader, useNavbarValues } from "@/lib/navbar-context";
import { useViewTransition } from "@/lib/view-transitions";
import { useMounted } from "@/hooks/use-mounted";
import { destinationsFor, isDestinationActive } from "@/lib/layout/destinations";
import Button from "@/components/ui/button";
import Brandmark from "@/components/ui/brandmark";
import GlobalSearch from "@/components/search/global-search";
import { Tabs, TabList, Tab } from "@/components/ui/tabs";
import { DesktopAccountMenu } from "./account-menu";
import { DesktopNewMenu } from "./new-menu";

/**
 * Desktop chrome (≥800px).
 *
 * Row 1, always:
 *   [brandmark] [Home] [Feed] [Explore] [Records] [Apps]     [search] [New] [account]
 *   Signed out: [brandmark] [Explore] [Apps]                 [search] [Sign in]
 *
 * Row 2, only on some pages:
 *   - record detail pages: Back + the record's section tabs;
 *   - `/create` and `/project/new`: Back.
 * (The profile renders its own section tabs in the page, under its header,
 * so phones and desktop share one strip.)
 *
 * Row 1 shows no page title. Pages render a `<PageHeader>` (their visible
 * h1); a page without one keeps a visually hidden `<h1>` here, so every
 * page has exactly one (DESIGN.md §3.6).
 *
 * The bar scrolls with the page. It is hidden below 800px by CSS — the
 * phone `<Navbar />` and `<BottomNav />` handle that range.
 */
export default function DesktopTopBar() {
  const pathname = usePathname();
  const { transitionBack } = useViewTransition();
  const searchParams = useSearchParams();

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

  // Routes rooted at an actor — `/{actor}` (profile) and
  // `/{actor}/{type}/{rkey}` (a record that belongs to that profile) — all
  // share the handle-forward scheme: segment 0 is a handle (has a dot) or a
  // DID (`did:` prefix). `parseActor` decodes it and rejects reserved
  // top-level routes (explore, settings, …) so those never read as an actor.
  const segments = useMemo(
    () => (pathname ?? "").split("/").filter(Boolean),
    [pathname],
  );
  const routeActor = useMemo(() => {
    if (segments.length === 0) return null;
    const parsed = parseActor(segments[0]);
    return parsed.kind === "invalid" ? null : parsed.value;
  }, [segments]);
  // Record detail pages — `/{actor}/activity|project/{rkey}` — belong to a
  // profile and get their own row-2: a Back button + the record's section
  // tabs. The *editor* adds a trailing `/edit` (4 segments) and is excluded
  // — like `/create` and `/project/new` it's a single-page form whose own
  // Cancel button is the way out.
  const isOnCertDetail =
    routeActor !== null && segments.length === 3 && segments[1] === "activity";
  const isOnProjectDetail =
    routeActor !== null && segments.length === 3 && segments[1] === "project";
  // Create flows (`/create`, `/project/new`) are single-page forms with
  // no tab strip, but they still get a row-2 Back affordance so the
  // navigation rhythm matches detail pages. The form's own Cancel button
  // stays the primary "discard" action.
  const isOnCreatePage = pathname === "/create" || pathname === "/project/new";
  const showBackRow = isOnCertDetail || isOnProjectDetail || isOnCreatePage;
  // A not-found page (e.g. a missing record) keeps the pathname that
  // would normally earn record tabs, so they are suppressed while
  // `not-found.tsx` is mounted — there is no record behind them. The Back
  // button stays.
  const isNotFound = useIsNotFound();

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

  // The brandmark goes Home for signed-in viewers and to /welcome once we
  // know the viewer is signed out (while auth resolves it points Home; that
  // page's own guard sends a signed-out visitor on).
  const brandHref = !isLoading && !isAuthenticated ? "/welcome" : "/home";

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
          <Link href={brandHref} className="desktop-top-bar__brand" aria-label="Certified home">
            <Brandmark size={28} decorative />
          </Link>
          {/* Destinations wait for auth, so a signed-in viewer never sees
              the signed-out set flash first. */}
          {!isLoading ? (
            <nav className="desktop-top-bar__nav" aria-label="Main navigation">
              {destinationsFor(isAuthenticated).map((dest) => {
                const Icon = dest.icon;
                const active = isDestinationActive(dest, pathname);
                return (
                  <Link
                    key={dest.key}
                    href={dest.href}
                    className="desktop-top-bar__nav-link"
                    aria-current={active ? "page" : undefined}
                    data-tour={dest.tour}
                  >
                    <Icon size={20} strokeWidth={1.5} aria-hidden />
                    <span>{dest.label}</span>
                  </Link>
                );
              })}
            </nav>
          ) : null}
        </div>

        <div className="desktop-top-bar__right">
          {/* Shown everywhere, including /explore. `/` and Cmd/Ctrl+K focus
              it. Also the tour's "search the network" spotlight. */}
          <div className="desktop-top-bar__search" data-tour="navbar-search">
            <GlobalSearch placeholder="Search Certified" />
          </div>

          {isLoading ? null : isAuthenticated ? (
            <>
              <DesktopNewMenu />
              <DesktopAccountMenu />
            </>
          ) : (
            <Button variant="primary" size="sm" onClick={openSignIn}>
              Sign in
            </Button>
          )}
        </div>
      </div>

      {showBackRow ? (
        <div className="desktop-top-bar__row desktop-top-bar__row--tabs">
          <button
            type="button"
            className="desktop-top-bar__back"
            onClick={() => transitionBack()}
            aria-label="Go back"
          >
            <ArrowLeft size={16} strokeWidth={1.75} aria-hidden />
            Back
          </button>
          {pathname && !isNotFound && (isOnCertDetail || isOnProjectDetail) ? (() => {
            const detailTabs = isOnCertDetail ? CERT_DETAIL_TABS : PROJECT_DETAIL_TABS
            const isOnSubRoute = pathname?.endsWith("/explore")
            // Compute the navigation target for a detail tab. Two flavors:
            // query-param tabs (overview/description/…) and sub-route tabs
            // (explore) which leave the same pathname behind so the Back
            // button returns to the parent detail page.
            const hrefFor = (t: DetailTab): string => {
              if (t.subRoute) {
                // Strip any trailing /<subRoute> to avoid /explore/explore.
                const base = pathname?.replace(/\/explore$/, "") ?? ""
                return `${base}/${t.subRoute}`
              }
              const params = new URLSearchParams(searchParams?.toString() ?? "")
              if (t.key === "overview") params.delete("tab")
              else params.set("tab", t.key)
              const qs = params.toString()
              const base = pathname?.replace(/\/explore$/, "") ?? ""
              return qs ? `${base}?${qs}` : base
            }
            // Active tab: sub-route "explore" when on the /explore child,
            // else the ?tab= value (overview default).
            const activeDetailTab = isOnSubRoute
              ? (detailTabs.find((t) => t.subRoute && t.key === "explore")?.key ??
                 (searchParams?.get("tab") ?? "overview"))
              : (searchParams?.get("tab") ?? "overview")
            return (
              // Detail strip — canonical <Tabs> rendered as real link tabs
              // (each <Tab href> is an anchor, so middle-click / open-in-new-
              // tab work). `linkProps` REPLACES (not pushes) so switching tabs
              // on the same cert / project doesn't pollute history; scroll:false
              // keeps the scroll position. `value` is derived from the URL, so
              // onChange is a no-op — the link drives navigation. The row
              // wrapper owns the bottom border.
              <Tabs value={activeDetailTab} onChange={() => {}}>
                <TabList
                  aria-label={isOnCertDetail ? "Activity sections" : "Project sections"}
                  className="border-0"
                >
                  {detailTabs.map((t) => (
                    <Tab
                      key={t.key}
                      value={t.key}
                      href={hrefFor(t)}
                      linkProps={{ replace: true, scroll: false }}
                    >
                      {t.label}
                    </Tab>
                  ))}
                </TabList>
              </Tabs>
            )
          })() : null}
        </div>
      ) : null}

    </header>
  );
}
