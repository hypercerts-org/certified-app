import { authFetch } from "@/lib/auth/fetch"
import type { FundingParty, FundingReceipt } from "./indexer"

/**
 * Write layer for `org.hypercerts.funding.receipt`. The read side
 * ({@link FundingReceipt}, the indexer fetchers, the provenance helpers)
 * lives in `indexer.ts` / `funding-provenance.ts`; this module builds the
 * on-the-wire record and publishes it to the author's own repo.
 *
 * Both "record a payment" and "confirm a payment" publish the *same*
 * record type — there is no separate confirmation lexicon. The magic-
 * indexer clusters receipts that share the same payment coordinates
 * (`amount` / `currency` / `from` / `to` / `for`) into one payment node,
 * and derives each receipt's attestation `role` from the author DID vs
 * that receipt's own `from`/`to` (== from → sender, == to → recipient,
 * else → third-party). So a confirmation is just a second receipt with
 * the original's coordinates, authored by the confirmer — see
 * {@link buildConfirmationRecord}.
 *
 * Record shape verified against a live record + the lexicon at
 * hypercerts-org/hypercerts-lexicon (lexicons/org/hypercerts/funding/receipt.json):
 * required `to` / `amount` / `currency` / `createdAt`; optional `from`,
 * `for` (strongRef), `occurredAt`, `paymentRail`, `paymentNetwork`,
 * `transactionId`, `notes`. `from`/`to` are a union of an account DID
 * (`app.certified.defs#did`), free text (`#text`), or a strongRef.
 */

export const FUNDING_RECEIPT_COLLECTION = "org.hypercerts.funding.receipt"

const PARTY_DID_TYPE = "app.certified.defs#did"
const PARTY_TEXT_TYPE = "org.hypercerts.funding.receipt#text"

/** A `com.atproto.repo.strongRef` — the `for` target. */
export interface StrongRef {
  uri: string
  cid: string
}

/** The lexicon union variants this app writes for `from` / `to`. (The
 *  lexicon also permits a bare strongRef, which we don't author here.) */
export type FundingPartyRecord =
  | { $type: typeof PARTY_DID_TYPE; did: string }
  | { $type: typeof PARTY_TEXT_TYPE; value: string }

/**
 * Map the app's normalised {@link FundingParty} to the lexicon union.
 * Returns `undefined` for a null party so optional `from` can be dropped.
 */
export function fundingPartyToRecord(
  party: FundingParty,
): FundingPartyRecord | undefined {
  if (!party) return undefined
  if (party.kind === "account") return { $type: PARTY_DID_TYPE, did: party.did }
  return { $type: PARTY_TEXT_TYPE, value: party.value }
}

/** The `org.hypercerts.funding.receipt` record as published to a repo. */
export interface FundingReceiptRecord {
  $type: typeof FUNDING_RECEIPT_COLLECTION
  to: FundingPartyRecord
  from?: FundingPartyRecord
  amount: string
  currency: string
  for?: StrongRef
  /** Strong reference to another receipt for the SAME payment — set on a
   *  confirmation to link it to the receipt it confirms. The indexer
   *  clusters receipts joined by `matchingReceipt` into one payment node. */
  matchingReceipt?: StrongRef
  occurredAt?: string
  paymentRail?: string
  paymentNetwork?: string
  transactionId?: string
  notes?: string
  createdAt: string
}

export interface BuildFundingReceiptInput {
  /** Recipient — required by the lexicon; a null value is rejected. */
  to: FundingParty
  from?: FundingParty
  amount: string
  currency: string
  for?: StrongRef | null
  /** A receipt for the same payment this one confirms (a confirmation link). */
  matchingReceipt?: StrongRef | null
  occurredAt?: string | null
  paymentRail?: string | null
  paymentNetwork?: string | null
  transactionId?: string | null
  notes?: string | null
  /** Defaults to now; pass an explicit value for deterministic tests. */
  createdAt?: string
}

