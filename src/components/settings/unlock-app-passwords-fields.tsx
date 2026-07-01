"use client"

import { useCallback, useState, type ReactNode } from "react"
import Input from "@/components/ui/input"
import Banner from "@/components/ui/banner"
import { unlockAppPasswords } from "@/lib/atproto/app-passwords"

/**
 * Shared unlock logic + fields for elevated-session flows (issue #223).
 *
 * The user confirms a password once; if the account has email-2FA on, the PDS
 * replies `twoFactorRequired` (and emails a code) — we reveal a code field and
 * re-submit; a wrong/expired code comes back as `invalidCode`.
 *
 * Generic over the unlock call (`useUnlockSession`) so the same UI serves both
 * app-password management (the user's own account) and the group-account unlock
 * (a group's account). `useUnlockAppPasswords` is the app-password specialism.
 *
 * Split into a hook + a presentational fields component (rather than a
 * self-contained dialog) so it can render INSIDE a single host dialog.
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

type UnlockResult = {
  status: "ok" | "twoFactorRequired" | "invalidCode" | "invalid"
}
/** Performs the actual unlock. Must be stable (module fn or `useCallback`). */
export type UnlockFn = (
  password: string,
  authFactorToken?: string,
) => Promise<UnlockResult>

/**
 * Owns the unlock state machine for an arbitrary unlock call. `onUnlocked`
 * fires on a successful unlock.
 */
export function useUnlockSession(
  unlockFn: UnlockFn,
  onUnlocked: () => void,
): UnlockState {
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
      const result = await unlockFn(
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
        setInvalidCode(true)
        return
      }
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
  }, [submitting, password, code, needsCode, onUnlocked, unlockFn])

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

/** App-password specialism of {@link useUnlockSession}. */
export function useUnlockAppPasswords(onUnlocked: () => void): UnlockState {
  return useUnlockSession(unlockAppPasswords, onUnlocked)
}

/** Presentational fields driven by {@link useUnlockSession}. Copy defaults to
 *  the app-password wording; pass overrides for other accounts (e.g. a group). */
export function UnlockAppPasswordFields({
  state,
  intro,
  onNavigate,
  passwordLabel = "Account password",
  passwordHint,
  invalidMessage,
  codeHelper = "We emailed a sign-in code to the address on your account.",
}: {
  state: UnlockState
  intro: string
  /** Called when the user clicks the "set password" link — the host closes
   *  its dialog so the in-app navigation to Settings → Account isn't left
   *  underneath an open modal. */
  onNavigate?: () => void
  /** Override the password field label (default "Account password"). */
  passwordLabel?: string
  /** Override the under-field hint. Omit for the default Settings → Account
   *  link; pass `null` to hide it; pass a node for custom copy. */
  passwordHint?: ReactNode
  /** Override the wrong-password banner copy. */
  invalidMessage?: ReactNode
  /** Override the 2FA code field helper text. */
  codeHelper?: string
}) {
  const defaultHint = (
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
  )

  const defaultInvalid = (
    <>
      That password wasn&apos;t accepted. If you sign in with email codes and
      haven&apos;t set a password yet, set one under{" "}
      <a
        href="#account"
        onClick={onNavigate}
        className="font-medium underline hover:opacity-80"
      >
        Settings → Account
      </a>{" "}
      first, then unlock.
    </>
  )

  return (
    <>
      <p className="mb-4 text-sm text-[var(--fg-secondary)]">{intro}</p>

      <div className="mb-4 flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Input
            label={passwordLabel}
            type="password"
            size="md"
            autoComplete="current-password"
            value={state.password}
            onChange={(e) => state.setPassword(e.target.value)}
            disabled={state.submitting}
          />
          {!state.needsCode &&
            (passwordHint !== undefined ? passwordHint : defaultHint)}
        </div>
        {state.needsCode && (
          <Input
            label="Email code"
            type="text"
            size="md"
            autoComplete="one-time-code"
            inputMode="numeric"
            placeholder="Code from your email"
            helperText={codeHelper}
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
          {invalidMessage ?? defaultInvalid}
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
