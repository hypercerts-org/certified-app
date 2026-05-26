/**
 * Module-level invalidation token for `org.hypercerts.collection`
 * records — the shared write/refresh bus for both the older
 * endorsement-list flow AND the typed-list flow (`list:certs` /
 * `list:projects` / `list:accounts`).
 *
 * Despite the file name (kept for git-history continuity), every
 * mutation that touches a collection record broadcasts through
 * this token:
 *   - endorsement-list create/update/delete + item append/remove
 *     (`src/lib/atproto/collection.ts`)
 *   - typed-list create/update/delete + item append/remove
 *     (`src/lib/atproto/typed-lists.ts`)
 *   - `deleteEndorsementAward` (purges the award from every list
 *     it appeared in, so list-detail views need to refresh too)
 *
 * Pattern mirrors `endorsement-closure-cache.ts`: a tiny store
 * fronted by `useSyncExternalStore`. Bumping the version notifies
 * every subscribed hook instance so they all refetch — without the
 * call site having to know what's mounted across the component
 * tree.
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
