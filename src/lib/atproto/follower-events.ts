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
import { getBlobRefLink } from "./types"

// ============================================================================
// Constants
// ============================================================================

/** Server-enforced cap on `authors`. Client truncates to this before sending. */
export const MAX_AUTHORS_FILTER_SIZE = 500
/** Server-enforced cap on `first`. */
export const MAX_FEED_PAGE_SIZE = 50
export const DEFAULT_FEED_PAGE_SIZE = 20

// ============================================================================
// Wire types
// ============================================================================

export interface FeedActor {
  did: string
  handle: string | null
  displayName: string | null
  avatarCid: string | null
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

/**
 * Server-side pagination order for `followerEvents` (magic-indexer
 * #136 / PR #137).
 *
 *   - `SORT_AT` (default) — paginates by the indexer's
 *     clock-skew-clamped `sort_at`. Stable post-indexing.
 *   - `CREATED_AT` — paginates by the record's own `createdAt`.
 *     Matches the "X ago" timestamp the home feed renders, so cross-
 *     page scrolling stays visually-stable for backfilled records
 *     whose `sort_at` differs from `createdAt`.
 *
 * The cursor encodes the sort mode internally; mixing modes on the
 * same paginated stream surfaces as `INVALID_CURSOR` from the indexer.
 */
export type FollowerEventsSort = "SORT_AT" | "CREATED_AT"

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
  sortBy?: FollowerEventsSort
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
  const { authors, first = DEFAULT_FEED_PAGE_SIZE, after, kinds, sortBy, signal } = options

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
        sortBy: sortBy ?? null,
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
  /** Hyperlabel tier labels active on the cert, or [] if none. */
  labels: string[]
}

export interface HydratedPayloadCollection {
  kind: "collection.create"
  record: CollectionRecord
}

export interface HydratedPayloadEndorsementAward {
  kind: "endorsement.award"
  subjectDid: string
  note: string | null
  createdAt: string
}

export interface HydratedPayloadLegacyEndorsement {
  kind: "legacy.endorsement"
  subjectDid: string
  createdAt: string
}

/**
 * The four single-record kinds added by magic-indexer #125
 * (evaluation, measurement, hyperboard, update). Headline payload is
 * a uniform `{ title, createdAt, targetUri, shortDescription, imageUrl }`:
 *   - `title` is the kind-specific headline string (evaluation
 *     summary, measurement metric, attachment title, null for
 *     hyperboard).
 *   - `targetUri` is the at:// URI of the cert/project the event
 *     references, when the lexicon carries one — evaluations link
 *     to a single cert via `subject`, measurements + attachments
 *     via the first entry in `subjects[]`. Hyperboard doesn't
 *     expose a target; the field is null for that one.
 *   - `shortDescription` is the kind-specific preview snippet —
 *     today only attachment.create populates it (the lexicon's
 *     `shortDescription` field); the others stay null and the
 *     renderer falls back to the single-line sentence.
 *   - `imageUrl` is the preview thumbnail URL. update.create
 *     resolves it from the FIRST `content[]` item that's a
 *     smallBlob with an `image/*` mimeType (so a PDF-only
 *     attachment renders without a thumb instead of trying to
 *     serve the PDF as an image). The other kinds leave it null.
 */
export interface HydratedPayloadSimpleRecord {
  kind:
    | "evaluation.create"
    | "measurement.create"
    | "hyperboard.create"
    | "update.create"
  title: string | null
  createdAt: string
  targetUri: string | null
  shortDescription: string | null
  imageUrl: string | null
}

export type HydratedPayload =
  | HydratedPayloadActivity
  | HydratedPayloadCollection
  | HydratedPayloadEndorsementAward
  | HydratedPayloadLegacyEndorsement
  | HydratedPayloadSimpleRecord

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

interface CollectionWithTypeGraphQLNode extends CollectionGraphQLNode {
  type?: string | null
}

interface StrongRefNode {
  uri: string
  cid: string
}

interface EvaluationGraphQLNode {
  uri: string
  cid: string
  did: string
  createdAt: string
  summary: string | null
  subject: StrongRefNode | null
}

interface MeasurementGraphQLNode {
  uri: string
  cid: string
  did: string
  createdAt: string
  metric: string | null
  value: string | null
  unit: string | null
  subjects: StrongRefNode[] | null
}

interface HyperboardGraphQLNode {
  uri: string
  cid: string
  did: string
  createdAt: string
}

interface AttachmentContentItem {
  __typename: string
  uri?: string | null
  blob?: { ref?: string | null; mimeType?: string | null } | null
}

interface AttachmentGraphQLNode {
  uri: string
  cid: string
  did: string
  createdAt: string
  title: string | null
  shortDescription: string | null
  subjects: StrongRefNode[] | null
  content: AttachmentContentItem[] | null
}

