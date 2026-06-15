"use client"

import Link from "next/link"
import IdentityRow from "@/components/ui/identity-row"
import { useAuthorInfo } from "@/hooks/use-author-info"
import { useActivity } from "@/hooks/use-activity"
import { profileUrl } from "@/lib/urls"
import { parseAtUri, activityDetailHref } from "@/lib/atproto/activity-uri"
import { resolveActivityImageUrl } from "@/lib/atproto/activity"
import { formatShortDate } from "@/lib/utils/format-date"
import type { FundingParty, FundingReceipt } from "@/lib/atproto/indexer"

const ACTIVITY_COLLECTION = "org.hypercerts.claim.activity"

/**
 * Dense single-row representation of an `org.hypercerts.funding.receipt`
 * for the /explore Funding list.
 *
 *   [from account] to [to account] for [activity]      occurredAt
 *
 * `from` / `to` are unions: an AT Protocol account
 * (`AppCertifiedDefsDid`) renders as avatar + name + @handle (hydrated
 * per-row from the DID via {@link useAuthorInfo}, like the other
 * explore account rows). A text label renders as plain text when
 * `showTextParties` is set (used on the activity detail page, where the
 * text values are wallet addresses), and renders nothing otherwise (the
 * /explore default). `for` (when it points at an activity) is hydrated
 * to its title and linked to the activity detail page — omit it via
 * `showFor={false}` on surfaces where the `for` is already implied
 * (e.g. the activity detail page itself).
 */
export default function FundingReceiptRow({
  receipt,
  showTextParties = false,
  showFor = true,
}: {
  receipt: FundingReceipt
  /** Render text (non-account) parties as their literal value rather
   *  than blanking them. Defaults to false to preserve /explore. */
  showTextParties?: boolean
  /** Render the trailing "for [activity]" tail. Defaults to true; pass
   *  false on the activity detail page where `for` is redundant. */
  showFor?: boolean
}) {
  return (
    <article className="funding-receipt-row">
      {/* Columns: date | from | to | for | amount. Date leads, amount
          (the "punchline") trails. */}
      {receipt.occurredAt ? (
        <time
          className="funding-receipt-row__date"
          dateTime={receipt.occurredAt}
          title={receipt.occurredAt}
        >
          {formatShortDate(receipt.occurredAt)}
        </time>
      ) : (
        <span className="funding-receipt-row__date" aria-hidden />
      )}
      <span className="funding-receipt-row__from">
        <FundingPartySlot party={receipt.from} showText={showTextParties} />
      </span>
      <span className="funding-receipt-row__to-cell">
        <FundingPartySlot party={receipt.to} showText={showTextParties} />
      </span>
      {/* "for" activity is its own column (image + title); the column
          header labels it, so no inline connector word. */}
      {showFor ? <FundingForActivity uri={receipt.forUri} /> : null}
      <span className="funding-receipt-row__amount">
        {receipt.amount ? (
          <>
            {receipt.amount}
            {receipt.currency ? (
              <span className="funding-receipt-row__currency">
                {receipt.currency}
              </span>
            ) : null}
          </>
        ) : null}
      </span>
    </article>
  )
}

/** Renders one side of the transfer. Accounts hydrate per-row and show
 *  avatar + name + @handle. Text slots render their literal value when
 *  `showText` is set (the activity detail page surfaces wallet
 *  addresses); otherwise text / null slots render nothing (the /explore
 *  default). */
function FundingPartySlot({
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

/** Truncate a long wallet-address-style string to `head…tail` so a
 *  full 0x… hex doesn't blow out the row, while keeping the literal
 *  value reachable via the title attribute. Short / non-hex values
 *  pass through unchanged. */
function shortenAddress(value: string): string {
  if (value.length <= 16) return value
  if (!value.startsWith("0x")) return value
  return `${value.slice(0, 6)}…${value.slice(-4)}`
}

/** A free-text funding party (wallet address). Rendered as plain text
 *  (no link / hydration) since there's no account behind it. */
function FundingTextParty({ value }: { value: string }) {
  const display = shortenAddress(value)
  return (
    <span
      className="funding-receipt-row__text-party"
      title={display === value ? undefined : value}
    >
      {display}
    </span>
  )
}

/** The "for [activity]" column. Resolves the activity (title + square
 *  image) from its URI via {@link useActivity} and links to its detail
 *  page; the title wraps to at most two lines. Always renders the cell
 *  span (empty when the `for` ref is missing or doesn't point at an
 *  activity) so the funding table's columns stay aligned across rows. */
function FundingForActivity({ uri }: { uri: string | null }) {
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

/**
 * Column-header row for a funding list — the labels that replace the old
 * inline "to" / "for" connector words. Carries the `funding-receipt-row`
 * class so it adopts the same grid (subgrid on /explore) and its cells
 * line up with the data rows. `showFor` mirrors the rows so the column
 * count matches.
 */
export function FundingReceiptHeader({ showFor = true }: { showFor?: boolean }) {
  return (
    <div
      className="funding-receipt-row funding-receipt-row--header"
      role="presentation"
    >
      <span className="funding-receipt-row__heading">Date</span>
      <span className="funding-receipt-row__heading">From</span>
      <span className="funding-receipt-row__heading">To</span>
      {showFor ? (
        <span className="funding-receipt-row__heading">For</span>
      ) : null}
      <span className="funding-receipt-row__heading funding-receipt-row__heading--amount">
        Amount
      </span>
    </div>
  )
}
