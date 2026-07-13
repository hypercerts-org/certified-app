import {
  fetchEndorsementClosure,
  fetchFundingReceipts,
  fetchIndexerActivities,
  fetchIndexerActivitiesByUris,
  fetchIndexerProjectsByUris,
  fetchProjects,
  fetchUserIndexerActivities,
  EndorsementClosureError,
  type EndorsementClosureAccount,
  type FundingReceipt,
} from "@/lib/atproto/indexer"
import {
  fetchNetworkActors,
  fetchNetworkActorsByDids,
  fetchDidsByKindInSet,
} from "@/lib/atproto/workspace"
import type { NetworkActor } from "@/lib/atproto/workspace"
import type { ActivityRecord } from "@/lib/atproto/activity-types"
import type { CollectionRecord } from "@/lib/atproto/collection"
import { fetchGivenEndorsementDids } from "@/lib/atproto/badges"
import {
  getRecentlyViewed,
  removeRecentlyViewed,
} from "@/lib/utils/recently-viewed"
import {
  fetchActivitiesByUris,
  fetchProjectsByUris,
} from "@/lib/atproto/records-by-uri"
import {
  MA_EARTH_COLLECTIONS,
  MA_EARTH_FILTER,
} from "@/lib/atproto/featured"
import type { CollectionItem } from "@/lib/atproto/collection"
import { parseAtUri } from "@/lib/atproto/activity-uri"
import { authFetch } from "@/lib/auth/fetch"
import type { ExploreKind } from "@/components/explore-page/explore-types"

/**
 * Coerce a possibly-empty org-label tier list into the indexer's
 * `authorLabels` / `excludeAuthorLabels` arg shape: a fresh array when
 * non-empty, else `undefined` (the connection treats an absent arg as "no
 * filter"). Every indexer-backed load branch derives its label args this
 * way; the per-DID / getRecord branches ignore labels by design.
 */
function toLabelArg(
  labels: readonly string[] | null | undefined,
): string[] | undefined {
  return labels && labels.length > 0 ? [...labels] : undefined
}

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

export const PAGE_SIZE = 50

/**
 * Translate the People/Organizations/All sub-toggle into the
 * `isOrganization` server-side filter on `fetchNetworkActors`
 * (see certified-app#107 / magic-indexer#145).
 *
 *   - "people"        → isOrganization: false
 *   - "organizations" → isOrganization: true
 *   - anything else   → undefined (no filter, full mixed list)
 *
 * Replaces the previous client-side intersect against the first
 * 200 org DIDs, which silently mis-classified orgs past the first
 * page and broke People-pane pagination. `totalCount` / `hasMore`
 * now reflect the per-kind count, so "Load more" pages correctly.
 */
function subToIsOrganization(sub: string): boolean | undefined {
  if (sub === "people") return false
  if (sub === "organizations") return true
  return undefined
}

// ---------------------------------------------------------------------------
// Page loader — dispatches one fetch for the given (kind, filter, sub, cursor)
// ---------------------------------------------------------------------------

export interface LoadedPage {
  users: NetworkActor[]
  projects: CollectionRecord[]
  certs: ActivityRecord[]
  certDids: Map<string, string>
  fundingReceipts: FundingReceipt[]
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
  fundingReceipts: [],
  cursor: null,
  hasMore: false,
  endorsementClosure: null,
}

