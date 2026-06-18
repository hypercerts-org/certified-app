"use client"

import { useEffect, useId, useMemo, useState, type ReactNode } from "react"
import { Check, ChevronRight, Copy, Trash2 } from "lucide-react"
import AppDialog, { AppDialogHeader, AppDialogBody } from "@/components/ui/app-dialog"
import Button from "@/components/ui/button"
import Tooltip from "@/components/ui/tooltip"
import {
  FundingForActivity,
  FundingPartySlot,
  HydratedIdentityRow,
} from "./funding-receipt-parts"
import ConfirmFundingContent from "@/components/funding/confirm-funding-dialog"
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard"
import { useAuthorInfo } from "@/hooks/use-author-info"
import { useAuth } from "@/lib/auth/auth-context"
import { useTrustedEvaluators } from "@/hooks/use-trusted-evaluators"
import { useOrg } from "@/lib/groups/org-context"
import {
  fundingConfirmEligibility,
  type FundingRole,
} from "@/lib/atproto/funding-provenance"
import { receiptAuthorRole, sameClusterKeys } from "@/lib/atproto/funding-merge"
import { deleteFundingReceipt, listFundingReceiptsInRepo } from "@/lib/atproto/funding-receipt-record"
import type { FundingAttestation } from "@/lib/atproto/indexer"
import {
  useFundingConfirmedLocally,
  markFundingDeleted,
} from "@/lib/atproto/funding-confirmed-store"
import { formatShortDate } from "@/lib/utils/format-date"
import type { FundingReceipt } from "@/lib/atproto/indexer"

/** One identity's stance on a payment: whether it can confirm (and as what
 *  role), whether it already attested, and the URI of the receipt it authored
 *  (present ⇒ it can be taken back). */
interface Perspective {
  did: string
  isGroup: boolean
  canConfirm: boolean
  role: FundingRole | null
  attested: boolean
  deleteUri: string | undefined
}

/** Whether a payment involves `did` — a from/to account party, or the author
 *  of one of the cluster's receipts. */
function receiptInvolves(
  receipt: FundingReceipt,
  did: string,
  memberByDid: Map<string, FundingReceipt>,
): boolean {
  if (receipt.from?.kind === "account" && receipt.from.did === did) return true
  if (receipt.to?.kind === "account" && receipt.to.did === did) return true
  return memberByDid.has(did)
}

