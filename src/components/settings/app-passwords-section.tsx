"use client"

import { useCallback, useEffect, useState } from "react"
import { Check, Copy, KeyRound, Plus, Trash2 } from "lucide-react"
import {
  createAppPassword,
  listAppPasswords,
  revokeAppPassword,
  type AppPasswordInfo,
  type CreatedAppPassword,
} from "@/lib/atproto/app-passwords"
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard"
import Button from "@/components/ui/button"
import Input from "@/components/ui/input"
import ErrorMessage from "@/components/ui/error-message"
import LoadingSpinner from "@/components/ui/loading-spinner"

/**
 * Create / list / revoke atproto app passwords (`com.atproto.server.*`).
 *
 * An app password lets another client — or the Certified Group Service's
 * group import — act for this account without the main password. The
 * generated secret is shown exactly once on creation (the PDS never returns
 * it again), so we surface it for copy and then drop it from state.
 */
export default function AppPasswordsSection() {
  const [items, setItems] = useState<AppPasswordInfo[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [name, setName] = useState("")
  const [isCreating, setIsCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [created, setCreated] = useState<CreatedAppPassword | null>(null)

  const [revoking, setRevoking] = useState<string | null>(null)
  const { copied, copy } = useCopyToClipboard()

  const refresh = useCallback(async (signal?: AbortSignal) => {
    try {
      const list = await listAppPasswords(signal)
      if (!signal?.aborted) {
        setItems(list)
        setLoadError(null)
      }
    } catch {
      if (!signal?.aborted) setLoadError("Couldn't load app passwords.")
    } finally {
      if (!signal?.aborted) setIsLoading(false)
    }
  }, [])

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
        setCreateError(
          err instanceof Error ? err.message : "Failed to create app password",
        )
      } finally {
        setIsCreating(false)
      }
    },
    [name, isCreating, refresh],
  )

  const handleRevoke = useCallback(
    async (pwName: string) => {
      setRevoking(pwName)
      try {
        await revokeAppPassword(pwName)
        await refresh()
      } catch {
        setLoadError("Couldn't revoke that app password.")
      } finally {
        setRevoking(null)
      }
    },
    [refresh],
  )

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
    </div>
  )
}