export interface LoadArgs {
  kind: ExploreKind
  filter: string
  sub: string
  search: string
  viewerDid: string | null
  followedDids: Set<string>
  myGroupDids: Set<string>
  /** Full metadata for the viewer's groups, in display order. Drives the
   *  "My organizations" filter: every group renders (and hydrates per-row),
   *  not just the ones the indexer has an actor profile for. */
  myGroups: readonly {
    groupDid: string
    displayName?: string
    avatarUrl?: string
  }[]
  /** Author DIDs for the "My projects" / "My activities" filters:
   *  the viewer + every group they own/admin (personal context), or just
   *  the active group (acting-as). */
  managedAuthorDids: string[]
  cursor: string | null
  signal: AbortSignal | null
  /** Page size for the server-paginated branches (the default "all"-style
   *  listings + funding). PAGE_SIZE normally; the All view's capped blocks
   *  pass a small size. The client-side-filtered (follows / recent) and
   *  URI-keyed (featured / recently-viewed) branches keep their own fixed
   *  windows — trimming those would break their client-side intersects. */
  pageSize: number
  degree: 1 | 2 | 3
  /** True when the active filter consumes the endorsement-graph
   *  closure and the user has deselected every ring. The loader
   *  short-circuits to an empty page in that state instead of
   *  defaulting back to degree=1. */
  noEndorsementRings: boolean
  /** Forwarded to `fetchIndexerActivities` when loading the certs
   *  page; null on other kinds. */
  excludeCertLabels: readonly string[] | null
  includeCertLabels: readonly string[] | null
  /** Org-tier exclusions. Used by the accounts + certs loaders;
   *  no-op when null. */
  excludeOrgLabels: readonly string[] | null
  includeOrgLabels: readonly string[] | null
  /** Funding kind only — third-party-attestor DID filter, or null. */
  confirmedBy: string | null
}

export async function loadPage(args: LoadArgs): Promise<LoadedPage> {
  // Funding has no label / endorsement / sub filters — dispatch before
  // the cert/project label short-circuits below (which don't apply).
  if (args.kind === "funding") return loadFundingPage(args)
  // Explicit-empty "include" filter = the user deselected every
  // option in that filter's popover. The indexer's HTTP proxy
  // normalises empty arrays to `null` (i.e. "no filter"), which would
  // silently show every record — masking what should look like an
  // empty result set. Short-circuit at the loader level so deselecting
  // all options reads as "nothing matches", which is the natural
  // affordance for re-adding a selection.
  if (
    (args.kind === "activities" || args.kind === "projects") &&
    isExplicitlyEmpty(args.includeCertLabels)
  ) {
    return EMPTY_PAGE
  }
  if (
    (args.kind === "accounts" || args.kind === "activities") &&
    isExplicitlyEmpty(args.includeOrgLabels)
  ) {
    return EMPTY_PAGE
  }
  // Endorsement-degree multi-select: zero rings selected = "show no
  // endorsement matches" (only applies to endorsement-graph filters).
  if (
    args.noEndorsementRings &&
    (
      (args.kind === "accounts" && args.filter === "endorsed") ||
      ((args.kind === "activities" || args.kind === "projects") &&
        args.filter === "by-endorsed")
    )
  ) {
    return EMPTY_PAGE
  }
  if (args.kind === "accounts") return loadAccountsPage(args)
  if (args.kind === "projects") return loadProjectsPage(args)
  return loadCertsPage(args)
}

function isExplicitlyEmpty(v: readonly string[] | null | undefined): boolean {
  return Array.isArray(v) && v.length === 0
}

/**
 * Fetch a curated set of `org.hypercerts.collection` records and
 * union their `items[]` arrays into a single deduplicated URI list.
 * Used by the Ma Earth featured filter: the curator's 3 collections
 * (per kind) are stored as constants and resolved here in parallel.
 * Collections that 404 or carry a non-array `items` field are
 * skipped silently.
 *
 * Cached in-memory by the (sorted) collection URI tuple. The Ma
 * Earth source collections are slow-changing (curated by hand) and
 * the explore loader hits this path on every filter activation /
 * loadMore on the Ma Earth filter — the cache prevents redundant
 * fan-outs to the PDS for the same URI list across navigations.
 */
const MAX_FEATURED_CACHE_ENTRIES = 8
const featuredItemUrisCache = new Map<string, string[]>()
const featuredItemUrisInflight = new Map<string, Promise<string[]>>()

