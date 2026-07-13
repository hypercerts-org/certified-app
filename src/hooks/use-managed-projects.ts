"use client"

import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { fetchProjects } from "@/lib/atproto/indexer"
import type { CollectionRecord } from "@/lib/atproto/collection"
import { useAuth } from "@/lib/auth/auth-context"
import { useManagedAuthors } from "./use-managed-authors"
import { ownerTagForUri, type OwnerTag } from "@/lib/atproto/owner-tag"

const PAGE_SIZE = 24

/** A project record plus the provenance tag of its owning identity. */
export interface ManagedProject {
  record: CollectionRecord
  owner: OwnerTag
}

export interface ManagedProjectsResult {
  items: ManagedProject[]
  isLoading: boolean
  isLoadingMore: boolean
  error: string | null
  hasMore: boolean
  loadMore: () => void
}

/**
 * Aggregated project listing across the viewer's managed identities
 * (personal + owned/admin groups). Wraps `fetchProjects({ authors })`
 * with the multi-author author set from `useManagedAuthors`, then
 * annotates each record with an `OwnerTag` derived from its AT-URI repo
 * DID.
 *
 * Holds the spinner (`isLoading`) while the managed-author set is still
 * resolving, so consumers never page against a half-built author list.
 *
 * Pagination is single-cursor: the indexer's `Projects` op paginates the
 * union of `authors` server-side, so one `endCursor` walks the whole
 * aggregate.
 *
 * `enabled` (default true) lets a caller switch the aggregation off without
 * violating the rules of hooks — e.g. a profile tab uses the single-DID
 * path on a foreign profile and only aggregates on the viewer's own.
 */
export function useManagedProjects(
  { enabled = true }: { enabled?: boolean } = {},
): ManagedProjectsResult {
  const { did } = useAuth()
  const { authors, byDid, isLoading: authorsLoading } = useManagedAuthors()

  const [records, setRecords] = useState<CollectionRecord[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Bumped on every initial-load run so a late loadMore for a stale
  // author set can't append to a freshly reset list. Mirrors
  // use-explore.
  const generationRef = useRef(0)

  // Stable key so the effect only re-runs when the author DIDs actually
  // change (not on every byDid Map identity).
  const authorsKey = authors.join(",")

  const loadInitial = useCallback(
    async (signal?: AbortSignal) => {
      const generation = ++generationRef.current

      // Aggregation switched off (e.g. a foreign profile) — empty, idle.
      if (!enabled) {
        setRecords([])
        setCursor(null)
        setHasMore(false)
        setIsLoading(false)
        setError(null)
        return
      }

      // While the author set is resolving, hold the spinner and don't
      // fetch — we'd otherwise query a partial / empty author list.
      if (authorsLoading) {
        setIsLoading(true)
        return
      }

      // No managed authors (logged out, or no identities) — empty result.
      if (authors.length === 0) {
        setRecords([])
        setCursor(null)
        setHasMore(false)
        setIsLoading(false)
        setError(null)
        return
      }

      try {
        setIsLoading(true)
        setError(null)
        const data = await fetchProjects({ authors, first: PAGE_SIZE, signal })
        if (signal?.aborted || generation !== generationRef.current) return
        setRecords(data.records)
        setCursor(data.endCursor)
        setHasMore(data.hasMore)
      } catch (err) {
        if (signal?.aborted || generation !== generationRef.current) return
        console.error("Failed to fetch managed projects:", err)
        setError(err instanceof Error ? err.message : "Failed to fetch projects")
      } finally {
        if (!signal?.aborted) setIsLoading(false)
      }
    },
    // authorsKey stands in for the authors array identity.
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
      const data = await fetchProjects({ authors, first: PAGE_SIZE, after: cursor })
      if (generation !== generationRef.current) return
      setRecords((prev) => {
        const seen = new Set(prev.map((r) => r.uri))
        const append = data.records.filter((r) => !seen.has(r.uri))
        return [...prev, ...append]
      })
      setCursor(data.endCursor)
      setHasMore(data.hasMore)
    } catch (err) {
      if (generation !== generationRef.current) return
      console.error("Failed to load more managed projects:", err)
      setError(err instanceof Error ? err.message : "Failed to load more")
    } finally {
      if (generation === generationRef.current) setIsLoadingMore(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, cursor, isLoadingMore, authorsKey])

  const items = useMemo<ManagedProject[]>(
    () =>
      records.map((record) => ({
        record,
        owner: ownerTagForUri(record.uri, byDid, did),
      })),
    [records, byDid, did],
  )

  return {
    items,
    // Keep the spinner up while the author set is still being assembled
    // (but never report loading when aggregation is disabled).
    isLoading: enabled && (isLoading || authorsLoading),
    isLoadingMore,
    error,
    hasMore,
    loadMore,
  }
}
