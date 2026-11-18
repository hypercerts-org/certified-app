"use client"

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react"
import { geoGraticule10, geoMercator, geoOrthographic, geoPath, type GeoPath, type GeoProjection } from "d3-geo"
import { worldOutlines } from "@/lib/map/countries"
import { getOverlayTileConfig, getTileConfig } from "@/lib/map/tiles"
import { useElementWidth } from "@/components/network/funding/use-element-width"
import { MapResizeHandle, MapZoomControls } from "@/components/network/funding/map-controls"
import { usePanZoom } from "@/components/network/funding/use-pan-zoom"
import { useMapColors, type MapColors } from "./map-colors"

/**
 * The /map canvas: the world as a flat map (Web Mercator, the projection
 * map tiles use) or a globe (orthographic), drawn from Natural Earth
 * outlines, with the page's layers on top (`draw`). Close in on the flat
 * map, satellite imagery fades in under the layers.
 *
 * Moving it works as on /funding: drag (or one finger) moves the map or
 * turns the globe; pinch, Ctrl or ⌘ with the scroll wheel, a double-click,
 * the buttons or the + and − keys zoom; the arrow keys move. A plain
 * scroll wheel scrolls the page.
 */

export type MapKind = "flat" | "globe"

export interface MapApi {
  kind: MapKind
  width: number
  height: number
  /** 1 is the whole world; higher is closer. */
  zoom: number
  ctx: CanvasRenderingContext2D
  /** d3-geo path bound to the canvas, for GeoJSON in [lng, lat]. */
  path: GeoPath
  colors: MapColors
  /** Screen position, or null when behind the globe. */
  project: (lng: number, lat: number) => [number, number] | null
  invert: (x: number, y: number) => [number, number] | null
  isVisible: (lng: number, lat: number, pad?: number) => boolean
  /** Kilometres per pixel at the centre. */
  kmPerPx: () => number
}

export interface WorldMapHandle {
  flyTo: (lng: number, lat: number, zoom?: number) => void
  fitBounds: (bounds: [[number, number], [number, number]], padding?: number) => void
  reset: () => void
  redraw: () => void
}

interface View {
  lng: number
  lat: number
  /** Zoom: 1 is the whole world. */
  k: number
}

const START: View = { lng: 12, lat: 18, k: 1 }
/** Close enough for a garden plot of a few hundred square metres to fill the map. */
const MAX_ZOOM = 80000
const NORTH = 84
const SOUTH = -60
/** Satellite imagery from this tile zoom (about a city across the map). */
const IMAGERY_FROM = 9
const KEY_PAN = 60
const IMAGERY_CREDIT = "Imagery © Esri, Maxar, Earthstar Geographics, and the GIS User Community"

const D2R = Math.PI / 180
const mercY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (Math.max(-89, Math.min(89, lat)) * D2R) / 2))
const mercLat = (y: number) => (2 * Math.atan(Math.exp(y)) - Math.PI / 2) / D2R
const wrap = (lng: number) => ((((lng + 180) % 360) + 360) % 360) - 180

function flatScale(w: number, k: number) {
  return (w / (2 * Math.PI)) * k
}
function globeScale(w: number, h: number, k: number) {
  return (Math.min(w, h) / 2 - 14) * k
}

/** The flat map never shows sea above or below the world: on a tall, narrow
 *  frame (a phone) it starts close enough for the land to fill the height. */
function minZoom(kind: MapKind, w: number, h: number): number {
  if (kind === "globe" || w <= 0) return 1
  return Math.max(1, h / ((mercY(NORTH) - mercY(SOUTH)) * flatScale(w, 1)))
}

/**
 * The latitudes most of the map's places fall in (2nd to 98th percentile,
 * plus a margin), or null with too few to tell. The flat map on a tall,
 * narrow frame (a phone) starts on this band instead of the whole height of
 * the world, most of which is Arctic in Mercator.
 */
