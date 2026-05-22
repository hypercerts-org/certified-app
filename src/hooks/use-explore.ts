"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  fetchIndexerActivities,
  fetchProjects,
  fetchUserIndexerActivities,
} from "@/lib/atproto/indexer"
import {
  fetchNetworkActors,
  fetchOrganizationDids,
} from "@/lib/atproto/workspace"
import type { NetworkActor } from "@/lib/atproto/workspace"
import type { ActivityRecord } from "@/lib/atproto/activity-types"
import type { CollectionRecord } from "@/lib/atproto/collection"
import { useAuth } from "@/lib/auth/auth-context"
import { useFollowing } from "@/hooks/use-following"
import {
  getRecentlyViewed,
  removeRecentlyViewed,
} from "@/lib/utils/recently-viewed"
import {
  fetchActivitiesByUris,
  fetchProjectsByUris,
} from "@/lib/atproto/records-by-uri"
import type { ExploreKind } from "@/components/explore-page/explore-types"

export interface ExploreData {
  users: NetworkActor[]
  projects: CollectionRecord[]
  certs: ActivityRecord[]
  certDids: Map<string, string>
  isLoading: boolean
  isLoadingMore: boolean
  hasMore: boolean
  loadMore: () => void
}

interface InternalState {
  users: NetworkActor[]
  projects: CollectionRecord[]
  certs: ActivityRecord[]
  certDids: Map<string, string>
  isLoading: boolean
  isLoadingMore: boolean
  hasMore: boolean
  cursor: string | null
}

const EMPTY: InternalState = {
  users: [],
  projects: [],
  certs: [],
  certDids: new Map(),
  isLoading: false,
  isLoadingMore: false,
  hasMore: false,
  cursor: null,
}

const PAGE_SIZE = 50

// Module-cached org-DID set — small, doesn't change often.
let orgDidsCache: Set<string> | null = null
let orgDidsInflight: Promise<Set<string>> | null = null
function getOrgDids(): Promise<Set<string>> {
  if (orgDidsCache) return Promise.resolve(orgDidsCache)
  if (!orgDidsInflight) {
    orgDidsInflight = fetchOrganizationDids(200)
      .then((set) => {
        orgDidsCache = set
        return set
      })
      .catch((err) => {
        console.warn("[explore] org-dids fetch failed:", err)
        return new Set<string>()
      })
      .finally(() => {
        orgDidsInflight = null
      })
  }
  return orgDidsInflight
}

/**
 * Resolves (kind, filter, sub, search) into the right fetcher and
 * exposes cursor-based pagination via `loadMore`.
 *
 * Pagination model:
 *   - Initial load resets `cursor` and `items` whenever any of
 *     (kind, filter, sub, search, viewerDid, followedDids) change.
 *   - `loadMore()` fetches the next page from the server using the
 *     stored cursor and APPENDS to the current items array.
 *   - `hasMore` reflects the indexer's `pageInfo.hasNextPage`. The
 *     view renders a sentinel + explicit "Load more" button while
 *     `hasMore` is true; the sentinel auto-triggers via
 *     IntersectionObserver, the button is the keyboard fallback.
 *
 * Caveats:
 *   - Client-side filters (recently-viewed, endorsed) don't have
 *     server cursors; they return all matches up-front and
 *     `hasMore` stays false.
 *   - Sort order: the indexer's natural order is sort_at DESC.
 *     Switching to alphabetical / oldest applies only to the
 *     already-loaded set — subsequent pages append at the tail of
 *     the server's order regardless. Acceptable for the early
 *     state; a server-side sort arg is the long-term fix.
 */
