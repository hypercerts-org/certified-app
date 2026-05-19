"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ChevronDown, LayoutGrid, Settings, LogIn } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { useNavbarContext } from "@/lib/navbar-context";
import { useProfile } from "@/hooks/use-profile";
import { useSession } from "@/hooks/use-session";
import { useOrg } from "@/lib/groups/org-context";
import { useOrgProfile } from "@/hooks/use-org-profile";
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
  { key: "about", label: "About", aboutOnly: true },
  // Settings is now a real `?tab=settings` panel on the profile page —
  // no special `href` shortcut. The `/settings` route still works as a
  // standalone deep-link target (and `isOnSettings` below keeps the
  // top-bar tab strip rendering for it).
  { key: "settings", label: "Settings", ownOnly: true },
];

/** Tabs for the cert-detail back-row strip. Mirrors the routing
 *  contract that `<ActivityDetail>` reads via `?tab=`. Keep keys in
 *  sync with the switch in that component. */
const CERT_DETAIL_TABS: { key: string; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "description", label: "Description" },
  { key: "contributors", label: "Contributors" },
];

/** Project detail page subtabs. Same `?tab=` URL contract as the
 *  cert detail above — `<ProjectDetail>` reads it and switches
 *  content. "overview" is the implicit default (no param). */
const PROJECT_DETAIL_TABS: { key: string; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "description", label: "Description" },
  { key: "certs", label: "Certs" },
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
  // The tab strip also renders on /settings since "Settings" is an
  // own-profile tab — visiting /settings means the user is in their
  // own-profile context.
  const isOnSettings =
    pathname === "/settings" || (pathname?.startsWith("/settings/") ?? false);
  // Cert / project detail pages get a thin row-2 with just a back
  // affordance so the navigation rhythm stays consistent across the app.
  const isOnCertDetail = pathname?.startsWith("/activity/") ?? false;
  const isOnProjectDetail = pathname?.startsWith("/project/") ?? false;
  const showBackRow = isOnCertDetail || isOnProjectDetail;
  const showTabsRow = isOnProfile || isOnSettings;
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
  // /settings is always an own-profile context, so own-only tabs render
  // even though the pathname isn't /profile/<handle>.
  const showOwnOnlyTabs = isOnOwnProfile || isOnSettings;
  const visibleProfileTabs = useMemo(
    () =>
      PROFILE_TABS.filter((t) => {
        if (t.ownOnly && !showOwnOnlyTabs) return false
        if (t.aboutOnly && !profileAboutAvailable) return false
        if (t.groupsOnly && !profileGroupsAvailable) return false
        return true
      }),
    [showOwnOnlyTabs, profileAboutAvailable, profileGroupsAvailable],
  );
  const activeTab = useMemo(() => {
    if (isOnSettings) return "settings";
    const v = searchParams?.get("tab");
    if (v && visibleProfileTabs.some((t) => t.key === v)) return v;
    return "overview";
  }, [searchParams, visibleProfileTabs, isOnSettings]);

  // Switcher dropdown — portaled to <body> so it escapes the bar's
  // overflow/transform context. Anchor recomputed on resize/scroll.
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const switcherRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

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

  if (isLoading) return null;

  const tabHref = (tab: ProfileTab) => {
    if (tab.href) return tab.href;
    // From /settings, the other tabs need to point at the signed-in
    // user's own profile (you're in own-profile context but the URL
    // isn't /profile/<handle>).
    if (isOnSettings && identity.handle) {
      const base = `/profile/${encodeURIComponent(identity.handle)}`;
      return tab.key === "overview" ? base : `${base}?tab=${tab.key}`;
    }
    if (!pathname) return "#";
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    if (tab.key === "overview") params.delete("tab");
    else params.set("tab", tab.key);
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  };

  // Brandmark navigates to the active identity's profile overview
  // when the user is signed in (falls through to the home page for
  // signed-out visitors). When acting as a group, `identity.handle`
  // is the group's handle, so the brandmark takes the user to the
  // group's profile rather than their personal one — matches the
  // mental model of "go home for this account".
  const brandHref = identity.handle
    ? `/profile/${encodeURIComponent(identity.handle)}`
    : "/"
  const brandAriaLabel = identity.handle
    ? `Go to ${identity.name || identity.handle}'s profile`
    : "Certified home"

  return (
    <header className="desktop-top-bar" aria-label="App chrome">
      <div className="desktop-top-bar__row desktop-top-bar__row--chrome">
        <div className="desktop-top-bar__left">
          <Link
            href={brandHref}
            className="desktop-top-bar__brand"
            aria-label={brandAriaLabel}
          >
            <Brandmark size={28} className="desktop-top-bar__brand-mark" />
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
              // Target the ACTIVE identity's settings — personal when
              // signed in as the user, the group's when acting-as
              // group. The cog and the in-page tab strip end up on
              // the same surface as a result. Falls back to /settings
              // for the rare case where no handle has resolved yet.
              href={
                identity.handle
                  ? `/profile/${encodeURIComponent(identity.handle)}?tab=settings`
                  : "/settings"
              }
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
            >
              <LogIn size={16} strokeWidth={1.75} aria-hidden />
              Sign in
            </button>
          )}
        </div>
      </div>

      {showTabsRow ? (
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
                const params = new URLSearchParams(
                  searchParams?.toString() ?? "",
                )
                if (t.key === "overview") params.delete("tab")
                else params.set("tab", t.key)
                const qs = params.toString()
                const href = qs ? `${pathname}?${qs}` : pathname
                const currentTab = searchParams?.get("tab") ?? "overview"
                const isActive = currentTab === t.key
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
