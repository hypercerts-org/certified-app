"use client"

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react"
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
import { fetchGivenEndorsementDids } from "@/lib/atproto/badges"
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
interface EndorsementClosureMeta {
  closureByDid: Map<string, EndorsementClosureAccount>
  truncated: boolean
  degree: 1 | 2 | 3
  warming: boolean
}

interface ExploreData {
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
  const { activeOrg, groups } = useOrg()
  // "My X" — records OWNED by the current identity. Switches with the
  // org context: a group admin browsing while acting as the group
  // should see the group's records here.
  const viewerDid = activeOrg?.groupDid ?? personalDid
  // "Accounts I follow" — the human's social graph. Stays anchored on
  // the personal DID even when acting as a group, because follows are
  // a per-human relationship (mirrors bsky/twitter semantics) and
  // groups typically don't maintain their own follow lists. If we read
  // the group's follows when acting-as, the filter goes empty for
  // most admins.
  const { subjects: followedDids } = useFollowing(personalDid)
  // "My organizations" — DIDs of every group the human belongs to.
  // Always personal-scoped (membership is a human relationship).
  // Memoized on the groups array reference so the effect below
  // doesn't re-fire on every org-context render.
  const myGroupDids = useMemo(
    () => new Set(groups.map((g) => g.groupDid)),
    [groups],
  )

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
          myGroupDids,
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
  }, [
    kind,
    filter,
    sub,
    search,
    viewerDid,
    followedDids,
    myGroupDids,
    degree,
    closureVersion,
  ])

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
            myGroupDids,
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
  }, [
    kind,
    filter,
    sub,
    search,
    viewerDid,
    followedDids,
    myGroupDids,
    degree,
    closureVersion,
  ])

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
  myGroupDids: Set<string>
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
  const {
    filter,
    sub,
    search,
    viewerDid,
    followedDids,
    myGroupDids,
    cursor,
    signal,
    degree,
  } = args

  // Filters that aren't server-backed: short-circuit pagination.
  // The follows / recent / my-groups filters fetch a NetworkActors
  // window (bounded by the indexer's MAX_FIRST = 100) and intersect
  // client-side — accounts outside the most-recently-active top-N
  // drop out (known limitation).
  // The endorsed filter sources its actors directly from the closure
  // response's inline issuer block (magic-indexer #117 returns the
  // denormalised actor profile per closure DID), so it doesn't share
  // the 100-actor cap.
  if (
    filter === "follows" ||
    filter === "endorsed" ||
    filter === "recent" ||
    filter === "my-groups"
  ) {
    if (cursor !== null) return EMPTY_PAGE
    if (filter === "endorsed") {
      if (!viewerDid) return EMPTY_PAGE
      const closureResult = await loadClosure({ viewerDid, degree, signal })
      if (signal?.aborted) return EMPTY_PAGE
      const closureMeta = closureResult.meta
      const orgDids =
        sub !== "all" ? await getOrgDids() : new Set<string>()
      if (signal?.aborted) return EMPTY_PAGE
      // Build the actor list directly from the closure's inline
      // issuer block — magic-indexer #117 perf follow-up returns a
      // denormalised actor profile per closure DID, so we do NOT
      // need a second round-trip to fetchNetworkActors. (Previous
      // version paginated up to 10×100 = 1000 actors sequentially
      // and silently dropped any closure DID outside that window;
      // degree-2/3 closures regularly exceeded it.)
      let scoped: NetworkActor[] = []
      if (closureMeta && closureMeta.closureByDid.size > 0) {
        scoped = Array.from(closureMeta.closureByDid.values()).map(
          actorFromClosureAccount,
        )
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
    const [page, orgDids] = await Promise.all([
      fetchNetworkActors({ first: 100, signal: signal ?? undefined }),
      sub !== "all" ? getOrgDids() : Promise.resolve(new Set<string>()),
    ])
    let scoped = page.actors
    if (filter === "follows") {
      if (!viewerDid) return EMPTY_PAGE
      scoped = scoped.filter((a) => followedDids.has(a.did))
    } else if (filter === "my-groups") {
      if (!viewerDid || myGroupDids.size === 0) return EMPTY_PAGE
      scoped = scoped.filter((a) => myGroupDids.has(a.did))
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

// ---------------------------- Profile shaping -------------------------------

/**
 * Map a closure account (DID + degree + via + inline issuer block)
 * to the NetworkActor shape the /explore Account rows consume.
 * Always returns a NetworkActor — when the indexer hasn't yet
 * ingested a profile for the DID (or we're on the PDS BFS fallback,
 * which never has profile data) we hand back a row with null
 * displayName/description/avatar so AccountListRow renders the
 * shortened-DID fallback rather than dropping the row silently.
 *
 * Avatar URL is built from (did, cid) via the certified-app's own
 * /api/xrpc proxy — matches the shape avatarUrlFromUnion emits for
 * the small-image variant in src/lib/atproto/workspace.ts.
 */
function actorFromClosureAccount(account: EndorsementClosureAccount): NetworkActor {
  const issuer = account.issuer
  return {
    did: account.did,
    displayName: issuer.displayName,
    description: issuer.description,
    avatarUrl: issuer.avatarCid
      ? `/api/xrpc/com/atproto/sync/getBlob?did=${encodeURIComponent(account.did)}&cid=${encodeURIComponent(issuer.avatarCid)}`
      : null,
    // The closure-graph endpoint doesn't expose profile createdAt
    // (it only carries the issuer identity block). Leave null — the
    // row renderer falls back gracefully.
    createdAt: null,
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
    // a skeleton, not "no results".
    if (
      err instanceof EndorsementClosureError &&
      err.code === "ENDORSEMENT_GRAPH_WARMING"
    ) {
      return {
        meta: {
          closureByDid: new Map(),
          truncated: false,
          degree,
          warming: true,
        },
      }
    }
    // Any other failure (notably an older indexer deployment that
    // doesn't yet expose the endorsementClosure field) falls through
    // to a client-side BFS fallback below — reads each frontier
    // account's badge.award records straight from their PDS and
    // expands ring-by-ring up to `degree`.
    if (err instanceof EndorsementClosureError) {
      console.warn(
        "[explore] endorsement closure unavailable, falling back to PDS degree-1:",
        err.code ?? err.message,
      )
    } else {
      console.warn(
        "[explore] endorsement closure fetch failed, falling back to PDS degree-1:",
        err,
      )
    }
    try {
      const closureByDid = await clientSideClosureBfs(
        viewerDid,
        degree,
        signal,
      )
      if (signal?.aborted) return { meta: null }
      return {
        meta: {
          closureByDid,
          truncated: false,
          degree,
          warming: false,
        },
      }
    } catch (fallbackErr) {
      if (signal?.aborted) return { meta: null }
      console.warn(
        "[explore] PDS endorsement-closure fallback failed:",
        fallbackErr,
      )
      return { meta: null }
    }
  }
}

/**
 * Client-side bounded BFS over the endorsement graph, sourced from each
 * frontier account's PDS. Each ring fans out one `listRecords` per
 * frontier DID in parallel; the next frontier is just the DIDs
 * discovered at the current degree. Drop-in equivalent of the indexer's
 * `endorsementClosure` query at small scale, used as a fallback when
 * the indexer doesn't expose that field (older deployments).
 *
 * Bookkeeping per spec:
 *   - viewer excluded from the result (loop-back skipped).
 *   - minimum-degree assignment per account (we don't downgrade once
 *     pinned).
 *   - `via` collects every degree-(d−1) predecessor for accounts
 *     pinned at degree d.
 *   - per-DID PDS fetch failures are isolated — one unreachable repo
 *     doesn't poison the rest of the closure.
 */
async function clientSideClosureBfs(
  viewerDid: string,
  degree: 1 | 2 | 3,
  signal: AbortSignal | null,
): Promise<Map<string, EndorsementClosureAccount>> {
  const closureByDid = new Map<string, EndorsementClosureAccount>()
  let frontier: string[] = [viewerDid]

  for (let d: 1 | 2 | 3 = 1; d <= degree; d = (d + 1) as 1 | 2 | 3) {
    if (frontier.length === 0) break
    // Fan out — failures per node degrade to "no outbound edges from
    // this node", not a closure-wide bail.
    const results = await Promise.all(
      frontier.map(async (x) => {
        try {
          return await fetchGivenEndorsementDids(x, signal ?? undefined)
        } catch (err) {
          if (signal?.aborted) throw err
          console.warn(
            "[explore] PDS read failed for",
            x,
            "at degree",
            d,
            "—",
            err instanceof Error ? err.message : err,
          )
          return new Set<string>()
        }
      }),
    )
    if (signal?.aborted)
      return new Map<string, EndorsementClosureAccount>()

    const next: string[] = []
    for (let i = 0; i < frontier.length; i++) {
      const x = frontier[i] // predecessor for accounts discovered this ring
      for (const y of results[i]) {
        if (y === viewerDid) continue
        const existing = closureByDid.get(y)
        if (!existing) {
          // First time we see y → pin it to the current ring. Degree-1
          // accounts have no `via` (the viewer is the implicit
          // predecessor and is excluded from the surface).
          //
          // PDS fallback has no profile data; issuer is did-only.
          // actorFromClosureAccount returns a NetworkActor with null
          // profile fields and AccountListRow renders the
          // shortened-DID fallback. Indexer path returns denormalised
          // profile data inline so handles + display names show.
          closureByDid.set(y, {
            did: y,
            degree: d,
            via: d === 1 ? [] : [x],
            issuer: { did: y, handle: null, displayName: null, description: null, avatarCid: null, pds: null },
          })
          next.push(y)
        } else if (existing.degree === d && d > 1) {
          // Same ring → accumulate predecessor in `via`. Not surfaced
          // in the UI today; kept for parity with the indexer payload
          // so consumers reading `via` see the same shape either way.
          if (!existing.via.includes(x)) existing.via.push(x)
        }
        // existing.degree < d → minimum-degree rule, skip silently.
      }
    }
    frontier = next
  }
  return closureByDid
}
