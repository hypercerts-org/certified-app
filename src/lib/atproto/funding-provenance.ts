import type { FundingAttestation } from "./indexer"

/**
 * Display derivation for funding-receipt provenance. The indexer emits a
 * flat {@link FundingAttestation}[] per payment (one entry per receipt in
 * the `matchingReceipt`-linked cluster); the *display* is two dimensions:
 *
 *   1. kind chips  — self-reported / mutually-confirmed / third-party
 *   2. "by whom"   — the third-party attestor identities
 *
 * Provenance is deliberately not a single ranked enum: a payment can be
 * both self-reported and third-party-confirmed at once, so `kindChips`
 * can return more than one chip. All classification lives on the indexer;
 * this module only maps the attestation set to labels/tones for render.
 */

/** A `Badge` square tone (subset we use here). */
export type FundingChipTone = "success" | "neutral"

export interface FundingKindChip {
  /** Stable key for React lists + the storage-side concept. */
  key: "mutually-confirmed" | "self-recipient" | "self-sender" | "third-party"
  /** User-friendly label shown on the chip. */
  label: string
  /** One-line explanation for a tooltip / aria. */
  title: string
  tone: FundingChipTone
}

/**
 * Map a payment's attestations to its kind chips. A mutually-confirmed
 * payment (both recipient and sender attested) supersedes the single
 * self-reported chip; a third-party chip co-occurs with whichever
 * self/mutual chip applies. Returns [] when there are no attestations
 * (pre-#214, or an unattested record) so the row renders no chips.
 */
export function kindChips(
  attestations: readonly FundingAttestation[],
): FundingKindChip[] {
  const hasRecipient = attestations.some((a) => a.role === "recipient")
  const hasSender = attestations.some((a) => a.role === "sender")
  const hasThirdParty = attestations.some((a) => a.role === "third-party")

  const chips: FundingKindChip[] = []

  if (hasRecipient && hasSender) {
    chips.push({
      key: "mutually-confirmed",
      label: "Confirmed by both",
      title: "Both the recipient and the sender recorded this payment.",
      tone: "success",
    })
  } else if (hasRecipient) {
    chips.push({
      key: "self-recipient",
      label: "Reported by recipient",
      title: "The recipient recorded this payment.",
      tone: "neutral",
    })
  } else if (hasSender) {
    chips.push({
      key: "self-sender",
      label: "Reported by sender",
      title: "The sender recorded this payment.",
      tone: "neutral",
    })
  }

  if (hasThirdParty) {
    chips.push({
      key: "third-party",
      label: "Confirmed by third party",
      title: "A party other than the sender or recipient recorded this payment.",
      tone: "neutral",
    })
  }

  return chips
}

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
 * third-party attestors. With nothing selected nothing matches (the caller
 * shows an empty list).
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
