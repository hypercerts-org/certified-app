"use client"

import { useEffect, useRef } from "react"

/**
 * Window-scroll save/restore for list pages, so returning from a detail
 * page (the browser's back button, or a back link) lands the reader back
 * at the offset they left from instead of the top.
 *
 * Positions live in a module-level map so they survive the list
 * component unmounting (navigating into the detail page) and remounting
 * (clicking back). Keyed by the caller — pass the list's URL so each
 * filter/search combination restores independently.
 *
 * Saving: on scroll (one write per frame), and on the click of a link
 * inside the page, which is the moment the reader leaves. After that
 * click nothing more is saved for the key: the router scrolls the next
 * page to the top while this list is still mounted, and that 0 must not
 * overwrite the reader's place. (Saving on unmount, as this hook once
 * did, recorded exactly that 0.)
 *
 * Restoring: `ready` should flip true once the list's first rows have
 * rendered (not merely "not loading": a loader's initial state is often
 * idle before its fetch starts, and restoring then clamps against an
 * empty page). The saved offset is read once, on mount. While the page is
 * still too short to reach it (more sections settling in), the restore
 * retries for a few frames; any wheel, touch or key input from the reader
 * stops it, so it never fights them.
 *
 * Caveat: this restores against whatever the list re-renders on return.
 * If the reader had paged far past the first page via "Load more", the
 * remounted list starts at page one, so a very deep offset clamps to the
 * current bottom until more pages load.
 */

const MAX_ENTRIES = 50
/** Frames the restore keeps trying while the page is too short. */
const MAX_RESTORE_FRAMES = 90
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

/** Test seam: the saved offset for a key. */
export function savedScrollPosition(key: string): number | undefined {
  return positions.get(key)
}

/** Test seam: forget every saved offset. */
export function clearSavedScrollPositions(): void {
  positions.clear()
}

/** A plain left click on an in-app link that navigates this tab. */
function isLeavingClick(e: MouseEvent): boolean {
  if (e.defaultPrevented || e.button !== 0) return false
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return false
  const target = e.target as Element | null
  const a = target?.closest?.("a[href]") as HTMLAnchorElement | null
  if (!a) return false
  if (a.target && a.target !== "_self") return false
  if (a.hasAttribute("download")) return false
  // An in-page anchor (a skip link) doesn't leave.
  if (a.getAttribute("href")?.startsWith("#")) return false
  return true
}

export function useScrollRestoration(key: string, ready: boolean): void {
  // The saved offset for the mount-time key, read once on the first
  // render, before any scroll listener can overwrite it.
  const mountKey = useRef(key)
  const target = useRef<{ y: number | undefined } | null>(null)
  if (target.current === null) target.current = { y: positions.get(key) }

  useEffect(() => {
    let raf = 0
    let leaving = false
    const onScroll = () => {
      if (leaving || raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        if (!leaving) remember(key, window.scrollY)
      })
    }
    const onClick = (e: MouseEvent) => {
      if (!isLeavingClick(e)) return
      remember(key, window.scrollY)
      leaving = true
    }
    // A link that turned out not to leave (same URL, prevented later) —
    // the next deliberate scroll by the reader saves again.
    const onInput = () => {
      leaving = false
    }
    window.addEventListener("scroll", onScroll, { passive: true })
    document.addEventListener("click", onClick, true)
    window.addEventListener("wheel", onInput, { passive: true })
    window.addEventListener("touchstart", onInput, { passive: true })
    window.addEventListener("keydown", onInput)
    return () => {
      window.removeEventListener("scroll", onScroll)
      document.removeEventListener("click", onClick, true)
      window.removeEventListener("wheel", onInput)
      window.removeEventListener("touchstart", onInput)
      window.removeEventListener("keydown", onInput)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [key])

  // Restore once per mount, after the first rows. Only for the mount-time
  // key: a filter change (which swaps the key while mounted) must not yank
  // the reader's scroll.
  // `done` is set when the restore finished (or the reader took over),
  // not when it starts, so an effect re-run (React's dev double-invoke, a
  // re-render mid-restore) picks it up again instead of dropping it.
  const done = useRef(false)
  useEffect(() => {
    if (done.current || !ready) return
    const y = target.current?.y
    if (key !== mountKey.current || !y) {
      done.current = true
      return
    }
    let frame = 0
    let raf = 0
    const detach = () => {
      window.removeEventListener("wheel", takeOver)
      window.removeEventListener("touchstart", takeOver)
      window.removeEventListener("keydown", takeOver)
    }
    const finish = () => {
      done.current = true
      detach()
    }
    function takeOver() {
      if (raf) cancelAnimationFrame(raf)
      raf = 0
      finish()
    }
    const step = () => {
      raf = 0
      window.scrollTo(0, y)
      frame += 1
      // Still short of it (the page below is still filling in): try again.
      if (Math.abs(window.scrollY - y) > 1 && frame < MAX_RESTORE_FRAMES) {
        raf = requestAnimationFrame(step)
      } else {
        finish()
      }
    }
    window.addEventListener("wheel", takeOver, { passive: true })
    window.addEventListener("touchstart", takeOver, { passive: true })
    window.addEventListener("keydown", takeOver)
    // Two frames first: let the just-committed rows settle their layout.
    raf = requestAnimationFrame(() => {
      raf = requestAnimationFrame(step)
    })
    return () => {
      if (raf) cancelAnimationFrame(raf)
      detach()
    }
  }, [key, ready])
}
