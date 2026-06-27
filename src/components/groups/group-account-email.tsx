"use client"

import { useCallback, useState } from "react"
import { Lock, Pencil, Unlock } from "lucide-react"
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
import { useUnlockSession } from "@/components/settings/unlock-app-passwords-fields"
import { UnlockSessionDialog } from "@/components/settings/unlock-app-passwords-dialog"

/**
 * Owner/admin email management for a non-self group. Unlock once with the
 * group's password (+ emailed 2FA code if on) via the SAME unlock UI as the
 * app-password flow — a short-lived elevated session — then view and change the
 * group's email. Locking (or the ~10-min TTL) tears the session down.
 */
export default function GroupAccountEmail({ groupDid }: { groupDid: string }) {
  const [unlocked, setUnlocked] = useState(false)
  const [unlockOpen, setUnlockOpen] = useState(false)

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

  const loadEmail = useCallback(async () => {
    const result = await getGroupEmail(groupDid)
    if (result === LOCKED) {
      relock()
      return
    }
    setEmail(result.email)
  }, [groupDid, relock])

  const unlockFn = useCallback(
    (password: string, authFactorToken?: string) =>
      unlockGroupAccount(groupDid, password, authFactorToken),
    [groupDid],
  )

  const onUnlocked = useCallback(() => {
    setUnlockOpen(false)
    setUnlocked(true)
    void loadEmail()
  }, [loadEmail])

  const unlock = useUnlockSession(unlockFn, onUnlocked)

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
      <div className="group-acct">
        <div className="org-members__add-submit">
          <Button variant="secondary" onClick={() => setUnlockOpen(true)}>
            <Unlock size={14} strokeWidth={1.75} aria-hidden />
            Unlock
          </Button>
        </div>
        {unlockOpen ? (
          <UnlockSessionDialog
            state={unlock}
            onClose={() => setUnlockOpen(false)}
            title="Unlock group account"
            intro="Enter the group's password to view and change its sign-in email. It's used once to open a short, secure session — it isn't stored."
            passwordLabel="Group password"
            passwordHint={null}
            invalidMessage="That password wasn't accepted for the group account."
            codeHelper="We emailed a sign-in code to the group's address."
          />
        ) : null}
      </div>
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
