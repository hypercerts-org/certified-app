"use client"

import Link from "next/link"
import CertIcon from "@/components/ui/cert-icon"
import RowThumb from "@/components/ui/row-thumb"
import IdentityRow from "@/components/ui/identity-row"
import WalletAddress from "@/components/ui/wallet-address"
import { useAuthorInfo } from "@/hooks/use-author-info"
import { useActivity } from "@/hooks/use-activity"
import { useProjectSummary } from "@/hooks/use-project-summary"
import { profileUrl, recordUrl } from "@/lib/urls"
import { parseAtUri, activityDetailHref } from "@/lib/atproto/activity-uri"
import { resolveActivityImageUrl } from "@/lib/atproto/activity"
import { projectImage } from "@/lib/atproto/collection"
import type { FundingParty } from "@/lib/atproto/indexer"

/**
 * Shared renderers for the two sides of a funding receipt (the transfer
 * parties and the `for` activity). Extracted from `funding-receipt-row`
 * so both the dense list row and the detail modal render them identically
 * without the row and the modal importing each other (circular).
 */

const ACTIVITY_COLLECTION = "org.hypercerts.claim.activity"
const PROJECT_COLLECTION = "org.hypercerts.collection"

/** Resolve a DID to an account byline (avatar and name) and render
 *  it as an {@link IdentityRow}. Centralises the per-row `useAuthorInfo`
 *  hydration that every funding surface shares (transfer parties, the
 *  receipt creator, third-party attestors, the Confirmed-by filter list).
 *  `noLink` drops the profile href for contexts where the row isn't itself
 *  a link (the Confirmed-by checkbox label). */
export function HydratedIdentityRow({
  did,
  displayName,
  size = "sm",
  className = "",
  noLink = false,
  showHandle = false,
}: {
  did: string
  /** A name to show instead of the profile's: a trusted funding source's
   *  own name (GainForest publishes as "heisenberg"). */
  displayName?: string
  size?: "sm" | "md"
  className?: string
  noLink?: boolean
  /** `@handle` under the name, where telling accounts apart matters. */
  showHandle?: boolean
}) {
  const { info, isLoading } = useAuthorInfo(did)
  const handle = info?.handle ?? undefined
  return (
    <IdentityRow
      did={did}
      // A skeleton until the profile arrives, rather than a flash of the
      // raw DID; a DID that never resolves still falls back to it.
      loading={isLoading && !info}
      handle={handle}
      displayName={displayName ?? info?.displayName ?? undefined}
      avatarUrl={info?.avatarUrl ?? undefined}
      href={noLink ? undefined : profileUrl(handle || did)}
      showHandle={showHandle}
      size={size}
      className={className}
    />
  )
}

/** Renders one side of the transfer. Accounts hydrate per-row and show
 *  avatar + name + @handle. Text slots render their literal value when
 *  `showText` is set (the activity detail page surfaces wallet
 *  addresses); otherwise text slots render nothing (the /explore default).
 *  A missing party renders nothing, or "Anonymous" when `anonymous` is set
 *  (the funder side: a receipt without `from` records an anonymous gift). */
export function FundingPartySlot({
  party,
  showText = false,
  anonymous = false,
}: {
  party: FundingParty
  showText?: boolean
  anonymous?: boolean
}) {
  const did = party?.kind === "account" ? party.did : null
  if (!did) {
    if (showText && party?.kind === "text" && party.value) {
      return <FundingTextParty value={party.value} />
    }
    if (anonymous && party === null) {
      return <span className="funding-receipt-row__anon">Anonymous</span>
    }
    return null
  }
  return <HydratedIdentityRow did={did} className="funding-receipt-row__party" />
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

/** The "for" column: the activity or project the payment was for. Resolves
 *  the record (title + square image) from its URI and links to its detail
 *  page; the title wraps to at most two lines. Always renders the cell span
 *  (empty when the `for` ref is missing or points at something else) so the
 *  funding table's columns stay aligned across rows. */
export function FundingForTarget({ uri }: { uri: string | null }) {
  const parsed = uri ? parseAtUri(uri) : null
  const isActivity = parsed?.collection === ACTIVITY_COLLECTION
  const isProject = parsed?.collection === PROJECT_COLLECTION
  const { activity } = useActivity(
    isActivity ? parsed!.did : null,
    isActivity ? parsed!.rkey : null,
  )
  const projectValue = useProjectSummary(
    isProject ? parsed!.did : null,
    isProject ? parsed!.rkey : null,
  )

  if (!parsed || (!isActivity && !isProject)) {
    return <span className="funding-receipt-row__for" />
  }

  let title: string
  let imageUrl: string | null
  let href: string
  if (isActivity) {
    title =
      (typeof activity?.value.title === "string" && activity.value.title) ||
      "activity"
    imageUrl = activity
      ? resolveActivityImageUrl(activity.value.image, parsed.did)
      : null
    href = activityDetailHref(parsed.did, parsed.rkey)
  } else {
    const value = projectValue
    title =
      (typeof value?.title === "string" && value.title) ||
      (typeof value?.name === "string" && value.name) ||
      "project"
    const raw = value ? projectImage(value, "thumb") : null
    imageUrl = raw ? resolveActivityImageUrl(raw, parsed.did) : null
    href = recordUrl(parsed.did, "project", parsed.rkey)
  }

  return (
    <span className="funding-receipt-row__for">
      <span className="funding-receipt-row__cell-label" aria-hidden="true">
        For
      </span>
      <Link href={href} className="funding-receipt-row__activity">
        <RowThumb
          className="funding-receipt-row__activity-img"
          src={imageUrl}
          icon={<CertIcon size={16} strokeWidth={1.5} aria-hidden />}
        />
        <span className="funding-receipt-row__activity-title" dir="auto">
          {title}
        </span>
      </Link>
    </span>
  )
}
