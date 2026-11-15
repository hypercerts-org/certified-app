import { buildAvatarUrlFromCid } from "@/lib/atproto/profile"
import { profileUrl, recordUrl } from "@/lib/urls"
import { countryByName } from "./countries"
import type { MapDataset, MapPolygon, Precision } from "./dataset-types"

/**
 * The /map dataset decoded into linked objects (`buildModel`) and grouped
 * into spots (`spotsFor`): everything recorded at one point, which the map
 * draws as one mark and the list as one row. Pure, so the views stay thin.
 */

export interface Account {
  i: number
  did: string
  name: string | null
  avatar: string | null
  href: string
}

export interface Place {
  i: number
  lng: number
  lat: number
  prec: Precision
  name: string | null
  account: Account
  /** Natural Earth name, or null at sea / just off a coast. */
  country: string | null
  /** Index into `countryFeatures()`, or -1. */
  countryFeature: number
  area: MapPolygon[] | null
  km2: number | null
  radiusKm: number | null
}

export interface Activity {
  kind: "activity"
  i: number
  title: string
  account: Account
  /** Its own place, else its project's (`via: "project"`). */
  place: Place | null
  via: "project" | null
  project: Project | null
  date: string | null
  href: string
}

export interface Project {
  kind: "project"
  i: number
  title: string
  account: Account
  place: Place | null
  activities: Activity[]
  href: string
}

export interface Org {
  kind: "org"
  i: number
  account: Account
  /** Where it is based. */
  place: Place
  href: string
}

/** A place nothing points to: saved, not used yet. */
export interface Unused {
  kind: "unused"
  i: number
  account: Account
  place: Place
}

export type Item = Activity | Project | Org | Unused
export type Layer = Item["kind"]
export const LAYERS: readonly Layer[] = ["activity", "project", "org", "unused"]
export const DEFAULT_LAYERS: readonly Layer[] = ["activity", "project"]

export interface MapModel {
  accounts: Account[]
  places: Place[]
  activities: Activity[]
  projects: Project[]
  orgs: Org[]
  unused: Unused[]
  totals: MapDataset["totals"]
  partial: boolean
  generatedAt: string
}

export function buildModel(ds: MapDataset): MapModel {
  const accounts: Account[] = ds.accounts.map((a, i) => ({
    i,
    did: a.did,
    name: a.name ?? null,
    avatar: a.avatar ? (a.avatar.startsWith("https://") ? a.avatar : buildAvatarUrlFromCid(a.did, a.avatar)) : null,
    href: profileUrl(a.did),
  }))
  const featureOf = new Map<number, number>()
  const places: Place[] = ds.places.map((p, i) => {
    const country = p.country !== undefined ? (ds.countries[p.country] ?? null) : null
    let feature = -1
    if (p.country !== undefined) {
      const f = featureOf.get(p.country)
      feature = f ?? countryByName(country)
      if (f === undefined) featureOf.set(p.country, feature)
    }
    return {
      i,
      lng: p.lng,
      lat: p.lat,
      prec: p.prec,
      name: p.name ?? null,
      account: accounts[p.account],
      country,
      countryFeature: feature,
      area: p.area !== undefined ? (ds.areas[p.area] ?? null) : null,
      km2: p.km2 ?? null,
      radiusKm: p.radiusKm ?? null,
    }
  })
  const projects: Project[] = ds.projects.map((p, i) => ({
    kind: "project",
    i,
    title: p.title || "Untitled project",
    account: accounts[p.account],
    place: p.place >= 0 ? places[p.place] : null,
    activities: [],
    href: recordUrl(ds.accounts[p.account].did, "project", p.rkey),
  }))
  const activities: Activity[] = ds.activities.map((a, i) => {
    const project = a.project >= 0 ? projects[a.project] : null
    const own = a.place >= 0 ? places[a.place] : null
    const place = own ?? project?.place ?? null
    const activity: Activity = {
      kind: "activity",
      i,
      title: a.title || "Untitled activity",
      account: accounts[a.account],
      place,
      via: own ? null : place ? "project" : null,
      project,
      date: a.date,
      href: recordUrl(ds.accounts[a.account].did, "activity", a.rkey),
    }
    project?.activities.push(activity)
    return activity
  })
  const orgs: Org[] = ds.orgs.map((o, i) => ({
    kind: "org",
    i,
    account: accounts[o.account],
    place: places[o.place],
    href: profileUrl(ds.accounts[o.account].did),
  }))
  const unused: Unused[] = ds.unused.map((p, i) => ({ kind: "unused", i, account: places[p].account, place: places[p] }))
  return {
    accounts,
    places,
    activities,
    projects,
    orgs,
    unused,
    totals: ds.totals,
    partial: ds.partial,
    generatedAt: ds.generatedAt,
  }
}

/** Everything of the chosen layers, in a stable order. */
export function itemsFor(model: MapModel, layers: ReadonlySet<Layer>): Item[] {
  const out: Item[] = []
  if (layers.has("activity")) for (const a of model.activities) if (a.place) out.push(a)
  if (layers.has("project")) for (const p of model.projects) if (p.place) out.push(p)
  if (layers.has("org")) out.push(...model.orgs)
  if (layers.has("unused")) out.push(...model.unused)
  return out
}

export function itemPlace(item: Item): Place {
  // Items without a place never reach a spot (see itemsFor).
  return item.place as Place
}

export function itemTitle(item: Item): string {
  switch (item.kind) {
    case "activity":
    case "project":
      return item.title
    case "org":
      return item.account.name ?? "Unnamed organization"
    case "unused":
      return item.place.name ?? "Unnamed place"
  }
}

