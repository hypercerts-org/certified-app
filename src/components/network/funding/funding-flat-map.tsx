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

const LAT_TOP = 76
const LAT_SPAN = 132
const LAT_MID = LAT_TOP - LAT_SPAN / 2
/** The middle of the map before anyone moves it. The seam then falls in
 *  the Pacific west of Alaska, so New Zealand, Fiji and Tonga sit together. */
const START_LNG = 10
/** Closest zoom, as a multiple of the whole world across the width: close
 *  enough to tell New Zealand's projects apart. */
const MAX_ZOOM = 12
/** Largest land dot, in pixels. Closer in, land is a finer grid of dots
 *  rather than bigger ones: the grid is 1.5 degrees, too coarse to draw. */
const MAX_DOT = 2.6
const MAX_HEIGHT = 1100
/** Names on the whole-world map; more as it zooms in, where they fit. */
const LABELS = 5

let landBits: Uint8Array | null = null

interface View {
  lng: number
  lat: number
  /** The visitor's zoom, on top of what the map's height gives. */
  z: number
}

interface Mark {
  t: ProjectTotal
  x: number
  y: number
  r: number
}

/** A longitude difference, brought into -180..180. */
const wrap = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180
const START: View = { lng: START_LNG, lat: LAT_MID, z: 1 }

/**
 * The flat map: the world as dots, each project a circle sized by the money
 * it received. Drag to move (it wraps round east and west), zoom with the
 * buttons, a pinch, Ctrl or ⌘ and the scroll wheel, a double-click, or the
 * keyboard; drag the bar underneath to make the map taller, which zooms in
 * with it. Hover a circle for the project, click to pick it.
 */
