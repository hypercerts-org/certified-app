"use client"

import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { fetchIndexerActivities } from "@/lib/atproto/indexer"
import type { ActivityRecord } from "@/lib/atproto/activity-types"
import { useAuth } from "@/lib/auth/auth-context"
import { useManagedAuthors } from "./use-managed-authors"
import { ownerTagForDid, ownerTagForUri, type OwnerTag } from "@/lib/atproto/owner-tag"

const PAGE_SIZE = 20

/** An activity record plus the provenance tag of its owning identity. */
export interface ManagedActivity {
  record: ActivityRecord
  owner: OwnerTag
}

export interface ManagedActivitiesResult {
  items: ManagedActivity[]
  isLoading: boolean
  isLoadingMore: boolean
  error: string | null
  hasMore: boolean
  loadMore: () => void
}

/**
 * Aggregated activity feed across the viewer's managed identities
 * (personal + owned/admin groups). Wraps `fetchIndexerActivities` with
 * the multi-author author set from `useManagedAuthors`, excluding
 * takedown-labelled records server-side.
 *
 * Each record is annotated with an `OwnerTag`. We prefer the
 * publishing DID from the result's `dids` Map (authoritative — it's the
 * repo that actually hosts the record) and fall back to parsing the
 * AT-URI when a URI is somehow absent from the map.
 */
export function useManagedActivities(
  { enabled = true }: { enabled?: boolean } = {},
): ManagedActivitiesResult {
  const { did } = useAuth()
  const { authors, byDid, isLoading: authorsLoading } = useManagedAuthors()

  const [records, setRecords] = useState<ActivityRecord[]>([])
  const [didsByUri, setDidsByUri] = useState<Map<string, string>>(new Map())
  const [cursor, setCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const generationRef = useRef(0)
  const authorsKey = authors.join(",")

  const loadInitial = useCallback(
    async (signal?: AbortSignal) => {
      const generation = ++generationRef.current

      if (!enabled) {
        setRecords([])
        setDidsByUri(new Map())
        setCursor(null)
        setHasMore(false)
        setIsLoading(false)
        setError(null)
        return
      }

      if (authorsLoading) {
        setIsLoading(true)
        return
      }

      if (authors.length === 0) {
        setRecords([])
        setDidsByUri(new Map())
        setCursor(null)
        setHasMore(false)
        setIsLoading(false)
        setError(null)
        return
      }

      try {
        setIsLoading(true)
        setError(null)
        const data = await fetchIndexerActivities({
          authors,
          excludeLabels: ["!takedown"],
          first: PAGE_SIZE,
          signal,
        })
        if (signal?.aborted || generation !== generationRef.current) return
        setRecords(data.records)
        setDidsByUri(data.dids)
        setCursor(data.endCursor)
        setHasMore(data.hasMore)
      } catch (err) {
        if (signal?.aborted || generation !== generationRef.current) return
        console.error("Failed to fetch managed activities:", err)
        setError(err instanceof Error ? err.message : "Failed to fetch activities")
      } finally {
        if (!signal?.aborted) setIsLoading(false)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [authorsKey, authorsLoading, enabled],
  )

  useEffect(() => {
    const controller = new AbortController()
    loadInitial(controller.signal)
    return () => controller.abort()
  }, [loadInitial])

  const loadMore = useCallback(async () => {
    if (!enabled || !cursor || isLoadingMore || authors.length === 0) return
    const generation = generationRef.current
    try {
      setIsLoadingMore(true)
      const data = await fetchIndexerActivities({
        authors,
        excludeLabels: ["!takedown"],
        first: PAGE_SIZE,
        after: cursor,
      })
      if (generation !== generationRef.current) return
      setRecords((prev) => {
        const seen = new Set(prev.map((r) => r.uri))
        const append = data.records.filter((r) => !seen.has(r.uri))
        return [...prev, ...append]
      })
      setDidsByUri((prev) => {
        const next = new Map(prev)
        for (const [uri, ownerDid] of data.dids) next.set(uri, ownerDid)
        return next
      })
      setCursor(data.endCursor)
      setHasMore(data.hasMore)
    } catch (err) {
      if (generation !== generationRef.current) return
      console.error("Failed to load more managed activities:", err)
      setError(err instanceof Error ? err.message : "Failed to load more")
    } finally {
      if (generation === generationRef.current) setIsLoadingMore(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, cursor, isLoadingMore, authorsKey])

  const items = useMemo<ManagedActivity[]>(
    () =>
      records.map((record) => {
        // Prefer the indexer's authoritative publishing DID; fall back
        // to URI-parsing when the map lacks the URI.
        const ownerDid = didsByUri.get(record.uri)
        const owner = ownerDid
          ? ownerTagForDid(ownerDid, byDid, did)
          : ownerTagForUri(record.uri, byDid, did)
        return { record, owner }
      }),
    [records, didsByUri, byDid, did],
  )

  return {
    items,
    isLoading: enabled && (isLoading || authorsLoading),
    isLoadingMore,
    error,
    hasMore,
    loadMore,
  }
}
