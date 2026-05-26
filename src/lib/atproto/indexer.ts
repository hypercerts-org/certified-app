import type { ActivityRecord } from "./activity-types"
import type { LabelValue } from "./labeller"
import type { CollectionRecord, CollectionValue } from "./collection"
import { getBlobRefLink } from "./types"

/**
 * Same-origin proxy in front of the Magic Indexer GraphQL endpoint.
 *
 * The browser used to fetch the upstream indexer
 * (`magic-indexer-dev.up.railway.app/graphql`) directly. That made
 * the feed dependent on the indexer's CORS allowlist, which is
 * configured per-domain via the `ALLOWED_ORIGINS` env var on Magic
 * Indexer — so every Vercel preview / staging / custom domain had
 * to be allowlisted before it could load the feed.
 *
 * We now POST to a same-origin Next.js route handler
 * (`src/app/api/indexer/route.ts`) which forwards the request
 * server-to-server. Server-to-server fetches aren't subject to
 * CORS, so the upstream URL can be configured once (server-side
 * `INDEXER_URL` env var) and the feed works on every Vercel
 * domain without further allowlisting.
 *
 * The upstream URL itself stays a server-only concern — it's
 * resolved inside the route handler and never reaches the client
 * bundle, which also lets us drop the `NEXT_PUBLIC_` prefix going
 * forward.
 *
 * Magic Indexer (the `hb-agent/magic-indexer` fork of the upstream
 * `hyperindex` project) serves labels inline on every record and
 * accepts `labels` / `excludeLabels` filter args on the records
 * query, so this hook makes a single GraphQL call per page.
 */
export const INDEXER_PROXY_URL = "/api/indexer"

export interface ActivityGraphQLNode {
  uri: string
  cid: string
  did: string
  title: string | null
  shortDescription: string | null
  createdAt: string | null
  startDate: string | null
  endDate: string | null
  labels: string[] | null
  image: { __typename: string; uri?: string | null; image?: { ref: string; mimeType: string } } | null
  workScope: { scope: string } | null
}

interface GraphQLResponse {
  data?: {
    orgHypercertsClaimActivity?: {
      totalCount: number | null
      edges: { cursor: string; node: ActivityGraphQLNode | null }[]
      pageInfo: { hasNextPage: boolean; endCursor: string | null }
    } | null
  } | null
  errors?: { message: string }[]
}

export function nodeToActivityRecord(node: ActivityGraphQLNode): ActivityRecord {
  // Map the indexer image union into a shape resolveActivityImageUrl can handle.
  // The indexer may return partial data (null uri on OrgHypercertsDefsUri due
  // to a schema bug), so we guard each branch carefully.
  let image: Record<string, unknown> | undefined
  if (node.image) {
    if (node.image.uri) {
      image = { uri: node.image.uri }
    } else if (node.image.image?.ref) {
      image = { image: { ref: node.image.image.ref } }
    }
  }

  return {
    uri: node.uri,
    cid: node.cid,
    value: {
      title: node.title ?? "",
      shortDescription: node.shortDescription ?? "",
      createdAt: node.createdAt ?? new Date(0).toISOString(),
      startDate: node.startDate ?? undefined,
      endDate: node.endDate ?? undefined,
      image: image as ActivityRecord["value"]["image"],
      workScope: node.workScope ? { scope: node.workScope.scope } : undefined,
    },
  }
}

export interface IndexerActivitiesResult {
  records: ActivityRecord[]
  /** Map from record URI to its publishing actor DID. */
  dids: Map<string, string>
  /**
   * Map from record URI to the list of label values that are
   * currently active on that record (from any labeler the
   * indexer ingests). Empty list means "no active labels" — in
   * the Certified UI vocabulary this is "unlabelled".
   */
  labels: Map<string, LabelValue[]>
  hasMore: boolean
  endCursor: string | null
  totalCount: number | null
}