/**
 * Build a {@link FundingReceiptRecord} from form input, dropping empty
 * optionals so a sparse receipt stays compact. Throws when `to` is null
 * (the lexicon requires a recipient).
 */
export function buildFundingReceiptRecord(
  input: BuildFundingReceiptInput,
): FundingReceiptRecord {
  const to = fundingPartyToRecord(input.to)
  if (!to) throw new Error("A funding receipt requires a recipient (to).")

  const record: FundingReceiptRecord = {
    $type: FUNDING_RECEIPT_COLLECTION,
    to,
    amount: input.amount,
    currency: input.currency,
    createdAt: input.createdAt ?? new Date().toISOString(),
  }

  const from = fundingPartyToRecord(input.from ?? null)
  if (from) record.from = from
  if (input.for) record.for = { uri: input.for.uri, cid: input.for.cid }
  if (input.matchingReceipt) {
    record.matchingReceipt = {
      uri: input.matchingReceipt.uri,
      cid: input.matchingReceipt.cid,
    }
  }
  if (input.occurredAt) record.occurredAt = input.occurredAt
  if (input.paymentRail) record.paymentRail = input.paymentRail
  if (input.paymentNetwork) record.paymentNetwork = input.paymentNetwork
  if (input.transactionId) record.transactionId = input.transactionId
  if (input.notes) record.notes = input.notes

  return record
}

/**
 * Build a confirmation receipt for an existing payment. `matchingReceipt` is
 * a **strongRef to the receipt being confirmed** — the explicit link the
 * indexer follows to cluster the confirmation onto that payment. `for` still
 * points at the funded activity (copied from the original) so the
 * confirmation sits in the same activity's funding view. `from` / `to` /
 * `amount` / `currency` / `occurredAt` are copied so the lexicon's required
 * fields are present and the indexer can derive the confirmer's role from
 * author-vs-from/to. `transactionId` is *also* a cluster key (the indexer
 * matches on it in addition to the strongRef), so it — along with the rest of
 * the payment-method metadata — is copied from the original verbatim and is
 * NOT something the confirmer enters. The confirmer supplies only their own
 * free-text `notes`.
 */
export function buildConfirmationRecord(
  receipt: Pick<
    FundingReceipt,
    | "uri"
    | "cid"
    | "from"
    | "to"
    | "amount"
    | "currency"
    | "forUri"
    | "forCid"
    | "occurredAt"
    | "transactionId"
    | "paymentRail"
    | "paymentNetwork"
  >,
  extras: {
    notes?: string | null
  } = {},
): FundingReceiptRecord {
  if (!receipt.amount || !receipt.currency) {
    throw new Error("Cannot confirm a payment that is missing an amount or currency.")
  }
  return buildFundingReceiptRecord({
    to: receipt.to,
    from: receipt.from ?? undefined,
    amount: receipt.amount,
    currency: receipt.currency,
    // `for` stays on the funded activity; `matchingReceipt` carries the link
    // to the receipt being confirmed.
    for:
      receipt.forUri && receipt.forCid
        ? { uri: receipt.forUri, cid: receipt.forCid }
        : null,
    matchingReceipt: { uri: receipt.uri, cid: receipt.cid },
    occurredAt: receipt.occurredAt,
    // Copied (a cluster key + same-payment metadata), not entered by the confirmer.
    transactionId: receipt.transactionId,
    paymentRail: receipt.paymentRail,
    paymentNetwork: receipt.paymentNetwork,
    notes: extras.notes ?? null,
  })
}

/** Map a lexicon union variant back to the app's {@link FundingParty}. */
function recordPartyToFundingParty(
  party: FundingPartyRecord | undefined,
): FundingParty {
  if (!party) return null
  if (party.$type === PARTY_DID_TYPE) return { kind: "account", did: party.did }
  return { kind: "text", value: party.value }
}

