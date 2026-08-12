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
  appendManyItemsToList,
  createEndorsementListCollection,
  deleteEndorsementListCollection,
  listEndorsementListCollections,
  removeItemFromList,
  updateEndorsementListCollection,
} from "@/lib/atproto/collection"
import {
  getEndorsementListsVersionSnapshot,
  subscribeEndorsementListsVersion,
} from "@/lib/atproto/endorsement-lists-cache"
import { rkeyFromUri } from "@/lib/urls"

/**
 * One "list" on a profile's Endorsements tab.
 *
 * Backed by a single `org.hypercerts.collection` record with
 * `type === "list:endorsements"`. The collection's `items[]` holds
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
  /** Invalidation-bus version this entry was fetched under. A bump
   *  (any list mutation, anywhere) makes the entry a miss exactly
   *  once — previously `force = listsVersion > 0` bypassed the cache
   *  AND the proxy's HTTP cache on every mount for the rest of the
   *  session after the first mutation. */
  version: number
}

const STALE_MS = 5 * 60 * 1000
const cache = new Map<string, CacheEntry>()

// Optimistic write-through used by the mutation callbacks: stamps the
// entry with the CURRENT bus version — the local state already
// reflects the mutation, so a version bump fired during the write
// must not force an immediate redundant refetch of what we just set.
function writeCache(targetDid: string, lists: EndorsementList[]): void {
  cache.set(targetDid, {
    lists,
    fetchedAt: Date.now(),
    version: getEndorsementListsVersionSnapshot(),
  })
}

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
  /**
   * Bulk variant of `addSubjectToList`. For every subject DID not
   * already in the list, mints a fresh endorsement award in parallel
   * and then writes them all to the list's `items[]` in a single
   * read-modify-write. Reports per-subject status so the bulk-paste UI
   * can surface "added", "already in", and "award create failed" rows
   * independently. Mirrors `appendManyToTypedList` semantics for the
   * endorsement-list lexicon.
   */
  addManySubjectsToList: (
    rkey: string,
    subjectDids: readonly string[],
  ) => Promise<{
    added: string[]
    skippedAlreadyIn: string[]
    awardFailed: { subjectDid: string; message: string }[]
  }>
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
  // Mirror `lists` into a ref so the mutation callbacks can read the
  // CURRENT list set after their `await`, rather than the closure
  // snapshot captured at render time. Without this, a concurrent
  // refetch landing during the await is clobbered by an optimistic
  // merge built from the pre-await snapshot. Keeps the callbacks off
  // the `lists` dep so they don't rebind on every list change.
  const listsRef = useRef(lists)
  listsRef.current = lists

  const doFetch = useCallback(
    async (targetDid: string | null, signal?: AbortSignal, force = false) => {
      if (!targetDid) {
        setLists([])
        setIsLoading(false)
        setError(null)
        return
      }
      // Snapshot the bus version at fetch start: the entry is stamped
      // with it, so a mutation landing mid-fetch (bumping the version)
      // still invalidates what this fetch writes.
      const version = getEndorsementListsVersionSnapshot()
      let noCache = force
      if (!force) {
        const cached = cache.get(targetDid)
        if (cached) {
          const fresh = Date.now() - cached.fetchedAt < STALE_MS
          if (fresh && cached.version === version) {
            setLists(cached.lists)
            setIsLoading(false)
            return
          }
          // Version-driven miss: a mutation outside this hook landed
          // after this entry was cached. Bypass the proxy's 5s
          // listRecords cache on the refetch, or a pre-write response
          // could get pinned here for another STALE_MS window.
          if (cached.version !== version) noCache = true
        }
      }
      setIsLoading(true)
      setError(null)
      try {
        const [collections, awards] = await Promise.all([
          listEndorsementListCollections(targetDid, signal),
          listAwards(targetDid, signal, noCache ? { noCache: true } : undefined),
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
        cache.set(targetDid, { lists: next, fetchedAt: Date.now(), version })
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
    // The version dep re-runs this when something outside this hook
    // mutated the lists; doFetch spots the version mismatch on the
    // cached entry and refetches (with noCache) exactly once.
    doFetch(did, controller.signal)
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
        rkey: rkeyFromUri(ref.uri),
        title: title.trim(),
        description: description?.trim() || undefined,
        createdAt: new Date().toISOString(),
        items: [],
      }
      setLists((prev) => {
        const next = [entry, ...prev]
        writeCache(targetDid, next)
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
      const existing = listsRef.current.find((l) => l.rkey === rkey)
      if (!existing) throw new Error("List not found")
      await updateEndorsementListCollection(targetDid, rkey, title, description)
      // Apply the title/description change on top of whatever the list
      // looks like NOW (a concurrent refetch may have reshaped items[]),
      // not the pre-await `existing` snapshot.
      let updated: EndorsementList = existing
      setLists((prev) => {
        const next = prev.map((l) => {
          if (l.rkey !== rkey) return l
          updated = {
            ...l,
            title: title.trim(),
            description: description?.trim() || undefined,
          }
          return updated
        })
        writeCache(targetDid, next)
        return next
      })
      return updated
    },
    [],
  )

  // Owner-only. Removes the collection record only — awards survive.
  // Optimistic local removal mirrors create/update.
  const deleteList = useCallback(
    async (rkey: string): Promise<void> => {
      const targetDid = didRef.current
      if (!targetDid) throw new Error("No active DID for deleteList")
      const existing = listsRef.current.find((l) => l.rkey === rkey)
      if (!existing) throw new Error("List not found")
      await deleteEndorsementListCollection(targetDid, rkey)
      setLists((prev) => {
        const next = prev.filter((l) => l.rkey !== rkey)
        writeCache(targetDid, next)
        return next
      })
    },
    [],
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
      const existing = listsRef.current.find((l) => l.rkey === rkey)
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
      const refreshed = (cache.get(targetDid)?.lists ?? listsRef.current).find(
        (l) => l.rkey === rkey,
      )
      return refreshed ?? existing
    },
    [refetch],
  )

  // Owner-only bulk variant of addSubjectToList. Mirrors the typed-list
  // bulk-paste flow: parallel award creation, then a single RMW on the
  // list collection to append every new ref at once. Subject-level
  // dedupe runs BEFORE the parallel award creates so a list that
  // already contains 5 of the 20 pasted DIDs only mints 15 awards
  // instead of all 20.
  const addManySubjectsToList = useCallback(
    async (
      rkey: string,
      subjectDids: readonly string[],
    ): Promise<{
      added: string[]
      skippedAlreadyIn: string[]
      awardFailed: { subjectDid: string; message: string }[]
    }> => {
      const targetDid = didRef.current
      if (!targetDid) throw new Error("No active DID for addManySubjectsToList")
      const existing = listsRef.current.find((l) => l.rkey === rkey)
      if (!existing) throw new Error("List not found")

      // Dedupe-before-create. Subjects already in the list (or
      // duplicated within the input itself) skip the PDS write entirely.
      const presentSubjects = new Set<string>()
      for (const a of existing.items) {
        const subj = extractAwardSubjectDid(a.value.subject)
        if (subj) presentSubjects.add(subj)
      }
      const toCreate: string[] = []
      const skippedAlreadyIn: string[] = []
      const seenInBatch = new Set<string>()
      for (const subj of subjectDids) {
        if (presentSubjects.has(subj) || seenInBatch.has(subj)) {
          skippedAlreadyIn.push(subj)
          continue
        }
        seenInBatch.add(subj)
        toCreate.push(subj)
      }

      const awardFailed: { subjectDid: string; message: string }[] = []
      if (toCreate.length === 0) {
        return { added: [], skippedAlreadyIn, awardFailed }
      }

      // Mint awards in parallel — each `createEndorsementAward` is an
      // independent createRecord with a fresh TID, so they don't
      // conflict on the PDS. Failures are collected per-row so the UI
      // can show "could not endorse alice.bsky.social" without
      // tearing down the rest of the batch.
      const minted = await Promise.all(
        toCreate.map(async (subjectDid) => {
          try {
            const award = await createEndorsementAward(targetDid, subjectDid)
            return { subjectDid, ref: { uri: award.uri, cid: award.cid } } as const
          } catch (err) {
            awardFailed.push({
              subjectDid,
              message: err instanceof Error ? err.message : "Award create failed",
            })
            return null
          }
        }),
      )
      const refs = minted
        .filter(
          (m): m is { subjectDid: string; ref: { uri: string; cid: string } } =>
            m !== null,
        )
        .map((m) => m.ref)

      if (refs.length === 0) {
        return { added: [], skippedAlreadyIn, awardFailed }
      }

      // Single RMW on the list collection — turns N round-trips into
      // one. `appendManyItemsToList` returns the URIs it actually
      // wrote, so the per-subject result mapping survives a partial
      // swap-record failure (if the swap rejects everything, the
      // catch falls through to awardFailed-style surfacing in the UI).
      let bulkResult: Awaited<ReturnType<typeof appendManyItemsToList>>
      try {
        bulkResult = await appendManyItemsToList(targetDid, rkey, refs)
      } catch (err) {
        // The awards were created but the list-append failed — the
        // ghosted awards are still on the PDS but won't appear in any
        // list. Surface this as award-failed-style errors against the
        // affected subjects so the user knows something needs to be
        // tried again (or revoked).
        const message =
          err instanceof Error ? err.message : "List update failed"
        for (const m of minted) {
          if (m) awardFailed.push({ subjectDid: m.subjectDid, message })
        }
        return { added: [], skippedAlreadyIn, awardFailed }
      }

      // Back-map written award URIs to subject DIDs for the response.
      const writtenUris = new Set(bulkResult.added)
      const addedSubjects: string[] = []
      for (const m of minted) {
        if (m && writtenUris.has(m.ref.uri)) addedSubjects.push(m.subjectDid)
      }

      // Single refetch at the end so all the new rows appear together.
      await refetch()
      return { added: addedSubjects, skippedAlreadyIn, awardFailed }
    },
    [refetch],
  )

  // Owner-only. Drops the item from the list. Award is NOT deleted.
  const removeSubjectFromList = useCallback(
    async (rkey: string, awardUri: string): Promise<EndorsementList> => {
      const targetDid = didRef.current
      if (!targetDid) throw new Error("No active DID for removeSubjectFromList")
      const existing = listsRef.current.find((l) => l.rkey === rkey)
      if (!existing) throw new Error("List not found")
      await removeItemFromList(targetDid, rkey, awardUri)
      // Drop the item from whatever the list looks like NOW (a
      // concurrent refetch may have reshaped items[]), not the pre-await
      // `existing` snapshot.
      let updated: EndorsementList = {
        ...existing,
        items: existing.items.filter((a) => a.uri !== awardUri),
      }
      setLists((prev) => {
        const next = prev.map((l) => {
          if (l.rkey !== rkey) return l
          updated = {
            ...l,
            items: l.items.filter((a) => a.uri !== awardUri),
          }
          return updated
        })
        writeCache(targetDid, next)
        return next
      })
      return updated
    },
    [],
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
      addManySubjectsToList,
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
      addManySubjectsToList,
      removeSubjectFromList,
    ],
  )
}