export function latitudeBand(lats: readonly number[]): readonly [number, number] | null {
  const sorted = lats.filter((l) => Number.isFinite(l)).sort((a, b) => a - b)
  if (sorted.length < 5) return null
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))))]
  const south = Math.max(SOUTH, at(0.02) - 6)
  const north = Math.min(NORTH, at(0.98) + 6)
  return north - south >= 10 ? [south, north] : null
}

/** Where the map starts (and Reset returns): the whole world, or on a
 *  portrait flat frame (a phone), the band where the places are
 *  (`latitudeBand`), filling the frame's height. A landscape frame keeps
 *  the whole world's width rather than cropping it to the band. */
function startView(kind: MapKind, w: number, h: number, band: readonly [number, number] | null | undefined): View {
  if (kind !== "flat" || !band || w <= 0 || h <= 0 || h < w) return { ...START }
  const floor = minZoom(kind, w, h)
  if (floor <= 1) return { ...START }
  const [south, north] = band
  const k = Math.min(MAX_ZOOM, Math.max(floor, h / ((mercY(north) - mercY(south)) * flatScale(w, 1))))
  return { lng: START.lng, lat: mercLat((mercY(north) + mercY(south)) / 2), k }
}

function clampView(v: View, kind: MapKind, w: number, h: number): View {
  const k = Math.min(MAX_ZOOM, Math.max(minZoom(kind, w, h), v.k))
  if (kind === "globe") return { lng: wrap(v.lng), lat: Math.max(-80, Math.min(80, v.lat)), k }
  const s = flatScale(w, k)
  const half = h / 2 / s
  const lo = mercY(SOUTH) + half
  const hi = mercY(NORTH) - half
  const y = lo > hi ? (mercY(SOUTH) + mercY(NORTH)) / 2 : Math.min(hi, Math.max(lo, mercY(v.lat)))
  return { lng: wrap(v.lng), lat: mercLat(y), k }
}

function makeProjection(kind: MapKind, v: View, w: number, h: number): GeoProjection {
  if (kind === "globe") {
    return geoOrthographic()
      .rotate([-v.lng, -v.lat])
      .scale(globeScale(w, h, v.k))
      .translate([w / 2, h / 2])
      .clipAngle(90)
      .precision(0.3)
  }
  return geoMercator()
    .rotate([-v.lng, 0])
    .center([0, v.lat])
    .scale(flatScale(w, v.k))
    .translate([w / 2, h / 2])
    .clipExtent([
      [-2, -2],
      [w + 2, h + 2],
    ])
}

const GRATICULE = geoGraticule10()
const SPHERE = { type: "Sphere" } as const

/** Loaded imagery tiles by URL (a few hundred at most). */
const tiles = new Map<string, HTMLImageElement>()

/** A tile if loaded. Starts loading it only when `fetch` is still > 0 (it
 *  counts down), so a flight across the world never queues hundreds of
 *  tiles that the destination's then wait behind. */
function tile(url: string, onLoad: () => void, fetch: { left: number }): HTMLImageElement | null {
  let img = tiles.get(url)
  if (!img) {
    if (fetch.left <= 0) return null
    fetch.left--
    if (tiles.size > 400) tiles.delete(tiles.keys().next().value as string)
    img = new Image()
    img.decoding = "async"
    img.onload = onLoad
    img.src = url
    tiles.set(url, img)
  }
  return img.complete && img.naturalWidth > 0 ? img : null
}

function tileUrl(template: string, z: number, x: number, y: number) {
  return template.replace("{z}", String(z)).replace("{x}", String(x)).replace("{y}", String(y))
}

/** New tiles one frame may start loading. */
const TILE_FETCH_PER_FRAME = 30

/** Satellite tiles under the layers; returns whether any were drawn. While
 *  the map is flying (`moving`) only tiles already loaded are drawn. */
