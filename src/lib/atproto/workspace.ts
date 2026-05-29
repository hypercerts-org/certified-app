import { getBlobRefLink } from "@/lib/atproto/types"

const INDEXER_PROXY_URL = "/api/indexer"

// --------------------------- Actors -----------------------------------

export interface NetworkActor {
  did: string
  displayName: string | null
  description: string | null
  /** Resolved through the local xrpc proxy — null when the actor has
   *  no avatar set. */
  avatarUrl: string | null
  /** ISO datetime from the `app.certified.actor.profile` record's
   *  `createdAt` field — when the user joined Certified. Null for
   *  legacy profiles indexed before the field was emitted. */
  createdAt: string | null
}

interface NetworkActorsGraphQLResponse {
  data?: {
    appCertifiedActorProfile?: {
      totalCount: number | null
      edges: {
        cursor: string
        node: {
          did: string
          displayName: string | null
          description: string | null
          createdAt: string | null
          avatar:
            | { __typename: "OrgHypercertsDefsUri"; uri?: string | null }
            | {
                __typename: "OrgHypercertsDefsSmallImage"
                image?: { ref?: string | null; mimeType?: string | null } | null
              }
            | null
        } | null
      }[]
      pageInfo: { hasNextPage: boolean; endCursor: string | null }
    } | null
  } | null
  errors?: { message: string }[]
}

function avatarUrlFromUnion(
  did: string,
  avatar:
    | { __typename: string; uri?: string | null; image?: { ref?: string | null } | null }
    | null,
): string | null {
  if (!avatar) return null
  if (avatar.__typename === "OrgHypercertsDefsUri") {
    return typeof avatar.uri === "string" ? avatar.uri : null
  }
  if (avatar.__typename === "OrgHypercertsDefsSmallImage") {
    const ref = avatar.image?.ref
    if (!ref) return null
    const cid = getBlobRefLink(ref)
    if (!cid || !/^[A-Za-z0-9]+$/.test(cid)) return null
    return `/api/xrpc/com/atproto/sync/getBlob?did=${encodeURIComponent(did)}&cid=${encodeURIComponent(cid)}`
  }
  return null
}

export interface NetworkActorsPage {
  actors: NetworkActor[]
  endCursor: string | null
  hasMore: boolean
}

export async function fetchNetworkActors(
  opts: {
    first?: number
    after?: string | null
    /**
     * Server-side kind filter — when set, the upstream
     * `appCertifiedActorProfile.where.isOrganization.eq` flag
     * narrows the result to that kind only. `undefined` keeps the
     * existing mixed-list behaviour. Backs the /explore Accounts
     * People / Organizations sub-toggle (see certified-app#107):
     * the page now paginates over a single kind, so the People tab
     * doesn't under-show by being client-side filtered to one
     * subset of a mixed page.
     */
    isOrganization?: boolean
    signal?: AbortSignal
  } = {},
): Promise<NetworkActorsPage> {
  const { first = 30, after = null, isOrganization, signal } = opts
  // Two upstream operations: the unfiltered `NetworkActors`, and
  // `NetworkActorsByKind` which adds the `isOrganization` where-arg.
  // graphql-go rejects an explicit `null` on the `eq` operator, so
  // we have to omit the `where` arg entirely for the "all kinds"
  // case — separate query strings is the simplest way to do that.
  const useKindFilter = typeof isOrganization === "boolean"
  const res = await fetch(INDEXER_PROXY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      operationName: useKindFilter ? "NetworkActorsByKind" : "NetworkActors",
      variables: useKindFilter
        ? { first, after, isOrganization }
        : { first, after },
    }),
    signal,
  })
  const json = (await res.json()) as NetworkActorsGraphQLResponse
  const connection = json.data?.appCertifiedActorProfile
  const edges = connection?.edges ?? []
  const actors: NetworkActor[] = []
  for (const edge of edges) {
    if (!edge.node) continue
    const n = edge.node
    actors.push({
      did: n.did,
      displayName: n.displayName,
      description: n.description,
      avatarUrl: avatarUrlFromUnion(n.did, n.avatar),
      createdAt: typeof n.createdAt === "string" ? n.createdAt : null,
    })
  }
  return {
    actors,
    endCursor: connection?.pageInfo?.endCursor ?? null,
    hasMore: connection?.pageInfo?.hasNextPage ?? false,
  }
}

// --------------------- Org-by-label + profiles-by-DID -----------------

