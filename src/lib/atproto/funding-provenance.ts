import type { FundingAttestation, FundingReceipt } from "./indexer"
import {
  TRUSTED_FUNDING_SOURCES,
  trustedFundingSource,
  trustedSourceByKey,
  type TrustedSourceKey,
} from "@/lib/funding/trusted-sources"

/**
 * Display + filter derivation for funding-receipt provenance. The indexer
 * emits a flat {@link FundingAttestation}[] per payment (one entry per
 * receipt in the `matchingReceipt`-linked cluster). This module maps that
 * set into the two things the UI needs:
 *
 *   1. buckets — which of the trusted sources (Ma Earth, GainForest, ...) /
 *      Both / Sender / Recipient / Other confirmed the payment
 *      ({@link confirmBuckets}), driving the "Confirmed by" filter together
 *      with {@link matchesConfirmedBy}.
 *   2. "by whom"   — the third-party attestor identities
 *      ({@link thirdPartyDids}).
 *
 * Provenance is deliberately not a single ranked enum: a payment can be both
 * self-reported and third-party-confirmed at once. All classification lives
 * on the indexer; this module only derives the buckets / identities.
 */

/**
 * The third-party attestor DIDs for a payment, de-duplicated and order-
 * preserving. Backs the "Confirmed by" column (we surface identities only
 * for third parties — for self/mutual the attestor is already the From/To
 * party).
 */
export function thirdPartyDids(
  attestations: readonly FundingAttestation[],
): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const a of attestations) {
    if (a.role !== "third-party") continue
    if (seen.has(a.did)) continue
    seen.add(a.did)
    out.push(a.did)
  }
  return out
}

/**
 * The "Confirmed by" buckets a payment can fall into, in display order:
 *
 *   - one per trusted funding source, by its key (`ma-earth`, `gainforest`,
 *                 ...): that source published a receipt for it — see
 *                 `@/lib/funding/trusted-sources`
 *   - `both`      the funder and the recipient each published one
 *   - `sender`    only the funder did
 *   - `recipient` only the recipient did
 *   - `other`     a third party that is not a trusted source did
 *
 * The buckets are not exclusive: a Ma Earth receipt the recipient has
 * confirmed is both `ma-earth` and `recipient`. A payment is shown when ANY
 * of its buckets is selected (see {@link matchesConfirmedBy}).
 */
export type ConfirmRole = TrustedSourceKey | "both" | "sender" | "recipient" | "other"

/** The trusted sources' buckets, in the order the filter lists them. */
export const SOURCE_CONFIRM_ROLES: readonly TrustedSourceKey[] = TRUSTED_FUNDING_SOURCES.map((s) => s.key)

export const CONFIRM_ROLES: readonly ConfirmRole[] = [
  ...SOURCE_CONFIRM_ROLES,
  "both",
  "sender",
  "recipient",
  "other",
]

/** The sender/recipient part of the buckets. */
export type PartyConfirmRole = "both" | "sender" | "recipient"

/** Whether a bucket is a trusted source's. */
export function isSourceRole(role: string): role is TrustedSourceKey {
  return trustedSourceByKey(role) !== undefined
}

/** The buckets shown by *default*: what each trusted source recorded, and
 *  what the funder and the recipient both confirmed. One-sided and
 *  unknown-source receipts are hidden until the viewer turns them on. */
export const DEFAULT_CONFIRM_ROLES: readonly ConfirmRole[] = [...SOURCE_CONFIRM_ROLES, "both"]

/** Whether a role set equals the default selection (order-independent). */
export function isDefaultConfirmRoleSet(roles: ReadonlySet<ConfirmRole>): boolean {
  return (
    roles.size === DEFAULT_CONFIRM_ROLES.length &&
    DEFAULT_CONFIRM_ROLES.every((r) => roles.has(r))
  )
}

/** The one bucket every trusted source shared before each had its own. A
 *  stored selection (an old `?confirmedRoles=trusted,...` link) means every
 *  trusted source. */
const LEGACY_TRUSTED_ROLE = "trusted"

/**
 * Buckets from stored values (the `?confirmedRoles=` list): known buckets
 * are kept, the old `trusted` becomes every trusted source, anything else is
 * dropped.
 */
export function parseConfirmRoles(values: readonly string[]): Set<ConfirmRole> {
  const valid = new Set<string>(CONFIRM_ROLES)
  const out = new Set<ConfirmRole>()
  for (const v of values) {
    if (v === LEGACY_TRUSTED_ROLE) for (const r of SOURCE_CONFIRM_ROLES) out.add(r)
    else if (valid.has(v)) out.add(v as ConfirmRole)
  }
  return out
}

