/**
 * Module-level invalidation token for endorsement-list collections.
 *
 * Mirrors `endorsement-closure-cache.ts`: a tiny store with a
 * useSyncExternalStore-backed hook. Bumping the version notifies
 * every subscribed `useEndorsementLists` instance so they all
 * refetch — without the call site having to know what's mounted.
 *
 * Use case: a revoke from the Given panel deletes the award AND
 * (via `purgeAwardFromLists` inside `deleteEndorsementAward`) drops
 * the entry from every list that referenced it. The list-detail
 * view above needs to reflect the removal even though the mutation
 * happened from a sibling component the hook can't see.
 */

let version = 0
const subscribers = new Set<() => void>()

/**
 * Notify every subscriber that the issuer's list collection set
 * is stale. Callers: any mutation that creates, deletes, or
 * reshapes one of the issuer's endorsement-list collections — in
 * practice `createEndorsementListCollection`, `appendItemToList`,
 * `removeItemFromList`, `deleteEndorsementListCollection`, and
 * `deleteEndorsementAward` (which purges across all lists).
 */
export function invalidateEndorsementLists(): void {
  version++
  for (const s of subscribers) s()
}

export function subscribeEndorsementListsVersion(cb: () => void): () => void {
  subscribers.add(cb)
  return () => {
    subscribers.delete(cb)
  }
}

export function getEndorsementListsVersionSnapshot(): number {
  return version
}
