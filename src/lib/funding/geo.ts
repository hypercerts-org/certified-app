import type { LatLng, LocationShape } from "@/lib/atproto/location"

/**
 * Places for the /funding views: which region and continent a project's
 * point falls in, worked out in the browser from the point alone (the
 * dataset carries only the coordinates).
 *
 * The regions are a little smaller than continents and follow the groupings
 * used in development work (UNICEF's regional offices, the UN's M49
 * subregions): the Americas split into the US and Canada, Central America
 * and the Caribbean (Mexico included, as in M49), and South America; Africa
 * into the Middle East and North Africa, West and Central, and East and
 * Southern; Oceania into Australia and New Zealand, and the Pacific Islands.
 * Russia counts as Europe, as the UN groups it.
 *
 * The borders are straight-line approximations, good for grouping and not
 * for maps: a point within a few dozen kilometres of a border can land in
 * the region next door.
 */

export const REGIONS = [
  "US & Canada",
  "Central America & Caribbean",
  "South America",
  "Europe",
  "Middle East & North Africa",
  "West & Central Africa",
  "East & Southern Africa",
  "Central Asia",
  "South Asia",
  "Southeast Asia",
  "East Asia",
  "Australia & New Zealand",
  "Pacific Islands",
] as const
export type Region = (typeof REGIONS)[number]

export const CONTINENTS = ["North America", "South America", "Europe", "Africa", "Asia", "Oceania"] as const
export type Continent = (typeof CONTINENTS)[number]

const CONTINENT_OF: Record<Region, Continent> = {
  "US & Canada": "North America",
  "Central America & Caribbean": "North America",
  "South America": "South America",
  Europe: "Europe",
  // Split by the Suez and the Red Sea in continentFor.
  "Middle East & North Africa": "Asia",
  "West & Central Africa": "Africa",
  "East & Southern Africa": "Africa",
  "Central Asia": "Asia",
  "South Asia": "Asia",
  "Southeast Asia": "Asia",
  "East Asia": "Asia",
  "Australia & New Zealand": "Oceania",
  "Pacific Islands": "Oceania",
}

/** A region's name inside a sentence ("Projects in the US and Canada"). */
export function regionPhrase(name: string): string {
  switch (name) {
    case "US & Canada":
      return "the US and Canada"
    case "Middle East & North Africa":
      return "the Middle East and North Africa"
    case "Pacific Islands":
      return "the Pacific Islands"
    default:
      return name.replace(" & ", " and ")
  }
}

const wrapLng = (lng: number) => ((((lng + 180) % 360) + 360) % 360) - 180

/** Linear interpolation along a polyline of [lng, lat] points, west to east. */
function latAlong(line: readonly (readonly [number, number])[], lng: number): number {
  for (let i = 1; i < line.length; i++) {
    const [x0, y0] = line[i - 1]
    const [x1, y1] = line[i]
    if (lng <= x1) return y0 + ((y1 - y0) * (lng - x0)) / (x1 - x0)
  }
  return line[line.length - 1][1]
}

/** The US–Mexico border, Tijuana to Brownsville. */
const US_MEXICO = [
  [-117.12, 32.53],
  [-114.72, 32.72],
  [-114.81, 32.49],
  [-111.07, 31.33],
  [-108.21, 31.33],
  [-108.21, 31.78],
  [-106.53, 31.78],
  [-104.5, 29.6],
  [-103.0, 28.97],
  [-101.4, 29.77],
  [-99.5, 27.5],
  [-97.14, 25.95],
] as const

function isAustraliaNz(lat: number, x: number): boolean {
  if (lat > -10.4 || lat < -56) return false
  if (x >= 112 && x < 129) return lat <= -12.5
  if (x >= 129 && x < 145.5) return true
  if (x >= 145.5 && x < 155) return lat <= -14.5
  if (x >= 155 && x < 165.5) return lat <= -28
  // New Zealand, and the Chathams across the date line.
  return (x >= 165.5 || x < -175) && lat <= -33.5
}

function isPacific(lat: number, x: number): boolean {
  if (lat < -60) return false
  // Polynesia, Fiji, Vanuatu, Kiribati, Hawaii.
  if (x >= 155 || x < -129) return lat < 30
  // Papua New Guinea and the Solomons.
  if (x >= 141 && lat < 0) return true
  // Palau, Guam, the Marianas, Micronesia.
  return x >= 130 && lat >= 0 && lat < 22
}

function americas(lat: number, x: number): Region {
  const us: Region = "US & Canada"
  const central: Region = "Central America & Caribbean"
  if (lat >= 49) return us
  if (x < -117.12) return lat > 32.53 ? us : central
  if (x <= -97.14) return lat > latAlong(US_MEXICO, x) ? us : central
  // The Gulf coast, Florida and the east; not the Bahamas.
  if (lat >= 24.4 && !(x > -79.6 && lat < 27.3)) return us
  if (lat >= 12.6) return central
  // Trinidad and Tobago, Grenada, Barbados.
  if (x > -62 && lat > 10) return central
  // Panama up to Mexico, and Cocos Island; not the Galápagos.
  if ((x < -77.3 && lat > 7.2) || (x < -82 && lat > 2)) return central
  return "South America"
}