export interface FetchIndexerOptions {
  /** Number of records to request from the indexer. */
  first?: number
  /** Cursor returned by a previous page's `endCursor`. */
  after?: string
  /**
   * Server-side label include filter. Records returned will have
   * at least one of these label values active on them. Pass
   * undefined / empty array to skip the filter.
   */
  labels?: LabelValue[] | string[]
  /**
   * Server-side label exclude filter. Records returned will have
   * NONE of these label values active on them. Useful for honoring
   * takedowns: pass `["!takedown"]` to hide takedown-labeled records.
   */
  excludeLabels?: LabelValue[] | string[]
  /**
   * Server-side author filter. When provided, only records published
   * by one of these DIDs are returned. Pass undefined/omit for "no
   * filter" and [] for "explicit match nothing."
   */
  authors?: string[]
  /** Full-text search query. Searched across title, shortDescription,
   *  description, and workScope. Terms are implicitly ANDed. */
  search?: string
  signal?: AbortSignal
}

/**
 * Fetch activity claims from the Magic Indexer.
 *
 * Records are returned in the indexer's keyset-pagination order
 * (newest indexed first), which is approximately newest by
 * createdAt for the steady-state ingestion case. The previous
 * `sortBy: createdAt, sortDirection: DESC` arguments from the
 * upstream Hyperindex schema are not supported by Magic Indexer
 * and have been dropped from the query.
 */
export async function fetchIndexerActivities(
  options: FetchIndexerOptions = {},
): Promise<IndexerActivitiesResult> {
  const { first = 20, after, labels, excludeLabels, authors, search, signal } = options

  const variables: Record<string, unknown> = {
    first,
    after: after ?? null,
    labels: labels && labels.length > 0 ? labels : null,
    excludeLabels: excludeLabels && excludeLabels.length > 0 ? excludeLabels : null,
    search: search || null,
    // Preserve the nil-vs-empty distinction: undefined => null (no filter),
    // [] => [] (explicit "match nothing"), non-empty => pass through.
    authors: authors !== undefined ? (authors.length > 0 ? authors : []) : null,
  }

  const res = await fetch(INDEXER_PROXY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ operationName: "Activities", variables }),
    signal,
  })

  const json = (await res.json()) as GraphQLResponse

  const emptyResult: IndexerActivitiesResult = {
    records: [], dids: new Map(), labels: new Map(), hasMore: false, endCursor: null, totalCount: null,
  }

  // GraphQL can return partial data alongside errors (e.g. non-nullable
  // field nulls propagate up and null the connection). When the
  // connection is missing, log any errors and return empty rather than
  // crashing the feed.
  if (!json.data?.orgHypercertsClaimActivity) {
    if (json.errors?.length) {
      console.warn("[Indexer] GraphQL error, returning empty page:", json.errors[0].message)
    } else if (!res.ok) {
      throw new Error(`Indexer request failed: ${res.status}`)
    }
    return emptyResult
  }
  const connection = json.data.orgHypercertsClaimActivity

  const records: ActivityRecord[] = []
  const dids = new Map<string, string>()
  const recordLabels = new Map<string, LabelValue[]>()

  for (const edge of connection.edges) {
    if (!edge.node) continue
    records.push(nodeToActivityRecord(edge.node))
    dids.set(edge.node.uri, edge.node.did)
    recordLabels.set(edge.node.uri, (edge.node.labels ?? []) as LabelValue[])
  }

  return {
    records,
    dids,
    labels: recordLabels,
    hasMore: connection.pageInfo.hasNextPage,
    endCursor: connection.pageInfo.endCursor,
    totalCount: connection.totalCount,
  }
}

// ---------------------------------------------------------------------------
// Activities filtered by a single user as author OR contributor
// ---------------------------------------------------------------------------

/**
 * Magic Indexer supports filtering activity records by contributor DID
 * in addition to the existing author DID filter, via the `where` arg on
 * the activity connection. To list everything a user is associated with
 * — authored or contributed to — we compose both filters with `_or`.
 *
 * Constraints (from the indexer docs):
 *   - `contributor` accepts DID values only. Handle inputs are rejected
 *     at the GraphQL layer.
 *   - Activity records that stored a handle in `contributorIdentity`
 *     (instead of a DID) silently don't match the contributor filter.
 *   - The `com.atproto.repo.strongRef` contributor variant isn't matched
 *     either — only bare-string DID and `{$type, identity: did}`.
 *   - Records with more than `MaxArrayContributorScan` contributors are
 *     skipped server-side as a cost cap.
 *
 * Returns the same IndexerActivitiesResult shape as fetchIndexerActivities,
 * including the per-URI `dids` map — callers split authored vs contributed
 * by comparing each record's DID to the queried user.
 */
