"use client";

import React, { useMemo } from "react";
import { parseActor } from "@/lib/urls"
import {
  CERT_DETAIL_TABS,
  PROJECT_DETAIL_TABS,
  type DetailTab,
} from "@/lib/detail-tabs"
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useIsNotFound } from "./not-found-marker";
import { useAuth } from "@/lib/auth/auth-context";
import { useHasPageHeader, useNavbarValues } from "@/lib/navbar-context";
import { useViewTransition } from "@/lib/view-transitions";
import { useSession } from "@/hooks/use-session";
import { useMounted } from "@/hooks/use-mounted";
import { useOrg } from "@/lib/groups/org-context";
import { destinationsFor, isDestinationActive } from "@/lib/layout/destinations";
import Button from "@/components/ui/button";
import Brandmark from "@/components/ui/brandmark";
import GlobalSearch from "@/components/search/global-search";
import { Tabs, TabList, Tab } from "@/components/ui/tabs";
import { DesktopAccountMenu } from "./account-menu";
import { DesktopNewMenu } from "./new-menu";

interface ProfileTab {
  key: string;
  label: string;
  /** When set, the tab is a top-bar navigation shortcut to this URL
   *  rather than a `?tab=<key>` panel switch on the current page. */
  href?: string;
  /** When true, only render this tab when the viewer is looking at
   *  their own profile (own-DID === profile-DID). */
  ownOnly?: boolean;
  /** When true, only render the tab when the navbar context flag
   *  `profileAboutAvailable` is set. The profile page publishes that
   *  flag whenever the viewed profile carries a non-empty
   *  `longDescription`. */
  aboutOnly?: boolean;
  /** When true, only render the tab when the navbar context flag
   *  `profileGroupsAvailable` is set — i.e. the viewed profile has
   *  at least one group membership OR the viewer is on their own
   *  profile. */
  groupsOnly?: boolean;
}

const PROFILE_TABS: ProfileTab[] = [
  { key: "overview", label: "Overview" },
  { key: "activities", label: "Activities" },
  { key: "projects", label: "Projects" },
  { key: "groups", label: "Groups", groupsOnly: true },
  { key: "endorsements", label: "Endorsements" },
  { key: "followers", label: "Followers" },
  { key: "lists", label: "Lists" },
  { key: "about", label: "About", aboutOnly: true },
  // Settings used to sit here as an own-only tab; it's now a
  // standalone page reachable from the account menu. The profile tab
  // strip stays focused on viewing-your-own-profile concerns.
];

/**
 * Desktop chrome (≥800px).
 *
 * Row 1, always:
 *   [brandmark] [Home] [Feed] [Explore] [Records] [Apps]     [search] [New] [account]
 *   Signed out: [brandmark] [Explore] [Apps]                 [search] [Sign in]
 *
 * Row 2, only on some pages:
 *   - the profile (`/{actor}`) and the edit-profile pages: the profile tabs;
 *   - record detail pages: Back + the record's section tabs;
 *   - `/create` and `/project/new`: Back.
 *
 * Row 1 shows no page title. Pages render a `<PageHeader>` (their visible
 * h1); a page without one keeps a visually hidden `<h1>` here, so every
 * page has exactly one (DESIGN.md §3.6).
 *
 * The bar scrolls with the page. It is hidden below 800px by CSS — the
 * phone `<Navbar />` and `<BottomNav />` handle that range.
 *
 * Source of truth for "what's the active profile tab" is the URL query
 * (`?tab=`). Tabs are <Link>s that update the query in place — the page
 * mirrors that into state.
 */
