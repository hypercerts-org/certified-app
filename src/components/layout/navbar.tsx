"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/auth-context";
import { useNavbarContext } from "@/lib/navbar-context";
import { useViewTransition } from "@/lib/view-transitions";
import { useProfile } from "@/hooks/use-profile";
import { useSession } from "@/hooks/use-session";
import Avatar from "@/components/ui/avatar";
import Button from "@/components/ui/button";
import { getInitials } from "@/lib/utils/initials";
import { useOrg } from "@/lib/groups/org-context";
import { routeForActorSwitch } from "@/lib/groups/navigation";
import { useOrgProfile } from "@/hooks/use-org-profile";
import { useScrollHideNavbar } from "@/hooks/use-scroll-hide-navbar";
import { Menu, X, ChevronDown, ArrowLeft } from "lucide-react";
import MobileSidebar from "./mobile-sidebar";
import AccountSwitcherList from "./account-switcher-list";
import Brandmark from "@/components/ui/brandmark";
import BottomSheet from "@/components/ui/bottom-sheet";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import Tooltip from "@/components/ui/tooltip";
import AddToListMenu from "@/components/lists/add-to-list-menu";
import type { TypedListType } from "@/lib/atproto/typed-lists";
import { useLayoutBreakpoints } from "@/hooks/use-layout-breakpoints";

const ROLE_ORDER: Record<string, number> = { owner: 0, admin: 1, member: 2 };

// Top-level destinations. These set a centered page title but are NOT
// sub-pages, so the mobile top bar shows the hamburger (which opens the
// left sidebar) + account switcher / sign-in instead of a back arrow.
// Anything not listed here that sets a title (detail routes, settings
// sub-pages, someone else's profile, breadcrumbs) keeps the back arrow.
// Exact-match only, so e.g. /settings shows the menu but /settings/edit
// shows a back arrow.
const ROOT_PATHS = new Set<string>([
  "/home",
  "/explore",
  "/apps",
  "/profile",
  "/settings",
  "/groups",
  "/endorsements",
  "/help",
]);


