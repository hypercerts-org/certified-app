import type { FundingAttestation, FundingReceipt } from "./indexer"
import { TRUSTED_EVALUATOR_DIDS } from "./trusted-evaluators"

/**
 * Display + filter derivation for funding-receipt provenance. The indexer
 * emits a flat {@link FundingAttestation}[] per payment (one entry per
 * receipt in the `matchingReceipt`-linked cluster). This module maps that
 * set into the two things the UI needs:
 *
 *   1. role bucket — which of Both / Sender / Recipient confirmed the
 *      payment ({@link confirmRoleBucket}), driving the "Confirmed by"
 *      filter together with {@link matchesConfirmedBy}.
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

/** The mutually-exclusive sender/recipient confirmation buckets used by the
 *  /explore Funding "Confirmed by" filter. */
export const CONFIRM_ROLES = ["both", "sender", "recipient"] as const
export type ConfirmRole = (typeof CONFIRM_ROLES)[number]

/** The buckets shown by *default*: a payment the recipient confirmed (alone or
 *  together with the sender). Sender-only and third-party-only payments are
 *  hidden until the viewer widens the "Confirmed by" filter — a recipient's
 *  confirmation is the meaningful signal that funding was actually received. */
export const DEFAULT_CONFIRM_ROLES: readonly ConfirmRole[] = ["recipient", "both"]

/** Whether a role set equals the default selection (order-independent). */
export function isDefaultConfirmRoleSet(roles: ReadonlySet<ConfirmRole>): boolean {
  return (
    roles.size === DEFAULT_CONFIRM_ROLES.length &&
    DEFAULT_CONFIRM_ROLES.every((r) => roles.has(r))
  )
}

/**
 * Which sender/recipient bucket a payment falls into — `"both"` when both
 * parties attested, else `"sender"` / `"recipient"` for a single self-report,
 * or `null` when neither did (e.g. a third-party-only receipt).
 */
export function confirmRoleBucket(
  attestations: readonly FundingAttestation[],
): ConfirmRole | null {
  const hasSender = attestations.some((a) => a.role === "sender")
  const hasRecipient = attestations.some((a) => a.role === "recipient")
  if (hasSender && hasRecipient) return "both"
  if (hasSender) return "sender"
  if (hasRecipient) return "recipient"
  return null
}

/**
 * Whether a payment passes the Funding "Confirmed by" filter: the UNION of
 * the selected role buckets (Both / Sender / Recipient) and the selected
 * third-party attestors.
 *
 * The default selection (all three role buckets, no specific third party)
 * therefore shows only receipts confirmed by the sender, the recipient, or
 * both — a third-party-only (or as-yet-unattested, pre-#214) receipt has no
 * sender/recipient bucket and is hidden until the user selects its
 * third-party attestor. With nothing selected, nothing matches (the caller
 * shows an empty list). Callers must derive any displayed count from the
 * filtered set, not the unfiltered total, so the count agrees with the list.
 */
export function matchesConfirmedBy(
  attestations: readonly FundingAttestation[],
  roles: ReadonlySet<ConfirmRole>,
  thirdParties: ReadonlySet<string>,
): boolean {
  const bucket = confirmRoleBucket(attestations)
  if (bucket && roles.has(bucket)) return true
  if (thirdParties.size > 0) {
    if (thirdPartyDids(attestations).some((did) => thirdParties.has(did))) return true
  }
  return false
}

// ---------------------------------------------------------------------------
// Write-side permissions: who may record / confirm a funding receipt
// ---------------------------------------------------------------------------

/**
 * Whether `did` is one of the trusted evaluators — the exact list the
 * home-feed filter "Show activities from accounts that are endorsed by:"
 * renders ({@link TRUSTED_EVALUATOR_DIDS}, the single source of truth).
 * These accounts are the only ones allowed to record or confirm a payment
 * as a *third party* (i.e. when they are neither the sender nor the
 * recipient).
 */
export function isTrustedEvaluator(did: string | null | undefined): boolean {
  if (!did) return false
  return (TRUSTED_EVALUATOR_DIDS as readonly string[]).includes(did)
}

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
 */
export function fundingConfirmEligibility(
  receipt: Pick<FundingReceipt, "from" | "to" | "attestations">,
  viewerDid: string | null | undefined,
): FundingConfirmEligibility {
  if (!viewerDid) return { canConfirm: false, role: null, alreadyAttested: false }

  const alreadyAttested = receipt.attestations.some((a) => a.did === viewerDid)

  let role: FundingRole | null = null
  if (receipt.from?.kind === "account" && receipt.from.did === viewerDid) {
    role = "sender"
  } else if (receipt.to?.kind === "account" && receipt.to.did === viewerDid) {
    role = "recipient"
  } else if (isTrustedEvaluator(viewerDid)) {
    role = "third-party"
  }

  return { canConfirm: role !== null && !alreadyAttested, role, alreadyAttested }
}
