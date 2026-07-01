"use client"

import { useEffect, useRef } from "react"
import { useLayoutBreakpoints } from "./use-layout-breakpoints"

/**
 * Scroll the window to the top whenever `tab` changes on mobile.
 *
 * Detail-page sub-tabs (Description / Contributors / Updates /
 * Activities) switch by writing `?tab=` to the URL, which preserves the
 * previous scroll offset. On mobile that left a freshly-opened tab
 * scrolled down with its first rows hidden behind the fixed navbar. This
 * resets to the top on each real tab change.
 *
 * No-op on the initial render (a fresh load / deep link already sits at
 * the top, so we don't clobber browser scroll restoration) and on
 * desktop, where tab switches intentionally preserve scroll position
 * (`scroll: false` on the top-bar tab links).
 */
export function useScrollTopOnTabChange(tab: string): void {
  const { isDesktop } = useLayoutBreakpoints()
  const prevTab = useRef(tab)
  useEffect(() => {
    if (prevTab.current === tab) return
    prevTab.current = tab
    if (!isDesktop) window.scrollTo(0, 0)
  }, [tab, isDesktop])
}
