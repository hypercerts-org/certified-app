"use client"

import { useEffect, useRef, useCallback } from "react"
import { X } from "lucide-react"
import Button from "@/components/ui/button"

interface ConfirmDialogProps {
  readonly title: string
  readonly message: string
  readonly confirmLabel?: string
  readonly cancelLabel?: string
  readonly isConfirming?: boolean
  readonly confirmVariant?: "primary" | "destructive"
  readonly onCancel: () => void
  readonly onConfirm: () => void | Promise<void>
}

/**
 * Generic "are you sure?" modal. Uses the existing signin-modal
 * chrome so it inherits the same backdrop, focus styling, and
 * dark-mode treatment as other dialogs in the app. Reused anywhere
 * a destructive action needs a confirmation step.
 */
export default function ConfirmDialog({
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  isConfirming = false,
  confirmVariant = "destructive",
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    dialog.showModal()

    const handleClose = () => onCancel()
    dialog.addEventListener("close", handleClose)
    return () => dialog.removeEventListener("close", handleClose)
  }, [onCancel])

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDialogElement>) => {
      if (e.target === dialogRef.current) onCancel()
    },
    [onCancel],
  )

  return (
    <dialog
      ref={dialogRef}
      className="signin-modal"
      role="alertdialog"
      aria-label={title}
      onClick={handleBackdropClick}
      style={{ maxWidth: 440 }}
    >
      <div onClick={(e) => e.stopPropagation()}>
        <div className="signin-modal__header">
          <span className="signin-modal__title">{title}</span>
          <button
            className="signin-modal__close"
            onClick={onCancel}
            aria-label="Close"
            disabled={isConfirming}
          >
            <X size={18} />
          </button>
        </div>
        <div className="signin-modal__body">
          <p className="dash-card__desc" style={{ marginBottom: 20 }}>
            {message}
          </p>
          <div
            style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}
          >
            <Button
              variant="ghost"
              onClick={onCancel}
              disabled={isConfirming}
            >
              {cancelLabel}
            </Button>
            <Button
              variant={confirmVariant}
              onClick={onConfirm}
              loading={isConfirming}
              disabled={isConfirming}
            >
              {confirmLabel}
            </Button>
          </div>
        </div>
      </div>
    </dialog>
  )
}
