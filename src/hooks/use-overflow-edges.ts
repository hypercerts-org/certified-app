"use client"

import { useEffect, useState, type RefObject } from "react"

/**
 * Whether a sideways-scrolling strip has more beyond its start or end
 * edge, kept up to date as it scrolls or resizes. A tab strip shows a fade
 * on that edge, so a cut-off tab ("Endorsement") reads as "scroll for
 * more" rather than as a typo.
 */
export function useOverflowEdges(ref: RefObject<HTMLElement | null>): {
  start: boolean
  end: boolean
} {
  const [edges, setEdges] = useState({ start: false, end: false })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => {
      const max = el.scrollWidth - el.clientWidth
      const start = max > 1 && el.scrollLeft > 1
      const end = max > 1 && el.scrollLeft < max - 1
      setEdges((prev) => (prev.start === start && prev.end === end ? prev : { start, end }))
    }
    measure()
    el.addEventListener("scroll", measure, { passive: true })
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure)
    ro?.observe(el)
    const list = el.firstElementChild
    if (list) ro?.observe(list)
    return () => {
      el.removeEventListener("scroll", measure)
      ro?.disconnect()
    }
  }, [ref])
  return edges
}
