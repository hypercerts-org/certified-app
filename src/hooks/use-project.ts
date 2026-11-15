"use client"

import { useCallback, useEffect, useState } from "react"
import { authFetch } from "@/lib/auth/fetch"
import type { CollectionValue } from "@/lib/atproto/collection"

const COLLECTION = "org.hypercerts.collection"

/** The error a missing project reads as, so the page can say "not found"
 *  rather than "couldn't load". */
export const PROJECT_NOT_FOUND = "Project not found"

export interface SingleProject {
  uri: string
  cid: string
  did: string
  rkey: string
  value: CollectionValue
}

/**
 * Fetch a single `org.hypercerts.collection` project record by author
 * DID + rkey. Mirrors `useActivity`: uses our XRPC proxy so foreign
 * PDSes resolve transparently. `error` is {@link PROJECT_NOT_FOUND} when
 * the record doesn't exist, another message when it couldn't be read;
 * `refetch` tries again.
 */
export function useProject(
  did: string | null,
  rkey: string | null,
): {
  project: SingleProject | null
  isLoading: boolean
  error: string | null
  refetch: () => void
} {
  const [project, setProject] = useState<SingleProject | null>(null)
  const [isLoading, setIsLoading] = useState(!!(did && rkey))
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const refetch = useCallback(() => setReloadKey((k) => k + 1), [])

  useEffect(() => {
    if (!did || !rkey) {
      setProject(null)
      setIsLoading(false)
      setError(null)
      return
    }

    const controller = new AbortController()
    const signal = controller.signal
    const safeDid = did
    const safeRkey = rkey

    async function run() {
      setIsLoading(true)
      setError(null)
      try {
        const params = new URLSearchParams({
          repo: safeDid,
          collection: COLLECTION,
          rkey: safeRkey,
        })
        const res = await authFetch(
          `/api/xrpc/com/atproto/repo/getRecord?${params.toString()}`,
          { signal },
        )
        if (signal.aborted) return
        if (!res.ok) {
          // The PDS answers a well-formed read of a missing record with
          // 400 (RecordNotFound), which the proxy passes through; 404 is
          // an account with no PDS. Anything else is a failure to load.
          throw new Error(
            res.status === 404 || res.status === 400
              ? PROJECT_NOT_FOUND
              : "Couldn't load this project. Try again.",
          )
        }
        const data = (await res.json()) as {
          uri: string
          cid: string
          value: CollectionValue
        }
        if (signal.aborted) return
        setProject({
          uri: data.uri,
          cid: data.cid,
          did: safeDid,
          rkey: safeRkey,
          value: data.value,
        })
      } catch (err) {
        if (signal.aborted) return
        console.error("Failed to load project:", err)
        setError(err instanceof Error ? err.message : "Failed to load project")
        setProject(null)
      } finally {
        if (!signal.aborted) setIsLoading(false)
      }
    }

    run()
    return () => controller.abort()
  }, [did, rkey, reloadKey])

  return { project, isLoading, error, refetch }
}
