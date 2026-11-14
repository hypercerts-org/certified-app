import type { ConfirmRole } from "@/lib/atproto/funding-provenance"
import { trustedSourcesLabel } from "./trusted-sources"

/** Short labels for the "Confirmed by" buckets, shared by the /funding chips
 *  and the Explore popover so both say the same thing. */
export function confirmRoleLabel(role: ConfirmRole): string {
  switch (role) {
    case "trusted":
      return trustedSourcesLabel()
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
  switch (role) {
    case "trusted":
      return "Recorded by a trusted platform that processed the payment."
    case "both":
      return "The funder and the recipient each published a receipt."
    case "sender":
      return "Only the funder says so. Nobody else has confirmed it."
    case "recipient":
      return "Only the recipient says so. Nobody else has confirmed it."
    case "other":
      return "Published by someone who is neither a party nor a trusted source."
  }
}
