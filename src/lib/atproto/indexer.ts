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

/**
 * Structured result of a single indexer-proxy POST. Carries the HTTP
 * status, the parsed GraphQL `data` payload, and the GraphQL `errors`
 * array side by side so every caller can apply its own policy without
 * re-parsing the envelope.
 */
export interface IndexerPostResult<T> {
  /** HTTP-level success (`response.ok`). */
  ok: boolean
  /** HTTP status code of the proxy response. */
  status: number
  /** Parsed GraphQL `data` field; null when missing or unparseable. */
  data: T | null
  /** GraphQL `errors` array; empty when the response carried none. */
  errors: { message: string; extensions?: { code?: string } }[]
}

/**
 * POST one GraphQL operation to the same-origin indexer proxy
 * ({@link INDEXER_PROXY_URL}) and return the envelope as a structured
 * {@link IndexerPostResult}.
 *
 * Contract:
 *
 *   - **Never throws on HTTP `!ok` or GraphQL errors.** Call sites
 *     disagree on policy — some throw with the status in the message,
 *     some warn and fail soft to an empty page, one branches on
 *     `errors[0].extensions?.code` — so the helper reports and the
 *     caller decides. GraphQL also returns partial data alongside
 *     errors (non-nullable nulls propagate up), which a thrown
 *     exception couldn't represent.
 *   - **Guarded body parse.** A malformed or empty body (e.g. an HTML
 *     502 page from the proxy) yields `data: null, errors: []`; the
 *     status code alone carries the signal.
 *   - **Aborts still reject.** An `AbortError` (from `fetch` or from
 *     the body read) is rethrown so callers' cancellation flows keep
 *     working. Other network-level rejections propagate as-is.
 */
export async function postIndexer<T>(
  operationName: string,
  variables: Record<string, unknown>,
  opts?: { signal?: AbortSignal },
): Promise<IndexerPostResult<T>> {
  const res = await fetch(INDEXER_PROXY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ operationName, variables }),
    signal: opts?.signal,
  })

  let data: T | null = null
  const errors: IndexerPostResult<T>["errors"] = []
  try {
    const json = (await res.json()) as {
      data?: T | null
      errors?:
        | ({ message?: unknown; extensions?: { code?: unknown } | null } | null)[]
        | null
    } | null
    data = json?.data ?? null
    if (Array.isArray(json?.errors)) {
      for (const err of json.errors) {
        if (typeof err?.message !== "string") continue
        const code = err.extensions?.code
        errors.push(
          typeof code === "string"
            ? { message: err.message, extensions: { code } }
            : { message: err.message },
        )
      }
    }
  } catch (err) {
    // An abort during the body read must keep rejecting like an
    // aborted fetch would.
    if (
      (err instanceof DOMException || err instanceof Error) &&
      err.name === "AbortError"
    ) {
      throw err
    }
    // Anything else is a malformed / empty body — fall through with
    // data null and errors [].
  }

  return { ok: res.ok, status: res.status, data, errors }
}

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
/** Per-request URI cap for `ActivitiesByUris`. The upstream indexer
 *  rejects `where: { uri: { in: [...] } }` filters with more than 50
 *  values ("in list must contain 1 to 50 values"); the proxy validator
 *  mirrors that cap. Larger input sets get chunked into this many URIs
 *  per request and the results are merged client-side. */
const ACTIVITIES_BY_URIS_CHUNK = 50

function chunkArray<T>(arr: readonly T[], size: number): T[][] {
  if (size <= 0) return [arr.slice()]
  const chunks: T[][] = []
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size))
  }
  return chunks
}

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
      const res = await fetch(INDEXER_PROXY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operationName: "ActivitiesByUris", variables }),
        signal: opts.signal,
      })
      const json = (await res.json()) as GraphQLResponse
      if (!json.data?.orgHypercertsClaimActivity) {
        if (json.errors?.length) {
          console.warn("[Indexer] ActivitiesByUris error:", json.errors[0].message)
        } else if (!res.ok) {
          throw new Error(`Indexer request failed: ${res.status}`)
        }
        return null
      }
      return json.data.orgHypercertsClaimActivity
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
// Funding receipts (org.hypercerts.funding.receipt)
// ---------------------------------------------------------------------------

