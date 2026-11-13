"use client"

import { useEffect, useState, type RefObject } from "react"

/**
 * Whether a scroll container has more content below what it shows. True
 * while it can still scroll down; false once it is scrolled to the end,
 * and while it doesn't scroll at all (content fits, or the container is
 * hidden with `display: none`). Callers use it to fade the bottom edge so
 * a list cut off by the container reads as "there is more".
 *
 * Checks on mount, on every scroll, and when the container or one of its
 * children changes size: a window resize or breakpoint changes the
 * container's height, rows that load late change the content's. The
 * setter bails when the answer is unchanged, so scrolling doesn't
 * re-render the caller.
 */
export function useMoreBelow(ref: RefObject<HTMLElement | null>): boolean {
  const [moreBelow, setMoreBelow] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => {
      // 1px of slack: a scroller at its end can sit a sub-pixel short.
      setMoreBelow(el.scrollHeight - el.clientHeight - el.scrollTop > 1)
    }
    update()
    el.addEventListener("scroll", update, { passive: true })
    let observer: ResizeObserver | null = null
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(update)
      observer.observe(el)
      for (const child of Array.from(el.children)) observer.observe(child)
    }
    return () => {
      el.removeEventListener("scroll", update)
      observer?.disconnect()
    }
  }, [ref])

  return moreBelow
}
