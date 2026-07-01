import { NextRequest, NextResponse } from "next/server"
import { getSessionDid } from "@/lib/auth/session"
import { logSafe } from "@/lib/utils/log-safe"
import { enforceRateLimit, makeLimiter } from "@/lib/auth/rate-limit"

// 60/min by session DID. The route is auth-gated so DID is always
// available; IP enforcement would just duplicate the budget.
const LIMITER = makeLimiter("geocode", 60, 60)

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
 * Auth: requires an authenticated session. The geocode UI is only
 * mounted on edit screens (cert / profile / group), which are all
 * auth-gated; gating the route too closes an open-internet abuse
 * surface (anonymous traffic can otherwise burn through our
 * Nominatim quota and rate-limit our egress IP for legitimate users).
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
  const did = await getSessionDid()
  if (!did) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  const rateDenied = await enforceRateLimit(LIMITER, did)
  if (rateDenied) return rateDenied

  const url = request.nextUrl
  const q = url.searchParams.get("q")
  const lat = url.searchParams.get("lat")
  const lon = url.searchParams.get("lon")
  const limitRaw = url.searchParams.get("limit")

  try {
    if (q !== null) {
      // Forward geocode. `limit` controls how many hits we return —
      // the autocomplete dropdown asks for 5-8; the legacy
      // single-hit caller leaves it unset.
      const trimmed = q.trim()
      if (trimmed.length === 0 || trimmed.length > 200) {
        return NextResponse.json({ error: "invalid q" }, { status: 400 })
      }
      // Number() rather than parseInt — parseInt silently truncates
      // "3.7" to 3 and accepts trailing garbage ("3abc"). Number +
      // isInteger rejects both consistently.
      const parsedLimit = limitRaw === null ? 1 : Number(limitRaw)
      const limit = Number.isInteger(parsedLimit)
        ? Math.min(10, Math.max(1, parsedLimit))
        : 1

      const upstream = new URL(`${NOMINATIM_BASE}/search`)
      upstream.searchParams.set("q", trimmed)
      upstream.searchParams.set("format", "json")
      upstream.searchParams.set("limit", String(limit))
      upstream.searchParams.set("addressdetails", "0")
      const res = await fetch(upstream.toString(), {
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
        signal: AbortSignal.timeout(8_000),
      })
      if (!res.ok) {
        // Never echo upstream status in the body (AGENTS.md §17 #7).
        // logSafe so operators can still diagnose Nominatim health.
        logSafe("[geocode] upstream non-2xx", undefined, {
          status: res.status,
        })
        return NextResponse.json(
          { error: "Geocoding upstream unavailable" },
          { status: 502 },
        )
      }
      const body = (await res.json()) as NominatimForwardHit[]
      const results: GeocodeForwardResult[] = []
      for (const hit of body) {
        const latNum = parseFloat(hit.lat)
        const lngNum = parseFloat(hit.lon)
        if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) continue
        results.push({
          lat: latNum,
          lng: lngNum,
          displayName: hit.display_name,
        })
      }
      // Preserve the legacy single-hit response shape for callers
      // that don't pass `limit`. Multi-hit callers get `results[]`.
      if (limit === 1) {
        return NextResponse.json(
          { result: results[0] ?? null },
          { headers: CACHE_HEADERS },
        )
      }
      return NextResponse.json({ results }, { headers: CACHE_HEADERS })
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
        // Never echo upstream status in the body (AGENTS.md §17 #7).
        // logSafe so operators can still diagnose Nominatim health.
        logSafe("[geocode] upstream non-2xx", undefined, {
          status: res.status,
        })
        return NextResponse.json(
          { error: "Geocoding upstream unavailable" },
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
    logSafe("[geocode] upstream error", err)
    return NextResponse.json({ error: "Geocoding failed" }, { status: 502 })
  }
}