export interface FetchUserActivitiesOptions
  extends Omit<FetchIndexerOptions, "authors"> {
  /** Which side of the user's activity to fetch — defaults to
   *  "authored". Use "contributed" to get the contributor-filter
   *  results separately. The hook below runs both in parallel so a
   *  cert where the user is BOTH author and contributor appears in
   *  both lists. */
  mode?: "authored" | "contributed"
}

export async function fetchUserIndexerActivities(
  did: string,
  options: FetchUserActivitiesOptions = {},
): Promise<IndexerActivitiesResult> {
  const {
    first = 20,
    after,
    labels,
    excludeLabels,
    search,
    signal,
    mode = "authored",
  } = options

  if (!did.startsWith("did:")) {
    // The indexer rejects handle inputs at the GraphQL layer. Catch it
    // here so it surfaces as a programming error rather than a vague
    // GraphQL error in the network panel.
    throw new Error(
      `fetchUserIndexerActivities: 'did' must be a DID (got "${did}")`,
    )
  }

  const variables: Record<string, unknown> = {
    did,
    first,
    after: after ?? null,
    labels: labels && labels.length > 0 ? labels : null,
    excludeLabels: excludeLabels && excludeLabels.length > 0 ? excludeLabels : null,
    search: search || null,
  }

  const operationName =
    mode === "contributed" ? "ContributedActivities" : "AuthoredActivities"

  const res = await fetch(INDEXER_PROXY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ operationName, variables }),
    signal,
  })

  const json = (await res.json()) as GraphQLResponse

  const emptyResult: IndexerActivitiesResult = {
    records: [], dids: new Map(), labels: new Map(), hasMore: false, endCursor: null, totalCount: null,
  }

  if (!json.data?.orgHypercertsClaimActivity) {
    if (json.errors?.length) {
      console.warn("[Indexer] GraphQL error, returning empty page:", json.errors[0].message)
    } else if (!res.ok) {
      throw new Error(`Indexer request failed: ${res.status}`)
    }
    return emptyResult
  }
  const connection = json.data.orgHypercertsClaimActivity

  const records: ActivityRecord[] = []
  const dids = new Map<string, string>()
  const recordLabels = new Map<string, LabelValue[]>()

  for (const edge of connection.edges) {
    if (!edge.node) continue
    records.push(nodeToActivityRecord(edge.node))
    dids.set(edge.node.uri, edge.node.did)
    recordLabels.set(edge.node.uri, (edge.node.labels ?? []) as LabelValue[])
  }

  return {
    records,
    dids,
    labels: recordLabels,
    hasMore: connection.pageInfo.hasNextPage,
    endCursor: connection.pageInfo.endCursor,
    totalCount: connection.totalCount,
  }
}

// ---------------------------------------------------------------------------
// Endorsement records
// ---------------------------------------------------------------------------

export interface IndexerEndorsementRecord {
  uri: string
  author: string
  subject: string
  createdAt: string
}

export interface FetchEndorsementsOptions {
  authors: string[]
  signal?: AbortSignal
}

interface EndorsementGraphQLResponse {
  data?: {
    appCertifiedTempGraphEndorsement?: {
      edges: {
        node: {
          uri: string
          did: string
          subject: { did: string } | null
          createdAt: string
        } | null
      }[]
      pageInfo: { hasNextPage: boolean; endCursor: string | null }
    } | null
  } | null
  errors?: { message: string }[]
}

// ----------------------------- Endorsement closure (BFS) ---------------------
//
// Viewer-centric endorsement-graph closure (magic-indexer issue #117).
// Powers the "Endorsed users" filter on /explore by returning every
// DID reachable within `degree` hops of `viewer` through active
// (non-rejected, endorsement-typed) badge awards, plus per-DID
// provenance.

interface EndorsementClosureIssuer {
  did: string
  handle: string | null
  displayName: string | null
  description: string | null
  /** Content-addressed CID of the actor's avatar blob. Client builds
   *  the avatar URL via /api/xrpc/com/atproto/sync/getBlob. */
  avatarCid: string | null
  pds: string | null
}

