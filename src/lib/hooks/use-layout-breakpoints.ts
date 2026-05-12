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
}

const SSR_DEFAULT: LayoutBreakpoints = {
  isDesktop: false,
  hasRightRail: false,
  isFullDesktop: false,
};

export function useLayoutBreakpoints(): LayoutBreakpoints {
  const [bp, setBp] = useState<LayoutBreakpoints>(SSR_DEFAULT);

  useEffect(() => {
    const compute = (): LayoutBreakpoints => {
      const w = window.innerWidth;
      return {
        isDesktop: w >= BP_GT_MOBILE,
        hasRightRail: w >= BP_GT_NARROW_DESKTOP,
        isFullDesktop: w >= BP_GT_DESKTOP,
      };
    };
    setBp(compute());
    const onResize = () => setBp(compute());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return bp;
}
