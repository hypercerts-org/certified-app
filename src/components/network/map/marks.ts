import type { LayerCounts } from "@/lib/map/model"
import type { MapColors } from "./map-colors"

/**
 * Marks for the /map canvas. Each layer has its own shape as well as its
 * own colour, so nothing rests on colour alone: an activity is a dot, a
 * project a ring, an organization's base a square, a place not used yet a
 * small hollow circle. A project with its activities on the same spot is a
 * ringed dot. Every mark has a halo in the land colour.
 */

export const MARK_R = 4.5

export function dot(ctx: CanvasRenderingContext2D, c: MapColors, x: number, y: number, r = MARK_R) {
  ctx.beginPath()
  ctx.arc(x, y, r + 1.75, 0, Math.PI * 2)
  ctx.fillStyle = c.halo
  ctx.fill()
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fillStyle = c.activity
  ctx.fill()
}

export function ring(ctx: CanvasRenderingContext2D, c: MapColors, x: number, y: number, r = MARK_R + 2.5) {
  const w = Math.max(2, r * 0.38)
  ctx.beginPath()
  ctx.arc(x, y, r - w / 2, 0, Math.PI * 2)
  ctx.lineWidth = w + 3.5
  ctx.strokeStyle = c.halo
  ctx.stroke()
  ctx.lineWidth = w
  ctx.strokeStyle = c.project
  ctx.stroke()
}

/** A project with its activities here: the activity dot inside the ring. */
export function ringDot(ctx: CanvasRenderingContext2D, c: MapColors, x: number, y: number) {
  ring(ctx, c, x, y, MARK_R + 3.5)
  ctx.beginPath()
  ctx.arc(x, y, MARK_R - 0.5, 0, Math.PI * 2)
  ctx.fillStyle = c.activity
  ctx.fill()
}

export function square(ctx: CanvasRenderingContext2D, c: MapColors, x: number, y: number, r = MARK_R - 0.5) {
  const s = r * 1.8
  ctx.fillStyle = c.halo
  ctx.fillRect(x - s / 2 - 1.75, y - s / 2 - 1.75, s + 3.5, s + 3.5)
  ctx.fillStyle = c.org
  ctx.fillRect(x - s / 2, y - s / 2, s, s)
}

export function hollow(ctx: CanvasRenderingContext2D, c: MapColors, x: number, y: number, r = MARK_R - 0.5) {
  ctx.beginPath()
  ctx.arc(x, y, r + 1, 0, Math.PI * 2)
  ctx.fillStyle = c.halo
  ctx.fill()
  ctx.beginPath()
  ctx.arc(x, y, r - 0.25, 0, Math.PI * 2)
  ctx.lineWidth = 1.5
  ctx.strokeStyle = c.unused
  ctx.stroke()
}

/** The mark for whatever sits at one spot, by what it holds. Returns its radius. */
export function spotMark(ctx: CanvasRenderingContext2D, c: MapColors, x: number, y: number, n: LayerCounts): number {
  let r = MARK_R
  if (n.project > 0 && n.activity > 0) {
    ringDot(ctx, c, x, y)
    r = MARK_R + 3.5
  } else if (n.project > 0) {
    ring(ctx, c, x, y)
    r = MARK_R + 2.5
  } else if (n.activity > 0) dot(ctx, c, x, y)
  else if (n.org > 0) square(ctx, c, x, y)
  else hollow(ctx, c, x, y)
  // An organization based here as well: a small square on the shoulder.
  if (n.org > 0 && (n.activity > 0 || n.project > 0)) square(ctx, c, x + r + 1, y - r - 1, 2.6)
  const total = n.activity + n.project + n.org + n.unused
  const kinds = (n.activity > 0 ? 1 : 0) + (n.project > 0 ? 1 : 0) + (n.org > 0 ? 1 : 0) + (n.unused > 0 ? 1 : 0)
  // More than one record of a kind: say how many beside the mark.
  if (total > kinds) badge(ctx, c, x + r + 2, y + r - 1, String(total))
  return r
}

export function selectRing(ctx: CanvasRenderingContext2D, c: MapColors, x: number, y: number, r: number) {
  ctx.beginPath()
  ctx.arc(x, y, r + 4.5, 0, Math.PI * 2)
  ctx.lineWidth = 2
  ctx.strokeStyle = c.fg
  ctx.stroke()
}

let fontFamily = ""
export function font(weight: number, px: number): string {
  if (!fontFamily && typeof document !== "undefined") fontFamily = getComputedStyle(document.body).fontFamily
  return `${weight} ${px}px ${fontFamily || "system-ui, sans-serif"}`
}

