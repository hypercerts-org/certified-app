"use client"

import { useCallback, useState } from "react"
import Input from "@/components/ui/input"
import Banner from "@/components/ui/banner"
import { unlockAppPasswords } from "@/lib/atproto/app-passwords"

/**
 * Shared unlock logic + fields for app-password management (issue #223).
 *
 * App-password endpoints need a password session, so the user confirms their
 * account password once. If the account has email-2FA on, the PDS replies
 * `twoFactorRequired` (and emails a code) — we reveal a code field and
 * re-submit; a wrong/expired code comes back as `invalidCode`.
 *
 * Split into a hook + a presentational fields component (rather than a
 * self-contained dialog) so it can render INSIDE a single host dialog — the
 * group-import "Create one" flow keeps one `<dialog>` open across its
 * unlock→create phases instead of swapping modal elements (which flashes the
 * slide-up animation and bounces focus).
 */

export interface UnlockState {
  password: string
  setPassword: (v: string) => void
  code: string
  setCode: (v: string) => void
  needsCode: boolean
  submitting: boolean
  /** Network / unexpected failure. */
  error: string | null
  /** Wrong password (or no password set). */
  invalid: boolean
  /** Wrong / expired emailed 2FA code. */
  invalidCode: boolean
  canSubmit: boolean
  submit: () => Promise<void>
}

/**
 * Owns the unlock state machine. `onUnlocked` fires on a successful unlock.
 */
export function useUnlockAppPasswords(onUnlocked: () => void): UnlockState {
  const [password, setPassword] = useState("")
  const [code, setCode] = useState("")
  const [needsCode, setNeedsCode] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [invalid, setInvalid] = useState(false)
  const [invalidCode, setInvalidCode] = useState(false)

  const canSubmit = needsCode
    ? Boolean(password.trim() && code.trim())
    : Boolean(password.trim())

  const submit = useCallback(async () => {
    if (submitting) return
    if (!password.trim()) return
    if (needsCode && !code.trim()) return
    setSubmitting(true)
    setError(null)
    setInvalid(false)
    setInvalidCode(false)
    try {
      const result = await unlockAppPasswords(
        password,
        needsCode ? code.trim() : undefined,
      )
      if (result.status === "ok") {
        onUnlocked()
        return
      }
      if (result.status === "twoFactorRequired") {
        setNeedsCode(true)
        return
      }
      if (result.status === "invalidCode") {
        // Password was accepted; only the emailed code was wrong/expired.
        // Keep the code field up so the user can retry it directly.
        setInvalidCode(true)
        return
      }
      // invalid
      setInvalid(true)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong. Please try again.",
      )
    } finally {
      setSubmitting(false)
    }
  }, [submitting, password, code, needsCode, onUnlocked])

  return {
    password,
    setPassword,
    code,
    setCode,
    needsCode,
    submitting,
    error,
    invalid,
    invalidCode,
    canSubmit,
    submit,
  }
}

/** Presentational fields driven by {@link useUnlockAppPasswords}. */
export function UnlockAppPasswordFields({
  state,
  intro,
  onNavigate,
}: {
  state: UnlockState
  intro: string
  /** Called when the user clicks the "set password" link — the host closes
   *  its dialog so the in-app navigation to Settings → Account isn't left
   *  underneath an open modal. */
  onNavigate?: () => void
}) {
  return (
    <>
      <p className="mb-4 text-sm text-[var(--fg-secondary)]">{intro}</p>

      <div className="mb-4 flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Input
            label="Account password"
            type="password"
            size="md"
            autoComplete="current-password"
            value={state.password}
            onChange={(e) => state.setPassword(e.target.value)}
            disabled={state.submitting}
          />
          {!state.needsCode && (
            <p className="text-xs text-[var(--fg-muted)]">
              Don&apos;t know it? Set or reset it under{" "}
              <a
                href="#account"
                onClick={onNavigate}
                className="text-[var(--color-accent)] underline hover:text-[var(--color-accent-hover)]"
              >
                Settings → Account
              </a>
              .
            </p>
          )}
        </div>
        {state.needsCode && (
          <Input
            label="Email code"
            type="text"
            size="md"
            autoComplete="one-time-code"
            inputMode="numeric"
            placeholder="Code from your email"
            helperText="We emailed a sign-in code to the address on your account."
            value={state.code}
            onChange={(e) => state.setCode(e.target.value)}
            error={
              state.invalidCode
                ? "That code wasn't accepted. Check it and try again."
                : undefined
            }
            disabled={state.submitting}
          />
        )}
      </div>

      {state.invalid && (
        <Banner variant="error" className="mb-4">
          That password wasn&apos;t accepted. If you sign in with email codes
          and haven&apos;t set a password yet, set one under{" "}
          <a
            href="#account"
            onClick={onNavigate}
            className="font-medium underline hover:opacity-80"
          >
            Settings → Account
          </a>{" "}
          first, then unlock.
        </Banner>
      )}
      {state.error && (
        <Banner variant="error" className="mb-4">
          {state.error}
        </Banner>
      )}
    </>
  )
}
