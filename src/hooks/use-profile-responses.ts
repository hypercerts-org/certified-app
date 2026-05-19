"use client"

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react"
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
 * profiles. The R1 plan reviewer flagged this as a federation-
 * correctness issue; the hook contract bakes the fix in.
 *
 * **External-store pattern.** The module-level state is the source
 * of truth; every hook instance subscribes via
 * `useSyncExternalStore` and re-renders together when the data for
 * its DID changes. This fixes the cross-hook staleness flagged in
 * the implementation review: invalidating + refetching from one
 * `useProfileResponses` instance now propagates to sibling
 * instances inside `useReceivedEndorsements`, so a Hide write
 * immediately removes the row from the visible list.
 *
 * Inflight de-duplication: concurrent loads for the same DID share
 * a single promise (singleflight).
 */
export interface UseProfileResponsesResult {
  responses: BadgeResponseRecord[]
  isLoading: boolean
  error: string | null
  /** Force a refetch. Drops any cached entry for this DID and
   *  pulls fresh data. */
  refetch: () => Promise<void>
}

const STALE_MS = 5 * 60 * 1000

interface StoreEntry {
  data: BadgeResponseRecord[]
  fetchedAt: number
  isLoading: boolean
  error: string | null
}

const EMPTY_ENTRY: StoreEntry = {
  data: [],
  fetchedAt: 0,
  isLoading: false,
  error: null,
}

// Per-DID state, per-DID subscribers, per-DID inflight promise.
const store = new Map<string, StoreEntry>()
const subscribersByDid = new Map<string, Set<() => void>>()
const inflightByDid = new Map<string, Promise<void>>()

function notify(did: string): void {
  const subs = subscribersByDid.get(did)
  if (!subs) return
  for (const cb of subs) cb()
}

function setEntry(did: string, patch: Partial<StoreEntry>): void {
  const prev = store.get(did) ?? EMPTY_ENTRY
  store.set(did, { ...prev, ...patch })
  notify(did)
}

function loadInto(did: string, signal?: AbortSignal, opts?: { force?: boolean }): Promise<void> {
  const existing = inflightByDid.get(did)
  if (existing) return existing

  const entry = store.get(did)
  if (!opts?.force && entry && Date.now() - entry.fetchedAt < STALE_MS) {
    return Promise.resolve()
  }

  setEntry(did, { isLoading: true, error: null })

  const promise = (async () => {
    try {
      // Forced refetches (callers explicitly invalidated and
      // re-asked) bypass the XRPC proxy's 5s Cache-Control window
      // — otherwise the just-written response wouldn't appear in
      // the next list and the rendered state would lag by a click.
      const data = await listResponses(did, signal, {
        noCache: !!opts?.force,
      })
      if (signal?.aborted) return
      setEntry(did, {
        data,
        fetchedAt: Date.now(),
        isLoading: false,
        error: null,
      })
    } catch (err) {
      if (signal?.aborted) return
      setEntry(did, {
        isLoading: false,
        error: err instanceof Error ? err.message : "Failed to load responses",
      })
    } finally {
      inflightByDid.delete(did)
    }
  })()

  inflightByDid.set(did, promise)
  return promise
}

/**
 * Drop the cache entry for a DID. Call after a response write so
 * the next fetch hits the network instead of serving the
 * pre-write snapshot.
 */
export function invalidateProfileResponses(did: string): void {
  store.delete(did)
  notify(did)
}

export function useProfileResponses(did: string | null): UseProfileResponsesResult {
  // Latest-ref pattern via useEffect (writing to ref.current during
  // render is what React's set-ref-in-render rule flags). The
  // window-focus handler only needs the DID at the time the user
  // refocuses — a one-render lag is fine.
  const didRef = useRef(did)
  useEffect(() => {
    didRef.current = did
  }, [did])

  // Subscribe to changes for this specific DID. The subscribe
  // function intentionally rebinds when `did` changes so
  // useSyncExternalStore swaps to the new DID's subscriber set.
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!did) return () => {}
      let subs = subscribersByDid.get(did)
      if (!subs) {
        subs = new Set()
        subscribersByDid.set(did, subs)
      }
      subs.add(onChange)
      return () => {
        const s = subscribersByDid.get(did)
        s?.delete(onChange)
        if (s && s.size === 0) subscribersByDid.delete(did)
      }
    },
    [did],
  )

  const getSnapshot = useCallback((): StoreEntry => {
    if (!did) return EMPTY_ENTRY
    return store.get(did) ?? EMPTY_ENTRY
  }, [did])

  // Server snapshot: always the empty entry. The store is
  // client-only; no SSR shape to worry about.
  const getServerSnapshot = useCallback((): StoreEntry => EMPTY_ENTRY, [])

  const entry = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  // Kick off a fetch when the DID mounts (or changes) and the
  // cache is missing/stale.
  useEffect(() => {
    if (!did) return
    const controller = new AbortController()
    loadInto(did, controller.signal)
    return () => controller.abort()
  }, [did])

  // Window-focus revalidate when stale.
  useEffect(() => {
    const onFocus = () => {
      const target = didRef.current
      if (!target) return
      const c = store.get(target)
      if (!c || Date.now() - c.fetchedAt >= STALE_MS) {
        loadInto(target)
      }
    }
    window.addEventListener("focus", onFocus)
    return () => window.removeEventListener("focus", onFocus)
  }, [])

  const refetch = useCallback(async () => {
    const target = didRef.current
    if (!target) return
    await loadInto(target, undefined, { force: true })
  }, [])

  return {
    responses: entry.data,
    isLoading: entry.isLoading,
    error: entry.error,
    refetch,
  }
}
