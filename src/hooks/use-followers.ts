"use client"

import { useCallback, useEffect, useRef, useState } from "react"

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

/**
 * Indexer query — pull every `app.certified.graph.follow` whose
 * `subject` is the given DID. The indexer maintains a partial
 * expression index over `(json->>'subject')` (migration 029) so this
 * is a single round-trip regardless of how many PDSes host followers.
 */
const FOLLOWERS_QUERY = `
query Followers($did: String!, $first: Int!, $after: String) {
  appCertifiedGraphFollow(
    where: { subject: { eq: $did } }
    first: $first
    after: $after
  ) {
    totalCount
    edges { node { uri cid did createdAt } }
    pageInfo { hasNextPage endCursor }
  }
}
`

const INDEXER_PROXY_URL = "/api/indexer"

interface IndexerFollowNode {
  uri: string
  cid: string
  did: string
  createdAt: string
}

interface GraphQLResponse {
  data?: {
    appCertifiedGraphFollow?: {
      totalCount: number | null
      edges: { node: IndexerFollowNode | null }[]
      pageInfo: { hasNextPage: boolean; endCursor: string | null }
    } | null
  } | null
  errors?: { message: string }[]
}

async function fetchFollowersPage(
  did: string,
  cursor: string | null,
  signal: AbortSignal | undefined,
): Promise<{
  nodes: IndexerFollowNode[]
  totalCount: number | null
  hasMore: boolean
  endCursor: string | null
}> {
  const res = await fetch(INDEXER_PROXY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: FOLLOWERS_QUERY,
      variables: { did, first: 100, after: cursor },
    }),
    signal,
  })
  if (!res.ok) {
    throw new Error(`Indexer query failed: ${res.status}`)
  }
  const json = (await res.json()) as GraphQLResponse
  // GraphQL errors come back as 200 with an `errors` array — surface
  // them so transient indexer failures bubble up to the UI instead of
  // looking like an empty follower list.
  if (json.errors && json.errors.length > 0) {
    throw new Error(json.errors[0].message)
  }
  const conn = json.data?.appCertifiedGraphFollow
  if (!conn) {
    return { nodes: [], totalCount: 0, hasMore: false, endCursor: null }
  }
  return {
    nodes: conn.edges.map((e) => e.node).filter((n): n is IndexerFollowNode => !!n),
    totalCount: conn.totalCount,
    hasMore: conn.pageInfo.hasNextPage,
    endCursor: conn.pageInfo.endCursor,
  }
}

const STALE_MS = 5 * 60 * 1000

interface CacheEntry {
  entries: FollowerEntry[]
  totalCount: number | null
  fetchedAt: number
}

const cache = new Map<string, CacheEntry>()

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
  const [entries, setEntries] = useState<FollowerEntry[]>([])
  // Tracks whether the first fetch has resolved at least once; `null`
  // for the count UI means "loading", `0` means "no followers yet".
  const [hasLoaded, setHasLoaded] = useState(false)
  const [isLoading, setIsLoading] = useState(!!did)
  const [error, setError] = useState<string | null>(null)
  const didRef = useRef(did)
  didRef.current = did

  const writeCache = useCallback((targetDid: string, next: FollowerEntry[]) => {
    cache.set(targetDid, {
      entries: next,
      totalCount: next.length,
      fetchedAt: Date.now(),
    })
  }, [])

  const doFetch = useCallback(
    async (targetDid: string | null, signal?: AbortSignal, force = false) => {
      if (!targetDid) {
        setEntries([])
        setHasLoaded(false)
        setIsLoading(false)
        setError(null)
        return
      }
      if (!force) {
        const cached = cache.get(targetDid)
        if (cached && Date.now() - cached.fetchedAt < STALE_MS) {
          setEntries(cached.entries)
          setHasLoaded(true)
          setIsLoading(false)
          return
        }
      }
      setIsLoading(true)
      setError(null)
      try {
        const collected: IndexerFollowNode[] = []
        let cursor: string | null = null
        // Safety cap — same as the endorsements scanner.
        while (collected.length < 10_000) {
          const page = await fetchFollowersPage(targetDid, cursor, signal)
          if (signal?.aborted) return
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
        writeCache(targetDid, deduped)
        setEntries(deduped)
        setHasLoaded(true)
      } catch (err) {
        if (signal?.aborted) return
        // Don't cache the failure — a transient indexer hiccup
        // shouldn't lock the UI into an empty follower list until
        // the stale window expires. Next mount / refetch will retry.
        setEntries([])
        setHasLoaded(false)
        setError(err instanceof Error ? err.message : "Failed to load followers")
      } finally {
        if (!signal?.aborted) setIsLoading(false)
      }
    },
    [writeCache],
  )

  useEffect(() => {
    const controller = new AbortController()
    doFetch(did, controller.signal)
    return () => controller.abort()
  }, [did, doFetch])

  const refetch = useCallback(async () => {
    const targetDid = didRef.current
    if (!targetDid) return
    cache.delete(targetDid)
    await doFetch(targetDid, undefined, true)
  }, [doFetch])

  // Optimistic insert — the Follow button calls this with the new
  // record's URI/CID so the list and count update instantly. Idempotent:
  // re-adding the same follower is a no-op. The module-level cache is
  // updated too so a re-mount inside the stale window sees the new
  // entry instead of snapping back to the pre-write data.
  const addFollower = useCallback(
    (followerDid: string, uri: string, cid: string) => {
      const targetDid = didRef.current
      if (!targetDid) return
      const entry: FollowerEntry = {
        uri,
        cid,
        followerDid,
        createdAt: new Date().toISOString(),
      }
      setEntries((prev) => {
        if (prev.some((e) => e.followerDid === followerDid)) return prev
        const next = [entry, ...prev]
        writeCache(targetDid, next)
        return next
      })
      setHasLoaded(true)
    },
    [writeCache],
  )

  // Optimistic delete — same contract as addFollower.
  const removeFollower = useCallback(
    (followerDid: string) => {
      const targetDid = didRef.current
      if (!targetDid) return
      setEntries((prev) => {
        if (!prev.some((e) => e.followerDid === followerDid)) return prev
        const next = prev.filter((e) => e.followerDid !== followerDid)
        writeCache(targetDid, next)
        return next
      })
    },
    [writeCache],
  )

  const count = hasLoaded ? entries.length : null

  return {
    entries,
    count,
    isLoading,
    error,
    refetch,
    addFollower,
    removeFollower,
  }
}