/**
 * One side of a funding receipt's `from` / `to`. The indexer projects a
 * union that is either an AT Protocol account (`AppCertifiedDefsDid`,
 * carrying a `did`) or a free-text label
 * (`OrgHypercertsFundingReceiptText`, carrying a `value`). Discriminated
 * by `__typename`.
 */
export type FundingParty =
  | { kind: "account"; did: string }
  | { kind: "text"; value: string }
  | null

/**
 * One attestation of a funding payment, computed by the indexer. A
 * payment collapses every receipt that references the others via
 * `matchingReceipt` (with matching amount/currency/from/to/for) into a
 * single node; each receipt in that cluster contributes one
 * attestation. `role` is the receipt author's relationship to the
 * payment's `from`/`to`; `did` is the author. The display chips
 * (self-reported / mutually-confirmed / third-party) are derived from
 * the full set — see `funding-provenance.ts`. The provenance is
 * deliberately *not* a single ranked enum: a trustworthy third party
 * can be more credible than a self-report, and a payment can be both
 * self-reported and third-party-confirmed at once.
 */
export interface FundingAttestation {
  role: "recipient" | "sender" | "third-party"
  did: string
}

/**
 * A single `org.hypercerts.funding.receipt` record, with both sides of
 * the transfer normalised into {@link FundingParty}. `forUri` points at
 * an `org.hypercerts.claim.activity` when present.
 */
export interface FundingReceipt {
  uri: string
  cid: string
  did: string
  createdAt: string | null
  occurredAt: string | null
  /** Funding amount + currency as recorded (e.g. "0.1" / "USDC"). Either
   *  may be null when the receipt didn't record it. */
  amount: string | null
  currency: string | null
  from: FundingParty
  to: FundingParty
  forUri: string | null
  /** CID of the funded record's `for` strongRef. Carried for forthcoming
   *  receipt-to-activity verification (the same strongRef-integrity work as
   *  `attestations`, magic-indexer #214); not yet read by the UI. */
  forCid: string | null
  /** Optional payment-method metadata, as recorded on the receipt. The
   *  lexicon names are singular `paymentRail` (e.g. "x402-usdc-base") and
   *  `transactionId` (the on-chain / processor reference). Any may be
   *  null. */
  paymentRail: string | null
  paymentNetwork: string | null
  transactionId: string | null
  /** Free-text note attached to the receipt. */
  notes: string | null
  /** Strong reference to another receipt for the SAME payment that this one
   *  confirms (set on confirmation receipts; `null` on originals). Served by
   *  the indexer and also carried on the viewer's own optimistic confirmation.
   *  Used to collapse a confirmation onto its counterpart into one payment
   *  row before the indexer's cluster view catches up (issue #186). */
  matchingReceipt: { uri: string; cid: string } | null
  /** Attestations for the payment this node represents (indexer-computed
   *  from the `matchingReceipt`-linked cluster). Empty until the indexer
   *  ships the field (magic-indexer #214); the UI renders no chips then. */
  attestations: FundingAttestation[]
  /** The individual receipts collapsed into this payment node, set by the
   *  client-side {@link mergeMatchingReceipts}. Absent for a node straight
   *  from the indexer (only the canonical receipt is known then). Lets the
   *  detail view show one "Record" section per author. */
  members?: FundingReceipt[]
}

interface FundingPartyNode {
  __typename?: string
  did?: string | null
  value?: string | null
}

interface FundingAttestationNode {
  role?: string | null
  did?: string | null
}

interface FundingReceiptNode {
  uri: string
  cid: string
  did: string
  createdAt: string | null
  occurredAt: string | null
  amount: string | null
  currency: string | null
  from: FundingPartyNode | null
  to: FundingPartyNode | null
  for: { uri: string | null; cid: string | null } | null
  paymentRail: string | null
  paymentNetwork: string | null
  transactionId: string | null
  notes: string | null
  matchingReceipt?: { uri: string | null; cid: string | null } | null
  attestations?: FundingAttestationNode[] | null
}

