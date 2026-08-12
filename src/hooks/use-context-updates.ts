"use client"

import { useCallback, useEffect, useSyncExternalStore } from "react"
import {
  fetchContextUpdates,
  type ContextAttachmentRecord,
} from "@/lib/atproto/context-attachment"
import { parseAtUri } from "@/lib/atproto/activity-uri"
import { createBoundedCache } from "@/lib/utils/bounded-cache"

interface UpdatesEntry {
  updates: ContextAttachmentRecord[]
  isLoading: boolean
  error: string | null
  /** Epoch ms of the last successful resolve; 0 = never resolved (or
   *  explicitly invalidated), which forces the next reader to fetch. */
  fetchedAt: number
}

const EMPTY_ENTRY: UpdatesEntry = Object.freeze({
  updates: [],
  isLoading: false,
  error: null,
  fetchedAt: 0,
})

/** How long a resolved list stays fresh. The detail pages mount two
 *  reader instances per subject (navbar count + the <ContextUpdates>
 *  child) and remount the child on every tab switch — those hit the
 *  cache. Writes bypass the window via `invalidateContextUpdates`. */
const REVALIDATE_MS = 30_000

// Module-level cache + in-flight coalescer keyed by subjectUri,
// mirroring use-activity.ts. Without sharing, every detail-page mount
// issued two identical fetches (navbar-count instance + child list)
// and each tab switch refetched; worse, a delete patched only one
// instance's state so the other's count went stale. Entries are
// replaced immutably and subscribers are notified so every mounted
// instance converges on the same list.
const cache = createBoundedCache<string, UpdatesEntry>(200)
const inFlight = new Map<string, Promise<void>>()

// URIs the viewer has deleted this session. The indexer is eventually
// consistent, so a refetch fired right after a delete often still
// includes the removed record; filtering against this set keeps it from
// reappearing until the backend catches up. Module-level (not
// per-instance) so a cache-hydrated second instance can't resurrect a
// just-deleted update.
const removedUris = new Set<string>()

const listeners = new Set<() => void>()

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function emit(): void {
  for (const listener of listeners) listener()
}

function setEntry(subjectUri: string, entry: UpdatesEntry): void {
  cache.set(subjectUri, entry)
  emit()
}

function startFetch(subjectUri: string): void {
  if (inFlight.has(subjectUri)) return
  const parsed = parseAtUri(subjectUri)
  if (!parsed?.did) {
    // Unparseable subject — settle as empty (no error) so the section
    // quietly renders nothing, same as the old per-instance reset.
    setEntry(subjectUri, { ...EMPTY_ENTRY, fetchedAt: Date.now() })
    return
  }

  const prev = cache.get(subjectUri)
  // Only surface the loading state while nothing trustworthy has
  // resolved yet; a TTL revalidation keeps the current list on screen.
  setEntry(subjectUri, {
    updates: prev?.updates ?? [],
    isLoading: !prev || prev.fetchedAt === 0,
    error: null,
    fetchedAt: prev?.fetchedAt ?? 0,
  })

  const request = fetchContextUpdates(parsed.did, subjectUri)
    .then((records) => {
      // Superseded by a forced refetch / invalidation — drop the
      // (possibly pre-write) response instead of caching it as fresh.
      if (inFlight.get(subjectUri) !== request) return
      const sorted = [...records]
        // Drop anything deleted this session — the indexer may still be
        // serving it (see removedUris).
        .filter((r) => !removedUris.has(r.uri))
        .sort((a, b) => {
          const ac = a.value.createdAt ?? ""
          const bc = b.value.createdAt ?? ""
          return ac < bc ? 1 : ac > bc ? -1 : 0
        })
      setEntry(subjectUri, {
        updates: sorted,
        isLoading: false,
        error: null,
        fetchedAt: Date.now(),
      })
    })
    .catch((err) => {
      if (inFlight.get(subjectUri) !== request) return
      console.error("Failed to fetch context updates:", err)
      const current = cache.get(subjectUri)
      // Failures are never marked fresh (fetchedAt stays 0), so the
      // next mounted reader retries.
      setEntry(subjectUri, {
        updates: current?.updates ?? [],
        isLoading: false,
        error: err instanceof Error ? err.message : "Failed to fetch updates",
        fetchedAt: 0,
      })
    })
    .finally(() => {
      if (inFlight.get(subjectUri) === request) inFlight.delete(subjectUri)
    })

  inFlight.set(subjectUri, request)
}