export function useExploreData(opts: {
  kind: ExploreKind
  filter: string
  sub: string
  search: string
}): ExploreData {
  const { kind, filter, sub, search } = opts
  const { did: viewerDid } = useAuth()
  const { subjects: followedDids } = useFollowing(viewerDid)

  const [state, setState] = useState<InternalState>(EMPTY)
  // Track the latest controller so loadMore can short-circuit if a
  // fresh filter-change has superseded it mid-fetch.
  const generationRef = useRef(0)

  // Initial fetch — runs on every state-resetting input change.
  useEffect(() => {
    const generation = ++generationRef.current
    const controller = new AbortController()
    setState({ ...EMPTY, isLoading: true })

    async function run() {
      try {
        const page = await loadPage({
          kind,
          filter,
          sub,
          search,
          viewerDid,
          followedDids,
          cursor: null,
          signal: controller.signal,
        })
        if (controller.signal.aborted) return
        if (generation !== generationRef.current) return
        setState({
          ...EMPTY,
          ...page,
          isLoading: false,
        })
      } catch (err) {
        if (controller.signal.aborted) return
        console.warn("[explore] fetch failed:", err)
        if (generation !== generationRef.current) return
        setState({ ...EMPTY, isLoading: false })
      }
    }
    run()
    return () => controller.abort()
  }, [kind, filter, sub, search, viewerDid, followedDids])

  const loadMore = useCallback(() => {
    setState((prev) => {
      if (prev.isLoading || prev.isLoadingMore || !prev.hasMore) return prev
      if (prev.cursor === null) return prev
      const generation = generationRef.current
      const cursor = prev.cursor

      void (async () => {
        try {
          const page = await loadPage({
            kind,
            filter,
            sub,
            search,
            viewerDid,
            followedDids,
            cursor,
            signal: null,
          })
          if (generation !== generationRef.current) return
          setState((current) => {
            // Append new items to the existing arrays without
            // re-introducing duplicates that may have shifted on a
            // server-side concurrent insert.
            const seenCerts = new Set(current.certs.map((c) => c.uri))
            const certs = [
              ...current.certs,
              ...page.certs.filter((c) => !seenCerts.has(c.uri)),
            ]
            const certDids = new Map(current.certDids)
            for (const [uri, did] of page.certDids) certDids.set(uri, did)

            const seenProjects = new Set(current.projects.map((p) => p.uri))
            const projects = [
              ...current.projects,
              ...page.projects.filter((p) => !seenProjects.has(p.uri)),
            ]

            const seenUsers = new Set(current.users.map((u) => u.did))
            const users = [
              ...current.users,
              ...page.users.filter((u) => !seenUsers.has(u.did)),
            ]

            return {
              ...current,
              users,
              projects,
              certs,
              certDids,
              cursor: page.cursor,
              hasMore: page.hasMore,
              isLoadingMore: false,
            }
          })
        } catch (err) {
          if (generation !== generationRef.current) return
          console.warn("[explore] loadMore failed:", err)
          setState((current) => ({ ...current, isLoadingMore: false }))
        }
      })()

      return { ...prev, isLoadingMore: true }
    })
  }, [kind, filter, sub, search, viewerDid, followedDids])

  return {
    users: state.users,
    projects: state.projects,
    certs: state.certs,
    certDids: state.certDids,
    isLoading: state.isLoading,
    isLoadingMore: state.isLoadingMore,
    hasMore: state.hasMore,
    loadMore,
  }
}

// ---------------------------------------------------------------------------
// Page loader — dispatches one fetch for the given (kind, filter, sub, cursor)
// ---------------------------------------------------------------------------

interface LoadedPage {
  users: NetworkActor[]
  projects: CollectionRecord[]
  certs: ActivityRecord[]
  certDids: Map<string, string>
  cursor: string | null
  hasMore: boolean
}

const EMPTY_PAGE: LoadedPage = {
  users: [],
  projects: [],
  certs: [],
  certDids: new Map(),
  cursor: null,
  hasMore: false,
}

async function loadPage(args: {
  kind: ExploreKind
  filter: string
  sub: string
  search: string
  viewerDid: string | null
  followedDids: Set<string>
  cursor: string | null
  signal: AbortSignal | null
}): Promise<LoadedPage> {
  if (args.kind === "accounts") return loadAccountsPage(args)
  if (args.kind === "projects") return loadProjectsPage(args)
  return loadCertsPage(args)
}

// ----------------------------- Accounts --------------------------------

