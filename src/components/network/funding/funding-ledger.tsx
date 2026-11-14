"use client"

import Link from "next/link"
import IdentityRow from "@/components/ui/identity-row"
import WalletAddress from "@/components/ui/wallet-address"
import { FundingForTarget, HydratedIdentityRow } from "@/components/explore-page/funding-receipt-parts"
import { profileUrl, recordUrlFromAtUri } from "@/lib/urls"
import {
  BUCKET_BOTH,
  BUCKET_RECIPIENT,
  BUCKET_SENDER,
  BUCKET_TRUSTED,
  type FundingDataset,
} from "@/lib/funding/dataset-types"
import { confirmRoleLabel } from "@/lib/funding/labels"
import { primaryRole } from "@/lib/funding/select"
import { formatMoney, formatShortDay, formatTime } from "@/lib/funding/format"
import FundingSeal from "./funding-seal"

/** Who vouches for a receipt, in words: "Ma Earth", "Ma Earth + recipient",
 *  "Both sides", "Funder only", … */
export function confirmedByText(ds: FundingDataset, i: number): string {
  const bits = ds.receipts.buckets[i]
  if (bits & BUCKET_BOTH) return confirmRoleLabel("both")
  if (bits & BUCKET_TRUSTED) {
    const author = ds.authors[ds.receipts.author[i]]
    const name = ds.sources.find((s) => s.did === author)?.name ?? confirmRoleLabel("trusted")
    if (bits & BUCKET_RECIPIENT) return `${name} + recipient`
    if (bits & BUCKET_SENDER) return `${name} + funder`
    return name
  }
  return confirmRoleLabel(primaryRole(bits))
}

/** Column headings for {@link FundingLedgerRow}. */
export function FundingLedgerHeader({ showDate }: { showDate: boolean }) {
  return (
    <div className="funding-ledger__row funding-ledger__row--head" aria-hidden="true">
      <span>{showDate ? "When" : "Time"}</span>
      <span>From</span>
      <span>To</span>
      <span>For</span>
      <span className="funding-ledger__amount">Amount</span>
      <span>Confirmed by</span>
    </div>
  )
}

/**
 * One receipt as a ledger row: when, from, to, for, amount, and who vouches.
 * The row opens the receipt; the account and project links inside it work on
 * their own.
 */
export function FundingLedgerRow({
  ds,
  i,
  showDate,
  onOpen,
}: {
  ds: FundingDataset
  i: number
  showDate: boolean
  onOpen: (i: number) => void
}) {
  const r = ds.receipts
  const to = r.to[i] >= 0 ? ds.accounts[r.to[i]] : null
  const project = r.project[i] >= 0 ? ds.projects[r.project[i]] : null
  const projectHref = project ? recordUrlFromAtUri(project.uri) : null
  const currency = ds.currencies[r.currency[i]]
  const amount = formatMoney(r.amount[i], currency)
  const label = confirmedByText(ds, i)
  const bits = r.buckets[i]
  const ok = !!(bits & BUCKET_BOTH) || ((bits & BUCKET_TRUSTED) !== 0 && (bits & (BUCKET_RECIPIENT | BUCKET_SENDER)) !== 0)

  return (
    <div
      className="funding-ledger__row"
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("a, button")) return
        onOpen(i)
      }}
    >
      <span className="funding-ledger__when">
        {r.t[i] ? (
          <time dateTime={new Date(r.t[i] * 1000).toISOString()}>
            {showDate ? `${formatShortDay(r.t[i])} · ` : ""}
            {formatTime(r.t[i])}
          </time>
        ) : null}
        <button type="button" className="funding-ledger__open sr-only" onClick={() => onOpen(i)}>
          Open receipt: {amount} to {to?.name ?? "recipient"}
        </button>
      </span>
      <span className="funding-ledger__from">
        <span className="funding-ledger__cell-label" aria-hidden="true">
          From
        </span>
        <FromCell ds={ds} i={i} />
      </span>
      <span className="funding-ledger__to">
        <span className="funding-ledger__cell-label" aria-hidden="true">
          To
        </span>
        {to ? (
          <IdentityRow
            did={to.did}
            displayName={to.name ?? undefined}
            avatarUrl={to.avatar ?? undefined}
            href={profileUrl(to.did)}
            size="sm"
          />
        ) : ds.toText[i] ? (
          <WalletAddress address={ds.toText[i]} className="funding-ledger__text-party" />
        ) : null}
      </span>
      <span className="funding-ledger__for">
        <span className="funding-ledger__cell-label" aria-hidden="true">
          For
        </span>
        {project ? (
          projectHref ? (
            <Link href={projectHref} className="funding-ledger__project" dir="auto">
              {project.title ?? "Project"}
            </Link>
          ) : (
            <span className="funding-ledger__project">{project.title ?? "Project"}</span>
          )
        ) : ds.forUri[i] ? (
          <FundingForTarget uri={ds.forUri[i]} />
        ) : null}
      </span>
      <span className="funding-ledger__amount">{amount}</span>
      <span className={`funding-ledger__by${ok ? " funding-ledger__by--ok" : ""}`}>
        <FundingSeal bits={bits} size={16} />
        <span>{label}</span>
      </span>
    </div>
  )
}

function FromCell({ ds, i }: { ds: FundingDataset; i: number }) {
  const from = ds.receipts.from[i]
  if (from >= 0) return <HydratedIdentityRow did={ds.donors[from]} />
  if (from === -2 && ds.fromText[i]) {
    return <WalletAddress address={ds.fromText[i]} className="funding-ledger__text-party" />
  }
  return <span className="funding-ledger__anon">Anonymous</span>
}
