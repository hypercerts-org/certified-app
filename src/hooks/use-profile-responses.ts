"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  listResponses,
  type BadgeResponseRecord,
} from "@/lib/atproto/badges"

/**
 * Fetch the badge.response records on a specific DID's PDS.
 *
 * Why a DID parameter (not the viewer's DID): when viewing Alice's
 * profile, the relevant responses are **Alice's** — they're the
 * ones that determine which awards on her profile show or are
 * hidden. The viewer's responses are irrelevant to other people's
 * profiles. The R1 reviewer flagged this as a federation-correctness
 * issue in the original plan; the hook contract bakes the fix in.
 *
 * Caches per-DID with the same 5min TTL as the received-endorsements
 * scan. Window-focus revalidates when stale. Shared module cache
 * across all callers (one fetch per (did, page-life-span)).
 */
export interface UseProfileResponsesResult {
  responses: BadgeResponseRecord[]
  isLoading: boolean
  error: string | null
  /** Force a refetch — used after a response write to invalidate
   *  the cache for the caller's own profile. */
  refetch: () => Promise<void>
}

const STALE_MS = 5 * 60 * 1000

interface CacheEntry {
  data: BadgeResponseRecord[]
  fetchedAt: number
}

const cache = new Map<string, CacheEntry>()

/** Drop the cache entry for a DID — call after a response write
 *  so the next mount on the same page hits the network. */
export function invalidateProfileResponses(did: string): void {
  cache.delete(did)
}

export function useProfileResponses(did: string | null): UseProfileResponsesResult {
  const [responses, setResponses] = useState<BadgeResponseRecord[]>([])
  const [isLoading, setIsLoading] = useState(!!did)
  const [error, setError] = useState<string | null>(null)

  const didRef = useRef(did)
  didRef.current = did

  const doFetch = useCallback(
    async (target: string, signal?: AbortSignal, opts?: { force?: boolean }) => {
      const cached = cache.get(target)
      if (!opts?.force && cached && Date.now() - cached.fetchedAt < STALE_MS) {
        setResponses(cached.data)
        setIsLoading(false)
        return
      }
      setIsLoading(true)
      setError(null)
      try {
        const data = await listResponses(target, signal)
        if (signal?.aborted) return
        cache.set(target, { data, fetchedAt: Date.now() })
        setResponses(data)
      } catch (err) {
        if (signal?.aborted) return
        setError(
          err instanceof Error ? err.message : "Failed to load responses",
        )
      } finally {
        if (!signal?.aborted) setIsLoading(false)
      }
    },
    [],
  )

  useEffect(() => {
    if (!did) {
      setResponses([])
      setIsLoading(false)
      setError(null)
      return
    }
    const controller = new AbortController()
    doFetch(did, controller.signal)
    return () => controller.abort()
  }, [did, doFetch])

  // Window-focus revalidate when stale, matching the
  // useReceivedEndorsements pattern so a tab returning to the app
  // picks up cross-device writes.
  useEffect(() => {
    const onFocus = () => {
      const target = didRef.current
      if (!target) return
      const c = cache.get(target)
      if (!c || Date.now() - c.fetchedAt >= STALE_MS) {
        doFetch(target)
      }
    }
    window.addEventListener("focus", onFocus)
    return () => window.removeEventListener("focus", onFocus)
  }, [doFetch])

  const refetch = useCallback(async () => {
    const target = didRef.current
    if (!target) return
    await doFetch(target, undefined, { force: true })
  }, [doFetch])

  return { responses, isLoading, error, refetch }
}
