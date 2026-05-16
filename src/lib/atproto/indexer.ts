import type { ActivityRecord } from "./activity-types"
import type { LabelValue } from "./labeller"

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
const INDEXER_PROXY_URL = "/api/indexer"

const ACTIVITIES_QUERY = `
query Activities(
  $first: Int!
  $after: String
  $labels: [String!]
  $excludeLabels: [String!]
  $authors: [String!]
  $search: String
) {
  orgHypercertsClaimActivity(
    first: $first
    after: $after
    labels: $labels
    excludeLabels: $excludeLabels
    authors: $authors
    search: $search
  ) {
    totalCount
    edges {
      cursor
      node {
        uri
        cid
        did
        title
        shortDescription
        createdAt
        startDate
        endDate
        labels
        image {
          __typename
          ... on OrgHypercertsDefsUri { uri }
          ... on OrgHypercertsDefsSmallImage { image { ref mimeType } }
        }
        workScope {
          ... on OrgHypercertsClaimActivityWorkScopeString { scope }
        }
      }
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}
`

interface GraphQLNode {
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
      edges: { cursor: string; node: GraphQLNode | null }[]
      pageInfo: { hasNextPage: boolean; endCursor: string | null }
    } | null
  } | null
  errors?: { message: string }[]
}

function nodeToActivityRecord(node: GraphQLNode): ActivityRecord {
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
  labels?: LabelValue[]
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
    body: JSON.stringify({ query: ACTIVITIES_QUERY, variables }),
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
const ACTIVITIES_FOR_USER_QUERY = `
query ActivitiesForUser(
  $did: String!
  $first: Int!
  $after: String
  $labels: [String!]
  $excludeLabels: [String!]
  $search: String
) {
  orgHypercertsClaimActivity(
    first: $first
    after: $after
    labels: $labels
    excludeLabels: $excludeLabels
    search: $search
    where: {
      _or: [
        { did:         { eq: $did } }
        { contributor: { eq: $did } }
      ]
    }
  ) {
    totalCount
    edges {
      cursor
      node {
        uri
        cid
        did
        title
        shortDescription
        createdAt
        startDate
        endDate
        labels
        image {
          __typename
          ... on OrgHypercertsDefsUri { uri }
          ... on OrgHypercertsDefsSmallImage { image { ref mimeType } }
        }
        workScope {
          ... on OrgHypercertsClaimActivityWorkScopeString { scope }
        }
      }
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}
`

export interface FetchUserActivitiesOptions
  extends Omit<FetchIndexerOptions, "authors"> {}

export async function fetchUserIndexerActivities(
  did: string,
  options: FetchUserActivitiesOptions = {},
): Promise<IndexerActivitiesResult> {
  const { first = 20, after, labels, excludeLabels, search, signal } = options

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

  const res = await fetch(INDEXER_PROXY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: ACTIVITIES_FOR_USER_QUERY, variables }),
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

const ENDORSEMENTS_QUERY = `
query Endorsements($authors: [String!]!, $first: Int!, $after: String) {
  appCertifiedTempGraphEndorsement(
    first: $first
    after: $after
    authors: $authors
  ) {
    edges {
      cursor
      node {
        uri
        did
        subject { did }
        createdAt
      }
    }
    pageInfo { hasNextPage endCursor }
  }
}
`

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
        query: ENDORSEMENTS_QUERY,
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
