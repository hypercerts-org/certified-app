"use client"

import { useCallback, useSyncExternalStore } from "react"

/**
 * Whether a media query matches, read synchronously on the client (so a
 * component mounted after load lays out right on its first frame) and
 * false on the server. Use it only where markup must differ by width,
 * not merely its look (that is CSS's job): the record pages move their
 * facts cards between the rail and the end of the page with it, so a
 * map is never mounted twice.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window === "undefined" || !window.matchMedia) return () => {}
      const mql = window.matchMedia(query)
      mql.addEventListener("change", onChange)
      return () => mql.removeEventListener("change", onChange)
    },
    [query],
  )
  return useSyncExternalStore(
    subscribe,
    () => (typeof window !== "undefined" && !!window.matchMedia ? window.matchMedia(query).matches : false),
    () => false,
  )
}

/** The record pages' two-column layout (DESIGN.md §4.5: ≥ 1100px). */
export const WIDE_RECORD_LAYOUT = "(min-width: 1100px)"
