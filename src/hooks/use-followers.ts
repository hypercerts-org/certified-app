"use client"

import { useCallback } from "react"
import { postIndexer } from "@/lib/atproto/indexer"
import { createCachedDidResource } from "@/hooks/create-cached-did-resource"

/**
 * One follow record targeting a profile: who follows them, when, and
 * the rkey on the follower's PDS (so the viewer can recognise their
 * own row in the list).
 */
export interface FollowerEntry {
  /** AT-URI of the follow record on the follower's PDS. */
  uri: string
  /** CID of the follow record. */
  cid: string
  /** DID of the follower (= author of the follow record). */
  followerDid: string
  /** ISO timestamp from the follow record. */
  createdAt: string
}

interface IndexerFollowNode {
  uri: string
  cid: string
  did: string
  createdAt: string
}

interface FollowersData {
  appCertifiedGraphFollow?: {
    totalCount: number | null
    edges: { node: IndexerFollowNode | null }[]
    pageInfo: { hasNextPage: boolean; endCursor: string | null }
  } | null
}

/**
 * Indexer query — pull every `app.certified.graph.follow` whose
 * `subject` is the given DID. The indexer maintains a partial
 * expression index over `(json->>'subject')` (migration 029) so this
 * is a single round-trip regardless of how many PDSes host followers.
 *
 * Query string lives server-side in `OPERATIONS.Followers`
 * (`src/app/api/indexer/route.ts`); the client only sends
 * `{ operationName, variables }` per the indexer proxy's trust model.
 */
async function fetchFollowersPage(
  did: string,
  cursor: string | null,
): Promise<{
  nodes: IndexerFollowNode[]
  hasMore: boolean
  endCursor: string | null
}> {
  const result = await postIndexer<FollowersData>("Followers", {
    did,
    first: 100,
    after: cursor,
  })
  if (!result.ok) {
    throw new Error(`Indexer query failed: ${result.status}`)
  }
  // GraphQL errors come back as 200 with an `errors` array — surface
  // them so transient indexer failures bubble up to the UI instead of
  // looking like an empty follower list.
  if (result.errors.length > 0) {
    throw new Error(result.errors[0].message)
  }
  const conn = result.data?.appCertifiedGraphFollow
  if (!conn) {
    return { nodes: [], hasMore: false, endCursor: null }
  }
  return {
    nodes: conn.edges.map((e) => e.node).filter((n): n is IndexerFollowNode => !!n),
    hasMore: conn.pageInfo.hasNextPage,
    endCursor: conn.pageInfo.endCursor,
  }
}

const STALE_MS = 5 * 60 * 1000

/** Full follower walk for one DID. Runs inside the shared (singleflight)
 *  promise so every waiting hook instance receives the deduped list. */
async function fetchAllFollowers(targetDid: string): Promise<FollowerEntry[]> {
  const collected: IndexerFollowNode[] = []
  let cursor: string | null = null
  // Safety cap — same as the endorsements scanner.
  while (collected.length < 10_000) {
    const page = await fetchFollowersPage(targetDid, cursor)
    collected.push(...page.nodes)
    if (!page.hasMore || !page.endCursor) break
    cursor = page.endCursor
  }
  // Dedupe by follower DID — keep the most recent follow record
  // per follower. The indexer returns one row per follow record
  // (and the PDS happily accepts duplicate writes), so a viewer
  // who tapped Follow → Unfollow → Follow (or whose old record
  // wasn't cleared after re-following) would otherwise show up
  // twice in the list AND inflate the count. We sort first so
  // the kept entry is the newest, then dedupe.
  const sorted = collected
    .map<FollowerEntry>((n) => ({
      uri: n.uri,
      cid: n.cid,
      followerDid: n.did,
      createdAt: n.createdAt,
    }))
    .sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1))
  const seen = new Set<string>()
  const deduped: FollowerEntry[] = []
  for (const e of sorted) {
    if (seen.has(e.followerDid)) continue
    seen.add(e.followerDid)
    deduped.push(e)
  }
  return deduped
}

const useFollowersResource = createCachedDidResource<FollowerEntry[]>({
  staleMs: STALE_MS,
  fetch: (did) => fetchAllFollowers(did),
  // Don't cache or retain the failure — a transient indexer hiccup
  // shouldn't lock the UI into an empty follower list until the stale
  // window expires; count returns to null ("loading") and the next
  // mount / refetch retries.
  onError: "reset",
  errorFallback: "Failed to load followers",
})

// Stable empty list so consumers using `entries` as a memo/effect dep
// don't churn while the first fetch is in flight.
const NO_ENTRIES: FollowerEntry[] = []

/**
 * Read every follower of `did` via the indexer. Returns:
 *   - `entries`    — one row per follower (newest first).
 *   - `count`      — distinct-follower count derived from `entries`
 *                    so optimistic adds/removes flow through both
 *                    surfaces in lock-step. `null` only during
 *                    initial load.
 *   - `isLoading`  — true while the first page is in flight.
 *   - `error`      — non-null when the indexer query fails. UIs
 *                    typically surface it next to an empty state so
 *                    the viewer knows the count couldn't be loaded
 *                    rather than seeing "0 followers" silently.
 *   - `refetch`    — bypass cache and re-page.
 *   - `addFollower`/`removeFollower` — optimistic mutators called by
 *                    the Follow button so the count + list update
 *                    instantly without waiting for the indexer to
 *                    re-ingest the new record.
 */
export function useFollowers(did: string | null): {
  entries: FollowerEntry[]
  count: number | null
  isLoading: boolean
  error: string | null
  refetch: () => Promise<void>
  addFollower: (followerDid: string, uri: string, cid: string) => void
  removeFollower: (followerDid: string) => void
} {
  const { data, isLoading, error, refetch, mutate } = useFollowersResource(did)

  // Optimistic insert — the Follow button calls this with the new
  // record's URI/CID so the list and count update instantly. Idempotent:
  // re-adding the same follower is a no-op. The module-level cache is
  // updated too so a re-mount inside the stale window sees the new
  // entry instead of snapping back to the pre-write data.
  const addFollower = useCallback(
    (followerDid: string, uri: string, cid: string) => {
      mutate((prev) => {
        const current = prev ?? []
        if (current.some((e) => e.followerDid === followerDid)) return prev
        const entry: FollowerEntry = {
          uri,
          cid,
          followerDid,
          createdAt: new Date().toISOString(),
        }
        return [entry, ...current]
      })
    },
    [mutate],
  )

  // Optimistic delete — same contract as addFollower.
  const removeFollower = useCallback(
    (followerDid: string) => {
      mutate((prev) => {
        if (!prev || !prev.some((e) => e.followerDid === followerDid)) {
          return prev
        }
        return prev.filter((e) => e.followerDid !== followerDid)
      })
    },
    [mutate],
  )

  return {
    entries: data ?? NO_ENTRIES,
    // `null` means "not loaded yet" so the count UI shows a loading
    // state; `0` means "no followers yet".
    count: data ? data.length : null,
    isLoading,
    error,
    refetch,
    addFollower,
    removeFollower,
  }
}