/**
 * Map a record the viewer just wrote into the read-model {@link FundingReceipt}
 * so a surface can reflect it before the indexer catches up. Carries
 * `matchingReceipt` (used to optimistically collapse a confirmation onto its
 * counterpart — issue #186) but **fabricates no attestations**: the
 * "Confirmed by" provenance is derived during the merge / supplied by the
 * indexer, never invented on a lone receipt.
 */
export function recordToReceipt(
  record: FundingReceiptRecord,
  ids: { uri: string; cid: string; did: string },
): FundingReceipt {
  return {
    uri: ids.uri,
    cid: ids.cid,
    did: ids.did,
    createdAt: record.createdAt,
    occurredAt: record.occurredAt ?? null,
    amount: record.amount,
    currency: record.currency,
    from: recordPartyToFundingParty(record.from),
    to: recordPartyToFundingParty(record.to),
    forUri: record.for?.uri ?? null,
    forCid: record.for?.cid ?? null,
    paymentRail: record.paymentRail ?? null,
    paymentNetwork: record.paymentNetwork ?? null,
    transactionId: record.transactionId ?? null,
    notes: record.notes ?? null,
    matchingReceipt: record.matchingReceipt
      ? { uri: record.matchingReceipt.uri, cid: record.matchingReceipt.cid }
      : null,
    attestations: [],
  }
}

export interface CreateFundingReceiptResult {
  uri: string
  cid: string
}

/**
 * Publish a funding receipt so its author is `writerDid`.
 *
 *   - Personal (`isGroup` false): POST to the xrpc proxy's createRecord
 *     against the viewer's own repo. The collection must be on the route's
 *     write allowlist.
 *   - Group (`isGroup` true): PUT to the group BFF so the *group* authors
 *     the record (`writerDid` is the group DID). Required for a group to
 *     record that it received funding — the indexer derives the recipient
 *     attestation from author-vs-to.
 *
 * Returns the new record's `{ uri, cid }`.
 */
export async function createFundingReceipt(
  record: FundingReceiptRecord,
  writer: { writerDid: string; isGroup: boolean },
): Promise<CreateFundingReceiptResult> {
  const { writerDid, isGroup } = writer
  const res = isGroup
    ? await authFetch(`/api/groups/${encodeURIComponent(writerDid)}/funding`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ record }),
      })
    : await authFetch("/api/xrpc/com/atproto/repo/createRecord", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repo: writerDid,
          collection: FUNDING_RECEIPT_COLLECTION,
          record,
        }),
      })

  const data = (await res.json().catch(() => ({}))) as {
    uri?: string
    cid?: string
    error?: string
  }
  if (!res.ok) {
    throw new Error(data.error || `Failed to record funding receipt (${res.status})`)
  }
  if (!data.uri || !data.cid) {
    throw new Error("The funding receipt was created but the response was malformed.")
  }
  return { uri: data.uri, cid: data.cid }
}

const AT_URI_RE = /^at:\/\/([^/]+)\/([^/]+)\/([^/]+)$/

/**
 * Delete a funding receipt the viewer authored — taking back a recorded
 * payment or a confirmation. A personal receipt goes through the xrpc proxy's
 * deleteRecord (which requires `repo` to be the session DID); a group receipt
 * (`isGroup`) goes through the group BFF so the group's owner/admin can take
 * it back.
 */
export async function deleteFundingReceipt(
  uri: string,
  opts: { isGroup?: boolean } = {},
): Promise<void> {
  const match = AT_URI_RE.exec(uri)
  if (!match) throw new Error("Cannot delete: malformed receipt URI.")
  const [, repo, collection, rkey] = match
  const res = opts.isGroup
    ? await authFetch(`/api/groups/${encodeURIComponent(repo)}/funding`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rkey }),
      })
    : await authFetch("/api/xrpc/com/atproto/repo/deleteRecord", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repo, collection, rkey }),
      })
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(data.error || `Failed to delete funding receipt (${res.status})`)
  }
}
