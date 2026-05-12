"use client"

import { useState, useEffect, useCallback } from "react"
import { fetchActivities } from "@/lib/atproto/activity"
import type { ActivityRecord } from "@/lib/atproto/activity-types"

/**
 * Fetch the activities of a specific user by DID. Mirrors `useActivities`
 * but takes an explicit `did` parameter so it can power any profile
 * (own or someone else's).
 */
export function useUserActivities(did: string | null) {
  const [activities, setActivities] = useState<ActivityRecord[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadInitial = useCallback(
    async (signal?: AbortSignal) => {
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
        if (signal?.aborted) return
        setActivities(data.records)
        setCursor(data.cursor ?? null)
      } catch (err) {
        if (signal?.aborted) return
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

    try {
      setIsLoadingMore(true)
      const data = await fetchActivities(did, cursor, 20)
      setActivities((prev) => [...prev, ...data.records])
      setCursor(data.cursor ?? null)
    } catch (err) {
      console.error("Failed to load more user activities:", err)
      setError(err instanceof Error ? err.message : "Failed to load more")
    } finally {
      setIsLoadingMore(false)
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
