"use client"

import { useCallback, useEffect, useState } from "react"
import { Check, Copy, KeyRound, Lock, Plus, Trash2, Unlock } from "lucide-react"
import {
  createAppPassword,
  listAppPasswords,
  revokeAppPassword,
  lockAppPasswords,
  AppPasswordsLockedError,
  type AppPasswordInfo,
  type CreatedAppPassword,
} from "@/lib/atproto/app-passwords"
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard"
import Button from "@/components/ui/button"
import Input from "@/components/ui/input"
import ErrorMessage from "@/components/ui/error-message"
import LoadingSpinner from "@/components/ui/loading-spinner"
import UnlockAppPasswordsDialog from "./unlock-app-passwords-dialog"

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
  const [isLocking, setIsLocking] = useState(false)
  const { copied, copy } = useCopyToClipboard()

  const goLocked = useCallback(() => {
    setStatus("locked")
    setItems([])
    setCreated(null)
    setLoadError(null)
  }, [])

  const refresh = useCallback(async (signal?: AbortSignal) => {
    setIsLoading(true)
    try {
      const list = await listAppPasswords(signal)
      if (signal?.aborted) return
      setItems(list)
      setLoadError(null)
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
      setLoadError("Couldn't load app passwords.")
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
      try {
        await revokeAppPassword(pwName)
        await refresh()
      } catch (err) {
        if (err instanceof AppPasswordsLockedError) {
          goLocked()
          return
        }
        setLoadError("Couldn't revoke that app password.")
      } finally {
        setRevoking(null)
      }
    },
    [refresh, goLocked],
  )

  const handleLock = useCallback(async () => {
    setIsLocking(true)
    try {
      await lockAppPasswords()
    } catch {
      // Best-effort — lock the UI regardless.
    } finally {
      setIsLocking(false)
      goLocked()
    }
  }, [goLocked])

  // ---- Checking (initial probe) -------------------------------------------
  if (status === "checking") {
    return (
      <div className="app-passwords">
        <div className="app-passwords__loading">
          <LoadingSpinner size="sm" />
        </div>
      </div>
    )
  }

  // ---- Locked gate --------------------------------------------------------
  if (status === "locked") {
    return (
      <div className="app-passwords">
        <p className="settings__note">
          App passwords are protected. Unlock with your account password to
          view, create, or revoke them — the session locks itself after a few
          minutes.
        </p>
        <div className="org-members__add-submit">
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={() => setUnlockOpen(true)}
          >
            <Unlock size={14} /> Unlock
          </Button>
        </div>
        {unlockOpen && (
          <UnlockAppPasswordsDialog
            onUnlocked={() => {
              setUnlockOpen(false)
              void refresh()
            }}
            onClose={() => setUnlockOpen(false)}
          />
        )}
      </div>
    )
  }

  // ---- Unlocked (manage) --------------------------------------------------
  return (
    <div className="app-passwords">
      {/* One-time reveal of a freshly created password. */}
      {created ? (
        <div className="app-passwords__created">
          <p className="settings__note">
            Copy <strong>{created.name}</strong> now — this password won&apos;t
            be shown again.
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
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <div className="org-members__add-submit">
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
          <div className="org-members__add-submit">
            <Button
              type="submit"
              variant="primary"
              size="sm"
              loading={isCreating}
              disabled={!name.trim() || isCreating}
            >
              <Plus size={14} /> Create app password
            </Button>
          </div>
        </form>
      )}

      {/* Existing app passwords. */}
      {isLoading ? (
        <div className="app-passwords__loading">
          <LoadingSpinner size="sm" />
        </div>
      ) : loadError ? (
        <ErrorMessage message={loadError} />
      ) : items.length === 0 ? (
        <p className="settings__note">No app passwords yet.</p>
      ) : (
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
                onClick={() => handleRevoke(p.name)}
              >
                <Trash2 size={14} /> Revoke
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="app-passwords__lock">
        <p className="settings__note">
          Locking ends this session right away, so your account password is
          needed to view, create, or revoke app passwords again. It also locks
          on its own after a few minutes.
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          loading={isLocking}
          disabled={isLocking}
          onClick={handleLock}
        >
          <Lock size={14} /> Lock
        </Button>
      </div>
    </div>
  )
}
