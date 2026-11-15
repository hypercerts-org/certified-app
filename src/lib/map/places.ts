import { geoArea, geoCentroid, geoDistance } from "d3-geo"
import { splitLocationName } from "@/lib/atproto/location"
import { countryByName, countryCenter } from "./countries"
import type { MapPolygon, Precision } from "./dataset-types"

/**
 * Reading one location record into something a map can draw, and saying how
 * exactly it was recorded. Pure: the server build feeds it the record's
 * fields and the text of its attached file, if any.
 *
 * Formats in use on the network (`locationType`): coordinate-decimal
 * ("lat,lng"), geojson-point, geojson-polygon (not in the schema's list, but
 * common), geojson, country-code (ISO 3166-1 alpha-2) and address.
 */

export const EARTH_RADIUS_KM = 6371.0088

export type PlaceReading =
  | {
      ok: true
      lng: number
      lat: number
      prec: Precision
      /** Drawn areas, simplified. */
      polygons: MapPolygon[] | null
      km2: number | null
      radiusKm: number | null
    }
  | { ok: false; reason: "empty" | "link" | "zero" | "projected" | "unreadable" | "unsupported" }

export interface PlaceInput {
  locationType: string | null
  /** The inline string, the URI, or the attached file's text. */
  text: string | null
  name: string | null
}

/** The owner's name for a place, without a geocoder's leading Plus Code. */
export function cleanPlaceName(name: string | null | undefined): string | null {
  if (!name) return null
  const n = splitLocationName(name.trim()).name.trim()
  // Coordinates written as the name say nothing a reader can use.
  if (/^[-+]?\d+(\.\d+)?°?\s*[NS]?\s*[,;\s]\s*[-+]?\d+(\.\d+)?°?\s*[EW]?$/i.test(n)) return null
  return n || null
}

