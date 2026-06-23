"use client"

import FormDialog from "@/components/ui/form-dialog"
import {
  useUnlockAppPasswords,
  UnlockAppPasswordFields,
} from "./unlock-app-passwords-fields"

/**
 * Standalone unlock modal for the App passwords section (issue #223): a
 * FormDialog wrapping the shared unlock fields. The dialog never sees PDS
 * tokens — it only POSTs the password to our route, which opens the
 * server-side session. On success it calls `onUnlocked`.
 *
 * The group-import "Create one" flow does NOT use this wrapper; it renders
 * the same fields inline in its own dialog so it can keep one modal open
 * across unlock→create (see create-app-password-dialog.tsx).
 */
export default function UnlockAppPasswordsDialog({
  onUnlocked,
  onClose,
  title = "Unlock app passwords",
  intro = "Confirm your account password to manage app passwords. It's used once to open a short, secure session — it isn't stored.",
  submitLabel = "Unlock",
}: {
  onUnlocked: () => void
  onClose: () => void
  title?: string
  intro?: string
  submitLabel?: string
}) {
  const state = useUnlockAppPasswords(onUnlocked)

  return (
    <FormDialog
      title={title}
      onClose={onClose}
      onSubmit={state.submit}
      isSubmitting={state.submitting}
      canSubmit={state.canSubmit}
      submitLabel={state.needsCode ? "Confirm code" : submitLabel}
      autoFocusFirst
    >
      <UnlockAppPasswordFields state={state} intro={intro} />
    </FormDialog>
  )
}