export interface EndorsementClosureAccount {
  did: string
  degree: 1 | 2 | 3
  /**
   * Degree-(degree − 1) predecessors that endorsed this account, deduped
   * and sorted. Empty array for degree=1 — the viewer is the predecessor
   * but is excluded from the result per spec. The indexer returns these
   * as `via: [String!]!`; we narrow the type here.
   */
  via: string[]
  /**
   * Denormalised actor profile populated server-side via a single bulk
   * lookup on actor(did) (magic-indexer #117 perf follow-up). Always
   * present in responses from the new indexer; legacy / fallback paths
   * (PDS BFS) leave this as `{did}` only.
   */
  issuer: EndorsementClosureIssuer
}

export interface EndorsementClosure {
  accounts: EndorsementClosureAccount[]
  /**
   * True when the closure exceeded the indexer-side cap (default 3000).
   * The in-flight ring is trimmed degrees-furthest-first; lower rings
   * are intact. UI shows a "showing a subset of your trust graph" notice.
   */
  truncated: boolean
}

interface EndorsementClosureGraphQLResponse {
  data?: {
    endorsementClosure?: {
      accounts: {
        did: string
        degree: number
        via: string[]
        issuer?: {
          did: string
          handle: string | null
          displayName: string | null
          description: string | null
          avatarCid: string | null
          pds: string | null
        } | null
      }[]
      truncated: boolean
    }
  }
  errors?: { message: string; extensions?: { code?: string } }[]
}

/**
 * Server-side endorsement-graph closure error surface. The indexer
 * returns structured `extensions.code` SCREAMING_SNAKE_CASE codes so
 * the UI can branch deterministically (warming vs. invalid input vs.
 * disabled feature). Plain `Error` fallback when no code is present
 * (network failure / non-GraphQL error).
 */
export class EndorsementClosureError extends Error {
  /** SCREAMING_SNAKE_CASE per magic-indexer convention. */
  readonly code: string | null
  constructor(message: string, code: string | null) {
    super(message)
    this.name = "EndorsementClosureError"
    this.code = code
  }
}

/**
 * Fetches the viewer's endorsement-graph closure at the given depth.
 *
 *   - `viewer`: viewer DID (excluded from the result).
 *   - `degree`: ∈ {1, 2, 3}. Cumulative: degree=2 returns 1st ∪ 2nd.
 *   - `signal`: optional AbortSignal threaded through to fetch.
 *
 * Throws `EndorsementClosureError` with a structured code on a 4xx-
 * style failure (`INVALID_VIEWER_DID`, `INVALID_DEGREE`,
 * `ENDORSEMENT_GRAPH_WARMING`, `ENDORSEMENT_GRAPH_DISABLED`). Callers
 * (e.g. use-explore) typically downgrade `ENDORSEMENT_GRAPH_WARMING`
 * to a loading state and surface the others to the user.
 */
export async function fetchEndorsementClosure(
  viewer: string,
  degree: 1 | 2 | 3,
  signal?: AbortSignal,
): Promise<EndorsementClosure> {
  const res = await fetch(INDEXER_PROXY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      operationName: "EndorsementClosure",
      variables: { viewer, degree },
    }),
    signal,
  })
  if (!res.ok) {
    throw new EndorsementClosureError(
      `Indexer proxy returned ${res.status}`,
      null,
    )
  }
  const json = (await res.json()) as EndorsementClosureGraphQLResponse
  if (json.errors?.length) {
    const first = json.errors[0]
    throw new EndorsementClosureError(
      first.message,
      first.extensions?.code ?? null,
    )
  }
  if (!json.data?.endorsementClosure) {
    throw new EndorsementClosureError(
      "Indexer returned no closure payload",
      null,
    )
  }
  const c = json.data.endorsementClosure
  return {
    truncated: c.truncated,
    // Narrow degree to 1 | 2 | 3. The indexer never returns anything
    // outside that range (it's gated at the resolver), but cast
    // defensively so a future degree-4 doesn't silently slip into
    // consumers that switch on the literal type.
    accounts: c.accounts.map((a) => ({
      did: a.did,
      degree: clampClosureDegree(a.degree),
      via: a.via,
      issuer: a.issuer ?? { did: a.did, handle: null, displayName: null, description: null, avatarCid: null, pds: null },
    })),
  }
}

function clampClosureDegree(d: number): 1 | 2 | 3 {
  if (d === 1) return 1
  if (d === 2) return 2
  return 3
}