function buildPerspective(
  receipt: FundingReceipt,
  did: string,
  isGroup: boolean,
  memberByDid: Map<string, FundingReceipt>,
  /** A personal optimistic confirmation this session (bridges indexer lag). */
  bridged: boolean,
  trustedEvaluatorDids: readonly string[],
): Perspective {
  const elig = fundingConfirmEligibility(receipt, did, trustedEvaluatorDids)
  return {
    did,
    isGroup,
    canConfirm: elig.canConfirm && !bridged,
    role: elig.role,
    attested: elig.alreadyAttested || bridged,
    deleteUri: memberByDid.get(did)?.uri,
  }
}

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

  const { did: viewerDid } = useAuth()
  const { evaluatorDids } = useTrustedEvaluators()
  const { groups } = useOrg()
  // A confirmation this session (before the indexer reflects it) keeps the
  // viewer's own affordance hidden so the payment can't be confirmed twice.
  const confirmedLocally = useFundingConfirmedLocally(receipt.uri)

  // One "Record" section per author of the payment. Prefer the attestations
  // (they cover the whole cluster); fall back to this receipt alone when
  // unattested.
  const recordAuthors: FundingAttestation[] =
    receipt.attestations.length > 0
      ? receipt.attestations
      : [{ role: receiptAuthorRole(receipt), did: receipt.did }]
  const multipleRecords = recordAuthors.length > 1

  // The indexer collapses a confirmed payment into one canonical node, dropping
  // the other members — and the canonical exposes no link to them (its
  // `matchingReceipt` is cleared). So an attestation author we don't hold a
  // receipt for has no date/URI/CID and can't be taken back. Recover each by
  // listing that author's repo and matching the payment's cluster keys. Keyed
  // by the receipt URI so members from a previous receipt are ignored without a
  // synchronous reset.
  const [resolved, setResolved] = useState<{
    uri: string
    members: FundingReceipt[]
  } | null>(null)
  useEffect(() => {
    const base = receipt.members ?? [receipt]
    const haveDids = new Set(base.map((m) => m.did))
    const missingDids = [
      ...new Set(receipt.attestations.map((a) => a.did)),
    ].filter((did) => !haveDids.has(did))
    if (missingDids.length === 0) return
    let cancelled = false
    Promise.all(
      missingDids.map(async (did) => {
        const all = await listFundingReceiptsInRepo(did)
        return all.find((r) => sameClusterKeys(receipt, r)) ?? null
      }),
    ).then((found) => {
      const members = found.filter((r): r is FundingReceipt => r !== null)
      if (!cancelled && members.length > 0) {
        setResolved({ uri: receipt.uri, members })
      }
    })
    return () => {
      cancelled = true
    }
  }, [receipt])

  const memberByDid = useMemo(() => {
    const map = new Map<string, FundingReceipt>()
    for (const m of receipt.members ?? [receipt]) map.set(m.did, m)
    if (resolved?.uri === receipt.uri) {
      for (const m of resolved.members) if (!map.has(m.did)) map.set(m.did, m)
    }
    return map
  }, [receipt, resolved])

  // The identities the viewer can act through on this payment: themselves,
  // plus any group they're an owner/admin of that the payment involves (a
  // from/to party, or the author of one of the cluster's receipts). Each gets
  // its own row of actions (Confirm / take-back / confirmed state).
  const perspectives = useMemo<Perspective[]>(() => {
    const out: Perspective[] = []
    if (viewerDid) {
      out.push(
        buildPerspective(receipt, viewerDid, false, memberByDid, confirmedLocally, evaluatorDids),
      )
    }
    for (const g of groups) {
      if (g.role !== "owner" && g.role !== "admin") continue
      if (g.groupDid === viewerDid) continue
      if (!receiptInvolves(receipt, g.groupDid, memberByDid)) continue
      out.push(buildPerspective(receipt, g.groupDid, true, memberByDid, false, evaluatorDids))
    }
    return out
  }, [receipt, viewerDid, groups, confirmedLocally, memberByDid, evaluatorDids])

  const [confirmingAs, setConfirmingAs] = useState<{
    did: string
    isGroup: boolean
    role: FundingRole
  } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<{
    uri: string
    isGroup: boolean
  } | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    setDeleteError(null)
    try {
      await deleteFundingReceipt(deleteTarget.uri, { isGroup: deleteTarget.isGroup })
      markFundingDeleted(deleteTarget.uri)
      onClose()
    } catch (err) {
      setDeleteError(
        err instanceof Error ? err.message : "Could not delete the receipt.",
      )
      setDeleting(false)
    }
  }

  // Anything to show in the footer at all?
  const hasFooterActions = perspectives.some(
    (p) => p.canConfirm || p.attested || p.deleteUri,
  )
  // Label each row only when there's more than one identity.
  const labelled = perspectives.length > 1

  // While confirming, swap the detail content for the confirm UI in the SAME
  // dialog (no second modal). Escape / backdrop returns to the detail view.
  if (confirmingAs) {
    return (
      <AppDialog
        ariaLabel="Confirm funding payment"
        className="funding-receipt-detail funding-form"
        maxWidth={460}
        onClose={() => setConfirmingAs(null)}
      >
        <AppDialogHeader
          title="Confirm payment"
          onClose={() => setConfirmingAs(null)}
        />
        <AppDialogBody>
          <ConfirmFundingContent
            receipt={receipt}
            writerDid={confirmingAs.did}
            isGroup={confirmingAs.isGroup}
            role={confirmingAs.role}
            onCancel={() => setConfirmingAs(null)}
            onConfirmed={() => setConfirmingAs(null)}
          />
        </AppDialogBody>
      </AppDialog>
    )
  }

  return (
    <AppDialog
      ariaLabel="Funding receipt details"
      className="funding-receipt-detail"
      maxWidth={460}
      onClose={onClose}
    >
      <AppDialogHeader title="Funding receipt" onClose={onClose} center />

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

          <DetailRow label="For">
            {hasForActivity ? (
              <FundingForActivity uri={receipt.forUri} />
            ) : (
              <EmptyValue />
            )}
          </DetailRow>

          <DetailRow label="Note">
            {receipt.notes ? (
              <span className="funding-receipt-detail__note">{receipt.notes}</span>
            ) : (
              <EmptyValue />
            )}
          </DetailRow>
        </DetailSection>

        <DetailSection title="Payment">
          <DetailRow label="Occurred">
            <DateValue iso={receipt.occurredAt} />
          </DetailRow>

          <DetailRow label="Payment rail">
            {receipt.paymentRail ? receipt.paymentRail : <EmptyValue />}
          </DetailRow>

          <DetailRow label="Payment network">
            {receipt.paymentNetwork ? receipt.paymentNetwork : <EmptyValue />}
          </DetailRow>

          <DetailRow label="Transaction">
            {receipt.transactionId ? (
              <CopyableValue
                value={receipt.transactionId}
                label="Copy transaction ID"
              />
            ) : (
              <EmptyValue />
            )}
          </DetailRow>
        </DetailSection>

        {/* One "Record" section per author: a payment may be recorded by the
            sender, the recipient, and/or a third party. The role is shown in
            parentheses only when there's more than one. */}
        {recordAuthors.map((att, i) => {
          const member = memberByDid.get(att.did)
          return (
            <DetailSection
              key={`${att.role}-${att.did}-${i}`}
              title={
                multipleRecords ? (
                  <RecordSectionTitle role={att.role} did={att.did} />
                ) : (
                  "Record"
                )
              }
            >
              <DetailRow label="Recorded">
                {member ? <DateValue iso={member.createdAt} /> : <EmptyValue />}
              </DetailRow>

              <DetailRow label="Published by">
                <CreatorIdentity did={att.did} />
              </DetailRow>

              <DetailRow label="Record">
                {member ? (
                  <CopyableValue value={member.uri} label="Copy record URI" />
                ) : (
                  <EmptyValue />
                )}
              </DetailRow>

              <DetailRow label="CID">
                {member ? (
                  <CopyableValue value={member.cid} label="Copy CID" />
                ) : (
                  <EmptyValue />
                )}
              </DetailRow>
            </DetailSection>
          )
        })}

        {deleteTarget ? (
          <div className="funding-receipt-detail__footer">
            <div className="funding-receipt-detail__delete-confirm">
              <span className="funding-receipt-detail__delete-prompt">
                Delete this payment receipt?
              </span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                loading={deleting}
                onClick={() => void handleDelete()}
              >
                Delete
              </Button>
            </div>
          </div>
        ) : hasFooterActions && labelled ? (
          <div className="funding-receipt-detail__footer funding-receipt-detail__footer--list">
            {perspectives
              .filter((p) => p.canConfirm || p.attested || p.deleteUri)
              .map((p) => (
                <div className="funding-receipt-detail__perspective" key={p.did}>
                  <HydratedIdentityRow
                    did={p.did}
                    noLink
                    className="funding-receipt-detail__perspective-id"
                  />
                  <span className="funding-receipt-detail__perspective-action">
                    {p.canConfirm && p.role ? (
                      <Button
                        size="sm"
                        onClick={() =>
                          setConfirmingAs({
                            did: p.did,
                            isGroup: p.isGroup,
                            role: p.role!,
                          })
                        }
                      >
                        Confirm
                      </Button>
                    ) : p.attested ? (
                      <span className="funding-receipt-detail__confirmed-note">
                        Confirmed
                      </span>
                    ) : null}
                    {p.deleteUri ? (
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="Take back this receipt"
                        onClick={() =>
                          setDeleteTarget({ uri: p.deleteUri!, isGroup: p.isGroup })
                        }
                      >
                        <Trash2 size={16} strokeWidth={1.75} aria-hidden />
                      </Button>
                    ) : null}
                  </span>
                </div>
              ))}
          </div>
        ) : hasFooterActions ? (
          // Single (personal) perspective — keep the familiar copy.
          <div className="funding-receipt-detail__footer">
            {perspectives[0].canConfirm && perspectives[0].role ? (
              <Button
                size="sm"
                onClick={() =>
                  setConfirmingAs({
                    did: perspectives[0].did,
                    isGroup: perspectives[0].isGroup,
                    role: perspectives[0].role!,
                  })
                }
              >
                Confirm payment
              </Button>
            ) : (
              <div className="funding-receipt-detail__confirmed">
                {perspectives[0].attested ? (
                  <p className="funding-receipt-detail__confirmed-note">
                    You&rsquo;ve confirmed this payment.
                  </p>
                ) : null}
                {perspectives[0].deleteUri ? (
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Delete this payment confirmation"
                    onClick={() =>
                      setDeleteTarget({
                        uri: perspectives[0].deleteUri!,
                        isGroup: perspectives[0].isGroup,
                      })
                    }
                  >
                    <Trash2 size={16} strokeWidth={1.75} aria-hidden />
                  </Button>
                ) : null}
              </div>
            )}
          </div>
        ) : null}
        {deleteError ? (
          <p className="funding-form__error" role="alert">
            {deleteError}
          </p>
        ) : null}
      </div>
    </AppDialog>
  )
}

