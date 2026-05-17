"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { fetchUserIndexerActivities } from "@/lib/atproto/indexer"
import type { ActivityRecord } from "@/lib/atproto/activity-types"

const PAGE_SIZE = 30

interface BucketState {
  records: ActivityRecord[]
  dids: Map<string, string>
  cursor: string | null
  hasMore: boolean
}

const emptyBucket: BucketState = {
  records: [],
  dids: new Map(),
  cursor: null,
  hasMore: false,
}

/**
 * Two-bucket activity stream for a profile (`did`):
 *
 *   - `created`     — records where `did` is the author.
 *   - `contributed` — records where `did` appears in the contributors.
 *
 * The hook fires two GraphQL queries in parallel (one per bucket)
 * rather than a single `_or` query. That means a cert where the
 * user is BOTH author and contributor appears in both lists, which
 * is what the certs-tab UI expects.
 *
 * Pagination: `loadMore` advances whichever bucket still has more
 * results. Either bucket can run out independently.
 *
 * Indexer constraint: `contributor` only matches bare-string DIDs
 * or `{$type, identity: did}`-shaped values. Strong-ref contributor
 * identities (typical for group memberships) are silently missed —
 * server-side dereferencing is the proper fix.
 */
export function useUserIndexerActivities(did: string | null) {
  const [created, setCreated] = useState<BucketState>(emptyBucket)
  const [contributed, setContributed] = useState<BucketState>(emptyBucket)
  const [isLoading, setIsLoading] = useState(!!did)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isLoadingMoreRef = useRef(false)

  const loadInitial = useCallback(
    async (signal?: AbortSignal) => {
      if (!did) {
        setCreated(emptyBucket)
        setContributed(emptyBucket)
        setIsLoading(false)
        setError(null)
        return
      }
      try {
        setIsLoading(true)
        setError(null)
        const [authored, contrib] = await Promise.all([
          fetchUserIndexerActivities(did, {
            first: PAGE_SIZE,
            mode: "authored",
            signal,
          }),
          fetchUserIndexerActivities(did, {
            first: PAGE_SIZE,
            mode: "contributed",
            signal,
          }),
        ])
        if (signal?.aborted) return
        setCreated({
          records: authored.records,
          dids: authored.dids,
          cursor: authored.endCursor,
          hasMore: authored.hasMore,
        })
        setContributed({
          records: contrib.records,
          dids: contrib.dids,
          cursor: contrib.endCursor,
          hasMore: contrib.hasMore,
        })
      } catch (err) {
        if (signal?.aborted) return
        console.error("Failed to fetch user activities (indexer):", err)
        setError(
          err instanceof Error ? err.message : "Failed to fetch activities",
        )
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
    if (isLoadingMoreRef.current) return
    if (!created.hasMore && !contributed.hasMore) return
    isLoadingMoreRef.current = true
    setIsLoadingMore(true)
    try {
      const fetches: Promise<void>[] = []
      if (created.hasMore && created.cursor) {
        fetches.push(
          fetchUserIndexerActivities(did, {
            first: PAGE_SIZE,
            mode: "authored",
            after: created.cursor,
          }).then((data) => {
            setCreated((prev) => mergeBucket(prev, data))
          }),
        )
      }
      if (contributed.hasMore && contributed.cursor) {
        fetches.push(
          fetchUserIndexerActivities(did, {
            first: PAGE_SIZE,
            mode: "contributed",
            after: contributed.cursor,
          }).then((data) => {
            setContributed((prev) => mergeBucket(prev, data))
          }),
        )
      }
      await Promise.all(fetches)
    } catch (err) {
      console.error("Failed to load more user activities (indexer):", err)
    } finally {
      isLoadingMoreRef.current = false
      setIsLoadingMore(false)
    }
  }, [did, created.cursor, created.hasMore, contributed.cursor, contributed.hasMore])

  const hasMore = created.hasMore || contributed.hasMore

  return {
    /** Records where the profile DID is the author. */
    created: created.records,
    /** Records where the profile DID is in the contributors. May
     *  overlap with `created` when the user is both. */
    contributed: contributed.records,
    /** Combined per-URI author-DID map for compatibility with
     *  consumers that previously walked a unified list. */
    dids: useMergedDidsMap(created.dids, contributed.dids),
    isLoading,
    isLoadingMore,
    error,
    hasMore,
    loadMore,
  }
}

function mergeBucket(
  prev: BucketState,
  data: Awaited<ReturnType<typeof fetchUserIndexerActivities>>,
): BucketState {
  const nextDids = new Map(prev.dids)
  data.dids.forEach((d, uri) => nextDids.set(uri, d))
  return {
    records: [...prev.records, ...data.records],
    dids: nextDids,
    cursor: data.endCursor,
    hasMore: data.hasMore,
  }
}

function useMergedDidsMap(
  a: Map<string, string>,
  b: Map<string, string>,
): Map<string, string> {
  // Both maps key URIs to author DIDs; union them without
  // re-computing on every render unless the inputs actually change.
  // useState gives us a stable reference between renders; we only
  // refresh when either side's reference flips.
  const [merged, setMerged] = useState<Map<string, string>>(() => mergeMaps(a, b))
  const lastRef = useRef<{ a: typeof a; b: typeof b } | null>({ a, b })
  if (lastRef.current?.a !== a || lastRef.current?.b !== b) {
    lastRef.current = { a, b }
    setMerged(mergeMaps(a, b))
  }
  return merged
}

function mergeMaps(
  a: Map<string, string>,
  b: Map<string, string>,
): Map<string, string> {
  const out = new Map(a)
  b.forEach((v, k) => out.set(k, v))
  return out
}