function setFeaturedCacheEntry(key: string, value: string[]): void {
  if (featuredItemUrisCache.has(key)) featuredItemUrisCache.delete(key)
  featuredItemUrisCache.set(key, value)
  while (featuredItemUrisCache.size > MAX_FEATURED_CACHE_ENTRIES) {
    const oldest = featuredItemUrisCache.keys().next().value
    if (oldest === undefined) break
    featuredItemUrisCache.delete(oldest)
  }
}

async function loadFeaturedItemUris(
  collectionUris: readonly string[],
  signal: AbortSignal | null,
): Promise<string[]> {
  if (collectionUris.length === 0) return []
  const key = [...collectionUris].sort().join("|")
  const cached = featuredItemUrisCache.get(key)
  if (cached) return cached
  // Atomic has/set so racing callers don't each build a promise
  // and leak the loser.
  if (!featuredItemUrisInflight.has(key)) {
    // IMPORTANT: don't pass `signal` to the shared fetch — if the
    // first caller's signal aborts (any useExplore deps churn
    // triggers a fresh AbortController on every effect re-run),
    // every sibling waiting on the same promise would see an empty
    // result and the cache would never populate. The outer caller's
    // own `signal?.aborted` check is what gates the consumer-level
    // result; the underlying fetches run to completion so the cache
    // stays healthy. Symmetric with the H1 fix in useTypedLists.
    const promise = (async () => {
      const fetched = await loadFeaturedItemUrisUncached(collectionUris, null)
      setFeaturedCacheEntry(key, fetched)
      return fetched
    })()
    featuredItemUrisInflight.set(key, promise)
    promise.finally(() => {
      if (featuredItemUrisInflight.get(key) === promise) {
        featuredItemUrisInflight.delete(key)
      }
    })
  }
  return featuredItemUrisInflight.get(key)!
}

