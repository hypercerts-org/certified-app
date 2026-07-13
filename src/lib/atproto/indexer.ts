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
 *
 * Module layout: the shared plumbing (proxy URL, {@link postIndexer},
 * `chunkArray`) lives in the leaf module `indexer-client`; this file
 * holds the activity-connection core; the other indexer domains live
 * in sibling modules — `indexer-funding`, `indexer-closure`,
 * `indexer-counts`, `indexer-collections`. Everything is re-exported
 * from here so every existing `@/lib/atproto/indexer` import keeps
 * resolving unchanged.
 */

import { chunkArray, postIndexer } from "./indexer-client"

export {
  INDEXER_PROXY_URL,
  postIndexer,
  chunkArray,
  type IndexerPostResult,
} from "./indexer-client"

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
  // Two union members are projected: the plain `{ scope }` string form
  // and the CEL `{ expression }` form (`scope.hasAny([...])`). Either may
  // be null depending on which member the record carries.
  workScope: { scope?: string | null; expression?: string | null } | null
}

/** GraphQL `data` payload shared by every activity-connection op. */
interface ActivitiesData {
  orgHypercertsClaimActivity?: {
    totalCount: number | null
    edges: { cursor: string; node: ActivityGraphQLNode | null }[]
    pageInfo: { hasNextPage: boolean; endCursor: string | null }
  } | null
}

/**
 * Map the indexer's projected workScope union into a value
 * `evaluateWorkScope` can render. The plain-string member surfaces as
 * `{ scope }`; the CEL member (`scope.hasAny([...])`) surfaces as
 * `{ expression }`, which `evaluateWorkScope` parses into a tag list.
 * Returns undefined when neither member carries a value.
 */
function mapWorkScope(
  workScope: ActivityGraphQLNode["workScope"],
): ActivityRecord["value"]["workScope"] {
  if (!workScope) return undefined
  if (typeof workScope.scope === "string" && workScope.scope.length > 0) {
    return { scope: workScope.scope }
  }
  if (typeof workScope.expression === "string" && workScope.expression.length > 0) {
    return { expression: workScope.expression }
  }
  return undefined
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
      workScope: mapWorkScope(node.workScope),
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
  /**
   * Server-side author-account-label include filter. Keeps only
   * records whose AUTHOR account carries one of these orglabeler
   * tier labels (account-quality labels live on the bare account
   * DID — magic-indexer#207). Composes with `authors` via AND.
   * Omit / empty array to skip.
   */
  authorLabels?: readonly string[]
  /**
   * Server-side author-account-label exclude filter. Drops records
   * whose author account carries one of these labels. Unlabeled
   * authors pass through. Omit / empty array to skip.
   */
  excludeAuthorLabels?: readonly string[]
  /** Full-text search query. Searched across title, shortDescription,
   *  description, and workScope. Terms are implicitly ANDed. */
  search?: string
  signal?: AbortSignal
}

/** Per-request URI cap for `ActivitiesByUris`. The upstream indexer
 *  rejects `where: { uri: { in: [...] } }` filters with more than 50
 *  values ("in list must contain 1 to 50 values"); the proxy validator
 *  mirrors that cap. Larger input sets get chunked into this many URIs
 *  per request and the results are merged client-side. */
const ACTIVITIES_BY_URIS_CHUNK = 50

/**
 * Fetch a specific set of activity URIs through the indexer (rather
 * than the PDS-direct `fetchActivitiesByUris`), applying optional
 * server-side label include / exclude filters at the same time. Used
 * by the explore page's Ma Earth featured-filter path: the URIs come
 * from the curator's collections, but the Quality popover should
 * still narrow that set.
 *
 * Returns the same shape as `fetchIndexerActivities`. Records that
 * 404 on the indexer (e.g. the curator listed a URI the indexer hasn't
 * ingested yet) are silently dropped — the surface's empty / partial
 * result behaviour matches the rest of the explore page.
 */