function badge(ctx: CanvasRenderingContext2D, c: MapColors, x: number, y: number, text: string) {
  ctx.font = font(600, 10)
  const w = Math.max(14, ctx.measureText(text).width + 8)
  roundRect(ctx, x, y - 7, w, 14, 7)
  ctx.fillStyle = c.elevated
  ctx.fill()
  ctx.lineWidth = 1
  ctx.strokeStyle = c.border
  ctx.stroke()
  ctx.fillStyle = c.fg
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.fillText(text, x + w / 2, y + 0.5)
}

/** A group of spots too close to tell apart: a pill counting each layer
 *  with its own small mark ("● 12  ◯ 11"). Returns its box for hit tests. */
export function pill(
  ctx: CanvasRenderingContext2D,
  c: MapColors,
  x: number,
  y: number,
  n: LayerCounts,
): { x: number; y: number; w: number; h: number } {
  const parts: { kind: keyof LayerCounts; text: string }[] = []
  for (const kind of ["activity", "project", "org", "unused"] as const) {
    if (n[kind] > 0) parts.push({ kind, text: compact(n[kind]) })
  }
  ctx.font = font(600, 11)
  const gap = 6
  const markW = 9
  let w = 10
  for (const p of parts) w += markW + 4 + ctx.measureText(p.text).width + gap
  w = w - gap + 10 - 4
  const h = 20
  const left = x - w / 2
  const top = y - h / 2
  roundRect(ctx, left - 1.5, top - 1.5, w + 3, h + 3, (h + 3) / 2)
  ctx.fillStyle = c.halo
  ctx.fill()
  roundRect(ctx, left, top, w, h, h / 2)
  ctx.fillStyle = c.elevated
  ctx.fill()
  ctx.lineWidth = 1
  ctx.strokeStyle = c.border
  ctx.stroke()
  let cx = left + 8
  ctx.textAlign = "left"
  ctx.textBaseline = "middle"
  for (const p of parts) {
    const mx = cx + markW / 2
    if (p.kind === "activity") {
      ctx.beginPath()
      ctx.arc(mx, y, 3.5, 0, Math.PI * 2)
      ctx.fillStyle = c.activity
      ctx.fill()
    } else if (p.kind === "project") {
      ctx.beginPath()
      ctx.arc(mx, y, 3.4, 0, Math.PI * 2)
      ctx.lineWidth = 2
      ctx.strokeStyle = c.project
      ctx.stroke()
    } else if (p.kind === "org") {
      ctx.fillStyle = c.org
      ctx.fillRect(mx - 3.5, y - 3.5, 7, 7)
    } else {
      ctx.beginPath()
      ctx.arc(mx, y, 3.2, 0, Math.PI * 2)
      ctx.lineWidth = 1.5
      ctx.strokeStyle = c.unused
      ctx.stroke()
    }
    cx += markW + 4
    ctx.fillStyle = c.fg
    ctx.fillText(p.text, cx, y + 0.5)
    cx += ctx.measureText(p.text).width + gap
  }
  return { x: left, y: top, w, h }
}

export function compact(n: number): string {
  return n >= 10000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, h / 2, w / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.arcTo(x + w, y, x + w, y + h, rr)
  ctx.arcTo(x + w, y + h, x, y + h, rr)
  ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + w, y, rr)
  ctx.closePath()
}

const patterns = new Map<string, CanvasPattern | null>()

/** Diagonal hatching in a colour: how the map says "somewhere in this
 *  country" without inventing a spot. */
export function hatch(ctx: CanvasRenderingContext2D, color: string): CanvasPattern | null {
  const key = color
  if (patterns.has(key)) return patterns.get(key) ?? null
  const size = 8
  const tile = document.createElement("canvas")
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  tile.width = size * dpr
  tile.height = size * dpr
  const t = tile.getContext("2d")
  if (!t) return null
  t.scale(dpr, dpr)
  t.strokeStyle = color
  t.lineWidth = 1.25
  t.beginPath()
  for (let i = -size; i <= size * 2; i += size) {
    t.moveTo(i, size)
    t.lineTo(i + size, 0)
  }
  t.stroke()
  const p = ctx.createPattern(tile, "repeat")
  if (p && dpr !== 1) p.setTransform(new DOMMatrix().scale(1 / dpr))
  patterns.set(key, p)
  return p
}

/** A label with a halo, for country counts and place names on the map. */
export function haloText(
  ctx: CanvasRenderingContext2D,
  c: MapColors,
  text: string,
  x: number,
  y: number,
  o: { weight?: number; size?: number; align?: CanvasTextAlign; color?: string } = {},
) {
  ctx.font = font(o.weight ?? 500, o.size ?? 11)
  ctx.textAlign = o.align ?? "center"
  ctx.textBaseline = "middle"
  ctx.lineJoin = "round"
  ctx.lineWidth = 3.5
  ctx.strokeStyle = c.halo
  ctx.strokeText(text, x, y)
  ctx.fillStyle = o.color ?? c.fg
  ctx.fillText(text, x, y)
}
