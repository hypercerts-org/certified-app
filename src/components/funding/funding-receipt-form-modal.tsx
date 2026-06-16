"use client"

import { useId, useMemo, useState } from "react"
import AppDialog, { AppDialogHeader, AppDialogBody } from "@/components/ui/app-dialog"
import Button from "@/components/ui/button"
import { HydratedIdentityRow } from "@/components/explore-page/funding-receipt-parts"
import FundingPartyField, {
  EMPTY_FUNDING_PARTY,
  type FundingPartyValue,
} from "./funding-party-field"
import {
  buildFundingReceiptRecord,
  createFundingReceipt,
  type CreateFundingReceiptResult,
  type StrongRef,
} from "@/lib/atproto/funding-receipt-record"
import type { FundingParty } from "@/lib/atproto/indexer"

/**
 * Record a funding receipt for an activity, opened from the activity-detail
 * Funding section. The viewer's role is constrained by who they are relative
 * to the activity:
 *
 *   - The activity author (or an owner/admin acting as the authoring group)
 *     records as the **recipient** — forced, not a choice. The `to` side is
 *     the author/group themselves (named, not "you").
 *   - A trusted evaluator may record as the **sender** or as a **third party**.
 *   - Everyone else may only record as the **sender** — forced.
 *
 * The receipt is authored by the acting identity (the group's repo via the
 * BFF when acting as a group, else the viewer's own repo), so the indexer
 * attributes the right attestation role. The "for" activity is fixed.
 */

type Role = "recipient" | "sender" | "third-party"

