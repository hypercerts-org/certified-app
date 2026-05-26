/**
 * Home-timeline feed client — magic-indexer #122.
 *
 * Two responsibilities:
 *
 *   1. `fetchFollowerEvents` — wraps the `FollowerEvents` server proxy
 *      op. Returns a paginated list of `FeedEvent`s (the union of the
 *      viewer's relevant lexicon-level create events across the
 *      follow set). Each event carries its denormalised `actor` so
 *      the renderer doesn't need a per-row profile lookup.
 *
 *   2. `hydrateFeedEvents` — wraps the `HydrateFeedPage` server proxy
 *      op. Takes the events from a page, buckets them by `kind`, and
 *      fetches the headline-render record for each kind in one
 *      GraphQL round-trip. Unknown kinds skip hydration (payload =
 *      null) — the dispatch site falls back to a generic actor +
 *      subjectUri card.
 *
 * Coded errors from the indexer (per the issue's contract) surface as
 * `FollowerEventsError` with a typed `code`:
 *
 *   - AUTHORS_REQUIRED          (defensive — proxy rejects first)
 *   - AUTHORS_FILTER_TOO_LARGE  (>500 unique DIDs after server-side
 *                                dedupe; client should pre-truncate)
 *   - INVALID_CURSOR            (opaque cursor failed to decode)
 *
 * Network / non-GraphQL errors throw plain `Error`.
 */

import type { ActivityRecord } from "./activity-types"
import type { CollectionRecord } from "./collection"
import {
  INDEXER_PROXY_URL,
  type ActivityGraphQLNode,
  type CollectionGraphQLNode,
  nodeToActivityRecord,
  nodeToCollectionRecord,
} from "./indexer"

// ============================================================================
// Constants
// ============================================================================

/** Server-enforced cap on `authors`. Client truncates to this before sending. */
export const MAX_AUTHORS_FILTER_SIZE = 500
/** Server-enforced cap on `first`. */
export const MAX_FEED_PAGE_SIZE = 50
export const DEFAULT_FEED_PAGE_SIZE = 20
/** Polling cadence when the tab is visible. */
export const FOREGROUND_POLL_MS = 30_000
/** Polling cadence when the tab is hidden (per issue's load planning). */
export const BACKGROUND_POLL_MS = 5 * 60_000

/**
 * Documented kinds in v1 of the FollowerEvents API. The wire type
 * `FeedEvent.kind` stays `string` (open union) because a new
 * server-side mapping may ship before the client updates — the
 * dispatch site narrows to a known kind or falls through to the
 * fallback card.
 */
export const KNOWN_FEED_EVENT_KINDS = [
  "cert.create",
  "collection.create",
  "badge.award",
  "legacy.endorsement",
] as const
export type KnownFeedEventKind = (typeof KNOWN_FEED_EVENT_KINDS)[number]

// ============================================================================
// Wire types
// ============================================================================

export interface FeedActor {
  did: string
  handle: string | null
  displayName: string | null
  avatarCid: string | null
  pds: string | null
}

export interface FeedEvent {
  /** at:// URI — stable across refreshes; use as React key. */
  id: string
  kind: string
  subjectUri: string
  /** RFC3339Nano, same clock-skew-clamped value as the record's sort_at. */
  sortAt: string
  actor: FeedActor
}

export interface FeedEventPage {
  events: FeedEvent[]
  endCursor: string | null
  hasNextPage: boolean
}

// ============================================================================
// Coded errors
// ============================================================================

export type FollowerEventsErrorCode =
  | "AUTHORS_REQUIRED"
  | "AUTHORS_FILTER_TOO_LARGE"
  | "INVALID_CURSOR"

export class FollowerEventsError extends Error {
  readonly code: FollowerEventsErrorCode | null
  constructor(message: string, code: FollowerEventsErrorCode | null) {
    super(message)
    this.name = "FollowerEventsError"
    this.code = code
  }
}

