import {
  locationFallbackText,
  parseLocationShape,
  splitLocationName,
  type LocationRecord,
} from "./location"

/**
 * Readable labels for a location on the record pages: the place's name
 * when it has one, else its coordinates rounded to two decimals (about a
 * kilometre), never "Unnamed location" or a raw coordinate string.
 */

/** "37.98° S, 174.80° E" */
export function formatCoordinates(lat: number, lng: number): string {
  const ns = lat < 0 ? "S" : "N"
  const ew = lng < 0 ? "W" : "E"
  return `${Math.abs(lat).toFixed(2)}° ${ns}, ${Math.abs(lng).toFixed(2)}° ${ew}`
}

/** "9.944868914445339, -85.66965729295856" as a name: a bare decimal pair. */
const COORDINATE_PAIR = /^\s*(-?\d{1,3}(?:\.\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/

/**
 * The place's name without a leading Plus Code, or null. A name that is
 * only a pair of decimal coordinates (some records store the point there)
 * comes back rounded: "9.94° N, 85.67° W".
 */
export function locationName(record: LocationRecord | null | undefined): string | null {
  const raw = record?.name?.trim() ?? ""
  if (!raw) return null
  const pair = raw.match(COORDINATE_PAIR)
  if (pair) {
    const lat = Number(pair[1])
    const lng = Number(pair[2])
    if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return formatCoordinates(lat, lng)
  }
  const { name, plusCode } = splitLocationName(raw)
  return name || plusCode || null
}

/**
 * What to call a location: its name, else a written address, else its
 * point's rounded coordinates. Null when none of these can be read
 * (a polygon or a cell without a name).
 */
export function locationLabel(record: LocationRecord | null | undefined): string | null {
  if (!record) return null
  const name = locationName(record)
  if (name) return name
  const type = (record.locationType ?? "").toLowerCase()
  if (type === "address") {
    const address = locationFallbackText(record.locationType, record.location)?.trim()
    if (address) return address
  }
  const shape = parseLocationShape(record.locationType, record.location)
  if (shape?.kind === "point") return formatCoordinates(shape.point.lat, shape.point.lng)
  return null
}