export default function DesktopTopBar() {
  const pathname = usePathname();
  const router = useRouter();
  const { transitionBack } = useViewTransition();
  const searchParams = useSearchParams();

  const { isLoading: authLoading, isAuthenticated, did, openSignIn } = useAuth();
  const navbarValues = useNavbarValues();
  const { pageTitle, desktopTitle, breadcrumb } = navbarValues;
  // The bar sits in its own Suspense boundary, which can hydrate after the
  // page has already published its title (or after auth resolved). Until
  // mounted, render exactly what the server did: no title, no auth-shaped
  // controls. That keeps hydration clean.
  const mounted = useMounted();
  const isLoading = authLoading || !mounted;
  // Pages publish these flags from effects, which can run before this
  // boundary hydrates; read them only once mounted (same reason as above).
  const profileAboutAvailable = mounted && navbarValues.profileAboutAvailable;
  const profileGroupsAvailable = mounted && navbarValues.profileGroupsAvailable;
  const profileEditing = mounted && navbarValues.profileEditing;
  const hasPageHeader = useHasPageHeader();
  const { handle } = useSession();
  const { activeOrg } = useOrg();

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
  // Own-profile comparison + own-only tabs key off the URL actor.
  const profileHandleFromUrl = routeActor;
  // Bare `/{actor}` is the profile page (gets the profile tab strip).
  const isOnProfile = routeActor !== null && segments.length === 1;
  // The standalone edit-profile pages — personal (/settings/edit-profile)
  // and group (/groups/{did}/edit-profile) — are reached from the "Edit
  // profile" affordance, so they keep the profile tab strip for context
  // but locked to Overview: the active tab stays highlighted and the
  // others render disabled so the editor can't tab away mid-edit.
  const isOnEditProfile =
    pathname === "/settings/edit-profile" ||
    (segments.length === 3 &&
      segments[0] === "groups" &&
      segments[2] === "edit-profile");
  // The tab strip locks (non-switchable) in two cases: the standalone
  // edit-profile page above, and inline-editing on the profile page
  // (`profileEditing`, published by the profile page). In both, only the
  // editable section(s) stay active — Overview always, plus About when
  // the viewed profile is an org exposing it.
  const lockTabs = isOnEditProfile || profileEditing;
  const isTabEditable = (key: string) =>
    key === "overview" || (profileAboutAvailable && key === "about");
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
  // Settings is its own standalone surface (reachable from the account
  // menu); no tab strip there. The edit-profile page is the one
  // exception — it borrows the profile strip (locked to Overview, see
  // `isOnEditProfile`) so the chrome doesn't drop a row when you enter
  // edit mode.
  //
  // A not-found page (e.g. "Profile not found" at `/{handle}`) keeps the
  // pathname that would normally earn a tab strip, so the profile tabs and
  // record-detail tabs are suppressed while `not-found.tsx` is mounted —
  // there is no actor or record behind them. The Back button stays.
  const isNotFound = useIsNotFound();
  const showTabsRow = !isNotFound && (isOnProfile || isOnEditProfile);
  // Compare the URL handle slug to the acting identity's handle to decide
  // whether to show own-only tabs. Acting as a group switches the "you"
  // identity to the group. Profile links fall back to the DID while the
  // handle loads, so a DID in the URL counts as own too.
  const identityHandle = activeOrg ? activeOrg.handle : handle;
  const identityDid = activeOrg ? activeOrg.groupDid : did;
  const isOnOwnProfile =
    !!profileHandleFromUrl &&
    ((!!identityHandle &&
      profileHandleFromUrl.toLowerCase() === identityHandle.toLowerCase()) ||
      (!!identityDid && profileHandleFromUrl === identityDid));
  const visibleProfileTabs = useMemo(
    () =>
      PROFILE_TABS.filter((t) => {
        if (t.ownOnly && !isOnOwnProfile) return false
        if (t.aboutOnly && !profileAboutAvailable) return false
        if (t.groupsOnly && !profileGroupsAvailable) return false
        return true
      }),
    [isOnOwnProfile, profileAboutAvailable, profileGroupsAvailable],
  );
  const activeTab = useMemo(() => {
    const raw = searchParams?.get("tab");
    // Legacy ?tab=certs -> activities so old links highlight correctly.
    const v = raw === "certs" ? "activities" : raw;
    if (v && visibleProfileTabs.some((t) => t.key === v)) return v;
    return "overview";
  }, [searchParams, visibleProfileTabs]);

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

  const tabHref = (tab: ProfileTab) => {
    if (tab.href) return tab.href;
    if (!pathname) return "#";
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    if (tab.key === "overview") params.delete("tab");
    else params.set("tab", tab.key);
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  };

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

      {showTabsRow ? (
        <div
          className="desktop-top-bar__row desktop-top-bar__row--tabs desktop-top-bar__row--profile-tabs"
          data-tour="profile-tabs"
        >
          {/* Profile ?tab= strip — canonical <Tabs> (underline). onChange
              REPLACES the ?tab= URL (scroll:false) so the page mirrors it
              without stacking a history entry per tab. With `replace`, the
              browser Back button leaves the profile entirely (returning to
              wherever the user came from) instead of stepping back through
              each tab they opened. Mirrors the in-page mobile tab strip in
              src/app/[actor]/page.tsx, which already uses `router.replace`. */}
          <Tabs
            value={lockTabs && !isTabEditable(activeTab) ? "overview" : activeTab}
            onChange={(next) => {
              // While locked, swallow switches to non-editable sections.
              if (lockTabs && !isTabEditable(next)) return;
              const tab = visibleProfileTabs.find((t) => t.key === next);
              if (tab) router.replace(tabHref(tab), { scroll: false });
            }}
          >
            <TabList aria-label="Profile sections" className="border-0">
              {visibleProfileTabs.map((tab) => (
                <Tab
                  key={tab.key}
                  value={tab.key}
                  // While editing, disable every non-editable section so
                  // you can't tab away mid-edit; Overview (and About for
                  // orgs) stay active.
                  disabled={lockTabs && !isTabEditable(tab.key)}
                >
                  {tab.label}
                </Tab>
              ))}
            </TabList>
          </Tabs>
        </div>
      ) : showBackRow ? (
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
