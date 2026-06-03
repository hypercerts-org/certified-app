"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Copy, ListPlus, MoreVertical } from "lucide-react"
import AppDialog, { AppDialogHeader, AppDialogBody } from "@/components/ui/app-dialog"
import Button from "@/components/ui/button"
import Input from "@/components/ui/input"
import LoadingSpinner from "@/components/ui/loading-spinner"
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverItem,
} from "@/components/ui/popover"
import { useAuth } from "@/lib/auth/auth-context"
import { useTypedLists } from "@/hooks/use-typed-lists"
import {
  itemUriMatchesType,
  resolveRecordCid,
  type TypedListType,
} from "@/lib/atproto/typed-lists"

const TYPE_LABEL: Record<TypedListType, string> = {
  "list:certs": "activity",
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
  const [copied, setCopied] = useState(false)

  // Reset the brief "Copied" affordance whenever the popover opens
  // again, so the previous run's feedback doesn't leak across opens.
  useEffect(() => {
    if (open) setCopied(false)
  }, [open])

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(targetUri)
      setCopied(true)
      // Keep the popover open briefly so the user sees the
      // confirmation, then auto-close.
      window.setTimeout(() => {
        setOpen(false)
      }, 900)
    } catch (err) {
      console.error("Failed to copy URI:", err)
    }
  }, [targetUri])

  if (!viewerDid) return null
  if (!itemUriMatchesType(targetUri, targetType)) return null

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger>
          <Button
            size="icon"
            variant="ghost"
            aria-label="Open list actions"
          >
            <MoreVertical size={16} strokeWidth={1.75} aria-hidden />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end">
          <PopoverItem
            onClick={() => {
              setOpen(false)
              setModalOpen(true)
            }}
          >
            <ListPlus size={13} strokeWidth={1.75} aria-hidden />
            Add to list
          </PopoverItem>
          <PopoverItem onClick={handleCopy}>
            <Copy size={13} strokeWidth={1.75} aria-hidden />
            {copied ? "Copied" : "Copy AT URI"}
          </PopoverItem>
        </PopoverContent>
      </Popover>
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

  const [busyRkey, setBusyRkey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [newTitle, setNewTitle] = useState("")
  const newInputRef = useRef<HTMLInputElement>(null)
  // Rkeys we already added in this modal session — reflect "Added"
  // immediately, even if the hook's refetch hasn't surfaced the
  // new items[] yet. Same for newly-created lists: keep a tiny
  // preview Map so the row renders right after Create & add and
  // doesn't disappear-then-pop-back when the refetch catches up.
  const [justAdded, setJustAdded] = useState<Set<string>>(new Set())
  const [createdPreviews, setCreatedPreviews] = useState<
    { rkey: string; title: string }[]
  >([])

  const renderedLists = useMemo(() => {
    const seen = new Set<string>(candidates.map((l) => l.rkey))
    const previews = createdPreviews
      .filter((p) => !seen.has(p.rkey))
      .map((p) => ({ rkey: p.rkey, title: p.title }))
    return [
      ...previews,
      ...candidates.map((l) => ({ rkey: l.rkey, title: l.title })),
    ]
  }, [candidates, createdPreviews])

  const alreadyIn = useMemo(() => {
    const out = new Set<string>(justAdded)
    for (const list of candidates) {
      if (list.items.some((it) => it.itemIdentifier.uri === targetUri)) {
        out.add(list.rkey)
      }
    }
    return out
  }, [candidates, justAdded, targetUri])

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
        // Reflect "Added" immediately — the hook's refetch follows
        // but may lag by a tick.
        setJustAdded((prev) => {
          if (prev.has(rkey)) return prev
          const next = new Set(prev)
          next.add(rkey)
          return next
        })
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
        // Optimistic state: preview the new list immediately so it
        // renders in the candidates section, and mark its rkey as
        // already-added so the row shows "Added" right away. Both
        // entries become no-ops once the hook's refetch surfaces
        // the real record (renderedLists dedupes by rkey).
        setCreatedPreviews((prev) =>
          prev.some((p) => p.rkey === rkey) ? prev : [...prev, { rkey, title }],
        )
        setJustAdded((prev) => {
          if (prev.has(rkey)) return prev
          const next = new Set(prev)
          next.add(rkey)
          return next
        })
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
      <AppDialogHeader
        title={`Add ${TYPE_LABEL[targetType]} to a list`}
        onClose={() => !busyRkey && onClose()}
        disabled={!!busyRkey}
      />
      <AppDialogBody className="add-to-list__body">
        {isLoading ? (
          <div className="add-to-list__loading">
            <LoadingSpinner size="sm" />
          </div>
        ) : null}
        {!isLoading && renderedLists.length === 0 && !creating ? (
          <p className="add-to-list__empty">
            You don&rsquo;t have a {TYPE_LABEL[targetType]} list yet.
          </p>
        ) : null}
        {!isLoading && renderedLists.length > 0 ? (
          <ul className="add-to-list__list">
            {renderedLists.map((list) => {
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
            <Input
              ref={newInputRef}
              type="text"
              size="sm"
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
      </AppDialogBody>
    </AppDialog>
  )
}

