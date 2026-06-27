"use client"

import { type ReactNode } from "react"
import FormDialog from "@/components/ui/form-dialog"
import {
  useUnlockAppPasswords,
  UnlockAppPasswordFields,
  type UnlockState,
} from "./unlock-app-passwords-fields"

/**
 * Generic unlock modal: a FormDialog wrapping the shared unlock fields. The
 * caller owns the unlock {@link UnlockState} (via `useUnlockSession`) and
 * supplies the copy, so the same modal serves app passwords and the group
 * account. The dialog never sees PDS tokens — it only POSTs the password to a
 * route, which opens the server-side session.
 */
export function UnlockSessionDialog({
  state,
  onClose,
  title,
  intro,
  submitLabel = "Unlock",
  passwordLabel,
  passwordHint,
  invalidMessage,
  codeHelper,
}: {
  state: UnlockState
  onClose: () => void
  title: string
  intro: string
  submitLabel?: string
  passwordLabel?: string
  passwordHint?: ReactNode
  invalidMessage?: ReactNode
  codeHelper?: string
}) {
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
      <UnlockAppPasswordFields
        state={state}
        intro={intro}
        onNavigate={onClose}
        passwordLabel={passwordLabel}
        passwordHint={passwordHint}
        invalidMessage={invalidMessage}
        codeHelper={codeHelper}
      />
    </FormDialog>
  )
}

/**
 * App-password unlock modal (issue #223): creates its own unlock state and
 * renders {@link UnlockSessionDialog}. The group-import (promote-to-group) flow
 * renders the shared {@link UnlockAppPasswordFields} inline instead.
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
    <UnlockSessionDialog
      state={state}
      onClose={onClose}
      title={title}
      intro={intro}
      submitLabel={submitLabel}
    />
  )
}