interface FundingReceiptsGraphQLResponse {
  data?: {
    orgHypercertsFundingReceipt?: {
      totalCount: number | null
      edges: { cursor: string; node: FundingReceiptNode | null }[]
      pageInfo: { hasNextPage: boolean; endCursor: string | null }
    } | null
  } | null
  errors?: { message: string }[]
}

function mapFundingParty(node: FundingPartyNode | null): FundingParty {
  if (!node) return null
  if (node.__typename === "AppCertifiedDefsDid" && typeof node.did === "string") {
    return { kind: "account", did: node.did }
  }
  if (
    node.__typename === "OrgHypercertsFundingReceiptText" &&
    typeof node.value === "string"
  ) {
    return { kind: "text", value: node.value }
  }
  // Fall back on the populated field even when __typename is absent, so a
  // schema that drops the discriminator still resolves the party.
  if (typeof node.did === "string") return { kind: "account", did: node.did }
  if (typeof node.value === "string") return { kind: "text", value: node.value }
  return null
}

/** Normalise the indexer's attestation list, dropping entries with an
 *  unknown role or a missing DID so a schema drift can't surface a
 *  malformed chip. Returns [] when the field is absent (pre-#214). */
function mapFundingAttestations(
  nodes: FundingAttestationNode[] | null | undefined,
): FundingAttestation[] {
  if (!Array.isArray(nodes)) return []
  const out: FundingAttestation[] = []
  for (const node of nodes) {
    const did = node?.did
    const role = node?.role
    if (typeof did !== "string" || !did) continue
    if (role === "recipient" || role === "sender" || role === "third-party") {
      out.push({ role, did })
    }
  }
  return out
}

/** Normalise a raw funding-receipt node into a {@link FundingReceipt}.
 *  Shared by both the network-wide and per-activity fetchers so the field
 *  set stays in sync. */
function mapFundingReceiptNode(node: FundingReceiptNode): FundingReceipt {
  return {
    uri: node.uri,
    cid: node.cid,
    did: node.did,
    createdAt: node.createdAt ?? null,
    occurredAt: node.occurredAt ?? null,
    amount: node.amount ?? null,
    currency: node.currency ?? null,
    from: mapFundingParty(node.from),
    to: mapFundingParty(node.to),
    forUri: node.for?.uri ?? null,
    forCid: node.for?.cid ?? null,
    paymentRail: node.paymentRail ?? null,
    paymentNetwork: node.paymentNetwork ?? null,
    transactionId: node.transactionId ?? null,
    notes: node.notes ?? null,
    matchingReceipt:
      node.matchingReceipt?.uri && node.matchingReceipt?.cid
        ? { uri: node.matchingReceipt.uri, cid: node.matchingReceipt.cid }
        : null,
    attestations: mapFundingAttestations(node.attestations),
  }
}

export interface FundingReceiptsResult {
  records: FundingReceipt[]
  hasMore: boolean
  endCursor: string | null
  totalCount: number | null
}

/**
 * Parse a FundingReceipts GraphQL envelope into a {@link FundingReceiptsResult}.
 * Shared by the network-wide and per-activity fetchers so they stay in sync:
 * a missing connection logs the GraphQL error (or throws on a non-ok HTTP
 * status) and returns an empty page — the fail-soft contract both callers
 * rely on. `opName` only labels the warning so the two operations are
 * distinguishable in logs.
 */
function parseFundingReceiptsResponse(
  json: FundingReceiptsGraphQLResponse,
  res: Response,
  opName: string,
): FundingReceiptsResult {
  const empty: FundingReceiptsResult = {
    records: [],
    hasMore: false,
    endCursor: null,
    totalCount: null,
  }

  if (!json.data?.orgHypercertsFundingReceipt) {
    if (json.errors?.length) {
      console.warn(`[Indexer] ${opName} GraphQL error:`, json.errors[0].message)
    } else if (!res.ok) {
      throw new Error(`Indexer request failed: ${res.status}`)
    }
    return empty
  }

  const connection = json.data.orgHypercertsFundingReceipt
  const records: FundingReceipt[] = []
  for (const edge of connection.edges) {
    const node = edge.node
    if (!node) continue
    records.push(mapFundingReceiptNode(node))
  }

  return {
    records,
    hasMore: connection.pageInfo.hasNextPage,
    endCursor: connection.pageInfo.endCursor,
    totalCount: connection.totalCount,
  }
}

