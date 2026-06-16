"use client"

import { useEffect, useState } from "react"
import { fetchUserActivityCount } from "@/lib/atproto/indexer"

/**
 * Exact deduped count of the activities a profile (`did`) CREATED or
 * CONTRIBUTED to — the union of both buckets, counted once each. Backed
 * by the indexer's `_or` totalCount (see `fetchUserActivityCount`), so
 * it's a precise number rather than the "N+" a capped page fetch gives.
 *
 * Returns null while loading or on failure; callers should fall back to
 * a neutral label (or hide the count) in that case.
 */
export function useUserActivityCount(did: string | null): number | null {
  // Track which did the resolved count belongs to so a did change reports
  // null immediately rather than lingering on the previous profile's count
  // until the new fetch resolves. `fetchUserActivityCount` resolves to null
  // for an empty did, so the reset path still runs through the same async
  // setState — no synchronous setState in the effect body.
  const [resolved, setResolved] = useState<{
    did: string | null
    count: number | null
  }>({ did: null, count: null })
  useEffect(() => {
    let cancelled = false
    fetchUserActivityCount(did ?? "").then((c) => {
      if (!cancelled) setResolved({ did, count: c })
    })
    return () => {
      cancelled = true
    }
  }, [did])
  return resolved.did === did ? resolved.count : null
}
