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

interface OrganizationDidsGraphQLResponse {
  data?: {
    appCertifiedActorOrganization?: {
      edges: { node: { did: string } | null }[]
    } | null
  } | null
}

/** Set of every DID that has published an
 *  `app.certified.actor.organization` record. Used to split actors
 *  into individuals vs groups in the /explore Users view. */
export async function fetchOrganizationDids(
  first = 100,
  signal?: AbortSignal,
): Promise<Set<string>> {
  const res = await fetch(INDEXER_PROXY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      operationName: "OrganizationDids",
      variables: { first, after: null },
    }),
    signal,
  })
  const json = (await res.json()) as OrganizationDidsGraphQLResponse
  const set = new Set<string>()
  for (const edge of json.data?.appCertifiedActorOrganization?.edges ?? []) {
    if (edge.node?.did) set.add(edge.node.did)
  }
  return set
}

export interface NetworkActorsPage {
  actors: NetworkActor[]
  endCursor: string | null
  hasMore: boolean
}

export async function fetchNetworkActors(
  opts: { first?: number; after?: string | null; signal?: AbortSignal } = {},
): Promise<NetworkActorsPage> {
  const { first = 30, after = null, signal } = opts
  const res = await fetch(INDEXER_PROXY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      operationName: "NetworkActors",
      variables: { first, after },
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
