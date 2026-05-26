"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { MoreVertical, X } from "lucide-react"
import AppDialog from "@/components/ui/app-dialog"
import Button from "@/components/ui/button"
import LoadingSpinner from "@/components/ui/loading-spinner"
import { authFetch } from "@/lib/auth/fetch"
import { useAuth } from "@/lib/auth/auth-context"
import { useTypedLists } from "@/hooks/use-typed-lists"
import {
  itemUriMatchesType,
  type TypedListType,
} from "@/lib/atproto/typed-lists"

const TYPE_LABEL: Record<TypedListType, string> = {
  "list:certs": "cert",
  "list:projects": "project",
  "list:accounts": "account",
}

interface AddToListMenuProps {
  targetUri: string
  /** CID at read time. Pass an empty string when the calling surface
   *  doesn't have a CID readily available (e.g., the profile sidebar
   *  doesn't track the actor-profile record's CID) — the modal will
   *  resolve it via `getRecord` on click. Passing a non-empty CID
   *  saves one round-trip. */
  targetCid: string
  targetType: TypedListType
}

/**
 * "⋮ → Add to list" affordance shown right below the primary image
 * on cert / project / profile overview pages. Renders nothing when:
 *
 *   - the viewer isn't signed in (can't write to their own PDS), or
 *   - the target URI doesn't match the lexicon the list type expects
 *     (defensive — surfaces a programming error rather than silently
 *     writing a malformed strongRef).
 *
 * Otherwise: a 3-dot button → popover → "Add to list" → modal with
 * the viewer's existing lists of the matching type + an inline
 * "Create a new list" affordance.
 */
export default function AddToListMenu({
  targetUri,
  targetCid,
  targetType,
}: AddToListMenuProps) {
  const { did: viewerDid } = useAuth()
  const [open, setOpen] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handleDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", handleDown)
    document.addEventListener("keydown", handleKey)
    return () => {
      document.removeEventListener("mousedown", handleDown)
      document.removeEventListener("keydown", handleKey)
    }
  }, [open])

  if (!viewerDid) return null
  if (!itemUriMatchesType(targetUri, targetType)) return null

  return (
    <>
      <div className="add-to-list" ref={wrapRef}>
        <button
          type="button"
          className="add-to-list__trigger"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="true"
          aria-expanded={open}
          aria-label="Open list actions"
        >
          <MoreVertical size={16} strokeWidth={1.75} aria-hidden />
        </button>
        {open ? (
          <div className="add-to-list__pop" role="menu">
            <button
              type="button"
              role="menuitem"
              className="add-to-list__pop-item"
              onClick={() => {
                setOpen(false)
                setModalOpen(true)
              }}
            >
              Add to list
            </button>
          </div>
        ) : null}
      </div>
      {modalOpen && viewerDid ? (
        <AddToListModal
          viewerDid={viewerDid}
          targetUri={targetUri}
          targetCid={targetCid}
          targetType={targetType}
          onClose={() => setModalOpen(false)}
        />
      ) : null}
    </>
  )
}

interface AddToListModalProps {
  viewerDid: string
  targetUri: string
  targetCid: string
  targetType: TypedListType
  onClose: () => void
}

