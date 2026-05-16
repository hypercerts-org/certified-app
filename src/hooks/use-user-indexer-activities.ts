"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { fetchUserIndexerActivities } from "@/lib/atproto/indexer"
import type { ActivityRecord } from "@/lib/atproto/activity-types"

const PAGE_SIZE = 30

/**
 * Paginated stream of activity records where `did` appears as either
 * the author or a contributor, sourced from the Magic Indexer's
 * `where: { _or: [...] }` filter. Callers split the combined stream
 * client-side by comparing `dids.get(uri) === did`.
 *
 * Why one combined query instead of two (authored + contributed)?
 * The indexer composes the OR server-side, so cursor pagination stays
 * coherent across both buckets. Splitting locally is O(n) and the per-
 * URI author DID is already on every page payload.
 *
 * Newly-created records may take a moment to appear here (indexer
 * ingestion lag) — direct PDS listRecords would be fresher but can't
 * answer the "where am I a contributor?" question.
 */
export function useUserIndexerActivities(did: string | null) {
  const [activities, setActivities] = useState<ActivityRecord[]>([])
  const [dids, setDids] = useState<Map<string, string>>(new Map())
  const [isLoading, setIsLoading] = useState(!!did)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const endCursorRef = useRef<string | null>(null)
  const isLoadingMoreRef = useRef(false)

  const loadInitial = useCallback(
    async (signal?: AbortSignal) => {
      if (!did) {
        setActivities([])
        setDids(new Map())
        setIsLoading(false)
        setError(null)
        setHasMore(false)
        endCursorRef.current = null
        return
      }
      try {
        setIsLoading(true)
        setError(null)
        const data = await fetchUserIndexerActivities(did, {
          first: PAGE_SIZE,
          signal,
        })
        if (signal?.aborted) return
        setActivities(data.records)
        setDids(data.dids)
        endCursorRef.current = data.endCursor
        setHasMore(data.hasMore)
      } catch (err) {
        if (signal?.aborted) return
        console.error("Failed to fetch user activities (indexer):", err)
        setError(err instanceof Error ? err.message : "Failed to fetch activities")
      } finally {
        if (!signal?.aborted) setIsLoading(false)
      }
    },
    [did],
  )

  useEffect(() => {
    const controller = new AbortController()
    loadInitial(controller.signal)
    return () => controller.abort()
  }, [loadInitial])

  const loadMore = useCallback(async () => {
    if (!did) return
    if (!endCursorRef.current || isLoadingMoreRef.current) return
    isLoadingMoreRef.current = true
    setIsLoadingMore(true)
    try {
      const data = await fetchUserIndexerActivities(did, {
        first: PAGE_SIZE,
        after: endCursorRef.current,
      })
      setActivities((prev) => [...prev, ...data.records])
      setDids((prev) => {
        const next = new Map(prev)
        data.dids.forEach((d, uri) => next.set(uri, d))
        return next
      })
      endCursorRef.current = data.endCursor
      setHasMore(data.hasMore)
    } catch (err) {
      console.error("Failed to load more user activities (indexer):", err)
      setHasMore(false)
    } finally {
      isLoadingMoreRef.current = false
      setIsLoadingMore(false)
    }
  }, [did])

  return { activities, dids, isLoading, isLoadingMore, error, hasMore, loadMore }
}
