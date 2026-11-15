import { geoArea, geoBounds } from "d3-geo"
import type { Polygon } from "geojson"
import { countryBounds, countryFeatures } from "./countries"
import type { Activity, MapModel, Org, Project } from "./model"

/**
 * The Countries view of /map, without the drawing: every activity, project
 * and organization counted in the country of its place (a place that only
 * names the country counts in full), the regions the countries belong to,
 * the names people use for them, and the shading steps.
 */

export type CountKind = "activity" | "project" | "org"
export const COUNT_KINDS: readonly CountKind[] = ["activity", "project", "org"]
export type Counted = Activity | Project | Org

/** The key of the row for places outside every country outline. */
export const NO_COUNTRY = "~none"

export interface CountryRow {
  /** Natural Earth name, or NO_COUNTRY. */
  key: string
  /** The name people use ("United States", "DR Congo"). */
  label: string
  /** Index into `countryFeatures()`, or -1. */
  feature: number
  region: Region | null
  items: Record<CountKind, Counted[]>
  /** How many of each kind. */
  n: Record<CountKind, number>
  /** How many of each kind only say which country. */
  countryOnly: Record<CountKind, number>
}

export const isCountryOnly = (it: Counted) => it.place?.prec === "country"

const emptyKinds = <T>(make: () => T): Record<CountKind, T> => ({ activity: make(), project: make(), org: make() })

/** Count everything with a place in its country. Rows are in no particular order. */
export function buildCountryRows(model: MapModel): {
  rows: CountryRow[]
  none: CountryRow
  byKey: Map<string, CountryRow>
  byFeature: Map<number, CountryRow>
} {
  const byKey = new Map<string, CountryRow>()
  const rowOf = (country: string | null, feature: number) => {
    const key = country ?? NO_COUNTRY
    let r = byKey.get(key)
    if (!r) {
      r = {
        key,
        label: country ? countryLabel(country) : "No country",
        feature: country ? feature : -1,
        region: country ? regionOf(country) : null,
        items: emptyKinds<Counted[]>(() => []),
        n: emptyKinds(() => 0),
        countryOnly: emptyKinds(() => 0),
      }
      byKey.set(key, r)
    }
    return r
  }
  const add = (it: Counted) => {
    const p = it.place
    if (!p) return
    const r = rowOf(p.country, p.countryFeature)
    r.items[it.kind].push(it)
    r.n[it.kind]++
    if (p.prec === "country") r.countryOnly[it.kind]++
  }
  for (const a of model.activities) add(a)
  for (const p of model.projects) add(p)
  for (const o of model.orgs) add(o)
  const none = rowOf(null, -1)
  const rows = [...byKey.values()].filter((r) => r.key !== NO_COUNTRY)
  const byFeature = new Map<number, CountryRow>()
  for (const r of rows) if (r.feature >= 0) byFeature.set(r.feature, r)
  return { rows, none, byKey, byFeature }
}

/** Most first, then the busiest overall, then by name. */
export function rankRows(rows: readonly CountryRow[], k: CountKind): CountryRow[] {
  const total = (r: CountryRow) => r.n.activity + r.n.project + r.n.org
  return [...rows].sort((a, b) => b.n[k] - a.n[k] || total(b) - total(a) || a.label.localeCompare(b.label))
}

// --- Shading steps --------------------------------------------------------

/** The lowest count of each step, and how the legend says it. */
export const STEPS: readonly { min: number; label: string }[] = [
  { min: 1, label: "1" },
  { min: 2, label: "2–4" },
  { min: 5, label: "5–14" },
  { min: 15, label: "15–39" },
  { min: 40, label: "40+" },
]

/**
 * How each step is painted from the token colours: the counted kind's hue
 * over the land at `hue`, then the ink over that at `ink`. Light to dark in
 * the light theme, dim to bright in the dark one, so more always stands
 * further from the land. The legend mixes the same tokens the same way
 * (map-countries.css).
 */
export const STEP_PAINT: readonly { hue: number; ink: number }[] = [
  { hue: 0.45, ink: 0 },
  { hue: 0.72, ink: 0 },
  { hue: 1, ink: 0 },
  { hue: 1, ink: 0.25 },
  { hue: 1, ink: 0.5 },
]

/** The step of a count, or -1 for none. */
export function stepOf(n: number): number {
  for (let i = STEPS.length - 1; i >= 0; i--) if (n >= STEPS[i].min) return i
  return -1
}

// --- Regions ----------------------------------------------------------------

export const REGIONS = ["Africa", "Americas", "Asia", "Europe", "Oceania"] as const
export type Region = (typeof REGIONS)[number]

/** Every Natural Earth 1:110m country by region (UN geoscheme, roughly);
 *  Antarctica has none. */
