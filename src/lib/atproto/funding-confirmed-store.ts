"use client"

import { useSyncExternalStore } from "react"
import type { FundingReceipt } from "./indexer"

/**
 * Session-local overlay for funding confirmations the viewer makes, bridging
 * the indexer's eventual consistency (issue #186):
 *
 *   - `confirmedKeys` — the URIs of receipts the viewer has confirmed this
 *     session, so the "Confirm payment" affordance hides immediately (and
 *     across modal remounts) and the payment can't be confirmed twice.
 *   - `optimisticByUri` — the freshly-written confirmation receipts, injected
 *     into the funding lists so `mergeMatchingReceipts` collapses each onto
 *     its counterpart and the pair shows as one confirmed row at once, instead
 *     of flashing two rows until the indexer's cluster view refreshes.
 *
 * Both are transient: cleared on full reload, by when the indexer's
 * `attestations[]` / collapsed connection takes over. `remove…` undoes an
 * optimistic confirmation when the viewer takes it back (deletes the receipt).
 */
const confirmedKeys = new Set<string>()
const optimisticByUri = new Map<string, FundingReceipt>()
const deletedUris = new Set<string>()
const listeners = new Set<() => void>()

const EMPTY: readonly FundingReceipt[] = []
const EMPTY_SET: ReadonlySet<string> = new Set()
let optimisticSnapshot: readonly FundingReceipt[] = EMPTY
let deletedSnapshot: ReadonlySet<string> = EMPTY_SET

function rebuildSnapshots(): void {
  optimisticSnapshot =
    optimisticByUri.size === 0 ? EMPTY : Array.from(optimisticByUri.values())
  deletedSnapshot = deletedUris.size === 0 ? EMPTY_SET : new Set(deletedUris)
}

function notify(): void {
  rebuildSnapshots()
  for (const listener of listeners) listener()
}

/**
 * Record an optimistic confirmation: hide the affordance on `confirmedUri`
 * (the receipt being confirmed) and inject `receipt` (the just-written
 * confirmation, which carries `matchingReceipt` → `confirmedUri`).
 */
export function addOptimisticConfirmation(
  confirmedUri: string,
  receipt: FundingReceipt,
): void {
  confirmedKeys.add(confirmedUri)
  optimisticByUri.set(receipt.uri, receipt)
  notify()
}

/**
 * Record that the viewer deleted a funding receipt (a take-back) so it drops
 * from the lists immediately, before the indexer reflects the deletion. When
 * the deleted receipt is the viewer's optimistic confirmation, this also
 * un-marks the confirmation (the original's "Confirm payment" affordance
 * returns) and removes it from the optimistic overlay so the pair un-merges.
 */
export function markFundingDeleted(receiptUri: string): void {
  deletedUris.add(receiptUri)
  const optimistic = optimisticByUri.get(receiptUri)
  const confirmedUri = optimistic?.matchingReceipt?.uri
  if (confirmedUri) confirmedKeys.delete(confirmedUri)
  optimisticByUri.delete(receiptUri)
  notify()
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

/** Whether the viewer has confirmed `key` (a receipt URI) this session. */
export function useFundingConfirmedLocally(key: string): boolean {
  return useSyncExternalStore(
    subscribe,
    () => confirmedKeys.has(key),
    () => false,
  )
}

/** The viewer's optimistic confirmation receipts (stable reference between
 *  changes), to merge into a funding list before rendering. */
export function useOptimisticFundingReceipts(): readonly FundingReceipt[] {
  return useSyncExternalStore(
    subscribe,
    () => optimisticSnapshot,
    () => EMPTY,
  )
}

/** URIs of receipts the viewer deleted this session, to filter out of a
 *  funding list before rendering. */
export function useDeletedFundingUris(): ReadonlySet<string> {
  return useSyncExternalStore(
    subscribe,
    () => deletedSnapshot,
    () => EMPTY_SET,
  )
}
