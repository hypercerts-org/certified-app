import { geoBounds, geoCentroid, geoContains } from "d3-geo"
import { feature, mesh } from "topojson-client"
import type { GeometryCollection, Topology } from "topojson-specification"
import type { Feature, FeatureCollection, MultiLineString, MultiPolygon, Polygon } from "geojson"
import world from "world-atlas/countries-110m.json"

/**
 * The world's countries at 1:110m (Natural Earth, public domain, through
 * the world-atlas package): outlines for the /map basemap and the country
 * views, and a lookup from a point or a name to a country. Shared by the
 * server (which assigns each place a country) and the client (which draws
 * them), so both use the same names.
 */

type CountryProps = { name: string }
type CountryFeature = Feature<Polygon | MultiPolygon, CountryProps>

const topology = world as unknown as Topology<{ countries: GeometryCollection<CountryProps> }>

let cache: {
  features: CountryFeature[]
  bounds: [[number, number], [number, number]][]
  byName: Map<string, number>
  land: FeatureCollection<Polygon | MultiPolygon, CountryProps>
  borders: MultiLineString
} | null = null

function load() {
  if (cache) return cache
  const land = feature(topology, topology.objects.countries) as FeatureCollection<Polygon | MultiPolygon, CountryProps>
  const features = land.features
  const borders = mesh(topology, topology.objects.countries, (a, b) => a !== b) as MultiLineString
  const byName = new Map<string, number>()
  features.forEach((f, i) => byName.set(normalize(f.properties.name), i))
  for (const [alias, name] of ALIASES) {
    const i = byName.get(normalize(name))
    if (i !== undefined) byName.set(normalize(alias), i)
  }
  cache = { features, bounds: features.map((f) => geoBounds(f)), byName, land, borders }
  return cache
}

/** Every country, in a stable order (the index is a country's id here). */
export function countryFeatures(): CountryFeature[] {
  return load().features
}

/** All countries as one collection, and the lines between them. */
export function worldOutlines(): {
  land: FeatureCollection<Polygon | MultiPolygon, CountryProps>
  borders: MultiLineString
} {
  const c = load()
  return { land: c.land, borders: c.borders }
}

export function countryName(index: number): string | null {
  return load().features[index]?.properties.name ?? null
}

/** The country a point falls in, or -1 (at sea, or off a coast the
 *  1:110m outlines simplify away). */
export function countryAt(lng: number, lat: number): number {
  const { features, bounds } = load()
  for (let i = 0; i < features.length; i++) {
    const [[w, s], [e, n]] = bounds[i]
    if (lat < s || lat > n) continue
    // Bounds that cross the date line come back with w > e.
    if (w <= e ? lng < w || lng > e : lng < w && lng > e) continue
    if (geoContains(features[i], [lng, lat])) return i
  }
  return -1
}

/** The nearest country to a point, for places just off a simplified coast:
 *  the closest country centre within `maxDeg` degrees, else -1. */
export function nearestCountry(lng: number, lat: number, maxDeg = 4): number {
  const { features, bounds } = load()
  let best = -1
  let bestD = Infinity
  let bestC = Infinity
  for (let i = 0; i < features.length; i++) {
    const [[w, s], [e, n]] = bounds[i]
    // Distance to the bounding box, in degrees: cheap and good enough here.
    const dy = lat < s ? s - lat : lat > n ? lat - n : 0
    const dx = w <= e ? (lng < w ? w - lng : lng > e ? lng - e : 0) : 0
    const d = Math.hypot(dx, dy)
    if (d > bestD + 1e-9 || d > maxDeg) continue
    // Inside several boxes: the country whose centre is closest.
    const [cx, cy] = geoCentroid(features[i])
    const c = Math.hypot(cx - lng, cy - lat)
    if (d < bestD - 1e-9 || c < bestC) {
      bestD = d
      bestC = c
      best = i
    }
  }
  return best
}

/** A country by a name as people write it ("Kenya", "USA", "Brasil"), or -1. */
export function countryByName(name: string | null | undefined): number {
  if (!name) return -1
  return load().byName.get(normalize(name)) ?? -1
}

/** A country's visual centre, for places that only say which country. */
export function countryCenter(index: number): [number, number] | null {
  const f = load().features[index]
  return f ? geoCentroid(f) : null
}

/** [[west, south], [east, north]] of a country. */
export function countryBounds(index: number): [[number, number], [number, number]] | null {
  return load().bounds[index] ?? null
}

function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/^the\s+/, "")
    .replace(/[.,'’]/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

/** Common ways of writing countries whose Natural Earth name differs. */
const ALIASES: [string, string][] = [
  ["USA", "United States of America"],
  ["US", "United States of America"],
  ["United States", "United States of America"],
  ["Estados Unidos", "United States of America"],
  ["UK", "United Kingdom"],
  ["Great Britain", "United Kingdom"],
  ["England", "United Kingdom"],
  ["Scotland", "United Kingdom"],
  ["Wales", "United Kingdom"],
  ["Brasil", "Brazil"],
  ["México", "Mexico"],
  ["Perú", "Peru"],
  ["España", "Spain"],
  ["Deutschland", "Germany"],
  ["Italia", "Italy"],
  ["Nederland", "Netherlands"],
  ["The Netherlands", "Netherlands"],
  ["Holland", "Netherlands"],
  ["Schweiz", "Switzerland"],
  ["Suisse", "Switzerland"],
  ["Svizzera", "Switzerland"],
  ["Ivory Coast", "Côte d'Ivoire"],
  ["Cote d'Ivoire", "Côte d'Ivoire"],
  ["DR Congo", "Dem. Rep. Congo"],
  ["DRC", "Dem. Rep. Congo"],
  ["Democratic Republic of the Congo", "Dem. Rep. Congo"],
  ["Democratic Republic of Congo", "Dem. Rep. Congo"],
  ["Republic of the Congo", "Congo"],
  ["Central African Republic", "Central African Rep."],
  ["South Sudan", "S. Sudan"],
  ["Dominican Republic", "Dominican Rep."],
  ["República Dominicana", "Dominican Rep."],
  ["Bosnia and Herzegovina", "Bosnia and Herz."],
  ["Equatorial Guinea", "Eq. Guinea"],
  ["Eswatini", "eSwatini"],
  ["Swaziland", "eSwatini"],
  ["Solomon Islands", "Solomon Is."],
  ["Czech Republic", "Czechia"],
  ["North Macedonia", "Macedonia"],
  ["East Timor", "Timor-Leste"],
  ["Western Sahara", "W. Sahara"],
  ["Falkland Islands", "Falkland Is."],
  ["Republic of Korea", "South Korea"],
  ["Korea", "South Korea"],
  ["Viet Nam", "Vietnam"],
  ["Lao PDR", "Laos"],
  ["Burma", "Myanmar"],
  ["Türkiye", "Turkey"],
  ["Turkiye", "Turkey"],
  ["Russian Federation", "Russia"],
  ["UAE", "United Arab Emirates"],
  ["Tanzania, United Republic of", "Tanzania"],
  ["United Republic of Tanzania", "Tanzania"],
  ["Philippines", "Philippines"],
  ["Kenia", "Kenya"],
  ["Uganda", "Uganda"],
]
