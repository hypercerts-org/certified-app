import type { MultiPolygon } from "geojson"
import { LAYERS, emptyCounts, type LayerCounts, type Spot } from "@/lib/map/model"
import type { MapColors } from "./map-colors"
import type { MapApi } from "./world-map"
import { MARK_R, pill, selectRing, spotMark } from "./marks"

/**
 * Drawing spots on the /map canvas, shared by the views: approximate places
 * as discs at their true size, drawn areas as outlines once big enough to
 * see, and the spots themselves as marks, grouped into pills where they are
 * too close to tell apart. Returns what was drawn, for hit tests.
 */

/** How close (in pixels) spots must be to share a group's pill. */
const CLUSTER_W = 64
const CLUSTER_H = 26
/** A drawn area shows its outline once it is this wide on screen. */
const OUTLINE_PX = 12
/** Drawn areas larger than this are regions: an edge only, never a fill. */
const REGION_KM2 = 10_000

export interface SpotHits {
  marks: { x: number; y: number; r: number; spot: Spot }[]
  pills: { x: number; y: number; w: number; h: number; spots: Spot[] }[]
}

export const NO_HITS: SpotHits = { marks: [], pills: [] }

/** The layer colour a spot's disc or outline takes: its busiest kind first. */
export function spotColor(s: Spot, c: MapColors): string {
  return s.counts.activity > 0 ? c.activity : s.counts.project > 0 ? c.project : s.counts.org > 0 ? c.org : c.unused
}

export function sumCounts(spots: readonly Spot[]): LayerCounts {
  const n = emptyCounts()
  for (const s of spots) for (const k of LAYERS) n[k] += s.counts[k]
  return n
}

/** Approximate places: a soft disc at their true radius, fainter as it
 *  grows (close in, a 10 km circle is the whole view and must not hide
 *  what is inside it). */
export function drawApproxDiscs(a: MapApi, spots: readonly Spot[]) {
  const { ctx, colors: c } = a
  const kmpp = a.kmPerPx()
  for (const s of spots) {
    if (s.prec !== "approx" || !s.radiusKm) continue
    const r = s.radiusKm / kmpp
    if (r < MARK_R + 3) continue
    const p = a.project(s.lng, s.lat)
    if (!p) continue
    ctx.save()
    ctx.beginPath()
    ctx.arc(p[0], p[1], r, 0, Math.PI * 2)
    ctx.fillStyle = spotColor(s, c)
    ctx.globalAlpha = 0.14 * Math.min(1, 50 / r)
    ctx.fill()
    ctx.globalAlpha = r > 150 ? 0.35 : 0.6
    ctx.setLineDash([4, 4])
    ctx.lineWidth = 1
    ctx.strokeStyle = ctx.fillStyle
    ctx.stroke()
    ctx.restore()
  }
}

/** Drawn areas: their outline once big enough to see. Regions (or shapes
 *  bigger than the view) get a thin dashed edge and no fill; a place nobody
 *  uses yet a dashed edge. */
export function drawAreaOutlines(a: MapApi, spots: readonly Spot[], highlight: readonly (string | null | undefined)[] = []) {
  const { ctx, colors: c } = a
  for (const s of spots) {
    if (!s.area) continue
    const feature = { type: "MultiPolygon", coordinates: s.area } as MultiPolygon
    const [[x0, y0], [x1, y1]] = a.path.bounds(feature)
    if (!Number.isFinite(x0) || Math.max(x1 - x0, y1 - y0) < OUTLINE_PX) continue
    const huge = (s.km2 ?? 0) > REGION_KM2 || x1 - x0 > a.width * 1.5 || y1 - y0 > a.height * 1.5
    const on = highlight.includes(s.key)
    const unusedOnly = s.counts.unused > 0 && s.counts.activity + s.counts.project + s.counts.org === 0
    ctx.save()
    ctx.beginPath()
    a.path(feature)
    ctx.fillStyle = spotColor(s, c)
    if (!huge) {
      ctx.globalAlpha = 0.16
      ctx.fill()
    }
    ctx.globalAlpha = huge && !on ? 0.45 : 0.9
    ctx.lineWidth = on ? 2.5 : huge ? 1 : 1.5
    if (huge || unusedOnly) ctx.setLineDash([4, 3])
    ctx.strokeStyle = ctx.fillStyle
    ctx.stroke()
    ctx.restore()
  }
}

