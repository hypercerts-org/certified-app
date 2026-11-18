"use client"

import { memo, useState, type MouseEvent } from "react"
import FundingReceiptDetailModal from "./funding-receipt-detail-modal"
import {
  FundingPartySlot,
  FundingForTarget,
  HydratedIdentityRow,
} from "./funding-receipt-parts"
import { formatRelativeDate } from "@/lib/utils/format-date"
import { formatAbsoluteDateTime, formatAmount } from "./format-display"
import Badge from "@/components/ui/badge"
import { thirdPartyDids } from "@/lib/atproto/funding-provenance"
import type { FundingReceipt } from "@/lib/atproto/indexer"
import { formatGift } from "@/lib/funding/format"
import { trustedFundingSource } from "@/lib/funding/trusted-sources"

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
function FundingReceiptRow({
  receipt,
  showTextParties = false,
  showFor = true,
  showTo = true,
  interactive = true,
  showConfirmedBy = true,
  amountStyle = "code",
  compact = false,
  unconfirmed = false,
}: {
  receipt: FundingReceipt
  /** Render text (non-account) parties as their literal value rather
   *  than blanking them. Defaults to false to preserve /explore. */
  showTextParties?: boolean
  /** Render the trailing "for [activity]" tail. Defaults to true; pass
   *  false on the activity detail page where `for` is redundant. */
  showFor?: boolean
  /** Render the "to" column. Defaults to true; a record page whose gifts
   *  all go to the record's own account leaves it out. */
  showTo?: boolean
  /** Make the row open a detail modal on click. Defaults to true; the
   *  inner account / wallet / activity controls keep their own behaviour
   *  (the click handler ignores clicks that land on a link or button). */
  interactive?: boolean
  /** Render the "Confirmed by" column. Defaults to true; a record page
   *  leaves it out when every gift has the same confirmer (its summary
   *  sentence says who). */
  showConfirmedBy?: boolean
  /** "code": "50.00 USD" (the default, /explore). "money": as the totals
   *  read, "$50", other currencies with their code. */
  amountStyle?: "code" | "money"
  /** On phones, a two-line row (name and amount, then the date) instead
   *  of the labelled card. Off by default. */
  compact?: boolean
  /** Mark the gift "Unconfirmed" (listed although neither both sides nor
   *  a trusted source confirmed it). */
  unconfirmed?: boolean
}) {
  const [detailOpen, setDetailOpen] = useState(false)

  // Mouse convenience: a click on the row's "chrome" opens the modal.
  // Clicks that land on an inner link (account, activity) or button
  // (wallet copy) are left to those controls. Keyboard and screen-reader
  // users get the dedicated "details" button rendered inside the row.
  const onRowClick = (e: MouseEvent<HTMLElement>) => {
    if ((e.target as HTMLElement).closest("a, button")) return
    setDetailOpen(true)
  }

  const amountLabel = receipt.amount
    ? `${formatAmount(receipt.amount)}${receipt.currency ? ` ${receipt.currency}` : ""}`
    : null
  const detailsLabel = [
    "View funding receipt details",
    [amountLabel, receipt.occurredAt ? formatRelativeDate(receipt.occurredAt) : null]
      .filter(Boolean)
      .join(", "),
  ]
    .filter(Boolean)
    .join(": ")

  return (
    <>
    <article
      className={`funding-receipt-row${interactive ? " funding-receipt-row--interactive" : ""}${
        compact ? " funding-receipt-row--compact" : ""
      }`}
      onClick={interactive ? onRowClick : undefined}
    >
      {/* Columns: date | from | to | for | amount | source | confirmed-by.
          Date leads, amount (the "punchline") sits before the provenance
          annotation (the role-bucket label + third-party attestors). */}
      {receipt.occurredAt ? (
        <time
          className="funding-receipt-row__date"
          dateTime={receipt.occurredAt}
          title={formatAbsoluteDateTime(receipt.occurredAt)}
        >
          {formatRelativeDate(receipt.occurredAt)}
        </time>
      ) : (
        <span className="funding-receipt-row__date" aria-hidden />
      )}
      {/* Keyboard / screen-reader entry point to the detail modal, named
          with the row's amount and date so rows are distinguishable.
          Visually hidden (absolutely positioned, so out of the grid flow,
          and kept off the first/last child slots the subgrid insets
          target); the row shows a focus ring while it holds focus. */}
      {interactive ? (
        <button
          type="button"
          className="funding-receipt-row__open sr-only"
          aria-haspopup="dialog"
          onClick={() => setDetailOpen(true)}
        >
          {detailsLabel}
        </button>
      ) : null}
      <span className="funding-receipt-row__from">
        <span className="funding-receipt-row__cell-label" aria-hidden="true">
          From
        </span>
        <FundingPartySlot party={receipt.from} showText={showTextParties} anonymous />
      </span>
      {showTo ? (
        <span className="funding-receipt-row__to-cell">
          <span className="funding-receipt-row__cell-label" aria-hidden="true">
            To
          </span>
          <FundingPartySlot party={receipt.to} showText={showTextParties} />
        </span>
      ) : null}
      {/* "for" activity is its own column (image + title); the column
          header labels it, so no inline connector word. */}
      {showFor ? <FundingForTarget uri={receipt.forUri} /> : null}
      <span className="funding-receipt-row__amount">
        {!receipt.amount ? null : amountStyle === "money" ? (
          formatGift(receipt.amount, receipt.currency) ?? formatAmount(receipt.amount)
        ) : (
          <>
            {formatAmount(receipt.amount)}
            {receipt.currency ? (
              <span className="funding-receipt-row__currency">
                {receipt.currency}
              </span>
            ) : null}
          </>
        )}
      </span>
      {/* Provenance — who confirmed this payment, as plain text
          (Sender / Recipient / Sender & Recipient, and/or a named
          third party). Empty until the indexer ships `attestations`
          (magic-indexer #214). */}
      {showConfirmedBy ? (
        <FundingConfirmedBy receipt={receipt} unconfirmed={unconfirmed} />
      ) : null}
    </article>
    {/* Rendered as a sibling (not a child of the row) so the modal's
        backdrop / content clicks don't bubble back into the row's click
        handler and re-open it. A closed <dialog> is display:none, so it
        doesn't disturb the list's grid. */}
    {detailOpen ? (
      <FundingReceiptDetailModal
        receipt={receipt}
        onClose={() => setDetailOpen(false)}
      />
    ) : null}
    </>
  )
}

