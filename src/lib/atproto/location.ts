/**
 * Helpers for app.certified.location records referenced from activity
 * claims. The lexicon is defined at:
 *   /Users/holke/Documents/GitHub/hypercerts-lexicon/lexicons/app/certified/location.json
 *
 * A location record has `name`, `description`, `locationType` and a
 * polymorphic `location` union:
 *
 *   { $type: "org.hypercerts.defs#uri", uri: string }
 *   { $type: "org.hypercerts.defs#smallBlob", image: BlobRef }
 *   { $type: "app.certified.location#string", string: string }
 *
 * The `locationType` enum (from the lexicon):
 *
 *   coordinate-decimal | geojson-point | geojson | h3
 *   geohash | wkt | address | scaledCoordinates
 */

export interface LocationRecord {
  lpVersion?: string
  srs?: string
  locationType?: string
  location?: unknown
  name?: string
  description?: string
  createdAt?: string
}

export interface LatLng {
  lat: number
  lng: number
}

/** Extract the inline string from the `location` union, if it IS a string variant. */
function extractLocationString(location: unknown): string | null {
  if (typeof location === "string") return location
  if (!location || typeof location !== "object") return null
  const obj = location as Record<string, unknown>
  if (typeof obj.string === "string") return obj.string
  // URI variant
  if (typeof obj.uri === "string") return obj.uri
  return null
}

/** Try to parse common coordinate formats into a `{lat, lng}` pair.
 *  Returns null if the format isn't supported or the value is malformed. */
export function parseLocationCoords(
  locationType: string | undefined,
  location: unknown
): LatLng | null {
  const str = extractLocationString(location)
  if (!str) return null

  const type = (locationType || "").toLowerCase()

  try {
    switch (type) {
      case "coordinate-decimal": {
        // "lat,lng" or "lat, lng"
        const parts = str.split(/\s*,\s*/).map(parseFloat)
        if (parts.length < 2 || parts.some(Number.isNaN)) return null
        return validCoord({ lat: parts[0], lng: parts[1] })
      }

      case "geojson-point":
      case "geojson": {
        const parsed = JSON.parse(str) as unknown
        return geoJsonToLatLng(parsed)
      }

      case "wkt": {
        // e.g. "POINT(-122.4194 37.7749)"  (note: WKT is X Y = lng lat)
        const m = str.match(/POINT\s*\(\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s*\)/i)
        if (!m) return null
        return validCoord({ lat: parseFloat(m[2]), lng: parseFloat(m[1]) })
      }

      default:
        return null
    }
  } catch {
    return null
  }
}

/** Recursively walk a GeoJSON structure looking for a Point's coordinates. */
function geoJsonToLatLng(node: unknown): LatLng | null {
  if (!node || typeof node !== "object") return null
  const obj = node as Record<string, unknown>
  const t = obj.type

  if (t === "Feature" && obj.geometry) return geoJsonToLatLng(obj.geometry)
  if (t === "FeatureCollection" && Array.isArray(obj.features) && obj.features[0]) {
    return geoJsonToLatLng(obj.features[0])
  }
  if (t === "Point" && Array.isArray(obj.coordinates) && obj.coordinates.length >= 2) {
    const [lng, lat] = obj.coordinates as unknown[]
    if (typeof lat === "number" && typeof lng === "number") {
      return validCoord({ lat, lng })
    }
  }
  return null
}

function validCoord(c: LatLng): LatLng | null {
  if (!isFinite(c.lat) || !isFinite(c.lng)) return null
  if (c.lat < -90 || c.lat > 90) return null
  if (c.lng < -180 || c.lng > 180) return null
  return c
}

/** Format a lat/lng pair for display (6 decimals ~= 11 cm precision). */
export function formatCoords({ lat, lng }: LatLng): string {
  return `${lat.toFixed(6)}, ${lng.toFixed(6)}`
}

/** Build an OpenStreetMap URL centered on the coordinates with a pin. */
export function osmUrl({ lat, lng }: LatLng, zoom = 14): string {
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=${zoom}/${lat}/${lng}`
}

/** Plain-text fallback label for location types we don't parse into lat/lng. */
export function locationFallbackText(
  locationType: string | undefined,
  location: unknown
): string | null {
  const str = extractLocationString(location)
  if (!str) return null

  const type = (locationType || "").toLowerCase()
  if (type === "address") return str
  if (type === "h3") return `H3 cell: ${str}`
  if (type === "geohash") return `Geohash: ${str}`
  if (type === "scaledcoordinates") return str

  // GeoJSON polygon/multi-shape etc.
  return str.length > 200 ? `${str.slice(0, 200)}…` : str
}
