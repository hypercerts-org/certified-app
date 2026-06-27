"use client"

import { useState } from "react"
import { KeyRound } from "lucide-react"
import {
  requestGroupPasswordReset,
  confirmGroupPasswordReset,
} from "@/lib/groups/api"
import Input from "@/components/ui/input"
import Button from "@/components/ui/button"
import ErrorMessage from "@/components/ui/error-message"

type Step = "idle" | "request" | "confirm" | "done"

/**
 * Owner/admin password reset for a non-self group. The app can't read the
 * group account's email, so the owner enters it; we send a code to that mailbox
 * (via the group's PDS) and complete the reset with the code + a new password.
 * See `/api/groups/[groupDid]/password-reset`.
 */
export default function GroupPasswordReset({ groupDid }: { groupDid: string }) {
  const [step, setStep] = useState<Step>("idle")
  const [email, setEmail] = useState("")
  const [token, setToken] = useState("")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const sendCode = async () => {
    setSubmitting(true)
    setError(null)
    try {
      await requestGroupPasswordReset(groupDid, email.trim())
      setStep("confirm")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send reset code")
    } finally {
      setSubmitting(false)
    }
  }

  const resetPassword = async () => {
    if (password.length < 8) {
      setError("Password must be at least 8 characters.")
      return
    }
    if (password !== confirm) {
      setError("Passwords don't match.")
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await confirmGroupPasswordReset(groupDid, token.trim(), password)
      setStep("done")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reset password")
    } finally {
      setSubmitting(false)
    }
  }

  if (step === "done") {
    return (
      <p className="settings__note" role="status">
        The group&apos;s password has been reset.
      </p>
    )
  }

  return (
    <div className="group-pw-reset">
      {step === "confirm" ? (
        <form
          className="group-pw-reset__form"
          onSubmit={(e) => {
            e.preventDefault()
            void resetPassword()
          }}
        >
          <Input
            label="Reset code"
            placeholder="Code from the email"
            autoComplete="one-time-code"
            autoCapitalize="none"
            spellCheck={false}
            value={token}
            onChange={(e) => setToken(e.target.value)}
            disabled={submitting}
          />
          <Input
            type="password"
            label="New password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={submitting}
          />
          <Input
            type="password"
            label="Confirm new password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            disabled={submitting}
          />
          {error && <ErrorMessage message={error} />}
          <div className="group-pw-reset__actions">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setStep("request")}
              disabled={submitting}
            >
              Back
            </Button>
            <Button
              type="submit"
              variant="primary"
              loading={submitting}
              disabled={!token.trim() || !password || submitting}
            >
              Reset password
            </Button>
          </div>
        </form>
      ) : step === "request" ? (
        <form
          className="group-pw-reset__form"
          onSubmit={(e) => {
            e.preventDefault()
            void sendCode()
          }}
        >
          <Input
            type="email"
            label="Group email"
            placeholder="email@example.com"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={submitting}
          />
          {error && <ErrorMessage message={error} />}
          <Button
            type="submit"
            variant="primary"
            loading={submitting}
            disabled={!email.trim() || submitting}
          >
            Send reset code
          </Button>
        </form>
      ) : (
        <div className="group-pw-reset__actions">
          <Button
            variant="secondary"
            onClick={() => {
              setError(null)
              setStep("request")
            }}
          >
            <KeyRound size={16} strokeWidth={1.75} aria-hidden />
            Reset password
          </Button>
        </div>
      )}
    </div>
  )
}
