"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Copy, ListPlus, Pencil, Plus, Share2, Trash2 } from "lucide-react"
import AppDialog, { AppDialogHeader, AppDialogBody } from "@/components/ui/app-dialog"
import type { PageRecordEditActions } from "@/lib/navbar-context"
import Button from "@/components/ui/button"
import Input from "@/components/ui/input"
import LoadingSpinner from "@/components/ui/loading-spinner"
import MoreActionsMenu, { type MoreActionsEntry } from "@/components/lists/more-actions-menu"
import { useAuth } from "@/lib/auth/auth-context"
import { caughtErrorMessage } from "@/lib/utils/user-error"
import { recordUrlFromAtUri, rkeyFromUri } from "@/lib/urls"
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard"
import { useTypedLists } from "@/hooks/use-typed-lists"
import {
  itemUriMatchesType,
  resolveRecordCid,
  resolveAccountProfileRef,
  LIST_ACCOUNTS_TYPE,
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
  /** When this menu acts on the record of the page the viewer is
   *  currently on AND that page is showing a sub-tab, pass the tab key
   *  (e.g. "updates") so the Share link deep-links straight to that tab.
   *  Omit / pass null on the overview or on surfaces (feed cards, the
   *  profile sidebar) where the page tab is unrelated to this record. */
  shareTab?: string | null
  /** List Share in the menu (default). The record pages show a visible
   *  Share button beside the menu, so they turn this off. */
  showShare?: boolean
  /** Edit / Delete for the record owner. The activity overview headline
   *  routes its inline Edit/Delete into this menu on mobile (the navbar's
   *  three-dot menu) so they sit beside Share. Omitted when the viewer
   *  can't edit the record. */
  editActions?: PageRecordEditActions | null
  /** The public pages' header button (a bordered icon button with
   *  horizontal dots, like the profile's More); the quiet vertical dots
   *  elsewhere (the navbar). */
  trigger?: "header" | "quiet"
  /** The record's name: the menu's sheet title on phones. */
  title?: string
}

/**
 * A record's "More actions" menu (`<MoreActionsMenu>`: a popover menu
 * from 800px, a sheet titled with the record's name below): Edit, Share,
 * "Add to list" (a modal with the viewer's lists of the matching type and
 * an inline "Create a new list"), "Copy Permanent ID", then Delete.
 * Renders nothing when the target URI doesn't match the lexicon the list
 * type expects (defensive: surfaces a programming error rather than
 * silently writing a malformed strongRef).
 */
