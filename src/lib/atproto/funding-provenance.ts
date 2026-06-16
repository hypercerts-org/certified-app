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
 * Whether a payment passes the Funding "Confirmed by" filter.
 *
 * - **Default (unmodified) selection** — every role bucket selected and no
 *   specific third party — passes *every* receipt, so the list matches the
 *   count the UI reports. A third-party-only (or as-yet-unattested, pre-#214)
 *   receipt has no sender/recipient bucket, so under the union logic below it
 *   would otherwise be filtered out while still being counted. This is the
 *   only case in which a bucket-less receipt is shown.
 * - **Narrowed selection** — the UNION of the selected role buckets
 *   (Both / Sender / Recipient) and the selected third-party attestors. A
 *   receipt matches if its sender/recipient bucket is selected or one of its
 *   third-party attestors is selected.
 * - **Nothing selected** — nothing matches (the caller shows an empty list).
 */
export function matchesConfirmedBy(
  attestations: readonly FundingAttestation[],
  roles: ReadonlySet<ConfirmRole>,
  thirdParties: ReadonlySet<string>,
): boolean {
  if (roles.size === CONFIRM_ROLES.length && thirdParties.size === 0) {
    return true
  }
  const bucket = confirmRoleBucket(attestations)
  if (bucket && roles.has(bucket)) return true
  if (thirdParties.size > 0) {
    if (thirdPartyDids(attestations).some((did) => thirdParties.has(did))) return true
  }
  return false
}
