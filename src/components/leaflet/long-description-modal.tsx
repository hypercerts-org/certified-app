"use client"

import { useEffect, useRef, useCallback } from "react"
import { X } from "lucide-react"
import LeafletDocument from "./leaflet-document"

export interface LongDescriptionModalProps {
  /** Heading shown at the top of the modal. */
  title?: string
  /** Optional subtitle / byline rendered above the document. */
  subtitle?: string
  /** Raw long-description value (string, linearDocument, or strong-ref).
   *  Renders via `<LeafletDocument>` so all three shapes are supported. */
  value: unknown
  /** Repo DID — forwarded to `<LeafletDocument>` so image blocks can
   *  resolve their blob refs to `getBlob` URLs. */
  did?: string
  onClose: () => void
}

/**
 * Modal surface for the long-form organization description. Wraps
 * `<LeafletDocument>` in the same signin-modal chrome that
 * `<ConfirmDialog>` and `<LinkDialog>` use, then gives it room to
 * breathe — wider max-width and roomier padding than the rest of
 * the dialog family because long-form prose needs measure.
 */
export default function LongDescriptionModal({
  title,
  subtitle,
  value,
  did,
  onClose,
}: LongDescriptionModalProps) {
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

  return (
    <dialog
      ref={dialogRef}
      className="signin-modal long-description-modal"
      role="dialog"
      aria-label={title ?? "Description"}
      onClick={handleBackdropClick}
    >
      <div onClick={(e) => e.stopPropagation()}>
        <div className="signin-modal__header">
          <div className="long-description-modal__title-block">
            <span className="signin-modal__title">{title ?? "About"}</span>
            {subtitle ? (
              <span className="long-description-modal__subtitle">
                {subtitle}
              </span>
            ) : null}
          </div>
          <button
            type="button"
            className="signin-modal__close"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>
        <div className="signin-modal__body long-description-modal__body">
          <LeafletDocument
            value={value}
            did={did}
            className="long-description-modal__doc"
          />
        </div>
      </div>
    </dialog>
  )
}
