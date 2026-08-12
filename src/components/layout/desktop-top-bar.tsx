"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { parseActor, profileUrl } from "@/lib/urls"
import {
  CERT_DETAIL_TABS,
  PROJECT_DETAIL_TABS,
  type DetailTab,
} from "@/lib/detail-tabs"
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  ChevronDown,
  FileBadge,
  FolderKanban,
  HelpCircle,
  Home,
  LayoutGrid,
  Menu,
  Plus,
  Settings,
  User,
} from "lucide-react";
import SiteDrawer from "./site-drawer";
import { useAuth } from "@/lib/auth/auth-context";
import { useNavbarValues } from "@/lib/navbar-context";
import { useViewTransition } from "@/lib/view-transitions";
import { useProfile } from "@/hooks/use-profile";
import { useSession } from "@/hooks/use-session";
import { useOrg } from "@/lib/groups/org-context";
import { useOrgProfile } from "@/hooks/use-org-profile";
import { useMounted } from "@/hooks/use-mounted";
import { routeForActorSwitch } from "@/lib/groups/navigation";
import Avatar from "@/components/ui/avatar";
import Button from "@/components/ui/button";
import { getInitials } from "@/lib/utils/initials";
import AccountSwitcherList from "./account-switcher-list";
import Brandmark from "@/components/ui/brandmark";
import GlobalSearch from "@/components/search/global-search";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Tabs, TabList, Tab } from "@/components/ui/tabs";
import Tooltip from "@/components/ui/tooltip";

const ROLE_ORDER: Record<string, number> = { owner: 0, admin: 1, member: 2 };

// Temporarily hide the top-left hamburger (site-navigation drawer trigger).
// We're considering removing it entirely; flip this back to `true` to restore.
// The button + <SiteDrawer> wiring is kept intact below so nothing has to be
// rebuilt if we decide to bring it back.
const SHOW_SITE_NAV_HAMBURGER = false;

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
  // standalone page reachable only from the hamburger site drawer
  // (and from the legacy /settings deep link). The profile tab
  // strip stays focused on viewing-your-own-profile concerns.
];

