"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { authFetch } from "@/lib/auth/fetch"

const STALE_TIME = 5 * 60 * 1000 // 5 minutes
const PAGE_LIMIT = 100
const MAX_FOLLOWS = 10_000

const EMPTY_SET = new Set<string>()

// Single-entry module-level cache keyed by DID.
let cache: {
  did: string
  data: Set<string>
  fetchedAt: number
} | null = null

async function fetchAllFollows(
  did: string,
  signal?: AbortSignal,
): Promise<Set<string>> {
  const followedDids = new Set<string>()
  let cursor: string | undefined

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

  return followedDids
}

export function useBlueskyFollows(did: string | null) {
  const [followedDids, setFollowedDids] = useState<Set<string>>(EMPTY_SET)
  const [isLoading, setIsLoading] = useState(did != null)
  const [error, setError] = useState<string | null>(null)

  const didRef = useRef(did)
  didRef.current = did

  const doFetch = useCallback(
    async (targetDid: string | null, signal?: AbortSignal) => {
      if (!targetDid) {
        setFollowedDids(EMPTY_SET)
        setIsLoading(false)
        return
      }

      // Check cache
      if (cache && cache.did === targetDid && Date.now() - cache.fetchedAt < STALE_TIME) {
        setFollowedDids(cache.data)
        setIsLoading(false)
        return
      }

      setIsLoading(true)
      setError(null)
      try {
        const data = await fetchAllFollows(targetDid, signal)
        if (signal?.aborted) return
        cache = { did: targetDid, data, fetchedAt: Date.now() }
        setFollowedDids(data)
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

  return { followedDids, isLoading, error }
}
