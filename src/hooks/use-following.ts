"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  FOLLOW_COLLECTION,
  listFollowing,
  type FollowRecord,
} from "@/lib/atproto/follow"

const STALE_MS = 5 * 60 * 1000

interface CacheEntry {
  data: FollowRecord[]
  fetchedAt: number
}

function extractRkey(uri: string): string {
  const idx = uri.lastIndexOf("/")
  return idx >= 0 ? uri.slice(idx + 1) : uri
}

// Module-level cache keyed by DID. Re-mounts (e.g. tab switches) reuse
// the snapshot instead of re-paginating the PDS — matches the pattern
// in `useReceivedEndorsements`.
const cache = new Map<string, CacheEntry>()

/**
 * Read every `app.certified.graph.follow` record on `did`'s repo.
 * "Following" semantics: this is the set of subjects `did` is following.
 *
 * Authoritative for own-profile views (the viewer's PDS is the source
 * of truth) and acceptable for foreign profiles since the PDS hosts
 * the records publicly.
 *
 * Exposes:
 *   - `records`    — full follow records (rkey included so unfollow
 *                    can target the right one).
 *   - `subjects`   — `Set<string>` of subject DIDs, for O(1) lookup
 *                    in the Follow/Unfollow button.
 *   - `count`      — convenience for sidebar counts.
 *   - `refetch`    — bypass cache; call after the viewer follows or
 *                    unfollows somebody.
 *   - `addFollow`/`removeFollow` — optimistic mutators so the Follow
 *                    button can update both the viewer's "following"
 *                    set and the foreign profile's follower list
 *                    without waiting for the PDS / indexer to
 *                    re-page.
 *
 * Returns empty + isLoading=false when `did` is null.
 */
export function useFollowing(did: string | null): {
  records: FollowRecord[]
  subjects: Set<string>
  count: number
  isLoading: boolean
  error: string | null
  refetch: () => Promise<void>
  addFollow: (subjectDid: string, uri: string, cid: string) => void
  removeFollow: (subjectDid: string) => void
} {
  const [records, setRecords] = useState<FollowRecord[]>([])
  const [isLoading, setIsLoading] = useState(!!did)
  const [error, setError] = useState<string | null>(null)
  const didRef = useRef(did)
  didRef.current = did

  const doFetch = useCallback(
    async (targetDid: string | null, signal?: AbortSignal, force = false) => {
      if (!targetDid) {
        setRecords([])
        setIsLoading(false)
        setError(null)
        return
      }
      if (!force) {
        const entry = cache.get(targetDid)
        if (entry && Date.now() - entry.fetchedAt < STALE_MS) {
          setRecords(entry.data)
          setIsLoading(false)
          return
        }
      }
      setIsLoading(true)
      setError(null)
      try {
        const data = await listFollowing(targetDid, signal, force ? { noCache: true } : undefined)
        if (signal?.aborted) return
        cache.set(targetDid, { data, fetchedAt: Date.now() })
        setRecords(data)
      } catch (err) {
        if (signal?.aborted) return
        setError(err instanceof Error ? err.message : "Failed to load follows")
      } finally {
        if (!signal?.aborted) setIsLoading(false)
      }
    },
    [],
  )

  useEffect(() => {
    const controller = new AbortController()
    doFetch(did, controller.signal)
    return () => controller.abort()
  }, [did, doFetch])

  const refetch = useCallback(async () => {
    const targetDid = didRef.current
    if (!targetDid) return
    // Drop the cache so a fresh page-walk runs even within the stale
    // window — the caller just wrote and needs to see the new state.
    cache.delete(targetDid)
    await doFetch(targetDid, undefined, true)
  }, [doFetch])

  // Optimistic insert — the Follow button calls this on a successful
  // createFollow so the viewer's "following" set and the count both
  // update immediately. Idempotent on subjectDid; updates the
  // module-level cache too so re-mounts inside the stale window see
  // the new record.
  const addFollow = useCallback(
    (subjectDid: string, uri: string, cid: string) => {
      const targetDid = didRef.current
      if (!targetDid) return
      const record: FollowRecord = {
        uri,
        cid,
        rkey: extractRkey(uri),
        value: {
          $type: FOLLOW_COLLECTION,
          subject: subjectDid,
          createdAt: new Date().toISOString(),
        },
      }
      setRecords((prev) => {
        if (prev.some((r) => r.value.subject === subjectDid)) return prev
        const next = [record, ...prev]
        cache.set(targetDid, { data: next, fetchedAt: Date.now() })
        return next
      })
    },
    [],
  )

  // Optimistic delete — same contract as addFollow.
  const removeFollow = useCallback((subjectDid: string) => {
    const targetDid = didRef.current
    if (!targetDid) return
    setRecords((prev) => {
      if (!prev.some((r) => r.value.subject === subjectDid)) return prev
      const next = prev.filter((r) => r.value.subject !== subjectDid)
      cache.set(targetDid, { data: next, fetchedAt: Date.now() })
      return next
    })
  }, [])

  const subjects = useMemo(
    () => new Set(records.map((r) => r.value.subject)),
    [records],
  )

  return {
    records,
    subjects,
    count: records.length,
    isLoading,
    error,
    refetch,
    addFollow,
    removeFollow,
  }
}