async function loadAccountsPage(args: {
  filter: string
  sub: string
  search: string
  viewerDid: string | null
  followedDids: Set<string>
  cursor: string | null
  signal: AbortSignal | null
}): Promise<LoadedPage> {
  const { filter, sub, search, viewerDid, followedDids, cursor, signal } = args

  // Filters that aren't server-backed: short-circuit pagination.
  if (filter === "follows" || filter === "endorsed" || filter === "recent") {
    if (cursor !== null) return EMPTY_PAGE
    // 500 widens the net for the "recent" filter so recently-viewed
    // profiles that aren't currently in the top-200 active actors
    // still resolve. follows / endorsed filters benefit too — they
    // were never bounded by the 200 cap conceptually.
    const [page, orgDids] = await Promise.all([
      fetchNetworkActors({ first: 500, signal: signal ?? undefined }),
      sub !== "all" ? getOrgDids() : Promise.resolve(new Set<string>()),
    ])
    let scoped = page.actors
    if (filter === "follows") {
      if (!viewerDid) return EMPTY_PAGE
      scoped = scoped.filter((a) => followedDids.has(a.did))
    } else if (filter === "endorsed") {
      return EMPTY_PAGE
    } else if (filter === "recent") {
      const recent = getRecentlyViewed("user")
      const recentSet = new Set(recent)
      scoped = scoped
        .filter((a) => recentSet.has(a.did))
        .sort((a, b) => recent.indexOf(a.did) - recent.indexOf(b.did))
    }
    if (sub === "people") scoped = scoped.filter((a) => !orgDids.has(a.did))
    else if (sub === "organizations")
      scoped = scoped.filter((a) => orgDids.has(a.did))
    if (search.trim().length > 0) {
      const q = search.trim().toLowerCase()
      scoped = scoped.filter(
        (a) =>
          (a.displayName ?? "").toLowerCase().includes(q) ||
          (a.description ?? "").toLowerCase().includes(q) ||
          a.did.includes(q),
      )
    }
    return { ...EMPTY_PAGE, users: scoped }
  }

  // "all" / "new" — server-backed; paginate via NetworkActors.
  const [page, orgDids] = await Promise.all([
    fetchNetworkActors({
      first: PAGE_SIZE,
      after: cursor,
      signal: signal ?? undefined,
    }),
    sub !== "all" ? getOrgDids() : Promise.resolve(new Set<string>()),
  ])
  let actors = page.actors
  if (sub === "people") actors = actors.filter((a) => !orgDids.has(a.did))
  else if (sub === "organizations")
    actors = actors.filter((a) => orgDids.has(a.did))
  if (search.trim().length > 0) {
    const q = search.trim().toLowerCase()
    actors = actors.filter(
      (a) =>
        (a.displayName ?? "").toLowerCase().includes(q) ||
        (a.description ?? "").toLowerCase().includes(q) ||
        a.did.includes(q),
    )
  }
  return {
    ...EMPTY_PAGE,
    users: actors,
    cursor: page.endCursor,
    hasMore: page.hasMore,
  }
}

// ----------------------------- Projects --------------------------------

async function loadProjectsPage(args: {
  filter: string
  search: string
  viewerDid: string | null
  followedDids: Set<string>
  cursor: string | null
  signal: AbortSignal | null
}): Promise<LoadedPage> {
  const { filter, search, viewerDid, followedDids, cursor, signal } = args

  if (filter === "by-endorsed" || filter === "recent") {
    if (cursor !== null) return EMPTY_PAGE
    if (filter === "by-endorsed") return EMPTY_PAGE
    // recent — URI-keyed fan-out, same pattern as the cert recent
    // filter. See loadCertsPage for the rationale.
    const recent = getRecentlyViewed("project")
    if (recent.length === 0) return EMPTY_PAGE
    const res = await fetchProjectsByUris(recent, signal ?? undefined)
    if (signal?.aborted) return EMPTY_PAGE
    if (res.missing.length > 0) removeRecentlyViewed("project", res.missing)
    const order = new Map(recent.map((u, i) => [u, i] as const))
    const projects = [...res.records].sort(
      (a, b) => (order.get(a.uri) ?? 0) - (order.get(b.uri) ?? 0),
    )
    return { ...EMPTY_PAGE, projects }
  }

  let authors: string[] | undefined
  if (filter === "by-me") {
    if (!viewerDid) return EMPTY_PAGE
    authors = [viewerDid]
  } else if (filter === "by-follows") {
    if (!viewerDid || followedDids.size === 0) return EMPTY_PAGE
    authors = Array.from(followedDids)
  }

  const r = await fetchProjects({
    first: PAGE_SIZE,
    after: cursor ?? undefined,
    authors,
    search: search || undefined,
    signal: signal ?? undefined,
  })
  return {
    ...EMPTY_PAGE,
    projects: r.records,
    cursor: r.endCursor,
    hasMore: r.hasMore,
  }
}

