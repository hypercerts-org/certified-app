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

/**
 * Read + mutate the viewer's `list:*` collection records, grouped by
 * type. Reuses the existing `endorsement-lists-cache` invalidation
 * bus so any list mutation refreshes every mounted instance — same
 * cross-component sync the endorsement-list hook already relies on.
 */
export function useTypedLists(did: string | null) {
  const [lists, setLists] = useState<TypedListRecord[]>([])
  const [isLoading, setIsLoading] = useState(!!did)
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
      setIsLoading(true)
      setError(null)
      try {
        const records = await fetchTypedLists(targetDid, signal)
        if (signal?.aborted) return
        setLists(records)
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
    // version included so any cross-component mutation refreshes us.
  }, [did, doFetch, version])

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
