import { NextRequest, NextResponse } from "next/server"

/**
 * Proxy for Nominatim (OpenStreetMap's geocoding service). Two modes:
 *
 *   - `GET /api/geocode?q=<query>` — forward geocoding (text → coords).
 *   - `GET /api/geocode?lat=<lat>&lon=<lon>` — reverse geocoding
 *     (coords → display name).
 *
 * Why proxy instead of letting the browser hit Nominatim directly:
 *   1. Nominatim's usage policy requires a meaningful `User-Agent`
 *      identifying the app. Browsers don't allow overriding UA on
 *      fetch(); only server-to-server calls can comply.
 *   2. Edge cache (s-maxage) on the response collapses repeat
 *      lookups across users — common queries ("New York", "London")
 *      return without re-hitting upstream.
 *   3. Keeps the user's IP off Nominatim's logs; our server's IP
 *      hits them instead.
 *
 * Attribution requirement: callers (the location picker UI) display
 * "© OpenStreetMap contributors" near the map.
 */

const NOMINATIM_BASE = "https://nominatim.openstreetmap.org"
const USER_AGENT = "Certified (https://certified.app; contact@certified.app)"

interface NominatimForwardHit {
  lat: string
  lon: string
  display_name: string
  importance?: number
  type?: string
  class?: string
}

interface NominatimReverseHit {
  lat: string
  lon: string
  display_name: string
  error?: string
}

export interface GeocodeForwardResult {
  lat: number
  lng: number
  displayName: string
}

export interface GeocodeReverseResult {
  lat: number
  lng: number
  displayName: string
}

const CACHE_HEADERS = {
  // Forward + reverse hits are stable for a given input on human
  // timescales. 24h shared cache is fine; the UI debounces the
  // user's typing so we're not flooding cache anyway.
  "Cache-Control": "public, max-age=300, s-maxage=86400",
} as const

export async function GET(request: NextRequest) {
  const url = request.nextUrl
  const q = url.searchParams.get("q")
  const lat = url.searchParams.get("lat")
  const lon = url.searchParams.get("lon")

  try {
    if (q !== null) {
      // Forward geocode.
      const trimmed = q.trim()
      if (trimmed.length === 0 || trimmed.length > 200) {
        return NextResponse.json({ error: "invalid q" }, { status: 400 })
      }
      const upstream = new URL(`${NOMINATIM_BASE}/search`)
      upstream.searchParams.set("q", trimmed)
      upstream.searchParams.set("format", "json")
      upstream.searchParams.set("limit", "1")
      upstream.searchParams.set("addressdetails", "0")
      const res = await fetch(upstream.toString(), {
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
        signal: AbortSignal.timeout(8_000),
      })
      if (!res.ok) {
        return NextResponse.json(
          { error: `Upstream returned ${res.status}` },
          { status: 502 },
        )
      }
      const body = (await res.json()) as NominatimForwardHit[]
      const hit = body[0]
      if (!hit) {
        return NextResponse.json(
          { result: null },
          { headers: CACHE_HEADERS },
        )
      }
      const result: GeocodeForwardResult = {
        lat: parseFloat(hit.lat),
        lng: parseFloat(hit.lon),
        displayName: hit.display_name,
      }
      if (!Number.isFinite(result.lat) || !Number.isFinite(result.lng)) {
        return NextResponse.json({ result: null }, { headers: CACHE_HEADERS })
      }
      return NextResponse.json({ result }, { headers: CACHE_HEADERS })
    }

    if (lat !== null && lon !== null) {
      // Reverse geocode.
      const latNum = parseFloat(lat)
      const lonNum = parseFloat(lon)
      if (!Number.isFinite(latNum) || !Number.isFinite(lonNum)) {
        return NextResponse.json({ error: "invalid lat/lon" }, { status: 400 })
      }
      if (latNum < -90 || latNum > 90 || lonNum < -180 || lonNum > 180) {
        return NextResponse.json({ error: "out of range" }, { status: 400 })
      }
      const upstream = new URL(`${NOMINATIM_BASE}/reverse`)
      upstream.searchParams.set("lat", String(latNum))
      upstream.searchParams.set("lon", String(lonNum))
      upstream.searchParams.set("format", "json")
      upstream.searchParams.set("zoom", "12") // city / town level — keeps display_name short
      const res = await fetch(upstream.toString(), {
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
        signal: AbortSignal.timeout(8_000),
      })
      if (!res.ok) {
        return NextResponse.json(
          { error: `Upstream returned ${res.status}` },
          { status: 502 },
        )
      }
      const body = (await res.json()) as NominatimReverseHit
      if (body.error || !body.display_name) {
        return NextResponse.json({ result: null }, { headers: CACHE_HEADERS })
      }
      const result: GeocodeReverseResult = {
        lat: latNum,
        lng: lonNum,
        displayName: body.display_name,
      }
      return NextResponse.json({ result }, { headers: CACHE_HEADERS })
    }

    return NextResponse.json(
      { error: "missing q or lat/lon" },
      { status: 400 },
    )
  } catch (err) {
    console.error("[geocode] upstream error", err)
    return NextResponse.json({ error: "Geocoding failed" }, { status: 502 })
  }
}
