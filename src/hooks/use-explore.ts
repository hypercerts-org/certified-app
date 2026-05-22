"use client"

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react"
import {
  fetchEndorsementClosure,
  fetchIndexerActivities,
  fetchProjects,
  fetchUserIndexerActivities,
  EndorsementClosureError,
  type EndorsementClosureAccount,
} from "@/lib/atproto/indexer"
import {
  subscribeClosureCacheVersion,
  getClosureCacheVersionSnapshot,
} from "@/lib/atproto/endorsement-closure-cache"
import {
  fetchNetworkActors,
  fetchOrganizationDids,
} from "@/lib/atproto/workspace"
import type { NetworkActor } from "@/lib/atproto/workspace"
import type { ActivityRecord } from "@/lib/atproto/activity-types"
import type { CollectionRecord } from "@/lib/atproto/collection"
import { useAuth } from "@/lib/auth/auth-context"
import { useOrg } from "@/lib/groups/org-context"
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

/**
 * Endorsement-graph closure metadata carried alongside an explore
 * result when the user picked the "Endorsed users" / "I endorsed"
 * filter (certified-app #84 + magic-indexer #117).
 *
 *   - `closureByDid`: per-DID degree + immediate-predecessor list.
 *     Lookup key is the account DID (for the Accounts kind) or the
 *     project / cert AUTHOR DID (for Projects / Certs). Empty when
 *     the active filter isn't endorsement-based.
 *   - `truncated`: indexer hit the per-viewer cap. UI shows a
 *     "showing a subset of your trust graph" notice.
 *   - `degree`: the depth the closure was fetched at — echoed back
 *     so the chip / segmented control can render against the right
 *     state without a second source of truth.
 *   - `warming`: indexer's refresh worker hasn't completed its first
 *     pass. Surface as a transient loading state (don't crash, don't
 *     show empty-state copy). Cleared on the next successful fetch.
 */
export interface EndorsementClosureMeta {
  closureByDid: Map<string, EndorsementClosureAccount>
  truncated: boolean
  degree: 1 | 2 | 3
  warming: boolean
}

export interface ExploreData {
  users: NetworkActor[]
  projects: CollectionRecord[]
  certs: ActivityRecord[]
  certDids: Map<string, string>
  isLoading: boolean
  isLoadingMore: boolean
  hasMore: boolean
  loadMore: () => void
  /** Non-null only when the active filter is endorsement-based. */
  endorsementClosure: EndorsementClosureMeta | null
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
  endorsementClosure: EndorsementClosureMeta | null
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
  endorsementClosure: null,
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
  /** Endorsement-graph depth, ∈ {1, 2, 3}. Only consulted when the
   *  active filter is endorsement-based (Accounts/"endorsed",
   *  Projects/"by-endorsed", Certs/"by-endorsed"). Defaults to 1. */
  degree?: 1 | 2 | 3
}): ExploreData {
  const { kind, filter, sub, search } = opts
  const degree: 1 | 2 | 3 = opts.degree ?? 1
  const { did: personalDid } = useAuth()
  const { activeOrg } = useOrg()
  // When the user is acting as a group, "by-me" + "by-follows" should
  // operate on the group's identity, not the personal one — otherwise
  // a group admin sees an empty "My projects" / "My certs" because
  // the org's records live on the group DID. Same logic for follows:
  // the group's own follow graph drives "Users I follow".
  const viewerDid = activeOrg?.groupDid ?? personalDid
  const { subjects: followedDids } = useFollowing(viewerDid)

  // Subscribe to the closure-cache invalidation token. When an
  // endorsement mutation calls invalidateEndorsementClosure() the
  // version bumps; we put it in the effect deps so the closure
  // refetches without anyone having to drill an explicit prop down
  // through the explore page. Mirrors the pattern in
  // use-profile-responses.
  const closureVersion = useSyncExternalStore(
    subscribeClosureCacheVersion,
    getClosureCacheVersionSnapshot,
    getClosureCacheVersionSnapshot,
  )

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
          degree,
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
  }, [kind, filter, sub, search, viewerDid, followedDids, degree, closureVersion])

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
            degree,
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
  }, [kind, filter, sub, search, viewerDid, followedDids, degree, closureVersion])

  return {
    users: state.users,
    projects: state.projects,
    certs: state.certs,
    certDids: state.certDids,
    isLoading: state.isLoading,
    isLoadingMore: state.isLoadingMore,
    hasMore: state.hasMore,
    loadMore,
    endorsementClosure: state.endorsementClosure,
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
  /** Set when the loader actually fetched a closure; null otherwise.
   *  The hook hoists this into InternalState.endorsementClosure so
   *  downstream rendering can decorate rows + show the truncated /
   *  warming notices. */
  endorsementClosure?: EndorsementClosureMeta | null
}

const EMPTY_PAGE: LoadedPage = {
  users: [],
  projects: [],
  certs: [],
  certDids: new Map(),
  cursor: null,
  hasMore: false,
  endorsementClosure: null,
}

interface LoadArgs {
  kind: ExploreKind
  filter: string
  sub: string
  search: string
  viewerDid: string | null
  followedDids: Set<string>
  cursor: string | null
  signal: AbortSignal | null
  degree: 1 | 2 | 3
}

