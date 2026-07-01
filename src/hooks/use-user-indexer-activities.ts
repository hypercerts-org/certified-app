"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  fetchUserIndexerActivities,
  fetchIndexerActivities,
  type IndexerActivitiesResult,
} from "@/lib/atproto/indexer"
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
export function useUserIndexerActivities(
  did: string | null,
  { authoredAuthors }: { authoredAuthors?: string[] } = {},
) {
  const [created, setCreated] = useState<BucketState>(emptyBucket)
  const [contributed, setContributed] = useState<BucketState>(emptyBucket)
  const [isLoading, setIsLoading] = useState(!!did)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isLoadingMoreRef = useRef(false)
  // Bumped on every initial-load run (did / author-set change). A loadMore
  // captures the generation it was issued under and drops its result if a
  // fresh load has superseded it — so a stale authored/contributed page
  // can't append after the author set changed. Mirrors use-managed-*.
  const generationRef = useRef(0)

  // Stable key for the optional multi-author "authored" set, so the
  // effect re-runs when it changes (not on every array identity).
  const authoredKey = authoredAuthors ? authoredAuthors.join(",") : ""

  // The "authored" bucket fetch. When `authoredAuthors` is supplied (the
  // viewer's own personal profile aggregating their groups), it fans out
  // across those DIDs via the multi-author op — so group-authored
  // activities surface here, each carrying its owning DID in the result's
  // `dids` map (ActivityCard then shows the group as the author). Without
  // it, it's the unchanged single-DID authored query.
  const fetchAuthoredPage = useCallback(
    (after: string | undefined, signal?: AbortSignal) =>
      authoredAuthors && authoredAuthors.length > 0
        ? fetchIndexerActivities({
            authors: authoredAuthors,
            first: PAGE_SIZE,
            after,
            excludeLabels: ["!takedown"],
            signal,
          })
        : did
          ? fetchUserIndexerActivities(did, {
              first: PAGE_SIZE,
              mode: "authored",
              after,
              signal,
            })
          : Promise.resolve<IndexerActivitiesResult>({
              records: [],
              dids: new Map(),
              labels: new Map(),
              hasMore: false,
              endCursor: null,
              totalCount: null,
            }),
    // authoredKey stands in for the authoredAuthors array identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [did, authoredKey],
  )

  const loadInitial = useCallback(
    async (signal?: AbortSignal) => {
      const generation = ++generationRef.current
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
          fetchAuthoredPage(undefined, signal),
          fetchUserIndexerActivities(did, {
            first: PAGE_SIZE,
            mode: "contributed",
            signal,
          }),
        ])
        if (signal?.aborted || generation !== generationRef.current) return
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
        if (signal?.aborted || generation !== generationRef.current) return
        console.error("Failed to fetch user activities (indexer):", err)
        setError(
          err instanceof Error ? err.message : "Failed to fetch activities",
        )
      } finally {
        if (!signal?.aborted) setIsLoading(false)
      }
    },
    [did, fetchAuthoredPage],
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
    // Capture the generation this page is requested under; drop the result
    // if an initial-load (did / author-set change) supersedes it in flight.
    const generation = generationRef.current
    isLoadingMoreRef.current = true
    setIsLoadingMore(true)
    try {
      const fetches: Promise<void>[] = []
      if (created.hasMore && created.cursor) {
        fetches.push(
          fetchAuthoredPage(created.cursor).then((data) => {
            if (generation !== generationRef.current) return
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
            if (generation !== generationRef.current) return
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
  }, [did, fetchAuthoredPage, created.cursor, created.hasMore, contributed.cursor, contributed.hasMore])

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
  // Union of two URI→DID maps, recomputed only when either input
  // reference flips. useMemo gives the stable-reference-unless-deps-
  // change semantic without the ref-during-render pattern the React
  // 19 lint rule (correctly) rejects.
  return useMemo(() => mergeMaps(a, b), [a, b])
}

function mergeMaps(
  a: Map<string, string>,
  b: Map<string, string>,
): Map<string, string> {
  const out = new Map(a)
  b.forEach((v, k) => out.set(k, v))
  return out
}
