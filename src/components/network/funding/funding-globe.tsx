"use client"

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react"
import type { FundingDataset } from "@/lib/funding/dataset-types"
import type { ProjectTotal } from "@/lib/funding/select"
import { LAND_MASK, unpackLandMask } from "@/lib/funding/land-mask"
import { formatCount } from "@/lib/funding/format"
import { useCanvasColors, useElementWidth } from "./use-element-width"
import FundingProjectTip from "./funding-project-tip"

const RAD = Math.PI / 180
const MAX_HEIGHT = 560
const SPIN_DEG_PER_S = 5
/** How far the globe tilts toward a pole, in degrees. */
const TILT_LIMIT = 60
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
    for (let col = 0; col < LAND_MASK.cols; col++) {
      if (!bits[row * LAND_MASK.cols + col]) continue
      out.push(Math.sin(lat), Math.cos(lat), (LAND_MASK.lon0 + col * LAND_MASK.step) * RAD)
    }
  }
  land = new Float32Array(out)
  return land
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

interface Mark {
  t: ProjectTotal
  x: number
  y: number
  r: number
}

/**
 * The projects on a globe: the same dots and circles as the flat map, on an
 * orthographic projection. It turns slowly until the visitor takes over
 * (drag, or the arrow keys when focused); picking a project swings it to the
 * front. Stays still for visitors who prefer reduced motion.
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
  const [wrapRef, width] = useElementWidth<HTMLDivElement>()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const colors = useCanvasColors()
  const height = Math.min(MAX_HEIGHT, Math.max(280, width))
  const [hover, setHover] = useState<{ t: ProjectTotal; x: number; y: number } | null>(null)

  const sel = selected >= 0 ? ds.projects[selected] : null
  const view = useRef(
    sel && sel.lat != null && sel.lng != null
      ? { lon: sel.lng, lat: clamp(sel.lat, -TILT_LIMIT, TILT_LIMIT) }
      : { ...DEFAULT_VIEW },
  )
  const target = useRef<{ lon: number; lat: number } | null>(null)
  /** Turns until the visitor first turns it themselves. */
  const spinning = useRef(true)
  const pointerInside = useRef(false)
  const drag = useRef<{ x: number; y: number; lon: number; lat: number; moved: boolean } | null>(null)
  const marks = useRef<Mark[]>([])
  const selectedRef = useRef(selected)
  /** Set by the drawing effect: redraw now / run the animation loop. */
  const api = useRef<{ draw: () => void; kick: () => void }>({ draw: () => {}, kick: () => {} })

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
    const R = Math.max(0, Math.min(width, height) / 2 - 14)
    const cx = width / 2
    const cy = height / 2
    const rScale = Math.max(0.5, R / 300)
    const labelSet = new Set(placed.slice(0, LABELS).map((t) => t.project))
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches

    const draw = () => {
      const v = view.current
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

      // Land, in four depth bands so each band is one fill.
      const cell = ((2 * Math.PI * R) / LAND_MASK.cols) * 0.24
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
          ctx.moveTo(x + r, y)
          ctx.arc(x, y, r, 0, Math.PI * 2)
        }
        ctx.globalAlpha = 0.14 + 0.36 * ((lo + hi) / 2)
        ctx.fill()
      }

      // Projects, largest first so small ones stay on top.
      const next: Mark[] = []
      const labels: { text: string; x: number; y: number; r: number }[] = []
      for (const t of placed) {
        const p = ds.projects[t.project]
        const phi = p.lat! * RAD
        const dl = p.lng! * RAD - lam0
        const cosDl = Math.cos(dl)
        const cosc = sinP0 * Math.sin(phi) + cosP0 * Math.cos(phi) * cosDl
        if (cosc <= 0.02) continue
        const x = cx + R * Math.cos(phi) * Math.sin(dl)
        const y = cy - R * (cosP0 * Math.sin(phi) - sinP0 * Math.cos(phi) * cosDl)
        const r = (3 + 24 * Math.sqrt(t.total / maxTotal)) * rScale * (0.55 + 0.45 * cosc)
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
        next.push({ t, x, y, r })
        if (cosc > 0.35 && labelSet.has(t.project)) {
          const owner = ds.accounts[p.owner]
          const name = owner?.name ?? p.title ?? ""
          labels.push({ text: name.length > 28 ? `${name.slice(0, 27)}…` : name, x, y, r })
        }
      }
      marks.current = next

      ctx.font = "600 11px Inter, system-ui, sans-serif"
      ctx.textBaseline = "middle"
      ctx.lineJoin = "round"
      ctx.lineWidth = 3
      for (const l of labels) {
        const fitsRight = l.x + l.r + 5 + ctx.measureText(l.text).width <= width
        const tx = fitsRight ? l.x + l.r + 5 : l.x - l.r - 5
        ctx.textAlign = fitsRight ? "left" : "right"
        ctx.strokeStyle = colors.bg
        ctx.globalAlpha = 0.9
        ctx.strokeText(l.text, tx, l.y)
        ctx.fillStyle = colors.fg
        ctx.globalAlpha = 1
        ctx.fillText(l.text, tx, l.y)
      }
      ctx.globalAlpha = 1
    }

    let raf = 0
    let last = 0
    let visible = true
    const tick = (now: number) => {
      const dt = last ? Math.min(0.1, (now - last) / 1000) : 0
      last = now
      const v = view.current
      let moving = false
      if (target.current) {
        const t = target.current
        const dLon = ((((t.lon - v.lon) % 360) + 540) % 360) - 180
        const dLat = t.lat - v.lat
        const k = reduceMotion ? 1 : 1 - Math.pow(0.002, dt)
        v.lon += dLon * k
        v.lat += dLat * k
        if (Math.abs(dLon) < 0.05 && Math.abs(dLat) < 0.05) {
          v.lon = t.lon
          v.lat = t.lat
          target.current = null
        } else moving = true
      } else if (spinning.current && !reduceMotion && !pointerInside.current && !drag.current) {
        v.lon += SPIN_DEG_PER_S * dt
        moving = true
      }
      draw()
      raf = moving && visible ? requestAnimationFrame(tick) : 0
    }
    const kick = () => {
      if (raf) return
      last = 0
      raf = requestAnimationFrame(tick)
    }
    api.current = { draw, kick }
    const io = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? true
      if (visible) kick()
    })
    io.observe(canvas)
    draw()
    kick()
    return () => {
      cancelAnimationFrame(raf)
      io.disconnect()
      api.current = { draw: () => {}, kick: () => {} }
    }
  }, [width, height, colors, placed, maxTotal, ds])

  // A project picked elsewhere (the map, the tiles) swings to the front.
  useEffect(() => {
    selectedRef.current = selected
    const p = selected >= 0 ? ds.projects[selected] : null
    if (p && p.lat != null && p.lng != null) {
      target.current = { lon: p.lng, lat: clamp(p.lat, -TILT_LIMIT, TILT_LIMIT) }
      spinning.current = false
    }
    api.current.kick()
    api.current.draw()
  }, [selected, ds])

  const local = (e: PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
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
  const R = Math.max(1, Math.min(width, height) / 2 - 14)

  return (
    <div
      ref={wrapRef}
      className="funding-globe"
      style={{ height }}
      tabIndex={0}
      role="group"
      aria-label="Globe of funded projects. Drag, or use the arrow keys, to turn it."
      onPointerEnter={() => {
        pointerInside.current = true
      }}
      onPointerLeave={() => {
        pointerInside.current = false
        setHover(null)
        api.current.kick()
      }}
      onPointerDown={(e) => {
        const { x, y } = local(e)
        drag.current = { x, y, lon: view.current.lon, lat: view.current.lat, moved: false }
        e.currentTarget.setPointerCapture(e.pointerId)
      }}
      onPointerMove={(e) => {
        const { x, y } = local(e)
        const d = drag.current
        if (d) {
          const dx = x - d.x
          const dy = y - d.y
          if (!d.moved && dx * dx + dy * dy < 16) return
          if (!d.moved) {
            d.moved = true
            spinning.current = false
            target.current = null
            setHover(null)
          }
          view.current.lon = d.lon - dx / R / RAD
          view.current.lat = clamp(d.lat + dy / R / RAD, -TILT_LIMIT, TILT_LIMIT)
          api.current.draw()
          return
        }
        const t = hit(x, y)
        setHover(t ? { t, x, y } : null)
      }}
      onPointerUp={(e) => {
        const d = drag.current
        drag.current = null
        if (d && !d.moved) {
          const { x, y } = local(e)
          const t = hit(x, y)
          if (t) onSelect(t.project)
        }
      }}
      onPointerCancel={() => {
        drag.current = null
      }}
      onKeyDown={(e: KeyboardEvent<HTMLDivElement>) => {
        const step = { ArrowLeft: [-20, 0], ArrowRight: [20, 0], ArrowUp: [0, 12], ArrowDown: [0, -12] }[e.key]
        if (!step) return
        e.preventDefault()
        spinning.current = false
        const from = target.current ?? view.current
        target.current = {
          lon: from.lon + step[0],
          lat: clamp(from.lat + step[1], -TILT_LIMIT, TILT_LIMIT),
        }
        api.current.kick()
      }}
    >
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={`Globe of ${formatCount(placed.length)} funded projects, sized by money received.`}
      />
      {hover ? <FundingProjectTip ds={ds} t={hover.t} x={hover.x} y={hover.y} width={width} /> : null}
    </div>
  )
}
