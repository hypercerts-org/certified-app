import { isSourceRole, type ConfirmRole } from "@/lib/atproto/funding-provenance"
import { joinNames, trustedSourceByKey, trustedSourceNames, type TrustedSourceKey } from "./trusted-sources"

/** Short labels for the "Confirmed by" buckets, shared by the /funding chips
 *  and the record pages' popover so both say the same thing. A trusted
 *  source's bucket is its name ("Ma Earth", "GainForest"). */
export function confirmRoleLabel(role: ConfirmRole): string {
  if (isSourceRole(role)) return trustedSourceByKey(role)?.name ?? role
  switch (role) {
    case "both":
      return "Both sides"
    case "sender":
      return "Funder only"
    case "recipient":
      return "Recipient only"
    case "other":
      return "Other publishers"
  }
}

/** One-line explanation per bucket, for tooltips and the receipt detail. */
export function confirmRoleHint(role: ConfirmRole): string {
  if (isSourceRole(role)) {
    return `Recorded by ${confirmRoleLabel(role)}, the platform that processed the payment.`
  }
  switch (role) {
    case "both":
      return "The funder and the recipient each published a receipt."
    case "sender":
      return "Only the funder says so. Nobody else has confirmed it."
    case "recipient":
      return "Only the recipient says so. Nobody else has confirmed it."
    case "other":
      return `Published by someone other than the funder, the recipient, ${trustedSourceNames("or")}.`
  }
}

/** "recorded by Ma Earth", "recorded by Ma Earth and GainForest": the
 *  sources in a selection, in one phrase for the "Showing ..." sentences.
 *  Null when no source is in it. */
export function recordedByPhrase(roles: Iterable<ConfirmRole>): string | null {
  const keys: TrustedSourceKey[] = []
  for (const r of roles) if (isSourceRole(r)) keys.push(r)
  if (keys.length === 0) return null
  return `recorded by ${joinNames(keys.map((k) => confirmRoleLabel(k)))}`
}

/** Phrases of a "Showing ..." sentence joined with "or"; a comma before it
 *  when a phrase has its own "and" ("recorded by Ma Earth and GainForest,
 *  or confirmed by both sides"). */
export function orPhrases(parts: readonly string[]): string {
  if (parts.length <= 1) return parts.join("")
  const comma = parts.some((p) => p.includes(" and ")) ? "," : ""
  return `${parts.slice(0, -1).join(", ")}${comma} or ${parts[parts.length - 1]}`
}
