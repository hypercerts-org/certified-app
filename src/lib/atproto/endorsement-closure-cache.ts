/**
 * Module-level invalidation token for the endorsement-graph closure
 * (certified-app #84).
 *
 * The closure is fetched inside `useExploreData` when the active
 * filter is endorsement-based. When the viewer issues or revokes
 * an endorsement (or accepts/rejects one they've received), the
 * closure goes stale — every consumer of this hook should re-fetch
 * on next render.
 *
 * Pattern mirrors `invalidateProfileResponses` in
 * `src/hooks/use-profile-responses.ts`: a tiny store with a
 * useSyncExternalStore-backed hook. Bumping the version
 * notifies every subscribed hook in one pass; the hook's
 * effect re-runs because the version is in its dep array.
 *
 * Why module-level and not React context: the mutation flows that
 * need to call this (endorse modal, badge-response handlers, etc.)
 * are deep in component trees with no shared provider above both
 * them AND the explore page. A module store avoids a refactor of
 * the auth/org context just to thread invalidation. It's also the
 * pattern profile-responses already uses for exactly this reason.
 */

let version = 0
const subscribers = new Set<() => void>()

/**
 * Notify every subscriber that the closure result is stale.
 *
 * Callers: any mutation that adds, removes, or changes the
 * accepted-state of a badge.award (whose definition is type
 * "endorsement") in the viewer's reachable subgraph. In practice
 * that's the post-mutation success path of:
 *   - issuing a new endorsement
 *   - revoking an endorsement they issued
 *   - accepting / rejecting an endorsement they received
 *
 * Cheap: just bumps a counter + iterates a Set. Safe to call
 * from any thread; no in-flight cancellation here — the effect
 * re-running cancels the prior request via its AbortController.
 */
export function invalidateEndorsementClosure(): void {
  version++
  for (const s of subscribers) s()
}

/** For tests: snapshot the current version. */
export function _peekClosureCacheVersion(): number {
  return version
}

/**
 * Subscribe-style API consumed by the React hook. Exposed for
 * `useEndorsementClosureCacheVersion` in `use-explore.ts`. Don't
 * call from non-React code — use `invalidateEndorsementClosure`
 * to signal a mutation instead.
 */
export function subscribeClosureCacheVersion(cb: () => void): () => void {
  subscribers.add(cb)
  return () => {
    subscribers.delete(cb)
  }
}

export function getClosureCacheVersionSnapshot(): number {
  return version
}
