"use client"

import { useCallback, useState } from "react"
import { Pencil, Unlock } from "lucide-react"
import { useOrg } from "@/lib/groups/org-context"
import {
  unlockGroupAccount,
  getGroupEmail,
  requestGroupEmailUpdate,
  updateGroupEmail,
  updateGroupHandle,
  LOCKED,
} from "@/lib/groups/account"
import Input from "@/components/ui/input"
import Button from "@/components/ui/button"
import ErrorMessage from "@/components/ui/error-message"
import CopyPill from "@/components/account/copy-pill"
import { useUnlockSession } from "@/components/settings/unlock-app-passwords-fields"
import { UnlockSessionDialog } from "@/components/settings/unlock-app-passwords-dialog"

/**
 * Owner/admin handle + email management for a non-self group. Unlock once with
 * the group's password (same short-lived elevated session as the app-password
 * unlock) and the operations run with the GROUP's own session — so changing the
 * handle renames the group, not the caller. Locked: the handle is shown
 * read-only; the email is hidden until unlock.
 */
export default function GroupAccountManager({
  groupDid,
  currentHandle,
}: {
  groupDid: string
  currentHandle: string
}) {
  const { refetchOrgs } = useOrg()
  const [unlocked, setUnlocked] = useState(false)
  const [unlockOpen, setUnlockOpen] = useState(false)

  // Handle. Split into subdomain + suffix (e.g. test003 | .certified.one) so we
  // edit just the label, like the personal username card.
  const firstDot = currentHandle.indexOf(".")
  const suffix = firstDot >= 0 ? currentHandle.slice(firstDot) : ""
  const [handle, setHandle] = useState(currentHandle)
  const [editingHandle, setEditingHandle] = useState(false)
  const [subdomain, setSubdomain] = useState("")
  const [savingHandle, setSavingHandle] = useState(false)
  const [handleError, setHandleError] = useState<string | null>(null)

  // Email.
  const [email, setEmail] = useState<string | null>(null)
  const [editingEmail, setEditingEmail] = useState(false)
  const [newEmail, setNewEmail] = useState("")
  const [emailToken, setEmailToken] = useState("")
  const [needsToken, setNeedsToken] = useState(false)
  const [savingEmail, setSavingEmail] = useState(false)
  const [emailError, setEmailError] = useState<string | null>(null)

  const relock = useCallback(() => {
    setUnlocked(false)
    setEmail(null)
    setEditingHandle(false)
    setEditingEmail(false)
    setNewEmail("")
    setEmailToken("")
    setNeedsToken(false)
    setEmailError(null)
    setHandleError(null)
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

  const saveHandle = async () => {
    if (!subdomain.trim()) return
    setSavingHandle(true)
    setHandleError(null)
    try {
      const next = `${subdomain.trim()}${suffix}`
      const result = await updateGroupHandle(groupDid, next)
      if (result === LOCKED) {
        relock()
        return
      }
      setHandle(next)
      setEditingHandle(false)
      void refetchOrgs()
    } catch (err) {
      setHandleError(err instanceof Error ? err.message : "Failed to update handle")
    } finally {
      setSavingHandle(false)
    }
  }

  const saveEmail = async () => {
    if (!newEmail.trim()) return
    setSavingEmail(true)
    setEmailError(null)
    try {
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
      setEditingEmail(false)
      setNewEmail("")
      setEmailToken("")
      setNeedsToken(false)
    } catch (err) {
      setEmailError(err instanceof Error ? err.message : "Failed to update email")
    } finally {
      setSavingEmail(false)
    }
  }

  return (
    <>
      {/* Handle */}
      <div className="sx-subsection">
        <div className="sx-subsection__head">
          <h3 className="sx-subsection__title">Handle</h3>
          <p className="sx-subsection__desc">
            The @handle people use to find this group on Certified.
            {!unlocked
              ? " Unlock with the group's password to change it."
              : ""}
          </p>
        </div>
        {unlocked && editingHandle ? (
          <form
            className="group-acct__form"
            onSubmit={(e) => {
              e.preventDefault()
              void saveHandle()
            }}
          >
            <div className="username-card__subdomain-row">
              <Input
                size="sm"
                aria-label="Handle"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                value={subdomain}
                onChange={(e) => setSubdomain(e.target.value)}
                disabled={savingHandle}
              />
              <span className="username-card__subdomain-suffix">{suffix}</span>
            </div>
            <p className="username-card__subdomain-hint">
              3-18 characters. Letters, numbers, and hyphens only.
            </p>
            {handleError && <ErrorMessage message={handleError} />}
            <div className="group-acct__actions">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setEditingHandle(false)
                  setHandleError(null)
                }}
                disabled={savingHandle}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                loading={savingHandle}
                disabled={!subdomain.trim() || savingHandle}
              >
                Save handle
              </Button>
            </div>
          </form>
        ) : (
          <div className="group-acct__view">
            <CopyPill value={handle} display={`@${handle}`} label="handle" inline />
            {unlocked ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  const dot = handle.indexOf(".")
                  setSubdomain(dot >= 0 ? handle.slice(0, dot) : handle)
                  setEditingHandle(true)
                }}
              >
                <Pencil size={14} strokeWidth={1.75} aria-hidden />
                Edit
              </Button>
            ) : (
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={() => setUnlockOpen(true)}
              >
                <Unlock size={14} /> Unlock
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Email */}
      <div className="sx-subsection">
        <div className="sx-subsection__head">
          <h3 className="sx-subsection__title">Email</h3>
          <p className="sx-subsection__desc">
            Used to sign in and recover this account.
            {!unlocked ? " Unlock to view or change it." : ""}
          </p>
        </div>
        {unlocked ? (
          editingEmail ? (
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
                disabled={savingEmail}
              />
              {needsToken ? (
                <Input
                  label="Confirmation code"
                  autoComplete="one-time-code"
                  placeholder="Code sent to the current email"
                  helperText="We sent a code to the group's current email to confirm the change."
                  value={emailToken}
                  onChange={(e) => setEmailToken(e.target.value)}
                  disabled={savingEmail}
                />
              ) : null}
              {emailError && <ErrorMessage message={emailError} />}
              <div className="group-acct__actions">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setEditingEmail(false)
                    setNewEmail("")
                    setEmailToken("")
                    setNeedsToken(false)
                    setEmailError(null)
                  }}
                  disabled={savingEmail}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  loading={savingEmail}
                  disabled={!newEmail.trim() || savingEmail}
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
                  setEditingEmail(true)
                  setNewEmail(email || "")
                }}
              >
                <Pencil size={14} strokeWidth={1.75} aria-hidden />
                Edit
              </Button>
            </div>
          )
        ) : (
          <div className="group-acct__view">
            <span className="settings-field__value group-acct__masked">
              ••••••••
            </span>
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={() => setUnlockOpen(true)}
            >
              <Unlock size={14} /> Unlock
            </Button>
          </div>
        )}
      </div>

      {unlockOpen ? (
        <UnlockSessionDialog
          state={unlock}
          onClose={() => setUnlockOpen(false)}
          title="Unlock group account"
          intro="Enter the group's password to change its handle and sign-in email. It's used once to open a short, secure session — it isn't stored."
          passwordLabel="Group password"
          passwordHint={null}
          invalidMessage="That password wasn't accepted for the group account."
          codeHelper="We emailed a sign-in code to the group's address."
        />
      ) : null}
    </>
  )
}
