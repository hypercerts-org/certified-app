"use client";

import { createContext, useContext, useEffect, useState, useMemo, ReactNode } from "react";

/**
 * Navbar rendering modes:
 *   - "default"         — full app chrome (hamburger + brandmark + account switcher)
 *   - "titled"          — back arrow + centered page title (set via usePageTitle)
 *   - "profile-overlay" — transparent background, back arrow only (set via useProfileNavbar).
 *                         Floats over a full-bleed page (e.g. profile banner). The layout also
 *                         drops its top padding so content starts at viewport top = 0.
 *
 * Mode is derived inside Navbar: pageTitle → "titled"; profileOverlay → "profile-overlay";
 * otherwise "default". The hooks below only toggle the individual flags so multiple pages
 * can coexist without stepping on each other.
 */
export interface PageTitleBreadcrumbPart {
  text: string;
  href: string;
}

export interface PageTitleBreadcrumb {
  left: PageTitleBreadcrumbPart;
  /** When omitted, the navbar renders only `left` as a single clickable
   *  title (no separator, no second segment). */
  right?: PageTitleBreadcrumbPart;
}

interface NavbarContextValue {
  pageTitle: string | null;
  setPageTitle: (title: string | null) => void;
  breadcrumb: PageTitleBreadcrumb | null;
  setBreadcrumb: (b: PageTitleBreadcrumb | null) => void;
  profileOverlay: boolean;
  setProfileOverlay: (v: boolean) => void;
  /** True when the viewed profile has a non-empty `longDescription`.
   *  Drives whether the "About" tab is rendered in the top-bar tab
   *  strip. Set by the profile page from its org-marker state and
   *  read by `<DesktopTopBar />` while filtering PROFILE_TABS. */
  profileAboutAvailable: boolean;
  setProfileAboutAvailable: (v: boolean) => void;
  /** True when the viewed profile carries at least one public group
   *  membership OR when the viewer is looking at their own profile.
   *  Drives whether the "Groups" tab renders in the top-bar tab strip. */
  profileGroupsAvailable: boolean;
  setProfileGroupsAvailable: (v: boolean) => void;
  /** True while the viewer is inline-editing the profile. The top-bar
   *  (and mobile) tab strips lock to the editable section(s) — Overview,
   *  plus About for orgs — and disable the rest so you can't tab away to
   *  read-only sections mid-edit. Set by the profile page, read by
   *  `<DesktopTopBar />`. */
  profileEditing: boolean;
  setProfileEditing: (v: boolean) => void;
}

const NavbarContext = createContext<NavbarContextValue>({
  pageTitle: null,
  setPageTitle: () => {},
  breadcrumb: null,
  setBreadcrumb: () => {},
  profileOverlay: false,
  setProfileOverlay: () => {},
  profileAboutAvailable: false,
  setProfileAboutAvailable: () => {},
  profileGroupsAvailable: false,
  setProfileGroupsAvailable: () => {},
  profileEditing: false,
  setProfileEditing: () => {},
});

export function NavbarProvider({ children }: { children: ReactNode }) {
  const [pageTitle, setPageTitle] = useState<string | null>(null);
  const [breadcrumb, setBreadcrumb] = useState<PageTitleBreadcrumb | null>(null);
  const [profileOverlay, setProfileOverlay] = useState<boolean>(false);
  const [profileAboutAvailable, setProfileAboutAvailable] =
    useState<boolean>(false);
  const [profileGroupsAvailable, setProfileGroupsAvailable] =
    useState<boolean>(false);
  const [profileEditing, setProfileEditing] = useState<boolean>(false);
  const value = useMemo(
    () => ({
      pageTitle,
      setPageTitle,
      breadcrumb,
      setBreadcrumb,
      profileOverlay,
      setProfileOverlay,
      profileAboutAvailable,
      setProfileAboutAvailable,
      profileGroupsAvailable,
      setProfileGroupsAvailable,
      profileEditing,
      setProfileEditing,
    }),
    [
      pageTitle,
      breadcrumb,
      profileOverlay,
      profileAboutAvailable,
      profileGroupsAvailable,
      profileEditing,
    ]
  );
  return (
    <NavbarContext.Provider value={value}>
      {children}
    </NavbarContext.Provider>
  );
}

