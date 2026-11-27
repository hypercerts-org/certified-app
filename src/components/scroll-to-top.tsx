"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * Every link to another page opens it at the top. Next.js scrolls only when
 * the part of the page that changed starts out of view, and then only to that
 * part: a page under the site header, or one whose content starts within the
 * viewport, kept the old position and hid its header. Back and forward are
 * left to the browser, which restores where the reader was; a link that
 * changes only the query (Explore's filters, `scroll={false}`) or the hash
 * doesn't move the page.
 */
export function ScrollToTop() {
  const pathname = usePathname();
  const first = useRef(true);
  const fromHistory = useRef(false);

  useEffect(() => {
    const onPopState = () => {
      fromHistory.current = true;
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: runs on each new page
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (fromHistory.current) {
      fromHistory.current = false;
      return;
    }
    if (window.location.hash) return;
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [pathname]);

  return null;
}
