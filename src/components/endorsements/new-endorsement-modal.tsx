"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { X } from "lucide-react"
import HandleSearch from "@/components/groups/handle-search"
import Avatar from "@/components/ui/avatar"
import Button from "@/components/ui/button"
import Textarea from "@/components/ui/textarea"
import ErrorMessage from "@/components/ui/error-message"
import { useAuthorInfo } from "@/hooks/use-author-info"
import { getInitials } from "@/lib/utils/initials"
import { createEndorsementAward } from "@/lib/atproto/badges"

interface NewEndorsementModalProps {
  /** The current user's DID — endorsement records are written to
   *  this repo. */
  readonly ownDid: string
  /** DIDs the user has already endorsed (used to block duplicates). */
  readonly existingSubjectDids: ReadonlySet<string>
  readonly onClose: () => void
  /** Called after a successful create so the parent can refetch. */
  readonly onCreated: () => void | Promise<void>
}

/**
 * Dialog for creating a new endorsement. User picks a target via
 * the handle/DID search (Bluesky typeahead), sees a preview of the
 * resolved account, and confirms.
 */
export default function NewEndorsementModal({
  ownDid,
  existingSubjectDids,
  onClose,
  onCreated,
}: NewEndorsementModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    dialog.showModal()

    const handleClose = () => onClose()
    dialog.addEventListener("close", handleClose)
    return () => dialog.removeEventListener("close", handleClose)
  }, [onClose])

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDialogElement>) => {
      if (e.target === dialogRef.current) onClose()
    },
    [onClose],
  )

  const [selectedDid, setSelectedDid] = useState<string | null>(null)
  const [selectedHandle, setSelectedHandle] = useState<string | null>(null)
  const [note, setNote] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Hydrate the selected DID for the preview block. useAuthorInfo
  // module-caches by DID, so picking the same account twice won't
  // re-fetch.
  const { info } = useAuthorInfo(selectedDid)

  const isSelf = selectedDid === ownDid
  const isDuplicate = selectedDid
    ? existingSubjectDids.has(selectedDid)
    : false
  const canSubmit = !!selectedDid && !isSelf && !isDuplicate && !isSubmitting

  const handleSelect = (did: string, handle: string) => {
    setSelectedDid(did)
    setSelectedHandle(handle)
    setError(null)
  }

  const handleSubmit = async () => {
    if (!selectedDid || !canSubmit) return
    setIsSubmitting(true)
    setError(null)
    try {
      await createEndorsementAward(ownDid, selectedDid, note)
      await onCreated()
      onClose()
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to create endorsement"
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  const previewName =
    info?.displayName || info?.handle || selectedHandle || selectedDid || ""
  const resolvedHandle =
    info?.handle && info.handle !== info.did ? info.handle : selectedHandle
  const previewHandle = resolvedHandle ? `@${resolvedHandle}` : null
  const previewInitials = getInitials(info?.displayName, selectedDid)

  return (
    <dialog
      ref={dialogRef}
      className="signin-modal"
      aria-label="New endorsement"
      onClick={handleBackdropClick}
      style={{ maxWidth: 480 }}
    >
      <div onClick={(e) => e.stopPropagation()}>
        <div className="signin-modal__header">
          <span className="signin-modal__title">New endorsement</span>
          <button
            className="signin-modal__close"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="signin-modal__body">
          <p className="dash-card__desc" style={{ marginBottom: 16 }}>
            Endorse another user or group. Search by handle, or paste a full
            DID. Endorsements can be revoked at any time.
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <HandleSearch
              label="Who do you want to endorse?"
              placeholder="Search handle or paste a DID..."
              onSelect={handleSelect}
            />

            {selectedDid ? (
              <>
                <div className="endorsement-preview">
                  <Avatar
                    size="md"
                    src={info?.avatarUrl || undefined}
                    fallbackInitials={previewInitials}
                  />
                  <div className="endorsement-preview__meta">
                    <span className="endorsement-preview__name">
                      {previewName}
                    </span>
                    {previewHandle ? (
                      <span className="endorsement-preview__handle">
                        {previewHandle}
                      </span>
                    ) : null}
                  </div>
                </div>
                <Textarea
                  label="Note (optional)"
                  placeholder="Why are you endorsing this account?"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  maxLength={1000}
                  helperText={`${note.length}/1000`}
                />
              </>
            ) : null}

            {isSelf ? (
              <ErrorMessage message="You can't endorse yourself." />
            ) : null}
            {isDuplicate ? (
              <ErrorMessage message="You've already endorsed this account." />
            ) : null}
            {error ? <ErrorMessage message={error} /> : null}

            <div
              style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}
            >
              <Button
                variant="ghost"
                onClick={onClose}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleSubmit}
                loading={isSubmitting}
                disabled={!canSubmit}
              >
                Endorse
              </Button>
            </div>
          </div>
        </div>
      </div>
    </dialog>
  )
}
