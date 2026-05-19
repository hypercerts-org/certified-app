"use client"

import { X } from "lucide-react"
import Button from "@/components/ui/button"
import AppDialog from "@/components/ui/app-dialog"

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
 * Generic "are you sure?" modal. Uses the shared <AppDialog> chrome
 * (signin-modal app-modal classes, native <dialog> + showModal(),
 * backdrop-click close). Backdrop close is disabled while a confirm
 * is in flight so the user can't dismiss mid-write.
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
  return (
    <AppDialog
      ariaLabel={title}
      role="alertdialog"
      maxWidth={440}
      onClose={onCancel}
      disableBackdropClose={isConfirming}
    >
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
    </AppDialog>
  )
}