/**
 * Fetch all endorsement records authored by the given evaluator DIDs,
 * paginating through the indexer until the connection is exhausted or
 * the safety cap is hit.
 *
 * Returns [] if authors is empty (short-circuits without a network call).
 */
export async function fetchEndorsements(
  options: FetchEndorsementsOptions,
): Promise<IndexerEndorsementRecord[]> {
  if (options.authors.length === 0) return []

  const PAGE_SIZE = 100
  const SAFETY_CAP = 10_000

  const all: IndexerEndorsementRecord[] = []
  let cursor: string | null = null

  while (all.length < SAFETY_CAP) {
    const res = await fetch(INDEXER_PROXY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        operationName: "LegacyEndorsements",
        variables: {
          authors: options.authors,
          first: PAGE_SIZE,
          after: cursor,
        },
      }),
      signal: options.signal,
    })
    if (!res.ok) {
      throw new Error(`Indexer request failed: ${res.status}`)
    }
    const json = (await res.json()) as EndorsementGraphQLResponse
    if (!json.data?.appCertifiedTempGraphEndorsement) {
      if (json.errors?.length) {
        console.warn("[Indexer] Endorsement GraphQL error:", json.errors[0].message)
      }
      break
    }
    const connection = json.data.appCertifiedTempGraphEndorsement
    for (const edge of connection.edges) {
      if (!edge.node?.subject) continue
      all.push({
        uri: edge.node.uri,
        author: edge.node.did,
        subject: edge.node.subject.did,
        createdAt: edge.node.createdAt,
      })
    }
    if (!connection.pageInfo.hasNextPage) break
    cursor = connection.pageInfo.endCursor
    if (!cursor) break
  }

  return all
}

// ============================================================================
// Network counts (for the /welcome landing-page stats strip)
// ============================================================================

export interface NetworkCounts {
  /** `app.certified.actor.profile` total — "Users". */
  users: number | null
  /** `app.certified.actor.organization` total — "Organizations". */
  organizations: number | null
  /** `org.hypercerts.claim.activity` total — labelled "Achievements"
   *  on the public landing page to avoid in-app jargon. */
  achievements: number | null
  /** `org.hypercerts.collection` records with `type == "project"`. */
  projects: number | null
  /** `app.certified.badge.award` total — "Endorsements".
   *  Includes both default endorsements and list-typed ones. */
  endorsements: number | null
}

const COUNT_OPERATIONS = [
  { key: "users", op: "ProfileCount", root: "appCertifiedActorProfile" },
  {
    key: "organizations",
    op: "OrganizationCount",
    root: "appCertifiedActorOrganization",
  },
  {
    key: "achievements",
    op: "ActivityCount",
    root: "orgHypercertsClaimActivity",
  },
  { key: "projects", op: "ProjectCount", root: "orgHypercertsCollection" },
  { key: "endorsements", op: "AwardCount", root: "appCertifiedBadgeAward" },
] as const

async function fetchCount(op: string, root: string): Promise<number | null> {
  try {
    const res = await fetch(INDEXER_PROXY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ operationName: op, variables: {} }),
    })
    if (!res.ok) {
      if (process.env.NODE_ENV !== "production") {
        const body = await res.text().catch(() => "")
        console.warn(
          `[network-counts] ${op} -> HTTP ${res.status}`,
          body.slice(0, 200),
        )
      }
      return null
    }
    const json = (await res.json()) as {
      data?: Record<string, { totalCount?: number | null } | null>
      errors?: { message?: string }[]
    }
    if (json.errors && json.errors.length > 0) {
      if (process.env.NODE_ENV !== "production") {
        console.warn(
          `[network-counts] ${op} -> GraphQL errors`,
          json.errors.map((e) => e.message).join(" | "),
        )
      }
      return null
    }
    const node = json.data?.[root]
    const total = node?.totalCount
    if (typeof total !== "number") {
      if (process.env.NODE_ENV !== "production") {
        console.warn(
          `[network-counts] ${op} -> unexpected response shape`,
          { root, node },
        )
      }
      return null
    }
    return total
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(`[network-counts] ${op} -> exception`, err)
    }
    return null
  }
}

/**
 * Fetch every network-wide count in parallel. Each pair is
 * independent — a transient failure on one (e.g. the
 * `app.certified.actor.organization` collection not yet indexed)
 * yields `null` for that field; the rest still resolve. Render
 * sites should treat `null` as "-" (data unavailable) rather than
 * "0".
 */