/**
 * Walk the `appCertifiedActorOrganization` connection filtered by
 * orglabeler tier labels (include or exclude). Pages through every
 * match — the labeled-org set is small in practice (sub-100), so
 * collecting all DIDs upfront is fine and lets the caller use the
 * result for a downstream `authors:` / DID-set intersection.
 *
 * Results are cached in-memory by the (labels, excludeLabels) tuple.
 * The labeled-org set is slow-changing (depends on the orglabeler
 * service emitting new verdicts) and the explore loader calls this
 * on every paginated page; the cache prevents the same call from
 * firing on every loadMore.
 */
const MAX_ORG_DIDS_BY_LABEL_CACHE = 16
const orgDidsByLabelCache = new Map<string, Set<string>>()
const orgDidsByLabelInflight = new Map<string, Promise<Set<string>>>()

function cacheKeyForOrgLabels(
  labels: readonly string[] | undefined,
  excludeLabels: readonly string[] | undefined,
): string {
  // Polarity-explicit key — `inc=...&exc=...` always, even when
  // a side is empty — so `{labels: [], excludeLabels: ["x"]}` can
  // never collide with `{labels: ["x"], excludeLabels: []}`.
  const inc = labels ? [...labels].sort().join(",") : ""
  const exc = excludeLabels ? [...excludeLabels].sort().join(",") : ""
  return `inc=${inc}&exc=${exc}`
}

function setOrgDidsByLabelCacheEntry(key: string, value: Set<string>): void {
  if (orgDidsByLabelCache.has(key)) orgDidsByLabelCache.delete(key)
  orgDidsByLabelCache.set(key, value)
  while (orgDidsByLabelCache.size > MAX_ORG_DIDS_BY_LABEL_CACHE) {
    const oldest = orgDidsByLabelCache.keys().next().value
    if (oldest === undefined) break
    orgDidsByLabelCache.delete(oldest)
  }
}

export async function fetchOrgDidsByLabel(opts: {
  labels?: readonly string[]
  excludeLabels?: readonly string[]
  signal?: AbortSignal
}): Promise<Set<string>> {
  const { labels, excludeLabels, signal } = opts
  if (
    (!labels || labels.length === 0) &&
    (!excludeLabels || excludeLabels.length === 0)
  ) {
    return new Set()
  }
  const key = cacheKeyForOrgLabels(labels, excludeLabels)
  const cached = orgDidsByLabelCache.get(key)
  if (cached) return cached
  // Atomic has/set so two callers racing don't each build a promise.
  if (!orgDidsByLabelInflight.has(key)) {
    // IMPORTANT: don't pass `signal` to the shared fetch. The
    // useExplore consumer aborts its AbortController on every deps
    // churn (filter / kind / search / viewerDid changing). If the
    // first caller's signal threads into the shared fetch, an abort
    // resolves the shared promise with partial / empty data and every
    // sibling waiting on the same promise sees that bad result. The
    // outer caller's own `signal?.aborted` check below is what gates
    // the consumer-level result; the underlying paginated fetch runs
    // to completion so the cache stays healthy. Same fix as the H1
    // pattern in useTypedLists.
    void signal // outer-only — kept for API symmetry with callers
    const promise = (async () => {
      const fetched = await fetchOrgDidsByLabelUncached({
        labels,
        excludeLabels,
        signal: undefined,
      })
      setOrgDidsByLabelCacheEntry(key, fetched)
      return fetched
    })()
    orgDidsByLabelInflight.set(key, promise)
    promise.finally(() => {
      if (orgDidsByLabelInflight.get(key) === promise) {
        orgDidsByLabelInflight.delete(key)
      }
    })
  }
  return orgDidsByLabelInflight.get(key)!
}

async function fetchOrgDidsByLabelUncached(opts: {
  labels?: readonly string[]
  excludeLabels?: readonly string[]
  signal?: AbortSignal
}): Promise<Set<string>> {
  const { labels, excludeLabels, signal } = opts
  const out = new Set<string>()
  let cursor: string | null = null
  while (true) {
    const variables: Record<string, unknown> = {
      first: 100,
      after: cursor,
      labels: labels && labels.length > 0 ? [...labels] : null,
      excludeLabels:
        excludeLabels && excludeLabels.length > 0 ? [...excludeLabels] : null,
    }
    const res = await fetch(INDEXER_PROXY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ operationName: "OrganizationDidsByLabel", variables }),
      signal,
    })
    if (!res.ok) break
    const json = (await res.json()) as {
      data?: {
        appCertifiedActorOrganization?: {
          edges: { node: { did: string } | null }[]
          pageInfo: { hasNextPage: boolean; endCursor: string | null }
        } | null
      }
    }
    const conn = json.data?.appCertifiedActorOrganization
    if (!conn) break
    for (const edge of conn.edges) {
      if (edge.node?.did) out.add(edge.node.did)
    }
    if (!conn.pageInfo.hasNextPage || !conn.pageInfo.endCursor) break
    cursor = conn.pageInfo.endCursor
  }
  return out
}

