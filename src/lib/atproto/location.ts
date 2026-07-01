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

/**
 * Split a human-readable location name into an Open Location Code
 * ("Plus Code") prefix and the remaining display name. Geocoders
 * sometimes prepend a short code — `5FX5+QGF`, `G3FC+2P`, etc. —
 * that's useful as a globally-resolvable handle but adds noise when
 * the place already has a recognizable name attached. The renderer
 * uses the split so it can show the clean name as the primary label
 * AND surface the Plus Code as a small copy-paste-able tag next to
 * it.
 *
 * Plus Code shape per the spec: a sequence of 4+ alphanumerics
 * (uppercase letters / digits) followed by `+` followed by 2-3 more.
 * Whitespace + an optional separator comma after the code are
 * consumed too — `"5FX5+QGF, Timbi-Madina, Guinée"` parses to
 * `{plusCode: "5FX5+QGF", name: "Timbi-Madina, Guinée"}`.
 *
 * If the input doesn't start with a Plus Code, `plusCode` is null
 * and `name` is the input verbatim.
 */
const PLUS_CODE_PREFIX = /^([A-Z0-9]{4,}\+[A-Z0-9]{2,3})\s*,?\s*/

export function splitLocationName(name: string): {
  plusCode: string | null
  name: string
} {
  const match = name.match(PLUS_CODE_PREFIX)
  if (!match) return { plusCode: null, name }
  return {
    plusCode: match[1],
    name: name.slice(match[0].length).trim(),
  }
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

// ----- Polygon support -----
// Some location records store an actual region (the lexicon allows
// `geojson-polygon` as a `locationType`). Pins don't represent those
// well, so we expose both shapes and let the renderer decide. Callers
// that only want a single point keep using `parseLocationCoords`.

export interface PointShape {
  kind: "point"
  point: LatLng
}

export interface PolygonShape {
  kind: "polygon"
  /** Outer ring first, then any inner-hole rings — same convention
   *  as GeoJSON. Each ring is a list of `LatLng` pairs (we transpose
   *  from GeoJSON's `[lng, lat]` to our `{lat, lng}` shape). */
  rings: LatLng[][]
}

export type LocationShape = PointShape | PolygonShape

/**
 * Polymorphic location parser — handles every shape the existing
 * `parseLocationCoords` did, PLUS GeoJSON polygons / multipolygons.
 * Returns null for unrecognised / malformed inputs.
 */
export function parseLocationShape(
  locationType: string | undefined,
  location: unknown,
): LocationShape | null {
  const str = extractLocationString(location)
  if (!str) return null
  const type = (locationType || "").toLowerCase()

  try {
    if (type === "coordinate-decimal") {
      const parts = str.split(/\s*,\s*/).map(parseFloat)
      if (parts.length < 2 || parts.some(Number.isNaN)) return null
      const p = validCoord({ lat: parts[0], lng: parts[1] })
      return p ? { kind: "point", point: p } : null
    }

    if (type === "geojson-point" || type === "geojson" || type === "geojson-polygon") {
      const parsed = JSON.parse(str) as unknown
      const p = geoJsonToLatLng(parsed)
      if (p) return { kind: "point", point: p }
      const rings = geoJsonToPolygonRings(parsed)
      if (rings) return { kind: "polygon", rings }
      return null
    }

    if (type === "wkt") {
      const m = str.match(/POINT\s*\(\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s*\)/i)
      if (!m) return null
      const p = validCoord({ lat: parseFloat(m[2]), lng: parseFloat(m[1]) })
      return p ? { kind: "point", point: p } : null
    }
  } catch {
    return null
  }
  return null
}

/** Pull a polygon's rings out of a GeoJSON value. Tolerates the
 *  Polygon and MultiPolygon types as well as the Feature /
 *  FeatureCollection envelopes that sometimes wrap them. */
function geoJsonToPolygonRings(node: unknown): LatLng[][] | null {
  if (!node || typeof node !== "object") return null
  const obj = node as Record<string, unknown>
  const t = obj.type

  if (t === "Feature" && obj.geometry) return geoJsonToPolygonRings(obj.geometry)
  if (
    t === "FeatureCollection" &&
    Array.isArray(obj.features) &&
    obj.features[0]
  ) {
    return geoJsonToPolygonRings(obj.features[0])
  }

  if (t === "Polygon" && Array.isArray(obj.coordinates)) {
    return ringsFromCoords(obj.coordinates as unknown[])
  }

  // MultiPolygon — render only the first polygon. Sufficient for the
  // overwhelming majority of records (single named region) and
  // avoids juggling disconnected shapes in the renderer.
  if (
    t === "MultiPolygon" &&
    Array.isArray(obj.coordinates) &&
    Array.isArray(obj.coordinates[0])
  ) {
    return ringsFromCoords(obj.coordinates[0] as unknown[])
  }

  return null
}

function ringsFromCoords(rawRings: unknown[]): LatLng[][] | null {
  const rings: LatLng[][] = []
  for (const ring of rawRings) {
    if (!Array.isArray(ring)) return null
    const points: LatLng[] = []
    for (const pt of ring) {
      if (!Array.isArray(pt) || pt.length < 2) return null
      const [lng, lat] = pt as unknown[]
      if (typeof lat !== "number" || typeof lng !== "number") return null
      const v = validCoord({ lat, lng })
      if (!v) return null
      points.push(v)
    }
    if (points.length >= 3) rings.push(points)
  }
  return rings.length > 0 ? rings : null
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

// ====================================================================
// Write helpers for `app.certified.location` records.
//
// The org marker (`app.certified.actor.organization`) references a
// location via `com.atproto.repo.strongRef`. The writer below builds
// the record body, writes it on the right repo (own or group via the
// BFF), and returns the strongRef for the caller to embed.
//
// We match the existing in-app coordinate-decimal convention of
// "lat,lng" (the reader above accepts the same shape). The reader
// also tolerates a CRS84 "lng,lat" record for forward-compat with
// records written by other clients.
// ====================================================================

import { authFetch } from "@/lib/auth/fetch"
import { writeToRepo } from "@/lib/atproto/repo-write"
import { parseAtUri } from "@/lib/atproto/activity-uri"

const LOCATION_COLLECTION = "app.certified.location"
const LP_VERSION = "v0.1.0"
// URN form of EPSG:4326 — WGS 84 with latitude-longitude axis order.
// Matches the `"lat,lng"` coordinate string we serialise below (and
// the existing in-app `parseLocationCoords` reader's convention).
// The URN form is more widely recognised than the URL form and
// satisfies the lexicon's `format: "uri"` constraint without
// pretending to be a fetchable address.
const SRS = "urn:ogc:def:crs:EPSG::4326"
const LOCATION_TYPE_COORDINATE_DECIMAL = "coordinate-decimal"

export interface StrongRef {
  uri: string
  cid: string
}

export interface ParsedLocationStrongRef {
  uri: string
  cid: string
  name: string | null
  coords: LatLng
}

export interface PutLocationOptions {
  /** Existing rkey from a previous strongRef — pass to overwrite the
   *  record in-place instead of creating a new TID. Without this, every
   *  save leaves an orphan record on the repo. */
  rkey?: string
  /** Preserve the original `createdAt` on updates. */
  createdAt?: string
  /** CID of the record at read time — passed to upstream `putRecord`
   *  as `swapRecord` for the CID-precondition write. Only meaningful
   *  on the rkey-bound path; createRecord ignores it. */
  swapRecord?: string
}

function buildLocationRecord(
  name: string | null,
  coords: LatLng,
  createdAt?: string,
): LocationRecord & { $type: typeof LOCATION_COLLECTION } {
  const trimmedName = name?.trim() ?? ""
  return {
    $type: LOCATION_COLLECTION,
    lpVersion: LP_VERSION,
    srs: SRS,
    locationType: LOCATION_TYPE_COORDINATE_DECIMAL,
    // Matches the existing in-app reader convention (lat,lng). The
    // reader also accepts CRS84 "lng,lat" order if a foreign writer
    // uses that.
    location: {
      $type: "app.certified.location#string",
      string: `${coords.lat},${coords.lng}`,
    },
    ...(trimmedName ? { name: trimmedName } : {}),
    createdAt: createdAt ?? new Date().toISOString(),
  }
}

/**
 * Write the location record. When the target differs from the
 * session DID, routes through the group BFF (which must accept the
 * `app.certified.location` collection in its allowlist). Otherwise
 * goes through the XRPC proxy. Returns the strongRef the caller can
 * embed in the org marker.
 */
export async function putLocationRecord(
  ownDid: string,
  targetDid: string,
  coords: LatLng,
  name: string | null,
  options: PutLocationOptions = {},
): Promise<StrongRef> {
  const record = buildLocationRecord(name, coords, options.createdAt)

  // Own-repo path picks createRecord vs putRecord based on whether
  // the caller has a stable rkey. Group-repo path uses one BFF route
  // that accepts an optional rkey and decides upstream.
  // swapRecord is only meaningful on the putRecord path (rkey
  // present) — createRecord doesn't take it.
  const swap = options.rkey ? options.swapRecord : undefined
  const ownUrl = options.rkey
    ? "/api/xrpc/com/atproto/repo/putRecord"
    : "/api/xrpc/com/atproto/repo/createRecord"
  const ownBody = options.rkey
    ? {
        repo: ownDid,
        collection: LOCATION_COLLECTION,
        rkey: options.rkey,
        record,
        ...(swap ? { swapRecord: swap } : {}),
      }
    : { repo: ownDid, collection: LOCATION_COLLECTION, record }

  return writeToRepo<StrongRef>({
    ownDid,
    targetDid,
    ownPath: { url: ownUrl, method: "POST", body: ownBody },
    groupPath: {
      url: `/api/groups/${encodeURIComponent(targetDid)}/location`,
      method: "PUT",
      body: { rkey: options.rkey, record, ...(swap ? { swapRecord: swap } : {}) },
    },
    errorFallback: "Failed to save location",
  })
}

/**
 * Resolve a strongRef pointing at an `app.certified.location` record.
 * Returns `null` for missing records, malformed coordinate strings,
 * or strongRefs that don't point at this collection.
 */
export async function readLocationStrongRef(
  ref: StrongRef,
  signal?: AbortSignal,
): Promise<ParsedLocationStrongRef | null> {
  const parsed = parseAtUri(ref.uri)
  if (!parsed || parsed.collection !== LOCATION_COLLECTION) return null
  const params = new URLSearchParams({
    repo: parsed.did,
    collection: parsed.collection,
    rkey: parsed.rkey,
  })
  try {
    const res = await authFetch(
      `/api/xrpc/com/atproto/repo/getRecord?${params.toString()}`,
      { signal },
    )
    if (!res.ok) return null
    const body = (await res.json()) as {
      uri: string
      cid: string
      value: LocationRecord
    }
    const coords = parseLocationCoords(body.value?.locationType, body.value?.location)
    if (!coords) return null
    return {
      uri: body.uri,
      cid: body.cid,
      name: body.value?.name?.trim() || null,
      coords,
    }
  } catch {
    return null
  }
}

/** Extract just the rkey from a strongRef uri (used by the editor to
 *  putRecord into the same slot rather than spawning a new record on
 *  every save). */
export function rkeyFromStrongRefUri(uri: string): string | null {
  return parseAtUri(uri)?.rkey ?? null
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
