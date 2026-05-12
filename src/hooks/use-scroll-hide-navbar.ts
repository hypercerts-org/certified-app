"use client";

import { useState, useEffect, useRef } from "react";

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
      if (currentY > lastScrollY.current && currentY > 80) {
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
