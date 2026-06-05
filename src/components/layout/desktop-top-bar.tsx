"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  ChevronDown,
  Compass,
  FileBadge,
  FolderKanban,
  Home,
  LayoutGrid,
  Menu,
  Plus,
  Settings,
  User,
} from "lucide-react";
import SiteDrawer from "./site-drawer";
import { useAuth } from "@/lib/auth/auth-context";
import { useNavbarContext } from "@/lib/navbar-context";
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

const ROLE_ORDER: Record<string, number> = { owner: 0, admin: 1, member: 2 };

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

/** Tabs for the cert-detail back-row strip. Mirrors the routing
 *  contract that `<ActivityDetail>` reads via `?tab=`. Keep keys in
 *  sync with the switch in that component. */
/** A detail-page subtab. Plain `key` entries map to `?tab=<key>` on
 *  the current pathname. `subRoute` entries link to a child route
 *  (`<pathname>/<subRoute>`) instead — used by `Explore` which has
 *  its own page. */
type DetailTab = { key: string; label: string; subRoute?: string };

/** /explore page tabs. Mirror the kind switcher that lived inside
 *  the explore main pane (Certs / Projects / Accounts). Switching
 *  tabs replaces ?kind= on /explore and clears the kind-specific
 *  state to match the on-page behavior. */
const EXPLORE_TABS: { key: string; label: string }[] = [
  { key: "activities", label: "Activities" },
  { key: "projects", label: "Projects" },
  { key: "accounts", label: "Accounts" },
];

const CERT_DETAIL_TABS: DetailTab[] = [
  { key: "overview", label: "Overview" },
  { key: "description", label: "Description" },
  { key: "contributors", label: "Contributors" },
  { key: "updates", label: "Updates" },
];

/** Project detail page subtabs. Same `?tab=` URL contract as the
 *  cert detail above — `<ProjectDetail>` reads it and switches
 *  content. "overview" is the implicit default (no param). */
