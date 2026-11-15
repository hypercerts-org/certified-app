"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  fetchAllFundingReceiptsFor,
  type FundingReceipt,
} from "@/lib/atproto/indexer"
import { mergeRecordReceipts } from "@/lib/funding/record-funding"

/**
 * Every `org.hypercerts.funding.receipt` whose `for` strongRef points at
 * one of `forUris`: an activity's own receipts, or a project's together
 * with its activities'. Each record is read page by page to the end (a
 * project funded through a round has hundreds of receipts), the lists are
 * merged, de-duplicated by URI and sorted newest first.
 *
 * Fail-soft like the rest of the indexer reads: a failed load leaves an
 * empty list and sets `error`, so the page can say so and offer a retry.
 * `complete` is false when a record had more pages than the reader takes.
 */
export function useRecordFunding(forUris: readonly string[]) {
  // A stable key for the list, so a new array with the same URIs doesn't
  // refetch.
  const key = forUris.filter(Boolean).join("|")
  const uris = useMemo(() => (key ? key.split("|") : []), [key])

  const [receipts, setReceipts] = useState<FundingReceipt[]>([])
  const [isLoading, setIsLoading] = useState(uris.length > 0)
  const [error, setError] = useState<string | null>(null)
  const [complete, setComplete] = useState(true)
  // Bumped by `refetch()`: the indexer is eventually consistent, so a
  // just-recorded receipt may need another read.
  const [nonce, setNonce] = useState(0)
  const refetch = useCallback(() => setNonce((n) => n + 1), [])

  // Reset during render when the target changes (stale receipts stay while
  // the same target refetches).
  const fetchKey = `${key}#${nonce}`
  const [prevFetchKey, setPrevFetchKey] = useState(fetchKey)
  const [prevKey, setPrevKey] = useState(key)
  if (prevFetchKey !== fetchKey) {
    setPrevFetchKey(fetchKey)
    setIsLoading(uris.length > 0)
    setError(null)
    if (prevKey !== key) {
      setPrevKey(key)
      setReceipts([])
      setComplete(true)
    }
  }

  useEffect(() => {
    if (uris.length === 0) return
    const controller = new AbortController()
    const { signal } = controller
    Promise.all(uris.map((uri) => fetchAllFundingReceiptsFor(uri, { signal })))
      .then((results) => {
        if (signal.aborted) return
        setReceipts(mergeRecordReceipts(results.map((r) => r.records)))
        setComplete(results.every((r) => r.complete))
      })
      .catch((err: unknown) => {
        if (signal.aborted) return
        console.error("[useRecordFunding] indexer fetch failed:", err)
        setError("Couldn't load the funding for this record.")
        setReceipts([])
      })
      .finally(() => {
        if (!signal.aborted) setIsLoading(false)
      })
    return () => controller.abort()
  }, [uris, nonce])

  return { receipts, isLoading, error, complete, refetch }
}