const REGION_COUNTRIES: Record<Region, string> = {
  Africa:
    "Algeria|Angola|Benin|Botswana|Burkina Faso|Burundi|Cameroon|Central African Rep.|Chad|Congo|Côte d'Ivoire|Dem. Rep. Congo|Djibouti|Egypt|Eq. Guinea|Eritrea|Ethiopia|Fr. S. Antarctic Lands|Gabon|Gambia|Ghana|Guinea|Guinea-Bissau|Kenya|Lesotho|Liberia|Libya|Madagascar|Malawi|Mali|Mauritania|Morocco|Mozambique|Namibia|Niger|Nigeria|Rwanda|S. Sudan|Senegal|Sierra Leone|Somalia|Somaliland|South Africa|Sudan|Tanzania|Togo|Tunisia|Uganda|W. Sahara|Zambia|Zimbabwe|eSwatini",
  Americas:
    "Argentina|Bahamas|Belize|Bolivia|Brazil|Canada|Chile|Colombia|Costa Rica|Cuba|Dominican Rep.|Ecuador|El Salvador|Falkland Is.|Greenland|Guatemala|Guyana|Haiti|Honduras|Jamaica|Mexico|Nicaragua|Panama|Paraguay|Peru|Puerto Rico|Suriname|Trinidad and Tobago|United States of America|Uruguay|Venezuela",
  Asia:
    "Afghanistan|Armenia|Azerbaijan|Bangladesh|Bhutan|Brunei|Cambodia|China|Cyprus|Georgia|India|Indonesia|Iran|Iraq|Israel|Japan|Jordan|Kazakhstan|Kuwait|Kyrgyzstan|Laos|Lebanon|Malaysia|Mongolia|Myanmar|N. Cyprus|Nepal|North Korea|Oman|Pakistan|Palestine|Philippines|Qatar|Saudi Arabia|South Korea|Sri Lanka|Syria|Taiwan|Tajikistan|Thailand|Timor-Leste|Turkey|Turkmenistan|United Arab Emirates|Uzbekistan|Vietnam|Yemen",
  Europe:
    "Albania|Austria|Belarus|Belgium|Bosnia and Herz.|Bulgaria|Croatia|Czechia|Denmark|Estonia|Finland|France|Germany|Greece|Hungary|Iceland|Ireland|Italy|Kosovo|Latvia|Lithuania|Luxembourg|Macedonia|Moldova|Montenegro|Netherlands|Norway|Poland|Portugal|Romania|Russia|Serbia|Slovakia|Slovenia|Spain|Sweden|Switzerland|Ukraine|United Kingdom",
  Oceania: "Australia|Fiji|New Caledonia|New Zealand|Papua New Guinea|Solomon Is.|Vanuatu",
}

const REGION_OF = new Map<string, Region>()
for (const r of REGIONS) for (const c of REGION_COUNTRIES[r].split("|")) REGION_OF.set(c, r)

export function regionOf(country: string): Region | null {
  return REGION_OF.get(country) ?? null
}

/** What the map shows for each region: [[west, south], [east, north]]. */
export const REGION_BOUNDS: Record<Region, [[number, number], [number, number]]> = {
  Africa: [[-19, -35], [52, 37]],
  Americas: [[-126, -55], [-35, 58]],
  Asia: [[26, -10], [146, 52]],
  Europe: [[-24, 35], [42, 69]],
  Oceania: [[112, -47], [179, -9]],
}

// --- Names ------------------------------------------------------------------

/** Natural Earth's short forms, written out. */
const LABELS: Record<string, string> = {
  "United States of America": "United States",
  "Dem. Rep. Congo": "DR Congo",
  "Central African Rep.": "Central African Republic",
  "Dominican Rep.": "Dominican Republic",
  "Bosnia and Herz.": "Bosnia and Herzegovina",
  "S. Sudan": "South Sudan",
  "Eq. Guinea": "Equatorial Guinea",
  "Solomon Is.": "Solomon Islands",
  "Falkland Is.": "Falkland Islands",
  "Fr. S. Antarctic Lands": "French Southern Lands",
  "W. Sahara": "Western Sahara",
  "N. Cyprus": "Northern Cyprus",
  Macedonia: "North Macedonia",
  eSwatini: "Eswatini",
}

export function countryLabel(name: string): string {
  return LABELS[name] ?? name
}

// --- Fitting a country --------------------------------------------------------

const fitCache = new Map<number, [[number, number], [number, number]]>()

/**
 * The box to fit a country to: its largest landmass plus the big ones near
 * it, so Alaska, French Guiana or Svalbard don't stretch the view across an
 * ocean. Falls back to the whole country's bounds.
 */
export function countryFitBounds(index: number): [[number, number], [number, number]] | null {
  const hit = fitCache.get(index)
  if (hit) return hit
  const f = countryFeatures()[index]
  if (!f) return null
  const g = f.geometry
  const polys = (g.type === "Polygon" ? [g.coordinates] : g.coordinates)
    .map((coordinates) => {
      const p: Polygon = { type: "Polygon", coordinates }
      return { area: geoArea(p), bounds: geoBounds(p) }
    })
    .sort((a, b) => b.area - a.area)
  if (polys.length === 0) return countryBounds(index)
  let [[w, s], [e, n]] = polys[0].bounds
  // Across the date line: keep the western part (Russia's, Fiji's).
  if (w > e) e = 180
  for (const p of polys.slice(1)) {
    if (p.area < polys[0].area * 0.25) continue
    const [[w2, s2], [e2, n2]] = p.bounds
    if (w2 > e2) continue
    const W = Math.min(w, w2)
    const E = Math.max(e, e2)
    if (E - W > 120) continue
    w = W
    e = E
    s = Math.min(s, s2)
    n = Math.max(n, n2)
  }
  const box: [[number, number], [number, number]] = [[w, s], [e, n]]
  fitCache.set(index, box)
  return box
}

export function ordinal(n: number): string {
  const t = n % 100
  if (t >= 11 && t <= 13) return `${n}th`
  return `${n}${n % 10 === 1 ? "st" : n % 10 === 2 ? "nd" : n % 10 === 3 ? "rd" : "th"}`
}