const KNOWN_ERROR_CODES: ReadonlySet<string> = new Set([
  "AUTHORS_REQUIRED",
  "AUTHORS_FILTER_TOO_LARGE",
  "INVALID_CURSOR",
])

function parseErrorCode(raw: string | undefined | null): FollowerEventsErrorCode | null {
  if (!raw) return null
  return KNOWN_ERROR_CODES.has(raw) ? (raw as FollowerEventsErrorCode) : null
}

// ============================================================================
// fetchFollowerEvents
// ============================================================================

export interface FetchFollowerEventsOptions {
  /**
   * Deduped, client-pre-truncated to MAX_AUTHORS_FILTER_SIZE. Empty
   * array is valid (and load-bearing): the upstream returns an empty
   * connection rather than an error.
   */
  authors: string[]
  first?: number
  after?: string
  kinds?: string[]
  signal?: AbortSignal
}

interface FollowerEventsResponse {
  data?: {
    followerEvents?: {
      edges: {
        cursor: string
        node: {
          id: string
          kind: string
          subjectUri: string
          sortAt: string
          actor: FeedActor
        } | null
      }[]
      pageInfo: { hasNextPage: boolean; endCursor: string | null }
    } | null
  } | null
  errors?: { message: string; extensions?: { code?: string } }[]
}

export async function fetchFollowerEvents(
  options: FetchFollowerEventsOptions,
): Promise<FeedEventPage> {
  const { authors, first = DEFAULT_FEED_PAGE_SIZE, after, kinds, signal } = options

  const res = await fetch(INDEXER_PROXY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      operationName: "FollowerEvents",
      variables: {
        authors,
        first,
        after: after ?? null,
        kinds: kinds && kinds.length > 0 ? kinds : null,
      },
    }),
    signal,
  })

  if (!res.ok) {
    throw new FollowerEventsError(
      `Indexer proxy returned ${res.status}`,
      null,
    )
  }

  const json = (await res.json()) as FollowerEventsResponse

  if (json.errors?.length) {
    const first = json.errors[0]
    throw new FollowerEventsError(
      first.message,
      parseErrorCode(first.extensions?.code),
    )
  }

  if (!json.data?.followerEvents) {
    throw new FollowerEventsError(
      "Indexer returned no followerEvents payload",
      null,
    )
  }

  const conn = json.data.followerEvents
  const events: FeedEvent[] = []
  for (const edge of conn.edges) {
    if (!edge.node) continue
    events.push({
      id: edge.node.id,
      kind: edge.node.kind,
      subjectUri: edge.node.subjectUri,
      sortAt: edge.node.sortAt,
      actor: edge.node.actor,
    })
  }

  return {
    events,
    endCursor: conn.pageInfo.endCursor,
    hasNextPage: conn.pageInfo.hasNextPage,
  }
}

// ============================================================================
// Hydration
// ============================================================================

export interface HydratedPayloadActivity {
  kind: "cert.create"
  record: ActivityRecord
}

export interface HydratedPayloadCollection {
  kind: "collection.create"
  record: CollectionRecord
}

export interface HydratedPayloadBadgeAward {
  kind: "badge.award"
  subjectDid: string
  note: string | null
  createdAt: string
}

export interface HydratedPayloadLegacyEndorsement {
  kind: "legacy.endorsement"
  subjectDid: string
  createdAt: string
}

export type HydratedPayload =
  | HydratedPayloadActivity
  | HydratedPayloadCollection
  | HydratedPayloadBadgeAward
  | HydratedPayloadLegacyEndorsement

export interface HydratedFeedEvent {
  event: FeedEvent
  /** null when the by-URI lookup 404'd OR when the kind is unknown. */
  payload: HydratedPayload | null
}

interface BadgeAwardGraphQLNode {
  uri: string
  cid: string
  did: string
  createdAt: string
  note: string | null
  subject: { did: string } | null
}

interface LegacyEndorsementGraphQLNode {
  uri: string
  did: string
  createdAt: string
  subject: { did: string } | null
}