/** A collapsible titled group of detail rows (Transfer / Payment /
 *  Record). The heading is a disclosure button (`<h3><button>` — the
 *  standard accordion pattern); `defaultOpen` controls the initial state,
 *  so only the first group is expanded on open. Each section owns its own
 *  `<dl>` so the inter-row hairlines reset at the group boundary. */
export function DetailSection({
  title,
  defaultOpen = false,
  children,
}: {
  title: ReactNode
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
export function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="funding-receipt-detail__row">
      <dt className="funding-receipt-detail__label">{label}</dt>
      <dd className="funding-receipt-detail__value">{children}</dd>
    </div>
  )
}

/** A null / missing field rendered as a muted em dash. */
export function EmptyValue() {
  return <span className="funding-receipt-detail__empty">—</span>
}

/** A timestamp shown as the YYYY-MM-DD calendar date with the full ISO
 *  string available on hover (and in the `<time>` dateTime). */
export function DateValue({ iso }: { iso: string | null }) {
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

/** The "Record (…)" section title: the author's role in parentheses —
 *  "Sender" / "Recipient", or a third party's display name (e.g. "Ma Earth"),
 *  hydrated from their DID. */
function RecordSectionTitle({
  role,
  did,
}: {
  role: FundingAttestation["role"]
  did: string
}) {
  const { info } = useAuthorInfo(did)
  if (role === "sender") return <>Record (Funder)</>
  if (role === "recipient") return <>Record (Recipient)</>
  const name =
    info?.displayName || (info?.handle ? `@${info.handle}` : "third party")
  return <>Record ({name})</>
}

/** A long, monospaced identifier (at:// URI, CID) with a click-to-copy
 *  button and a brief "Copied" confirmation. */
export function CopyableValue({ value, label }: { value: string; label: string }) {
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
