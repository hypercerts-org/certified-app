"use client"

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import {
  listAwards,
  createEndorsementAward,
  extractAwardSubjectDid,
  type BadgeAwardRecord,
} from "@/lib/atproto/badges"
import {
  appendItemToList,
  createEndorsementListCollection,
  deleteEndorsementListCollection,
  listEndorsementListCollections,
  removeItemFromList,
  updateEndorsementListCollection,
} from "@/lib/atproto/collection"
import {
  getEndorsementListsVersionSnapshot,
  invalidateEndorsementLists,
  subscribeEndorsementListsVersion,
} from "@/lib/atproto/endorsement-lists-cache"

/**
 * One "list" on a profile's Endorsements tab.
 *
 * Backed by a single `org.hypercerts.collection` record with
 * `type === "endorsement-list"`. The collection's `items[]` holds
 * strongRefs to `app.certified.badge.award` records on the same
 * issuer's repo. `items` here is resolved client-side — for each
 * `itemIdentifier.uri` we look up the matching award record from a
 * single `listAwards` call covering the whole repo.
 *
 * Unresolved items (URI doesn't appear in the issuer's awards — most
 * likely because the underlying endorsement was revoked elsewhere)
 * are dropped silently so the UI never renders ghost rows.
 *
 * Awards survive list lifecycle now:
 *   - Removing a subject from a list = `items[]` shrinks; award untouched.
 *   - Deleting the list = the collection record is removed; awards stay.
 *   - Revoking an award from the Given panel triggers
 *     `purgeAwardFromLists` so all of the issuer's lists self-heal.
 */
export interface EndorsementList {
  uri: string
  cid: string
  rkey: string
  title: string
  description?: string
  createdAt: string
  items: BadgeAwardRecord[]
}

interface CacheEntry {
  lists: EndorsementList[]
  fetchedAt: number
}

const STALE_MS = 5 * 60 * 1000
const cache = new Map<string, CacheEntry>()

/**
 * Read every endorsement-list on `did`'s repo plus the awards that
 * each list curates, resolved together.
 *
 * Fetch shape:
 *   1. PDS `listEndorsementListCollections` and `listAwards` in
 *      parallel — both live on the same repo.
 *   2. Client-side resolve: for each list's `items[i].itemIdentifier.uri`,
 *      look up the matching award. Drop items that don't resolve.
 *
 * Exposes:
 *   - `lists`                — newest first by `createdAt`.
 *   - `isLoading`            — true while the initial fetch is in flight.
 *   - `error`                — non-null on PDS failure.
 *   - `refetch`              — bypass cache, force a fresh fetch.
 *   - `createList`           — owner-only. Writes the new collection
 *                              and optimistically inserts it.
 *   - `updateList`           — owner-only. Round-trip title/description.
 *   - `deleteList`           — owner-only. Removes the collection
 *                              record; awards survive.
 *   - `addSubjectToList`     — owner-only. Ensures an award exists for
 *                              the subject then appends to `items[]`.
 *                              Dedupes-on-URI so a double-click is a
 *                              no-op rather than a double-write.
 *   - `removeSubjectFromList` — owner-only. Drops the item by award
 *                              URI; underlying award untouched.
 */
