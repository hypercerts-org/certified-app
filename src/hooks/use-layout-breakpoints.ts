"use client";

import { useEffect, useState } from "react";

/**
 * Layout-mode breakpoints. Must stay in sync with the CSS tokens in
 * src/app/styles/tokens.css (--bp-gt-mobile, --bp-gt-narrow-desktop,
 * --bp-gt-desktop).
 *
 * Used to gate **mount/unmount** of a small set of components that have
 * focusable/portal content which must not exist at desktop widths for
 * accessibility (<BottomNav>, <MobileSidebar>, and the hamburger button).
 * All other responsive behavior is CSS-only via @media queries on the
 * same numbers.
 *
 * SSR returns mobile defaults; the first effect tick reconciles against
 * the real viewport. Rails are CSS-mountable (no JS gate) so first paint
 * is correct at any width; the only desktop-side pop on hydration is
 * components disappearing, which is the safer direction.
 */
const BP_GT_MOBILE = 800;
const BP_GT_NARROW_DESKTOP = 1100;
const BP_GT_DESKTOP = 1300;

export interface LayoutBreakpoints {
  /** ≥800px: desktop layout begins. Bottom-nav, mobile-sidebar, hamburger should unmount. */
  isDesktop: boolean;
  /** ≥1100px: right rail mounted. */
  hasRightRail: boolean;
  /** ≥1300px: left rail expands to icon+label; right rail at full 300px. */
  isFullDesktop: boolean;
  /**
   * True when the app is running as an installed PWA / A2HS web clip —
   * i.e. display-mode is standalone. False in a regular browser tab.
   * Checked via the W3C media query (Android + modern iOS) with a
   * navigator.standalone fallback for older iOS Safari.
   */
  isStandalone: boolean;
}

const SSR_DEFAULT: LayoutBreakpoints = {
  isDesktop: false,
  hasRightRail: false,
  isFullDesktop: false,
  isStandalone: false,
};

function sameBreakpoints(a: LayoutBreakpoints, b: LayoutBreakpoints): boolean {
  return (
    a.isDesktop === b.isDesktop &&
    a.hasRightRail === b.hasRightRail &&
    a.isFullDesktop === b.isFullDesktop &&
    a.isStandalone === b.isStandalone
  );
}

export function useLayoutBreakpoints(): LayoutBreakpoints {
  const [bp, setBp] = useState<LayoutBreakpoints>(SSR_DEFAULT);

  useEffect(() => {
    const standaloneQuery = window.matchMedia("(display-mode: standalone)");
    const getIsStandalone = () =>
      standaloneQuery.matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;

    const compute = (): LayoutBreakpoints => {
      const w = window.innerWidth;
      return {
        isDesktop: w >= BP_GT_MOBILE,
        hasRightRail: w >= BP_GT_NARROW_DESKTOP,
        isFullDesktop: w >= BP_GT_DESKTOP,
        isStandalone: getIsStandalone(),
      };
    };
    // Only commit a new object when a breakpoint boolean actually flips.
    // resize fires dozens of times/sec during a drag but most ticks keep
    // every breakpoint identical, so bail to avoid re-rendering consumers.
    const apply = () => {
      const next = compute();
      setBp((prev) => (sameBreakpoints(prev, next) ? prev : next));
    };
    apply();
    window.addEventListener("resize", apply);
    // Re-evaluate if the user installs the app mid-session.
    standaloneQuery.addEventListener("change", apply);
    return () => {
      window.removeEventListener("resize", apply);
      standaloneQuery.removeEventListener("change", apply);
    };
  }, []);

  return bp;
}
