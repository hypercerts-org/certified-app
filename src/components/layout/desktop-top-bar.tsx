"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  ChevronDown,
  FileBadge,
  FolderKanban,
  LayoutGrid,
  Menu,
  Plus,
  Settings,
} from "lucide-react";
import SiteDrawer from "./site-drawer";
import { useAuth } from "@/lib/auth/auth-context";
import { useNavbarContext } from "@/lib/navbar-context";
import { useProfile } from "@/hooks/use-profile";
import { useSession } from "@/hooks/use-session";
import { useOrg } from "@/lib/groups/org-context";
import { useOrgProfile } from "@/hooks/use-org-profile";
import { useMounted } from "@/hooks/use-mounted";
import { resolvePostSwitchPath } from "@/lib/groups/navigation";
import Avatar from "@/components/ui/avatar";
import { getInitials } from "@/lib/utils/initials";
import AccountSwitcherList from "./account-switcher-list";
import Brandmark from "@/components/ui/brandmark";
import GlobalSearch from "@/components/search/global-search";

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
  { key: "certs", label: "Certs" },
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
  { key: "certs", label: "Certs" },
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
  { key: "certs", label: "Certs" },
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

  const isOnProfile = pathname?.startsWith("/profile/") ?? false;
  const isOnSettings =
    pathname === "/settings" || (pathname?.startsWith("/settings/") ?? false);
  // Cert / project detail pages get a thin row-2 with just a back
  // affordance so the navigation rhythm stays consistent across the app.
  const isOnCertDetail = pathname?.startsWith("/activity/") ?? false;
  const isOnProjectDetail = pathname?.startsWith("/project/") ?? false;
  const isOnExplore = pathname === "/explore";
  const showBackRow = isOnCertDetail || isOnProjectDetail;
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
    const v = searchParams?.get("tab");
    if (v && visibleProfileTabs.some((t) => t.key === v)) return v;
    return "overview";
  }, [searchParams, visibleProfileTabs]);

  // Switcher dropdown — portaled to <body> so it escapes the bar's
  // overflow/transform context. Anchor recomputed on resize/scroll.
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const switcherRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
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
    right: number;
    top: number;
  } | null>(null);

  const [anchor, setAnchor] = useState<{ right: number; top: number } | null>(null);
  useEffect(() => {
    if (!switcherOpen || !switcherRef.current) {
      setAnchor(null);
      return;
    }
    const compute = () => {
      const rect = switcherRef.current?.getBoundingClientRect();
      if (!rect) return;
      setAnchor({
        right: globalThis.innerWidth - rect.right,
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
  }, [switcherOpen]);

  useEffect(() => {
    if (!switcherOpen) return;
    const onMouseDown = (e: MouseEvent) => {
      const t = e.target;
      if (!(t instanceof Node)) return;
      const inTrigger = switcherRef.current?.contains(t) ?? false;
      const inMenu = menuRef.current?.contains(t) ?? false;
      if (!inTrigger && !inMenu) setSwitcherOpen(false);
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [switcherOpen]);

  useEffect(() => {
    if (!switcherOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      setSwitcherOpen(false);
      switcherRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [switcherOpen]);

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
      setCreateAnchor({
        right: globalThis.innerWidth - rect.right,
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

  // Brandmark always navigates to /home, regardless of auth or
  // active identity. The /home page itself handles the signed-out
  // empty state. Mirrors the navbar + left-rail brand link.
  const brandHref = "/home"
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
          {isAuthenticated ? (
            <div
              ref={createRef}
              className="desktop-top-bar__create-wrap"
            >
              <button
                type="button"
                className="desktop-top-bar__icon-btn"
                onClick={() => setCreateOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={createOpen}
                aria-label="Create new"
                title="Create new"
              >
                <Plus size={20} strokeWidth={1.75} aria-hidden />
              </button>
            </div>
          ) : null}

          <div className="desktop-top-bar__search">
            <GlobalSearch placeholder="Search Certified" />
          </div>

          <Link
            href="/apps"
            className="desktop-top-bar__icon-btn"
            aria-label="Apps"
            title="Apps"
          >
            <LayoutGrid size={20} strokeWidth={1.5} aria-hidden />
          </Link>

          {isAuthenticated ? (
            <Link
              href="/settings"
              className="desktop-top-bar__icon-btn"
              aria-label="Settings"
              title="Settings"
            >
              <Settings size={20} strokeWidth={1.5} aria-hidden />
            </Link>
          ) : null}

          {isAuthenticated ? (
            <div className="desktop-top-bar__switcher-wrap" ref={switcherRef}>
              <button
                type="button"
                className="desktop-top-bar__switcher"
                onClick={() => setSwitcherOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={switcherOpen}
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
          <nav
            className="desktop-top-bar__tabs"
            role="tablist"
            aria-label="Explore sections"
          >
            {EXPLORE_TABS.map((t) => {
              // Active kind: read ?kind= with the same migration shim
              // <Explore> uses (users / profiles legacy → accounts).
              const raw = searchParams?.get("kind") ?? null;
              const currentKind =
                raw === "accounts" || raw === "projects" || raw === "certs"
                  ? raw
                  : raw === "users" || raw === "profiles"
                  ? "accounts"
                  : "certs";
              const isActive = currentKind === t.key;
              const params = new URLSearchParams();
              // Reset other state (filter/sub/q/sort/view/attrs) when
              // switching kind — matches the on-page kind switcher.
              params.set("kind", t.key);
              const href = `/explore?${params.toString()}`;
              return (
                <Link
                  key={t.key}
                  href={href}
                  role="tab"
                  aria-selected={isActive}
                  aria-current={isActive ? "page" : undefined}
                  scroll={false}
                  replace
                  className={`desktop-top-bar__tab ${
                    isActive ? "desktop-top-bar__tab--active" : ""
                  }`}
                >
                  {t.label}
                </Link>
              );
            })}
          </nav>
        </div>
      ) : showTabsRow ? (
        <div className="desktop-top-bar__row desktop-top-bar__row--tabs">
          <nav
            className="desktop-top-bar__tabs"
            role="tablist"
            aria-label="Profile sections"
          >
            {visibleProfileTabs.map((tab) => {
              const isActive = activeTab === tab.key;
              return (
                <Link
                  key={tab.key}
                  href={tabHref(tab)}
                  role="tab"
                  aria-selected={isActive}
                  aria-current={isActive ? "page" : undefined}
                  scroll={false}
                  className={`desktop-top-bar__tab ${
                    isActive ? "desktop-top-bar__tab--active" : ""
                  }`}
                >
                  {tab.label}
                </Link>
              );
            })}
          </nav>
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
          {pathname && (isOnCertDetail || isOnProjectDetail) ? (
            <nav
              className="desktop-top-bar__tabs"
              role="tablist"
              aria-label={isOnCertDetail ? "Cert sections" : "Project sections"}
            >
              {(isOnCertDetail
                ? CERT_DETAIL_TABS
                : PROJECT_DETAIL_TABS
              ).map((t) => {
                // Two flavors: query-param tabs (overview/description/…)
                // and sub-route tabs (explore). Sub-route tabs leave
                // the same pathname behind so the user can navigate
                // back to the parent detail page with the Back button.
                let href: string
                let isActive: boolean
                const isOnSubRoute = pathname?.endsWith("/explore")
                if (t.subRoute) {
                  // Strip any trailing /<subRoute> to avoid /explore/explore.
                  const base = pathname?.replace(/\/explore$/, "") ?? ""
                  href = `${base}/${t.subRoute}`
                  isActive = !!isOnSubRoute && t.key === "explore"
                } else {
                  const params = new URLSearchParams(
                    searchParams?.toString() ?? "",
                  )
                  if (t.key === "overview") params.delete("tab")
                  else params.set("tab", t.key)
                  const qs = params.toString()
                  const base = pathname?.replace(/\/explore$/, "") ?? ""
                  href = qs ? `${base}?${qs}` : base
                  const currentTab = searchParams?.get("tab") ?? "overview"
                  isActive = !isOnSubRoute && currentTab === t.key
                }
                return (
                  <Link
                    key={t.key}
                    href={href}
                    scroll={false}
                    // Replace (not push) so switching between tabs on
                    // the same cert / project doesn't pollute browser
                    // history. The Back button then skips tab states
                    // and goes back to wherever the user came from.
                    replace
                    role="tab"
                    aria-selected={isActive}
                    className={`desktop-top-bar__tab ${
                      isActive ? "desktop-top-bar__tab--active" : ""
                    }`}
                  >
                    {t.label}
                  </Link>
                )
              })}
            </nav>
          ) : null}
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
                right: createAnchor.right,
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
                <span>New cert</span>
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

      {mounted && switcherOpen && isAuthenticated && anchor
        ? createPortal(
            <div
              ref={menuRef}
              className="account-switcher__menu account-switcher__menu--top-bar"
              role="menu"
              style={{
                position: "fixed",
                top: anchor.top,
                right: anchor.right,
                width: 300,
              }}
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
                  router.push(resolvePostSwitchPath(next));
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
            </div>,
            document.body
          )
        : null}
    </header>
  );
}
