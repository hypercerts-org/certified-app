"use client"

import { useCallback, useEffect, useState } from "react"
import { fetchCollections, type CollectionRecord } from "@/lib/atproto/collection"

/**
 * Fetch `org.hypercerts.collection` records on a profile's PDS,
 * filtered to those whose `value.type === "project"`. Powers the
 * Projects tab on /profile/[handle].
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
        const data = await fetchCollections(did, undefined, 50, signal)
        if (signal?.aborted) return
        // Filter to records that declare themselves as projects.
        // Match is case-insensitive — records in the wild store the
        // discriminator as "project", "Project", or "PROJECT". The
        // indexer now supports `where: { type: { eqi: "project" } }`
        // (hypercerts-org/magic-indexer#81) which would let this hook
        // move to a single GraphQL call, but the indexer doesn't
        // surface the legacy `value.name` / `value.image` fallbacks
        // some records still use — so the PDS-scan + client-filter
        // path is kept until those fallbacks are dead.
        const filtered = data.records.filter(
          (r) =>
            typeof r.value?.type === "string" &&
            r.value.type.toLowerCase() === "project",
        )
        setProjects(filtered)
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