export default function FundingFlatMap({
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
  const [hover, setHover] = useState<{ t: ProjectTotal; x: number; y: number } | null>(null)

  // The whole world across the width; taller than that only by dragging.
  const baseH = Math.max(1, Math.round((width * LAT_SPAN) / 360))
  const maxH = Math.max(baseH, Math.min(baseH * 4, MAX_HEIGHT))
  const [dragged, setDragged] = useState<number | null>(null)
  const height = Math.min(maxH, Math.max(baseH, dragged ?? baseH))
  /** Pixels per degree at the visitor's zoom 1: a taller map is a closer one. */
  const unit = (width / 360) * (height / baseH)
  const zMax = Math.max(1, MAX_ZOOM / (height / baseH))

  const view = useRef<View>({ ...START })
  const target = useRef<View | null>(null)
  const marks = useRef<Mark[]>([])
  const selectedRef = useRef(selected)
  const kick = useRef<() => void>(() => {})
  /** The view, as far as the buttons need it. */
  const [ui, setUi] = useState({ z: 1, moved: false })

  /** Keep the map filling its box: zoom within limits, no sky below the
   *  land's north edge or south of it. */
  const clampView = (v: View, u = unit, h = height, max = zMax): View => {
    const z = Math.min(max, Math.max(1, v.z))
    const half = h / 2 / (u * z)
    const lo = LAT_TOP - LAT_SPAN + half
    const hi = LAT_TOP - half
    return { lng: wrap(v.lng), lat: lo > hi ? LAT_MID : Math.min(hi, Math.max(lo, v.lat)), z }
  }

  const sync = (v: View) => {
    const next = {
      z: v.z,
      moved: v.z > 1.001 || Math.abs(wrap(v.lng - START.lng)) > 0.01 || Math.abs(v.lat - START.lat) > 0.01,
    }
    setUi((prev) => (Math.abs(prev.z - next.z) < 0.001 && prev.moved === next.moved ? prev : next))
  }

  const go = (next: View, animate: boolean) => {
    const v = clampView(next)
    if (animate) target.current = v
    else {
      target.current = null
      view.current = v
    }
    sync(v)
    kick.current()
  }

  /** Zoom by `f` keeping the point under (x, y) where it is. */
  const zoomAt = (f: number, x: number, y: number, animate: boolean) => {
    const v = target.current ?? view.current
    const s = unit * v.z
    const z = Math.min(zMax, Math.max(1, v.z * f))
    const s2 = unit * z
    const dx = x - width / 2
    const dy = y - height / 2
    go({ lng: v.lng + dx / s - dx / s2, lat: v.lat - dy / s + dy / s2, z }, animate)
  }

  const reset = () => {
    setDragged(null)
    go({ ...START }, true)
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
      const v = view.current
      const s = unit * v.z
      go({ lng: v.lng - dx / s, lat: v.lat + dy / s, z: v.z }, false)
    },
    onZoom: (f, x, y, step) => zoomAt(f, x, y, step === true),
    onTap: (x, y) => {
      const t = hit(x, y)
      if (t) onSelect(t.project)
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
    landBits ??= unpackLandMask()
    const bits = landBits
    const scale = Math.max(0.45, width / 1000)
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const clampHere = (v: View) => clampView(v, unit, height, zMax)
    // A new size keeps the same middle and zoom: taller is closer.
    view.current = clampHere(view.current)

    const draw = () => {
      const v = view.current
      const s = unit * v.z
      const world = 360 * s
      /** Zoom relative to the whole world across the width. */
      const k = s / (width / 360)
      const cx = width / 2
      const cy = height / 2
      const xOf = (lng: number) => cx + wrap(lng - v.lng) * s
      const yOf = (lat: number) => cy - (lat - v.lat) * s
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, width, height)

      // Land: one path of dots.
      const dot = Math.min(MAX_DOT, Math.max(0.7, LAND_MASK.step * s * 0.26))
      ctx.fillStyle = colors.muted
      ctx.globalAlpha = 0.4
      ctx.beginPath()
      const plot = (x: number, y: number) => {
        if (x < -dot || x > width + dot) return
        ctx.moveTo(x + dot, y)
        ctx.arc(x, y, dot, 0, Math.PI * 2)
      }
      for (let row = 0; row < LAND_MASK.rows; row++) {
        const lat = LAND_MASK.lat0 - row * LAND_MASK.step
        if (lat < LAT_TOP - LAT_SPAN) break
        const y = yOf(lat)
        if (y < -dot || y > height + dot) continue
        for (let col = 0; col < LAND_MASK.cols; col++) {
          if (!bits[row * LAND_MASK.cols + col]) continue
          const x = xOf(LAND_MASK.lon0 + col * LAND_MASK.step)
          plot(x, y)
          // The same dot one world over, where the map wraps.
          if (x < dot) plot(x + world, y)
          else if (x > width - dot) plot(x - world, y)
        }
      }
      ctx.fill()

      // Projects, largest first so small circles stay on top and clickable.
      const grow = Math.pow(k, 0.2)
      const next: Mark[] = []
      for (const t of placed) {
        const p = ds.projects[t.project]
        const r = (3 + 24 * Math.sqrt(t.total / maxTotal)) * scale * grow
        const y = yOf(p.lat!)
        if (y < -r || y > height + r) continue
        const x0 = xOf(p.lng!)
        const isSel = t.project === selectedRef.current
        for (const x of [x0, x0 + world, x0 - world]) {
          if (x < -r || x > width + r) continue
          ctx.beginPath()
          ctx.arc(x, y, r, 0, Math.PI * 2)
          ctx.fillStyle = colors.fg
          ctx.globalAlpha = isSel ? 0.55 : 0.14
          ctx.fill()
          ctx.globalAlpha = isSel ? 1 : 0.7
          ctx.strokeStyle = colors.fg
          ctx.lineWidth = isSel ? 2 : 1
          ctx.stroke()
          next.push({ t, x, y, r })
        }
      }
      marks.current = next

      // Names of the largest projects in view, where they don't collide.
      ctx.font = "600 11px Inter, system-ui, sans-serif"
      ctx.textBaseline = "middle"
      ctx.lineJoin = "round"
      const limit = Math.min(24, Math.round(LABELS * Math.sqrt(k)))
      const boxes: { l: number; r: number; t: number; b: number }[] = []
      for (const m of next) {
        if (boxes.length >= limit) break
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
        // A halo in the page colour keeps the name legible over circles.
        ctx.lineWidth = 3
        ctx.strokeStyle = colors.bg
        ctx.globalAlpha = 0.9
        ctx.strokeText(text, tx, m.y)
        ctx.fillStyle = colors.fg
        ctx.globalAlpha = 1
        ctx.fillText(text, tx, m.y)
      }
      ctx.globalAlpha = 1
    }

    let raf = 0
    let last = 0
    const tick = (now: number) => {
      raf = 0
      const dt = last ? Math.min(0.1, (now - last) / 1000) : 0
      last = now
      const t = target.current
      if (t) {
        const v = view.current
        const a = reduceMotion ? 1 : 1 - Math.pow(0.0004, dt)
        const dLng = wrap(t.lng - v.lng)
        const next = clampHere({ lng: v.lng + dLng * a, lat: v.lat + (t.lat - v.lat) * a, z: v.z * Math.pow(t.z / v.z, a) })
        const done = Math.abs(dLng) < 0.01 && Math.abs(t.lat - v.lat) < 0.01 && Math.abs(t.z / v.z - 1) < 0.002
        view.current = done ? clampHere(t) : next
        if (done) target.current = null
      }
      draw()
      if (target.current) {
        raf = requestAnimationFrame(tick)
      } else last = 0
    }
    kick.current = () => {
      if (!raf) raf = requestAnimationFrame(tick)
    }
    draw()
    if (target.current) kick.current()
    return () => {
      cancelAnimationFrame(raf)
      kick.current = () => {}
    }
    // clampView reads unit, height and zMax, which are listed.
  }, [width, height, unit, zMax, colors, placed, maxTotal, ds]) // eslint-disable-line react-hooks/exhaustive-deps

  // A project picked elsewhere (the tiles, the list) comes into view.
  useEffect(() => {
    selectedRef.current = selected
    const p = selected >= 0 ? ds.projects[selected] : null
    if (p && p.lat != null && p.lng != null) {
      const v = view.current
      const s = unit * v.z
      const x = width / 2 + wrap(p.lng - v.lng) * s
      const y = height / 2 - (p.lat - v.lat) * s
      const margin = 40
      if (x < margin || x > width - margin || y < margin || y > height - margin) {
        target.current = clampView({ lng: p.lng, lat: p.lat, z: v.z })
      }
    }
    kick.current()
  }, [selected, ds]) // eslint-disable-line react-hooks/exhaustive-deps

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const v = target.current ?? view.current
    const s = unit * v.z
    const pan: Record<string, [number, number]> = {
      ArrowLeft: [-0.2, 0],
      ArrowRight: [0.2, 0],
      ArrowUp: [0, -0.2],
      ArrowDown: [0, 0.2],
    }
    if (pan[e.key]) {
      const [fx, fy] = pan[e.key]
      e.preventDefault()
      setHover(null)
      go({ lng: v.lng + (fx * width) / s, lat: v.lat - (fy * height) / s, z: v.z }, true)
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

  const zoomedIn = ui.z > 1.001
  const closer = zoomedIn || height > baseH
  return (
    <div className="funding-map-wrap">
      <div className="funding-map">
        <div
          ref={surfaceRef}
          className="funding-map__surface"
          style={{ height: height || undefined, touchAction: closer ? "none" : "pan-y", cursor: hover ? "pointer" : undefined }}
          tabIndex={0}
          role="group"
          aria-label="Map of funded projects. Drag or use the arrow keys to move it; zoom with the buttons, the plus and minus keys, or a pinch."
          onKeyDown={onKeyDown}
          {...gestures}
        >
          <canvas
            ref={canvasRef}
            role="img"
            aria-label={`Map of ${formatCount(placed.length)} funded projects, sized by money received.`}
          />
          {hover ? <FundingProjectTip ds={ds} t={hover.t} x={hover.x} y={hover.y} width={width} /> : null}
        </div>
        <MapZoomControls
          label="map"
          onZoomIn={() => zoomAt(2, width / 2, height / 2, true)}
          onZoomOut={() => zoomAt(0.5, width / 2, height / 2, true)}
          onReset={reset}
          canZoomIn={ui.z < zMax - 0.001}
          canZoomOut={zoomedIn}
          canReset={ui.moved || height > baseH}
        />
      </div>
      {width > 0 ? (
        <MapResizeHandle label="Map" height={height} min={baseH} max={maxH} onResize={setDragged} />
      ) : null}
    </div>
  )
}