async function loadFeaturedItemUrisUncached(
  collectionUris: readonly string[],
  signal: AbortSignal | null,
): Promise<string[]> {
  const responses = await Promise.all(
    collectionUris.map(async (uri) => {
      const parsed = parseAtUri(uri)
      if (!parsed) return null
      const params = new URLSearchParams({
        repo: parsed.did,
        collection: parsed.collection,
        rkey: parsed.rkey,
      })
      try {
        const res = await authFetch(
          `/api/xrpc/com/atproto/repo/getRecord?${params.toString()}`,
          signal ? { signal } : undefined,
        )
        if (!res.ok) return null
        return (await res.json()) as { value?: { items?: unknown } }
      } catch {
        return null
      }
    }),
  )
  if (signal?.aborted) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const r of responses) {
    const items = r?.value?.items
    if (!Array.isArray(items)) continue
    for (const item of items as CollectionItem[]) {
      const uri = item?.itemIdentifier?.uri
      if (typeof uri !== "string" || seen.has(uri)) continue
      seen.add(uri)
      out.push(uri)
    }
  }
  return out
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
    myGroups,
    cursor,
    signal,
    pageSize,
    degree,
    includeOrgLabels,
    excludeOrgLabels,
  } = args

  // Account-quality (orglabeler) include / exclude now filter
  // server-side on the `appCertifiedActorProfile` connection via the
  // `authorLabels` / `excludeAuthorLabels` args (magic-indexer#207).
  // Account-quality labels live on the bare account DID and match
  // both people AND organizations, so the previous "include-mode =
  // orgs only, fetch DIDs from the orgs connection then pull
  // profiles" early branch is gone — the main paginating
  // `fetchNetworkActors` path (with the People/Organizations
  // `isOrganization` sub-toggle) handles include just like any other
  // server-side filter, with no 100-actor cap. These pass straight
  // through to the paginating branch below.
  const authorLabels = toLabelArg(includeOrgLabels)
  const excludeAuthorLabels = toLabelArg(excludeOrgLabels)

  // "My organizations" — resolve the viewer's group DIDs DIRECTLY rather
  // than scanning the most-recently-indexed top-100 actors and
  // client-filtering, which silently dropped any org outside that window
  // (so a user whose orgs weren't recently active saw an empty list).
  // Groups are organizations, so the People sub-toggle yields nothing.
  if (filter === "my-groups") {
    if (cursor !== null) return EMPTY_PAGE
    if (myGroupDids.size === 0) return EMPTY_PAGE
    if (sub === "people") return EMPTY_PAGE
    // Pull the indexed actor profiles, then render a row for EVERY group the
    // viewer belongs to — using the fetched actor when the indexer has one,
    // otherwise a stub built from the group's own metadata so the row still
    // appears and AccountListRow / ExploreUserCard hydrate it per-row via
    // `useAuthorInfo`. Mapping over `myGroups` (not just the fetched set)
    // is what stops orgs without an `app.certified.actor.profile` from being
    // silently dropped.
    const fetched = await fetchNetworkActorsByDids(
      Array.from(myGroupDids),
      signal ?? undefined,
    )
    if (signal?.aborted) return EMPTY_PAGE
    const byDid = new Map(fetched.map((a) => [a.did, a]))
    let scoped: NetworkActor[] = myGroups.map(
      (g) =>
        byDid.get(g.groupDid) ?? {
          did: g.groupDid,
          displayName: g.displayName ?? null,
          description: null,
          avatarUrl: g.avatarUrl ?? null,
          createdAt: null,
        },
    )
    if (search.trim().length > 0) {
      const q = search.trim().toLowerCase()
      scoped = scoped.filter(
        (a) =>
          (a.displayName ?? "").toLowerCase().includes(q) ||
          (a.description ?? "").toLowerCase().includes(q) ||
          a.did.includes(q),
      )
    }
    // No account-quality filter here: "My organizations" is the
    // viewer's own groups (resolved by DID, fetched via
    // fetchNetworkActorsByDids which has no author-label arg). The
    // viewer's own groups are not a quality-curation surface, so the
    // exclude filter is a no-op on this branch by design.
    return { ...EMPTY_PAGE, users: scoped }
  }

  if (filter === MA_EARTH_FILTER) {
    if (cursor !== null) return EMPTY_PAGE
    const itemUris = await loadFeaturedItemUris(
      MA_EARTH_COLLECTIONS.accounts,
      signal,
    )
    if (signal?.aborted) return EMPTY_PAGE
    // Items point at `at://<did>/app.certified.actor.profile/self`;
    // strip out the DID and synthesise NetworkActor stubs that
    // AccountListRow / ExploreUserCard will hydrate per-row from
    // `useAuthorInfo`. No second fetch needed at this layer.
    const dids: string[] = []
    const seen = new Set<string>()
    for (const uri of itemUris) {
      const parsed = parseAtUri(uri)
      if (!parsed || seen.has(parsed.did)) continue
      seen.add(parsed.did)
      dids.push(parsed.did)
    }
    let users: NetworkActor[] = dids.map((did) => ({
      did,
      displayName: null,
      description: null,
      avatarUrl: null,
      createdAt: null,
    }))
    // People/Organizations sub-toggle: the featured set is a fixed
    // list of curator-picked project authors, so we can't use the
    // pagination-time `isOrganization` server filter. Instead query
    // the indexer for the subset of these DIDs whose `isOrganization`
    // projection matches the selected kind, then KEEP only those —
    // no client-side complement. A network failure throws and lands
    // an empty page rather than silently inverting the filter (the
    // older complement approach kept the entire input set when the
    // helper returned 0, swapping People ↔ Organizations visually).
    const kind = subToIsOrganization(sub)
    if (typeof kind === "boolean" && users.length > 0) {
      try {
        const keep = await fetchDidsByKindInSet(
          users.map((u) => u.did),
          kind,
          signal ?? undefined,
        )
        if (signal?.aborted) return EMPTY_PAGE
        users = users.filter((u) => keep.has(u.did))
      } catch {
        return EMPTY_PAGE
      }
    }
    if (search.trim().length > 0) {
      const q = search.trim().toLowerCase()
      users = users.filter((a) => a.did.includes(q))
    }
    // No server-side account-quality filter here: the Featured set is
    // a fixed curator-picked DID list (Ma Earth), already a trusted
    // curation surface, and its actor rows are DID-stubs (no
    // label-filterable connection). The exclude filter is a no-op on
    // this branch by design.
    return { ...EMPTY_PAGE, users }
  }

  // Filters that aren't server-backed: short-circuit pagination.
  // The follows / recent filters fetch a NetworkActors window (bounded by
  // the indexer's MAX_FIRST = 100) and intersect client-side — accounts
  // outside the most-recently-active top-N drop out (known limitation).
  // (my-groups is NOT here: it resolves the viewer's group DIDs directly
  // via fetchNetworkActorsByDids in its own early branch above, so it
  // never hits the top-100 cap.)
  // The endorsed filter sources its actors directly from the closure
  // response's inline issuer block (magic-indexer #117 returns the
  // denormalised actor profile per closure DID), so it doesn't share
  // the 100-actor cap.
  if (
    filter === "follows" ||
    filter === "endorsed" ||
    filter === "recent"
  ) {
    if (cursor !== null) return EMPTY_PAGE
    if (filter === "endorsed") {
      if (!viewerDid) return EMPTY_PAGE
      const closureResult = await loadClosure({ viewerDid, degree, signal })
      if (signal?.aborted) return EMPTY_PAGE
      const closureMeta = closureResult.meta
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
      // People/Organizations sub-toggle: the closure response
      // (magic-indexer #117) carries inline issuer profiles but no
      // `isOrganization` flag, so query the indexer directly for
      // the subset of closure DIDs that match the selected kind,
      // then keep only those. Same shape as the Featured path —
      // no complement, no silent inversion if the call fails.
      const kind = subToIsOrganization(sub)
      if (typeof kind === "boolean" && scoped.length > 0) {
        try {
          const keep = await fetchDidsByKindInSet(
            scoped.map((a) => a.did),
            kind,
            signal ?? undefined,
          )
          if (signal?.aborted) return EMPTY_PAGE
          scoped = scoped.filter((a) => keep.has(a.did))
        } catch {
          return EMPTY_PAGE
        }
      }
      if (search.trim().length > 0) {
        const q = search.trim().toLowerCase()
        scoped = scoped.filter(
          (a) =>
            (a.displayName ?? "").toLowerCase().includes(q) ||
            (a.description ?? "").toLowerCase().includes(q) ||
            a.did.includes(q),
        )
      }
      // No server-side account-quality filter here: the endorsed set
      // comes from the trust-graph closure (the viewer's own
      // endorsement web — already a curation signal), and its rows are
      // built from the closure's inline issuer block, not a
      // label-filterable connection. The exclude filter is a no-op on
      // this branch by design.
      return { ...EMPTY_PAGE, users: scoped, endorsementClosure: closureMeta }
    }
    const page = await fetchNetworkActors({
      first: 100,
      isOrganization: subToIsOrganization(sub),
      authorLabels,
      excludeAuthorLabels,
      signal: signal ?? undefined,
    })
    let scoped = page.actors
    if (filter === "follows") {
      if (!viewerDid) return EMPTY_PAGE
      scoped = scoped.filter((a) => followedDids.has(a.did))
    } else if (filter === "recent") {
      const recent = getRecentlyViewed("user")
      const recentSet = new Set(recent)
      scoped = scoped
        .filter((a) => recentSet.has(a.did))
        .sort((a, b) => recent.indexOf(a.did) - recent.indexOf(b.did))
    }
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
  // People/Organizations sub-toggle goes through the server-side
  // `isOrganization` filter, so the result list paginates over
  // a single kind without the old client-side intersect's silent
  // truncation past the first 200 org DIDs.
  // Search is server-side (indexer typeahead over displayName / handle /
  // description — magic-indexer#204), so matches across the whole network
  // surface on the first page rather than only once Load more pulls a
  // matching page into memory (the old per-page client-side filter bug).
  const page = await fetchNetworkActors({
    first: pageSize,
    after: cursor,
    isOrganization: subToIsOrganization(sub),
    search,
    authorLabels,
    excludeAuthorLabels,
    signal: signal ?? undefined,
  })
  return {
    ...EMPTY_PAGE,
    users: page.actors,
    cursor: page.endCursor,
    hasMore: page.hasMore,
  }
}