export function useNavbarContext() {
  return useContext(NavbarContext);
}

/**
 * Set the navbar title for the current page. While mounted, the navbar
 * switches to a titled layout: a back icon on the left, the title in the
 * center, and an empty right slot. The page itself should not render its
 * own `<h1>` page title since the navbar now carries it.
 *
 * Usage:
 *   export default function SettingsPage() {
 *     usePageTitle("Settings");
 *     ...
 *   }
 */
export function usePageTitle(title: string) {
  const { setPageTitle } = useContext(NavbarContext);
  useEffect(() => {
    setPageTitle(title);
    return () => setPageTitle(null);
  }, [setPageTitle, title]);
}

/**
 * Render the navbar title as a two-part breadcrumb — `[left] / [right]` — with
 * both parts as separate links (GitHub `owner / repo` pattern). Pass `null`
 * (e.g. while data is loading) to leave the breadcrumb unset; the caller
 * usually also calls `usePageTitle(...)` to supply a string fallback.
 */
export function usePageTitleBreadcrumb(b: PageTitleBreadcrumb | null) {
  const { setBreadcrumb } = useContext(NavbarContext);
  const key = b
    ? `${b.left.text}|${b.left.href}|${b.right?.text ?? ""}|${b.right?.href ?? ""}`
    : null;
  useEffect(() => {
    setBreadcrumb(b);
    return () => setBreadcrumb(null);
    // `key` captures every observable field of `b`; re-running on `b` itself
    // would fire every render the caller builds a new object literal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setBreadcrumb, key]);
}

/**
 * Switch the navbar into "profile overlay" mode for the current page:
 * transparent background, back arrow on the left only, no brandmark, no
 * account switcher. The layout also drops its top padding so the page
 * content starts at viewport top = 0, letting the navbar float directly
 * over the content (e.g. over a profile banner).
 *
 * Usage:
 *   export default function ProfilePage() {
 *     useProfileNavbar();
 *     ...
 *   }
 */
export function useProfileNavbar(enabled: boolean = true) {
  const { setProfileOverlay } = useContext(NavbarContext);
  useEffect(() => {
    if (!enabled) return;
    setProfileOverlay(true);
    return () => setProfileOverlay(false);
  }, [setProfileOverlay, enabled]);
}

/**
 * Publish to the navbar whether the currently viewed profile has a
 * non-empty `longDescription` (rich-text "About" content). The top
 * bar renders the About tab only when this is `true`. Reset to false
 * on unmount so the flag doesn't bleed into the next page.
 */
export function useProfileAboutAvailable(available: boolean) {
  const { setProfileAboutAvailable } = useContext(NavbarContext);
  useEffect(() => {
    setProfileAboutAvailable(available);
    return () => setProfileAboutAvailable(false);
  }, [setProfileAboutAvailable, available]);
}

/**
 * Publish to the navbar whether the currently viewed profile has any
 * group memberships (or is the viewer's own profile). Drives whether
 * the Groups tab renders in the top-bar tab strip.
 */
export function useProfileGroupsAvailable(available: boolean) {
  const { setProfileGroupsAvailable } = useContext(NavbarContext);
  useEffect(() => {
    setProfileGroupsAvailable(available);
    return () => setProfileGroupsAvailable(false);
  }, [setProfileGroupsAvailable, available]);
}

/**
 * Publish to the navbar whether the viewer is currently inline-editing
 * the profile. While set, the top-bar tab strip locks to the editable
 * section(s) so the viewer can't tab away to a read-only section mid-edit.
 * Reset to false on unmount so the lock doesn't bleed into the next page.
 */
export function useProfileEditing(editing: boolean) {
  const { setProfileEditing } = useContext(NavbarContext);
  useEffect(() => {
    setProfileEditing(editing);
    return () => setProfileEditing(false);
  }, [setProfileEditing, editing]);
}
