"use client"

import { useEffect, useState } from "react"
import { authFetch } from "@/lib/auth/fetch"
import type { CollectionValue } from "@/lib/atproto/collection"

const COLLECTION = "org.hypercerts.collection"

export interface SingleProject {
  uri: string
  cid: string
  did: string
  rkey: string
  value: CollectionValue
}

/**
 * Fetch a single `org.hypercerts.collection` project record by author
 * DID + rkey. Mirrors `useActivity` — uses our XRPC proxy so foreign
 * PDSes resolve transparently.
 */
export function useProject(
  did: string | null,
  rkey: string | null,
): {
  project: SingleProject | null
  isLoading: boolean
  error: string | null
} {
  const [project, setProject] = useState<SingleProject | null>(null)
  const [isLoading, setIsLoading] = useState(!!(did && rkey))
  const [error, setError] = useState<string | null>(null)

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
          throw new Error(
            res.status === 404
              ? "Project not found"
              : `Failed to load project (${res.status})`,
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
  }, [did, rkey])

  return { project, isLoading, error }
}