export function readPlace(input: PlaceInput): PlaceReading {
  const type = (input.locationType ?? "").toLowerCase()
  const text = input.text?.trim() ?? ""
  if (!text) return { ok: false, reason: "empty" }

  let reading: PlaceReading
  if (type === "country-code") reading = fromCountryCode(text)
  else if (/^https?:\/\//i.test(text)) return { ok: false, reason: "link" }
  else if (type === "address") reading = fromCountryName(text)
  else if (text.startsWith("{") || text.startsWith("[")) reading = fromGeoJson(text)
  else reading = fromCoordinates(text)
  if (!reading.ok) return reading

  // A place named after a whole country only says which country, however
  // many decimals its coordinates have (a geocoder's country centre).
  if (reading.prec !== "country" && countryByName(cleanPlaceName(input.name)) >= 0) {
    return { ...reading, prec: "country", polygons: null, km2: null, radiusKm: null }
  }
  return reading
}

function fromCountryCode(text: string): PlaceReading {
  const code = text.toUpperCase()
  if (!/^[A-Z]{2}$/.test(code)) return { ok: false, reason: "unreadable" }
  let name: string | undefined
  try {
    name = new Intl.DisplayNames(["en"], { type: "region" }).of(code)
  } catch {
    name = undefined
  }
  return fromCountryName(name ?? "")
}

function fromCountryName(text: string): PlaceReading {
  const i = countryByName(text)
  const c = i >= 0 ? countryCenter(i) : null
  if (!c) return { ok: false, reason: "unsupported" }
  return { ok: true, lng: c[0], lat: c[1], prec: "country", polygons: null, km2: null, radiusKm: null }
}

/** "lat,lng" (or "lat lng"). */
function fromCoordinates(text: string): PlaceReading {
  const parts = text.split(/\s*[,;]\s*|\s+/).filter(Boolean)
  if (parts.length < 2) return { ok: false, reason: "unreadable" }
  const lat = Number(parts[0])
  const lng = Number(parts[1])
  return point(lng, lat, Math.min(decimals(parts[0]), decimals(parts[1])))
}

function decimals(s: string): number {
  const m = /\.(\d+)/.exec(s)
  return m ? m[1].length : 0
}

function point(lng: number, lat: number, dec: number): PlaceReading {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { ok: false, reason: "unreadable" }
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return { ok: false, reason: "projected" }
  if (lat === 0 && lng === 0) return { ok: false, reason: "zero" }
  // Whole degrees say which country at best; one or two decimals are a
  // guess within ~10 km or ~1 km.
  if (dec === 0) return { ok: true, lng, lat, prec: "country", polygons: null, km2: null, radiusKm: null }
  if (dec <= 2) {
    const radiusKm = dec === 1 ? 10 : 1
    return { ok: true, lng, lat, prec: "approx", polygons: null, km2: null, radiusKm }
  }
  return { ok: true, lng, lat, prec: "site", polygons: null, km2: null, radiusKm: null }
}

type Position = number[]

function fromGeoJson(text: string): PlaceReading {
  let g: unknown
  try {
    g = JSON.parse(text)
  } catch {
    return { ok: false, reason: "unreadable" }
  }
  const root = g as { crs?: { properties?: { name?: string } } }
  const crs = root?.crs?.properties?.name
  // Anything but longitude/latitude in degrees (e.g. metres on a UTM grid).
  if (crs && !/CRS84|4326/i.test(crs)) return { ok: false, reason: "projected" }

  const polygons: Position[][][] = []
  const points: Position[] = []
  collect(g, polygons, points)

  const clean = polygons
    .map((rings) => rings.filter((r) => Array.isArray(r) && r.length >= 4))
    .filter((rings) => rings.length > 0)
  for (const rings of clean) {
    for (const r of rings) {
      for (const p of r) if (!validPosition(p)) return { ok: false, reason: "projected" }
    }
  }
  if (clean.length > 0) return fromPolygons(clean)

  const p = points.find(validPosition)
  if (p) {
    const dec = Math.min(decimals(String(p[0])), decimals(String(p[1])))
    return point(p[0], p[1], dec)
  }
  if (points.length > 0) return { ok: false, reason: "projected" }
  return { ok: false, reason: "unsupported" }
}

function validPosition(p: Position | undefined): p is Position {
  return (
    Array.isArray(p) &&
    typeof p[0] === "number" &&
    typeof p[1] === "number" &&
    Math.abs(p[0]) <= 180 &&
    Math.abs(p[1]) <= 90
  )
}

function collect(node: unknown, polygons: Position[][][], points: Position[]) {
  if (!node || typeof node !== "object") return
  const o = node as { type?: string; geometry?: unknown; features?: unknown[]; geometries?: unknown[]; coordinates?: unknown }
  switch (o.type) {
    case "Feature":
      collect(o.geometry, polygons, points)
      return
    case "FeatureCollection":
      for (const f of o.features ?? []) collect(f, polygons, points)
      return
    case "GeometryCollection":
      for (const f of o.geometries ?? []) collect(f, polygons, points)
      return
    case "Polygon":
      if (Array.isArray(o.coordinates)) polygons.push(o.coordinates as Position[][])
      return
    case "MultiPolygon":
      if (Array.isArray(o.coordinates)) for (const p of o.coordinates as Position[][][]) polygons.push(p)
      return
    case "Point":
      if (Array.isArray(o.coordinates)) points.push(o.coordinates as Position)
      return
    case "MultiPoint":
      if (Array.isArray(o.coordinates)) for (const p of o.coordinates as Position[]) points.push(p)
      return
  }
}

/** Polygons: a generated circle is an approximate point; anything else is a
 *  drawn area, simplified for drawing. */
function fromPolygons(raw: Position[][][]): PlaceReading {
  const polygons: MapPolygon[] = raw.slice(0, 40).map((rings) =>
    rings.slice(0, 10).map((r) => r.map((p) => [p[0], p[1]] as [number, number])),
  )
  for (const poly of polygons) for (const ring of poly) rewind(ring)
  const feature = { type: "MultiPolygon" as const, coordinates: polygons }
  const km2 = geoArea(feature) * EARTH_RADIUS_KM * EARTH_RADIUS_KM
  const [lng, lat] = geoCentroid(feature)
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return { ok: false, reason: "unreadable" }

  const circle = polygons.length === 1 && polygons[0].length === 1 ? circleRadiusKm(polygons[0][0]) : null
  if (circle !== null) {
    return { ok: true, lng, lat, prec: "approx", polygons: null, km2: null, radiusKm: circle }
  }
  return { ok: true, lng, lat, prec: "area", polygons: simplifyArea(polygons), km2, radiusKm: null }
}

/** d3-geo reads a ring's inside from its winding; GeoJSON (RFC 7946) winds
 *  the other way. A ring that encloses more than a hemisphere is backwards. */
function rewind(ring: [number, number][]) {
  if (geoArea({ type: "Polygon", coordinates: [ring] }) > 2 * Math.PI) ring.reverse()
}

/** If every vertex of a ring sits at the same distance from its centre (a
 *  circle an app generated around a guess), that distance in km. */
export function circleRadiusKm(ring: [number, number][]): number | null {
  const pts = ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]
    ? ring.slice(0, -1)
    : ring
  if (pts.length < 12) return null
  const c = geoCentroid({ type: "Polygon", coordinates: [ring] })
  const d = pts.map((p) => geoDistance(c, p) * EARTH_RADIUS_KM)
  const mean = d.reduce((a, b) => a + b, 0) / d.length
  if (mean <= 0) return null
  return d.every((x) => Math.abs(x - mean) / mean < 0.03) ? mean : null
}