async function loadPage(args: LoadArgs): Promise<LoadedPage> {
  if (args.kind === "accounts") return loadAccountsPage(args)
  if (args.kind === "projects") return loadProjectsPage(args)
  return loadCertsPage(args)
}

// ----------------------------- Accounts --------------------------------

async function loadAccountsPage(args: LoadArgs): Promise<LoadedPage> {
  const { filter, sub, search, viewerDid, followedDids, cursor, signal, degree } = args

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
    let closureMeta: EndorsementClosureMeta | null = null
    if (filter === "follows") {
      if (!viewerDid) return EMPTY_PAGE
      scoped = scoped.filter((a) => followedDids.has(a.did))
    } else if (filter === "endorsed") {
      // Endorsement-graph closure (magic-indexer #117). Fetch DIDs
      // within `degree` hops, intersect with NetworkActors so we
      // only show accounts the indexer has profile records for —
      // the closure can include DIDs whose profiles aren't yet
      // ingested, and showing a row with just a DID is worse UX
      // than just dropping it.
      if (!viewerDid) return EMPTY_PAGE
      const closureResult = await loadClosure({ viewerDid, degree, signal })
      if (signal?.aborted) return EMPTY_PAGE
      closureMeta = closureResult.meta
      if (closureResult.meta && closureResult.meta.closureByDid.size > 0) {
        const closureDids = closureResult.meta.closureByDid
        scoped = scoped.filter((a) => closureDids.has(a.did))
      } else {
        scoped = []
      }
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
    return { ...EMPTY_PAGE, users: scoped, endorsementClosure: closureMeta }
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

async function loadProjectsPage(args: LoadArgs): Promise<LoadedPage> {
  const { filter, search, viewerDid, followedDids, cursor, signal, degree } = args

  if (filter === "by-endorsed") {
    if (cursor !== null) return EMPTY_PAGE
    if (!viewerDid) return EMPTY_PAGE
    const closureResult = await loadClosure({ viewerDid, degree, signal })
    if (signal?.aborted) return EMPTY_PAGE
    const closureMeta = closureResult.meta
    if (!closureMeta || closureMeta.closureByDid.size === 0) {
      return { ...EMPTY_PAGE, endorsementClosure: closureMeta }
    }
    const authors = Array.from(closureMeta.closureByDid.keys())
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
      endorsementClosure: closureMeta,
    }
  }

  if (filter === "recent") {
    if (cursor !== null) return EMPTY_PAGE
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

async function loadCertsPage(args: LoadArgs): Promise<LoadedPage> {
  const { filter, sub, search, viewerDid, followedDids, cursor, signal, degree } = args

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
    if (cursor !== null) return EMPTY_PAGE
    if (!viewerDid) return EMPTY_PAGE
    // Compute the closure once for this filter activation, then pass
    // its DIDs into the existing Activities-by-author indexer query.
    // The per-author cert metadata + cursor pagination ride the
    // existing fetchIndexerActivities path; only the seed-set changes.
    const closureResult = await loadClosure({ viewerDid, degree, signal })
    if (signal?.aborted) return EMPTY_PAGE
    const closureMeta = closureResult.meta
    if (!closureMeta || closureMeta.closureByDid.size === 0) {
      return { ...EMPTY_PAGE, endorsementClosure: closureMeta }
    }
    const authors = Array.from(closureMeta.closureByDid.keys())
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
      endorsementClosure: closureMeta,
    }
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

// ---------------------------- Endorsement closure ---------------------------

interface ClosureFetchResult {
  /** Meta — null if the viewer is unauthenticated; warming-loaded if
   *  the indexer is still doing its first refresh; otherwise the
   *  populated closure. Callers that observe `warming: true` should
   *  show a loading skeleton, not an empty state. */
  meta: EndorsementClosureMeta | null
}

async function loadClosure(opts: {
  viewerDid: string
  degree: 1 | 2 | 3
  signal: AbortSignal | null
}): Promise<ClosureFetchResult> {
  const { viewerDid, degree, signal } = opts
  try {
    const closure = await fetchEndorsementClosure(
      viewerDid,
      degree,
      signal ?? undefined,
    )
    const closureByDid = new Map<string, EndorsementClosureAccount>()
    for (const account of closure.accounts) {
      closureByDid.set(account.did, account)
    }
    return {
      meta: {
        closureByDid,
        truncated: closure.truncated,
        degree,
        warming: false,
      },
    }
  } catch (err) {
    if (signal?.aborted) return { meta: null }
    // ENDORSEMENT_GRAPH_WARMING is a transient state during the
    // indexer's first refresh — surface as warming so the UI shows
    // a skeleton, not "no results". Other coded errors (invalid
    // viewer / disabled feature) are user-facing config bugs; log
    // and return null so the surface shows the empty state with
    // a debugger-friendly console line.
    if (err instanceof EndorsementClosureError) {
      if (err.code === "ENDORSEMENT_GRAPH_WARMING") {
        return {
          meta: {
            closureByDid: new Map(),
            truncated: false,
            degree,
            warming: true,
          },
        }
      }
      console.warn("[explore] endorsement closure error:", err.code, err.message)
      return { meta: null }
    }
    console.warn("[explore] endorsement closure fetch failed:", err)
    return { meta: null }
  }
}
