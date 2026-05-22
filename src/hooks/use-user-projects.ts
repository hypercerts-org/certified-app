"use client"

import { useCallback, useEffect, useState } from "react"
import { fetchUserProjects } from "@/lib/atproto/indexer"
import type { CollectionRecord } from "@/lib/atproto/collection"

/**
 * Fetch `org.hypercerts.collection` records authored by `did` whose
 * `type === "project"` (case-insensitive). Powers the Projects tab on
 * /profile/[handle] and the project count on the overview.
 *
 * Now served by the magic-indexer (`UserProjects` op) instead of a
 * per-DID PDS listRecords scan: case-insensitive type matching happens
 * server-side via `eqi` (magic-indexer#81), and the response is a
 * single GraphQL call instead of paginating through every collection
 * record on the user's PDS. Records using the legacy
 * `value.name` / `value.image` field names (not in the indexer's
 * lexicon-driven schema) will read "Untitled project" / no banner so
 * authors can spot and republish them while the dataset is small.
 */
export function useUserProjects(did: string | null) {
  const [projects, setProjects] = useState<CollectionRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(
    async (signal?: AbortSignal) => {
      if (!did) {
        setProjects([])
        setIsLoading(false)
        setError(null)
        return
      }
      try {
        setIsLoading(true)
        setError(null)
        const result = await fetchUserProjects(did, { signal })
        if (signal?.aborted) return
        setProjects(result.records)
      } catch (err) {
        if (signal?.aborted) return
        console.error("Failed to fetch projects:", err)
        setError(err instanceof Error ? err.message : "Failed to fetch projects")
      } finally {
        if (!signal?.aborted) setIsLoading(false)
      }
    },
    [did],
  )

  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal)
    return () => controller.abort()
  }, [load])

  return { projects, isLoading, error }
}
