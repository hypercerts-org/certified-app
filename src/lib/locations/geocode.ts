"use client"

/**
 * Client-side geocoding wrappers. Both forward and reverse calls go
 * through `/api/geocode` (which proxies to Nominatim with the
 * required User-Agent + edge cache); they're not meant to be called
 * directly from any other code path.
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
    const res = await fetch(
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

export async function reverseGeocode(
  lat: number,
  lng: number,
  signal?: AbortSignal,
): Promise<ReverseGeocodeResult | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  try {
    const res = await fetch(
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