/**
 * Which sender/recipient bucket a payment falls into — `"both"` when both
 * parties attested, else `"sender"` / `"recipient"` for a single self-report,
 * or `null` when neither did (e.g. a third-party-only receipt).
 */
export function confirmRoleBucket(
  attestations: readonly FundingAttestation[],
): PartyConfirmRole | null {
  const hasSender = attestations.some((a) => a.role === "sender")
  const hasRecipient = attestations.some((a) => a.role === "recipient")
  if (hasSender && hasRecipient) return "both"
  if (hasSender) return "sender"
  if (hasRecipient) return "recipient"
  return null
}

/** Every bucket a payment falls into (see {@link CONFIRM_ROLES}). */
export function confirmBuckets(
  attestations: readonly FundingAttestation[],
): Set<ConfirmRole> {
  const out = new Set<ConfirmRole>()
  const party = confirmRoleBucket(attestations)
  if (party) out.add(party)
  for (const did of thirdPartyDids(attestations)) {
    out.add(trustedFundingSource(did)?.key ?? "other")
  }
  return out
}

/**
 * Whether a payment passes the Funding "Confirmed by" filter: the UNION of
 * the selected buckets and the selected third-party attestors.
 *
 * The default selection (every trusted source + both sides) therefore shows
 * what a trusted source recorded and what both parties confirmed; a one-sided or
 * unknown-source receipt is hidden until its bucket (or its attestor) is
 * selected. An as-yet-unattested receipt (pre-#214) has no bucket and only
 * shows when its third-party attestor is picked. With nothing selected,
 * nothing matches (the caller shows an empty list). Callers must derive any
 * displayed count from the filtered set, not the unfiltered total, so the
 * count agrees with the list.
 */
export function matchesConfirmedBy(
  attestations: readonly FundingAttestation[],
  roles: ReadonlySet<ConfirmRole>,
  thirdParties: ReadonlySet<string>,
): boolean {
  for (const bucket of confirmBuckets(attestations)) {
    if (roles.has(bucket)) return true
  }
  if (thirdParties.size > 0) {
    if (thirdPartyDids(attestations).some((did) => thirdParties.has(did))) return true
  }
  return false
}

// ---------------------------------------------------------------------------
// Write-side permissions: who may record / confirm a funding receipt
// ---------------------------------------------------------------------------

/** The attestation role a viewer's receipt would carry for a payment. */
export type FundingRole = "sender" | "recipient" | "third-party"

export interface FundingConfirmEligibility {
  /** True when the viewer may confirm this payment (eligible AND has not
   *  already attested it). */
  canConfirm: boolean
  /** The role the viewer's confirmation would be recorded as, or `null`
   *  when they are not eligible to confirm at all. Derived the same way
   *  the indexer derives it: the viewer is the sender/recipient only when
   *  the receipt names them by DID; otherwise an evaluator confirms as a
   *  third party. */
  role: FundingRole | null
  /** True when the viewer already has an attestation on this payment, so
   *  the confirm action should be hidden rather than offered. */
  alreadyAttested: boolean
}

/**
 * Whether (and as what role) `viewerDid` may confirm a payment. A user may
 * confirm iff they are the receipt's `from` account, its `to` account, or a
 * trusted evaluator — and have not already attested it. Copying the
 * payment's coordinates into a fresh receipt authored by the viewer then
 * yields exactly this role from the indexer.
 *
 * `trustedEvaluatorDids` is the live evaluator set (sourced from the
 * curated list via `useTrustedEvaluators`); only those accounts may
 * confirm as a *third party* when they are neither the sender nor the
 * recipient.
 */
export function fundingConfirmEligibility(
  receipt: Pick<FundingReceipt, "from" | "to" | "attestations">,
  viewerDid: string | null | undefined,
  trustedEvaluatorDids: readonly string[],
): FundingConfirmEligibility {
  if (!viewerDid) return { canConfirm: false, role: null, alreadyAttested: false }

  const alreadyAttested = receipt.attestations.some((a) => a.did === viewerDid)

  let role: FundingRole | null = null
  if (receipt.from?.kind === "account" && receipt.from.did === viewerDid) {
    role = "sender"
  } else if (receipt.to?.kind === "account" && receipt.to.did === viewerDid) {
    role = "recipient"
  } else if (trustedEvaluatorDids.includes(viewerDid)) {
    role = "third-party"
  }

  return { canConfirm: role !== null && !alreadyAttested, role, alreadyAttested }
}
