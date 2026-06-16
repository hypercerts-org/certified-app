"use client"

import { useMemo } from "react"
import { mergeMatchingReceipts } from "@/lib/atproto/funding-merge"
import {
  useOptimisticFundingReceipts,
  useDeletedFundingUris,
} from "@/lib/atproto/funding-confirmed-store"
import type { FundingReceipt } from "@/lib/atproto/indexer"

/**
 * Overlay the viewer's optimistic confirmations onto a fetched funding list
 * and collapse `matchingReceipt` pairs into single confirmed rows (issue
 * #186). Pass `forUri` on an activity surface so only confirmations for that
 * activity are injected (the network-wide /explore list passes none).
 *
 * The fetched list keeps its order: a confirmation merges onto its
 * counterpart in place. When the indexer has ingested a confirmation but not
 * yet collapsed it, the optimistic `matchingReceipt` link is preserved onto
 * the fetched copy so it still merges; once the indexer collapses the pair,
 * the de-dupe yields to the indexer's row.
 */
export function useMergedFunding(
  fetched: readonly FundingReceipt[],
  forUri?: string | null,
): FundingReceipt[] {
  const optimistic = useOptimisticFundingReceipts()
  const deleted = useDeletedFundingUris()
  return useMemo(() => {
    const base = Array.isArray(fetched) ? fetched : []
    // Drop receipts the viewer deleted (take-back) before merging.
    const liveFetched =
      deleted.size === 0 ? base : base.filter((r) => !deleted.has(r.uri))
    const relevant = (
      forUri ? optimistic.filter((r) => r.forUri === forUri) : optimistic
    ).filter((r) => !deleted.has(r.uri))
    if (relevant.length === 0) return mergeMatchingReceipts(liveFetched)

    const fetchedUris = new Set(liveFetched.map((r) => r.uri))
    const optByUri = new Map(relevant.map((r) => [r.uri, r]))
    const reconciled = liveFetched.map((r) => {
      const opt = optByUri.get(r.uri)
      return opt?.matchingReceipt && !r.matchingReceipt
        ? { ...r, matchingReceipt: opt.matchingReceipt }
        : r
    })
    const pendingOnly = relevant.filter((r) => !fetchedUris.has(r.uri))
    return mergeMatchingReceipts([...reconciled, ...pendingOnly])
  }, [fetched, optimistic, deleted, forUri])
}
