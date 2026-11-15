"use client"

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react"
import type { FundingDataset } from "@/lib/funding/dataset-types"
import type { ProjectTotal } from "@/lib/funding/select"
import { LAND_MASK, unpackLandMask } from "@/lib/funding/land-mask"
import { formatCount } from "@/lib/funding/format"
import { useCanvasColors, useElementWidth } from "./use-element-width"
import FundingProjectTip from "./funding-project-tip"
import { MapResizeHandle, MapZoomControls } from "./map-controls"
import { usePanZoom } from "./use-pan-zoom"

const RAD = Math.PI / 180
const MAX_HEIGHT = 560
const MAX_DRAG_HEIGHT = 1100
const SPIN_DEG_PER_S = 5
/** How far the globe tilts toward a pole, in degrees. */
const TILT_LIMIT = 60
const MAX_ZOOM = 10
/** Largest land dot, in pixels. */
const MAX_DOT = 2.8
/** Names on the whole globe; more as it zooms in, where they fit. */
const LABELS = 5
/** Where the globe faces before anything is picked: the Atlantic, so the
 *  Americas, Europe and Africa are all in view. */
const DEFAULT_VIEW = { lon: -30, lat: 12 }

/** Land cells as [sin(lat), cos(lat), lon (rad)] triples, built once. */
let land: Float32Array | null = null
function landCells(): Float32Array {
  if (land) return land
  const bits = unpackLandMask()
  const out: number[] = []
  for (let row = 0; row < LAND_MASK.rows; row++) {
    const lat = (LAND_MASK.lat0 - row * LAND_MASK.step) * RAD
    // Meridians converge toward the poles; keep every n-th cell so the dots
    // stay evenly spaced instead of crowding into stripes.
    const stride = Math.max(1, Math.round(1 / Math.cos(lat)))
    for (let col = 0; col < LAND_MASK.cols; col++) {
      if (col % stride !== 0 || !bits[row * LAND_MASK.cols + col]) continue
      out.push(Math.sin(lat), Math.cos(lat), (LAND_MASK.lon0 + col * LAND_MASK.step) * RAD)
    }
  }
  land = new Float32Array(out)
  return land
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
const wrap = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180

interface Mark {
  t: ProjectTotal
  x: number
  y: number
  r: number
}

interface View {
  lon: number
  lat: number
  /** 1 is the whole globe in the box. */
  z: number
}

/**
 * The projects on a globe: the same dots and circles as the flat map, on an
 * orthographic projection. It turns slowly until the visitor takes over.
 * Drag (or the arrow keys) to turn it; zoom with the buttons, a pinch, Ctrl
 * or ⌘ and the scroll wheel, the plus and minus keys, or a double-click,
 * which also turns toward the point; drag the bar underneath to make it
 * bigger. Picking a project swings it to the front. Stays still for
 * visitors who prefer reduced motion.
 */
export default function FundingGlobe({
  ds,
  placed,
  maxTotal,
  selected,
  onSelect,
}: {
  ds: FundingDataset
  /** Projects with a location, largest first. */
  placed: ProjectTotal[]
  maxTotal: number
  selected: number
  onSelect: (project: number) => void
}) {
  const [measure, width] = useElementWidth<HTMLDivElement>()
  const surface = useRef<HTMLDivElement | null>(null)
  const surfaceRef = useCallback(
    (node: HTMLDivElement | null) => {
      surface.current = node
      measure(node)
    },
    [measure],
  )
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const colors = useCanvasColors()
  const baseH = Math.min(MAX_HEIGHT, Math.max(280, width))
  const maxH = Math.max(baseH, Math.min(Math.round(baseH * 2.2), MAX_DRAG_HEIGHT))
  const [dragged, setDragged] = useState<number | null>(null)
  const height = Math.min(maxH, Math.max(baseH, dragged ?? baseH))
  /** The whole globe's radius at zoom 1: a taller box is a bigger globe. */
  const R0 = Math.max(1, height / 2 - 14)
  const [hover, setHover] = useState<{ t: ProjectTotal; x: number; y: number } | null>(null)

  const sel = selected >= 0 ? ds.projects[selected] : null
  const view = useRef<View>(
    sel && sel.lat != null && sel.lng != null
      ? { lon: sel.lng, lat: clamp(sel.lat, -TILT_LIMIT, TILT_LIMIT), z: 1 }
      : { ...DEFAULT_VIEW, z: 1 },
  )
  const target = useRef<View | null>(null)
  /** Turns until the visitor first moves it themselves. */
  const spinning = useRef(true)
  const pointerInside = useRef(false)
  const marks = useRef<Mark[]>([])
  const selectedRef = useRef(selected)
  const kick = useRef<() => void>(() => {})
  const [z, setZ] = useState(1)

  const take = () => {
    spinning.current = false
    setHover(null)
  }

  const go = (next: View, animate: boolean) => {
    const v = { lon: wrap(next.lon), lat: clamp(next.lat, -TILT_LIMIT, TILT_LIMIT), z: clamp(next.z, 1, MAX_ZOOM) }
    if (animate) target.current = v
    else {
      target.current = null
      view.current = v
    }
    setZ((prev) => (Math.abs(prev - v.z) < 0.001 ? prev : v.z))
    kick.current()
  }

  /** The point on the globe under (x, y), or null off the edge. */
  const pointAt = (x: number, y: number, v: View): { lon: number; lat: number } | null => {
    const R = R0 * v.z
    const px = (x - width / 2) / R
    const py = -(y - height / 2) / R
    const rho = Math.hypot(px, py)
    if (rho > 1) return null
    if (rho === 0) return { lon: v.lon, lat: v.lat }
    const c = Math.asin(rho)
    const phi0 = v.lat * RAD
    const lat = Math.asin(Math.cos(c) * Math.sin(phi0) + (py * Math.sin(c) * Math.cos(phi0)) / rho)
    const lon =
      v.lon * RAD +
      Math.atan2(px * Math.sin(c), rho * Math.cos(c) * Math.cos(phi0) - py * Math.sin(c) * Math.sin(phi0))
    return { lon: lon / RAD, lat: lat / RAD }
  }

  /** Zoom by `f`; zooming in at a point also turns part of the way to it. */
  const zoomAt = (f: number, x: number, y: number, animate: boolean) => {
    take()
    const v = target.current ?? view.current
    const nz = clamp(v.z * f, 1, MAX_ZOOM)
    const p = f > 1 ? pointAt(x, y, v) : null
    const share = p ? 1 - v.z / nz : 0
    go(
      {
        lon: p ? v.lon + wrap(p.lon - v.lon) * share : v.lon,
        lat: p ? v.lat + (p.lat - v.lat) * share : v.lat,
        z: nz,
      },
      animate,
    )
  }

  const reset = () => {
    take()
    setDragged(null)
    go({ ...DEFAULT_VIEW, z: 1 }, true)
  }

  const hit = (x: number, y: number): ProjectTotal | null => {
    let best: Mark | null = null
    for (const m of marks.current) {
      const dx = m.x - x
      const dy = m.y - y
      if (dx * dx + dy * dy <= Math.max(m.r, 6) ** 2 && (!best || m.r < best.r)) best = m
    }
    return best?.t ?? null
  }

  const gestures = usePanZoom(surface, {
    onPan: (dx, dy) => {
      take()
      const v = view.current
      const R = R0 * v.z
      go({ lon: v.lon - dx / R / RAD, lat: v.lat + dy / R / RAD, z: v.z }, false)
    },
    onZoom: (f, x, y, step) => zoomAt(f, x, y, step === true),
    onTap: (x, y) => {
      const t = hit(x, y)
      if (t) {
        // The globe is about to turn, so the card would point at nothing.
        setHover(null)
        onSelect(t.project)
      }
    },
    onHover: (x, y) => {
      const t = hit(x, y)
      setHover((prev) => (t ? { t, x, y } : prev ? null : prev))
    },
    onLeave: () => setHover(null),
  })

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || width <= 0 || !colors.key) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = Math.round(width * dpr)
    canvas.height = Math.round(height * dpr)
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    const cells = landCells()
    const cx = width / 2
    const cy = height / 2
    const rScale = Math.max(0.5, R0 / 300)
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches

    const draw = () => {
      const v = view.current
      const R = R0 * v.z
      const lam0 = v.lon * RAD
      const sinP0 = Math.sin(v.lat * RAD)
      const cosP0 = Math.cos(v.lat * RAD)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, width, height)

      // The sphere.
      ctx.beginPath()
      ctx.arc(cx, cy, R, 0, Math.PI * 2)
      ctx.fillStyle = colors.fg
      ctx.globalAlpha = 0.035
      ctx.fill()
      ctx.strokeStyle = colors.fg
      ctx.globalAlpha = 0.22
      ctx.lineWidth = 1
      ctx.stroke()

      // Land, in four depth bands so each band is one fill. Closer in, the
      // dots stay small and spread apart (the grid is 1.5 degrees).
      const cell = Math.min(MAX_DOT, ((2 * Math.PI * R) / LAND_MASK.cols) * 0.24)
      ctx.fillStyle = colors.muted
      for (let band = 0; band < 4; band++) {
        const lo = band / 4
        const hi = (band + 1) / 4
        ctx.beginPath()
        for (let i = 0; i < cells.length; i += 3) {
          const sinPhi = cells[i]
          const cosPhi = cells[i + 1]
          const dl = cells[i + 2] - lam0
          const cosDl = Math.cos(dl)
          const cosc = sinP0 * sinPhi + cosP0 * cosPhi * cosDl
          if (cosc <= lo || cosc > hi) continue
          const x = cx + R * cosPhi * Math.sin(dl)
          const y = cy - R * (cosP0 * sinPhi - sinP0 * cosPhi * cosDl)
          const r = Math.max(0.5, cell * Math.sqrt(cosc))
          if (x < -r || x > width + r || y < -r || y > height + r) continue
          ctx.moveTo(x + r, y)
          ctx.arc(x, y, r, 0, Math.PI * 2)
        }
        ctx.globalAlpha = 0.14 + 0.36 * ((lo + hi) / 2)
        ctx.fill()
      }

      // Projects, largest first so small ones stay on top.
      const grow = Math.pow(v.z, 0.2)
      const next: Mark[] = []
      for (const t of placed) {
        const p = ds.projects[t.project]
        const phi = p.lat! * RAD
        const dl = p.lng! * RAD - lam0
        const cosDl = Math.cos(dl)
        const cosc = sinP0 * Math.sin(phi) + cosP0 * Math.cos(phi) * cosDl
        if (cosc <= 0.02) continue
        const x = cx + R * Math.cos(phi) * Math.sin(dl)
        const y = cy - R * (cosP0 * Math.sin(phi) - sinP0 * Math.cos(phi) * cosDl)
        const r = (3 + 24 * Math.sqrt(t.total / maxTotal)) * rScale * grow * (0.55 + 0.45 * cosc)
        if (x < -r || x > width + r || y < -r || y > height + r) continue
        const isSel = t.project === selectedRef.current
        const fade = 0.35 + 0.65 * cosc
        ctx.beginPath()
        ctx.arc(x, y, r, 0, Math.PI * 2)
        ctx.fillStyle = colors.fg
        ctx.globalAlpha = (isSel ? 0.55 : 0.14) * fade
        ctx.fill()
        ctx.strokeStyle = colors.fg
        ctx.globalAlpha = (isSel ? 1 : 0.7) * fade
        ctx.lineWidth = isSel ? 2 : 1
        ctx.stroke()
        next.push({ t, x, y, r: cosc > 0.35 ? r : -r })
      }

      // Names of the largest projects facing us, where they don't collide.
      ctx.font = "600 11px Inter, system-ui, sans-serif"
      ctx.textBaseline = "middle"
      ctx.lineJoin = "round"
      ctx.lineWidth = 3
      const limit = Math.min(20, Math.round(LABELS * Math.sqrt(v.z)))
      const boxes: { l: number; r: number; t: number; b: number }[] = []
      for (const m of next) {
        if (boxes.length >= limit) break
        // Near the edge (a negative radius marks it): no name.
        if (m.r < 0) continue
        const p = ds.projects[m.t.project]
        const name = ds.accounts[p.owner]?.name ?? p.title ?? ""
        if (!name) continue
        const text = name.length > 28 ? `${name.slice(0, 27)}…` : name
        const w = ctx.measureText(text).width
        const right = m.x + m.r + 5 + w <= width
        const tx = right ? m.x + m.r + 5 : m.x - m.r - 5
        const box = { l: right ? tx : tx - w, r: right ? tx + w : tx, t: m.y - 8, b: m.y + 8 }
        if (box.l < 0 || box.t < 0 || box.b > height) continue
        if (boxes.some((o) => o.l < box.r + 4 && box.l < o.r + 4 && o.t < box.b && box.t < o.b)) continue
        boxes.push(box)
        ctx.textAlign = right ? "left" : "right"
        ctx.strokeStyle = colors.bg
        ctx.globalAlpha = 0.9
        ctx.strokeText(text, tx, m.y)
        ctx.fillStyle = colors.fg
        ctx.globalAlpha = 1
        ctx.fillText(text, tx, m.y)
      }
      ctx.globalAlpha = 1
      marks.current = next.map((m) => ({ ...m, r: Math.abs(m.r) }))
    }

    let raf = 0
    let last = 0
    let visible = true
    const tick = (now: number) => {
      raf = 0
      const dt = last ? Math.min(0.1, (now - last) / 1000) : 0
      last = now
      const v = view.current
      let moving = false
      if (target.current) {
        const t = target.current
        const dLon = wrap(t.lon - v.lon)
        const dLat = t.lat - v.lat
        const a = reduceMotion ? 1 : 1 - Math.pow(0.002, dt)
        v.lon = wrap(v.lon + dLon * a)
        v.lat += dLat * a
        v.z *= Math.pow(t.z / v.z, a)
        if (Math.abs(dLon) < 0.05 && Math.abs(dLat) < 0.05 && Math.abs(t.z / v.z - 1) < 0.002) {
          view.current = { ...t }
          target.current = null
        } else moving = true
      } else if (spinning.current && !reduceMotion && !pointerInside.current) {
        v.lon = wrap(v.lon + SPIN_DEG_PER_S * dt)
        moving = true
      }
      draw()
      if (moving && visible) raf = requestAnimationFrame(tick)
      else last = 0
    }
    kick.current = () => {
      if (!raf) raf = requestAnimationFrame(tick)
    }
    const io = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? true
      if (visible) kick.current()
    })
    io.observe(canvas)
    draw()
    kick.current()
    return () => {
      cancelAnimationFrame(raf)
      io.disconnect()
      kick.current = () => {}
    }
  }, [width, height, R0, colors, placed, maxTotal, ds])

  // A project picked elsewhere (the map, the tiles) swings to the front.
  useEffect(() => {
    selectedRef.current = selected
    const p = selected >= 0 ? ds.projects[selected] : null
    if (p && p.lat != null && p.lng != null) {
      target.current = {
        lon: p.lng,
        lat: clamp(p.lat, -TILT_LIMIT, TILT_LIMIT),
        z: (target.current ?? view.current).z,
      }
      spinning.current = false
    }
    kick.current()
  }, [selected, ds])

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const from = target.current ?? view.current
    const turn = { ArrowLeft: [-20, 0], ArrowRight: [20, 0], ArrowUp: [0, 12], ArrowDown: [0, -12] }[e.key]
    if (turn) {
      e.preventDefault()
      take()
      go({ lon: from.lon + turn[0] / from.z, lat: from.lat + turn[1] / from.z, z: from.z }, true)
    } else if (e.key === "+" || e.key === "=") {
      e.preventDefault()
      zoomAt(2, width / 2, height / 2, true)
    } else if (e.key === "-" || e.key === "_") {
      e.preventDefault()
      zoomAt(0.5, width / 2, height / 2, true)
    } else if (e.key === "0") {
      e.preventDefault()
      reset()
    }
  }

  const closer = z > 1.001 || height > baseH
  return (
    <div className="funding-map-wrap">
      <div className="funding-map funding-map--globe">
        <div
          ref={surfaceRef}
          className="funding-map__surface"
          style={{ height, touchAction: closer ? "none" : "pan-y", cursor: hover ? "pointer" : undefined }}
          tabIndex={0}
          role="group"
          aria-label="Globe of funded projects. Drag or use the arrow keys to turn it; zoom with the buttons, the plus and minus keys, or a pinch."
          onPointerEnter={() => {
            pointerInside.current = true
          }}
          onKeyDown={onKeyDown}
          {...gestures}
          onPointerLeave={() => {
            pointerInside.current = false
            gestures.onPointerLeave()
            kick.current()
          }}
        >
          <canvas
            ref={canvasRef}
            role="img"
            aria-label={`Globe of ${formatCount(placed.length)} funded projects, sized by money received.`}
          />
          {hover ? <FundingProjectTip ds={ds} t={hover.t} x={hover.x} y={hover.y} width={width} /> : null}
        </div>
        <MapZoomControls
          label="globe"
          onZoomIn={() => zoomAt(2, width / 2, height / 2, true)}
          onZoomOut={() => zoomAt(0.5, width / 2, height / 2, true)}
          onReset={reset}
          canZoomIn={z < MAX_ZOOM - 0.001}
          canZoomOut={z > 1.001}
          canReset={closer}
        />
      </div>
      {width > 0 ? (
        <MapResizeHandle label="Globe" height={height} min={baseH} max={maxH} onResize={setDragged} />
      ) : null}
    </div>
  )
}
