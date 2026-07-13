"use client"

import { useCallback, useEffect, useState } from "react"
import {
  fetchFundingReceiptsForActivity,
  type FundingReceipt,
} from "@/lib/atproto/indexer"

/**
 * Load every `org.hypercerts.funding.receipt` whose `for` strongRef
 * points at a single activity (`did` + `rkey`). Backs the activity
 * detail page's Funding tab + overview preview.
 *
 * Mirrors `useCertProjects`: a single indexer call in an effect, an
 * AbortController for cleanup, and a fail-soft empty result on error so
 * the surface degrades to an empty state rather than crashing. `first`
 * is clamped server-side to the proxy's MAX_FIRST (100).
 */
export function useActivityFunding(
  did: string | null,
  rkey: string | null,
  options: { first?: number } = {},
) {
  const { first = 100 } = options
  const [receipts, setReceipts] = useState<FundingReceipt[]>([])
  const [totalCount, setTotalCount] = useState<number | null>(null)
  const [isLoading, setIsLoading] = useState(!!did && !!rkey)
  const [error, setError] = useState<string | null>(null)
  // Bumped by `refetch()` to re-run the fetch effect — e.g. the "refresh"
  // affordance shown after recording, since the indexer is eventually
  // consistent and a fresh receipt may not appear on the first load.
  const [refreshNonce, setRefreshNonce] = useState(0)
  const refetch = useCallback(() => setRefreshNonce((n) => n + 1), [])

  // Adjust state during render when the fetch identity changes (the nonce
  // is part of the key so refetch() still flips isLoading). Stale receipts
  // are kept while a same-target refetch is in flight, matching the old
  // effect's behavior.
  const fetchKey = `${did}|${rkey}|${first}|${refreshNonce}`
  const [prevFetchKey, setPrevFetchKey] = useState(fetchKey)
  if (prevFetchKey !== fetchKey) {
    setPrevFetchKey(fetchKey)
    if (did && rkey) {
      setIsLoading(true)
      setError(null)
    } else {
      setReceipts([])
      setTotalCount(null)
      setIsLoading(false)
      setError(null)
    }
  }

  useEffect(() => {
    if (!did || !rkey) return

    const forUri = `at://${did}/org.hypercerts.claim.activity/${rkey}`
    const controller = new AbortController()
    const { signal } = controller

    fetchFundingReceiptsForActivity(forUri, { first, signal })
      .then((result) => {
        if (signal.aborted) return
        setReceipts(result.records)
        setTotalCount(result.totalCount)
      })
      .catch((err: unknown) => {
        if (signal.aborted) return
        console.error("[useActivityFunding] indexer fetch failed:", err)
        setError(
          err instanceof Error
            ? err.message
            : "Failed to load funding receipts for this activity",
        )
        setReceipts([])
        setTotalCount(null)
      })
      .finally(() => {
        if (!signal.aborted) setIsLoading(false)
      })

    return () => controller.abort()
  }, [did, rkey, first, refreshNonce])

  return { receipts, totalCount, isLoading, error, refetch }
}