/** The spots' marks, grouped greedily (busiest first) into pills where they
 *  would overlap. Highlighted spots get a ring, even inside a pill. */
export function drawSpotMarks(a: MapApi, spots: readonly Spot[], highlight: readonly (string | null | undefined)[] = []): SpotHits {
  const { ctx, colors: c } = a
  const cells: { x: number; y: number; cx: number; cy: number; spots: Spot[] }[] = []
  const order = spots
    .map((s) => ({ s, p: a.project(s.lng, s.lat) }))
    .filter(
      (e): e is { s: Spot; p: [number, number] } =>
        !!e.p && e.p[0] > -40 && e.p[0] < a.width + 40 && e.p[1] > -40 && e.p[1] < a.height + 40,
    )
    .sort((p, q) => q.s.items.length - p.s.items.length)
  for (const { s, p } of order) {
    let cell = cells.find((g) => Math.abs(g.cx - p[0]) < CLUSTER_W && Math.abs(g.cy - p[1]) < CLUSTER_H)
    if (!cell) {
      cell = { x: 0, y: 0, cx: p[0], cy: p[1], spots: [] }
      cells.push(cell)
    }
    cell.x += p[0]
    cell.y += p[1]
    cell.spots.push(s)
  }
  const hits: SpotHits = { marks: [], pills: [] }
  const singles: { x: number; y: number; spot: Spot }[] = []
  for (const cell of cells) {
    if (cell.spots.length === 1) {
      singles.push({ x: cell.cx, y: cell.cy, spot: cell.spots[0] })
      continue
    }
    const box = pill(ctx, c, cell.x / cell.spots.length, cell.y / cell.spots.length, sumCounts(cell.spots))
    hits.pills.push({ ...box, spots: cell.spots })
  }
  for (const m of singles) {
    const r = spotMark(ctx, c, m.x, m.y, m.spot.counts)
    if (highlight.includes(m.spot.key)) selectRing(ctx, c, m.x, m.y, r)
    hits.marks.push({ x: m.x, y: m.y, r, spot: m.spot })
  }
  for (const key of highlight) {
    if (!key || hits.marks.some((m) => m.spot.key === key)) continue
    const s = spots.find((x) => x.key === key)
    const p = s && a.project(s.lng, s.lat)
    if (p) selectRing(ctx, c, p[0], p[1], MARK_R)
  }
  return hits
}

/** What is under (x, y): a mark (topmost first), else a pill, else null. */
export function hitSpots(
  hits: SpotHits,
  x: number,
  y: number,
): { type: "spot"; spot: Spot } | { type: "pill"; spots: Spot[] } | null {
  for (let i = hits.marks.length - 1; i >= 0; i--) {
    const m = hits.marks[i]
    if (Math.hypot(m.x - x, m.y - y) <= m.r + 5) return { type: "spot", spot: m.spot }
  }
  for (let i = hits.pills.length - 1; i >= 0; i--) {
    const p = hits.pills[i]
    if (x >= p.x - 3 && x <= p.x + p.w + 3 && y >= p.y - 3 && y <= p.y + p.h + 3) return { type: "pill", spots: p.spots }
  }
  return null
}

/** The box around a set of spots, a little padded, for fitBounds. */
export function spotsBounds(spots: readonly Spot[]): [[number, number], [number, number]] {
  let w = Infinity
  let s = Infinity
  let e = -Infinity
  let n = -Infinity
  for (const p of spots) {
    w = Math.min(w, p.lng)
    e = Math.max(e, p.lng)
    s = Math.min(s, p.lat)
    n = Math.max(n, p.lat)
  }
  const pad = 0.02
  return [
    [w - pad, s - pad],
    [e + pad, n + pad],
  ]
}
