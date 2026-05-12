"use client"

import { useEffect, useState } from "react"
import { authFetch } from "@/lib/auth/fetch"
import type { ClaimActivity } from "@/lib/atproto/activity-types"

const COLLECTION = "org.hypercerts.claim.activity"

export interface SingleActivity {
  uri: string
  cid: string
  did: string
  rkey: string
  value: ClaimActivity
}

/**
 * Fetch a single activity claim by its author DID + rkey.
 *
 * Uses /api/xrpc/com/atproto/repo/getRecord which, since PR #27,
 * transparently federates to the author's home PDS when they aren't on
 * our own instance. Returns null from the hook while loading, then
 * either the resolved activity or an error.
 */
export function useActivity(
  did: string | null,
  rkey: string | null
): {
  activity: SingleActivity | null
  isLoading: boolean
  error: string | null
} {
  const [activity, setActivity] = useState<SingleActivity | null>(null)
  const [isLoading, setIsLoading] = useState(!!(did && rkey))
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!did || !rkey) {
      setActivity(null)
      setIsLoading(false)
      setError(null)
      return
    }

    const controller = new AbortController()
    const signal = controller.signal
    // Narrow for the closure below — the outer `if (!did || !rkey)`
    // early-return guards prove these are strings but TS can't see
    // across the IIFE boundary on its own.
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
          { signal }
        )
        if (signal.aborted) return
        if (!res.ok) {
          throw new Error(
            res.status === 404
              ? "Activity not found"
              : `Failed to load activity (${res.status})`
          )
        }
        const data = (await res.json()) as {
          uri: string
          cid: string
          value: ClaimActivity
        }
        if (signal.aborted) return
        setActivity({
          uri: data.uri,
          cid: data.cid,
          did: safeDid,
          rkey: safeRkey,
          value: data.value,
        })
      } catch (err) {
        if (signal.aborted) return
        console.error("Failed to load activity:", err)
        setError(err instanceof Error ? err.message : "Failed to load activity")
        setActivity(null)
      } finally {
        if (!signal.aborted) setIsLoading(false)
      }
    }

    run()
    return () => controller.abort()
  }, [did, rkey])

  return { activity, isLoading, error }
}