export default memo(FundingReceiptRow)

/** Who confirmed a gift, as the "Confirmed by" column shows it: the
 *  transfer parties' label and the third parties' DIDs. */
function confirmers(receipt: FundingReceipt): { partyLabel: string | null; tpDids: string[] } {
  const a = receipt.attestations
  const hasSender = a.some((x) => x.role === "sender")
  const hasRecipient = a.some((x) => x.role === "recipient")
  const partyLabel =
    hasSender && hasRecipient
      ? "Funder & Recipient"
      : hasSender
        ? "Funder"
        : hasRecipient
          ? "Recipient"
          : null
  return { partyLabel, tpDids: thirdPartyDids(a) }
}

/** A key for a gift's "Confirmed by" cell: two gifts with the same key
 *  show the same thing there. */
export function confirmedByKey(receipt: FundingReceipt): string {
  const { partyLabel, tpDids } = confirmers(receipt)
  return `${partyLabel ?? ""}|${[...tpDids].sort().join(",")}`
}

/** The "Confirmed by" column — a plain-text summary of who attested the
 *  payment: the transfer parties (Sender / Recipient / Sender & Recipient)
 *  and/or a named third party. Renders empty when there are no attestations
 *  (pre-#214 or an unattested record) so columns stay aligned. With
 *  `unconfirmed`, an "Unconfirmed" badge leads. */
function FundingConfirmedBy({
  receipt,
  unconfirmed = false,
}: {
  receipt: FundingReceipt
  unconfirmed?: boolean
}) {
  const { partyLabel, tpDids } = confirmers(receipt)

  // No attestations (pre-#214 or an unattested record): render the empty
  // cell with no label so the desktop columns stay aligned and the mobile
  // card doesn't show a stray "Confirmed by" with nothing under it.
  if (!partyLabel && tpDids.length === 0 && !unconfirmed) {
    return <span className="funding-receipt-row__confirmed-by" />
  }

  // The label is shown only on the mobile card (`__cell-label` is
  // display:none on desktop); the value wrapper is `display:contents` on
  // desktop so the existing right-aligned provenance stack is unchanged.
  // The role label may wrap to two lines (capped) so "Sender & Recipient"
  // isn't truncated in the narrow column — see explore.css.
  return (
    <span className="funding-receipt-row__confirmed-by">
      <span className="funding-receipt-row__cell-label" aria-hidden="true">
        Confirmed by
      </span>
      <span className="funding-receipt-row__confirmed-value">
        {unconfirmed ? (
          <Badge variant="unverified" compact className="funding-receipt-row__unconfirmed">
            Unconfirmed
          </Badge>
        ) : null}
        {partyLabel ? (
          <span className="funding-receipt-row__confirmed-label">
            {unconfirmed ? `Recorded by the ${partyLabel.toLowerCase()}` : partyLabel}
          </span>
        ) : null}
        {tpDids.map((did) => (
          <ThirdPartyIdentity key={did} did={did} />
        ))}
      </span>
    </span>
  )
}

/** A third-party attestor, rendered like any AT Protocol account — avatar +
 *  display name + @handle. Hydrated per-row via the shared
 *  {@link HydratedIdentityRow}; a trusted funding source goes by its own
 *  name ("GainForest"). */
function ThirdPartyIdentity({ did }: { did: string }) {
  return (
    <HydratedIdentityRow
      did={did}
      displayName={trustedFundingSource(did)?.name}
      className="funding-receipt-row__party"
    />
  )
}

/**
 * Column-header row for a funding list — the labels that replace the old
 * inline "to" / "for" connector words. Carries the `funding-receipt-row`
 * class so it adopts the same grid (subgrid on /explore) and its cells
 * line up with the data rows. `showFor` mirrors the rows so the column
 * count matches.
 */
export function FundingReceiptHeader({
  showFor = true,
  showTo = true,
  showConfirmedBy = true,
}: {
  showFor?: boolean
  showTo?: boolean
  showConfirmedBy?: boolean
}) {
  return (
    <div
      className="funding-receipt-row funding-receipt-row--header"
      role="presentation"
    >
      <span className="funding-receipt-row__heading">Date</span>
      <span className="funding-receipt-row__heading">From</span>
      {showTo ? <span className="funding-receipt-row__heading">To</span> : null}
      {showFor ? (
        <span className="funding-receipt-row__heading">For</span>
      ) : null}
      <span className="funding-receipt-row__heading funding-receipt-row__heading--amount">
        Amount
      </span>
      {showConfirmedBy ? (
        <span className="funding-receipt-row__heading funding-receipt-row__heading--confirmed">
          Confirmed by
        </span>
      ) : null}
    </div>
  )
}
