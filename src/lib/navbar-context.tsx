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
interface NavbarContextValue {
  pageTitle: string | null;
  setPageTitle: (title: string | null) => void;
  profileOverlay: boolean;
  setProfileOverlay: (v: boolean) => void;
}

const NavbarContext = createContext<NavbarContextValue>({
  pageTitle: null,
  setPageTitle: () => {},
  profileOverlay: false,
  setProfileOverlay: () => {},
});

export function NavbarProvider({ children }: { children: ReactNode }) {
  const [pageTitle, setPageTitle] = useState<string | null>(null);
  const [profileOverlay, setProfileOverlay] = useState<boolean>(false);
  const value = useMemo(() => ({ pageTitle, setPageTitle, profileOverlay, setProfileOverlay }), [pageTitle, profileOverlay]);
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
export function useProfileNavbar() {
  const { setProfileOverlay } = useContext(NavbarContext);
  useEffect(() => {
    setProfileOverlay(true);
    return () => setProfileOverlay(false);
  }, [setProfileOverlay]);
}
