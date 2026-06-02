"use client"

import { useEffect, useState } from "react"
import {
  fetchNetworkCounts,
  type NetworkCounts,
} from "@/lib/atproto/indexer"

const EMPTY: NetworkCounts = {
  users: null,
  organizations: null,
  achievements: null,
  projects: null,
  endorsements: null,
}

// Module-level cache + inflight promise. The welcome page might
// re-render or the user might bounce away and back; no point
// re-fetching the same five counts every time. 5-minute freshness
// is generous for a marketing surface.
const STALE_MS = 5 * 60 * 1000
let cache: { counts: NetworkCounts; fetchedAt: number } | null = null
let inflight: Promise<NetworkCounts> | null = null

async function loadCounts(force = false): Promise<NetworkCounts> {
  if (
    !force &&
    cache &&
    Date.now() - cache.fetchedAt < STALE_MS
  ) {
    return cache.counts
  }
  if (inflight) return inflight
  inflight = (async () => {
    try {
      const counts = await fetchNetworkCounts()
      // Don't poison the cache with an all-null result. Every op
      // returning null means a transient failure (indexer down,
      // CSRF mismatch in dev, etc.), and caching that for 5 minutes
      // means the next render keeps showing "—" long after the
      // underlying issue is fixed.
      if (Object.values(counts).some((v) => v !== null)) {
        cache = { counts, fetchedAt: Date.now() }
      }
      return counts
    } finally {
      inflight = null
    }
  })()
  return inflight
}

/**
 * Fetch + memoize the network-wide counts shown on the /welcome
 * landing page stats strip. `isLoading` is true until the first
 * fetch resolves; individual fields may still be `null` after
 * that if the underlying GraphQL op failed (e.g. indexer down for
 * one collection but not the others). Render sites should treat
 * `null` as "-".
 */
export function useNetworkCounts(): {
  counts: NetworkCounts
  isLoading: boolean
} {
  const [counts, setCounts] = useState<NetworkCounts>(
    () => cache?.counts ?? EMPTY,
  )
  const [isLoading, setIsLoading] = useState(!cache)

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    loadCounts()
      .then((next) => {
        if (cancelled) return
        setCounts(next)
      })
      .catch(() => {
        // Helper swallows per-op errors; this only fires on a
        // truly unexpected throw. Keep the previous counts on
        // screen if any.
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return { counts, isLoading }
}
