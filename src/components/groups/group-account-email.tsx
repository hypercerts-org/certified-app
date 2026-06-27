"use client"

import { useCallback, useState } from "react"
import { KeyRound, Lock, Pencil } from "lucide-react"
import {
  unlockGroupAccount,
  lockGroupAccount,
  getGroupEmail,
  requestGroupEmailUpdate,
  updateGroupEmail,
  LOCKED,
} from "@/lib/groups/account"
import Input from "@/components/ui/input"
import Button from "@/components/ui/button"
import ErrorMessage from "@/components/ui/error-message"

/**
 * Owner/admin email management for a non-self group. Unlock once with the
 * group's password (+ emailed 2FA code if on) — the same short-lived elevated
 * session as the app-password unlock — then view and change the group's email.
 * Locking (or the ~10-min TTL) tears the session down server-side.
 */
export default function GroupAccountEmail({ groupDid }: { groupDid: string }) {
  const [unlocked, setUnlocked] = useState(false)

  // Unlock fields
  const [password, setPassword] = useState("")
  const [code, setCode] = useState("")
  const [needsCode, setNeedsCode] = useState(false)
  const [unlocking, setUnlocking] = useState(false)
  const [unlockError, setUnlockError] = useState<string | null>(null)

  // Email (once unlocked)
  const [email, setEmail] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [newEmail, setNewEmail] = useState("")
  const [emailToken, setEmailToken] = useState("")
  const [needsToken, setNeedsToken] = useState(false)
  const [saving, setSaving] = useState(false)
  const [emailError, setEmailError] = useState<string | null>(null)

  const relock = useCallback(() => {
    setUnlocked(false)
    setEmail(null)
    setEditing(false)
    setNewEmail("")
    setEmailToken("")
    setNeedsToken(false)
    setEmailError(null)
  }, [])

  const unlock = async () => {
    if (!password.trim()) return
    setUnlocking(true)
    setUnlockError(null)
    try {
      const { status } = await unlockGroupAccount(
        groupDid,
        password,
        needsCode ? code.trim() : undefined,
      )
      if (status === "ok") {
        setPassword("")
        setCode("")
        setNeedsCode(false)
        const result = await getGroupEmail(groupDid)
        if (result === LOCKED) {
          setUnlockError("Session expired — please unlock again.")
          return
        }
        setEmail(result.email)
        setUnlocked(true)
      } else if (status === "twoFactorRequired") {
        setNeedsCode(true)
      } else if (status === "invalidCode") {
        setUnlockError("That code wasn't accepted. Check it and try again.")
      } else {
        setUnlockError("That password wasn't accepted for the group account.")
      }
    } catch (err) {
      setUnlockError(err instanceof Error ? err.message : "Unlock failed")
    } finally {
      setUnlocking(false)
    }
  }

  const lock = async () => {
    try {
      await lockGroupAccount(groupDid)
    } catch {
      // best-effort
    }
    relock()
  }

  const saveEmail = async () => {
    if (!newEmail.trim()) return
    setSaving(true)
    setEmailError(null)
    try {
      // A confirmed current email needs a token sent to it first.
      if (!needsToken) {
        const req = await requestGroupEmailUpdate(groupDid)
        if (req === LOCKED) {
          relock()
          return
        }
        if (req.tokenRequired) {
          setNeedsToken(true)
          return
        }
      }
      const result = await updateGroupEmail(
        groupDid,
        newEmail.trim(),
        needsToken ? emailToken.trim() : undefined,
      )
      if (result === LOCKED) {
        relock()
        return
      }
      setEmail(newEmail.trim())
      setEditing(false)
      setNewEmail("")
      setEmailToken("")
      setNeedsToken(false)
    } catch (err) {
      setEmailError(err instanceof Error ? err.message : "Failed to update email")
    } finally {
      setSaving(false)
    }
  }

  if (!unlocked) {
    return (
      <form
        className="group-acct__form"
        onSubmit={(e) => {
          e.preventDefault()
          void unlock()
        }}
      >
        <Input
          label="Group password"
          type="password"
          autoComplete="off"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={unlocking}
        />
        {needsCode ? (
          <Input
            label="Email code"
            autoComplete="one-time-code"
            inputMode="numeric"
            placeholder="Code from the group's email"
            helperText="We emailed a sign-in code to the group's address."
            value={code}
            onChange={(e) => setCode(e.target.value)}
            disabled={unlocking}
          />
        ) : null}
        {unlockError && <ErrorMessage message={unlockError} />}
        <Button
          type="submit"
          variant="primary"
          loading={unlocking}
          disabled={!password.trim() || unlocking}
        >
          <KeyRound size={16} strokeWidth={1.75} aria-hidden />
          Unlock
        </Button>
      </form>
    )
  }

  return (
    <div className="group-acct">
      {editing ? (
        <form
          className="group-acct__form"
          onSubmit={(e) => {
            e.preventDefault()
            void saveEmail()
          }}
        >
          <Input
            type="email"
            label="New email"
            autoComplete="off"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            disabled={saving}
          />
          {needsToken ? (
            <Input
              label="Confirmation code"
              autoComplete="one-time-code"
              placeholder="Code sent to the current email"
              helperText="We sent a code to the group's current email to confirm the change."
              value={emailToken}
              onChange={(e) => setEmailToken(e.target.value)}
              disabled={saving}
            />
          ) : null}
          {emailError && <ErrorMessage message={emailError} />}
          <div className="group-acct__actions">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setEditing(false)
                setNewEmail("")
                setEmailToken("")
                setNeedsToken(false)
                setEmailError(null)
              }}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              loading={saving}
              disabled={!newEmail.trim() || saving}
            >
              Save email
            </Button>
          </div>
        </form>
      ) : (
        <div className="group-acct__view">
          <span className="settings-field__value">{email || "—"}</span>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setEditing(true)
              setNewEmail(email || "")
            }}
          >
            <Pencil size={14} strokeWidth={1.75} aria-hidden />
            Edit
          </Button>
        </div>
      )}

      <button type="button" className="group-acct__lock" onClick={() => void lock()}>
        <Lock size={13} strokeWidth={1.75} aria-hidden />
        Lock
      </button>
    </div>
  )
}
