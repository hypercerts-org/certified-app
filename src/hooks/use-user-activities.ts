"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { fetchActivities } from "@/lib/atproto/activity"
import type { ActivityRecord } from "@/lib/atproto/activity-types"

/**
 * Fetch the activities of a specific user by DID. Takes an explicit
 * `did` parameter so it can power any profile (own or someone else's).
 */
export function useUserActivities(did: string | null) {
  const [activities, setActivities] = useState<ActivityRecord[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Bumped on every initial-load run (profile switch / remount). loadMore
  // captures the generation it was issued under and bails if a fresh load
  // has superseded it, so an in-flight loadMore for the previous DID can't
  // append stale records to the reset list. Mirrors use-explore.
  const generationRef = useRef(0)

  const loadInitial = useCallback(
    async (signal?: AbortSignal) => {
      const generation = ++generationRef.current
      if (!did) {
        setActivities([])
        setCursor(null)
        setIsLoading(false)
        setError(null)
        return
      }

      try {
        setIsLoading(true)
        setError(null)
        const data = await fetchActivities(did, undefined, 20, signal)
        if (signal?.aborted || generation !== generationRef.current) return
        setActivities(data.records)
        setCursor(data.cursor ?? null)
      } catch (err) {
        if (signal?.aborted || generation !== generationRef.current) return
        console.error("Failed to fetch user activities:", err)
        setError(err instanceof Error ? err.message : "Failed to fetch activities")
      } finally {
        if (!signal?.aborted) setIsLoading(false)
      }
    },
    [did]
  )

  useEffect(() => {
    const controller = new AbortController()
    loadInitial(controller.signal)
    return () => controller.abort()
  }, [loadInitial])

  const loadMore = useCallback(async () => {
    if (!did || !cursor || isLoadingMore) return

    // Capture the generation this page was requested under. If a profile
    // switch (or remount) bumps the generation while this fetch is in
    // flight, drop the result instead of appending the previous DID's
    // records to the freshly reset list.
    const generation = generationRef.current

    try {
      setIsLoadingMore(true)
      const data = await fetchActivities(did, cursor, 20)
      if (generation !== generationRef.current) return
      setActivities((prev) => {
        // Dedup by uri so overlapping edges across a cursor boundary
        // don't insert duplicate rows. Mirrors use-home-feed's `seen` Set.
        const seen = new Set(prev.map((r) => r.uri))
        const append = data.records.filter((r) => !seen.has(r.uri))
        return [...prev, ...append]
      })
      setCursor(data.cursor ?? null)
    } catch (err) {
      if (generation !== generationRef.current) return
      console.error("Failed to load more user activities:", err)
      setError(err instanceof Error ? err.message : "Failed to load more")
    } finally {
      if (generation === generationRef.current) setIsLoadingMore(false)
    }
  }, [did, cursor, isLoadingMore])

  return {
    activities,
    isLoading,
    isLoadingMore,
    error,
    hasMore: !!cursor,
    loadMore,
  }
}
