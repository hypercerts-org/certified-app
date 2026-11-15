"use client"

import {
  useEffect,
  useRef,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react"

export interface PanZoomHandlers {
  /** The drawing moved by (dx, dy) pixels since the last call. */
  onPan: (dx: number, dy: number) => void
  /** Zoom by `factor` (above 1 is in) around (x, y), in the element's
   *  pixels. `step` is a single jump (a double-click) worth animating. */
  onZoom: (factor: number, x: number, y: number, step?: boolean) => void
  /** A press and release that didn't move: a click or a tap. */
  onTap: (x: number, y: number) => void
  /** The pointer is over the drawing with nothing pressed. */
  onHover: (x: number, y: number) => void
  /** The pointer left, or a drag began (hide hover cards). */
  onLeave: () => void
}

/** How far a press may wander and still count as a tap. */
const TAP_SLOP = 4

/**
 * Pointer gestures for a drawing that moves and zooms (the /funding map and
 * globe): drag with a mouse or one finger to move, pinch to zoom, Ctrl or ⌘
 * with the scroll wheel (and a trackpad pinch, which browsers report the
 * same way) to zoom at the pointer, and double-click to zoom in there
 * (Shift to zoom out). A plain scroll wheel scrolls the page, as it should
 * on a page with more below. Returns the props to spread on the element.
 */
export function usePanZoom<T extends HTMLElement>(ref: RefObject<T | null>, handlers: PanZoomHandlers) {
  const h = useRef(handlers)
  useEffect(() => {
    h.current = handlers
  })
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const press = useRef<{ x: number; y: number; moved: boolean } | null>(null)
  const pinch = useRef<{ dist: number; x: number; y: number } | null>(null)

  // React's wheel listener is passive, so it can't stop the page scrolling.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const wheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const step = e.deltaMode === 1 ? 0.05 : 0.0025
      h.current.onZoom(Math.exp(-e.deltaY * step), e.clientX - rect.left, e.clientY - rect.top)
    }
    el.addEventListener("wheel", wheel, { passive: false })
    return () => el.removeEventListener("wheel", wheel)
  }, [ref])

  const local = (e: ReactPointerEvent<T>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  return {
    onPointerDown: (e: ReactPointerEvent<T>) => {
      if (e.pointerType === "mouse" && e.button !== 0) return
      const p = local(e)
      e.currentTarget.setPointerCapture(e.pointerId)
      pointers.current.set(e.pointerId, p)
      if (pointers.current.size === 1) press.current = { ...p, moved: false }
      else if (press.current) press.current.moved = true // a pinch is never a tap
      pinch.current = null
    },
    onPointerMove: (e: ReactPointerEvent<T>) => {
      const p = local(e)
      const prev = pointers.current.get(e.pointerId)
      if (!prev) {
        h.current.onHover(p.x, p.y)
        return
      }
      pointers.current.set(e.pointerId, p)
      if (pointers.current.size >= 2) {
        const [a, b] = [...pointers.current.values()]
        const dist = Math.hypot(a.x - b.x, a.y - b.y)
        const x = (a.x + b.x) / 2
        const y = (a.y + b.y) / 2
        const last = pinch.current
        if (last && last.dist > 0) {
          h.current.onPan(x - last.x, y - last.y)
          h.current.onZoom(dist / last.dist, x, y)
        }
        pinch.current = { dist, x, y }
        return
      }
      const start = press.current
      if (start && !start.moved) {
        if (Math.hypot(p.x - start.x, p.y - start.y) < TAP_SLOP) return
        start.moved = true
        h.current.onLeave()
        // Move by the whole distance since the press, not since the slop.
        h.current.onPan(p.x - start.x, p.y - start.y)
        return
      }
      h.current.onPan(p.x - prev.x, p.y - prev.y)
    },
    onPointerUp: (e: ReactPointerEvent<T>) => {
      if (!pointers.current.delete(e.pointerId)) return
      pinch.current = null
      if (pointers.current.size > 0) return
      const start = press.current
      press.current = null
      if (start && !start.moved) {
        const p = local(e)
        h.current.onTap(p.x, p.y)
      }
    },
    onPointerCancel: (e: ReactPointerEvent<T>) => {
      pointers.current.delete(e.pointerId)
      pinch.current = null
      if (pointers.current.size === 0) press.current = null
    },
    onPointerLeave: () => {
      if (pointers.current.size === 0) h.current.onLeave()
    },
    onDoubleClick: (e: ReactMouseEvent<T>) => {
      const rect = e.currentTarget.getBoundingClientRect()
      h.current.onZoom(e.shiftKey ? 0.5 : 2, e.clientX - rect.left, e.clientY - rect.top, true)
    },
  }
}