interface HydrateFeedPageResponse {
  data?: {
    activities?: { edges: { node: ActivityGraphQLNode | null }[] } | null
    collections?: {
      edges: { node: CollectionWithTypeGraphQLNode | null }[]
    } | null
    badgeAwards?: { edges: { node: BadgeAwardGraphQLNode | null }[] } | null
    evaluations?: { edges: { node: EvaluationGraphQLNode | null }[] } | null
    measurements?: { edges: { node: MeasurementGraphQLNode | null }[] } | null
    hyperboards?: { edges: { node: HyperboardGraphQLNode | null }[] } | null
    attachments?: { edges: { node: AttachmentGraphQLNode | null }[] } | null
  } | null
  errors?: { message: string }[]
}

export interface HydrateFeedEventsOptions {
  signal?: AbortSignal
  /**
   * Cert-quality labels to exclude on the hydration round-trip
   * (passed through to the `activities` connection's
   * `excludeLabels` arg). Default behaviour at the caller's
   * discretion — see `DEFAULT_HIDDEN_CERT_LABELS` in
   * `src/lib/atproto/labels.ts` for the recommended set.
   * Events whose subject is filtered out get `payload: null` in
   * the result; the dispatch site decides whether to drop or
   * render them as a degraded card.
   */
  excludeCertLabels?: readonly string[]
  /**
   * If set, narrow cert hydration to records carrying one of these
   * labels. Used when the home-feed quality popover has "Not labeled
   * yet" UNCHECKED — only labelled records pass, unlabeled ones drop.
   * Mutually exclusive with `excludeCertLabels` in practice (the
   * caller picks one mode); both being non-empty is also valid but
   * unusual.
   */
  includeCertLabels?: readonly string[]
}

/**
 * One request hydrates one page. Events with unknown `kind` are
 * preserved in the output with `payload: null` so the dispatch site
 * can render the fallback card.
 *
 * Accepts either an `AbortSignal` (legacy positional) or an options
 * object so callers can pass the cert-label exclusion without
 * threading an `excludeCertLabels` arg through every call site.
 */
