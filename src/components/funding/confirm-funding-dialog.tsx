"use client"

import { useState } from "react"
import Button from "@/components/ui/button"
import { FundingPartySlot } from "@/components/explore-page/funding-receipt-parts"
import {
  buildConfirmationRecord,
  createFundingReceipt,
  recordToReceipt,
  type CreateFundingReceiptResult,
} from "@/lib/atproto/funding-receipt-record"
import { addOptimisticConfirmation } from "@/lib/atproto/funding-confirmed-store"
import type { FundingRole } from "@/lib/atproto/funding-provenance"
import type { FundingReceipt } from "@/lib/atproto/indexer"

/**
 * Confirm an existing funding payment. Rendered *in place* inside the receipt
 * detail modal (not a second dialog) when the viewer is eligible (sender /
 * recipient named by DID, or a trusted evaluator). Publishes the viewer's own
 * receipt with the payment's coordinates copied verbatim
 * (`from` / `to` / `amount` / `currency` / `for`, plus a `matchingReceipt`
 * link) so the indexer clusters it with the original; authorship then adds the
 * sender/recipient/third-party attestation. The viewer may add their own
 * corroborating transaction id / note — those aren't clustering keys.
 *
 * The transfer is shown read-only: changing a party or the amount would
 * describe a *different* payment and wouldn't confirm this one.
 */

const ROLE_LABEL: Record<FundingRole, string> = {
  sender: "the funder",
  recipient: "the recipient",
  "third-party": "a third party",
}

export default function ConfirmFundingContent({
  receipt,
  writerDid,
  isGroup = false,
  role,
  onCancel,
  onConfirmed,
}: {
  receipt: FundingReceipt
  /** The identity authoring the confirmation (the viewer, or a group they're
   *  an owner/admin of). */
  writerDid: string
  /** Author the confirmation as the group (via the group BFF). */
  isGroup?: boolean
  /** The role this confirmation will carry (drives the headline copy). */
  role: FundingRole
  /** Return to the detail view without confirming. */
  onCancel: () => void
  onConfirmed?: (result: CreateFundingReceiptResult) => void
}) {
  const [notes, setNotes] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canConfirm = !submitting && !!receipt.amount && !!receipt.currency

  async function handleConfirm() {
    if (!canConfirm) return
    setSubmitting(true)
    setError(null)
    try {
      const record = buildConfirmationRecord(receipt, {
        notes: notes.trim() || null,
      })
      const result = await createFundingReceipt(record, { writerDid, isGroup })
      // Optimistically collapse the pair into one confirmed row (issue #186)
      // and hide the affordance on the original until the indexer catches up.
      addOptimisticConfirmation(
        receipt.uri,
        recordToReceipt(record, {
          uri: result.uri,
          cid: result.cid,
          did: writerDid,
        }),
      )
      onConfirmed?.(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.")
      setSubmitting(false)
    }
  }

  return (
    <div className="funding-form__body">
      <p className="funding-form__confirm-lede">
        You&rsquo;ll confirm this payment as <strong>{ROLE_LABEL[role]}</strong>.
        This publishes your own receipt for the same payment.
      </p>

      {/* Read-only transfer summary — these are the clustering keys. */}
      <div className="funding-form__summary">
        <div className="funding-form__summary-row">
          <span className="funding-form__summary-label">From</span>
          <span className="funding-form__summary-value">
            <FundingPartySlot party={receipt.from} showText />
            {receipt.from === null ? (
              <span className="funding-form__muted">Anonymous</span>
            ) : null}
          </span>
        </div>
        <div className="funding-form__summary-row">
          <span className="funding-form__summary-label">To</span>
          <span className="funding-form__summary-value">
            <FundingPartySlot party={receipt.to} showText />
          </span>
        </div>
        <div className="funding-form__summary-row">
          <span className="funding-form__summary-label">Amount</span>
          <span className="funding-form__summary-value">
            {receipt.amount}
            {receipt.currency ? ` ${receipt.currency}` : ""}
          </span>
        </div>
      </div>

      {/* Optional free-text note from the confirmer (not a clustering key). */}
      <div className="funding-form__field">
        <label className="funding-form__label" htmlFor="confirm-notes">
          Note <span className="funding-form__optional">(optional)</span>
        </label>
        <textarea
          id="confirm-notes"
          className="funding-form__input funding-form__textarea"
          placeholder="Any context for your confirmation"
          value={notes}
          disabled={submitting}
          maxLength={500}
          rows={2}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      {error ? (
        <p className="funding-form__error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="funding-form__actions">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={onCancel}
          disabled={submitting}
        >
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          loading={submitting}
          disabled={!canConfirm}
          onClick={() => void handleConfirm()}
        >
          Confirm payment
        </Button>
      </div>
    </div>
  )
}
