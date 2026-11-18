"use client"

import { useEffect, useRef } from "react"
import { keepNavbarShown } from "@/hooks/use-scroll-hide-navbar"

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
 * rendered (not merely "not loading": restoring then clamps against an
 * empty page). The saved place is read once, on mount. It is the row the
 * reader tapped, where it sat in the window: the restore puts that row
 * back at the same height, so sections that load at a different height
 * (Featured, images, the top bar) don't leave them a few rows off. Without
 * that row (a scroll saved by hand, or the row gone) it falls back to the
 * pixel offset. While the page is still settling the restore retries for a
 * few frames; any wheel, touch or key input from the reader stops it, so
 * it never fights them. The phone top bar stays shown through it
 * (keepNavbarShown): the reader didn't scroll down, the app did.
 *
 * Caveat: this restores against whatever the list re-renders on return.
 * If the reader had paged far past the first page via "Load more", the
 * remounted list starts at page one, so a very deep offset clamps to the
 * current bottom until more pages load.
 */

const MAX_ENTRIES = 50
/** Frames the restore keeps trying while the page is still settling. */
const MAX_RESTORE_FRAMES = 90
/** Frames the row must stay put at its place before the restore stops. */
const SETTLED_FRAMES = 2

/** The link the reader left by: its href, which of the page's links with
 *  that href it was (a record can be listed twice, in Featured and in its
 *  own section), and its top edge in the window. */
interface SavedAnchor {
  href: string
  index: number
  top: number
}

interface SavedPlace {
  y: number
  anchor?: SavedAnchor
}

const positions = new Map<string, SavedPlace>()

function remember(key: string, place: SavedPlace): void {
  // Re-insert to keep the map in LRU order, then evict the oldest.
  if (positions.has(key)) positions.delete(key)
  positions.set(key, place)
  while (positions.size > MAX_ENTRIES) {
    const oldest = positions.keys().next().value
    if (oldest === undefined) break
    positions.delete(oldest)
  }
}

function linksTo(href: string): HTMLAnchorElement[] {
  return Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]")).filter(
    (a) => a.getAttribute("href") === href,
  )
}

function anchorOf(a: HTMLAnchorElement): SavedAnchor | undefined {
  const href = a.getAttribute("href")
  if (!href) return undefined
  const index = Math.max(0, linksTo(href).indexOf(a))
  return { href, index, top: a.getBoundingClientRect().top }
}

function findAnchor(anchor: SavedAnchor): HTMLAnchorElement | null {
  const links = linksTo(anchor.href)
  return links[anchor.index] ?? links[0] ?? null
}

/** Test seam: the saved offset for a key. */
export function savedScrollPosition(key: string): number | undefined {
  return positions.get(key)?.y
}

/** Test seam: forget every saved offset. */
export function clearSavedScrollPositions(): void {
  positions.clear()
}

/** The link of a plain left click on an in-app link that navigates this
 *  tab, else null. */
function leavingLink(e: MouseEvent): HTMLAnchorElement | null {
  if (e.defaultPrevented || e.button !== 0) return null
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return null
  const target = e.target as Element | null
  const a = target?.closest?.("a[href]") as HTMLAnchorElement | null
  if (!a) return null
  if (a.target && a.target !== "_self") return null
  if (a.hasAttribute("download")) return null
  // An in-page anchor (a skip link) doesn't leave.
  if (a.getAttribute("href")?.startsWith("#")) return null
  return a
}

export function useScrollRestoration(key: string, ready: boolean): void {
  // The saved offset for the mount-time key, read once on the first
  // render, before any scroll listener can overwrite it.
  const mountKey = useRef(key)
  const target = useRef<{ place: SavedPlace | undefined } | null>(null)
  if (target.current === null) target.current = { place: positions.get(key) }

  useEffect(() => {
    let raf = 0
    let leaving = false
    const onScroll = () => {
      if (leaving || raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        if (!leaving) remember(key, { y: window.scrollY })
      })
    }
    const onClick = (e: MouseEvent) => {
      const a = leavingLink(e)
      if (!a) return
      remember(key, { y: window.scrollY, anchor: anchorOf(a) })
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
    const place = target.current?.place
    if (key !== mountKey.current || !place?.y) {
      done.current = true
      return
    }
    const { y, anchor } = place
    let frame = 0
    let settled = 0
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
      // The tapped row back where it was in the window; else the offset.
      const row = anchor ? findAnchor(anchor) : null
      const want = row
        ? Math.max(0, Math.round(window.scrollY + row.getBoundingClientRect().top - anchor!.top))
        : y
      keepNavbarShown()
      window.scrollTo(0, want)
      frame += 1
      settled = Math.abs(window.scrollY - want) <= 1 ? settled + 1 : 0
      // Not there yet, or not for long (the page is still filling in, or
      // the row hasn't rendered yet): try again.
      const waiting = settled < SETTLED_FRAMES || (!!anchor && !row)
      if (waiting && frame < MAX_RESTORE_FRAMES) {
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