function drawImagery(ctx: CanvasRenderingContext2D, v: View, w: number, h: number, onLoad: () => void, moving: boolean): boolean {
  const s = flatScale(w, v.k)
  const z = Math.min(19, Math.round(Math.log2((2 * Math.PI * s) / 256)))
  if (z < IMAGERY_FROM) return false
  const n = 2 ** z
  const size = (2 * Math.PI * s) / n
  const cx = ((v.lng + 180) / 360) * n
  const cy = ((1 - mercY(v.lat) / Math.PI) / 2) * n
  const base = getTileConfig(undefined).url
  const labels = getOverlayTileConfig().url
  // Fade in over the first zoom level, so the switch isn't a jump.
  const fade = Math.min(1, Math.max(0, Math.log2((2 * Math.PI * s) / 256) - (IMAGERY_FROM - 0.5)))
  const fetch = { left: moving ? 0 : TILE_FETCH_PER_FRAME }
  ctx.save()
  ctx.globalAlpha = fade
  for (const template of [base, labels]) {
    for (let ty = Math.max(0, Math.floor(cy - h / 2 / size)); ty <= Math.min(n - 1, Math.floor(cy + h / 2 / size)); ty++) {
      for (let tx = Math.floor(cx - w / 2 / size); tx <= Math.floor(cx + w / 2 / size); tx++) {
        const img = tile(tileUrl(template, z, ((tx % n) + n) % n, ty), onLoad, fetch)
        if (!img) continue
        const x = w / 2 + (tx - cx) * size
        const y = h / 2 + (ty - cy) * size
        ctx.drawImage(img, x, y, size + 0.5, size + 0.5)
      }
    }
  }
  ctx.restore()
  return fade > 0
}

interface Props {
  kind: MapKind
  height: number
  /** What the map shows, for assistive tech. */
  label: string
  /** Draw the page's layers. Called on every frame. */
  draw: (api: MapApi) => void
  /** Whatever `draw` depends on; a change redraws. */
  drawKey: unknown
  /** Pointer over the map (nothing pressed). Return true if something can be clicked there. */
  onHover?: (x: number, y: number, api: MapApi) => boolean
  onLeave?: () => void
  onTap?: (x: number, y: number, api: MapApi) => void
  /** After the view changed (at most once a frame). */
  onView?: (api: MapApi) => void
  /** A bar under the map that drags it taller. */
  resize?: { min: number; max: number; onResize: (height: number) => void }
  /** Overlays inside the map box (hover cards). */
  children?: ReactNode
  /** The latitudes the data is in (`latitudeBand`): a phone's flat map
   *  starts there rather than on the whole world's height. */
  startBand?: readonly [number, number] | null
}

