"use client"

import { useCallback, useEffect, useState } from "react"
import { Check, Copy, KeyRound, Plus, Trash2, Unlock } from "lucide-react"
import {
  createAppPassword,
  listAppPasswords,
  revokeAppPassword,
  AppPasswordsLockedError,
  type AppPasswordInfo,
  type CreatedAppPassword,
} from "@/lib/atproto/app-passwords"
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard"
import Button from "@/components/ui/button"
import Input from "@/components/ui/input"
import EmptyState from "@/components/ui/empty-state"
import ErrorMessage from "@/components/ui/error-message"
import Skeleton from "@/components/ui/skeleton"
import ConfirmDialog from "@/components/ui/confirm-dialog"
import UnlockAppPasswordsDialog from "./unlock-app-passwords-dialog"
import { SettingsRow } from "./settings-layout"

/**
 * Create / list / revoke atproto app passwords (`com.atproto.server.*`).
 *
 * These endpoints reject OAuth credentials, so they run inside a short-lived
 * password session the user unlocks once (issue #223). The section therefore
 * has three states: `checking` (probing for an existing session on mount),
 * `locked` (show the Unlock gate), and `unlocked` (manage). A `locked` error
 * mid-session (TTL expiry) drops back to the gate.
 *
 * An app password lets another client — or the group import — act for this
 * account without the main password. The generated secret is shown exactly
 * once on creation, so we surface it for copy and then drop it from state.
 */
type Status = "checking" | "locked" | "unlocked"

