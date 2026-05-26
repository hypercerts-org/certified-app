"use client"

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import {
  appendManyToTypedList,
  appendToTypedList,
  createTypedList,
  deleteTypedList,
  fetchTypedLists,
  removeFromTypedList,
  removeManyFromTypedList,
  updateTypedList,
  type TypedListRecord,
  type TypedListType,
} from "@/lib/atproto/typed-lists"
import {
  getEndorsementListsVersionSnapshot,
  subscribeEndorsementListsVersion,
} from "@/lib/atproto/endorsement-lists-cache"
import type { ItemIdentifier } from "@/lib/atproto/collection"

// Module-level cache so the typed-list set for a given viewer is
// shared across every mounted `useTypedLists` instance. The 3-dot
// "Add to list" menu lives on cert / project / profile overviews,
// so multiple instances of this hook commonly mount in the same
// navigation session. Keyed by `${did}:${version}` so the
// invalidation bus (`endorsement-lists-cache`) naturally invalidates
// stale entries on mutation.
//
// LRU eviction caps the cache at MAX_CACHE_ENTRIES so a long
// session that mutates lists many times (each bumping the version
// → new cache key) doesn't leak entries forever. Eviction is
// insertion-order — the oldest entry drops when the cap is hit.
const MAX_CACHE_ENTRIES = 16
const cache = new Map<string, TypedListRecord[]>()
const inflight = new Map<string, Promise<TypedListRecord[]>>()

function setCacheEntry(key: string, value: TypedListRecord[]): void {
  // Refresh insertion order on re-set.
  if (cache.has(key)) cache.delete(key)
  cache.set(key, value)
  while (cache.size > MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value
    if (oldest === undefined) break
    cache.delete(oldest)
  }
}

interface UseTypedListsOptions {
  /** When false the hook skips the initial fetch and returns the
   *  empty state. Useful when the consumer only needs the data
   *  conditionally (e.g. only when a modal opens) — avoids
   *  paginating the PDS on every page mount. Defaults to true. */
  enabled?: boolean
}

/**
 * Read + mutate the viewer's `list:*` collection records, grouped by
 * type. Reuses the existing `endorsement-lists-cache` invalidation
 * bus so any list mutation refreshes every mounted instance — same
 * cross-component sync the endorsement-list hook already relies on.
 *
 * Pass `{ enabled: false }` to defer the fetch (e.g. until a modal
 * opens). When toggled back to true the hook reads from the
 * module-level cache if the value is still current, so reopen is
 * instant.
 */
export function useTypedLists(
  did: string | null,
  options: UseTypedListsOptions = {},
) {
  const { enabled = true } = options
  const [lists, setLists] = useState<TypedListRecord[]>([])
  const [isLoading, setIsLoading] = useState(!!did && enabled)
  const [error, setError] = useState<string | null>(null)
  const didRef = useRef(did)
  didRef.current = did

  const version = useSyncExternalStore(
    subscribeEndorsementListsVersion,
    getEndorsementListsVersionSnapshot,
    getEndorsementListsVersionSnapshot,
  )

  const doFetch = useCallback(
    async (targetDid: string | null, signal?: AbortSignal) => {
      if (!targetDid) {
        setLists([])
        setIsLoading(false)
        setError(null)
        return
      }
      const cacheKey = `${targetDid}:${version}`
      const cached = cache.get(cacheKey)
      if (cached) {
        setLists(cached)
        setIsLoading(false)
        setError(null)
        return
      }
      setIsLoading(true)
      setError(null)
      try {
        // Dedupe concurrent fetches across instances by sharing the
        // in-flight promise — common when multiple AddToListMenu's
        // mount the hook on the same overview render. Atomic
        // has/set so two callers racing into the same key don't
        // each create their own promise (the loser would leak
        // because only one wins the Map slot).
        let promise = inflight.get(cacheKey)
        if (!promise) {
          // IMPORTANT: don't pass `signal` to the shared fetch —
          // if THIS caller aborts, every sibling waiting on the
          // same promise would also fail. The hook's outer
          // `signal?.aborted` check below short-circuits the
          // setLists path; the fetch itself runs to completion
          // so the cache + other waiters stay healthy.
          promise = fetchTypedLists(targetDid).then((records) => {
            setCacheEntry(cacheKey, records)
            return records
          })
          inflight.set(cacheKey, promise)
          promise.finally(() => {
            // Only clear if still ours (subsequent fetches may have
            // overwritten the value during the await window).
            if (inflight.get(cacheKey) === promise) inflight.delete(cacheKey)
          })
        }
        const records = await promise
        if (signal?.aborted) return
        setLists(records)
      } catch (err) {
        if (signal?.aborted) return
        setError(err instanceof Error ? err.message : "Failed to load lists")
      } finally {
        if (!signal?.aborted) setIsLoading(false)
      }
    },
    [version],
  )

  useEffect(() => {
    if (!enabled) {
      setLists([])
      setIsLoading(false)
      return
    }
    const controller = new AbortController()
    doFetch(did, controller.signal)
    return () => controller.abort()
    // version included so any cross-component mutation refreshes us.
  }, [did, doFetch, version, enabled])

  const byType = useMemo(() => {
    const out: Record<TypedListType, TypedListRecord[]> = {
      "list:certs": [],
      "list:projects": [],
      "list:accounts": [],
    }
    for (const list of lists) out[list.type].push(list)
    return out
  }, [lists])

  const createList = useCallback(
    async (type: TypedListType, title: string, description?: string) => {
      const ownDid = didRef.current
      if (!ownDid) throw new Error("No active DID")
      return createTypedList(ownDid, type, title, description)
    },
    [],
  )

  const deleteList = useCallback(async (rkey: string) => {
    const ownDid = didRef.current
    if (!ownDid) throw new Error("No active DID")
    await deleteTypedList(ownDid, rkey)
  }, [])

  const updateList = useCallback(
    async (
      rkey: string,
      type: TypedListType,
      title: string,
      description?: string,
    ) => {
      const ownDid = didRef.current
      if (!ownDid) throw new Error("No active DID")
      return updateTypedList(ownDid, rkey, type, title, description)
    },
    [],
  )

  const addItem = useCallback(
    async (rkey: string, type: TypedListType, item: ItemIdentifier) => {
      const ownDid = didRef.current
      if (!ownDid) throw new Error("No active DID")
      return appendToTypedList(ownDid, rkey, item, type)
    },
    [],
  )

  const addManyItems = useCallback(
    async (
      rkey: string,
      type: TypedListType,
      items: readonly ItemIdentifier[],
    ) => {
      const ownDid = didRef.current
      if (!ownDid) throw new Error("No active DID")
      return appendManyToTypedList(ownDid, rkey, items, type)
    },
    [],
  )

  const removeItem = useCallback(async (rkey: string, itemUri: string) => {
    const ownDid = didRef.current
    if (!ownDid) throw new Error("No active DID")
    return removeFromTypedList(ownDid, rkey, itemUri)
  }, [])

  const removeManyItems = useCallback(
    async (rkey: string, itemUris: readonly string[]) => {
      const ownDid = didRef.current
      if (!ownDid) throw new Error("No active DID")
      return removeManyFromTypedList(ownDid, rkey, itemUris)
    },
    [],
  )

  return {
    lists,
    byType,
    isLoading,
    error,
    createList,
    updateList,
    deleteList,
    addItem,
    addManyItems,
    removeItem,
    removeManyItems,
  }
}