/** Fetch unless a request is already in flight or the cached entry is
 *  still inside the freshness window. */
function ensureFresh(subjectUri: string): void {
  if (inFlight.has(subjectUri)) return
  const entry = cache.get(subjectUri)
  if (
    entry &&
    entry.fetchedAt > 0 &&
    Date.now() - entry.fetchedAt < REVALIDATE_MS
  ) {
    return
  }
  startFetch(subjectUri)
}

/** Force a network re-read: mark the entry stale and supersede any
 *  in-flight request (its response may predate the write we're
 *  reconciling with). */
function forceRefetch(subjectUri: string): void {
  const entry = cache.get(subjectUri)
  if (entry) cache.set(subjectUri, { ...entry, fetchedAt: 0 })
  inFlight.delete(subjectUri)
  startFetch(subjectUri)
}

/**
 * Mark the cached updates list for `subjectUri` stale so the next
 * mounted reader re-fetches. Call after creating / editing an update —
 * the form lives on its own route, so no hook instance is mounted there
 * to `refetch()`; without this the detail page the user navigates back
 * to would serve the pre-save list from the cache. Mirrors
 * `invalidateActivity` in use-activity.ts.
 */
export function invalidateContextUpdates(subjectUri: string): void {
  const hadInFlight = inFlight.delete(subjectUri)
  const entry = cache.get(subjectUri)
  if (entry) cache.set(subjectUri, { ...entry, fetchedAt: 0 })
  // An in-flight read means a reader is mounted and waiting — start a
  // replacement request so it isn't left loading forever (the superseded
  // response is discarded by the identity check in startFetch).
  if (hadInFlight) startFetch(subjectUri)
}

/** Optimistically drop `uri` from every cached list and tombstone it so
 *  no later fetch (stale or fresh) can resurrect it this session. */
function removeContextUpdate(uri: string): void {
  removedUris.add(uri)
  let changed = false
  for (const [key, entry] of cache) {
    if (entry.updates.some((u) => u.uri === uri)) {
      cache.set(key, {
        ...entry,
        updates: entry.updates.filter((u) => u.uri !== uri),
      })
      changed = true
    }
  }
  if (changed) emit()
}

/**
 * Fetch `org.hypercerts.context.attachment` records with
 * `contentType === "update"` that target `subjectUri` (a cert or
 * project at:// URI). The author DID is parsed from `subjectUri`
 * because the indexer hasn't ingested this lexicon yet — see
 * `fetchContextUpdates` for the stopgap caveat.
 *
 * Hard contract — **creator-only**: only updates authored by the
 * cert / project's own creator are returned. Third-party updates
 * (someone publishing an attachment about someone else's record)
 * are a separate feature and are filtered out at the lib layer.
 *
 * Results are shared across instances via a module-level cache (see
 * above), so the two readers a detail page mounts cost one request
 * and stay in sync through deletes.
 *
 * Returns updates ordered by `createdAt` DESC (newest first).
 */
export function useContextUpdates(subjectUri: string | null): {
  updates: ContextAttachmentRecord[]
  isLoading: boolean
  error: string | null
  /** Force a re-fetch — call after creating / deleting an update so the
   *  list reflects the change without a full page reload. */
  refetch: () => void
  /**
   * Optimistically drop an update from the list by its at:// URI. Use
   * right after a successful delete so the card disappears instantly
   * instead of waiting on the indexer (which lags and would otherwise
   * keep returning the just-deleted record on the next refetch). The URI
   * is remembered so a stale refetch can't resurrect it.
   */
  removeUpdate: (uri: string) => void
} {
  const entry = useSyncExternalStore(
    subscribe,
    () => (subjectUri ? cache.get(subjectUri) ?? EMPTY_ENTRY : EMPTY_ENTRY),
    () => EMPTY_ENTRY,
  )

  useEffect(() => {
    if (!subjectUri) return
    ensureFresh(subjectUri)
  }, [subjectUri])

  const refetch = useCallback(() => {
    if (subjectUri) forceRefetch(subjectUri)
  }, [subjectUri])

  const removeUpdate = useCallback((uri: string) => {
    removeContextUpdate(uri)
  }, [])

  return {
    updates: entry.updates,
    isLoading: entry.isLoading,
    error: entry.error,
    refetch,
    removeUpdate,
  }
}
