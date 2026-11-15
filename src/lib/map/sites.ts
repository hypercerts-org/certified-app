import { geoArea, geoBounds, geoDistance, geoMercator, geoPath } from "d3-geo"
import type { MultiPolygon } from "geojson"
import type { Account, Activity, LayerCounts, MapModel, Org, Place, Project } from "./model"

/**
 * The Sites view's data (map-sites.tsx): every drawn area, with identical
 * outlines (the same shape saved more than once) stacked into one site,
 * what uses it, and the picture for its tile. Pure, so it can be tested.
 */

/** Drawn areas larger than this are regions, hidden by default. */
export const REGION_KM2 = 10_000
const EARTH_KM = 6371

export type SiteUse =
  | { kind: "activity"; activity: Activity; /** its own place, or one of several it names */ how: "own" | "more" }
  | { kind: "project"; project: Project; /** its activities placed by it */ activities: Activity[] }
  | { kind: "org"; org: Org }

/** What a site's tile and mark show: who uses it, in the layers' order. */
export type SiteKind = "activity" | "project" | "org" | "unused"

export interface Site {
  key: string
  /** Every place saved with this outline, the used ones first. */
  places: Place[]
  feature: MultiPolygon
  /** The best name among its places, or null. */
  name: string | null
  country: string | null
  lng: number
  lat: number
  km2: number
  uses: SiteUse[]
  /** Something points to one of its places (`uses` can miss a few: see buildSites). */
  used: boolean
  kind: SiteKind
  /** For its mark on the map. */
  counts: LayerCounts
  /** The accounts that saved it, in the order of `places`. */
  savedBy: Account[]
  region: boolean
  /** Every copy is named like a test ("Test site", "Fake Site 2", "ddddd"). */
  test: boolean
  hidden: boolean
  bounds: [[number, number], [number, number]]
}

const CID = /^(?:Qm[1-9A-HJ-NP-Za-km-z]{40,}|baf[a-z2-7]{50,})$/
const FILE_EXT = /\.(?:geo)?json$|\.kml$/i
const TEST_WORD = /(?:^|[^a-z])(?:test|testing|fake|demo|dummy|hello)(?:[^a-z]|$)/i
const ONLY_DIGITS = /^\s*\d+\s*$/
const REPEATED = /^(.)\1{3,}$/

/** A name a reader can use: not a file's content id, without a file extension. */
export function siteName(name: string | null): string | null {
  if (!name) return null
  const n = name.trim().replace(/\s+/g, " ").replace(/ ,/g, ",")
  if (CID.test(n)) return null
  return n.replace(FILE_EXT, "").trim() || null
}

export function looksLikeTest(name: string | null): boolean {
  if (!name) return false
  const n = name.trim()
  return TEST_WORD.test(n) || ONLY_DIGITS.test(n) || REPEATED.test(n)
}

/** The drawn areas as sites, each with what uses it. */
export function buildSites(model: MapModel): Site[] {
  const usesOf = new Map<number, SiteUse[]>()
  const add = (p: Place | null | undefined, u: SiteUse) => {
    if (!p || p.prec !== "area") return
    let list = usesOf.get(p.i)
    if (!list) usesOf.set(p.i, (list = []))
    list.push(u)
  }
  for (const a of model.activities) {
    if (a.place && a.via === null) add(a.place, { kind: "activity", activity: a, how: "own" })
    for (const m of a.more) add(m, { kind: "activity", activity: a, how: "more" })
  }
  for (const p of model.projects) {
    if (p.place) add(p.place, { kind: "project", project: p, activities: p.activities.filter((a) => a.via === "project") })
  }
  for (const o of model.orgs) add(o.place, { kind: "org", org: o })
  const unused = new Set(model.unused.map((u) => u.place.i))

  const byShape = new Map<string, Place[]>()
  for (const p of model.places) {
    if (p.prec !== "area" || !p.area || p.area.length === 0) continue
    const k = JSON.stringify(p.area)
    const list = byShape.get(k)
    if (list) list.push(p)
    else byShape.set(k, [p])
  }

  const sites: Site[] = []
  for (const members of byShape.values()) {
    const isUsed = (p: Place) => usesOf.has(p.i) || !unused.has(p.i)
    const places = [...members.filter(isUsed), ...members.filter((p) => !isUsed(p))]
    const first = places[0]
    const feature: MultiPolygon = { type: "MultiPolygon", coordinates: first.area! }

    const uses: SiteUse[] = []
    const seen = new Set<string>()
    for (const p of places) {
      for (const u of usesOf.get(p.i) ?? []) {
        const id = u.kind === "activity" ? `a${u.activity.i}` : u.kind === "project" ? `p${u.project.i}` : `o${u.org.i}`
        if (seen.has(id)) continue
        seen.add(id)
        uses.push(u)
      }
    }
    const used = places.some(isUsed)
    const counts: LayerCounts = { activity: 0, project: 0, org: 0, unused: used ? 0 : 1 }
    for (const u of uses) {
      if (u.kind === "activity") counts.activity++
      else if (u.kind === "project") {
        counts.project++
        counts.activity += u.activities.length
      } else counts.org++
    }
    // Used, though by nothing the model lists: an activity's further place.
    if (used && uses.length === 0) counts.activity = 1
    const kind: SiteKind = counts.activity > 0 ? "activity" : counts.project > 0 ? "project" : counts.org > 0 ? "org" : "unused"

    const names = places.map((p) => siteName(p.name))
    const name =
      names.find((n, i) => n && isUsed(places[i]) && !looksLikeTest(n)) ??
      names.find((n) => n && !looksLikeTest(n)) ??
      names.find(Boolean) ??
      null

    const km2 = siteKm2(feature, first.km2)
    const region = km2 > REGION_KM2
    const test = places.every((p) => looksLikeTest(p.name))
    const savedBy: Account[] = []
    for (const p of places) if (!savedBy.includes(p.account)) savedBy.push(p.account)

    sites.push({
      key: `s${first.i}`,
      places,
      feature,
      name,
      country: places.find((p) => p.country)?.country ?? null,
      lng: first.lng,
      lat: first.lat,
      km2,
      uses,
      used,
      kind,
      counts,
      savedBy,
      region,
      test,
      hidden: region || test,
      bounds: geoBounds(feature) as [[number, number], [number, number]],
    })
  }
  return sites
}