/** Where Russia begins, east of the Caucasus: the north edge of Kazakhstan,
 *  Mongolia and China. */
function russiaSouth(x: number): number {
  if (x < 48) return 44
  if (x < 60) return 51
  if (x < 69) return 55.4
  if (x < 87) return 55.4 - (x - 69) * 0.3
  if (x < 120) return 52.2
  if (x < 135) return 53.6
  return 46
}

function isEurope(lat: number, x: number): boolean {
  if (x >= 45) return lat >= russiaSouth(x) || (lat >= 41.1 && lat < 44 && x < 50.5)
  // Iberia above the Strait; Spain and the islands above Algeria and Tunisia.
  if (x < -1.5) return lat >= 35.95
  if (x < 12.3) return lat >= 37.45
  // Sicily, Malta, Greece and Crete, above Libya and Egypt.
  if (x < 26.4) return lat >= 34.5
  // The Dodecanese and Thrace, around Turkey's Aegean coast.
  if (x < 29) return (lat >= 34.5 && lat < 36.6) || lat >= 40.5
  if (x < 32.2) return lat >= 42.1
  // Cyprus; the Black Sea's north shore.
  if (x < 34.7) return (lat >= 34.4 && lat < 35.75) || lat >= 42.1
  // The Black Sea's north-east and Georgia.
  return lat >= 42.1 || (lat >= 41.1 && x >= 41.5)
}

/** Africa's side of the Suez Canal, the Red Sea and the Gulf of Aden, for
 *  a point already known not to be in Europe, the Americas or Oceania. */
function isAfrica(lat: number, x: number): boolean {
  if (x < 26) return lat < 37.5
  if (x < 34.2) return lat < 31.7
  if (lat >= 29.5) return false
  if (lat >= 12.5) return x < 32.5 + (29.9 - lat) * 0.63
  if (lat >= 5) return x < 52
  // Madagascar, the Comoros, Mauritius, the Seychelles.
  return x < 65
}

function africanRegion(lat: number, x: number): Region {
  if (lat >= 21.5) return "Middle East & North Africa"
  // Sudan.
  if (x >= 22.5 && x < 36.5 && lat >= 10.5) return "Middle East & North Africa"
  if (lat < -6 || x >= 29.5 || (x >= 24.5 && lat >= 3.5)) return "East & Southern Africa"
  return "West & Central Africa"
}

function asianRegion(lat: number, x: number): Region {
  if (lat >= 37.3 && ((x >= 52.5 && x < 80) || (x >= 80 && x < 87 && lat >= 45))) return "Central Asia"
  // Kazakhstan by the Caspian.
  if (lat >= 41 && x >= 48 && x < 52.5) return "Central Asia"
  // Turkey, the Levant, Arabia, Iraq and Iran.
  if (x < 61.5) return "Middle East & North Africa"
  if (x < 88 && lat < 37.3) return lat > 30 && x >= 81 ? "East Asia" : "South Asia"
  // Bangladesh and Bhutan.
  if (x < 92.7 && lat < 28.3) return "South Asia"
  if (lat < 28.5 && x >= 92.2 && x < 141) {
    if (x < 98.5) return "Southeast Asia"
    // Hainan.
    if (x >= 108.5 && x < 111.2 && lat >= 18 && lat < 20.3) return "East Asia"
    if (lat < 21.5) return "Southeast Asia"
    // Northern Vietnam and Laos.
    if (x < 108.5 && lat < 23.4) return "Southeast Asia"
  }
  return "East Asia"
}

/** The region a point falls in (see the notes at the top). */
export function regionFor(lat: number, lng: number): Region {
  const x = wrapLng(lng)
  if (isAustraliaNz(lat, x)) return "Australia & New Zealand"
  if (isPacific(lat, x)) return "Pacific Islands"
  // West of the Atlantic ridge, and Greenland's east coast.
  if (x < -30 || (x < -11 && lat > 67)) return americas(lat, x)
  if (isEurope(lat, x)) return "Europe"
  if (isAfrica(lat, x)) return africanRegion(lat, x)
  return asianRegion(lat, x)
}

/** The continent a point falls in: its region's, with the Middle East and
 *  North Africa split at the Suez Canal and the Red Sea. North America
 *  includes Central America and the Caribbean. */
export function continentFor(lat: number, lng: number): Continent {
  const region = regionFor(lat, lng)
  if (region === "Middle East & North Africa") return isAfrica(lat, wrapLng(lng)) ? "Africa" : "Asia"
  return CONTINENT_OF[region]
}

/** One point for a location: the point itself, or the centre of a polygon's
 *  outer ring (vertex average, which is fine at map scale). */
export function shapeCenter(shape: LocationShape): LatLng | null {
  if (shape.kind === "point") return shape.point
  const ring = shape.rings[0]
  if (!ring || ring.length === 0) return null
  let lat = 0
  let lng = 0
  // A closed ring repeats its first vertex; leave the repeat out.
  const n =
    ring.length > 1 &&
    ring[0].lat === ring[ring.length - 1].lat &&
    ring[0].lng === ring[ring.length - 1].lng
      ? ring.length - 1
      : ring.length
  for (let i = 0; i < n; i++) {
    lat += ring[i].lat
    lng += ring[i].lng
  }
  return { lat: lat / n, lng: lng / n }
}
