"use client"

import AppDialog, { AppDialogHeader, AppDialogBody } from "@/components/ui/app-dialog"
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
 * `<LeafletDocument>` in the shared <AppDialog> chrome with a
 * long-description-specific class for the wider measure + roomier
 * padding the prose needs.
 */
export default function LongDescriptionModal({
  title,
  subtitle,
  value,
  did,
  onClose,
}: LongDescriptionModalProps) {
  return (
    <AppDialog
      ariaLabel={title ?? "Description"}
      className="long-description-modal"
      onClose={onClose}
    >
      <AppDialogHeader
        title={
          <span className="long-description-modal__title-block">
            <span>{title ?? "About"}</span>
            {subtitle ? (
              <span className="long-description-modal__subtitle">
                {subtitle}
              </span>
            ) : null}
          </span>
        }
        onClose={onClose}
      />
      <AppDialogBody className="long-description-modal__body">
        <LeafletDocument
          value={value}
          did={did}
          className="long-description-modal__doc"
        />
      </AppDialogBody>
    </AppDialog>
  )
}
