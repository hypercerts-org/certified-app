"use client"

import type { ReactNode, RefObject, FormEvent } from "react"
import Button from "./button"
import AppDialog, { AppDialogHeader } from "./app-dialog"

/**
 * Shared footer-actions row for every dialog that ends in a
 * "ghost Cancel + primary Submit" pair (FormDialog, ConfirmDialog,
 * DeleteRecordDialog). One class string so the spacing/alignment is
 * identical across all three — flex, right-aligned, 8 px gap (gap-2).
 *
 * Re-exported and consumed by confirm-dialog.tsx / delete-record-dialog.tsx
 * so there's a single source of truth for the footer layout rather than
 * three hand-rolled flex rows that drift apart.
 */
export const DIALOG_FOOTER_ACTIONS_CLASS = "flex justify-end gap-2"

export interface FormDialogProps {
  /** Modal title — read aloud (aria-label) and shown in the header. */
  readonly title: string
  /** Fired on backdrop click, Esc, the native close event, and the
   *  header X. Usually the consumer's "close / cancel" handler. */
  readonly onClose: () => void
  /** Fired when the body <form> submits (Enter or the Submit button).
   *  FormDialog already calls preventDefault + stopPropagation, so the
   *  consumer just runs its save. */
  readonly onSubmit: () => void | Promise<void>
  /** Form body — labels, inputs, inline errors. Rendered inside the
   *  <form>, above the standardized footer-actions row. */
  readonly children: ReactNode
  /** Submit-in-flight flag. Disables the close X, the Cancel button,
   *  the backdrop close, and drives the Submit button's spinner. */
  readonly isSubmitting?: boolean
  /** Extra gate on the Submit button beyond `isSubmitting` — e.g. a
   *  required field still being empty. Defaults to enabled. */
  readonly canSubmit?: boolean
  readonly submitLabel?: string
  readonly cancelLabel?: string
  /** Submit button intent. Primary by default; `destructive` for
   *  forms that also delete (matches Button's variant vocabulary). */
  readonly submitVariant?: "primary" | "destructive"
  /** Inline max-width cap passed through to AppDialog. */
  readonly maxWidth?: number | string
  /** Forwarded to AppDialog — focus the first focusable child (or
   *  `initialFocusRef`) on open instead of a per-consumer effect. */
  readonly autoFocusFirst?: boolean
  /** Forwarded to AppDialog — element to focus on open when
   *  `autoFocusFirst` is set. */
  readonly initialFocusRef?: RefObject<HTMLElement | null>
}

/**
 * Standardized form modal: AppDialog chrome + AppDialogHeader + a body
 * <form> + the shared ghost-Cancel / primary-Submit footer row.
 *
 * Owns the two pieces of boilerplate every form modal repeats:
 *   - the submit guard (preventDefault so the page doesn't reload, and
 *     stopPropagation so a parent <form> — e.g. the cert/project edit
 *     shell the dialog is portalled inside in the React tree — doesn't
 *     also fire and publish the record), and
 *   - autofocus on open, delegated to AppDialog's `autoFocusFirst`.
 *
 * Consumers pass their fields as children and a single `onSubmit`.
 */
export default function FormDialog({
  title,
  onClose,
  onSubmit,
  children,
  isSubmitting = false,
  canSubmit = true,
  submitLabel = "Save",
  cancelLabel = "Cancel",
  submitVariant = "primary",
  maxWidth = 440,
  autoFocusFirst = false,
  initialFocusRef,
}: FormDialogProps) {
  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    // The dialog is portalled to <body>, but React synthetic events
    // bubble through the React tree — stop here so a parent <form>
    // (e.g. the cert/project edit shell) doesn't catch this submit and
    // trigger an unrelated publish.
    e.stopPropagation()
    if (canSubmit && !isSubmitting) void onSubmit()
  }

  return (
    <AppDialog
      ariaLabel={title}
      maxWidth={maxWidth}
      onClose={onClose}
      disableBackdropClose={isSubmitting}
      autoFocusFirst={autoFocusFirst}
      initialFocusRef={initialFocusRef}
    >
      <AppDialogHeader title={title} onClose={onClose} disabled={isSubmitting} />
      <form className="px-5 pb-5 pt-4" onSubmit={handleSubmit}>
        {children}
        <div className={DIALOG_FOOTER_ACTIONS_CLASS}>
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={isSubmitting}
          >
            {cancelLabel}
          </Button>
          <Button
            type="submit"
            variant={submitVariant}
            loading={isSubmitting}
            disabled={!canSubmit || isSubmitting}
          >
            {submitLabel}
          </Button>
        </div>
      </form>
    </AppDialog>
  )
}
