"use client"

import { useEffect, useState } from "react"
import { authFetch } from "@/lib/auth/fetch"
import { createBoundedCache } from "@/lib/utils/bounded-cache"
import { fetchIndexerActivitiesByUris } from "@/lib/atproto/indexer"
import { coerceClaimActivityValue } from "@/lib/atproto/coerce-claim-activity"
import type { ClaimActivity } from "@/lib/atproto/activity-types"

const COLLECTION = "org.hypercerts.claim.activity"

export interface SingleActivity {
  uri: string
  cid: string
  did: string
  rkey: string
  value: ClaimActivity
  /**
   * True when the record was served from the indexer because the live PDS
   * read failed (#184). An indexer-served record carries fewer fields than
   * the authoritative PDS record — no contributors, locations, long
   * description or rights — so detail surfaces should show a degraded-state
   * notice and tolerate those omissions.
   */
  partial?: boolean
}

// Module-level cache + in-flight coalescer keyed by `${did} ${rkey}` (a
// space separator is collision-free — DIDs and record keys never contain
// spaces).
//
// The funding list renders one <FundingForActivity> per receipt, and many
// receipts fund the same activity, so without coalescing each row fired its
// own getRecord — an N+1 with no dedupe. Concurrent callers for the same
// record now share one in-flight request, and a resolved record is cached
// for the session (claim activities are immutable except via the edit
// route, which calls `invalidateActivity` on save). Mirrors the
// cache/coalesce shape of resolve-ens / resolve-did-batch.
const cache = createBoundedCache<string, SingleActivity>(500)
const inFlight = new Map<string, Promise<SingleActivity>>()

function cacheKey(did: string, rkey: string): string {
  return `${did} ${rkey}`
}

/**
 * Drop a cached activity so the next read re-fetches. Call after an edit
 * write (before navigating to the detail view) so the cached pre-edit
 * record isn't rendered as if it were fresh.
 */
export function invalidateActivity(did: string, rkey: string): void {
  const key = cacheKey(did, rkey)
  cache.delete(key)
  inFlight.delete(key)
}

/**
 * Resolve a single activity by did+rkey, sharing one request across
 * concurrent callers and caching the result for the session. Throws on
 * failure (so the hook can surface an error); failures are never cached so
 * a remount retries. Not abortable per-caller by design — the request is
 * shared, and a getRecord that finishes after one caller unmounts simply
 * seeds the cache for the next.
 */
/**
 * Indexer fallback for when the live PDS read fails. The indexer keeps the
 * record keyed by its DID-based AT-URI (which never changes on migration),
 * so it can render the detail even when the author's home PDS is
 * unreachable. The indexer node carries fewer fields than the PDS record —
 * the result is flagged `partial` so the detail view degrades gracefully.
 * Returns null on any miss/error so the caller can surface the original
 * PDS error for a genuinely-gone record.
 */
async function loadActivityFromIndexer(
  did: string,
  rkey: string
): Promise<SingleActivity | null> {
  try {
    const uri = `at://${did}/${COLLECTION}/${rkey}`
    const { records } = await fetchIndexerActivitiesByUris([uri])
    const record = records.find((r) => r.uri === uri) ?? records[0]
    if (!record) return null
    return {
      uri: record.uri,
      cid: record.cid,
      did,
      rkey,
      value: record.value,
      partial: true,
    }
  } catch {
    return null
  }
}

function loadActivity(did: string, rkey: string): Promise<SingleActivity> {
  const key = cacheKey(did, rkey)
  const cached = cache.get(key)
  if (cached) return Promise.resolve(cached)
  const pending = inFlight.get(key)
  if (pending) return pending

  const request = (async () => {
    try {
      const params = new URLSearchParams({
        repo: did,
        collection: COLLECTION,
        rkey,
      })
      const res = await authFetch(
        `/api/xrpc/com/atproto/repo/getRecord?${params.toString()}`
      )
      if (!res.ok) {
        throw new Error(
          res.status === 404
            ? "Activity not found"
            : `Failed to load activity (${res.status})`
        )
      }
      const data = (await res.json()) as {
        uri: string
        cid: string
        value: unknown
      }
      // A foreign PDS record can carry any shape — coerce the
      // string-declared render fields before anything renders them.
      const activity: SingleActivity = {
        uri: data.uri,
        cid: data.cid,
        did,
        rkey,
        value: coerceClaimActivityValue(data.value),
      }
      cache.set(key, activity)
      return activity
    } catch (pdsError) {
      // Live PDS read failed (host down/unreachable, or the record 404s on
      // a stale home). Fall back to an indexer-served render (#184); if the
      // indexer also misses, surface the original PDS error so a
      // genuinely-gone record still reads as "not found".
      //
      // The partial result is deliberately NOT cached. The session cache's
      // permanence is justified by records being immutable — but `partial`
      // is a property of a transient fetch failure, not of the record, so
      // caching it would (1) keep the detail view degraded for the rest of
      // the session even after the PDS recovers, and (2) let the edit route
      // (which shares this cache) seed its form from a degraded snapshot.
      // Leaving the cache empty means the next read re-attempts the PDS.
      const fallback = await loadActivityFromIndexer(did, rkey)
      if (fallback) return fallback
      throw pdsError
    }
  })().finally(() => {
    inFlight.delete(key)
  })

  inFlight.set(key, request)
  return request
}

/**
 * Fetch a single activity claim by its author DID + rkey.
 *
 * Uses /api/xrpc/com/atproto/repo/getRecord which, since PR #27,
 * transparently federates to the author's home PDS when they aren't on
 * our own instance. Returns null from the hook while loading, then
 * either the resolved activity or an error.
 *
 * Resolution is deduped + cached across the session (see `loadActivity`),
 * so rendering the same activity in many rows costs one request.
 */
export function useActivity(
  did: string | null,
  rkey: string | null
): {
  activity: SingleActivity | null
  isLoading: boolean
  error: string | null
} {
  // Seed synchronously from the cache so an already-resolved activity
  // renders without a loading flash on (re)mount.
  const [activity, setActivity] = useState<SingleActivity | null>(() =>
    did && rkey ? cache.get(cacheKey(did, rkey)) ?? null : null
  )
  const [isLoading, setIsLoading] = useState(
    () => !!(did && rkey) && !cache.get(cacheKey(did, rkey))
  )
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!did || !rkey) {
      setActivity(null)
      setIsLoading(false)
      setError(null)
      return
    }

    const cached = cache.get(cacheKey(did, rkey))
    if (cached) {
      setActivity(cached)
      setIsLoading(false)
      setError(null)
      return
    }

    let cancelled = false
    // Loading-state set lives inside the async runner (not the effect body)
    // so it reads as a fetch lifecycle update rather than a synchronous
    // cascade.
    const run = async () => {
      setIsLoading(true)
      setError(null)
      try {
        const resolved = await loadActivity(did, rkey)
        if (cancelled) return
        setActivity(resolved)
        setError(null)
      } catch (err) {
        if (cancelled) return
        console.error("Failed to load activity:", err)
        setError(err instanceof Error ? err.message : "Failed to load activity")
        setActivity(null)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    run()

    return () => {
      cancelled = true
    }
  }, [did, rkey])

  return { activity, isLoading, error }
}