const PROJECT_DETAIL_TABS: DetailTab[] = [
  { key: "overview", label: "Overview" },
  { key: "description", label: "Description" },
  { key: "activities", label: "Activities" },
  { key: "updates", label: "Updates" },
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
  const searchParams = useSearchParams();

  const { isLoading, isAuthenticated, did, openSignIn, signOut } = useAuth();
  const {
    pageTitle,
    breadcrumb,
    profileAboutAvailable,
    profileGroupsAvailable,
  } = useNavbarContext();
  const { profile, avatarUrl } = useProfile();
  const { handle } = useSession();
  const { activeOrg, groups, switchOrg } = useOrg();
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
        initials: getInitials(profile?.displayName, did),
      };

  // Profile shortcut target — mirrors the left rail. When acting as a
  // group, identity.handle is the group handle, so "My profile" follows
  // the active identity just like the avatar switcher does.
  const profileHref = identity.handle
    ? `/profile/${encodeURIComponent(identity.handle)}`
    : "/profile";

  const isOnProfile = pathname?.startsWith("/profile/") ?? false;
  const isOnSettings =
    pathname === "/settings" || (pathname?.startsWith("/settings/") ?? false);
  // Cert / project detail pages get a thin row-2 with just a back
  // affordance so the navigation rhythm stays consistent across the app.
  // The cert *editor* (`/activity/<did>/<rkey>/edit`) is a single-page
  // form like `/create` — no tab strip, no back row; the form's own
  // Cancel button is the way out. Same exclusion logic as `/project/new`.
  const isOnCertDetail =
    (pathname?.startsWith("/activity/") ?? false) &&
    !(pathname?.endsWith("/edit") ?? false);
  // `/project/new` is the create form, not a record detail page —
  // the second-row tabs (Description / Certs / Updates) only make
  // sense for an existing project. `/project/<did>/<rkey>/edit` is
  // the editor (mirrors /project/new) — same reasoning, no tab row.
  const isOnProjectDetail =
    (pathname?.startsWith("/project/") ?? false) &&
    pathname !== "/project/new" &&
    !(pathname?.endsWith("/edit") ?? false);
  const isOnExplore = pathname === "/explore";
  // Create flows (`/create`, `/project/new`) are single-page forms with
  // no tab strip, but they still get a row-2 Back affordance so the
  // navigation rhythm matches detail pages. The form's own Cancel button
  // stays the primary "discard" action.
  const isOnCreatePage = pathname === "/create" || pathname === "/project/new";
  const showBackRow = isOnCertDetail || isOnProjectDetail || isOnCreatePage;
  // Settings is its own standalone surface now (reachable from the
  // site drawer); no tab strip there.
  const showTabsRow = isOnProfile || isOnExplore;
  // Compare the URL handle slug to the signed-in user's handle to decide
  // whether to show own-only tabs (e.g. Settings). Activeorg switches the
  // "you" identity to the org, so we compare against `identity.handle`.
  const profileHandleFromUrl = useMemo(() => {
    if (!isOnProfile || !pathname) return null;
    const slug = pathname.split("/")[2];
    if (!slug) return null;
    try {
      return decodeURIComponent(slug);
    } catch {
      return slug;
    }
  }, [isOnProfile, pathname]);
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

  // Active /explore kind — reads ?kind= with the same migration shim
  // <Explore> uses (users / profiles legacy → accounts; certs → activities).
  // Drives the explore tab strip's selected state.
  const exploreKind = useMemo(() => {
    const raw = searchParams?.get("kind") ?? null;
    return raw === "accounts" || raw === "projects" || raw === "activities"
      ? raw
      : raw === "users" || raw === "profiles"
        ? "accounts"
        : raw === "certs"
          ? "activities"
          : "activities";
  }, [searchParams]);

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
    setSwitcherOpen(false);
  }, [pathname]);

  // ----- Create-menu effects (mirror the switcher) -----
  useEffect(() => {
    if (!createOpen || !createRef.current) {
      setCreateAnchor(null);
      return;
    }
    const compute = () => {
      const rect = createRef.current?.getBoundingClientRect();
      if (!rect) return;
      // Anchor the menu's LEFT edge to the trigger's left edge so it
      // opens to the right of the "+" button (no chance of running off
      // the viewport's left side when the button sits near the chrome's
      // right edge — same affordance as GitHub's "+" menu).
      setCreateAnchor({
        left: rect.left,
        top: rect.bottom + 8,
      });
    };
    compute();
    globalThis.addEventListener("resize", compute);
    globalThis.addEventListener("scroll", compute, true);
    return () => {
      globalThis.removeEventListener("resize", compute);
      globalThis.removeEventListener("scroll", compute, true);
    };
  }, [createOpen]);

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
    setCreateOpen(false);
  }, [pathname]);

  if (isLoading) return null;

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
          <button
            type="button"
            className="desktop-top-bar__menu"
            aria-label="Open site navigation"
            aria-expanded={drawerOpen}
            onClick={() => setDrawerOpen(true)}
          >
            <Menu size={18} strokeWidth={1.75} aria-hidden />
          </button>
          <Link
            href={brandHref}
            className={`desktop-top-bar__brand${breadcrumb || pageTitle ? "" : " desktop-top-bar__brand--wordmark"}`}
            aria-label={brandAriaLabel}
          >
            {breadcrumb || pageTitle ? (
              <Brandmark size={28} className="desktop-top-bar__brand-mark" />
            ) : (
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
          ) : pageTitle ? (
            <h1 className="desktop-top-bar__title" aria-live="polite">{pageTitle}</h1>
          ) : null}
        </div>

        <div className="desktop-top-bar__right">
          <div className="desktop-top-bar__search">
            <GlobalSearch placeholder="Search Certified" />
          </div>

          {isAuthenticated ? (
            <div
              ref={createRef}
              className="desktop-top-bar__create-wrap"
            >
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setCreateOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={createOpen}
                aria-label="Create new"
                title="Create new"
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
            >
              <Home size={20} strokeWidth={1.5} aria-hidden />
              <span className="desktop-top-bar__icon-label">Home</span>
            </Link>
          ) : null}

          <Link
            href="/explore"
            className="desktop-top-bar__icon-btn"
            aria-label="Explore"
          >
            <Compass size={20} strokeWidth={1.5} aria-hidden />
            <span className="desktop-top-bar__icon-label">Explore</span>
          </Link>

          <Link
            href="/apps"
            className="desktop-top-bar__icon-btn"
            aria-label="Apps"
          >
            <LayoutGrid size={20} strokeWidth={1.5} aria-hidden />
            <span className="desktop-top-bar__icon-label">Apps</span>
          </Link>

          {isAuthenticated ? (
            <Link
              href={profileHref}
              className="desktop-top-bar__icon-btn"
              aria-label="My profile"
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
            >
              <Settings size={20} strokeWidth={1.5} aria-hidden />
              <span className="desktop-top-bar__icon-label">Settings</span>
            </Link>
          ) : null}

          {isAuthenticated ? (
            <div className="desktop-top-bar__switcher-wrap">
              <Popover open={switcherOpen} onOpenChange={setSwitcherOpen}>
                <PopoverTrigger>
                  <button
                    type="button"
                    className="desktop-top-bar__switcher"
                    aria-label={`Switch account (currently ${identity.name || "anonymous"})`}
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
            <button
              type="button"
              onClick={openSignIn}
              className="desktop-top-bar__signin-btn"
              aria-label="Sign in"
            >
              <img
                src="/brand/signin/certified_signin_black.svg"
                alt=""
                aria-hidden
                className="desktop-top-bar__signin-img"
              />
            </button>
          )}
        </div>
      </div>

      {isOnExplore ? (
        <div className="desktop-top-bar__row desktop-top-bar__row--tabs">
          {/* Explore kind strip — canonical <Tabs> (underline). The row
              wrapper owns the bottom border, so TabList drops its own
              (border-0). onChange replaces ?kind= in place with
              scroll:false to match the on-page kind switcher (which resets
              filter/sub/q/sort/view/attrs). */}
          <Tabs
            value={exploreKind}
            onChange={(next) => {
              const params = new URLSearchParams();
              params.set("kind", next);
              router.replace(`/explore?${params.toString()}`, { scroll: false });
            }}
          >
            <TabList aria-label="Explore sections" className="border-0">
              {EXPLORE_TABS.map((t) => (
                <Tab key={t.key} value={t.key}>
                  {t.label}
                </Tab>
              ))}
            </TabList>
          </Tabs>
        </div>
      ) : showTabsRow ? (
        <div className="desktop-top-bar__row desktop-top-bar__row--tabs">
          {/* Profile ?tab= strip — canonical <Tabs> (underline). onChange
              pushes the ?tab= URL (scroll:false) so the page mirrors it,
              matching the prior <Link scroll={false}> default-push. */}
          <Tabs
            value={activeTab}
            onChange={(next) => {
              const tab = visibleProfileTabs.find((t) => t.key === next);
              if (tab) router.push(tabHref(tab), { scroll: false });
            }}
          >
            <TabList aria-label="Profile sections" className="border-0">
              {visibleProfileTabs.map((tab) => (
                <Tab key={tab.key} value={tab.key}>
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
            onClick={() => router.back()}
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
              // Detail strip — canonical <Tabs> (underline). onChange
              // REPLACES (not pushes) so switching tabs on the same cert /
              // project doesn't pollute history; scroll:false keeps the
              // scroll position. The row wrapper owns the bottom border.
              <Tabs
                value={activeDetailTab}
                onChange={(next) => {
                  const t = detailTabs.find((tab) => tab.key === next)
                  if (t) router.replace(hrefFor(t), { scroll: false })
                }}
              >
                <TabList
                  aria-label={isOnCertDetail ? "Activity sections" : "Project sections"}
                  className="border-0"
                >
                  {detailTabs.map((t) => (
                    <Tab key={t.key} value={t.key}>
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
