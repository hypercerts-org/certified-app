"use client"

import { useRef, useState, type RefObject } from "react"
import Button from "./button"
import Input from "./input"
import AppDialog, { AppDialogHeader, AppDialogBody } from "./app-dialog"
import { DIALOG_FOOTER_ACTIONS_CLASS } from "./form-dialog"

interface ConfirmDialogProps {
  readonly title: string
  readonly message: string
  readonly confirmLabel?: string
  readonly cancelLabel?: string
  readonly isConfirming?: boolean
  readonly confirmVariant?: "primary" | "destructive"
  /** When set, the confirm button stays disabled until the user types this
   *  exact phrase (case-insensitive, trimmed) — a deliberate friction gate
   *  for destructive, irreversible actions (e.g. type the group handle to
   *  remove it). Renders a text input below the message. */
  readonly confirmPhrase?: string
  readonly onCancel: () => void
  readonly onConfirm: () => void | Promise<void>
  /** Where focus goes when the dialog closes, when the element that opened
   *  it won't survive (a menu item): pass the menu's trigger. */
  readonly returnFocusRef?: RefObject<HTMLElement | null>
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
  confirmPhrase,
  onCancel,
  onConfirm,
  returnFocusRef,
}: ConfirmDialogProps) {
  const [typed, setTyped] = useState("")
  // The phrase field takes focus on open through AppDialog, not React's
  // `autoFocus` (which ran before AppDialog recorded the opener, so focus
  // fell to <body> on close).
  const phraseRef = useRef<HTMLInputElement>(null)
  const phraseMatches =
    !confirmPhrase ||
    typed.trim().toLowerCase() === confirmPhrase.trim().toLowerCase()

  return (
    <AppDialog
      ariaLabel={title}
      role="alertdialog"
      maxWidth={440}
      onClose={onCancel}
      disableBackdropClose={isConfirming}
      autoFocusFirst={!!confirmPhrase}
      initialFocusRef={confirmPhrase ? phraseRef : undefined}
      returnFocusRef={returnFocusRef}
    >
      <AppDialogHeader title={title} onClose={onCancel} disabled={isConfirming} />
      <AppDialogBody>
        <p
          className="dash-card__desc"
          style={{ marginBottom: confirmPhrase ? 12 : 20 }}
        >
          {message}
        </p>
        {confirmPhrase ? (
          // A form so the phrase input submits on Enter (implicit submission) —
          // type the phrase, hit Enter, no mouse needed. Guarded so Enter only
          // confirms once the phrase matches.
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (phraseMatches && !isConfirming) void onConfirm()
            }}
            style={{ marginBottom: 20 }}
          >
            <Input
              label={`Type ${confirmPhrase} to confirm`}
              size="md"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              ref={phraseRef}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              disabled={isConfirming}
            />
          </form>
        ) : null}
        <div className={DIALOG_FOOTER_ACTIONS_CLASS}>
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
            disabled={isConfirming || !phraseMatches}
          >
            {confirmLabel}
          </Button>
        </div>
      </AppDialogBody>
    </AppDialog>
  )
}