/**
 * Desktop chrome (≥800px).
 *
 * Row 1 — always visible:
 *   [brandmark]  [page title]                  [search]  [Apps]  [Settings]  [switcher]
 *
 * Row 2 — only on /profile/[handle]:
 *   [Overview]  [Activities]  [Endorsements]  [Groups]
 *
 * The bar is `position: sticky; top: 0` and full-width. It is hidden via
 * CSS below 800px — the mobile `<Navbar />` handles that range.
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

  const { isLoading, isAuthenticated, did, openSignIn, signOut } = useAuth();
  const {
    pageTitle,
    desktopTitle,
    breadcrumb,
    profileAboutAvailable,
    profileGroupsAvailable,
    profileEditing,
  } = useNavbarValues();
  // The desktop bar prefers the record-name override (detail pages keep the
  // name on every tab); the mobile navbar still uses the tab-aware pageTitle.
  const desktopShownTitle = desktopTitle ?? pageTitle;
  const { profile, avatarUrl } = useProfile();
  const { handle } = useSession();
  const { activeOrg, groups, selfGroup, switchOrg } = useOrg();
  const { orgAvatarUrl } = useOrgProfile();

  const sortedOrgs = useMemo(() => {
    return [...groups].sort((a, b) => {
      if (a.accepted !== b.accepted) return a.accepted ? -1 : 1;
      const roleA = ROLE_ORDER[a.role] ?? 3;
      const roleB = ROLE_ORDER[b.role] ?? 3;
      if (roleA !== roleB) return roleA - roleB;
      const nameA = (a.displayName || a.handle).toLowerCase();
      const nameB = (b.displayName || b.handle).toLowerCase();
      return nameA.localeCompare(nameB);
    });
  }, [groups]);

  const identity = activeOrg
    ? {
        name: activeOrg.displayName || activeOrg.handle,
        handle: activeOrg.handle,
        avatarUrl: orgAvatarUrl || activeOrg.avatarUrl || undefined,
        initials: getInitials(activeOrg.displayName || activeOrg.handle),
      }
    : {
        name: profile?.displayName,
        handle,
        avatarUrl: avatarUrl || undefined,
        initials: getInitials(profile?.displayName, handle),
      };

  // Profile shortcut target — mirrors the left rail. When acting as a
  // group, identity.handle is the group handle, so "My profile" follows
  // the active identity just like the avatar switcher does.
  const profileHref = identity.handle
    ? profileUrl(identity.handle)
    : "/profile";

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
  const isOnSettings =
    pathname === "/settings" || (pathname?.startsWith("/settings/") ?? false);
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
  // Settings is its own standalone surface now (reachable from the
  // site drawer); no tab strip there. The edit-profile page is the one
  // exception — it borrows the profile strip (locked to Overview, see
  // `isOnEditProfile`) so the chrome doesn't drop a row when you enter
  // edit mode.
  const showTabsRow = isOnProfile || isOnEditProfile;
  // Compare the URL handle slug to the signed-in user's handle to decide
  // whether to show own-only tabs (e.g. Settings). Activeorg switches the
  // "you" identity to the org, so we compare against `identity.handle`.
  const isOnOwnProfile =
    !!identity.handle && !!profileHandleFromUrl &&
    profileHandleFromUrl.toLowerCase() === identity.handle.toLowerCase();
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

  // Switcher dropdown — now the canonical <Popover> (portal + side="bottom"
  // + align="end"), which escapes the bar's overflow/transform context and
  // owns positioning, click-outside, Esc-to-close (focus-return to trigger)
  // and re-measurement on resize/scroll.
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const mounted = useMounted();

  // "+" create dropdown — same pattern as the account switcher
  // (portal to body, anchor recomputed on resize, close on outside
  // click + Escape + route change). Lives left of the global search
  // field as a single-icon trigger that expands into three Create-
  // shortcut Links.
  const [createOpen, setCreateOpen] = useState(false);
  const createRef = useRef<HTMLDivElement>(null);
  const createMenuRef = useRef<HTMLDivElement>(null);
  const [createAnchor, setCreateAnchor] = useState<{
    left: number;
    top: number;
  } | null>(null);

  // Close the switcher on navigation. Positioning, click-outside and
  // Esc-to-close are owned by the <Popover> primitive.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- close switcher on route change (external router input); covers back/forward nav that no click handler sees; setState bails out when already closed
    setSwitcherOpen(false);
  }, [pathname]);

  // ----- Create-menu effects (mirror the switcher) -----
  // Anchor the menu's LEFT edge to the trigger's left edge so it opens
  // to the right of the "+" button (no chance of running off the
  // viewport's left side when the button sits near the chrome's right
  // edge — same affordance as GitHub's "+" menu). The initial compute
  // happens in the trigger's onClick; a stale anchor while closed is
  // unobservable because the portal gates on createOpen && createAnchor.
  const computeCreateAnchor = useCallback(() => {
    const rect = createRef.current?.getBoundingClientRect();
    if (!rect) return;
    setCreateAnchor({
      left: rect.left,
      top: rect.bottom + 8,
    });
  }, []);

  useEffect(() => {
    if (!createOpen) return;
    globalThis.addEventListener("resize", computeCreateAnchor);
    globalThis.addEventListener("scroll", computeCreateAnchor, true);
    return () => {
      globalThis.removeEventListener("resize", computeCreateAnchor);
      globalThis.removeEventListener("scroll", computeCreateAnchor, true);
    };
  }, [createOpen, computeCreateAnchor]);

  useEffect(() => {
    if (!createOpen) return;
    const onMouseDown = (e: MouseEvent) => {
      const t = e.target;
      if (!(t instanceof Node)) return;
      const inTrigger = createRef.current?.contains(t) ?? false;
      const inMenu = createMenuRef.current?.contains(t) ?? false;
      if (!inTrigger && !inMenu) setCreateOpen(false);
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [createOpen]);

  useEffect(() => {
    if (!createOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      setCreateOpen(false);
      createRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [createOpen]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- close create-menu on route change; same rationale as the switcher close above
    setCreateOpen(false);
  }, [pathname]);

  if (isLoading) return null;

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

  // Brandmark navigates to /home for signed-in viewers and to /welcome
  // once we know the viewer is signed out. isLoading already returned
  // null above (line ~353), so !isAuthenticated here means definitively
  // signed out. Mirrors the navbar + left-rail brand link.
  const brandHref = isAuthenticated ? "/home" : "/welcome"
  const brandAriaLabel = "Certified home"

  return (
    <header className="desktop-top-bar" aria-label="App chrome">
      <SiteDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
      <div className="desktop-top-bar__row desktop-top-bar__row--chrome">
        <div className="desktop-top-bar__left">
          {SHOW_SITE_NAV_HAMBURGER ? (
            <Tooltip label="Open site navigation">
              <button
                type="button"
                className="desktop-top-bar__menu"
                aria-label="Open site navigation"
                aria-expanded={drawerOpen}
                onClick={() => setDrawerOpen(true)}
              >
                <Menu size={18} strokeWidth={1.75} aria-hidden />
              </button>
            </Tooltip>
          ) : null}
          <Link
            href={brandHref}
            className={`desktop-top-bar__brand${breadcrumb || desktopShownTitle ? "" : " desktop-top-bar__brand--wordmark"}`}
            aria-label={brandAriaLabel}
          >
            {breadcrumb || desktopShownTitle ? (
              <Brandmark size={28} className="desktop-top-bar__brand-mark" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element -- static same-origin SVG wordmark; next/image performs no optimization on SVG sources and the element is CSS-sized (no CLS)
              <img
                src="/brand/wordmark/certified_wordmark_black.svg"
                alt="Certified"
                className="desktop-top-bar__wordmark"
              />
            )}
          </Link>
          {breadcrumb ? (
            <h1 className="desktop-top-bar__title" aria-live="polite">
              <Link href={breadcrumb.left.href} className="desktop-top-bar__title-part">
                {breadcrumb.left.text}
              </Link>
              {breadcrumb.right ? (
                <>
                  <span className="desktop-top-bar__title-sep" aria-hidden="true"> / </span>
                  <Link href={breadcrumb.right.href} className="desktop-top-bar__title-part">
                    {breadcrumb.right.text}
                  </Link>
                </>
              ) : null}
            </h1>
          ) : desktopShownTitle ? (
            <h1 className="desktop-top-bar__title" aria-live="polite">{desktopShownTitle}</h1>
          ) : null}
        </div>

        <div className="desktop-top-bar__right">
          {/* Shown everywhere, including /explore — the navbar search stays
              available even though Explore has its own contextual field.
              Also the product tour's "search the network" spotlight (the
              standalone Explore nav button is gone), via data-tour. */}
          <div className="desktop-top-bar__search" data-tour="navbar-search">
            <GlobalSearch placeholder="Search Certified" />
          </div>

          {isAuthenticated ? (
            <div
              ref={createRef}
              className="desktop-top-bar__create-wrap"
              data-tour="nav-create"
            >
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => {
                  if (!createOpen) computeCreateAnchor();
                  setCreateOpen((v) => !v);
                }}
                aria-haspopup="menu"
                aria-expanded={createOpen}
                aria-label="Create new"
              >
                <Plus size={20} strokeWidth={1.75} aria-hidden />
              </Button>
            </div>
          ) : null}

          {isAuthenticated ? (
            <Link
              href="/home"
              className="desktop-top-bar__icon-btn"
              aria-label="Home"
              data-tour="nav-home"
            >
              <Home size={20} strokeWidth={1.5} aria-hidden />
              <span className="desktop-top-bar__icon-label">Home</span>
            </Link>
          ) : null}

          <Link
            href="/apps"
            className="desktop-top-bar__icon-btn"
            aria-label="Apps"
            data-tour="nav-apps"
          >
            <LayoutGrid size={20} strokeWidth={1.5} aria-hidden />
            <span className="desktop-top-bar__icon-label">Apps</span>
          </Link>

          {isAuthenticated ? (
            <Link
              href={profileHref}
              className="desktop-top-bar__icon-btn"
              aria-label="My profile"
              data-tour="nav-profile"
            >
              <User size={20} strokeWidth={1.5} aria-hidden />
              <span className="desktop-top-bar__icon-label">Profile</span>
            </Link>
          ) : null}

          {isAuthenticated ? (
            <Link
              href="/settings"
              className="desktop-top-bar__icon-btn"
              aria-label="Settings"
              data-tour="nav-settings"
            >
              <Settings size={20} strokeWidth={1.5} aria-hidden />
              <span className="desktop-top-bar__icon-label">Settings</span>
            </Link>
          ) : null}

          <Link
            href="/help"
            className="desktop-top-bar__icon-btn"
            aria-label="Help"
            data-tour="nav-help"
          >
            <HelpCircle size={20} strokeWidth={1.5} aria-hidden />
            <span className="desktop-top-bar__icon-label">Help</span>
          </Link>

          {isAuthenticated ? (
            <div className="desktop-top-bar__switcher-wrap">
              <Popover open={switcherOpen} onOpenChange={setSwitcherOpen}>
                <PopoverTrigger>
                  <button
                    type="button"
                    className="desktop-top-bar__switcher"
                    aria-label={`Switch account (currently ${identity.name || "anonymous"})`}
                    data-tour="account-switcher"
                  >
                    <Avatar
                      size="sm"
                      src={identity.avatarUrl}
                      fallbackInitials={identity.initials}
                    />
                    <span className="desktop-top-bar__switcher-meta">
                      {identity.name ? (
                        <span className="desktop-top-bar__switcher-name">{identity.name}</span>
                      ) : null}
                      {identity.handle ? (
                        <span className="desktop-top-bar__switcher-handle">@{identity.handle}</span>
                      ) : null}
                    </span>
                    <ChevronDown size={14} strokeWidth={1.75} aria-hidden />
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  portal
                  side="bottom"
                  align="end"
                  minWidth={260}
                  style={{ width: 300 }}
                  className="max-h-[70vh] overflow-y-auto [scrollbar-gutter:stable]"
                >
                  <AccountSwitcherList
                    session={{ handle: handle ?? null }}
                    profile={profile ? { displayName: profile.displayName ?? undefined } : null}
                    avatarUrl={avatarUrl ?? undefined}
                    sortedOrgs={sortedOrgs}
                    selfGroup={selfGroup}
                    activeOrg={activeOrg}
                    switchOrg={switchOrg}
                    onAfterSwitch={(next) => {
                      setSwitcherOpen(false);
                      // Stay on the current page after the swap unless
                      // it's a personal-only surface the new actor can't
                      // visit (e.g. /create when switching personal →
                      // group); the helper returns /home in that case.
                      router.push(routeForActorSwitch(pathname, next));
                    }}
                    onSignOut={() => {
                      setSwitcherOpen(false);
                      signOut();
                    }}
                    onSwitchAccount={() => {
                      setSwitcherOpen(false);
                      openSignIn();
                    }}
                  />
                </PopoverContent>
              </Popover>
            </div>
          ) : (
            <Tooltip label="Sign in">
              <button
                type="button"
                onClick={openSignIn}
                className="desktop-top-bar__signin-btn"
                aria-label="Sign in"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- static same-origin SVG sign-in glyph; no optimization benefit from next/image */}
                <img
                  src="/brand/signin/certified_signin_black.svg"
                  alt=""
                  aria-hidden
                  className="desktop-top-bar__signin-img"
                />
              </button>
            </Tooltip>
          )}
        </div>
      </div>

      {showTabsRow ? (
        <div
          className="desktop-top-bar__row desktop-top-bar__row--tabs"
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
          {pathname && (isOnCertDetail || isOnProjectDetail) ? (() => {
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

      {mounted && createOpen && isAuthenticated && createAnchor
        ? createPortal(
            <div
              ref={createMenuRef}
              className="desktop-top-bar__create-menu"
              role="menu"
              style={{
                position: "fixed",
                top: createAnchor.top,
                left: createAnchor.left,
                width: 220,
              }}
            >
              <Link
                href="/create"
                role="menuitem"
                className="desktop-top-bar__create-item"
                onClick={() => setCreateOpen(false)}
              >
                <FileBadge size={16} strokeWidth={1.75} aria-hidden />
                <span>New activity</span>
              </Link>
              <Link
                href="/project/new"
                role="menuitem"
                className="desktop-top-bar__create-item"
                onClick={() => setCreateOpen(false)}
              >
                <FolderKanban size={16} strokeWidth={1.75} aria-hidden />
                <span>New project</span>
              </Link>
              <Link
                href="/groups/create"
                role="menuitem"
                className="desktop-top-bar__create-item"
                onClick={() => setCreateOpen(false)}
              >
                <Building2 size={16} strokeWidth={1.75} aria-hidden />
                <span>New group</span>
              </Link>
            </div>,
            document.body
          )
        : null}
    </header>
  );
}
