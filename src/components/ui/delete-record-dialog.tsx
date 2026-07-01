"use client"

import { useState } from "react"
import Button from "./button"
import Input from "./input"
import AppDialog, { AppDialogHeader } from "./app-dialog"
import { DIALOG_FOOTER_ACTIONS_CLASS } from "./form-dialog"

interface DeleteRecordDialogProps {
  /** Modal title — e.g. "Delete this cert" / "Delete this project". */
  readonly title: string
  /** The exact display name the user has to type before Delete
   *  enables. Compared case-sensitively against the input, trimmed. */
  readonly recordName: string
  /** Human label for the record type ("cert", "project", "list", …)
   *  — used in the warning sentence + confirm label. */
  readonly recordTypeLabel: string
  /** Confirm-in-flight flag — disables the form and the close X
   *  while the deleteRecord call is pending. */
  readonly isDeleting?: boolean
  /** Surfaces a delete-side error inside the dialog. */
  readonly errorMessage?: string | null
  readonly onCancel: () => void
  readonly onConfirm: () => void | Promise<void>
}

/**
 * Type-to-confirm destructive delete dialog. Used by the cert +
 * project detail pages so the user has to write out the exact
 * record name before the Delete button enables — same UX pattern
 * GitHub and Stripe use for repo / account deletions.
 *
 * The match is trimmed but case-sensitive; the visible label is
 * shown in monospace so trailing whitespace or odd casing reads
 * as a clear difference rather than something the user has to
 * squint at.
 */
export default function DeleteRecordDialog({
  title,
  recordName,
  recordTypeLabel,
  isDeleting = false,
  errorMessage = null,
  onCancel,
  onConfirm,
}: DeleteRecordDialogProps) {
  const [typed, setTyped] = useState("")
  const matches = typed.trim() === recordName.trim()
  const canConfirm = matches && !isDeleting

  return (
    <AppDialog
      ariaLabel={title}
      role="alertdialog"
      maxWidth={440}
      onClose={onCancel}
      disableBackdropClose={isDeleting}
    >
      <AppDialogHeader
        title={title}
        onClose={onCancel}
        disabled={isDeleting}
      />
      <form
        className="px-5 pb-5 pt-4"
        onSubmit={(e) => {
          e.preventDefault()
          // The dialog is portalled to body but React synthetic
          // events bubble through the React tree — stop here so a
          // parent <form> (e.g. the project edit shell) doesn't
          // catch this submit and trigger an unrelated action.
          e.stopPropagation()
          if (canConfirm) void onConfirm()
        }}
      >
        <p className="delete-record-dialog__warning">
          This will permanently delete the {recordTypeLabel}. This
          action <strong>cannot be undone</strong>.
        </p>
        <label className="delete-record-dialog__field">
          <span className="delete-record-dialog__label">
            Type the {recordTypeLabel} name to confirm:
          </span>
          <code className="delete-record-dialog__target">
            {recordName}
          </code>
          <Input
            type="text"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={recordName}
            autoComplete="off"
            autoFocus
            disabled={isDeleting}
            // Show inline-edit chrome (1.5 px border) so the typed
            // value reads as "currently editable"; the form-level
            // error message handles destructive-action feedback.
            variant="inline-edit"
          />
        </label>
        {errorMessage ? (
          <p className="delete-record-dialog__error" role="alert">
            {errorMessage}
          </p>
        ) : null}
        <div className={DIALOG_FOOTER_ACTIONS_CLASS}>
          <Button
            type="button"
            variant="ghost"
            onClick={onCancel}
            disabled={isDeleting}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="destructive"
            loading={isDeleting}
            disabled={!canConfirm}
          >
            Delete {recordTypeLabel}
          </Button>
        </div>
      </form>
    </AppDialog>
  )
}
