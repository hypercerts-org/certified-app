"use client"

import { useState, type KeyboardEvent, type MouseEvent } from "react"
import FundingReceiptDetailModal from "./funding-receipt-detail-modal"
import {
  FundingPartySlot,
  FundingForActivity,
  HydratedIdentityRow,
} from "./funding-receipt-parts"
import { formatShortDate } from "@/lib/utils/format-date"
import { thirdPartyDids } from "@/lib/atproto/funding-provenance"
import type { FundingReceipt } from "@/lib/atproto/indexer"

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
  interactive = true,
}: {
  receipt: FundingReceipt
  /** Render text (non-account) parties as their literal value rather
   *  than blanking them. Defaults to false to preserve /explore. */
  showTextParties?: boolean
  /** Render the trailing "for [activity]" tail. Defaults to true; pass
   *  false on the activity detail page where `for` is redundant. */
  showFor?: boolean
  /** Make the row open a detail modal on click. Defaults to true; the
   *  inner account / wallet / activity controls keep their own behaviour
   *  (the click handler ignores clicks that land on a link or button). */
  interactive?: boolean
}) {
  const [detailOpen, setDetailOpen] = useState(false)

  // Open the modal only for clicks on the row's "chrome" — clicks that
  // land on an inner link (account, activity) or button (wallet copy)
  // are left to those controls. Mirrors the keyboard guard below.
  const onRowClick = (e: MouseEvent<HTMLElement>) => {
    if ((e.target as HTMLElement).closest("a, button")) return
    setDetailOpen(true)
  }
  // Enter / Space open the modal only when the row itself holds focus;
  // when a nested link/button is focused we let it handle the key.
  const onRowKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.target !== e.currentTarget) return
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault()
      setDetailOpen(true)
    }
  }

  const interactiveProps = interactive
    ? {
        role: "button" as const,
        tabIndex: 0,
        onClick: onRowClick,
        onKeyDown: onRowKeyDown,
        "aria-haspopup": "dialog" as const,
        "aria-label": "View funding receipt details",
      }
    : {}

  return (
    <>
    <article
      className={`funding-receipt-row${interactive ? " funding-receipt-row--interactive" : ""}`}
      {...interactiveProps}
    >
      {/* Columns: date | from | to | for | amount | source | confirmed-by.
          Date leads, amount (the "punchline") sits before the provenance
          annotation (kind chips + third-party attestors). */}
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
        <span className="funding-receipt-row__cell-label" aria-hidden="true">
          From
        </span>
        <FundingPartySlot party={receipt.from} showText={showTextParties} />
      </span>
      <span className="funding-receipt-row__to-cell">
        <span className="funding-receipt-row__cell-label" aria-hidden="true">
          To
        </span>
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
      {/* Provenance — who confirmed this payment, as plain text
          (Sender / Recipient / Sender & Recipient, and/or a named
          third party). Empty until the indexer ships `attestations`
          (magic-indexer #214). */}
      <FundingConfirmedBy receipt={receipt} />
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

/** The "Confirmed by" column — a plain-text summary of who attested the
 *  payment: the transfer parties (Sender / Recipient / Sender & Recipient)
 *  and/or a named third party. Renders empty when there are no attestations
 *  (pre-#214 or an unattested record) so columns stay aligned. */
function FundingConfirmedBy({ receipt }: { receipt: FundingReceipt }) {
  const a = receipt.attestations
  const hasSender = a.some((x) => x.role === "sender")
  const hasRecipient = a.some((x) => x.role === "recipient")
  const tpDids = thirdPartyDids(a)

  const partyLabel =
    hasSender && hasRecipient
      ? "Sender & Recipient"
      : hasSender
        ? "Sender"
        : hasRecipient
          ? "Recipient"
          : null

  // No attestations (pre-#214 or an unattested record): render the empty
  // cell with no label so the desktop columns stay aligned and the mobile
  // card doesn't show a stray "Confirmed by" with nothing under it.
  if (!partyLabel && tpDids.length === 0) {
    return <span className="funding-receipt-row__confirmed-by" />
  }

  // The label is shown only on the mobile card (`__cell-label` is
  // display:none on desktop); the value wrapper is `display:contents` on
  // desktop so the existing right-aligned provenance stack is unchanged.
  return (
    <span className="funding-receipt-row__confirmed-by">
      <span className="funding-receipt-row__cell-label" aria-hidden="true">
        Confirmed by
      </span>
      <span className="funding-receipt-row__confirmed-value">
        {partyLabel ? (
          <span className="funding-receipt-row__confirmed-label">
            {partyLabel}
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
 *  {@link HydratedIdentityRow}. */
function ThirdPartyIdentity({ did }: { did: string }) {
  return (
    <HydratedIdentityRow did={did} className="funding-receipt-row__party" />
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
      <span className="funding-receipt-row__heading funding-receipt-row__heading--confirmed">
        Confirmed by
      </span>
    </div>
  )
}