export function useEndorsementLists(did: string | null): {
  lists: EndorsementList[]
  isLoading: boolean
  error: string | null
  refetch: () => Promise<void>
  createList: (title: string, description?: string) => Promise<EndorsementList>
  updateList: (
    rkey: string,
    title: string,
    description?: string,
  ) => Promise<EndorsementList>
  deleteList: (rkey: string) => Promise<void>
  addSubjectToList: (
    rkey: string,
    subjectDid: string,
  ) => Promise<EndorsementList>
  removeSubjectFromList: (
    rkey: string,
    awardUri: string,
  ) => Promise<EndorsementList>
} {
  const [lists, setLists] = useState<EndorsementList[]>([])
  const [isLoading, setIsLoading] = useState(!!did)
  const [error, setError] = useState<string | null>(null)
  const didRef = useRef(did)
  didRef.current = did

  const doFetch = useCallback(
    async (targetDid: string | null, signal?: AbortSignal, force = false) => {
      if (!targetDid) {
        setLists([])
        setIsLoading(false)
        setError(null)
        return
      }
      if (!force) {
        const cached = cache.get(targetDid)
        if (cached && Date.now() - cached.fetchedAt < STALE_MS) {
          setLists(cached.lists)
          setIsLoading(false)
          return
        }
      }
      setIsLoading(true)
      setError(null)
      try {
        const [collections, awards] = await Promise.all([
          listEndorsementListCollections(targetDid, signal),
          listAwards(targetDid, signal, force ? { noCache: true } : undefined),
        ])
        if (signal?.aborted) return
        const awardByUri = new Map<string, BadgeAwardRecord>()
        for (const a of awards) awardByUri.set(a.uri, a)
        const next: EndorsementList[] = collections
          .map((coll) => {
            const items = Array.isArray(coll.value.items) ? coll.value.items : []
            const resolved: BadgeAwardRecord[] = []
            for (const item of items) {
              const uri = item.itemIdentifier?.uri
              if (typeof uri !== "string") continue
              const award = awardByUri.get(uri)
              if (award) resolved.push(award)
            }
            return {
              uri: coll.uri,
              cid: coll.cid,
              rkey: coll.rkey,
              title: coll.value.title,
              description: coll.value.description,
              createdAt: coll.value.createdAt,
              items: resolved,
            }
          })
          .sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1))
        cache.set(targetDid, { lists: next, fetchedAt: Date.now() })
        setLists(next)
      } catch (err) {
        if (signal?.aborted) return
        setError(err instanceof Error ? err.message : "Failed to load lists")
      } finally {
        if (!signal?.aborted) setIsLoading(false)
      }
    },
    [],
  )

  // Subscribe to module-level invalidations so a mutation in a
  // sibling component (e.g. a revoke from the Given panel that
  // purges this issuer's lists) refetches without prop drilling.
  // The version goes into the load effect's deps below.
  const listsVersion = useSyncExternalStore(
    subscribeEndorsementListsVersion,
    getEndorsementListsVersionSnapshot,
    getEndorsementListsVersionSnapshot,
  )

  useEffect(() => {
    const controller = new AbortController()
    // Force a cache bypass when the version bumped — the broadcast
    // means something outside this hook just mutated the lists.
    const force = listsVersion > 0
    doFetch(did, controller.signal, force)
    return () => controller.abort()
  }, [did, doFetch, listsVersion])

  const refetch = useCallback(async () => {
    const targetDid = didRef.current
    if (!targetDid) return
    cache.delete(targetDid)
    await doFetch(targetDid, undefined, true)
  }, [doFetch])

  // Owner-only. Writes the new collection on the viewer's PDS and
  // inserts it into local state so the UI flips to the new list
  // immediately. Throws if the write fails (caller surfaces).
  const createList = useCallback(
    async (title: string, description?: string): Promise<EndorsementList> => {
      const targetDid = didRef.current
      if (!targetDid) throw new Error("No active DID for createList")
      const ref = await createEndorsementListCollection(
        targetDid,
        title,
        description,
      )
      const entry: EndorsementList = {
        uri: ref.uri,
        cid: ref.cid,
        rkey: ref.uri.split("/").pop() ?? "",
        title: title.trim(),
        description: description?.trim() || undefined,
        createdAt: new Date().toISOString(),
        items: [],
      }
      setLists((prev) => {
        const next = [entry, ...prev]
        cache.set(targetDid, { lists: next, fetchedAt: Date.now() })
        return next
      })
      return entry
    },
    [],
  )

  // Owner-only. Overwrites the existing collection's title /
  // description while preserving its rkey, createdAt, and items.
  // Optimistic: splice the updated entry into local state immediately.
  const updateList = useCallback(
    async (
      rkey: string,
      title: string,
      description?: string,
    ): Promise<EndorsementList> => {
      const targetDid = didRef.current
      if (!targetDid) throw new Error("No active DID for updateList")
      const existing = lists.find((l) => l.rkey === rkey)
      if (!existing) throw new Error("List not found")
      await updateEndorsementListCollection(targetDid, rkey, title, description)
      const updated: EndorsementList = {
        ...existing,
        title: title.trim(),
        description: description?.trim() || undefined,
      }
      setLists((prev) => {
        const next = prev.map((l) => (l.rkey === rkey ? updated : l))
        cache.set(targetDid, { lists: next, fetchedAt: Date.now() })
        return next
      })
      return updated
    },
    [lists],
  )

  // Owner-only. Removes the collection record only — awards survive.
  // Optimistic local removal mirrors create/update.
  const deleteList = useCallback(
    async (rkey: string): Promise<void> => {
      const targetDid = didRef.current
      if (!targetDid) throw new Error("No active DID for deleteList")
      const existing = lists.find((l) => l.rkey === rkey)
      if (!existing) throw new Error("List not found")
      await deleteEndorsementListCollection(targetDid, rkey)
      setLists((prev) => {
        const next = prev.filter((l) => l.rkey !== rkey)
        cache.set(targetDid, { lists: next, fetchedAt: Date.now() })
        return next
      })
    },
    [lists],
  )

  // Owner-only. Ensures an award exists for `subjectDid` then appends
  // it to the list's items[].
  //
  // Subject-level dedupe BEFORE the award create — `createEndorsementAward`
  // always mints a fresh TID-keyed record, so without this short-
  // circuit a race between two add-clicks for the same subject would
  // leave two awards on the PDS pointing at the same person and both
  // would render as separate rows. The dedupe-on-URI inside
  // `appendItemToList` only catches identical-URI races, not
  // distinct-URIs-same-subject ones.
  const addSubjectToList = useCallback(
    async (rkey: string, subjectDid: string): Promise<EndorsementList> => {
      const targetDid = didRef.current
      if (!targetDid) throw new Error("No active DID for addSubjectToList")
      const existing = lists.find((l) => l.rkey === rkey)
      if (!existing) throw new Error("List not found")
      const alreadyInList = existing.items.some(
        (a) => extractAwardSubjectDid(a.value.subject) === subjectDid,
      )
      if (alreadyInList) return existing
      const award = await createEndorsementAward(targetDid, subjectDid)
      const result = await appendItemToList(targetDid, rkey, {
        uri: award.uri,
        cid: award.cid,
      })
      if (!result.added) return existing
      // Locally we don't have the new award's full BadgeAwardRecord
      // shape; rather than fake one and risk drift, just refetch on
      // success. Optimistic insert isn't worth the divergence.
      await refetch()
      const refreshed = (cache.get(targetDid)?.lists ?? lists).find(
        (l) => l.rkey === rkey,
      )
      return refreshed ?? existing
    },
    [lists, refetch],
  )

  // Owner-only. Drops the item from the list. Award is NOT deleted.
  const removeSubjectFromList = useCallback(
    async (rkey: string, awardUri: string): Promise<EndorsementList> => {
      const targetDid = didRef.current
      if (!targetDid) throw new Error("No active DID for removeSubjectFromList")
      const existing = lists.find((l) => l.rkey === rkey)
      if (!existing) throw new Error("List not found")
      await removeItemFromList(targetDid, rkey, awardUri)
      const updated: EndorsementList = {
        ...existing,
        items: existing.items.filter((a) => a.uri !== awardUri),
      }
      setLists((prev) => {
        const next = prev.map((l) => (l.rkey === rkey ? updated : l))
        cache.set(targetDid, { lists: next, fetchedAt: Date.now() })
        return next
      })
      return updated
    },
    [lists],
  )

  return useMemo(
    () => ({
      lists,
      isLoading,
      error,
      refetch,
      createList,
      updateList,
      deleteList,
      addSubjectToList,
      removeSubjectFromList,
    }),
    [
      lists,
      isLoading,
      error,
      refetch,
      createList,
      updateList,
      deleteList,
      addSubjectToList,
      removeSubjectFromList,
    ],
  )
}
