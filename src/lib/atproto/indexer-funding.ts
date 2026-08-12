import { postIndexer, type IndexerPostResult } from "./indexer-client"

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

/** GraphQL `data` payload shared by both funding-receipt ops. */
interface FundingReceiptsData {
  orgHypercertsFundingReceipt?: {
    totalCount: number | null
    edges: { cursor: string; node: FundingReceiptNode | null }[]
    pageInfo: { hasNextPage: boolean; endCursor: string | null }
  } | null
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
 * Parse a FundingReceipts proxy result into a {@link FundingReceiptsResult}.
 * Shared by the network-wide and per-activity fetchers so they stay in sync:
 * a missing connection logs the GraphQL error (or throws on a non-ok HTTP
 * status) and returns an empty page — the fail-soft contract both callers
 * rely on. `opName` only labels the warning so the two operations are
 * distinguishable in logs.
 */
function parseFundingReceiptsResponse(
  result: IndexerPostResult<FundingReceiptsData>,
  opName: string,
): FundingReceiptsResult {
  const empty: FundingReceiptsResult = {
    records: [],
    hasMore: false,
    endCursor: null,
    totalCount: null,
  }

  const connection = result.data?.orgHypercertsFundingReceipt
  if (!connection) {
    if (result.errors.length > 0) {
      console.warn(`[Indexer] ${opName} GraphQL error:`, result.errors[0].message)
    } else if (!result.ok) {
      throw new Error(`Indexer request failed: ${result.status}`)
    }
    return empty
  }

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

  const result = await postIndexer<FundingReceiptsData>(
    "FundingReceipts",
    {
      first,
      after: after ?? null,
      authorLabels: authorLabels && authorLabels.length > 0 ? [...authorLabels] : null,
      excludeAuthorLabels:
        excludeAuthorLabels && excludeAuthorLabels.length > 0
          ? [...excludeAuthorLabels]
          : null,
      confirmedBy: confirmedBy ?? null,
    },
    { signal },
  )

  return parseFundingReceiptsResponse(result, "FundingReceipts")
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

  const result = await postIndexer<FundingReceiptsData>(
    "FundingReceiptsForActivity",
    { forUri, first, after: after ?? null },
    { signal },
  )

  return parseFundingReceiptsResponse(result, "FundingReceiptsForActivity")
}