export default function AppPasswordsSection() {
  const [status, setStatus] = useState<Status>("checking")
  const [unlockOpen, setUnlockOpen] = useState(false)

  const [items, setItems] = useState<AppPasswordInfo[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [name, setName] = useState("")
  const [isCreating, setIsCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [created, setCreated] = useState<CreatedAppPassword | null>(null)

  const [revoking, setRevoking] = useState<string | null>(null)
  const [revokeError, setRevokeError] = useState<string | null>(null)
  // Revoke is irreversible and signs out every client using the password,
  // so it goes through a confirm step.
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null)
  const { copied, copy } = useCopyToClipboard()

  const goLocked = useCallback(() => {
    setStatus("locked")
    setItems([])
    setCreated(null)
    setLoadError(null)
    setRevokeError(null)
  }, [])

  const refresh = useCallback(async (signal?: AbortSignal) => {
    setIsLoading(true)
    try {
      const list = await listAppPasswords(signal)
      if (signal?.aborted) return
      setItems(list)
      setLoadError(null)
      setRevokeError(null)
      setStatus("unlocked")
    } catch (err) {
      if (signal?.aborted) return
      if (err instanceof AppPasswordsLockedError) {
        // Route through goLocked so the one-time `created` secret is cleared
        // too — otherwise it could resurface when the session is re-opened.
        goLocked()
        return
      }
      // A non-locked failure means the session is open but the list call
      // failed — stay unlocked and surface the error.
      setStatus("unlocked")
      setLoadError("Couldn't load your app passwords.")
    } finally {
      if (!signal?.aborted) setIsLoading(false)
    }
  }, [goLocked])

  // On mount, probe for an already-open session so a recent unlock (within
  // its ~10-min window) isn't re-prompted.
  useEffect(() => {
    const controller = new AbortController()
    void refresh(controller.signal)
    return () => controller.abort()
  }, [refresh])

  const handleCreate = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault()
      const trimmed = name.trim()
      if (!trimmed || isCreating) return
      setIsCreating(true)
      setCreateError(null)
      try {
        const result = await createAppPassword(trimmed)
        setCreated(result)
        setName("")
        await refresh()
      } catch (err) {
        if (err instanceof AppPasswordsLockedError) {
          goLocked()
          return
        }
        setCreateError(
          err instanceof Error ? err.message : "Failed to create app password",
        )
      } finally {
        setIsCreating(false)
      }
    },
    [name, isCreating, refresh, goLocked],
  )

  const handleRevoke = useCallback(
    async (pwName: string) => {
      setRevoking(pwName)
      setRevokeError(null)
      try {
        await revokeAppPassword(pwName)
        await refresh()
      } catch (err) {
        if (err instanceof AppPasswordsLockedError) {
          goLocked()
          return
        }
        // A failed revoke leaves the list as it was; say so above it.
        setRevokeError(`Couldn't revoke "${pwName}". Try again in a moment.`)
      } finally {
        setRevoking(null)
        setConfirmRevoke(null)
      }
    },
    [refresh, goLocked],
  )

  // ---- Checking (initial probe) -------------------------------------------
  if (status === "checking") {
    return (
      <SettingsRow label="Access" description="Checking whether app passwords are unlocked.">
        <Skeleton variant="box" width={132} height={32} />
      </SettingsRow>
    )
  }

  // ---- Locked gate --------------------------------------------------------
  if (status === "locked") {
    return (
      <SettingsRow
        label="Access"
        description="App passwords are protected. Unlock with your account password to view, create or revoke them; they lock again after about 10 minutes."
      >
        <Button
          type="button"
          variant="primary"
          size="sm"
          onClick={() => setUnlockOpen(true)}
        >
          <Unlock size={14} aria-hidden /> Unlock
        </Button>
        {unlockOpen && (
          <UnlockAppPasswordsDialog
            onUnlocked={() => {
              setUnlockOpen(false)
              void refresh()
            }}
            onClose={() => setUnlockOpen(false)}
          />
        )}
      </SettingsRow>
    )
  }

  // ---- Unlocked (manage) --------------------------------------------------
  return (
    <>
      <SettingsRow
        label="New app password"
        description="Name it after the app that will use it. The password is shown once."
      >
        {/* One-time reveal of a freshly created password. */}
        {created ? (
          <div className="app-passwords__created">
            <p className="m-0 text-body-sm text-[var(--fg-secondary)]">
              Copy <strong className="font-medium text-[var(--fg-primary)]">{created.name}</strong> now.
              It won&apos;t be shown again.
            </p>
            <div className="app-passwords__secret">
              <code className="app-passwords__secret-value">
                {created.password}
              </code>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => copy(created.password)}
              >
                {copied ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
            <div>
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={() => setCreated(null)}
              >
                Done
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleCreate} className="app-passwords__create">
            <Input
              label="Name"
              size="md"
              autoComplete="off"
              leadingIcon={<KeyRound size={16} aria-hidden="true" />}
              placeholder="e.g. my-other-client"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            {createError && <ErrorMessage message={createError} />}
            <div>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                loading={isCreating}
                disabled={!name.trim() || isCreating}
              >
                <Plus size={14} aria-hidden /> Create app password
              </Button>
            </div>
          </form>
        )}
      </SettingsRow>

      {/* Existing app passwords. */}
      <SettingsRow
        label="Your app passwords"
        description="Revoking one signs out every app that uses it."
      >
        {isLoading ? (
          <Skeleton variant="line" width="100%" height={20} count={2} />
        ) : loadError ? (
          // Load failure: the inline pattern with a retry (DESIGN §10.1).
          <EmptyState variant="inline" title={loadError}>
            <Button variant="ghost" size="sm" onClick={() => void refresh()}>
              Try again
            </Button>
          </EmptyState>
        ) : items.length === 0 ? (
          <p className="m-0 text-body-sm text-[var(--fg-muted)]">None yet.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {revokeError && <ErrorMessage message={revokeError} />}
            <ul className="app-passwords__list">
              {items.map((p) => (
                <li key={p.name} className="app-passwords__row">
                  <span className="app-passwords__row-name">{p.name}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    loading={revoking === p.name}
                    disabled={revoking === p.name}
                    onClick={() => setConfirmRevoke(p.name)}
                    aria-label={`Revoke ${p.name}`}
                  >
                    <Trash2 size={14} aria-hidden /> Revoke
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </SettingsRow>

      {confirmRevoke !== null ? (
        <ConfirmDialog
          title="Revoke app password?"
          message={`Revoke "${confirmRevoke}"? Apps using it will be signed out.`}
          confirmLabel="Revoke app password"
          isConfirming={revoking === confirmRevoke}
          onCancel={() => setConfirmRevoke(null)}
          onConfirm={() => handleRevoke(confirmRevoke)}
        />
      ) : null}
    </>
  )
}
