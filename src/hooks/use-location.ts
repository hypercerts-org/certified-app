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