// ----------------------------- Projects --------------------------------

async function loadProjectsPage(args: LoadArgs): Promise<LoadedPage> {
  const {
    filter,
    search,
    viewerDid,
    followedDids,
    managedAuthorDids,
    cursor,
    signal,
    pageSize,
    degree,
    includeOrgLabels,
    excludeOrgLabels,
  } = args

  // Account-quality (orglabeler) include / exclude filter server-side
  // on the `orgHypercertsCollection` connection via `authorLabels` /
  // `excludeAuthorLabels` (magic-indexer#207). Only the indexer-backed
  // listing branches (by-endorsed + the default Projects listing) can
  // apply these; the URI-keyed branches (Ma Earth featured, Recently
  // viewed) resolve exact record sets — via the `CollectionsByUris`
  // batch (which carries no label args) or per-URI PDS getRecord — so
  // they ignore the org-quality filter by design.
  const authorLabels = toLabelArg(includeOrgLabels)
  const excludeAuthorLabels = toLabelArg(excludeOrgLabels)

  if (filter === MA_EARTH_FILTER) {
    if (cursor !== null) return EMPTY_PAGE
    const itemUris = await loadFeaturedItemUris(
      MA_EARTH_COLLECTIONS.projects,
      signal,
    )
    if (signal?.aborted) return EMPTY_PAGE
    if (itemUris.length === 0) return EMPTY_PAGE
    // Batch the curated URIs through the indexer (`CollectionsByUris`,
    // 50-URI chunks) instead of fanning out one PDS getRecord per URI —
    // curated sets can carry well over 100 URIs, re-fetched on every
    // filter activation. FAIL-SOFT: the deployed indexer may not
    // support the `uri: { in }` filter on `orgHypercertsCollection`
    // yet, so an HTTP / GraphQL failure — or an all-empty result for
    // URIs the curator says exist — falls back to the per-URI PDS path
    // below. Not-yet-ingested URIs inside an otherwise-successful batch
    // drop silently, matching the certs featured path's accepted
    // tradeoff (see fetchIndexerActivitiesByUris).
    let projects: CollectionRecord[] | null = null
    try {
      const batch = await fetchIndexerProjectsByUris(
        itemUris,
        signal ?? undefined,
      )
      if (batch.ok && batch.records.length > 0) {
        // The indexer returns rows in indexed order; restore the
        // curator's item order (the PDS path preserves it implicitly
        // via the per-URI Promise.all).
        const order = new Map(itemUris.map((u, i) => [u, i] as const))
        projects = [...batch.records].sort(
          (a, b) => (order.get(a.uri) ?? 0) - (order.get(b.uri) ?? 0),
        )
      }
    } catch {
      // Network-level failure (an abort exits via the check below) —
      // fall through to the PDS path.
    }
    if (signal?.aborted) return EMPTY_PAGE
    if (projects === null) {
      const res = await fetchProjectsByUris(itemUris, signal ?? undefined)
      if (signal?.aborted) return EMPTY_PAGE
      projects = res.records
    }
    if (search.trim().length > 0) {
      const q = search.trim().toLowerCase()
      projects = projects.filter((p) => {
        const v = p.value as Record<string, unknown>
        const title = typeof v.title === "string" ? v.title : ""
        const desc = typeof v.shortDescription === "string" ? v.shortDescription : ""
        return title.toLowerCase().includes(q) || desc.toLowerCase().includes(q)
      })
    }
    return { ...EMPTY_PAGE, projects }
  }

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
      authorLabels,
      excludeAuthorLabels,
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
    // "My projects" = the viewer's own + every group they own/admin
    // (or just the active group when acting-as). Group-owned projects
    // surface here, attributed to the group by the row's author column.
    if (managedAuthorDids.length === 0) return EMPTY_PAGE
    authors = managedAuthorDids
  } else if (filter === "by-follows") {
    if (!viewerDid || followedDids.size === 0) return EMPTY_PAGE
    authors = Array.from(followedDids)
  }

  const r = await fetchProjects({
    first: pageSize,
    after: cursor ?? undefined,
    authors,
    authorLabels,
    excludeAuthorLabels,
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
  const {
    filter,
    sub,
    search,
    viewerDid,
    followedDids,
    managedAuthorDids,
    cursor,
    signal,
    pageSize,
    degree,
    includeOrgLabels,
    excludeOrgLabels,
  } = args

  // Account-quality (orglabeler) include / exclude now filter
  // server-side on the `orgHypercertsClaimActivity` connection via
  // the `authorLabels` / `excludeAuthorLabels` args
  // (magic-indexer#207). The indexer ANDs `authors` + `authorLabels`,
  // so a branch that previously intersected its own `authors` filter
  // (follows / by-endorsed) with the include-org DID set now just
  // passes both args and lets the server compose them. The previous
  // `fetchOrgDidsByLabel` DID-resolution + `orgScope` / `dropExcluded`
  // client filtering (which broke pagination — a 100-row page came
  // back short) is gone.
  const authorLabels = toLabelArg(includeOrgLabels)
  const excludeAuthorLabels = toLabelArg(excludeOrgLabels)

  if (filter === MA_EARTH_FILTER) {
    if (cursor !== null) return EMPTY_PAGE
    const itemUris = await loadFeaturedItemUris(
      MA_EARTH_COLLECTIONS.certs,
      signal,
    )
    if (signal?.aborted) return EMPTY_PAGE
    if (itemUris.length === 0) return EMPTY_PAGE
    // Route through the indexer (not PDS getRecord) so the Quality
    // popover's label filters are honored on this surface too. The
    // server-side filter lives on the `orgHypercertsClaimActivity`
    // connection — see `ActivitiesByUris` op in
    // `src/app/api/indexer/route.ts`.
    const res = await fetchIndexerActivitiesByUris(itemUris, {
      labels: args.includeCertLabels?.length ? [...args.includeCertLabels] : undefined,
      excludeLabels: args.excludeCertLabels?.length ? [...args.excludeCertLabels] : undefined,
      authorLabels,
      excludeAuthorLabels,
      signal: signal ?? undefined,
    })
    if (signal?.aborted) return EMPTY_PAGE
    let certs = res.records
    if (search.trim().length > 0) {
      const q = search.trim().toLowerCase()
      certs = certs.filter((c) => {
        const title = typeof c.value.title === "string" ? c.value.title : ""
        const desc = typeof c.value.shortDescription === "string" ? c.value.shortDescription : ""
        return title.toLowerCase().includes(q) || desc.toLowerCase().includes(q)
      })
    }
    return { ...EMPTY_PAGE, certs, certDids: res.dids }
  }

  // Sub-category overrides — pinned to viewer. Account-quality
  // include / exclude is incoherent here (the records are the
  // viewer's own — either the viewer is labeled or not), and the
  // AuthoredActivities / ContributedActivities ops don't carry the
  // author-label args, so this branch ignores the org-quality filter
  // by design.
  if (sub === "created" && viewerDid) {
    const r = await fetchUserIndexerActivities(viewerDid, {
      mode: "authored",
      first: PAGE_SIZE,
      after: cursor ?? undefined,
      search: search || undefined,
      excludeLabels: args.excludeCertLabels?.length ? [...args.excludeCertLabels] : undefined,
      labels: args.includeCertLabels?.length ? [...args.includeCertLabels] : undefined,
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
      excludeLabels: args.excludeCertLabels?.length ? [...args.excludeCertLabels] : undefined,
      labels: args.includeCertLabels?.length ? [...args.includeCertLabels] : undefined,
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
    const closureAuthors = Array.from(closureMeta.closureByDid.keys())
    // The indexer ANDs `authors` + `authorLabels`, so pass the
    // closure DIDs as authors and let the server apply the
    // account-quality include / exclude on top.
    const r = await fetchIndexerActivities({
      first: PAGE_SIZE,
      after: cursor ?? undefined,
      authors: closureAuthors,
      search: search || undefined,
      excludeLabels: args.excludeCertLabels?.length ? [...args.excludeCertLabels] : undefined,
      labels: args.includeCertLabels?.length ? [...args.includeCertLabels] : undefined,
      authorLabels,
      excludeAuthorLabels,
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
    // No account-quality filter here: "Recently viewed" is the
    // viewer's own personal cache (resolved by URI via PDS getRecord,
    // not a label-filterable indexer connection), so the org-quality
    // include / exclude is a no-op on this branch by design.
    return { ...EMPTY_PAGE, certs, certDids: res.dids }
  }

  let authors: string[] | undefined
  if (filter === "by-me") {
    // "My activities" = the viewer's own + every group they own/admin
    // (or just the active group when acting-as). Group-owned activities
    // surface here, attributed to the group by the row's author column.
    if (managedAuthorDids.length === 0) return EMPTY_PAGE
    authors = managedAuthorDids
  } else if (filter === "by-follows") {
    if (!viewerDid || followedDids.size === 0) return EMPTY_PAGE
    authors = Array.from(followedDids)
  }

  // The indexer ANDs `authors` + `authorLabels`, so pass the branch's
  // author filter (if any) plus the account-quality include / exclude
  // and let the server compose them — no client-side intersection.
  const r = await fetchIndexerActivities({
    first: pageSize,
    after: cursor ?? undefined,
    authors,
    search: search || undefined,
    excludeLabels: args.excludeCertLabels?.length ? [...args.excludeCertLabels] : undefined,
    labels: args.includeCertLabels?.length ? [...args.includeCertLabels] : undefined,
    authorLabels,
    excludeAuthorLabels,
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

// ----------------------------- Funding ---------------------------------

/**
 * Fetch a page of funding receipts. The funding tab has no filter / sub /
 * search axes, so those args are ignored; the account-quality filter on
 * the receipt creator is applied server-side via `authorLabels` /
 * `excludeAuthorLabels`. All receipts are returned regardless of whether
 * `from` / `to` is an AT Protocol account or a free-text wallet address.
 */
async function loadFundingPage(args: LoadArgs): Promise<LoadedPage> {
  const { cursor, signal, pageSize, includeOrgLabels, excludeOrgLabels, confirmedBy } = args
  // Deselecting every account-quality option reads as "nothing matches"
  // (same affordance as the other kinds), not "no filter → show all".
  if (isExplicitlyEmpty(includeOrgLabels)) return EMPTY_PAGE
  // Account-quality (orglabeler) filter applied to the receipt creator
  // server-side via the connection's `authorLabels` / `excludeAuthorLabels`
  // (magic-indexer#207). With the default selection this excludes receipts
  // authored by "likely-test" accounts, so the tab shows only receipts
  // created by accounts that are likely real.
  const authorLabels = toLabelArg(includeOrgLabels)
  const excludeAuthorLabels = toLabelArg(excludeOrgLabels)
  const r = await fetchFundingReceipts({
    first: pageSize,
    after: cursor ?? undefined,
    authorLabels,
    excludeAuthorLabels,
    signal: signal ?? undefined,
    confirmedBy: confirmedBy ?? undefined,
  })
  if (signal?.aborted) return EMPTY_PAGE
  return {
    ...EMPTY_PAGE,
    fundingReceipts: r.records,
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