/** Most vertices an area keeps; coarser until it fits. */
const AREA_BUDGET = 400

function simplifyArea(polygons: MapPolygon[]): MapPolygon[] {
  let factor = 1
  for (;;) {
    const out = polygons.map((p) => simplifyPolygon(p, factor)).filter((p) => p.length > 0)
    const n = out.reduce((t, p) => t + p.reduce((u, r) => u + r.length, 0), 0)
    if (n <= AREA_BUDGET || factor >= 64) return out
    factor *= 2
  }
}

/** Fewer vertices, same shape at map scale (Douglas–Peucker, in degrees). */
function simplifyPolygon(rings: MapPolygon, factor = 1): MapPolygon {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity
  for (const [x, y] of rings[0]) {
    if (x < w) w = x
    if (x > e) e = x
    if (y < s) s = y
    if (y > n) n = y
  }
  const tol = (Math.max(e - w, n - s) / 200) * factor
  return rings
    .map((r) => simplifyRing(r, tol).map(([x, y]) => [round(x), round(y)] as [number, number]))
    .filter((r) => r.length >= 4)
}

const round = (v: number) => Math.round(v * 1e5) / 1e5

function simplifyRing(pts: [number, number][], tol: number): [number, number][] {
  if (pts.length <= 8 || tol <= 0) return pts
  const keep = new Uint8Array(pts.length)
  keep[0] = 1
  keep[pts.length - 1] = 1
  const stack: [number, number][] = [[0, pts.length - 1]]
  while (stack.length) {
    const [i, j] = stack.pop()!
    let max = -1
    let k = -1
    for (let m = i + 1; m < j; m++) {
      const d = segmentDistance(pts[m], pts[i], pts[j])
      if (d > max) {
        max = d
        k = m
      }
    }
    if (max > tol && k > 0) {
      keep[k] = 1
      stack.push([i, k], [k, j])
    }
  }
  const out = pts.filter((_, i) => keep[i])
  return out.length >= 4 ? out : pts
}

function segmentDistance(p: [number, number], a: [number, number], b: [number, number]): number {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  if (dx === 0 && dy === 0) return Math.hypot(p[0] - a[0], p[1] - a[1])
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)))
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy)
}
