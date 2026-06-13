"use client"

import { useEffect, useRef } from "react"

/**
 * Window-scroll save/restore for list pages, so returning from a detail
 * page (the back button calls `router.back()`) lands the reader back at
 * the offset they left from instead of the top.
 *
 * Positions live in a module-level map so they survive the list
 * component unmounting (navigating into the detail page) and remounting
 * (clicking back). Keyed by the caller — pass the list's URL so each
 * filter/search combination restores independently.
 *
 * `ready` should flip true once the list has rendered enough content to
 * be tall enough to hold the saved offset (e.g. `!isLoading`). Restoring
 * while the list is still empty/loading would clamp against the short
 * page and land at the top. The saved target is captured on first render
 * (before any scroll events fire) so the browser's own scroll-to-top on
 * navigation can't clobber it before we read it back.
 *
 * Caveat: this restores against whatever the list re-renders on return.
 * If the reader had paged far past the first page via "Load more", the
 * remounted list starts at page one, so a very deep offset clamps to the
 * current bottom until more pages load.
 */

const MAX_ENTRIES = 50
const positions = new Map<string, number>()

function remember(key: string, y: number): void {
  // Re-insert to keep the map in LRU order, then evict the oldest.
  if (positions.has(key)) positions.delete(key)
  positions.set(key, y)
  while (positions.size > MAX_ENTRIES) {
    const oldest = positions.keys().next().value
    if (oldest === undefined) break
    positions.delete(oldest)
  }
}

export function useScrollRestoration(key: string, ready: boolean): void {
  // Capture the saved offset for the mount-time key once, during the
  // first render, before any scroll listener can overwrite it with 0.
  const target = useRef<number | undefined>(undefined)
  const mountKey = useRef(key)
  if (target.current === undefined) target.current = positions.get(key)

  // Save on scroll (coalesced to one write per frame) and on unmount,
  // which covers the click-into-detail navigation.
  useEffect(() => {
    let raf = 0
    const onScroll = () => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        remember(key, window.scrollY)
      })
    }
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => {
      window.removeEventListener("scroll", onScroll)
      if (raf) cancelAnimationFrame(raf)
      remember(key, window.scrollY)
    }
  }, [key])

  // Restore once per mount, after the list is ready. Only for the
  // mount-time key — a filter change (which swaps the key while mounted)
  // should not yank the reader's scroll.
  const done = useRef(false)
  useEffect(() => {
    if (done.current || !ready) return
    done.current = true
    if (key !== mountKey.current) return
    const y = target.current
    if (!y) return
    // Two frames: let the just-committed list settle its layout first.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => window.scrollTo(0, y))
    })
  }, [key, ready])
}
