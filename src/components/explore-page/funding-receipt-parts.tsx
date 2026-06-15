"use client"

import Link from "next/link"
import IdentityRow from "@/components/ui/identity-row"
import WalletAddress from "@/components/ui/wallet-address"
import { useAuthorInfo } from "@/hooks/use-author-info"
import { useActivity } from "@/hooks/use-activity"
import { profileUrl } from "@/lib/urls"
import { parseAtUri, activityDetailHref } from "@/lib/atproto/activity-uri"
import { resolveActivityImageUrl } from "@/lib/atproto/activity"
import type { FundingParty } from "@/lib/atproto/indexer"

/**
 * Shared renderers for the two sides of a funding receipt (the transfer
 * parties and the `for` activity). Extracted from `funding-receipt-row`
 * so both the dense list row and the detail modal render them identically
 * without the row and the modal importing each other (circular).
 */

const ACTIVITY_COLLECTION = "org.hypercerts.claim.activity"

/** Renders one side of the transfer. Accounts hydrate per-row and show
 *  avatar + name + @handle. Text slots render their literal value when
 *  `showText` is set (the activity detail page surfaces wallet
 *  addresses); otherwise text / null slots render nothing (the /explore
 *  default). */
export function FundingPartySlot({
  party,
  showText = false,
}: {
  party: FundingParty
  showText?: boolean
}) {
  const did = party?.kind === "account" ? party.did : null
  const { info } = useAuthorInfo(did)
  if (!did) {
    if (showText && party?.kind === "text" && party.value) {
      return <FundingTextParty value={party.value} />
    }
    return null
  }
  const handle = info?.handle ?? undefined
  return (
    <IdentityRow
      did={did}
      handle={handle}
      displayName={info?.displayName ?? undefined}
      avatarUrl={info?.avatarUrl ?? undefined}
      href={profileUrl(handle || did)}
      size="sm"
      className="funding-receipt-row__party"
    />
  )
}

/** A free-text funding party (typically a wallet address). Renders via
 *  {@link WalletAddress}, which shows the ENS name when one resolves,
 *  reveals the full address on hover, and copies it on click. Non-address
 *  text passes through verbatim. */
function FundingTextParty({ value }: { value: string }) {
  return (
    <WalletAddress address={value} className="funding-receipt-row__text-party" />
  )
}

/** The "for [activity]" column. Resolves the activity (title + square
 *  image) from its URI via {@link useActivity} and links to its detail
 *  page; the title wraps to at most two lines. Always renders the cell
 *  span (empty when the `for` ref is missing or doesn't point at an
 *  activity) so the funding table's columns stay aligned across rows. */
export function FundingForActivity({ uri }: { uri: string | null }) {
  const parsed = uri ? parseAtUri(uri) : null
  const isActivity = parsed?.collection === ACTIVITY_COLLECTION
  const { activity } = useActivity(
    isActivity ? parsed!.did : null,
    isActivity ? parsed!.rkey : null,
  )

  if (!parsed || !isActivity) {
    return <span className="funding-receipt-row__for" />
  }

  const title =
    (typeof activity?.value.title === "string" && activity.value.title) ||
    "activity"
  const imageUrl = activity
    ? resolveActivityImageUrl(activity.value.image, parsed.did)
    : null
  const href = activityDetailHref(parsed.did, parsed.rkey)

  return (
    <span className="funding-receipt-row__for">
      <Link href={href} className="funding-receipt-row__activity">
        <span className="funding-receipt-row__activity-img">
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl} alt="" loading="lazy" />
          ) : null}
        </span>
        <span className="funding-receipt-row__activity-title">{title}</span>
      </Link>
    </span>
  )
}
