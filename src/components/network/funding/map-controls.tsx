"use client"

import { useRef, type KeyboardEvent, type PointerEvent } from "react"
import { Minus, Plus, RotateCcw } from "lucide-react"
import Button from "@/components/ui/button"

/** Zoom in, zoom out and back to the start, in the drawing's top-right
 *  corner. A sibling of the drawing, not inside it, so pressing a button
 *  never starts a drag. */
export function MapZoomControls({
  label,
  onZoomIn,
  onZoomOut,
  onReset,
  canZoomIn,
  canZoomOut,
  canReset,
}: {
  /** What the buttons move: "map" or "globe". */
  label: string
  onZoomIn: () => void
  onZoomOut: () => void
  onReset: () => void
  canZoomIn: boolean
  canZoomOut: boolean
  canReset: boolean
}) {
  return (
    <div className="funding-map-controls" role="group" aria-label={`${label[0].toUpperCase()}${label.slice(1)} controls`}>
      <Button size="icon-sm" variant="secondary" aria-label="Zoom in" title="Zoom in" onClick={onZoomIn} disabled={!canZoomIn}>
        <Plus size={15} aria-hidden />
      </Button>
      <Button size="icon-sm" variant="secondary" aria-label="Zoom out" title="Zoom out" onClick={onZoomOut} disabled={!canZoomOut}>
        <Minus size={15} aria-hidden />
      </Button>
      <Button
        size="icon-sm"
        variant="secondary"
        aria-label={`Back to the whole ${label === "globe" ? "globe" : "world"}`}
        title={`Back to the whole ${label === "globe" ? "globe" : "world"}`}
        onClick={onReset}
        disabled={!canReset}
      >
        <RotateCcw size={14} aria-hidden />
      </Button>
    </div>
  )
}

const KEY_STEP = 40

/**
 * The bar under a map: drag it down to make the map taller (which zooms
 * in), up to make it shorter; arrow keys move it in 40px steps, Home and
 * End go to the shortest and tallest, and a double-click goes back.
 */
export function MapResizeHandle({
  label,
  height,
  min,
  max,
  onResize,
}: {
  label: string
  height: number
  min: number
  max: number
  onResize: (height: number) => void
}) {
  const drag = useRef<{ y: number; height: number } | null>(null)
  const clamp = (h: number) => Math.round(Math.min(max, Math.max(min, h)))
  return (
    <div
      className="funding-map-resize"
      role="separator"
      aria-orientation="horizontal"
      aria-label={`${label} height`}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={height}
      tabIndex={0}
      title="Drag down to make it bigger"
      onPointerDown={(e: PointerEvent<HTMLDivElement>) => {
        if (e.pointerType === "mouse" && e.button !== 0) return
        e.currentTarget.setPointerCapture(e.pointerId)
        drag.current = { y: e.clientY, height }
      }}
      onPointerMove={(e: PointerEvent<HTMLDivElement>) => {
        const d = drag.current
        if (d) onResize(clamp(d.height + e.clientY - d.y))
      }}
      onPointerUp={() => {
        drag.current = null
      }}
      onPointerCancel={() => {
        drag.current = null
      }}
      onDoubleClick={() => onResize(min)}
      onKeyDown={(e: KeyboardEvent<HTMLDivElement>) => {
        const next =
          e.key === "ArrowDown"
            ? height + KEY_STEP
            : e.key === "ArrowUp"
              ? height - KEY_STEP
              : e.key === "Home"
                ? min
                : e.key === "End"
                  ? max
                  : null
        if (next === null) return
        e.preventDefault()
        onResize(clamp(next))
      }}
    >
      <span className="funding-map-resize__grip" aria-hidden />
    </div>
  )
}