/**
 * Returns the subset of `dids` whose actor profile matches the given
 * `isOrganization` flag. Powers the /explore Accounts People /
 * Organizations sub-toggle on paths where the actor list comes from
 * a known DID set rather than `fetchNetworkActors` — Featured
 * (curated project authors) and Endorsed (closure issuer list).
 *
 * Replaces the older `fetchOrganizationDidsForSet` + client-side
 * `!set.has(did)` complement, which silently inverted the filter
 * when the network call returned 0 results: "People" then kept the
 * full input set instead of returning empty. The new shape is
 * unambiguous — the returned DIDs ARE the matching kind, the
 * filtered set is exactly what to keep.
 *
 * Indexer's `first` is capped at 100 per call, so we chunk the
 * input set. A failing chunk throws — callers are expected to
 * catch and surface an empty page rather than silently mis-filter.
 */
export async function fetchDidsByKindInSet(
  dids: readonly string[],
  isOrganization: boolean,
  signal?: AbortSignal,
): Promise<Set<string>> {
  const result = new Set<string>()
  if (dids.length === 0) return result
  const CHUNK = 100
  for (let i = 0; i < dids.length; i += CHUNK) {
    const chunk = dids.slice(i, i + CHUNK)
    const res = await fetch(INDEXER_PROXY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        operationName: "DidsByKindInSet",
        variables: { dids: [...chunk], isOrganization },
      }),
      signal,
    })
    if (!res.ok) {
      throw new Error(`DidsByKindInSet failed: ${res.status}`)
    }
    const json = (await res.json()) as {
      data?: {
        appCertifiedActorProfile?: {
          edges: { node: { did: string } | null }[]
        } | null
      } | null
    }
    for (const edge of json.data?.appCertifiedActorProfile?.edges ?? []) {
      if (edge.node?.did) result.add(edge.node.did)
    }
  }
  return result
}

/**
 * Fetch actor profiles for a known set of DIDs. Bypasses the
 * `NetworkActors` 100-actor pagination cap — caller passes the
 * exact set they need, indexer returns up to 100 in one shot.
 * Returns an empty array on empty input.
 */
export async function fetchNetworkActorsByDids(
  dids: readonly string[],
  signal?: AbortSignal,
): Promise<NetworkActor[]> {
  if (dids.length === 0) return []
  const res = await fetch(INDEXER_PROXY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      operationName: "NetworkActorsByDids",
      variables: { dids: [...dids] },
    }),
    signal,
  })
  if (!res.ok) return []
  const json = (await res.json()) as NetworkActorsGraphQLResponse
  const edges = json.data?.appCertifiedActorProfile?.edges ?? []
  const actors: NetworkActor[] = []
  for (const edge of edges) {
    if (!edge.node) continue
    const n = edge.node
    actors.push({
      did: n.did,
      displayName: n.displayName,
      description: n.description,
      avatarUrl: avatarUrlFromUnion(n.did, n.avatar),
      createdAt: typeof n.createdAt === "string" ? n.createdAt : null,
    })
  }
  return actors
}

// --------------------------- Workspace counts ---------------------------

export type WorkspaceLexicon =
  | "certs"
  | "projects"
  | "lists"
  | "endorsementsReceived"
  | "followers"

export const WORKSPACE_LEXICON_LABEL: Record<WorkspaceLexicon, string> = {
  certs: "Certs",
  projects: "Projects",
  lists: "Lists",
  endorsementsReceived: "Endorsements",
  followers: "Followers",
}

export type WorkspaceCounts = Record<WorkspaceLexicon, number | null>

const EMPTY_COUNTS: WorkspaceCounts = {
  certs: null,
  projects: null,
  lists: null,
  endorsementsReceived: null,
  followers: null,
}

interface CountsGraphQLResponse {
  data?: Partial<
    Record<WorkspaceLexicon, { totalCount: number | null } | null>
  > | null
  errors?: { message: string }[]
}

export async function fetchActorWorkspaceCounts(
  did: string,
  signal?: AbortSignal,
): Promise<WorkspaceCounts> {
  const res = await fetch(INDEXER_PROXY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      operationName: "ActorWorkspaceCounts",
      variables: { did },
    }),
    signal,
  })
  const json = (await res.json()) as CountsGraphQLResponse
  if (!json.data) return EMPTY_COUNTS

  const out: WorkspaceCounts = { ...EMPTY_COUNTS }
  for (const key of Object.keys(out) as WorkspaceLexicon[]) {
    const node = json.data[key]
    out[key] = typeof node?.totalCount === "number" ? node.totalCount : null
  }
  return out
}
