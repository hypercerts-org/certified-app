"use client"

import { useCallback, useEffect, useState } from "react"
import { fetchUserProjects } from "@/lib/atproto/indexer"
import type { CollectionRecord } from "@/lib/atproto/collection"

/** Projects load in pages of this many (the indexer proxy's cap)… */
const PROJECTS_PAGE = 100
/** …up to this many in all. */
export const USER_PROJECTS_MAX = 500

/**
 * Fetch `org.hypercerts.collection` records authored by `did` whose
 * `type === "project"` (case-insensitive). Powers Records' project
 * folders and "Add to project" picker, Home, the Projects tab on
 * /profile/[handle] and the project count on the overview.
 *
 * Every page is loaded (following the indexer's cursor, up to
 * {@link USER_PROJECTS_MAX}), so a folder view or picker never misses a
 * project and files its activities under "Without a project". A failed
 * page sets `error` (and keeps no partial list): callers must treat
 * `error` as "unknown", not as "no projects".
 *
 * Now served by the magic-indexer (`UserProjects` op) instead of a
 * per-DID PDS listRecords scan: case-insensitive type matching happens
 * server-side via `eqi` (magic-indexer#81). Records using the legacy
 * `value.name` / `value.image` field names (not in the indexer's
 * lexicon-driven schema) will read "Untitled project" / no banner so
 * authors can spot and republish them while the dataset is small.
 */
export function useUserProjects(did: string | null) {
  const [projects, setProjects] = useState<CollectionRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  /** More than USER_PROJECTS_MAX exist; only the first ones loaded. */
  const [truncated, setTruncated] = useState(false)

  const load = useCallback(
    async (signal?: AbortSignal) => {
      if (!did) {
        setProjects([])
        setIsLoading(false)
        setError(null)
        setTruncated(false)
        return
      }
      try {
        setIsLoading(true)
        setError(null)
        const all: CollectionRecord[] = []
        const seen = new Set<string>()
        let after: string | undefined
        let more = true
        while (more && all.length < USER_PROJECTS_MAX) {
          const page = await fetchUserProjects(did, {
            first: PROJECTS_PAGE,
            after,
            signal,
          })
          if (signal?.aborted) return
          for (const record of page.records) {
            if (seen.has(record.uri)) continue
            seen.add(record.uri)
            all.push(record)
          }
          // Stop on a page that adds nothing too, so a cursor that never
          // advances can't loop.
          more = page.hasMore && !!page.endCursor && page.records.length > 0
          after = page.endCursor ?? undefined
        }
        setProjects(all.slice(0, USER_PROJECTS_MAX))
        setTruncated(more || all.length > USER_PROJECTS_MAX)
      } catch (err) {
        if (signal?.aborted) return
        console.error("Failed to fetch projects:", err)
        setProjects([])
        setError(err instanceof Error ? err.message : "Failed to fetch projects")
      } finally {
        if (!signal?.aborted) setIsLoading(false)
      }
    },
    [did],
  )

  // Bumped by `retry` to load again.
  const [attempt, setAttempt] = useState(0)
  const retry = useCallback(() => setAttempt((n) => n + 1), [])

  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal)
    return () => controller.abort()
  }, [load, attempt])

  return { projects, isLoading, error, truncated, retry }
}
