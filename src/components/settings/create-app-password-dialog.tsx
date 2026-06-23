"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Check, Copy } from "lucide-react"
import AppDialog, {
  AppDialogBody,
  AppDialogHeader,
} from "@/components/ui/app-dialog"
import Button from "@/components/ui/button"
import Banner from "@/components/ui/banner"
import LoadingSpinner from "@/components/ui/loading-spinner"
import { DIALOG_FOOTER_ACTIONS_CLASS } from "@/components/ui/form-dialog"
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard"
import {
  createAppPassword,
  AppPasswordsLockedError,
  type CreatedAppPassword,
} from "@/lib/atproto/app-passwords"
import {
  useUnlockAppPasswords,
  UnlockAppPasswordFields,
} from "./unlock-app-passwords-fields"

/**
 * "Create one" shortcut for the group-import flow (issue #223): mints a fresh
 * app password and hands it back via `onUse` to fill the import field.
 *
 * Tries `createAppPassword` straight away — if the elevated session is already
 * open the user isn't re-prompted. If the route says `locked`, the same modal
 * shows the shared unlock fields inline (a single `<dialog>` stays open across
 * the unlock→create phases — no modal-swap flash) and retries the create on
 * success. The generated secret is revealed exactly once (the PDS never
 * returns it again).
 */
export default function CreateAppPasswordDialog({
  onUse,
  onClose,
}: {
  /** Called with the freshly-minted secret when the user picks "Use this password". */
  onUse: (password: string) => void
  onClose: () => void
}) {
  type Phase = "creating" | "unlock" | "created" | "error"
  const [phase, setPhase] = useState<Phase>("creating")
  const [created, setCreated] = useState<CreatedAppPassword | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { copied, copy } = useCopyToClipboard()

  // A readable, practically-unique name so re-running the shortcut doesn't
  // collide with an existing app password. Generated lazily inside the
  // callback (not during render — `Math.random` is impure) and reused across
  // retries so unlock→retry doesn't mint a second differently-named password.
  const nameRef = useRef<string | null>(null)

  const attemptCreate = useCallback(async () => {
    if (!nameRef.current) {
      nameRef.current = `group-import-${Math.random().toString(36).slice(2, 8)}`
    }
    setPhase("creating")
    setError(null)
    try {
      const result = await createAppPassword(nameRef.current)
      setCreated(result)
      setPhase("created")
    } catch (err) {
      if (err instanceof AppPasswordsLockedError) {
        setPhase("unlock")
        return
      }
      setError(
        err instanceof Error
          ? err.message
          : "Couldn't create an app password. Please try again.",
      )
      setPhase("error")
    }
  }, [])

  // Unlock state machine; on success it retries the create in the same dialog.
  const unlock = useUnlockAppPasswords(() => void attemptCreate())

  // Kick off the first attempt on mount. attemptCreate sets state, but this
  // is a deliberate mount-once trigger (guarded by startedRef) — not a render
  // loop — and `phase` already initialises to "creating", so it's effectively
  // a no-op on the first synchronous set.
  const startedRef = useRef(false)
  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void attemptCreate()
  }, [attemptCreate])

  return (
    <AppDialog
      ariaLabel="Create an app password"
      onClose={onClose}
      disableBackdropClose={phase === "creating" || unlock.submitting}
    >
      <AppDialogHeader
        title="Create an app password"
        onClose={onClose}
        disabled={unlock.submitting}
      />
      <AppDialogBody>
        {phase === "creating" && (
          <div className="flex items-center justify-center py-8">
            <LoadingSpinner size="sm" />
          </div>
        )}

        {phase === "unlock" && (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void unlock.submit()
            }}
          >
            <UnlockAppPasswordFields
              state={unlock}
              intro="Confirm your account password to mint an app password for the group import. It's used once to open a short, secure session — it isn't stored."
            />
            <div className={DIALOG_FOOTER_ACTIONS_CLASS}>
              <Button
                type="button"
                variant="ghost"
                onClick={onClose}
                disabled={unlock.submitting}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                loading={unlock.submitting}
                disabled={!unlock.canSubmit || unlock.submitting}
              >
                {unlock.needsCode ? "Confirm code" : "Continue"}
              </Button>
            </div>
          </form>
        )}

        {phase === "error" && (
          <div className="flex flex-col gap-4">
            <Banner variant="error">{error}</Banner>
            <div className={DIALOG_FOOTER_ACTIONS_CLASS}>
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={() => void attemptCreate()}
              >
                Try again
              </Button>
            </div>
          </div>
        )}

        {phase === "created" && created && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-[var(--fg-secondary)]">
              Copy <strong>{created.name}</strong> now — this password
              won&apos;t be shown again.
            </p>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded bg-[var(--bg-sunken)] px-3 py-2 font-mono text-sm text-[var(--fg-primary)]">
                {created.password}
              </code>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => copy(created.password)}
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
            <div className={DIALOG_FOOTER_ACTIONS_CLASS}>
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={() => {
                  onUse(created.password)
                  onClose()
                }}
              >
                Use this password
              </Button>
            </div>
          </div>
        )}
      </AppDialogBody>
    </AppDialog>
  )
}
