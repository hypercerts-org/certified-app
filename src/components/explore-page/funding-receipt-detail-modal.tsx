"use client"

import { useId, useState, type ReactNode } from "react"
import { Check, ChevronRight, Copy } from "lucide-react"
import AppDialog, { AppDialogHeader } from "@/components/ui/app-dialog"
import Tooltip from "@/components/ui/tooltip"
import {
  FundingForActivity,
  FundingPartySlot,
  HydratedIdentityRow,
} from "./funding-receipt-parts"
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard"
import { formatShortDate } from "@/lib/utils/format-date"
import type { FundingReceipt } from "@/lib/atproto/indexer"

/**
 * Read-only detail view for a single `org.hypercerts.funding.receipt`,
 * opened by clicking a row in the /explore Funding list. Surfaces every
 * field the indexer returns, ordered as a top-to-bottom narrative:
 *   1. The transfer — who paid whom, how much, for what, plus any note.
 *   2. The payment — when it happened and how it settled (rail / network /
 *      transaction id).
 *   3. The record — when it was logged, by which account, and its raw
 *      at:// URI + CID.
 * Optional payment-method fields render only when present so receipts that
 * omit them stay compact; copyable values (transaction id, URI, CID) carry
 * a copy button.
 *
 * Parties and the `for` activity reuse the same renderers the list row
 * uses ({@link FundingPartySlot} / {@link FundingForActivity}) so an
 * account shows avatar + name and a wallet address shows its ENS name /
 * copyable hex exactly as in the row.
 */
export default function FundingReceiptDetailModal({
  receipt,
  onClose,
}: {
  receipt: FundingReceipt
  onClose: () => void
}) {
  const hasAmount = !!receipt.amount
  const hasForActivity = !!receipt.forUri

  return (
    <AppDialog
      ariaLabel="Funding receipt details"
      className="funding-receipt-detail"
      maxWidth={460}
      onClose={onClose}
    >
      <AppDialogHeader title="Funding receipt" onClose={onClose} />

      <div className="px-5 pb-5 pt-0">
        {/* Grouped as a top-to-bottom narrative: who paid whom (Transfer),
            how it settled (Payment), and how it's recorded (Record). */}
        <DetailSection title="Transfer" defaultOpen>
          <DetailRow label="From">
            <FundingPartySlot party={receipt.from} showText />
          </DetailRow>

          <DetailRow label="To">
            <FundingPartySlot party={receipt.to} showText />
          </DetailRow>

          <DetailRow label="Amount">
            {hasAmount ? (
              <span className="funding-receipt-detail__amount">
                {receipt.amount}
                {receipt.currency ? (
                  <span className="funding-receipt-detail__currency">
                    {receipt.currency}
                  </span>
                ) : null}
              </span>
            ) : (
              <EmptyValue />
            )}
          </DetailRow>

          {hasForActivity ? (
            <DetailRow label="For">
              <FundingForActivity uri={receipt.forUri} />
            </DetailRow>
          ) : null}

          {receipt.notes ? (
            <DetailRow label="Note">
              <span className="funding-receipt-detail__note">{receipt.notes}</span>
            </DetailRow>
          ) : null}
        </DetailSection>

        <DetailSection title="Payment">
          <DetailRow label="Occurred">
            <DateValue iso={receipt.occurredAt} />
          </DetailRow>

          {receipt.paymentRail ? (
            <DetailRow label="Payment rail">{receipt.paymentRail}</DetailRow>
          ) : null}

          {receipt.paymentNetwork ? (
            <DetailRow label="Payment network">
              {receipt.paymentNetwork}
            </DetailRow>
          ) : null}

          {receipt.transactionId ? (
            <DetailRow label="Transaction">
              <CopyableValue
                value={receipt.transactionId}
                label="Copy transaction ID"
              />
            </DetailRow>
          ) : null}
        </DetailSection>

        <DetailSection title="Record">
          <DetailRow label="Recorded">
            <DateValue iso={receipt.createdAt} />
          </DetailRow>

          <DetailRow label="Published by">
            <CreatorIdentity did={receipt.did} />
          </DetailRow>

          <DetailRow label="Record">
            <CopyableValue value={receipt.uri} label="Copy record URI" />
          </DetailRow>

          <DetailRow label="CID">
            <CopyableValue value={receipt.cid} label="Copy CID" />
          </DetailRow>
        </DetailSection>
      </div>
    </AppDialog>
  )
}

/** A collapsible titled group of detail rows (Transfer / Payment /
 *  Record). The heading is a disclosure button (`<h3><button>` — the
 *  standard accordion pattern); `defaultOpen` controls the initial state,
 *  so only the first group is expanded on open. Each section owns its own
 *  `<dl>` so the inter-row hairlines reset at the group boundary. */
function DetailSection({
  title,
  defaultOpen = false,
  children,
}: {
  title: string
  defaultOpen?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  const contentId = useId()
  return (
    <section className="funding-receipt-detail__section">
      <h3 className="funding-receipt-detail__section-heading">
        <button
          type="button"
          className="funding-receipt-detail__section-toggle"
          aria-expanded={open}
          aria-controls={contentId}
          onClick={() => setOpen((v) => !v)}
        >
          <ChevronRight
            size={16}
            strokeWidth={2}
            aria-hidden
            className="funding-receipt-detail__chevron"
            data-open={open ? "" : undefined}
          />
          {title}
        </button>
      </h3>
      {open ? (
        <dl id={contentId} className="funding-receipt-detail__list">
          {children}
        </dl>
      ) : null}
    </section>
  )
}

/** One label/value pair in the detail list. */
function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="funding-receipt-detail__row">
      <dt className="funding-receipt-detail__label">{label}</dt>
      <dd className="funding-receipt-detail__value">{children}</dd>
    </div>
  )
}

/** A null / missing field rendered as a muted em dash. */
function EmptyValue() {
  return <span className="funding-receipt-detail__empty">—</span>
}

/** A timestamp shown as the YYYY-MM-DD calendar date with the full ISO
 *  string available on hover (and in the `<time>` dateTime). */
function DateValue({ iso }: { iso: string | null }) {
  if (!iso) return <EmptyValue />
  return (
    <time dateTime={iso} title={iso}>
      {formatShortDate(iso)}
    </time>
  )
}

/** The account that published the receipt record (its repo DID), shown as
 *  an avatar + name row linking to the profile — hydrated like every other
 *  account byline. */
function CreatorIdentity({ did }: { did: string }) {
  return <HydratedIdentityRow did={did} />
}

/** A long, monospaced identifier (at:// URI, CID) with a click-to-copy
 *  button and a brief "Copied" confirmation. */
function CopyableValue({ value, label }: { value: string; label: string }) {
  const { copied, copy } = useCopyToClipboard()
  return (
    <span className="funding-receipt-detail__copyable">
      <span className="funding-receipt-detail__mono" title={value}>
        {value}
      </span>
      <Tooltip label={copied ? "Copied" : label}>
        <button
          type="button"
          className="funding-receipt-detail__copy-btn"
          onClick={() => copy(value)}
          aria-label={copied ? "Copied" : label}
        >
          {copied ? (
            <Check size={13} strokeWidth={2} aria-hidden />
          ) : (
            <Copy size={13} strokeWidth={1.75} aria-hidden />
          )}
        </button>
      </Tooltip>
    </span>
  )
}
