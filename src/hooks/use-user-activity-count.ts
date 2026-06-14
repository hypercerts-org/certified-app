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
  const [count, setCount] = useState<number | null>(null)
  useEffect(() => {
    let cancelled = false
    // `fetchUserActivityCount` resolves to null for an empty did, so the
    // reset path runs through the same async setState — avoids a
    // synchronous setState in the effect body.
    fetchUserActivityCount(did ?? "").then((c) => {
      if (!cancelled) setCount(c)
    })
    return () => {
      cancelled = true
    }
  }, [did])
  return count
}