/** The record's size, but small plots measured from the outline itself:
 *  the record rounds to 100 m², so a 20 m² nursery reads as 0. */
function siteKm2(feature: MultiPolygon, recorded: number | null): number {
  if (recorded !== null && recorded >= 0.01) return recorded
  const sr = geoArea(feature)
  // More than half the sphere: the rings are wound the other way.
  if (!Number.isFinite(sr) || sr <= 0 || sr > 2 * Math.PI) return recorded ?? 0
  return sr * EARTH_KM * EARTH_KM
}

/** A tile's picture: the outline at its own scale in a square of TILE
 *  units, and a scale bar as a share of the tile's width. */
export const TILE = 120

export interface TileShape {
  d: string
  /** Parts too small to see at the tile's scale (plots far apart): where to mark them. */
  dots: [number, number][]
  /** The scale bar's length, as a percentage of the tile's width. */
  barPct: number
  barLabel: string
}

export function tileShape(feature: MultiPolygon): TileShape {
  const pad = 12
  const bottom = 26
  const projection = geoMercator().fitExtent(
    [
      [pad, pad],
      [TILE - pad, TILE - bottom],
    ],
    feature,
  )
  const path = geoPath(projection)
  const d = path(feature) ?? ""
  const dots: [number, number][] = []
  if (feature.coordinates.length > 1) {
    for (const polygon of feature.coordinates) {
      const [[x0, y0], [x1, y1]] = path.bounds({ type: "Polygon", coordinates: polygon })
      if (Math.max(x1 - x0, y1 - y0) >= 4) continue
      const dot: [number, number] = [Math.round((x0 + x1) * 5) / 10, Math.round((y0 + y1) * 5) / 10]
      // The same plot can be in an outline twice.
      if (!dots.some((q) => Math.hypot(q[0] - dot[0], q[1] - dot[1]) < 2)) dots.push(dot)
    }
  }
  // Metres per unit at the tile's centre.
  const a = projection.invert?.([TILE / 2, TILE / 2])
  const b = projection.invert?.([TILE / 2 + 10, TILE / 2])
  const mpu = a && b ? (geoDistance(a, b) * EARTH_KM * 1000) / 10 : 0
  if (!(mpu > 0)) return { d, dots, barPct: 0, barLabel: "" }
  // The longest round length (1, 2 or 5 × 10ⁿ m) that fits in 40% of the tile.
  let nice = 1
  for (let k = 0; k < 8; k++) {
    for (const f of [1, 2, 5]) {
      const v = f * 10 ** k
      if (v / mpu <= TILE * 0.4) nice = v
    }
  }
  return {
    d,
    dots,
    barPct: (nice / mpu / TILE) * 100,
    barLabel: nice >= 1000 ? `${(nice / 1000).toLocaleString("en-US")} km` : `${nice} m`,
  }
}

/** How big, in football pitches (105 × 68 m), up to about 140 km². */
export function inPitches(km2: number): string | null {
  const n = km2 / 0.00714
  if (n < 1) return "smaller than a football pitch"
  if (n > 20_000) return null
  const r = n < 10 ? Math.round(n) : sig2(n)
  return `about ${r.toLocaleString("en-US")} football ${r === 1 ? "pitch" : "pitches"}`
}

function sig2(n: number): number {
  if (n < 100) return Math.round(n)
  const p = 10 ** (Math.floor(Math.log10(n)) - 1)
  return Math.round(n / p) * p
}