export async function fetchIndexerActivitiesByUris(
  uris: readonly string[],
  opts: {
    labels?: LabelValue[] | string[]
    excludeLabels?: LabelValue[] | string[]
    authorLabels?: readonly string[]
    excludeAuthorLabels?: readonly string[]
    signal?: AbortSignal
  } = {},
): Promise<IndexerActivitiesResult> {
  const emptyResult: IndexerActivitiesResult = {
    records: [], dids: new Map(), labels: new Map(), hasMore: false, endCursor: null, totalCount: null,
  }
  if (uris.length === 0) return emptyResult

  // Chunk to fit the indexer's per-page cap. Curated sets (e.g. the
  // Ma Earth featured filter) can carry well over 100 URIs across
  // their unioned collections; the indexer truncates at 100 silently,
  // so anything past that disappears from the result unless we
  // multi-page. Each chunk is a separate proxy call; results merge
  // client-side via Maps so duplicate URIs dedupe naturally.
  const chunks = chunkArray(uris, ACTIVITIES_BY_URIS_CHUNK)
  const responses = await Promise.all(
    chunks.map(async (chunk) => {
      const variables: Record<string, unknown> = {
        uris: [...chunk],
        labels: opts.labels && opts.labels.length > 0 ? opts.labels : null,
        excludeLabels:
          opts.excludeLabels && opts.excludeLabels.length > 0
            ? opts.excludeLabels
            : null,
        authorLabels:
          opts.authorLabels && opts.authorLabels.length > 0
            ? [...opts.authorLabels]
            : null,
        excludeAuthorLabels:
          opts.excludeAuthorLabels && opts.excludeAuthorLabels.length > 0
            ? [...opts.excludeAuthorLabels]
            : null,
      }
      const res = await postIndexer<ActivitiesData>("ActivitiesByUris", variables, {
        signal: opts.signal,
      })
      // HTTP-level failure → throw, even when the body carries a
      // GraphQL errors array (a 400/500 with errors is a request
      // failure, not a partial result). Callers surface their retry /
      // error paths on rejection.
      if (!res.ok) {
        const detail = res.errors.length > 0 ? `: ${res.errors[0].message}` : ""
        throw new Error(`Indexer request failed: ${res.status}${detail}`)
      }
      const connection = res.data?.orgHypercertsClaimActivity
      if (!connection) {
        // 200 with GraphQL errors = partial data (non-nullable nulls
        // propagate up and null the connection). Warn and fail soft.
        if (res.errors.length > 0) {
          console.warn("[Indexer] ActivitiesByUris error:", res.errors[0].message)
        }
        return null
      }
      return connection
    }),
  )

  const records: ActivityRecord[] = []
  const dids = new Map<string, string>()
  const recordLabels = new Map<string, LabelValue[]>()
  const seen = new Set<string>()
  let totalCount: number | null = null
  for (const connection of responses) {
    if (!connection) continue
    if (totalCount === null && typeof connection.totalCount === "number") {
      totalCount = connection.totalCount
    }
    for (const edge of connection.edges) {
      if (!edge.node) continue
      if (seen.has(edge.node.uri)) continue
      seen.add(edge.node.uri)
      records.push(nodeToActivityRecord(edge.node))
      dids.set(edge.node.uri, edge.node.did)
      recordLabels.set(edge.node.uri, (edge.node.labels ?? []) as LabelValue[])
    }
  }
  return {
    records,
    dids,
    labels: recordLabels,
    hasMore: false,
    endCursor: null,
    totalCount,
  }
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
  const {
    first = 20,
    after,
    labels,
    excludeLabels,
    authors,
    authorLabels,
    excludeAuthorLabels,
    search,
    signal,
  } = options

  const variables: Record<string, unknown> = {
    first,
    after: after ?? null,
    labels: labels && labels.length > 0 ? labels : null,
    excludeLabels: excludeLabels && excludeLabels.length > 0 ? excludeLabels : null,
    search: search || null,
    // Preserve the nil-vs-empty distinction: undefined => null (no filter),
    // [] => [] (explicit "match nothing"), non-empty => pass through.
    authors: authors !== undefined ? (authors.length > 0 ? authors : []) : null,
    authorLabels:
      authorLabels && authorLabels.length > 0 ? [...authorLabels] : null,
    excludeAuthorLabels:
      excludeAuthorLabels && excludeAuthorLabels.length > 0
        ? [...excludeAuthorLabels]
        : null,
  }

  const res = await postIndexer<ActivitiesData>("Activities", variables, { signal })

  // HTTP-level failure → throw, even when the body carries a GraphQL
  // errors array (per graphql-over-http a request error is returned
  // as a 400/500 WITH an errors body, and the proxy forwards the
  // upstream status verbatim). Treating that as an empty feed would
  // mask real defects as "no results"; callers already handle
  // rejections with their retry / error paths.
  if (!res.ok) {
    const detail = res.errors.length > 0 ? `: ${res.errors[0].message}` : ""
    throw new Error(`Indexer request failed: ${res.status}${detail}`)
  }

  const emptyResult: IndexerActivitiesResult = {
    records: [], dids: new Map(), labels: new Map(), hasMore: false, endCursor: null, totalCount: null,
  }

  // GraphQL can return partial data alongside errors on a 200 (e.g.
  // non-nullable field nulls propagate up and null the connection).
  // When the connection is missing on an OK response, log any errors
  // and return empty rather than crashing the feed.
  const connection = res.data?.orgHypercertsClaimActivity
  if (!connection) {
    if (res.errors.length > 0) {
      console.warn("[Indexer] GraphQL error, returning empty page:", res.errors[0].message)
    }
    return emptyResult
  }

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

  const res = await postIndexer<ActivitiesData>(operationName, variables, { signal })

  const emptyResult: IndexerActivitiesResult = {
    records: [], dids: new Map(), labels: new Map(), hasMore: false, endCursor: null, totalCount: null,
  }

  const connection = res.data?.orgHypercertsClaimActivity
  if (!connection) {
    if (res.errors.length > 0) {
      console.warn("[Indexer] GraphQL error, returning empty page:", res.errors[0].message)
    } else if (!res.ok) {
      throw new Error(`Indexer request failed: ${res.status}`)
    }
    return emptyResult
  }

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
// Domain modules — re-exported so the 30+ existing
// `from "@/lib/atproto/indexer"` import sites keep compiling unchanged.
// The sibling modules import the shared plumbing from the leaf module
// `indexer-client`, never from this barrel or each other, so the module
// graph is acyclic.
// ---------------------------------------------------------------------------

export * from "./indexer-funding"
export * from "./indexer-closure"
export * from "./indexer-counts"
export * from "./indexer-collections"
