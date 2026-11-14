import type { LatLng, LocationShape } from "@/lib/atproto/location"
import type { Region } from "./dataset-types"

/**
 * A rough continent for a point, good enough to group funded projects into
 * five regions. Oceania takes the Pacific (both sides of the date line) and
 * Australasia; the Americas everything west of the Atlantic ridge; Europe
 * the north-west of Eurasia; Africa the land south of the Mediterranean and
 * west of Arabia; Asia the rest.
 */
export function regionFor(lat: number, lng: number): Region {
  if (lng < -160 || lng > 160 || (lng >= 110 && lat < -10)) return "Oceania"
  if (lng < -25) return "Americas"
  if (lat >= 36 && lng < 45) return "Europe"
  if (lng < 55 && lat < 36 && lat > -40) return "Africa"
  return "Asia"
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