export async function fetchNetworkCounts(): Promise<NetworkCounts> {
  const entries = await Promise.all(
    COUNT_OPERATIONS.map(({ key, op, root }) =>
      fetchCount(op, root).then((count) => [key, count] as const),
    ),
  )
  const out: NetworkCounts = {
    users: null,
    organizations: null,
    achievements: null,
    projects: null,
    endorsements: null,
  }
  for (const [key, count] of entries) {
    out[key] = count
  }
  return out
}

// ============================================================================
// User projects — org.hypercerts.collection records authored by one DID
// whose type discriminator is "project" (case-insensitive via eqi).
// ============================================================================

export interface CollectionGraphQLNode {
  uri: string
  cid: string
  did: string
  createdAt: string | null
  title: string | null
  shortDescription: string | null
  items: { itemIdentifier: { uri?: string; cid?: string } | null }[] | null
  /**
   * The collection's avatar — distinct from the banner. Optional in
   * the GraphQL query; the legacy fetchers (`fetchUserProjects`,
   * `fetchProjects`) don't select it so node.avatar is undefined for
   * those code paths. `HydrateFeedPage` does select it.
   *
   * Note: the schema union is `OrgHypercertsDefsSmallImage`, not the
   * `LargeImage` variant the banner uses.
   */
  avatar?:
    | { __typename: "OrgHypercertsDefsUri"; uri?: string | null }
    | {
        __typename: "OrgHypercertsDefsSmallImage"
        image?: { ref?: string | null; mimeType?: string | null } | null
      }
    | null
  banner:
    | { __typename: "OrgHypercertsDefsUri"; uri?: string | null }
    | {
        __typename: "OrgHypercertsDefsLargeImage"
        image?: { ref?: string | null; mimeType?: string | null } | null
      }
    | null
}

interface UserProjectsGraphQLResponse {
  data?: {
    orgHypercertsCollection?: {
      totalCount: number | null
      edges: { cursor: string; node: CollectionGraphQLNode | null }[]
      pageInfo: { hasNextPage: boolean; endCursor: string | null }
    } | null
  } | null
  errors?: { message: string }[]
}

export function nodeToCollectionRecord(node: CollectionGraphQLNode): CollectionRecord {
  // Re-shape the indexer's typed banner union back into the loose
  // `{ uri }` / `{ image: { ref, mimeType } }` blob that
  // resolveActivityImageUrl already understands. The blob ref comes
  // back wrapped as `map[$link:<cid>]` (magic-indexer#110) — strip it
  // here so callers don't have to know about that quirk.
  let banner: Record<string, unknown> | undefined
  if (node.banner) {
    if (node.banner.__typename === "OrgHypercertsDefsUri" && node.banner.uri) {
      banner = { uri: node.banner.uri }
    } else if (
      node.banner.__typename === "OrgHypercertsDefsLargeImage" &&
      node.banner.image?.ref
    ) {
      banner = {
        image: {
          ref: getBlobRefLink(node.banner.image.ref),
          ...(node.banner.image.mimeType
            ? { mimeType: node.banner.image.mimeType }
            : {}),
        },
      }
    }
  }

  // Avatar — same normalised shape as banner so renderers can apply
  // resolveActivityImageUrl uniformly. SmallImage instead of LargeImage
  // is the schema-side distinction; on the value side they collapse.
  let avatar: Record<string, unknown> | undefined
  if (node.avatar) {
    if (node.avatar.__typename === "OrgHypercertsDefsUri" && node.avatar.uri) {
      avatar = { uri: node.avatar.uri }
    } else if (
      node.avatar.__typename === "OrgHypercertsDefsSmallImage" &&
      node.avatar.image?.ref
    ) {
      avatar = {
        image: {
          ref: getBlobRefLink(node.avatar.image.ref),
          ...(node.avatar.image.mimeType
            ? { mimeType: node.avatar.image.mimeType }
            : {}),
        },
      }
    }
  }

  const items =
    node.items
      ?.map((it) => it?.itemIdentifier)
      .filter((id): id is { uri: string; cid: string } =>
        !!id && typeof id.uri === "string" && typeof id.cid === "string",
      )
      .map((id) => ({ itemIdentifier: { uri: id.uri, cid: id.cid } })) ?? []

  const value: CollectionValue = {
    type: "project",
    ...(node.title ? { title: node.title } : {}),
    ...(node.shortDescription
      ? { shortDescription: node.shortDescription }
      : {}),
    ...(node.createdAt ? { createdAt: node.createdAt } : {}),
    ...(avatar ? { avatar } : {}),
    ...(banner ? { banner } : {}),
    items,
  }

  return { uri: node.uri, cid: node.cid, value }
}

