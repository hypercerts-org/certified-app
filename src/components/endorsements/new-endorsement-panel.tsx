"use client"

import { useState } from "react"
import { X, Check, AlertCircle } from "lucide-react"
import HandleSearch from "@/components/groups/handle-search"
import Avatar from "@/components/ui/avatar"
import Button from "@/components/ui/button"
import { useAuthorInfo } from "@/hooks/use-author-info"
import { getInitials } from "@/lib/utils/initials"
import { createEndorsementAward } from "@/lib/atproto/badges"

interface NewEndorsementPanelProps {
  /** The current user's DID — endorsement records are written to
   *  this repo. */
  readonly ownDid: string
  /** DIDs the user has already endorsed (used to block duplicates). */
  readonly existingSubjectDids: ReadonlySet<string>
  /** DIDs to pre-select when the panel opens — typically a single DID
   *  from a deep-link like `/endorsements?endorse=did:plc:...`. Caller
   *  is responsible for validating these (not self, not duplicate)
   *  before passing. Consumed once on mount via a lazy-initialiser. */
  readonly initialDids?: readonly string[]
  /** Dismiss the panel (parent flips back to the collapsed "+ New"
   *  button state). Called from the close affordance, and
   *  automatically on a fully-successful batch. */
  readonly onClose: () => void
  /** Called after at least one successful create so the parent can
   *  refetch. Continue-on-error semantics: fires even if some writes
   *  in the batch failed, as long as at least one succeeded. */
  readonly onCreated: () => void | Promise<void>
}

/** Per-recipient write status — drives the inline status badge on
 *  each row and any error text underneath. */
type WriteStatus =
  | { kind: "idle" }
  | { kind: "writing" }
  | { kind: "success" }
  | { kind: "error"; message: string }

/**
 * Inline form for creating endorsements. Pick one or more targets via
 * the handle/DID search, then click Endorse to write a `badge.award`
 * for each. Continue-on-error: each recipient's write is independent;
 * failures don't abort the batch.
 *
 * After a fully-successful batch the panel clears itself back to the
 * empty search state. After a partial-failure batch it keeps the
 * failed rows visible so the user can see what went wrong; the
 * "Clear" button on the panel resets the list manually.
 */
