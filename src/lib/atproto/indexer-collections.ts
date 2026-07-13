import type { CollectionRecord, CollectionValue } from "./collection"
import { getBlobRefLink } from "./types"
import { chunkArray, postIndexer } from "./indexer-client"

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

/** GraphQL `data` payload shared by the paginated collection ops. */
interface CollectionsData {
  orgHypercertsCollection?: {
    totalCount: number | null
    edges: { cursor: string; node: CollectionGraphQLNode | null }[]
    pageInfo: { hasNextPage: boolean; endCursor: string | null }
  } | null
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
    authorLabels?: readonly string[]
    excludeAuthorLabels?: readonly string[]
    search?: string
    signal?: AbortSignal
  } = {},
): Promise<UserProjectsResult> {
  const {
    first = 24,
    after,
    authors,
    authorLabels,
    excludeAuthorLabels,
    search,
    signal,
  } = options

  const res = await postIndexer<CollectionsData>(
    "Projects",
    {
      first,
      after: after ?? null,
      authors:
        authors === undefined ? null : authors.length > 0 ? authors : [],
      authorLabels:
        authorLabels && authorLabels.length > 0 ? [...authorLabels] : null,
      excludeAuthorLabels:
        excludeAuthorLabels && excludeAuthorLabels.length > 0
          ? [...excludeAuthorLabels]
          : null,
      search: search || null,
    },
    { signal },
  )

  const empty: UserProjectsResult = {
    records: [],
    hasMore: false,
    endCursor: null,
    totalCount: null,
  }

  const connection = res.data?.orgHypercertsCollection
  if (!connection) {
    if (res.errors.length > 0) {
      console.warn(
        "[Indexer] Projects GraphQL error:",
        res.errors[0].message,
      )
    } else if (!res.ok) {
      throw new Error(`Indexer request failed: ${res.status}`)
    }
    return empty
  }

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

/** Per-request URI cap for `CollectionsByUris`. The proxy validator
 *  enforces the same `MAX_URI_LIST_PER_KIND` (50) cap as
 *  `ActivitiesByUris` (mirroring the upstream indexer's "in list must
 *  contain 1 to 50 values" limit), so larger curated sets are chunked
 *  and the results merged client-side — same convention as
 *  `fetchIndexerActivitiesByUris`. */
const COLLECTIONS_BY_URIS_CHUNK = 50

interface CollectionsByUrisData {
  orgHypercertsCollection?: {
    edges: {
      node: (CollectionGraphQLNode & { type?: string | null }) | null
    }[]
  } | null
}

export interface IndexerProjectsByUrisResult {
  /** Resolved records mapped through {@link nodeToCollectionRecord}
   *  (the same shape every other indexer collections fetcher returns),
   *  deduped by URI, in the indexer's own order. Callers that care
   *  about the curator's item order re-sort against their input list. */
  records: CollectionRecord[]
  /** False when any chunk failed at the HTTP level or carried GraphQL
   *  errors — e.g. the deployed indexer doesn't support the
   *  `uri: { in }` filter on `orgHypercertsCollection` yet. Callers
   *  treat false as "batch unavailable" and fall back to the per-URI
   *  PDS path instead of rendering a silently partial set. */
  ok: boolean
}

/**
 * Batch fetch of specific `org.hypercerts.collection` (project) URIs
 * through the indexer — the collections counterpart of
 * `fetchIndexerActivitiesByUris`. Used by the explore page's
 * Ma Earth featured Projects filter instead of fanning out one PDS
 * getRecord per curated URI (curated sets can carry well over 100
 * URIs).
 *
 * Fail-soft contract: HTTP failures and GraphQL errors are reported
 * via `ok: false`, never thrown (the `postIndexer` policy), so the
 * caller can fall back to the PDS path. Aborts still reject. Records
 * the indexer hasn't ingested are silently absent from `records` —
 * the same accepted tradeoff as the certs featured path.
 */
export async function fetchIndexerProjectsByUris(
  uris: string[],
  signal?: AbortSignal,
): Promise<IndexerProjectsByUrisResult> {
  if (uris.length === 0) return { records: [], ok: true }

  const chunks = chunkArray(uris, COLLECTIONS_BY_URIS_CHUNK)
  const responses = await Promise.all(
    chunks.map((chunk) =>
      postIndexer<CollectionsByUrisData>(
        "CollectionsByUris",
        { uris: [...chunk] },
        signal ? { signal } : undefined,
      ),
    ),
  )

  const records: CollectionRecord[] = []
  const seen = new Set<string>()
  let ok = true
  for (const res of responses) {
    const connection = res.data?.orgHypercertsCollection
    if (!res.ok || res.errors.length > 0 || !connection) {
      if (res.errors.length > 0) {
        console.warn(
          "[Indexer] CollectionsByUris error:",
          res.errors[0].message,
        )
      }
      ok = false
      continue
    }
    for (const edge of connection.edges) {
      if (!edge.node) continue
      if (seen.has(edge.node.uri)) continue
      seen.add(edge.node.uri)
      records.push(nodeToCollectionRecord(edge.node))
    }
  }
  return { records, ok }
}

/**
 * Fetch `org.hypercerts.collection` records authored by `did` whose
 * `type === "project"` (case-insensitive). Replaces the per-DID PDS
 * listRecords scan with a single indexer call.
 *
 * Records that store the legacy `value.name` (title fallback) or
 * `value.image` (banner fallback) fields will land here with neither
 * surfaced — see the UserProjects op comment in
 * src/app/api/indexer/operations.ts for why. The
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

  const res = await postIndexer<CollectionsData>(
    "UserProjects",
    { did, first, after: after ?? null },
    { signal },
  )

  const empty: UserProjectsResult = {
    records: [],
    hasMore: false,
    endCursor: null,
    totalCount: null,
  }

  const connection = res.data?.orgHypercertsCollection
  if (!connection) {
    if (res.errors.length > 0) {
      console.warn(
        "[Indexer] UserProjects GraphQL error:",
        res.errors[0].message,
      )
    } else if (!res.ok) {
      throw new Error(`Indexer request failed: ${res.status}`)
    }
    return empty
  }

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
