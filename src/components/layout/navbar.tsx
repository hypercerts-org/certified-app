"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/auth-context";
import { useNavbarContext } from "@/lib/navbar-context";
import { useProfile } from "@/hooks/use-profile";
import { useSession } from "@/hooks/use-session";
import Avatar from "@/components/ui/avatar";
import { getInitials } from "@/lib/utils/initials";
import { useOrg } from "@/lib/groups/org-context";
import { resolvePostSwitchPath } from "@/lib/groups/navigation";
import { useOrgProfile } from "@/hooks/use-org-profile";
import { useScrollHideNavbar } from "@/hooks/use-scroll-hide-navbar";
import { useBodyScrollLock } from "@/hooks/use-body-scroll-lock";
import { Menu, X, ChevronDown, ArrowLeft } from "lucide-react";
import MobileSidebar from "./mobile-sidebar";
import AccountSwitcherList from "./account-switcher-list";
import Brandmark from "@/components/ui/brandmark";
import ThemeToggle from "@/components/ui/theme-toggle";
import { useLayoutBreakpoints } from "@/lib/hooks/use-layout-breakpoints";

const ROLE_ORDER: Record<string, number> = { owner: 0, admin: 1, member: 2 };

const Navbar: React.FC = () => {
  const { isLoading, isAuthenticated, did, openSignIn, signOut } = useAuth();
  const { pageTitle, profileOverlay } = useNavbarContext();
  const { profile, avatarUrl } = useProfile();
  const { handle } = useSession();
  const pathname = usePathname();
  const router = useRouter();
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
  const switcherRef = useRef<HTMLDivElement>(null);
  const mobileSwitcherRef = useRef<HTMLDivElement>(null);
  const { scrolled, navHidden } = useScrollHideNavbar();
  const { isDesktop } = useLayoutBreakpoints();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);

  // Close dropdowns on navigation
  useEffect(() => {
    setDropdownOpen(false);
    setSwitcherOpen(false);
  }, [pathname]);

  // Clear sidebar / sheet state when crossing the mobile↔desktop boundary
  // (the hamburger button and mobile sidebar unmount at ≥800px; leftover
  // `dropdownOpen` would re-open the drawer on resize back down).
  useEffect(() => {
    setDropdownOpen(false);
    setSwitcherOpen(false);
  }, [isDesktop]);

  // Bottom sheet drag handle + expand/collapse/dismiss
  const sheetRef = useRef<HTMLDivElement>(null);
  const [sheetExpanded, setSheetExpanded] = useState(false);
  const dragStartY = useRef(0);
  const isDragging = useRef(false);

  // Close account switcher on outside click
  useEffect(() => {
    if (!switcherOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      const inDesktop = switcherRef.current?.contains(target);
      const inMobile = mobileSwitcherRef.current?.contains(target);
      const inSheet = sheetRef.current?.contains(target);
      const inBackdrop = (target as Element).classList?.contains("bottom-sheet__backdrop");
      if (!inDesktop && !inMobile && !inSheet && !inBackdrop) {
        setSwitcherOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [switcherOpen]);

  // Lock body scroll when bottom sheet is open. The early-return below
  // unmounts the entire navbar on desktop, so isDesktop is always false
  // when this is reached — but keep the explicit guard so the hook still
  // does the right thing during the resize-crossover render.
  useBodyScrollLock(switcherOpen && !isDesktop);

  // Reset expanded state when sheet closes
  useEffect(() => {
    if (!switcherOpen) setSheetExpanded(false);
  }, [switcherOpen]);

  const onHandleTouchStart = useCallback((e: React.TouchEvent) => {
    dragStartY.current = e.touches[0].clientY;
    isDragging.current = true;
    if (sheetRef.current) {
      sheetRef.current.style.transition = "none";
    }
  }, []);

  const onHandleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging.current || !sheetRef.current) return;
    e.preventDefault();
    const dy = e.touches[0].clientY - dragStartY.current;
    // Dragging down: translate sheet down (only positive values)
    // Dragging up: no transform needed, we'll expand on release
    if (dy > 0) {
      sheetRef.current.style.transform = `translateY(${dy}px)`;
    }
  }, []);

  const onHandleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!isDragging.current || !sheetRef.current) return;
    isDragging.current = false;
    const dy = e.changedTouches[0].clientY - dragStartY.current;
    sheetRef.current.style.transition = "transform 0.3s ease-out, max-height 0.3s ease-out";
    sheetRef.current.style.transform = "translateY(0)";

    if (dy > 80) {
      // Swiped down far enough — dismiss
      sheetRef.current.style.transform = "translateY(100%)";
      setTimeout(() => setSwitcherOpen(false), 250);
    } else if (dy < -40) {
      // Swiped up — expand to full height
      setSheetExpanded(true);
    } else if (dy > 20 && sheetExpanded) {
      // Small swipe down while expanded — collapse back
      setSheetExpanded(false);
    }
  }, [sheetExpanded]);

  // Derive display state from org context (avatar is the only display
  // field the navbar actually uses — nav links, display name and
  // "active page" markers were removed in the titled-navbar refactor).
  const avatarInitials = activeOrg
    ? (activeOrg.displayName || activeOrg.handle || "O").slice(0, 2).toUpperCase()
    : getInitials(profile?.displayName, did);
  const displayAvatarUrl = activeOrg ? (orgAvatarUrl || undefined) : (avatarUrl || undefined);

  // In-app navigation depth counter. The navbar is mounted once in the
  // root layout and persists across route changes, so refs survive
  // pathname updates. We count "how many internal navigations happened
  // since the user first loaded the app" — not `window.history.length`,
  // which also includes pages the user visited BEFORE landing on ours
  // and would send them back out of the app.
  //
  //   - First render (landing pathname):      counter = 0
  //   - Each in-app Link click / push:        counter++
  //   - Each popstate (back / forward):       counter-- (clamped at 0)
  //
  // `handleBack` uses `router.back()` only when counter > 0. When it's
  // 0, we push `/` — because the back stack would otherwise take the
  // user to an external URL.
  //
  // NOTE: these hooks MUST sit above `if (isLoading) return null` so the
  // hook count is stable across renders (rules of hooks).
  const inAppDepthRef = useRef(0);
  const initializedRef = useRef(false);
  const skipNextPathnameRef = useRef(false);

  useEffect(() => {
    if (!initializedRef.current) {
      initializedRef.current = true;
      return;
    }
    if (skipNextPathnameRef.current) {
      skipNextPathnameRef.current = false;
      return;
    }
    inAppDepthRef.current += 1;
  }, [pathname]);

  useEffect(() => {
    const onPop = () => {
      // A browser back/forward fires popstate. The subsequent pathname
      // effect shouldn't count this as a "new" navigation — mark it to
      // skip — and drop the depth counter by one.
      skipNextPathnameRef.current = true;
      inAppDepthRef.current = Math.max(0, inAppDepthRef.current - 1);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Don't render navbar while auth is loading — prevents white flash.
  // Also hide on desktop — the left rail hosts the brandmark there.
  // Both early returns sit AFTER every hook so the rules-of-hooks
  // contract (always-same call order) is preserved.
  if (isLoading) return null;
  if (isDesktop) return null;

  const navClasses = [
    "navbar",
    profileOverlay ? "navbar--profile-overlay" : "navbar--default",
    scrolled ? "navbar--scrolled" : "",
    navHidden && !dropdownOpen && !switcherOpen ? "navbar--hidden" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const handleBack = () => {
    if (inAppDepthRef.current > 0) {
      // We have in-app history — safe to pop. The popstate listener
      // above will decrement the counter.
      router.back();
    } else {
      // The user entered our app on this page (direct link, external
      // referrer, or page refresh). `router.back()` would take them
      // outside the app — push home instead.
      router.push("/");
    }
  };

  // Profile overlay layout: transparent background, back arrow only (no
  // brandmark, no account switcher). Floats over a full-bleed page like
  // the profile banner. Set via useProfileNavbar().
  if (profileOverlay) {
    return (
      <nav className={navClasses} aria-label="Profile navigation">
        <div className="navbar__inner">
          <div className="navbar__left">
            <button
              type="button"
              className="navbar__back-overlay"
              onClick={handleBack}
              aria-label="Go back"
            >
              <ArrowLeft size={20} />
            </button>
          </div>
          <div />
          <div />
        </div>
      </nav>
    );
  }

  // Titled page layout: back button on the left, title in the center, empty right.
  // Used by any page that calls usePageTitle(...).
  if (pageTitle) {
    return (
      <nav className={navClasses} aria-label={pageTitle}>
        <div className="navbar__inner">
          <div className="navbar__left">
            <button
              type="button"
              className="navbar__hamburger"
              onClick={handleBack}
              aria-label="Go back"
            >
              <ArrowLeft size={22} />
            </button>
          </div>
          <div className="navbar__title" role="heading" aria-level={1}>
            {pageTitle}
          </div>
          <div className="navbar__right" />
        </div>
      </nav>
    );
  }

  return (
    <nav className={navClasses}>
      <div className="navbar__inner">
        {/* Left: hamburger menu (mobile only — the early-return above already
            short-circuited the desktop case, so isDesktop is implicitly false
            for everything below). */}
        <div className="navbar__left">
          {isAuthenticated ? (
            <button
              className="navbar__hamburger"
              onClick={() => { setDropdownOpen(!dropdownOpen); setSwitcherOpen(false); }}
              aria-label={dropdownOpen ? "Close menu" : "Open menu"}
              aria-haspopup="menu"
              aria-expanded={dropdownOpen}
            >
              {dropdownOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
          ) : (
            <ThemeToggle variant="cycle" />
          )}
        </div>

        {/* Center: brandmark */}
        <Link href="/" className="navbar__logo">
          <Brandmark className="navbar__logo-img" title="Certified" />
        </Link>

        {/* Right: profile switcher or sign in */}
        <div className="navbar__right">
        {isAuthenticated ? (
          <>
            {/* Account switcher — hidden at desktop widths; left rail
                hosts its own trigger (see desktop-left-rail.tsx). */}
            <div className="account-switcher" ref={switcherRef}>
              <button
                className="account-switcher__trigger"
                onClick={() => { setSwitcherOpen(!switcherOpen); setDropdownOpen(false); }}
                aria-label="Switch account"
                aria-haspopup="menu"
                aria-expanded={switcherOpen}
              >
                <Avatar size="sm" src={displayAvatarUrl} fallbackInitials={avatarInitials} />
                <ChevronDown size={14} className="navbar__chevron-desktop" />
              </button>
                {switcherOpen && (
                  <div className="account-switcher__menu" role="menu">
                    <AccountSwitcherList
                      session={{ handle }}
                      profile={profile}
                      avatarUrl={avatarUrl || undefined}
                      sortedOrgs={sortedOrgs}
                      activeOrg={activeOrg}
                      switchOrg={switchOrg}
                      onAfterSwitch={(next) => {
                        setSwitcherOpen(false);
                        router.push(resolvePostSwitchPath(next));
                      }}
                      onSignOut={signOut}
                    />
                  </div>
                )}
              </div>

            {/* Mobile bottom sheet for account switcher */}
            {switcherOpen && createPortal(
              <>
                <div className="bottom-sheet__backdrop" onClick={() => setSwitcherOpen(false)} />
                <div
                  className={`bottom-sheet ${sheetExpanded ? "bottom-sheet--expanded" : ""}`}
                  ref={sheetRef}
                >
                  <div
                    className="bottom-sheet__handle"
                    onTouchStart={onHandleTouchStart}
                    onTouchMove={onHandleTouchMove}
                    onTouchEnd={onHandleTouchEnd}
                  />
                  <div className="bottom-sheet__content">
                    <AccountSwitcherList
                      session={{ handle }}
                      profile={profile}
                      avatarUrl={avatarUrl || undefined}
                      sortedOrgs={sortedOrgs}
                      activeOrg={activeOrg}
                      switchOrg={switchOrg}
                      onAfterSwitch={(next) => {
                        setSwitcherOpen(false);
                        router.push(resolvePostSwitchPath(next));
                      }}
                      onSignOut={signOut}
                    />
                  </div>
                </div>
              </>,
              document.body
            )}

            {/* Mobile sidebar (hamburger menu). The early-return at the top
                of this component already guarantees we're on mobile here. */}
            <MobileSidebar isOpen={dropdownOpen} onClose={() => setDropdownOpen(false)} />
          </>
        ) : (
            <button
              type="button"
              onClick={openSignIn}
              className="navbar__signin-btn"
            >
              Sign in
            </button>
        )}
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
