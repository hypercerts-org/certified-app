"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  ENDORSEMENT_BADGE_TITLE,
  ENDORSEMENT_BADGE_TYPE,
  createListDefinition,
  deleteListAndAwards,
  listAwards,
  listDefinitions,
  updateListDefinition,
  type BadgeAwardRecord,
} from "@/lib/atproto/badges"

/**
 * One "list" on a profile's Endorsements tab — an
 * `app.certified.badge.definition` whose `badgeType` is
 * `"endorsement"` and whose `title` is NOT the reserved default
 * (`"Endorsement"`). The default def is the auto-created shell that
 * backs the Received/Given panels; everything else with the same
 * badgeType is a user-created list.
 *
 * `items` is every `app.certified.badge.award` on the same repo
 * whose `badge` strongRef points at this list's URI. We resolve
 * those locally — one PDS `listAwards` call covers the whole repo,
 * and we group by `badge.uri` here. See companion magic-indexer
 * issue for the server-side count we'd ideally consume instead.
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
 * Read every list (custom endorsement definition) on `did`'s repo
 * plus the awards that link to each, grouped together.
 *
 * Fetch shape:
 *   1. PDS `listDefinitions` and `listAwards` in parallel — both
 *      live on the same repo, so two cheap round-trips.
 *   2. Client-side filter + group: drop the default `"Endorsement"`
 *      def; for the rest, attach awards whose `badge.uri` matches.
 *
 * Exposes:
 *   - `lists`        — newest first.
 *   - `isLoading`    — true while the initial fetch is in flight.
 *   - `error`        — non-null on PDS failure.
 *   - `refetch`      — bypass cache, force a fresh page-walk.
 *   - `createList`   — viewer-only helper. Writes a new list def,
 *                      then optimistically inserts it so the UI
 *                      doesn't wait on refetch.
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
  deleteList: (rkey: string) => Promise<{ deletedAwards: number }>
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
        const [defs, awards] = await Promise.all([
          listDefinitions(targetDid, signal, force ? { noCache: true } : undefined),
          listAwards(targetDid, signal, force ? { noCache: true } : undefined),
        ])
        if (signal?.aborted) return
        // Group awards by their badge.uri so the per-list attach is
        // O(awards) instead of O(lists × awards).
        const awardsByDef = new Map<string, BadgeAwardRecord[]>()
        for (const a of awards) {
          const defUri = a.value.badge?.uri
          if (typeof defUri !== "string") continue
          const bucket = awardsByDef.get(defUri)
          if (bucket) bucket.push(a)
          else awardsByDef.set(defUri, [a])
        }
        const next: EndorsementList[] = defs
          .filter(
            (d) =>
              d.value.badgeType === ENDORSEMENT_BADGE_TYPE &&
              d.value.title !== ENDORSEMENT_BADGE_TITLE,
          )
          .map((d) => ({
            uri: d.uri,
            cid: d.cid,
            rkey: d.rkey,
            title: d.value.title,
            description: d.value.description,
            createdAt: d.value.createdAt,
            items: awardsByDef.get(d.uri) ?? [],
          }))
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

  // Owner-only. Writes the new definition on the viewer's PDS and
  // inserts it into local state so the UI flips to the new list
  // immediately. Throws if the write fails (caller surfaces).
  const createList = useCallback(
    async (title: string, description?: string): Promise<EndorsementList> => {
      const targetDid = didRef.current
      if (!targetDid) throw new Error("No active DID for createList")
      const ref = await createListDefinition(targetDid, title, description)
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

  // Owner-only. Overwrites the existing definition's title /
  // description while preserving its rkey and createdAt. Optimistic:
  // we splice the updated entry into local state immediately so the
  // detail view reflects the new metadata without waiting for a
  // refetch.
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
      await updateListDefinition(
        targetDid,
        rkey,
        existing.createdAt,
        title,
        description,
      )
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

  // Owner-only. Deletes every award linked to the list, then the
  // list definition itself. The award delete happens first so an
  // interrupted run never leaves orphan awards pointing at a missing
  // definition. Optimistic local removal mirrors create/update.
  const deleteList = useCallback(
    async (rkey: string): Promise<{ deletedAwards: number }> => {
      const targetDid = didRef.current
      if (!targetDid) throw new Error("No active DID for deleteList")
      const existing = lists.find((l) => l.rkey === rkey)
      if (!existing) throw new Error("List not found")
      const awardRkeys = existing.items.map((a) => a.rkey)
      const result = await deleteListAndAwards(targetDid, rkey, awardRkeys)
      setLists((prev) => {
        const next = prev.filter((l) => l.rkey !== rkey)
        cache.set(targetDid, { lists: next, fetchedAt: Date.now() })
        return next
      })
      return { deletedAwards: result.deletedAwards }
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
    }),
    [lists, isLoading, error, refetch, createList, updateList, deleteList],
  )
}
