"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, LayoutGrid, Settings, LogIn } from "lucide-react";
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
import PeopleSearch from "@/components/search/people-search";

const ROLE_ORDER: Record<string, number> = { owner: 0, admin: 1, member: 2 };

const PROFILE_TABS: { key: string; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "activities", label: "Activities" },
  { key: "endorsements", label: "Endorsements" },
  { key: "groups", label: "Groups" },
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
  const { pageTitle } = useNavbarContext();
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
  const activeTab = useMemo(() => {
    const v = searchParams?.get("tab");
    if (v && PROFILE_TABS.some((t) => t.key === v)) return v;
    return "overview";
  }, [searchParams]);

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

  const tabHref = (key: string) => {
    if (!pathname) return "#";
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    if (key === "overview") params.delete("tab");
    else params.set("tab", key);
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  };

  return (
    <header className="desktop-top-bar" aria-label="App chrome">
      <div className="desktop-top-bar__row desktop-top-bar__row--chrome">
        <div className="desktop-top-bar__left">
          <Link href="/" className="desktop-top-bar__brand" aria-label="Certified home">
            <Brandmark size={28} className="desktop-top-bar__brand-mark" />
          </Link>
          {pageTitle ? (
            <h1 className="desktop-top-bar__title" aria-live="polite">{pageTitle}</h1>
          ) : null}
        </div>

        <div className="desktop-top-bar__right">
          <div className="desktop-top-bar__search">
            <PeopleSearch placeholder="Search people" />
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

      {isOnProfile ? (
        <div className="desktop-top-bar__row desktop-top-bar__row--tabs">
          <nav
            className="desktop-top-bar__tabs"
            role="tablist"
            aria-label="Profile sections"
          >
            {PROFILE_TABS.map((tab) => {
              const isActive = activeTab === tab.key;
              return (
                <Link
                  key={tab.key}
                  href={tabHref(tab.key)}
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
              />
            </div>,
            document.body
          )
        : null}
    </header>
  );
}