const Navbar: React.FC = () => {
  const { isLoading, isAuthenticated, did, openSignIn, signOut } = useAuth();
  const { pageTitle, breadcrumb, recordMenu, profileOverlay } =
    useNavbarContext();
  const { profile, avatarUrl } = useProfile();
  const { handle } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const { transitionBack } = useViewTransition();
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

  // Close account switcher on outside click. The desktop inline menu now
  // lives in a portal <Popover> (which owns its own click-outside), so at
  // ≥800px this is redundant; below 800px the <BottomSheet> portals its
  // content (and backdrop) to document.body — outside `switcherRef` — so we
  // skip mousedowns landing inside the sheet and let the sheet own its own
  // dismissal (backdrop tap / Esc / drag). Kept as a harmless guard for the
  // trigger so the mobile switcher state can't get stuck open.
  useEffect(() => {
    if (!switcherOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      const inDesktop = switcherRef.current?.contains(target);
      const inSheet =
        target instanceof Element &&
        target.closest(".bottom-sheet, .bottom-sheet__backdrop") !== null;
      if (!inDesktop && !inSheet) {
        setSwitcherOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [switcherOpen]);

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
  // In-app navigation depth. We patch history.pushState (which Next's
  // router calls for every forward navigation, INCLUDING query-only tab
  // navigations like `?tab=description`) to increment, and popstate to
  // decrement. router.replace uses replaceState, so it isn't counted —
  // the did→handle URL canonicalization can't inflate the count. When
  // the counter is 0 the back stack would exit the app, so handleBack
  // pushes `/` instead.
  const inAppDepthRef = useRef(0);
  useEffect(() => {
    const origPushState = history.pushState.bind(history);
    history.pushState = (...args: Parameters<typeof origPushState>) => {
      inAppDepthRef.current += 1;
      return origPushState(...args);
    };
    const onPop = () => {
      inAppDepthRef.current = Math.max(0, inAppDepthRef.current - 1);
    };
    window.addEventListener("popstate", onPop);
    return () => {
      history.pushState = origPushState;
      window.removeEventListener("popstate", onPop);
    };
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
    // Reverse slide for the back gesture (see ViewTransitionProvider).
    transitionBack(() => {
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
    });
  };

  // Top-level destinations show the hamburger + account switcher / sign-in
  // even though they also set a centered page title; sub-pages keep the
  // back arrow. Breadcrumbs are always sub-pages. Without this, every
  // titled page replaced the hamburger with a back arrow, leaving the
  // mobile left sidebar unreachable and hiding the sign-in button.
  const isRootLevel = !breadcrumb && ROOT_PATHS.has(pathname);

  // Left control for the default + root-level layouts: the hamburger
  // (opens the mobile sidebar) for signed-in AND signed-out viewers.
  // Signed-out viewers get a slimmed-down sidebar (Explore / Apps /
  // Help) so the app is still navigable before signing in; the theme
  // toggle lives inside the sidebar in both states. No Tooltip — this
  // bar only renders <800px, where a tap surfaces the tooltip bubble
  // as a stray tag instead of hover help.
  const leftControl = (
    <button
      className="navbar__hamburger"
      onClick={() => { setDropdownOpen(!dropdownOpen); setSwitcherOpen(false); }}
      aria-label={dropdownOpen ? "Close menu" : "Open menu"}
      aria-haspopup="menu"
      aria-expanded={dropdownOpen}
    >
      {dropdownOpen ? <X size={22} /> : <Menu size={22} />}
    </button>
  );

  // Right cluster for the default + root-level layouts: account switcher
  // (signed in) or the sign-in button (signed out), plus the portaled
  // bottom sheet + sidebar those controls drive.
  const accountCluster = isAuthenticated ? (
    <>
      <div className="account-switcher" ref={switcherRef}>
        {isDesktop ? (
          <Popover open={switcherOpen} onOpenChange={setSwitcherOpen}>
            <PopoverTrigger>
              <button
                className="account-switcher__trigger"
                onClick={() => { setDropdownOpen(false); }}
                aria-label="Switch account"
              >
                <Avatar size="sm" src={displayAvatarUrl} fallbackInitials={avatarInitials} />
                <ChevronDown size={14} className="navbar__chevron-desktop" />
              </button>
            </PopoverTrigger>
            <PopoverContent
              portal
              side="bottom"
              align="end"
              minWidth={260}
              className="max-h-[70vh] overflow-y-auto [scrollbar-gutter:stable]"
            >
              <AccountSwitcherList
                session={{ handle }}
                profile={profile}
                avatarUrl={avatarUrl || undefined}
                sortedOrgs={sortedOrgs}
                activeOrg={activeOrg}
                switchOrg={switchOrg}
                onAfterSwitch={(next) => {
                  setSwitcherOpen(false);
                  router.push(routeForActorSwitch(pathname, next));
                }}
                onSignOut={signOut}
                onSwitchAccount={() => {
                  setSwitcherOpen(false);
                  openSignIn();
                }}
              />
            </PopoverContent>
          </Popover>
        ) : (
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
        )}
      </div>

      {/* Mobile bottom sheet for account switcher — the canonical
          BottomSheet primitive owns the portal shell, backdrop,
          drag-to-dismiss, Esc, focus trap and scroll lock. */}
      <BottomSheet
        open={switcherOpen}
        onClose={() => setSwitcherOpen(false)}
        ariaLabel="Switch account"
      >
        <AccountSwitcherList
          session={{ handle }}
          profile={profile}
          avatarUrl={avatarUrl || undefined}
          sortedOrgs={sortedOrgs}
          activeOrg={activeOrg}
          switchOrg={switchOrg}
          onAfterSwitch={(next) => {
            setSwitcherOpen(false);
            router.push(routeForActorSwitch(pathname, next));
          }}
          onSignOut={signOut}
          onSwitchAccount={() => {
            setSwitcherOpen(false);
            openSignIn();
          }}
        />
      </BottomSheet>
    </>
  ) : (
    // Quiet outline button rather than the filled black sign-in lockup —
    // a second solid-black element reads heavy next to the (black)
    // brandmark in the bar's center slot.
    <Button variant="secondary" size="sm" onClick={openSignIn}>
      Sign in
    </Button>
  );

  const rightCluster = (
    <>
      {accountCluster}
      {/* Mobile sidebar (hamburger menu) — mounted for signed-in and
          signed-out viewers alike, since the hamburger is the left
          control in both states. The early-return at the top of this
          component already guarantees we're on mobile here. */}
      <MobileSidebar isOpen={dropdownOpen} onClose={() => setDropdownOpen(false)} />
    </>
  );

  // Profile overlay layout: transparent background, back arrow only (no
  // brandmark, no account switcher). Floats over a full-bleed page like
  // the profile banner. Set via useProfileNavbar().
  if (profileOverlay) {
    return (
      <nav className={navClasses} aria-label="Profile navigation">
        <div className="navbar__inner">
          <div className="navbar__left">
            <Tooltip label="Go back">
              <button
                type="button"
                className="navbar__back-overlay"
                onClick={handleBack}
                aria-label="Go back"
              >
                <ArrowLeft size={20} />
              </button>
            </Tooltip>
          </div>
          <div />
          <div />
        </div>
      </nav>
    );
  }

  // Titled page layout: back button on the left, title in the center, empty right.
  // Used by any page that calls usePageTitle(...) or usePageTitleBreadcrumb(...).
  if (pageTitle || breadcrumb) {
    const ariaLabel = breadcrumb
      ? breadcrumb.right
        ? `${breadcrumb.left.text} / ${breadcrumb.right.text}`
        : breadcrumb.left.text
      : pageTitle!;
    return (
      <nav className={navClasses} aria-label={ariaLabel}>
        <div className="navbar__inner">
          <div className="navbar__left">
            {isRootLevel ? (
              leftControl
            ) : (
              <Tooltip label="Go back">
                <button
                  type="button"
                  className="navbar__hamburger"
                  onClick={handleBack}
                  aria-label="Go back"
                >
                  <ArrowLeft size={22} />
                </button>
              </Tooltip>
            )}
          </div>
          <div className="navbar__title">
            {breadcrumb ? (
              <>
                <Link href={breadcrumb.left.href} className="navbar__title-part">
                  {breadcrumb.left.text}
                </Link>
                {breadcrumb.right ? (
                  <>
                    <span className="navbar__title-sep" aria-hidden="true"> / </span>
                    <Link href={breadcrumb.right.href} className="navbar__title-part">
                      {breadcrumb.right.text}
                    </Link>
                  </>
                ) : null}
              </>
            ) : (
              pageTitle
            )}
          </div>
          <div className="navbar__right">
            {isRootLevel ? (
              rightCluster
            ) : recordMenu ? (
              <span className="navbar__action">
                <AddToListMenu
                  targetUri={recordMenu.targetUri}
                  targetCid={recordMenu.targetCid}
                  targetType={recordMenu.targetType as TypedListType}
                  shareTab={recordMenu.shareTab}
                />
              </span>
            ) : null}
          </div>
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
        <div className="navbar__left">{leftControl}</div>

        {/* Center: brandmark — links to /home for signed-in viewers and
            straight to /welcome once we know the viewer is signed out.
            While auth is still resolving we keep /home; its own guard
            redirects an unauthenticated viewer to /welcome, so the worst
            case is a one-tick bounce rather than stranding a signed-in
            viewer on the marketing page during the loading flash. */}
        <Link href={!isLoading && !isAuthenticated ? "/welcome" : "/home"} className="navbar__logo">
          <Brandmark className="navbar__logo-img" title="Certified" />
        </Link>

        {/* Right: profile switcher or sign in */}
        <div className="navbar__right">{rightCluster}</div>
      </div>
    </nav>
  );
};

export default Navbar;