// ----------------------------- Certs -----------------------------------

async function loadCertsPage(args: {
  filter: string
  sub: string
  search: string
  viewerDid: string | null
  followedDids: Set<string>
  cursor: string | null
  signal: AbortSignal | null
}): Promise<LoadedPage> {
  const { filter, sub, search, viewerDid, followedDids, cursor, signal } = args

  // Sub-category overrides — pinned to viewer.
  if (sub === "created" && viewerDid) {
    const r = await fetchUserIndexerActivities(viewerDid, {
      mode: "authored",
      first: PAGE_SIZE,
      after: cursor ?? undefined,
      search: search || undefined,
      signal: signal ?? undefined,
    })
    return {
      ...EMPTY_PAGE,
      certs: r.records,
      certDids: r.dids,
      cursor: r.endCursor,
      hasMore: r.hasMore,
    }
  }
  if (sub === "contributed" && viewerDid) {
    const r = await fetchUserIndexerActivities(viewerDid, {
      mode: "contributed",
      first: PAGE_SIZE,
      after: cursor ?? undefined,
      search: search || undefined,
      signal: signal ?? undefined,
    })
    return {
      ...EMPTY_PAGE,
      certs: r.records,
      certDids: r.dids,
      cursor: r.endCursor,
      hasMore: r.hasMore,
    }
  }

  if (filter === "by-endorsed") {
    // Not yet implemented — surface an empty list rather than
    // crashing. Wire up once the indexer exposes an endorsed-by-DID
    // filter on activity records.
    return EMPTY_PAGE
  }
  if (filter === "recent") {
    if (cursor !== null) return EMPTY_PAGE
    const recent = getRecentlyViewed("cert")
    if (recent.length === 0) return EMPTY_PAGE
    // URI-keyed fan-out so we resolve any cert in the cache, not just
    // ones that happen to fall inside the indexer's last-100-newest
    // window. 404s are pruned from the cache so dead entries don't
    // keep re-triggering futile lookups on every page load.
    const res = await fetchActivitiesByUris(recent, signal ?? undefined)
    if (signal?.aborted) return EMPTY_PAGE
    if (res.missing.length > 0) removeRecentlyViewed("cert", res.missing)
    // Restore the user's visit order — the cache holds it (newest
    // first), the parallel fetches don't guarantee response order.
    const order = new Map(recent.map((u, i) => [u, i] as const))
    const certs = [...res.records].sort(
      (a, b) => (order.get(a.uri) ?? 0) - (order.get(b.uri) ?? 0),
    )
    return { ...EMPTY_PAGE, certs, certDids: res.dids }
  }

  let authors: string[] | undefined
  if (filter === "by-me") {
    if (!viewerDid) return EMPTY_PAGE
    authors = [viewerDid]
  } else if (filter === "by-follows") {
    if (!viewerDid || followedDids.size === 0) return EMPTY_PAGE
    authors = Array.from(followedDids)
  }

  const r = await fetchIndexerActivities({
    first: PAGE_SIZE,
    after: cursor ?? undefined,
    authors,
    search: search || undefined,
    signal: signal ?? undefined,
  })
  return {
    ...EMPTY_PAGE,
    certs: r.records,
    certDids: r.dids,
    cursor: r.endCursor,
    hasMore: r.hasMore,
  }
}