export async function hydrateFeedEvents(
  events: FeedEvent[],
  signalOrOptions?: AbortSignal | HydrateFeedEventsOptions,
): Promise<HydratedFeedEvent[]> {
  const opts: HydrateFeedEventsOptions =
    signalOrOptions instanceof AbortSignal
      ? { signal: signalOrOptions }
      : (signalOrOptions ?? {})
  const { signal, excludeCertLabels, includeCertLabels } = opts
  if (events.length === 0) return []

  const activityUris: string[] = []
  const collectionUris: string[] = []
  const badgeAwardUris: string[] = []
  const evaluationUris: string[] = []
  const measurementUris: string[] = []
  const hyperboardUris: string[] = []
  const attachmentUris: string[] = []

  for (const ev of events) {
    switch (ev.kind) {
      case "cert.create":
        activityUris.push(ev.subjectUri)
        break
      case "collection.create":
      case "project.created_with_cert":
        // Same hydration as a plain collection.create — subjectUri
        // is the project's collection URI. The kind-discriminator
        // is preserved by the caller via the original event.kind.
        collectionUris.push(ev.subjectUri)
        break
      case "endorsement.award":
      case "badge.award":
        badgeAwardUris.push(ev.subjectUri)
        break
      case "evaluation.create":
        evaluationUris.push(ev.subjectUri)
        break
      case "measurement.create":
        measurementUris.push(ev.subjectUri)
        break
      case "hyperboard.create":
        hyperboardUris.push(ev.subjectUri)
        break
      case "update.create":
        attachmentUris.push(ev.subjectUri)
        break
      // Unknown kinds skip hydration — the dispatch site renders a
      // fallback card for each without a round-trip.
    }
  }

  const totalToHydrate =
    activityUris.length +
    collectionUris.length +
    badgeAwardUris.length +
    evaluationUris.length +
    measurementUris.length +
    hyperboardUris.length +
    attachmentUris.length
  if (totalToHydrate === 0) {
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
        evaluationUris,
        measurementUris,
        hyperboardUris,
        attachmentUris,
        activityExcludeLabels:
          excludeCertLabels && excludeCertLabels.length > 0
            ? [...excludeCertLabels]
            : null,
        activityIncludeLabels:
          includeCertLabels && includeCertLabels.length > 0
            ? [...includeCertLabels]
            : null,
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
      labels: edge.node.labels ?? [],
    })
  }
  for (const edge of json.data?.collections?.edges ?? []) {
    if (!edge.node) continue
    const record = nodeToCollectionRecord(edge.node)
    // nodeToCollectionRecord hardcodes `type: "project"` because the
    // existing UserProjects op pre-filters by type. HydrateFeedPage
    // queries by URI and returns any collection type, so override —
    // but only when the indexer actually returned a non-empty string.
    // For null / undefined / empty-string, strip the default rather
    // than letting renderers silently mislabel a typeless collection.
    if (typeof edge.node.type === "string" && edge.node.type.length > 0) {
      record.value.type = edge.node.type
    } else {
      delete record.value.type
    }
    payloadByUri.set(edge.node.uri, {
      kind: "collection.create",
      record,
    })
  }
  for (const edge of json.data?.badgeAwards?.edges ?? []) {
    if (!edge.node || !edge.node.subject) continue
    payloadByUri.set(edge.node.uri, {
      kind: "endorsement.award",
      subjectDid: edge.node.subject.did,
      note: edge.node.note,
      createdAt: edge.node.createdAt,
    })
  }
  // The four new simple-record kinds collapse onto a single shape —
  // {title, createdAt} — because they render with the same chrome in
  // v1. Source lexicon for the headline string differs per kind
  // (the lexicons have different real field names; the renderer
  // doesn't care):
  //   - evaluation: `summary`
  //   - measurement: `metric` (richer body could combine value + unit
  //     later, but the headline is the metric itself)
  //   - hyperboard: nothing — lexicon is sparse, no headline field
  //     until @hypercerts-org/lexicon is enriched (magic-indexer#129
  //     §3). Renders as the actor + verb sentence alone.
  //   - update: attachment's `title`
  for (const edge of json.data?.evaluations?.edges ?? []) {
    if (!edge.node) continue
    payloadByUri.set(edge.node.uri, {
      kind: "evaluation.create",
      title: edge.node.summary,
      createdAt: edge.node.createdAt,
      targetUri: edge.node.subject?.uri ?? null,
      shortDescription: null,
      imageUrl: null,
    })
  }
  for (const edge of json.data?.measurements?.edges ?? []) {
    if (!edge.node) continue
    payloadByUri.set(edge.node.uri, {
      kind: "measurement.create",
      title: edge.node.metric,
      createdAt: edge.node.createdAt,
      // The lexicon allows multiple subjects, but the v1 sentence
      // ("X added a measurement to <cert>") names one cert — take
      // the first reference. Later cards can show a count if needed.
      targetUri: edge.node.subjects?.[0]?.uri ?? null,
      shortDescription: null,
      imageUrl: null,
    })
  }
  for (const edge of json.data?.hyperboards?.edges ?? []) {
    if (!edge.node) continue
    payloadByUri.set(edge.node.uri, {
      kind: "hyperboard.create",
      title: null,
      createdAt: edge.node.createdAt,
      targetUri: null,
      shortDescription: null,
      imageUrl: null,
    })
  }
  for (const edge of json.data?.attachments?.edges ?? []) {
    if (!edge.node) continue
    payloadByUri.set(edge.node.uri, {
      kind: "update.create",
      title: edge.node.title,
      createdAt: edge.node.createdAt,
      // Same heuristic as measurements: the lexicon allows multiple
      // subjects (an attachment can reference an activity claim, a
      // project, an evaluation, etc.). The v1 sentence "posted an
      // update to <X>" names one; take the first.
      targetUri: edge.node.subjects?.[0]?.uri ?? null,
      shortDescription: edge.node.shortDescription,
      imageUrl: firstAttachmentImageUrl(edge.node),
    })
  }

  return events.map((event) => ({
    event,
    payload: payloadByUri.get(event.subjectUri) ?? null,
  }))
}

/**
 * Pick the first `content[]` entry that's a smallBlob with an
 * `image/*` mimeType and build the getBlob proxy URL for it. Returns
 * null when the attachment has no image content (e.g. PDF-only
 * uploads), letting the preview card fall back to its no-image
 * layout instead of trying to render a non-image blob as an `<img>`.
 *
 * The lexicon (`org.hypercerts.context.attachment`) allows the
 * `content` array to mix URI links + small blobs (images, PDFs,
 * other documents). For a feed thumbnail we want the first image,
 * not the first arbitrary blob — serving a PDF blob through an
 * `<img>` element would render broken.
 */
function firstAttachmentImageUrl(node: AttachmentGraphQLNode): string | null {
  if (!Array.isArray(node.content)) return null
  for (const item of node.content) {
    if (item.__typename !== "OrgHypercertsDefsSmallBlob") continue
    const mime = item.blob?.mimeType
    if (typeof mime !== "string" || !mime.startsWith("image/")) continue
    const cid = item.blob?.ref ? getBlobRefLink(item.blob.ref) : null
    if (!cid) continue
    return `/api/xrpc/com/atproto/sync/getBlob?did=${encodeURIComponent(node.did)}&cid=${encodeURIComponent(cid)}`
  }
  return null
}
