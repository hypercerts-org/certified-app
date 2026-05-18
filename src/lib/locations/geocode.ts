"use client"

import { authFetch } from "@/lib/auth/fetch"

/**
 * Client-side geocoding wrappers. Both forward and reverse calls go
 * through `/api/geocode` (which proxies to Nominatim with the
 * required User-Agent + edge cache); they're not meant to be called
 * directly from any other code path.
 *
 * Uses `authFetch` so a 401 (e.g. session expired mid-edit) surfaces
 * through the auth context's expiry UI rather than silently
 * returning null. Per AGENTS.md §22 pitfall #2.
 *
 * Returns `null` for misses / errors — callers should treat that
 * as "no usable result" rather than throwing.
 */

export interface ForwardGeocodeResult {
  lat: number
  lng: number
  displayName: string
}

export interface ReverseGeocodeResult {
  lat: number
  lng: number
  displayName: string
}

export async function forwardGeocode(
  query: string,
  signal?: AbortSignal,
): Promise<ForwardGeocodeResult | null> {
  const trimmed = query.trim()
  if (trimmed.length === 0) return null
  try {
    const res = await authFetch(
      `/api/geocode?q=${encodeURIComponent(trimmed)}`,
      { signal, headers: { Accept: "application/json" } },
    )
    if (!res.ok) return null
    const body = (await res.json()) as { result: ForwardGeocodeResult | null }
    return body.result ?? null
  } catch {
    return null
  }
}

/**
 * Forward-geocode but return up to `limit` matching hits. Used by
 * the location-picker autocomplete dropdown — the legacy
 * `forwardGeocode` (single-hit, no `limit` param) stays available
 * for any callsite that just wants the top match.
 */
export async function suggestForwardGeocode(
  query: string,
  limit: number,
  signal?: AbortSignal,
): Promise<ForwardGeocodeResult[]> {
  const trimmed = query.trim()
  if (trimmed.length === 0) return []
  try {
    const res = await authFetch(
      `/api/geocode?q=${encodeURIComponent(trimmed)}&limit=${encodeURIComponent(
        String(limit),
      )}`,
      { signal, headers: { Accept: "application/json" } },
    )
    if (!res.ok) return []
    const body = (await res.json()) as { results?: ForwardGeocodeResult[] }
    return Array.isArray(body.results) ? body.results : []
  } catch {
    return []
  }
}

export async function reverseGeocode(
  lat: number,
  lng: number,
  signal?: AbortSignal,
): Promise<ReverseGeocodeResult | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  try {
    const res = await authFetch(
      `/api/geocode?lat=${encodeURIComponent(String(lat))}&lon=${encodeURIComponent(
        String(lng),
      )}`,
      { signal, headers: { Accept: "application/json" } },
    )
    if (!res.ok) return null
    const body = (await res.json()) as { result: ReverseGeocodeResult | null }
    return body.result ?? null
  } catch {
    return null
  }
}