export interface UserProjectsResult {
  records: CollectionRecord[]
  hasMore: boolean
  endCursor: string | null
  totalCount: number | null
}

/**
 * Generic project listing — same node shape as fetchUserProjects but
 * not scoped to a single DID. `authors === undefined` means "no
 * scope" (network-wide); `authors: []` means "match nothing";
 * `authors: [DID...]` filters to those authors.
 */
export async function fetchProjects(
  options: {
    first?: number
    after?: string
    authors?: string[]
    search?: string
    signal?: AbortSignal
  } = {},
): Promise<UserProjectsResult> {
  const { first = 24, after, authors, search, signal } = options

  const res = await fetch(INDEXER_PROXY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      operationName: "Projects",
      variables: {
        first,
        after: after ?? null,
        authors:
          authors === undefined ? null : authors.length > 0 ? authors : [],
        search: search || null,
      },
    }),
    signal,
  })

  const json = (await res.json()) as UserProjectsGraphQLResponse
  const empty: UserProjectsResult = {
    records: [],
    hasMore: false,
    endCursor: null,
    totalCount: null,
  }

  if (!json.data?.orgHypercertsCollection) {
    if (json.errors?.length) {
      console.warn(
        "[Indexer] Projects GraphQL error:",
        json.errors[0].message,
      )
    } else if (!res.ok) {
      throw new Error(`Indexer request failed: ${res.status}`)
    }
    return empty
  }

  const connection = json.data.orgHypercertsCollection
  const records: CollectionRecord[] = []
  for (const edge of connection.edges) {
    if (!edge.node) continue
    records.push(nodeToCollectionRecord(edge.node))
  }
  return {
    records,
    hasMore: connection.pageInfo.hasNextPage,
    endCursor: connection.pageInfo.endCursor,
    totalCount: connection.totalCount,
  }
}

/**
 * Fetch `org.hypercerts.collection` records authored by `did` whose
 * `type === "project"` (case-insensitive). Replaces the per-DID PDS
 * listRecords scan with a single indexer call.
 *
 * Records that store the legacy `value.name` (title fallback) or
 * `value.image` (banner fallback) fields will land here with neither
 * surfaced — see the UserProjects op comment in route.ts for why. The
 * Projects tab renders "Untitled project" / no banner for those so
 * authors notice and republish on the canonical shape.
 */
export async function fetchUserProjects(
  did: string,
  options: { first?: number; after?: string; signal?: AbortSignal } = {},
): Promise<UserProjectsResult> {
  const { first = 50, after, signal } = options

  if (!did.startsWith("did:")) {
    throw new Error(`fetchUserProjects: 'did' must be a DID (got "${did}")`)
  }

  const res = await fetch(INDEXER_PROXY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      operationName: "UserProjects",
      variables: { did, first, after: after ?? null },
    }),
    signal,
  })

  const json = (await res.json()) as UserProjectsGraphQLResponse

  const empty: UserProjectsResult = {
    records: [],
    hasMore: false,
    endCursor: null,
    totalCount: null,
  }

  if (!json.data?.orgHypercertsCollection) {
    if (json.errors?.length) {
      console.warn(
        "[Indexer] UserProjects GraphQL error:",
        json.errors[0].message,
      )
    } else if (!res.ok) {
      throw new Error(`Indexer request failed: ${res.status}`)
    }
    return empty
  }

  const connection = json.data.orgHypercertsCollection
  const records: CollectionRecord[] = []
  for (const edge of connection.edges) {
    if (!edge.node) continue
    records.push(nodeToCollectionRecord(edge.node))
  }

  return {
    records,
    hasMore: connection.pageInfo.hasNextPage,
    endCursor: connection.pageInfo.endCursor,
    totalCount: connection.totalCount,
  }
}
