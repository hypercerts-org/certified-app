"use client"

import { useCallback, useEffect, useRef, useState } from "react"

/**
 * Factory for the module-cache + stale-window + singleflight skeleton
 * shared by the per-DID fetch hooks. `useFollowers` and `useFollowing`
 * used to re-implement the same ~100-line shape (module cache Map,
 * doFetch with null-reset / stale-window read / abort-guarded
 * setState, mount effect, cache-busting refetch, optimistic
 * write-through mutators); this centralises the wiring while each
 * hook keeps its own data mapping and policy knobs.
 *
 * Deliberately NOT adopted by the other cache-shaped hooks:
 *   - `useReceivedEndorsements` — layers a cross-instance optimistic
 *     overlay + window-focus revalidation on top of the skeleton.
 *   - `useEndorsementLists` — cache entries are versioned against the
 *     endorsement-lists invalidation bus.
 *   - `useProfileResponses` — external-store variant (module state +
 *     useSyncExternalStore) with its own singleflight.
 *   - `useGivenEndorsements` — fresh-on-every-mount by design; only
 *     in-flight coalescing, no TTL cache.
 * Forcing those through the factory would cost more in indirection
 * than the duplication it removes.
 */

export interface CachedDidResourceConfig<T> {
  /** How long a cached snapshot serves new mounts without refetching. */
  staleMs: number
  /**
   * Shared fetcher for a DID. Runs OUTSIDE any single caller's
   * AbortSignal: the promise is shared across every hook instance
   * mounted for the same DID, so one consumer unmounting must not
   * fail its siblings (same contract as useTypedLists' shared fetch).
   * Any post-fetch shaping (dedupe, sort) belongs in here so every
   * waiter receives the shaped value. `force` is true for
   * user-invoked refetches — fetchers that sit behind an HTTP cache
   * use it to pass `noCache`.
   */
  fetch: (did: string, opts: { force: boolean }) => Promise<T>
  /**
   * What happens to the last-known data when a fetch fails:
   *   - "reset":  drop it — consumers' derived "loaded" state returns
   *               to the initial null (e.g. a follower count must
   *               show "loading" again, not a stale number).
   *   - "retain": keep rendering the previous snapshot next to the
   *               error message.
   * Failures are never written to the module cache either way, so a
   * transient hiccup can't lock the UI in until the stale window
   * expires — the next mount / refetch retries.
   */
  onError: "reset" | "retain"
  /** Message used when a failure isn't an Error instance. */
  errorFallback: string
}

export interface CachedDidResourceState<T> {
  /** Last fetched (or optimistically mutated) value; null before the
   *  first successful load for the current DID. */
  data: T | null
  isLoading: boolean
  error: string | null
  /** Bypass the module cache AND any in-flight fetch; call after a
   *  write so the caller sees post-write state. */
  refetch: () => Promise<void>
  /**
   * Optimistic write-through: update this instance's state and the
   * module cache in one step. Returning the previous value from the
   * updater is a no-op (no cache write). Sibling instances pick the
   * new value up from the cache on their next fetch — same contract
   * the follower/following mutators had before the factory.
   */
  mutate: (updater: (prev: T | null) => T | null) => void
}

interface CacheEntry<T> {
  data: T
  fetchedAt: number
}

/**
 * Build a hook that reads a per-DID resource through a module-level
 * stale-while-cached Map with in-flight deduplication. Each factory
 * call owns its own cache + inflight maps, so distinct resources
 * never collide on DID keys.
 */
export function createCachedDidResource<T>(
  config: CachedDidResourceConfig<T>,
): (did: string | null) => CachedDidResourceState<T> {
  const { staleMs, fetch: fetchResource, onError, errorFallback } = config

  const cache = new Map<string, CacheEntry<T>>()
  // Singleflight: N instances mounting together (header, sidebar, tab
  // panel) share ONE fetch instead of racing N identical walks against
  // a cold cache.
  const inflight = new Map<string, Promise<T>>()

  function startFetch(did: string, force: boolean): Promise<T> {
    const promise = fetchResource(did, { force }).then((value) => {
      // Skip the cache write if a forced refetch superseded this fetch
      // while it was in flight — its result is pre-write data.
      if (inflight.get(did) === promise) {
        cache.set(did, { data: value, fetchedAt: Date.now() })
      }
      return value
    })
    inflight.set(did, promise)
    promise
      .catch(() => {
        // Swallowed here only — each awaiting instance surfaces its
        // own error from its `await`.
      })
      .finally(() => {
        // Only clear if still ours (a forced refetch may have replaced
        // the slot during the await window) — useTypedLists' guard.
        if (inflight.get(did) === promise) inflight.delete(did)
      })
    return promise
  }

  return function useCachedDidResource(
    did: string | null,
  ): CachedDidResourceState<T> {
    const [data, setData] = useState<T | null>(null)
    const [isLoading, setIsLoading] = useState(!!did)
    const [error, setError] = useState<string | null>(null)
    const didRef = useRef(did)
    didRef.current = did

    const doFetch = useCallback(
      async (targetDid: string | null, signal?: AbortSignal, force = false) => {
        if (!targetDid) {
          setData(null)
          setIsLoading(false)
          setError(null)
          return
        }
        if (!force) {
          const cached = cache.get(targetDid)
          if (cached && Date.now() - cached.fetchedAt < staleMs) {
            setData(cached.data)
            setIsLoading(false)
            return
          }
        }
        setIsLoading(true)
        setError(null)
        try {
          // Force bypasses the in-flight map too: the caller just
          // wrote, and a pending pre-write fetch would hand back stale
          // data. The replacement promise takes over the map slot so
          // later joiners share the fresh fetch.
          const promise =
            (force ? undefined : inflight.get(targetDid)) ??
            startFetch(targetDid, force)
          const value = await promise
          if (signal?.aborted) return
          setData(value)
        } catch (err) {
          if (signal?.aborted) return
          if (onError === "reset") setData(null)
          setError(err instanceof Error ? err.message : errorFallback)
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
      cache.delete(targetDid)
      await doFetch(targetDid, undefined, true)
    }, [doFetch])

    const mutate = useCallback((updater: (prev: T | null) => T | null) => {
      const targetDid = didRef.current
      if (!targetDid) return
      setData((prev) => {
        const next = updater(prev)
        if (next !== prev && next !== null) {
          cache.set(targetDid, { data: next, fetchedAt: Date.now() })
        }
        return next
      })
    }, [])

    return { data, isLoading, error, refetch, mutate }
  }
}