/**
 * Fetch a page of `org.hypercerts.funding.receipt` records. Both sides
 * are normalised into {@link FundingParty}; the explore loader applies
 * the "from OR to is an account" gate client-side (the indexer can't
 * filter by union variant). Mirrors {@link fetchProjects}: failures or
 * a missing connection return an empty page rather than throwing the
 * tab into an error state.
 */
export async function fetchFundingReceipts(
  options: {
    first?: number
    after?: string
    /** Account-quality (orglabeler) tiers the receipt creator must carry. */
    authorLabels?: readonly string[]
    /** Account-quality tiers that exclude a receipt by its creator. */
    excludeAuthorLabels?: readonly string[]
    /** Restrict to payments confirmed by a specific third-party attestor
     *  DID (magic-indexer #214). Omit for no filter; ignored upstream
     *  until the indexer ships it. */
    confirmedBy?: string
    signal?: AbortSignal
  } = {},
): Promise<FundingReceiptsResult> {
  const { first = 50, after, authorLabels, excludeAuthorLabels, confirmedBy, signal } =
    options

  const res = await fetch(INDEXER_PROXY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      operationName: "FundingReceipts",
      variables: {
        first,
        after: after ?? null,
        authorLabels: authorLabels && authorLabels.length > 0 ? [...authorLabels] : null,
        excludeAuthorLabels:
          excludeAuthorLabels && excludeAuthorLabels.length > 0
            ? [...excludeAuthorLabels]
            : null,
        confirmedBy: confirmedBy ?? null,
      },
    }),
    signal,
  })

  const json = (await res.json()) as FundingReceiptsGraphQLResponse
  return parseFundingReceiptsResponse(json, res, "FundingReceipts")
}

/**
 * Fetch a page of `org.hypercerts.funding.receipt` records whose `for`
 * strongRef points at a single activity (`forUri`). Returns the same
 * {@link FundingReceiptsResult} shape as {@link fetchFundingReceipts};
 * the only difference is the server-side `where: { for: { eq } }`
 * filter. Used by the activity detail page's Funding tab + overview
 * preview. Failures or a missing connection return an empty page
 * rather than throwing the surface into an error state.
 */
export async function fetchFundingReceiptsForActivity(
  forUri: string,
  options: { first?: number; after?: string; signal?: AbortSignal } = {},
): Promise<FundingReceiptsResult> {
  const { first = 50, after, signal } = options

  const res = await fetch(INDEXER_PROXY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      operationName: "FundingReceiptsForActivity",
      variables: { forUri, first, after: after ?? null },
    }),
    signal,
  })

  const json = (await res.json()) as FundingReceiptsGraphQLResponse
  return parseFundingReceiptsResponse(json, res, "FundingReceiptsForActivity")
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

/**
 * Exact deduped count of the activities a profile CREATED or
 * CONTRIBUTED to (the union, via the indexer's `_or` filter — see the
 * `UserActivityCount` op). One cheap `first: 1` query that reads only
 * `totalCount`. Returns null on any failure so callers fall back
 * gracefully instead of rendering a wrong number.
 */
export async function fetchUserActivityCount(
  did: string,
): Promise<number | null> {
  if (!did) return null
  try {
    const res = await fetch(INDEXER_PROXY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        operationName: "UserActivityCount",
        variables: { did },
      }),
    })
    if (!res.ok) return null
    const json = (await res.json()) as {
      data?: {
        orgHypercertsClaimActivity?: { totalCount?: number | null } | null
      }
      errors?: { message?: string }[]
    }
    if (json.errors && json.errors.length > 0) return null
    const total = json.data?.orgHypercertsClaimActivity?.totalCount
    return typeof total === "number" ? total : null
  } catch {
    return null
  }
}

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
        authorLabels:
          authorLabels && authorLabels.length > 0 ? [...authorLabels] : null,
        excludeAuthorLabels:
          excludeAuthorLabels && excludeAuthorLabels.length > 0
            ? [...excludeAuthorLabels]
            : null,
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