function AddToListModal({
  viewerDid,
  targetUri,
  targetCid,
  targetType,
  onClose,
}: AddToListModalProps) {
  const { byType, isLoading, createList, addItem } = useTypedLists(viewerDid)
  const candidates = byType[targetType]
  const alreadyIn = useMemo(() => {
    const out = new Set<string>()
    for (const list of candidates) {
      if (list.items.some((it) => it.itemIdentifier.uri === targetUri)) {
        out.add(list.rkey)
      }
    }
    return out
  }, [candidates, targetUri])

  const [busyRkey, setBusyRkey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [newTitle, setNewTitle] = useState("")
  const newInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (creating) newInputRef.current?.focus()
  }, [creating])

  const handleAdd = useCallback(
    async (rkey: string) => {
      if (busyRkey) return
      setBusyRkey(rkey)
      setError(null)
      try {
        const cid = targetCid || (await resolveRecordCid(targetUri))
        if (!cid) throw new Error("Couldn't resolve record CID")
        await addItem(rkey, targetType, { uri: targetUri, cid })
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to add")
      } finally {
        setBusyRkey(null)
      }
    },
    [addItem, busyRkey, targetCid, targetType, targetUri],
  )

  const handleCreateAndAdd = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      const title = newTitle.trim()
      if (!title || busyRkey) return
      setBusyRkey("__new__")
      setError(null)
      try {
        const cid = targetCid || (await resolveRecordCid(targetUri))
        if (!cid) throw new Error("Couldn't resolve record CID")
        const ref = await createList(targetType, title)
        const rkey = ref.uri.split("/").pop()
        if (!rkey) throw new Error("New list missing rkey")
        await addItem(rkey, targetType, { uri: targetUri, cid })
        setCreating(false)
        setNewTitle("")
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to create list")
      } finally {
        setBusyRkey(null)
      }
    },
    [addItem, busyRkey, createList, newTitle, targetCid, targetType, targetUri],
  )

  return (
    <AppDialog
      ariaLabel={`Add ${TYPE_LABEL[targetType]} to a list`}
      maxWidth={460}
      onClose={() => !busyRkey && onClose()}
      disableBackdropClose={!!busyRkey}
    >
      <div className="signin-modal__header">
        <span className="signin-modal__title">Add {TYPE_LABEL[targetType]} to a list</span>
        <button
          type="button"
          className="signin-modal__close"
          onClick={() => !busyRkey && onClose()}
          aria-label="Close"
          disabled={!!busyRkey}
        >
          <X size={18} />
        </button>
      </div>
      <div className="signin-modal__body add-to-list__body">
        {isLoading ? (
          <div className="add-to-list__loading">
            <LoadingSpinner size="sm" />
          </div>
        ) : null}
        {!isLoading && candidates.length === 0 && !creating ? (
          <p className="add-to-list__empty">
            You don&rsquo;t have a {TYPE_LABEL[targetType]} list yet.
          </p>
        ) : null}
        {!isLoading && candidates.length > 0 ? (
          <ul className="add-to-list__list">
            {candidates.map((list) => {
              const isIn = alreadyIn.has(list.rkey)
              const isBusy = busyRkey === list.rkey
              return (
                <li key={list.rkey} className="add-to-list__row">
                  <span className="add-to-list__row-title">{list.title}</span>
                  <Button
                    type="button"
                    variant={isIn ? "ghost" : "primary"}
                    size="sm"
                    onClick={() => handleAdd(list.rkey)}
                    loading={isBusy}
                    disabled={isIn || (!!busyRkey && !isBusy)}
                  >
                    {isIn ? "Added" : "Add"}
                  </Button>
                </li>
              )
            })}
          </ul>
        ) : null}
        {error ? (
          <p className="add-to-list__error" role="alert">
            {error}
          </p>
        ) : null}
        {creating ? (
          <form className="add-to-list__create" onSubmit={handleCreateAndAdd}>
            <input
              ref={newInputRef}
              type="text"
              className="add-to-list__create-input"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="New list name"
              maxLength={120}
              disabled={busyRkey === "__new__"}
            />
            <div className="add-to-list__create-actions">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setCreating(false)
                  setNewTitle("")
                }}
                disabled={busyRkey === "__new__"}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                loading={busyRkey === "__new__"}
                disabled={!newTitle.trim() || busyRkey === "__new__"}
              >
                Create &amp; add
              </Button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            className="add-to-list__create-btn"
            onClick={() => setCreating(true)}
            disabled={!!busyRkey}
          >
            + Create a new list
          </button>
        )}
      </div>
    </AppDialog>
  )
}

async function resolveRecordCid(uri: string): Promise<string | null> {
  const parts = uri.split("/")
  if (parts.length < 5) return null
  const [, , repo, collection, rkey] = parts
  if (!repo || !collection || !rkey) return null
  const params = new URLSearchParams({ repo, collection, rkey })
  const res = await authFetch(
    `/api/xrpc/com/atproto/repo/getRecord?${params.toString()}`,
    { cache: "no-store" },
  )
  if (!res.ok) return null
  const data = (await res.json()) as { cid?: string }
  return data.cid ?? null
}