export default function NewEndorsementPanel({
  ownDid,
  existingSubjectDids,
  initialDids,
  onClose,
  onCreated,
}: NewEndorsementPanelProps) {
  const [selectedDids, setSelectedDids] = useState<string[]>(() =>
    initialDids ? Array.from(initialDids) : [],
  )
  const [handleByDid, setHandleByDid] = useState<Record<string, string>>({})
  const [statusByDid, setStatusByDid] = useState<Record<string, WriteStatus>>({})

  const [pickError, setPickError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const writeCompleteCount = Object.values(statusByDid).filter(
    (s) => s.kind === "success" || s.kind === "error",
  ).length
  const writeSuccessCount = Object.values(statusByDid).filter(
    (s) => s.kind === "success",
  ).length
  const hasResults = writeCompleteCount > 0

  const reset = () => {
    setSelectedDids([])
    setHandleByDid({})
    setStatusByDid({})
    setPickError(null)
  }

  const handleAddRecipient = (did: string, handle: string) => {
    setPickError(null)
    if (did === ownDid) {
      setPickError("You can't endorse yourself.")
      return
    }
    if (existingSubjectDids.has(did)) {
      setPickError("You've already endorsed this account.")
      return
    }
    if (selectedDids.includes(did)) {
      setPickError("This account is already in the list.")
      return
    }
    setSelectedDids((prev) => [did, ...prev])
    setHandleByDid((prev) => ({ ...prev, [did]: handle }))
  }

  const handleRemoveRecipient = (did: string) => {
    setSelectedDids((prev) => prev.filter((d) => d !== did))
    setHandleByDid((prev) => {
      const next = { ...prev }
      delete next[did]
      return next
    })
    setStatusByDid((prev) => {
      const next = { ...prev }
      delete next[did]
      return next
    })
  }

  const handleSubmit = async () => {
    if (selectedDids.length === 0 || isSubmitting) return
    setIsSubmitting(true)
    // Mark each as writing up-front so the row shows the spinner
    // immediately rather than after the parallel promise resolves.
    setStatusByDid(
      Object.fromEntries(selectedDids.map((d) => [d, { kind: "writing" } as WriteStatus])),
    )

    // Parallel writes with continue-on-error. ensureEndorsementDefinition
    // is singleflight per-DID inside the lib, so the first write does
    // the definition create and the rest await its strongRef.
    const settled = await Promise.allSettled(
      selectedDids.map((did) => createEndorsementAward(ownDid, did)),
    )

    const next: Record<string, WriteStatus> = {}
    settled.forEach((r, i) => {
      const did = selectedDids[i]
      if (r.status === "fulfilled") {
        next[did] = { kind: "success" }
      } else {
        const message =
          r.reason instanceof Error
            ? r.reason.message
            : "Failed to create endorsement"
        next[did] = { kind: "error", message }
      }
    })
    setStatusByDid(next)

    const successCount = Object.values(next).filter((s) => s.kind === "success").length
    if (successCount > 0) {
      await onCreated()
    }
    setIsSubmitting(false)

    // All-success: collapse the panel back to the "+ New" button so
    // the user lands on the updated Given list. Mixed results stay
    // open so the failed rows are visible.
    if (successCount === selectedDids.length) {
      reset()
      onClose()
    }
  }

  const submitLabel = isSubmitting
    ? `Endorsing ${selectedDids.length}…`
    : selectedDids.length > 1
      ? `Endorse ${selectedDids.length} people`
      : "Endorse"

  const canSubmit = selectedDids.length > 0 && !isSubmitting && !hasResults

  return (
    <section className="endorsement-panel" aria-label="Create endorsements">
      <div className="endorsement-panel__heading">
        <div className="endorsement-panel__heading-text">
          <span className="endorsement-panel__title">Endorse one or more accounts</span>
          <span className="endorsement-panel__hint">
            Search by handle or paste a DID. Endorsements can be revoked anytime.
          </span>
        </div>
        <button
          type="button"
          className="endorsement-panel__close"
          onClick={onClose}
          aria-label="Cancel"
          disabled={isSubmitting}
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>

      {!hasResults ? (
        <HandleSearch
          label=""
          placeholder="Search handle or paste a DID..."
          onSelect={handleAddRecipient}
        />
      ) : null}

      {pickError ? (
        <p className="endorsement-panel__pick-hint" role="status">
          {pickError}
        </p>
      ) : null}

      {selectedDids.length > 0 ? (
        <ul className="endorsement-multi-list">
          {selectedDids.map((did) => (
            <RecipientRow
              key={did}
              did={did}
              handle={handleByDid[did]}
              status={statusByDid[did] ?? { kind: "idle" }}
              canRemove={!isSubmitting && !hasResults}
              onRemove={() => handleRemoveRecipient(did)}
            />
          ))}
        </ul>
      ) : null}

      {hasResults ? (
        <p className="endorsement-multi-summary">
          {writeSuccessCount} of {selectedDids.length} endorsement
          {selectedDids.length === 1 ? "" : "s"} written
          {writeSuccessCount < selectedDids.length
            ? ". Review failed rows above, then clear to try again."
            : "."}
        </p>
      ) : null}

      {selectedDids.length > 0 ? (
        <div className="endorsement-panel__actions">
          <Button
            variant="ghost"
            onClick={reset}
            disabled={isSubmitting}
          >
            Clear
          </Button>
          {!hasResults ? (
            <Button
              variant="primary"
              onClick={handleSubmit}
              loading={isSubmitting}
              disabled={!canSubmit}
            >
              {submitLabel}
            </Button>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}

interface RecipientRowProps {
  readonly did: string
  readonly handle?: string
  readonly status: WriteStatus
  readonly canRemove: boolean
  readonly onRemove: () => void
}

/** One row in the recipient list — avatar + name + handle, status
 *  badge on the right, with an X to remove if not yet submitted. */
function RecipientRow({ did, handle, status, canRemove, onRemove }: RecipientRowProps) {
  const { info } = useAuthorInfo(did)
  const displayName = info?.displayName || info?.handle || handle || did
  const resolvedHandle = info?.handle && info.handle !== info.did ? info.handle : handle
  const initials = getInitials(info?.displayName, did)

  return (
    <li className="endorsement-multi-row">
      <Avatar size="sm" src={info?.avatarUrl || undefined} fallbackInitials={initials} />
      <div className="endorsement-multi-row__meta">
        <span className="endorsement-multi-row__name">{displayName}</span>
        {resolvedHandle ? (
          <span className="endorsement-multi-row__handle">@{resolvedHandle}</span>
        ) : null}
        {status.kind === "error" ? (
          <span className="endorsement-multi-row__error">{status.message}</span>
        ) : null}
      </div>
      <RecipientStatus status={status} />
      {canRemove ? (
        <button
          type="button"
          className="endorsement-multi-row__remove"
          onClick={onRemove}
          aria-label={`Remove ${displayName}`}
        >
          <X size={14} />
        </button>
      ) : null}
    </li>
  )
}

function RecipientStatus({ status }: { status: WriteStatus }) {
  if (status.kind === "writing") {
    return (
      <span
        className="endorsement-multi-row__status endorsement-multi-row__status--writing"
        aria-label="Writing endorsement"
      />
    )
  }
  if (status.kind === "success") {
    return (
      <span
        className="endorsement-multi-row__status endorsement-multi-row__status--success"
        aria-label="Endorsed"
      >
        <Check size={14} />
      </span>
    )
  }
  if (status.kind === "error") {
    return (
      <span
        className="endorsement-multi-row__status endorsement-multi-row__status--error"
        aria-label="Failed"
      >
        <AlertCircle size={14} />
      </span>
    )
  }
  return null
}
