"use client"

import { useEffect, useState, type RefObject } from "react"

/**
 * Whether an element, plus `margin` px, fits in the viewport's height. A
 * sticky column is only sticky when it fits: one taller than the window
 * would hide its own end until the page ran out. Re-measured as the
 * element or the window resizes.
 */
export function useFitsViewport(ref: RefObject<HTMLElement | null>, margin = 0): boolean {
  const [fits, setFits] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === "undefined") return
    const measure = () => setFits(el.offsetHeight + margin <= window.innerHeight)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    window.addEventListener("resize", measure)
    return () => {
      ro.disconnect()
      window.removeEventListener("resize", measure)
    }
  }, [ref, margin])
  return fits
}