const TODAY = () => {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function isPositiveAmount(raw: string): boolean {
  const n = Number(raw.trim())
  return Number.isFinite(n) && n > 0
}

export default function FundingReceiptFormModal({
  writerDid,
  writerIsGroup,
  canRecordAsRecipient,
  isEvaluator,
  activityAuthorDid,
  forActivity,
  onClose,
  onCreated,
}: {
  /** The acting identity that authors the receipt (the viewer's DID, or the
   *  group DID when acting as a group). */
  writerDid: string
  /** Route the write through the group BFF so the group authors the record. */
  writerIsGroup: boolean
  /** The viewer is the activity author / an owner-admin acting as the
   *  authoring group, so they record as the recipient (forced). */
  canRecordAsRecipient: boolean
  /** Enables the third-party direction. */
  isEvaluator: boolean
  /** The activity's author — prefilled as the recipient when recording as a
   *  sender / third party (the funding is for this activity). */
  activityAuthorDid: string
  /** The activity this funding is for; becomes the `for` strongRef. */
  forActivity: StrongRef & { title?: string }
  onClose: () => void
  onCreated?: (result: CreateFundingReceiptResult) => void
}) {
  const headingId = useId()

  // Which roles the viewer may pick, in priority order. The author records as
  // recipient (forced); a non-author evaluator chooses sender or third-party;
  // everyone else records as sender (forced).
  const roles: Role[] = canRecordAsRecipient
    ? ["recipient"]
    : isEvaluator
      ? ["sender", "third-party"]
      : ["sender"]
  const [role, setRole] = useState<Role>(roles[0])

  const [fromParty, setFromParty] = useState<FundingPartyValue>(EMPTY_FUNDING_PARTY)
  // Default the recipient to the activity's author when the viewer is the
  // sender / a third party — the funding is for this activity.
  const [toParty, setToParty] = useState<FundingPartyValue>({
    party: { kind: "account", did: activityAuthorDid },
  })
  const [amount, setAmount] = useState("")
  const [currency, setCurrency] = useState("USDC")
  const [occurredAt, setOccurredAt] = useState(TODAY)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [paymentRail, setPaymentRail] = useState("")
  const [paymentNetwork, setPaymentNetwork] = useState("")
  const [transactionId, setTransactionId] = useState("")
  const [notes, setNotes] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { from, to } = useMemo((): { from: FundingParty; to: FundingParty } => {
    const me: FundingParty = { kind: "account", did: writerDid }
    const author: FundingParty = { kind: "account", did: activityAuthorDid }
    // Sender: both sides are known — I sent funds to this activity's author.
    if (role === "sender") return { from: me, to: author }
    if (role === "recipient") return { from: fromParty.party, to: me }
    return { from: fromParty.party, to: toParty.party }
  }, [role, writerDid, activityAuthorDid, fromParty.party, toParty.party])

  const canSubmit =
    !submitting && to !== null && isPositiveAmount(amount) && currency.trim().length > 0

  async function handleSubmit() {
    if (!canSubmit || to === null) return
    setSubmitting(true)
    setError(null)
    try {
      const record = buildFundingReceiptRecord({
        to,
        from: from ?? undefined,
        amount: amount.trim(),
        currency: currency.trim(),
        for: forActivity,
        occurredAt: occurredAt ? new Date(occurredAt).toISOString() : null,
        paymentRail: paymentRail.trim() || null,
        paymentNetwork: paymentNetwork.trim() || null,
        transactionId: transactionId.trim() || null,
        notes: notes.trim() || null,
      })
      const result = await createFundingReceipt(record, {
        writerDid,
        isGroup: writerIsGroup,
      })
      onCreated?.(result)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.")
      setSubmitting(false)
    }
  }

  // A fixed (named) side of the transfer — an identity row, never "you".
  const fixedIdentity = (did: string) => (
    <div className="funding-form__static funding-form__static--identity">
      <HydratedIdentityRow did={did} noLink />
    </div>
  )

  return (
    <AppDialog
      ariaLabel="Record a funding receipt"
      className="funding-form"
      maxWidth={480}
      onClose={submitting ? () => {} : onClose}
      disableBackdropClose={submitting}
    >
      <AppDialogHeader
        title={<span id={headingId}>Record funding</span>}
        onClose={submitting ? undefined : onClose}
      />
      <AppDialogBody>
        <form
          className="funding-form__body"
          onSubmit={(e) => {
            e.preventDefault()
            void handleSubmit()
          }}
        >
          {/* Role — a choice only for evaluators; otherwise fixed + explained. */}
          {roles.length > 1 ? (
            <fieldset className="funding-form__field" disabled={submitting}>
              <legend className="funding-form__label">Your role</legend>
              <div className="funding-form__directions">
                <RoleRadio
                  value="sender"
                  current={role}
                  onSelect={setRole}
                  label="I sent this"
                />
                <RoleRadio
                  value="third-party"
                  current={role}
                  onSelect={setRole}
                  label="Record for others"
                />
              </div>
            </fieldset>
          ) : (
            <p className="funding-form__confirm-lede">
              {role === "recipient"
                ? "Recording funding received for this activity."
                : "Recording funding you sent to this activity."}
            </p>
          )}

          {/* From — the viewer when they're the sender, else an editable
              party (optional: a sender may stay anonymous). */}
          <div className="funding-form__field">
            <span className="funding-form__label">
              From{" "}
              {role === "recipient" || role === "third-party" ? (
                <span className="funding-form__optional">(optional)</span>
              ) : null}
            </span>
            {role === "sender" ? (
              fixedIdentity(writerDid)
            ) : (
              <FundingPartyField
                ariaLabel="Funder"
                value={fromParty}
                onChange={setFromParty}
                disabled={submitting}
              />
            )}
          </div>

          {/* To — the viewer when they're the recipient; the activity's
              author when they're the sender (the funding is for this
              activity); otherwise editable (third party). */}
          <div className="funding-form__field">
            <span className="funding-form__label">To</span>
            {role === "recipient" ? (
              fixedIdentity(writerDid)
            ) : role === "sender" ? (
              fixedIdentity(activityAuthorDid)
            ) : (
              <FundingPartyField
                ariaLabel="Recipient"
                value={toParty}
                onChange={setToParty}
                disabled={submitting}
              />
            )}
          </div>

          {/* Amount + currency. */}
          <div className="funding-form__field">
            <label className="funding-form__label" htmlFor="funding-amount">
              Amount
            </label>
            <div className="funding-form__amount-row">
              <input
                id="funding-amount"
                type="text"
                inputMode="decimal"
                className="funding-form__input funding-form__input--amount"
                placeholder="0.00"
                value={amount}
                disabled={submitting}
                maxLength={50}
                onChange={(e) => setAmount(e.target.value)}
              />
              <input
                type="text"
                className="funding-form__input funding-form__input--currency"
                aria-label="Currency"
                list="funding-currencies"
                placeholder="USDC"
                value={currency}
                disabled={submitting}
                maxLength={10}
                onChange={(e) => setCurrency(e.target.value)}
              />
              <datalist id="funding-currencies">
                <option value="USDC" />
                <option value="USD" />
                <option value="EUR" />
                <option value="ETH" />
              </datalist>
            </div>
          </div>

          {/* When the payment happened. */}
          <div className="funding-form__field">
            <label className="funding-form__label" htmlFor="funding-occurred">
              Date
            </label>
            <input
              id="funding-occurred"
              type="date"
              className="funding-form__input"
              value={occurredAt}
              disabled={submitting}
              onChange={(e) => setOccurredAt(e.target.value)}
            />
          </div>

          {/* For — the activity, read-only. */}
          <div className="funding-form__field">
            <span className="funding-form__label">For</span>
            <p className="funding-form__static funding-form__static--for">
              {forActivity.title || "This activity"}
            </p>
          </div>

          {/* Advanced payment metadata — collapsed by default. */}
          <div className="funding-form__field">
            <button
              type="button"
              className="funding-form__disclosure"
              aria-expanded={advancedOpen}
              onClick={() => setAdvancedOpen((v) => !v)}
            >
              {advancedOpen ? "Hide" : "Add"} payment details
            </button>
            {advancedOpen ? (
              <div className="funding-form__advanced">
                <input
                  type="text"
                  className="funding-form__input"
                  aria-label="Payment rail"
                  placeholder="Payment rail (e.g. onchain, bank_transfer)"
                  value={paymentRail}
                  disabled={submitting}
                  maxLength={50}
                  onChange={(e) => setPaymentRail(e.target.value)}
                />
                <input
                  type="text"
                  className="funding-form__input"
                  aria-label="Payment network"
                  placeholder="Network (e.g. base, ethereum)"
                  value={paymentNetwork}
                  disabled={submitting}
                  maxLength={50}
                  onChange={(e) => setPaymentNetwork(e.target.value)}
                />
                <input
                  type="text"
                  className="funding-form__input"
                  aria-label="Transaction ID"
                  placeholder="Transaction ID / reference"
                  value={transactionId}
                  disabled={submitting}
                  maxLength={256}
                  onChange={(e) => setTransactionId(e.target.value)}
                />
              </div>
            ) : null}
          </div>

          {/* Note. */}
          <div className="funding-form__field">
            <label className="funding-form__label" htmlFor="funding-notes">
              Note <span className="funding-form__optional">(optional)</span>
            </label>
            <textarea
              id="funding-notes"
              className="funding-form__input funding-form__textarea"
              placeholder="Any context for this payment"
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
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" loading={submitting} disabled={!canSubmit}>
              Record
            </Button>
          </div>
        </form>
      </AppDialogBody>
    </AppDialog>
  )
}

function RoleRadio({
  value,
  current,
  onSelect,
  label,
}: {
  value: Role
  current: Role
  onSelect: (next: Role) => void
  label: string
}) {
  return (
    <label
      className="funding-form__direction"
      data-active={current === value ? "" : undefined}
    >
      <input
        type="radio"
        name="funding-role"
        value={value}
        checked={current === value}
        onChange={() => onSelect(value)}
      />
      {label}
    </label>
  )
}