interface CollectionWithTypeGraphQLNode extends CollectionGraphQLNode {
  type?: string | null
}

interface HydrateFeedPageResponse {
  data?: {
    activities?: { edges: { node: ActivityGraphQLNode | null }[] } | null
    collections?: {
      edges: { node: CollectionWithTypeGraphQLNode | null }[]
    } | null
    badgeAwards?: { edges: { node: BadgeAwardGraphQLNode | null }[] } | null
    legacyEndorsements?: {
      edges: { node: LegacyEndorsementGraphQLNode | null }[]
    } | null
  } | null
  errors?: { message: string }[]
}

/**
 * One request hydrates one page. Events with unknown `kind` are
 * preserved in the output with `payload: null` so the dispatch site
 * can render the fallback card.
 */
export async function hydrateFeedEvents(
  events: FeedEvent[],
  signal?: AbortSignal,
): Promise<HydratedFeedEvent[]> {
  if (events.length === 0) return []

  const activityUris: string[] = []
  const collectionUris: string[] = []
  const badgeAwardUris: string[] = []
  const legacyEndorsementUris: string[] = []

  for (const ev of events) {
    switch (ev.kind) {
      case "cert.create":
        activityUris.push(ev.subjectUri)
        break
      case "collection.create":
        collectionUris.push(ev.subjectUri)
        break
      case "badge.award":
        badgeAwardUris.push(ev.subjectUri)
        break
      case "legacy.endorsement":
        legacyEndorsementUris.push(ev.subjectUri)
        break
      // Unknown kinds skip hydration.
    }
  }

  const haveAny =
    activityUris.length +
      collectionUris.length +
      badgeAwardUris.length +
      legacyEndorsementUris.length >
    0
  if (!haveAny) {
    // Every event is an unknown kind; the dispatch site renders the
    // fallback card for each, no hydration round-trip needed.
    return events.map((event) => ({ event, payload: null }))
  }

  const res = await fetch(INDEXER_PROXY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      operationName: "HydrateFeedPage",
      variables: {
        activityUris,
        collectionUris,
        badgeAwardUris,
        legacyEndorsementUris,
      },
    }),
    signal,
  })

  if (!res.ok) {
    throw new Error(`Hydration request failed: ${res.status}`)
  }

  const json = (await res.json()) as HydrateFeedPageResponse

  if (json.errors?.length) {
    // GraphQL can return partial data alongside errors. Log and keep
    // going — events whose hydration failed will fall through to the
    // fallback card via `payload: null`.
    console.warn(
      "[follower-events] HydrateFeedPage error:",
      json.errors[0].message,
    )
  }

  const payloadByUri = new Map<string, HydratedPayload>()

  for (const edge of json.data?.activities?.edges ?? []) {
    if (!edge.node) continue
    payloadByUri.set(edge.node.uri, {
      kind: "cert.create",
      record: nodeToActivityRecord(edge.node),
    })
  }
  for (const edge of json.data?.collections?.edges ?? []) {
    if (!edge.node) continue
    const record = nodeToCollectionRecord(edge.node)
    if (edge.node.type) {
      record.value.type = edge.node.type
    }
    payloadByUri.set(edge.node.uri, {
      kind: "collection.create",
      record,
    })
  }
  for (const edge of json.data?.badgeAwards?.edges ?? []) {
    if (!edge.node || !edge.node.subject) continue
    payloadByUri.set(edge.node.uri, {
      kind: "badge.award",
      subjectDid: edge.node.subject.did,
      note: edge.node.note,
      createdAt: edge.node.createdAt,
    })
  }
  for (const edge of json.data?.legacyEndorsements?.edges ?? []) {
    if (!edge.node || !edge.node.subject) continue
    payloadByUri.set(edge.node.uri, {
      kind: "legacy.endorsement",
      subjectDid: edge.node.subject.did,
      createdAt: edge.node.createdAt,
    })
  }

  return events.map((event) => ({
    event,
    payload: payloadByUri.get(event.subjectUri) ?? null,
  }))
}
