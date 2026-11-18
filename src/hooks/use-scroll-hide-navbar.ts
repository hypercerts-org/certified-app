"use client";

import { useState, useEffect, useRef } from "react";

/**
 * Until when scrolling is the app's own (a restored list position), not the
 * reader's: the bar stays shown through it. Module-level, like the one
 * phone bar that reads it.
 */
let programmaticUntil = 0;

/**
 * Keep the phone top bar shown through scrolling the app does itself for
 * the next `ms` (use-scroll-restoration: Back to a list lands the reader
 * where they were, and that jump down must not hide the bar the way a
 * scroll down by hand does).
 */
export function keepNavbarShown(ms = 300): void {
  programmaticUntil = Math.max(programmaticUntil, performance.now() + ms);
}

/**
 * Tracks window scroll position and returns:
 * - `scrolled`: true when page has scrolled past 20px
 * - `navHidden`: true when user scrolls down past 80px (hides navbar)
 */
export function useScrollHideNavbar() {
  const [scrolled, setScrolled] = useState(false);
  const [navHidden, setNavHidden] = useState(false);
  const lastScrollY = useRef(0);

  useEffect(() => {
    const handleScroll = () => {
      const currentY = window.scrollY;
      setScrolled(currentY > 20);
      if (performance.now() < programmaticUntil) {
        // The app moved the page (a restored position): stay shown.
        setNavHidden(false);
      } else if (currentY > lastScrollY.current && currentY > 80) {
        setNavHidden(true);
      } else {
        setNavHidden(false);
      }
      lastScrollY.current = currentY;
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return { scrolled, navHidden };
}
