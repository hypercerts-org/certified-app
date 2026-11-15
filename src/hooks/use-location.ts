"use client"

import { useEffect, useState } from "react"
import { authFetch } from "@/lib/auth/fetch"
import { parseAtUri } from "@/lib/atproto/activity-uri"
import { createBoundedCache } from "@/lib/utils/bounded-cache"
import type { LocationRecord } from "@/lib/atproto/location"

// Module-level cache so the same location referenced by multiple
// activities (or multiple contributors pointing at the same place) is
// only fetched once per page lifetime.
const cache = createBoundedCache<string, Promise<LocationRecord | null>>()

/** One location record by at:// URI, cached per page lifetime (shared by
 *  the record pages' byline, their location card and the map). */
export function loadLocation(uri: string): Promise<LocationRecord | null> {
  return fetchLocation(uri)
}

/**
 * Several location records at once, in the order given (null for one that
 * couldn't be read). Backs the record pages' place names.
 */
export function useLocations(uris: readonly string[]): {
  locations: (LocationRecord | null)[]
  isLoading: boolean
} {
  const key = uris.join("|")
  const [state, setState] = useState<{ key: string; locations: (LocationRecord | null)[] }>({
    key: "",
    locations: [],
  })
  useEffect(() => {
    if (!key) return
    let cancelled = false
    Promise.all(key.split("|").map((u) => fetchLocation(u))).then((locations) => {
      if (!cancelled) setState({ key, locations })
    })
    return () => {
      cancelled = true
    }
  }, [key])
  if (!key) return { locations: [], isLoading: false }
  return {
    locations: state.key === key ? state.locations : [],
    isLoading: state.key !== key,
  }
}

function fetchLocation(uri: string): Promise<LocationRecord | null> {
  const existing = cache.get(uri)
  if (existing) return existing

  const parsed = parseAtUri(uri)
  if (!parsed) return Promise.resolve(null)

  const params = new URLSearchParams({
    repo: parsed.did,
    collection: parsed.collection,
    rkey: parsed.rkey,
  })

  const p = authFetch(`/api/xrpc/com/atproto/repo/getRecord?${params.toString()}`)
    .then((res) => (res.ok ? res.json() : null))
    .then((data: { value?: LocationRecord } | null) => {
      if (!data || !data.value) return null
      return data.value
    })
    .catch(() => {
      // Invalidate so a later mount can retry
      cache.delete(uri)
      return null
    })

  cache.set(uri, p)
  return p
}

/**
 * Fetch a single location record by its at:// URI. Used by the
 * activity detail page to render human-readable location info
 * (name, description, coordinates) instead of a raw URI.
 */
export function useLocation(uri: string): {
  location: LocationRecord | null
  isLoading: boolean
} {
  const [location, setLocation] = useState<LocationRecord | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Adjust state during render when the URI changes (first mount already
  // starts loading via the initializer), so the effect holds only the
  // fetch lifecycle.
  const [prevUri, setPrevUri] = useState(uri)
  if (prevUri !== uri) {
    setPrevUri(uri)
    setIsLoading(true)
  }

  useEffect(() => {
    let cancelled = false
    fetchLocation(uri)
      .then((data) => {
        if (cancelled) return
        setLocation(data)
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [uri])

  return { location, isLoading }
}
