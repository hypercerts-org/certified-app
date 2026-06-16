import type { FundingAttestation } from "./indexer"

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
