"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { authFetch } from "@/lib/auth/fetch"

const STALE_TIME = 5 * 60 * 1000 // 5 minutes
const PAGE_LIMIT = 100
const MAX_FOLLOWS = 10_000

const EMPTY_SET = new Set<string>()

interface FollowsResult {
  data: Set<string>
  /** True when the 10k page-walk cap stopped the loop AND the upstream
   *  still had more pages. Consumers that derive set arithmetic from
   *  `data` (e.g. `useSocialGraphSync`) must refuse to act on the
   *  result when this is true — the "do I already follow X?" check
   *  would return false-negatives. */
  truncated: boolean
}

// Single-entry module-level cache keyed by DID.
let cache: {
  did: string
  data: Set<string>
  truncated: boolean
  fetchedAt: number
} | null = null

async function fetchAllFollows(
  did: string,
  signal?: AbortSignal,
): Promise<FollowsResult> {
  const followedDids = new Set<string>()
  let cursor: string | undefined
  let truncated = false

  while (followedDids.size < MAX_FOLLOWS) {
    const params = new URLSearchParams({
      repo: did,
      collection: "app.bsky.graph.follow",
      limit: String(PAGE_LIMIT),
    })
    if (cursor) params.set("cursor", cursor)

    const res = await authFetch(
      `/api/xrpc/com/atproto/repo/listRecords?${params.toString()}`,
      { signal },
    )
    if (!res.ok) {
      throw new Error(`Failed to fetch follows: ${res.status}`)
    }

    const data = await res.json()
    const records: Array<{ value: { subject?: string } }> = data.records ?? []

    for (const record of records) {
      if (record.value?.subject) {
        followedDids.add(record.value.subject)
      }
    }

    cursor = data.cursor
    if (!cursor || records.length < PAGE_LIMIT) break
  }

  // If the while exited because we hit the cap AND the upstream is
  // still handing us a cursor, mark as truncated. The cursor check is
  // load-bearing — without it, a viewer with exactly 10k follows
  // would be flagged truncated even though the indexer has nothing
  // more to return.
  if (followedDids.size >= MAX_FOLLOWS && cursor) {
    truncated = true
  }

  return { data: followedDids, truncated }
}

export function useBlueskyFollows(did: string | null) {
  const [followedDids, setFollowedDids] = useState<Set<string>>(EMPTY_SET)
  const [truncated, setTruncated] = useState(false)
  const [isLoading, setIsLoading] = useState(did != null)
  const [error, setError] = useState<string | null>(null)

  const didRef = useRef(did)
  didRef.current = did

  const doFetch = useCallback(
    async (targetDid: string | null, signal?: AbortSignal) => {
      if (!targetDid) {
        setFollowedDids(EMPTY_SET)
        setTruncated(false)
        setIsLoading(false)
        return
      }

      // Check cache
      if (cache && cache.did === targetDid && Date.now() - cache.fetchedAt < STALE_TIME) {
        setFollowedDids(cache.data)
        setTruncated(cache.truncated)
        setIsLoading(false)
        return
      }

      setIsLoading(true)
      setError(null)
      try {
        const result = await fetchAllFollows(targetDid, signal)
        if (signal?.aborted) return
        cache = {
          did: targetDid,
          data: result.data,
          truncated: result.truncated,
          fetchedAt: Date.now(),
        }
        setFollowedDids(result.data)
        setTruncated(result.truncated)
      } catch (err) {
        if (signal?.aborted) return
        console.error("Failed to fetch Bluesky follows:", err)
        setError(err instanceof Error ? err.message : "Failed to fetch follows")
      } finally {
        if (!signal?.aborted) setIsLoading(false)
      }
    },
    [],
  )

  // Fetch on mount and when DID changes
  useEffect(() => {
    const controller = new AbortController()
    doFetch(did, controller.signal)
    return () => controller.abort()
  }, [did, doFetch])

  // Refetch on window focus when stale
  useEffect(() => {
    const handleFocus = () => {
      const currentDid = didRef.current
      if (!currentDid) return
      if (!cache || cache.did !== currentDid || Date.now() - cache.fetchedAt >= STALE_TIME) {
        doFetch(currentDid)
      }
    }
    window.addEventListener("focus", handleFocus)
    return () => window.removeEventListener("focus", handleFocus)
  }, [doFetch])

  return { followedDids, truncated, isLoading, error }
}