export default function AddToListMenu({
  targetUri,
  targetCid,
  targetType,
  shareTab = null,
  showShare = true,
  editActions = null,
  trigger = "quiet",
  title = "More actions",
}: AddToListMenuProps) {
  const router = useRouter()
  const { did: viewerDid, openSignIn } = useAuth()
  const [open, setOpen] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  // One shared-hook instance per copy target so each menu item shows its
  // own "Copied" label; the hook auto-resets the flags.
  const { copied: shareCopied, copy: copyShare } = useCopyToClipboard()
  const { copied: uriCopied, copy: copyUri } = useCopyToClipboard()

  // DID-based web path for sharing — recordUrlFromAtUri maps the
  // collection to its friendly route segment and defaults to the URI's
  // DID, so the link survives handle changes and never breaks. Null for
  // collections without a record page (e.g. account profiles), which
  // scopes the Share item to activities and projects. The absolute
  // origin is prepended at click time from window.location, so the copied
  // link is correct in every environment (the PUBLIC_URL env isn't
  // inlined into the client bundle).
  const sharePath = useMemo(() => {
    const base = recordUrlFromAtUri(targetUri)
    if (!base) return base
    // Deep-link the share to the tab the viewer is currently on, so the
    // recipient lands on the same view (Updates, Activities, …).
    return shareTab ? `${base}?tab=${encodeURIComponent(shareTab)}` : base
  }, [targetUri, shareTab])

  // Keep the popover open briefly after a successful copy so the user
  // sees the confirmation, then auto-close. Driven off the hook's copied
  // flags — the hook swallows clipboard failures (flag stays false), so
  // a failed copy leaves the popover open.
  const anyCopied = shareCopied || uriCopied
  useEffect(() => {
    if (!anyCopied) return
    const t = window.setTimeout(() => setOpen(false), 900)
    return () => window.clearTimeout(t)
  }, [anyCopied])

  // Shown to logged-out viewers too: "Copy Permanent ID" works without auth,
  // and "Add to list" funnels them to sign-in. Only the URI→type guard
  // can hide the menu (defensive against a malformed strongRef).
  if (!itemUriMatchesType(targetUri, targetType)) return null

  const entries: MoreActionsEntry[] = []
  if (editActions?.isCreator) {
    entries.push({
      key: "edit",
      label: "Edit",
      icon: Pencil,
      onSelect: () => router.push(editActions.editHref),
    })
  } else if (editActions?.editAsGroupLabel) {
    entries.push({
      key: "edit-as-group",
      label: `Edit as ${editActions.editAsGroupLabel}`,
      icon: Pencil,
      onSelect: () => editActions.onEditAsGroup(),
    })
  }
  if (sharePath && showShare) {
    entries.push({
      key: "share",
      label: shareCopied ? "Link copied" : "Share",
      icon: Share2,
      keepOpen: true,
      onSelect: () => void copyShare(`${window.location.origin}${sharePath}`),
    })
  }
  entries.push(
    {
      key: "add-to-list",
      label: "Add to list",
      icon: ListPlus,
      // Logged-out viewers can't write to a PDS: send them to sign-in
      // instead of opening an unusable modal.
      onSelect: () => (viewerDid ? setModalOpen(true) : openSignIn()),
    },
    {
      key: "copy-id",
      // The record's at:// address, named as on the profile's menu.
      label: uriCopied ? "Permanent ID copied" : "Copy Permanent ID",
      icon: Copy,
      keepOpen: true,
      onSelect: () => void copyUri(targetUri),
    },
  )
  // Delete last, after a separator and in red, as in the Records rows.
  if (editActions?.isCreator) {
    entries.push(
      { kind: "separator", key: "sep" },
      {
        key: "delete",
        label: "Delete",
        icon: Trash2,
        destructive: true,
        onSelect: () => editActions.onDelete(),
      },
    )
  }

  return (
    <>
      <MoreActionsMenu
        open={open}
        onOpenChange={setOpen}
        title={title}
        entries={entries}
        trigger={trigger}
      />
      <span className="sr-only" aria-live="polite">
        {shareCopied ? "Link copied" : uriCopied ? "Permanent ID copied" : ""}
      </span>
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

export function AddToListModal({
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

  // Resolve the strongRef to add. For accounts we accept either profile
  // lexicon: try the Certified profile, then fall back to the Bluesky
  // profile — callers always hand us the Certified URI, but a member who
  // only has a bsky profile must still be addable. Other types resolve
  // their single record directly.
  const resolveTargetRef = useCallback(async (): Promise<{
    uri: string
    cid: string
  } | null> => {
    if (targetCid) return { uri: targetUri, cid: targetCid }
    if (targetType === LIST_ACCOUNTS_TYPE) {
      const did = targetUri.split("/")[2]
      return did ? resolveAccountProfileRef(did) : null
    }
    const cid = await resolveRecordCid(targetUri)
    return cid ? { uri: targetUri, cid } : null
  }, [targetCid, targetUri, targetType])

  const handleAdd = useCallback(
    async (rkey: string) => {
      if (busyRkey) return
      setBusyRkey(rkey)
      setError(null)
      try {
        const targetRef = await resolveTargetRef()
        if (!targetRef) throw new Error("Couldn't resolve record CID")
        await addItem(rkey, targetType, targetRef)
        // Reflect "Added" immediately — the hook's refetch follows
        // but may lag by a tick.
        setJustAdded((prev) => {
          if (prev.has(rkey)) return prev
          const next = new Set(prev)
          next.add(rkey)
          return next
        })
      } catch (err) {
        setError(caughtErrorMessage(err, "Couldn't add it to the list. Try again in a moment"))
      } finally {
        setBusyRkey(null)
      }
    },
    [addItem, busyRkey, resolveTargetRef, targetType],
  )

  const handleCreateAndAdd = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      const title = newTitle.trim()
      if (!title || busyRkey) return
      setBusyRkey("__new__")
      setError(null)
      try {
        const targetRef = await resolveTargetRef()
        if (!targetRef) throw new Error("Couldn't resolve record CID")
        const ref = await createList(targetType, title)
        const rkey = rkeyFromUri(ref.uri)
        if (!rkey) throw new Error("New list missing rkey")
        await addItem(rkey, targetType, targetRef)
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
        setError(caughtErrorMessage(err, "Couldn't create the list. Try again in a moment"))
      } finally {
        setBusyRkey(null)
      }
    },
    [addItem, busyRkey, createList, newTitle, resolveTargetRef, targetType],
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
            You don&apos;t have a {TYPE_LABEL[targetType]} list yet.
          </p>
        ) : null}
        {!isLoading && renderedLists.length > 0 ? (
          <ul className="add-to-list__list">
            {renderedLists.map((list) => {
              const isIn = alreadyIn.has(list.rkey)
              const isBusy = busyRkey === list.rkey
              return (
                <li key={list.rkey} className="add-to-list__row">
                  <span className="add-to-list__row-title" dir="auto">{list.title}</span>
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
              aria-label="New list name"
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
          <Button
            variant="ghost"
            size="sm"
            className="add-to-list__create-btn"
            onClick={() => setCreating(true)}
            disabled={!!busyRkey}
          >
            <Plus size={14} aria-hidden />
            Create a new list
          </Button>
        )}
      </AppDialogBody>
    </AppDialog>
  )
}