const WorldMap = forwardRef<WorldMapHandle, Props>(function WorldMap(
  { kind, height, label, draw, drawKey, onHover, onLeave, onTap, onView, resize, children, startBand = null },
  ref,
) {
  const [measure, width] = useElementWidth<HTMLDivElement>()
  const box = useRef<HTMLDivElement | null>(null)
  const boxRef = useCallback(
    (node: HTMLDivElement | null) => {
      box.current = node
      measure(node)
    },
    [measure],
  )
  const canvas = useRef<HTMLCanvasElement>(null)
  const colors = useMapColors()

  const view = useRef<View>({ ...START })
  // The start view is placed on the first paint with a size (it depends on
  // the frame's shape).
  const placed = useRef(false)
  const anim = useRef<number>(0)
  const frame = useRef<number>(0)
  const api = useRef<MapApi | null>(null)
  const [ui, setUi] = useState({ k: 1, moved: false, imagery: false, kMin: 1 })
  const [pointing, setPointing] = useState(false)

  // The latest props, for the drawing loop and gesture handlers.
  const props = useRef({ kind, width, height, draw, onHover, onLeave, onTap, onView, colors, startBand })
  useEffect(() => {
    props.current = { kind, width, height, draw, onHover, onLeave, onTap, onView, colors, startBand }
  })

  const paint = useCallback(() => {
    frame.current = 0
    const { kind: kd, width: w, height: h, draw: drawLayers, onView: viewed, colors: c } = props.current
    const el = canvas.current
    if (!el || w <= 0 || h <= 0 || !c.key) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    if (el.width !== Math.round(w * dpr) || el.height !== Math.round(h * dpr)) {
      el.width = Math.round(w * dpr)
      el.height = Math.round(h * dpr)
      el.style.width = `${w}px`
      el.style.height = `${h}px`
    }
    const ctx = el.getContext("2d")
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)

    if (!placed.current) {
      placed.current = true
      view.current = startView(kd, w, h, props.current.startBand)
    }
    const v = clampView(view.current, kd, w, h)
    view.current = v
    const projection = makeProjection(kd, v, w, h)
    const path = geoPath(projection, ctx)
    const center: [number, number] = [v.lng, v.lat]
    const project = (lng: number, lat: number): [number, number] | null => {
      if (kd === "globe") {
        const r = projection.rotate()
        // Behind the globe: more than 90° from the centre.
        const a = Math.sin(lat * D2R) * Math.sin(-r[1] * D2R) + Math.cos(lat * D2R) * Math.cos(-r[1] * D2R) * Math.cos((lng + r[0]) * D2R)
        if (a < 0) return null
      }
      const p = projection([lng, lat])
      return p && Number.isFinite(p[0]) ? [p[0], p[1]] : null
    }
    const invert = (x: number, y: number): [number, number] | null => {
      const ll = projection.invert?.([x, y])
      return ll && Number.isFinite(ll[0]) ? [ll[0], ll[1]] : null
    }
    const a: MapApi = {
      kind: kd,
      width: w,
      height: h,
      zoom: v.k,
      ctx,
      path,
      colors: c,
      project,
      invert,
      isVisible: (lng, lat, pad = 0) => {
        const p = project(lng, lat)
        return !!p && p[0] >= -pad && p[0] <= w + pad && p[1] >= -pad && p[1] <= h + pad
      },
      kmPerPx: () => {
        const scale = kd === "globe" ? globeScale(w, h, v.k) : flatScale(w, v.k) / Math.cos(center[1] * D2R)
        return 6371 / scale
      },
    }
    api.current = a

    // Basemap.
    const { land, borders } = worldOutlines()
    if (kd === "flat") {
      ctx.fillStyle = c.sea
      ctx.fillRect(0, 0, w, h)
    } else {
      ctx.beginPath()
      path(SPHERE)
      ctx.fillStyle = c.sea
      ctx.fill()
      ctx.beginPath()
      path(GRATICULE)
      ctx.strokeStyle = c.border
      ctx.lineWidth = 0.75
      ctx.stroke()
    }
    ctx.beginPath()
    path(land)
    ctx.fillStyle = c.land
    ctx.fill()
    const imagery = kd === "flat" && drawImagery(ctx, v, w, h, () => redraw(), anim.current !== 0)
    ctx.beginPath()
    path(borders)
    ctx.strokeStyle = imagery ? c.halo : c.border
    ctx.lineWidth = v.k > 4 ? 1 : 0.6
    ctx.stroke()
    if (kd === "globe") {
      ctx.beginPath()
      path(SPHERE)
      ctx.strokeStyle = c.border
      ctx.lineWidth = 1
      ctx.stroke()
    }

    ctx.save()
    drawLayers(a)
    ctx.restore()

    const sv = clampView(startView(kd, w, h, props.current.startBand), kd, w, h)
    const moved = v.k > sv.k + 0.001 || Math.abs(wrap(v.lng - sv.lng)) > 0.01 || Math.abs(v.lat - sv.lat) > 0.5
    const kMin = minZoom(kd, w, h)
    setUi((prev) =>
      Math.abs(prev.k - v.k) < 0.001 && prev.moved === moved && prev.imagery === imagery && prev.kMin === kMin
        ? prev
        : { k: v.k, moved, imagery, kMin },
    )
    viewed?.(a)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- redraw is stable and defined below
  }, [])

  const redraw = useCallback(() => {
    if (!frame.current) frame.current = requestAnimationFrame(paint)
  }, [paint])

  useEffect(() => {
    redraw()
  }, [redraw, kind, width, height, colors.key, drawKey])
  useEffect(
    () => () => {
      // Clear the ids too: a remount (Strict Mode) must be able to schedule again.
      cancelAnimationFrame(frame.current)
      cancelAnimationFrame(anim.current)
      frame.current = 0
      anim.current = 0
    },
    [],
  )

  const stopAnim = () => {
    cancelAnimationFrame(anim.current)
    anim.current = 0
  }

  /** Animate to a view: a short flight, or a jump with reduced motion. */
  const animateTo = useCallback(
    (target: View) => {
      cancelAnimationFrame(anim.current)
      const { kind: kd, width: w, height: h } = props.current
      const to = clampView(target, kd, w, h)
      const from = { ...view.current }
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
      if (reduce) {
        view.current = to
        redraw()
        return
      }
      const dLng = wrap(to.lng - from.lng)
      const far = Math.hypot(dLng, to.lat - from.lat)
      const dur = Math.min(1400, 500 + far * 6 + Math.abs(Math.log2(to.k / from.k)) * 60)
      // Zoom out a little on long trips, so the eye can follow.
      const lk0 = Math.log(from.k)
      const lk1 = Math.log(to.k)
      const lkMid = Math.min(lk0, lk1) - Math.min(1.2, far / 60)
      const t0 = performance.now()
      const step = (now: number) => {
        const t = Math.min(1, (now - t0) / dur)
        const e = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2
        const lk = (1 - e) * (1 - e) * lk0 + 2 * (1 - e) * e * lkMid + e * e * lk1
        view.current = { lng: from.lng + dLng * e, lat: from.lat + (to.lat - from.lat) * e, k: Math.exp(lk) }
        paint()
        if (t < 1) anim.current = requestAnimationFrame(step)
        else {
          anim.current = 0
          // Arrived: draw once more, now loading the tiles for here.
          redraw()
        }
      }
      anim.current = requestAnimationFrame(step)
    },
    [paint, redraw],
  )

  useImperativeHandle(
    ref,
    () => ({
      flyTo: (lng, lat, zoom) => animateTo({ lng, lat, k: zoom ?? Math.max(view.current.k, 24) }),
      fitBounds: ([[w0, s], [e, n]], padding = 48) => {
        const { kind: kd, width: w, height: h } = props.current
        const east = e < w0 ? e + 360 : e
        const lng = wrap((w0 + east) / 2)
        if (kd === "globe") {
          const span = Math.max(east - w0, (n - s) * 1.2, 0.002)
          const k = Math.max(1, Math.min(MAX_ZOOM, (Math.min(w, h) / 2 - padding) / (globeScale(w, h, 1) * Math.sin(Math.min(Math.PI / 2, (span / 2) * D2R)))))
          animateTo({ lng, lat: (s + n) / 2, k })
          return
        }
        const dx = Math.max(1e-6, (east - w0) * D2R)
        const dy = Math.max(1e-6, mercY(n) - mercY(s))
        const k = Math.max(1, Math.min(MAX_ZOOM, Math.min((w - 2 * padding) / dx, (h - 2 * padding) / dy) / flatScale(w, 1)))
        animateTo({ lng, lat: mercLat((mercY(n) + mercY(s)) / 2), k })
      },
      reset: () => {
        const { kind: kd, width: w, height: h, startBand: band } = props.current
        animateTo(startView(kd, w, h, band))
      },
      redraw,
    }),
    [animateTo, redraw],
  )

  /** Zoom by `f` keeping the point under (x, y) where it is. */
  const zoomAt = (f: number, x: number, y: number, animate = false) => {
    const { kind: kd, width: w, height: h } = props.current
    const v = view.current
    const k = Math.min(MAX_ZOOM, Math.max(minZoom(kd, w, h), v.k * f))
    if (kd === "globe") {
      const next = { ...v, k }
      if (animate) animateTo(next)
      else {
        stopAnim()
        view.current = next
        redraw()
      }
      return
    }
    const s0 = flatScale(w, v.k)
    const s1 = flatScale(w, k)
    const dx = x - w / 2
    const dy = y - h / 2
    // The point under the pointer, in projected units, stays put.
    const px = v.lng * D2R + dx / s0
    const py = mercY(v.lat) - dy / s0
    const next = { lng: (px - dx / s1) / D2R, lat: mercLat(py + dy / s1), k }
    if (animate) animateTo(next)
    else {
      stopAnim()
      view.current = clampView(next, kd, w, h)
      redraw()
    }
  }

  const panBy = (dx: number, dy: number) => {
    stopAnim()
    const { kind: kd, width: w, height: h } = props.current
    const v = view.current
    if (kd === "globe") {
      const degPerPx = 1 / D2R / globeScale(w, h, v.k)
      view.current = clampView({ lng: v.lng - dx * degPerPx, lat: v.lat + dy * degPerPx, k: v.k }, kd, w, h)
    } else {
      const s = flatScale(w, v.k)
      view.current = clampView({ lng: v.lng - dx / s / D2R, lat: mercLat(mercY(v.lat) + dy / s), k: v.k }, kd, w, h)
    }
    redraw()
  }

  const gestures = usePanZoom(box, {
    onPan: panBy,
    onZoom: (f, x, y, step) => zoomAt(f, x, y, step),
    onTap: (x, y) => {
      if (api.current) props.current.onTap?.(x, y, api.current)
    },
    onHover: (x, y) => {
      const a = api.current
      const hit = a && props.current.onHover ? props.current.onHover(x, y, a) : false
      setPointing((prev) => (prev === hit ? prev : hit))
    },
    onLeave: () => {
      setPointing(false)
      props.current.onLeave?.()
    },
  })

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const { width: w, height: h } = props.current
    switch (e.key) {
      case "ArrowLeft":
        panBy(KEY_PAN, 0)
        break
      case "ArrowRight":
        panBy(-KEY_PAN, 0)
        break
      case "ArrowUp":
        panBy(0, KEY_PAN)
        break
      case "ArrowDown":
        panBy(0, -KEY_PAN)
        break
      case "+":
      case "=":
        zoomAt(2, w / 2, h / 2, true)
        break
      case "-":
      case "_":
        zoomAt(0.5, w / 2, h / 2, true)
        break
      default:
        return
    }
    e.preventDefault()
  }

  const label3 = kind === "globe" ? "globe" : "map"
  return (
    <div className="world-map">
      <div
        ref={boxRef}
        className={`world-map__surface${pointing ? " world-map__surface--pointing" : ""}`}
        style={{ height }}
        role="application"
        aria-roledescription={label3}
        aria-label={`${label}. Drag or use the arrow keys to move, plus and minus to zoom.`}
        tabIndex={0}
        onKeyDown={onKeyDown}
        {...gestures}
      >
        <canvas ref={canvas} className="world-map__canvas" aria-hidden />
        {children}
      </div>
      <MapZoomControls
        label={label3}
        onZoomIn={() => zoomAt(2, width / 2, height / 2, true)}
        onZoomOut={() => zoomAt(0.5, width / 2, height / 2, true)}
        onReset={() => animateTo(startView(kind, width, height, startBand))}
        canZoomIn={ui.k < MAX_ZOOM - 1}
        canZoomOut={ui.k > ui.kMin + 0.001}
        canReset={ui.moved}
      />
      {ui.imagery ? <p className="world-map__credit">{IMAGERY_CREDIT}</p> : null}
      {resize ? (
        <MapResizeHandle label={label3 === "globe" ? "Globe" : "Map"} height={height} min={resize.min} max={resize.max} onResize={resize.onResize} />
      ) : null}
    </div>
  )
})

export default WorldMap
