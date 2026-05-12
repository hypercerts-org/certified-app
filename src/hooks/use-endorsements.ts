"use client"

import { useCallback, useEffect, useState } from "react"
import {
  fetchGivenEndorsements,
  type EndorsementRecord,
} from "@/lib/atproto/endorsements"

/**
 * Fetch and track the endorsements **given** by a user (read from
 * their own repo). Re-fetches when `did` changes; exposes a `refetch`
 * callback for write paths (create/delete) to refresh the list.
 */
export function useGivenEndorsements(did: string | null): {
  endorsements: EndorsementRecord[]
  isLoading: boolean
  error: string | null
  refetch: () => Promise<void>
} {
  const [endorsements, setEndorsements] = useState<EndorsementRecord[]>([])
  const [isLoading, setIsLoading] = useState(!!did)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(
    async (signal?: AbortSignal) => {
      if (!did) {
        setEndorsements([])
        setIsLoading(false)
        setError(null)
        return
      }
      setIsLoading(true)
      setError(null)
      try {
        const records = await fetchGivenEndorsements(did, signal)
        if (signal?.aborted) return
        setEndorsements(records)
      } catch (err) {
        if (signal?.aborted) return
        setError(
          err instanceof Error ? err.message : "Failed to load endorsements"
        )
      } finally {
        if (!signal?.aborted) setIsLoading(false)
      }
    },
    [did]
  )

  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal)
    return () => controller.abort()
  }, [load])

  // refetch without an abort signal — callers use this after a
  // successful create/delete to refresh the list.
  const refetch = useCallback(() => load(), [load])

  return { endorsements, isLoading, error, refetch }
}