/** Search across titles, who published it and the place's name. */
export function matchesQuery(item: Item, q: string): boolean {
  if (!q) return true
  const place = itemPlace(item)
  const hay = `${itemTitle(item)} ${item.account.name ?? ""} ${place.name ?? ""} ${place.country ?? ""} ${
    item.kind === "activity" && item.project ? item.project.title : ""
  }`.toLowerCase()
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => hay.includes(w))
}

export type LayerCounts = Record<Layer, number>
export const emptyCounts = (): LayerCounts => ({ activity: 0, project: 0, org: 0, unused: 0 })

/** Everything recorded at one point (to about a metre), with one precision. */
export interface Spot {
  key: string
  lng: number
  lat: number
  prec: Exclude<Precision, "country">
  /** The most common name among its places. */
  name: string | null
  country: string | null
  countryFeature: number
  items: Item[]
  counts: LayerCounts
  /** Drawn areas: the first outline among its places. */
  area: MapPolygon[] | null
  km2: number | null
  /** Approximate places: the largest radius among them. */
  radiusKm: number | null
}

/** Everything that only says which country, per country. */
export interface CountryGroup {
  key: string
  country: string
  countryFeature: number
  items: Item[]
  counts: LayerCounts
}

export function groupItems(items: readonly Item[]): { spots: Spot[]; countries: CountryGroup[]; nowhere: Item[] } {
  const spots = new Map<string, Spot>()
  const countries = new Map<string, CountryGroup>()
  const nowhere: Item[] = []
  for (const item of items) {
    const p = itemPlace(item)
    if (p.prec === "country") {
      if (!p.country || p.countryFeature < 0) {
        nowhere.push(item)
        continue
      }
      let g = countries.get(p.country)
      if (!g) {
        g = { key: `country:${p.country}`, country: p.country, countryFeature: p.countryFeature, items: [], counts: emptyCounts() }
        countries.set(p.country, g)
      }
      g.items.push(item)
      g.counts[item.kind]++
      continue
    }
    const key = `${p.prec}:${p.lat.toFixed(5)},${p.lng.toFixed(5)}`
    let s = spots.get(key)
    if (!s) {
      s = {
        key,
        lng: p.lng,
        lat: p.lat,
        prec: p.prec,
        name: null,
        country: p.country,
        countryFeature: p.countryFeature,
        items: [],
        counts: emptyCounts(),
        area: p.area,
        km2: p.km2,
        radiusKm: p.radiusKm,
      }
      spots.set(key, s)
    }
    s.items.push(item)
    s.counts[item.kind]++
    if (p.radiusKm !== null && (s.radiusKm === null || p.radiusKm > s.radiusKm)) s.radiusKm = p.radiusKm
    if (!s.area && p.area) {
      s.area = p.area
      s.km2 = p.km2
    }
  }
  for (const s of spots.values()) s.name = commonName(s.items)
  return {
    spots: [...spots.values()],
    countries: [...countries.values()].sort((a, b) => b.items.length - a.items.length),
    nowhere,
  }
}

function commonName(items: readonly Item[]): string | null {
  const n = new Map<string, number>()
  for (const it of items) {
    const name = itemPlace(it).name
    if (name) n.set(name, (n.get(name) ?? 0) + 1)
  }
  let best: string | null = null
  let bestN = 0
  for (const [name, c] of n) {
    if (c > bestN) {
      best = name
      bestN = c
    }
  }
  return best
}

/** A spot's items as a chain: each project with its activities here, then
 *  activities without a project, organizations based here, unused places. */
export function chainOf(items: readonly Item[]): {
  projects: { project: Project; activities: Activity[] }[]
  loose: Activity[]
  orgs: Org[]
  unused: Unused[]
} {
  const byProject = new Map<number, { project: Project; activities: Activity[] }>()
  const loose: Activity[] = []
  const orgs: Org[] = []
  const unused: Unused[] = []
  const projectFirst = (p: Project) => {
    let e = byProject.get(p.i)
    if (!e) {
      e = { project: p, activities: [] }
      byProject.set(p.i, e)
    }
    return e
  }
  for (const it of items) {
    if (it.kind === "project") projectFirst(it)
  }
  for (const it of items) {
    if (it.kind === "activity") {
      if (it.project && byProject.has(it.project.i)) byProject.get(it.project.i)!.activities.push(it)
      else loose.push(it)
    } else if (it.kind === "org") orgs.push(it)
    else if (it.kind === "unused") unused.push(it)
  }
  return { projects: [...byProject.values()], loose, orgs, unused }
}

/** Great-circle distance in km. */
export function distanceKm(a: { lng: number; lat: number }, b: { lng: number; lat: number }): number {
  const r = Math.PI / 180
  const h =
    Math.sin(((b.lat - a.lat) * r) / 2) ** 2 +
    Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lng - a.lng) * r) / 2) ** 2
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** What to call a place in the list: its name, else where it is. */
export function placeTitle(name: string | null, country: string | null): string {
  if (name) return name
  return country ? `A place in ${country}` : "A place without a name"
}

export const PRECISION_LABEL: Record<Precision, string> = {
  site: "Exact point",
  area: "Drawn area",
  approx: "Approximate",
  country: "Country only",
}

export const LAYER_LABEL: Record<Layer, string> = {
  activity: "Activities",
  project: "Projects",
  org: "Organizations' bases",
  unused: "Places not used yet",
}
