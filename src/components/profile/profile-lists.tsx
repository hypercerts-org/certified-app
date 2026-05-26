"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useUrlParam } from "@/hooks/use-url-param"
import { useRemoveAction } from "@/hooks/use-remove-action"
import {
  ArrowLeft,
  ChevronRight,
  ClipboardPaste,
  ListIcon,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react"
import AppDialog, { AppDialogHeader } from "@/components/ui/app-dialog"
import Avatar from "@/components/ui/avatar"
import Button from "@/components/ui/button"
import ConfirmDialog from "@/components/ui/confirm-dialog"
import EmptyState from "@/components/ui/empty-state"
import LoadingSpinner from "@/components/ui/loading-spinner"
import { useAuthorInfo } from "@/hooks/use-author-info"
import { useActivity } from "@/hooks/use-activity"
import { useProject } from "@/hooks/use-project"
import { useTypedLists } from "@/hooks/use-typed-lists"
import { fetchIndexerActivities, INDEXER_PROXY_URL } from "@/lib/atproto/indexer"
import ProjectListRow from "@/components/explore-page/project-list-row"
import {
  ITEM_NSID,
  LIST_ACCOUNTS_TYPE,
  LIST_CERTS_TYPE,
  LIST_PROJECTS_TYPE,
  itemUriMatchesType,
  resolveRecordCid,
  type TypedListRecord,
  type TypedListType,
} from "@/lib/atproto/typed-lists"
import { resolveActivityImageUrl } from "@/lib/atproto/activity"
import { parseAtUri } from "@/lib/atproto/activity-uri"
import { getInitials } from "@/lib/utils/initials"

const SECTIONS: { type: TypedListType; title: string; emptyHint: string }[] = [
  { type: LIST_CERTS_TYPE, title: "Certs", emptyHint: "No cert lists yet." },
  { type: LIST_PROJECTS_TYPE, title: "Projects", emptyHint: "No project lists yet." },
  { type: LIST_ACCOUNTS_TYPE, title: "Accounts", emptyHint: "No account lists yet." },
]

interface ProfileListsProps {
  did: string
  viewerIsOwner: boolean
}

export default function ProfileLists({ did, viewerIsOwner }: ProfileListsProps) {
  const {
    byType,
    isLoading,
    error,
    createList,
    updateList,
    deleteList,
    addItem,
    addManyItems,
    removeItem,
    removeManyItems,
  } = useTypedLists(did)
  // Selection lives in `?list=<rkey>` so a) refreshing keeps you on
  // the same list, b) clicking through to an item and pressing back
  // returns to the detail view rather than the section list, and
  // c) deep-links work. Mirrors the existing `?sub=` pattern on the
  // endorsements + followers tabs.
  //
  // Default mode is "push" so opening a list creates a back-able
  // history entry; specific call sites pass "replace" when the
  // entry shouldn't survive (e.g. after deleting the underlying
  // record).
  const [selectedRkey, setSelectedRkey] = useUrlParam("list", { mode: "push" })
  const router = useRouter()
  const [creating, setCreating] = useState<TypedListType | null>(null)

  // Drop selection if the selected list disappears (deletion, refetch
  // showing it never existed for this DID, etc.).
  const selected = useMemo<TypedListRecord | null>(() => {
    if (!selectedRkey) return null
    for (const type of Object.keys(byType) as TypedListType[]) {
      const hit = byType[type].find((l) => l.rkey === selectedRkey)
      if (hit) return hit
    }
    return null
  }, [byType, selectedRkey])

  useEffect(() => {
    // Lists finished loading and the selected rkey doesn't resolve →
    // clear the param (using replace, since the entry no longer
    // matches anything navigable).
    if (selectedRkey && !selected && !isLoading) setSelectedRkey(null, "replace")
  }, [selectedRkey, selected, isLoading, setSelectedRkey])

  if (isLoading) {
    return (
      <div className="profile-lists__loading">
        <LoadingSpinner size="md" />
      </div>
    )
  }
  if (error) {
    return (
      <div className="feed__warning" role="alert">
        Could not load lists: {error}
      </div>
    )
  }

  if (selected) {
    return (
      <ListDetail
        list={selected}
        viewerIsOwner={viewerIsOwner}
        onBack={() => router.back()}
        onDelete={async () => {
          await deleteList(selected.rkey)
          // Use replace here — the list no longer exists, so the
          // detail-view history entry shouldn't be reachable.
          setSelectedRkey(null, "replace")
        }}
        onEdit={async (title, description) =>
          updateList(selected.rkey, selected.type, title, description)
        }
        onAdd={async (item) => addItem(selected.rkey, selected.type, item)}
        onAddMany={async (items) => addManyItems(selected.rkey, selected.type, items)}
        onRemove={async (uri) => removeItem(selected.rkey, uri)}
        onRemoveMany={async (uris) => removeManyItems(selected.rkey, uris)}
      />
    )
  }

  return (
    <div className="profile-lists">
      {SECTIONS.map((section) => (
        <ListSection
          key={section.type}
          title={section.title}
          emptyHint={section.emptyHint}
          lists={byType[section.type]}
          canCreate={viewerIsOwner}
          onCreate={() => setCreating(section.type)}
          onOpen={(rkey) => setSelectedRkey(rkey)}
        />
      ))}
      {creating ? (
        <CreateListModal
          type={creating}
          onCancel={() => setCreating(null)}
          onSubmit={async (title, description) => {
            const ref = await createList(creating, title, description)
            setCreating(null)
            const rkey = ref.uri.split("/").pop() ?? null
            // push: entering the new list creates a back-able history
            // entry. The same gesture as clicking an existing row.
            if (rkey) setSelectedRkey(rkey)
          }}
        />
      ) : null}
    </div>
  )
}

// ----------------------------- Section -----------------------------

function ListSection({
  title,
  emptyHint,
  lists,
  canCreate,
  onCreate,
  onOpen,
}: {
  title: string
  emptyHint: string
  lists: TypedListRecord[]
  canCreate: boolean
  onCreate: () => void
  onOpen: (rkey: string) => void
}) {
  return (
    <section className="profile-lists__section" aria-label={title}>
      <header className="profile-lists__section-head">
        <h2 className="profile-lists__section-title">{title}</h2>
        {canCreate ? (
          <button
            type="button"
            className="profile-lists__create-btn"
            onClick={onCreate}
            aria-label={`Create new ${title.toLowerCase()}`}
            title="Create a new list"
          >
            <Plus size={16} strokeWidth={1.75} aria-hidden />
          </button>
        ) : null}
      </header>
      {lists.length === 0 ? (
        <p className="profile-lists__empty">{emptyHint}</p>
      ) : (
        <ul className="profile-lists__rows">
          {lists.map((list) => (
            <li key={list.rkey}>
              <button
                type="button"
                className="profile-lists__row"
                onClick={() => onOpen(list.rkey)}
              >
                <span className="profile-lists__row-body">
                  <span className="profile-lists__row-title">{list.title}</span>
                  {list.description ? (
                    <span className="profile-lists__row-desc">{list.description}</span>
                  ) : null}
                </span>
                <span className="profile-lists__row-meta">
                  {list.items.length} item{list.items.length === 1 ? "" : "s"}
                </span>
                <ChevronRight size={16} strokeWidth={1.75} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

// ----------------------------- List detail -----------------------------

function ListDetail({
  list,
  viewerIsOwner,
  onBack,
  onDelete,
  onEdit,
  onAdd,
  onAddMany,
  onRemove,
  onRemoveMany,
}: {
  list: TypedListRecord
  viewerIsOwner: boolean
  onBack: () => void
  onDelete: () => Promise<void>
  onEdit: (title: string, description?: string) => Promise<unknown>
  onAdd: (item: { uri: string; cid: string }) => Promise<unknown>
  onAddMany: (
    items: readonly { uri: string; cid: string }[],
  ) => Promise<unknown>
  onRemove: (uri: string) => Promise<unknown>
  onRemoveMany: (uris: readonly string[]) => Promise<unknown>
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [pasteOpen, setPasteOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  // Bulk-select state. The Set holds item URIs (not rkeys) because
  // `onRemove` keys on URI. Cleaned up below when items disappear
  // out from under us via individual removal or the bulk loop.
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkDeleting, setBulkDeleting] = useState(false)

  // Drop URIs from the selection that no longer exist in items[]
  // (e.g. another tab removed them, or our own bulk loop just
  // finished). Without this the Set would silently leak across
  // refetches.
  useEffect(() => {
    setSelected((prev) => {
      const uris = new Set(list.items.map((it) => it.itemIdentifier.uri))
      let changed = false
      const next = new Set<string>()
      for (const u of prev) {
        if (uris.has(u)) next.add(u)
        else changed = true
      }
      return changed ? next : prev
    })
  }, [list.items])

  const allSelected =
    list.items.length > 0 && selected.size === list.items.length

  const toggleAll = useCallback(() => {
    setSelected((prev) => {
      if (prev.size === list.items.length && list.items.length > 0) {
        // Currently all selected → deselect all.
        return new Set()
      }
      return new Set(list.items.map((it) => it.itemIdentifier.uri))
    })
  }, [list.items])

  const toggleOne = useCallback((uri: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(uri)) next.delete(uri)
      else next.add(uri)
      return next
    })
  }, [])

  const handleDelete = async () => {
    setIsDeleting(true)
    try {
      await onDelete()
    } catch (err) {
      console.error("Failed to delete list:", err)
    } finally {
      setIsDeleting(false)
    }
  }

  const handleBulkDelete = async () => {
    if (selected.size === 0 || bulkDeleting) return
    setBulkDeleting(true)
    try {
      // Single read-modify-write that drops every selected URI in
      // one go — far cheaper than the previous per-item loop
      // (2 round-trips total vs 2 × selected.size).
      await onRemoveMany(Array.from(selected))
    } catch (err) {
      console.error("Failed to bulk-delete items:", err)
    } finally {
      setBulkDeleting(false)
      setSelected(new Set())
    }
  }

  return (
    <section className="profile-lists">
      <header className="profile-lists__detail-head">
        <button
          type="button"
          className="profile-lists__back"
          onClick={onBack}
          aria-label="Back to all lists"
        >
          <ArrowLeft size={16} strokeWidth={1.75} aria-hidden />
        </button>
        <h2 className="profile-lists__detail-title">
          {list.title}
          <span className="profile-lists__detail-count">{list.items.length}</span>
        </h2>
        {viewerIsOwner ? (
          <div className="profile-lists__detail-actions">
            <button
              type="button"
              className="profile-lists__create-btn"
              onClick={() => setAddOpen(true)}
              aria-label="Add items"
              title="Add items"
            >
              <Plus size={16} strokeWidth={1.75} aria-hidden />
            </button>
            <button
              type="button"
              className="profile-lists__create-btn"
              onClick={() => setPasteOpen(true)}
              aria-label="Bulk add by at-URI"
              title="Bulk add by at-URI"
            >
              <ClipboardPaste size={16} strokeWidth={1.75} aria-hidden />
            </button>
            <button
              type="button"
              className="profile-lists__create-btn"
              onClick={() => setEditOpen(true)}
              aria-label="Edit list title and description"
              title="Edit list"
            >
              <Pencil size={16} strokeWidth={1.75} aria-hidden />
            </button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setConfirmingDelete(true)}
              disabled={isDeleting}
            >
              <Trash2 size={14} strokeWidth={1.75} aria-hidden />
              Delete
            </Button>
          </div>
        ) : null}
      </header>
      {list.description ? (
        <p className="profile-lists__detail-desc">{list.description}</p>
      ) : null}
      {list.items.length === 0 ? (
        <EmptyState
          icon={ListIcon}
          title="No items yet"
          description={
            viewerIsOwner
              ? "Click the + to add items."
              : "This list is empty."
          }
        />
      ) : (
        <>
          {viewerIsOwner ? (
            <div
              className="profile-lists__bulk-bar"
              role="toolbar"
              aria-label="Bulk item actions"
            >
              <label className="profile-lists__bulk-select-all">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  disabled={bulkDeleting}
                  aria-label={
                    allSelected ? "Deselect all items" : "Select all items"
                  }
                />
                <span>
                  {allSelected
                    ? "Deselect all"
                    : selected.size > 0
                      ? `${selected.size} selected`
                      : "Select all"}
                </span>
              </label>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleBulkDelete}
                disabled={selected.size === 0 || bulkDeleting}
                loading={bulkDeleting}
              >
                <Trash2 size={14} strokeWidth={1.75} aria-hidden />
                Delete selected{selected.size > 0 ? ` (${selected.size})` : ""}
              </Button>
            </div>
          ) : null}
          <ul className="profile-lists__items">
            {list.items.map((item) => {
              const uri = item.itemIdentifier.uri
              return (
                <li key={uri} className="profile-lists__items-row">
                  {viewerIsOwner ? (
                    <input
                      type="checkbox"
                      className="profile-lists__items-check"
                      checked={selected.has(uri)}
                      onChange={() => toggleOne(uri)}
                      disabled={bulkDeleting}
                      aria-label={`Select ${uri}`}
                    />
                  ) : null}
                  <div className="profile-lists__items-row-body">
                    <ItemRow
                      type={list.type}
                      uri={uri}
                      canRemove={viewerIsOwner}
                      onRemove={() => onRemove(uri)}
                    />
                  </div>
                </li>
              )
            })}
          </ul>
        </>
      )}
      {confirmingDelete ? (
        <ConfirmDialog
          title={`Delete "${list.title}"?`}
          message="The list record is removed from your PDS. Items themselves are not deleted."
          confirmLabel="Delete list"
          cancelLabel="Cancel"
          confirmVariant="destructive"
          isConfirming={isDeleting}
          onConfirm={handleDelete}
          onCancel={() => !isDeleting && setConfirmingDelete(false)}
        />
      ) : null}
      {addOpen ? (
        <AddItemsModal
          type={list.type}
          alreadyIn={new Set(list.items.map((it) => it.itemIdentifier.uri))}
          onAdd={onAdd}
          onClose={() => setAddOpen(false)}
        />
      ) : null}
      {pasteOpen ? (
        <PasteUrisModal
          type={list.type}
          alreadyIn={new Set(list.items.map((it) => it.itemIdentifier.uri))}
          onAddMany={onAddMany}
          onClose={() => setPasteOpen(false)}
        />
      ) : null}
      {editOpen ? (
        <CreateListModal
          mode="edit"
          type={list.type}
          initialTitle={list.title}
          initialDescription={list.description ?? ""}
          onCancel={() => setEditOpen(false)}
          onSubmit={async (title, description) => {
            await onEdit(title, description)
            setEditOpen(false)
          }}
        />
      ) : null}
    </section>
  )
}

// ----------------------------- Item rows -----------------------------

function ItemRow({
  type,
  uri,
  canRemove,
  onRemove,
}: {
  type: TypedListType
  uri: string
  canRemove: boolean
  onRemove: () => Promise<unknown>
}) {
  if (type === LIST_ACCOUNTS_TYPE) {
    return <AccountItemRow uri={uri} canRemove={canRemove} onRemove={onRemove} />
  }
  if (type === LIST_CERTS_TYPE) {
    return <CertItemRow uri={uri} canRemove={canRemove} onRemove={onRemove} />
  }
  return <ProjectItemRow uri={uri} canRemove={canRemove} onRemove={onRemove} />
}

function AccountItemRow({
  uri,
  canRemove,
  onRemove,
}: {
  uri: string
  canRemove: boolean
  onRemove: () => Promise<unknown>
}) {
  // at://<did>/<nsid>/<rkey> — the subject DID is the second segment.
  const did = uri.split("/")[2] ?? null
  const { info } = useAuthorInfo(did)
  const display = info?.displayName || info?.handle || did || "Unknown"
  const initials = getInitials(info?.displayName, did ?? undefined)
  const href = did ? `/profile/${encodeURIComponent(info?.handle || did)}` : null
  return (
    <ItemRowShell
      href={href}
      avatar={
        <Avatar
          size="sm"
          src={info?.avatarUrl ?? undefined}
          alt=""
          fallbackInitials={initials}
        />
      }
      title={display}
      subtitle={info?.handle && info.handle !== info.did ? `@${info.handle}` : null}
      canRemove={canRemove}
      onRemove={onRemove}
    />
  )
}

function CertItemRow({
  uri,
  canRemove,
  onRemove,
}: {
  uri: string
  canRemove: boolean
  onRemove: () => Promise<unknown>
}) {
  const parsed = parseAtUri(uri)
  const { activity } = useActivity(parsed?.did ?? null, parsed?.rkey ?? null)
  const title =
    typeof activity?.value.title === "string" && activity.value.title.length > 0
      ? activity.value.title
      : "Untitled cert"
  const imageUrl =
    activity?.value.image && parsed
      ? resolveActivityImageUrl(activity.value.image, parsed.did)
      : null
  const href = parsed
    ? `/activity/${encodeURIComponent(parsed.did)}/${encodeURIComponent(parsed.rkey)}`
    : null
  return (
    <ItemRowShell
      href={href}
      avatar={
        imageUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={imageUrl} alt="" className="profile-lists__thumb" />
        ) : (
          <span className="profile-lists__thumb profile-lists__thumb--placeholder" />
        )
      }
      title={title}
      subtitle={null}
      canRemove={canRemove}
      onRemove={onRemove}
    />
  )
}

function ProjectItemRow({
  uri,
  canRemove,
  onRemove,
}: {
  uri: string
  canRemove: boolean
  onRemove: () => Promise<unknown>
}) {
  const parsed = parseAtUri(uri)
  const { project, isLoading } = useProject(parsed?.did ?? null, parsed?.rkey ?? null)
  const { removing, handleRemove } = useRemoveAction(onRemove)

  // While the project record is still loading, render a slim
  // placeholder shell so the row doesn't collapse and shift the
  // surrounding layout. Real height of `cert-list-row` is ~60px.
  if (!project) {
    return (
      <div className="profile-lists__project profile-lists__project--loading">
        <span className="profile-lists__project-skel" aria-hidden />
        {canRemove ? (
          <button
            type="button"
            className="profile-lists__item-remove"
            onClick={handleRemove}
            disabled={removing || isLoading}
            aria-label="Remove project"
          >
            <X size={14} strokeWidth={2} aria-hidden />
          </button>
        ) : null}
      </div>
    )
  }

  return (
    <div className="profile-lists__project">
      <div className="profile-lists__project-row">
        <ProjectListRow project={project} />
      </div>
      {canRemove ? (
        <button
          type="button"
          className="profile-lists__item-remove"
          onClick={handleRemove}
          disabled={removing}
          aria-label={`Remove ${project.value.title ?? "project"}`}
        >
          <X size={14} strokeWidth={2} aria-hidden />
        </button>
      ) : null}
    </div>
  )
}

function ItemRowShell({
  href,
  avatar,
  title,
  subtitle,
  canRemove,
  onRemove,
}: {
  href: string | null
  avatar: React.ReactNode
  title: string
  subtitle: string | null
  canRemove: boolean
  onRemove: () => Promise<unknown>
}) {
  const { removing, handleRemove } = useRemoveAction(onRemove)
  const body = (
    <>
      {avatar}
      <span className="profile-lists__item-body">
        <span className="profile-lists__item-title">{title}</span>
        {subtitle ? (
          <span className="profile-lists__item-subtitle">{subtitle}</span>
        ) : null}
      </span>
    </>
  )
  return (
    <div className="profile-lists__item">
      {href ? (
        <Link href={href} className="profile-lists__item-link">
          {body}
        </Link>
      ) : (
        <div className="profile-lists__item-link">{body}</div>
      )}
      {canRemove ? (
        <button
          type="button"
          className="profile-lists__item-remove"
          onClick={handleRemove}
          disabled={removing}
          aria-label={`Remove ${title}`}
        >
          <X size={14} strokeWidth={2} aria-hidden />
        </button>
      ) : null}
    </div>
  )
}

// ----------------------------- Create / edit modal -----------------------------

function CreateListModal({
  mode = "create",
  type,
  initialTitle = "",
  initialDescription = "",
  onSubmit,
  onCancel,
}: {
  /** `"create"` (default) shows the Create wording; `"edit"` swaps in
   *  the Save wording and pre-fills the title + description. The
   *  underlying form chrome is identical so both modes read as the
   *  same UI surface. */
  mode?: "create" | "edit"
  type: TypedListType
  initialTitle?: string
  initialDescription?: string
  onSubmit: (title: string, description?: string) => Promise<void>
  onCancel: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [title, setTitle] = useState(initialTitle)
  const [description, setDescription] = useState(initialDescription)
  const [isWriting, setIsWriting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isWriting || !title.trim()) return
    setIsWriting(true)
    setError(null)
    try {
      await onSubmit(title.trim(), description.trim() || undefined)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : mode === "edit"
            ? "Failed to save list"
            : "Failed to create list",
      )
      setIsWriting(false)
    }
  }

  const titleCopy = mode === "edit" ? `Edit ${LABELS[type]} list` : `Create ${LABELS[type]} list`
  const submitCopy = mode === "edit" ? "Save" : "Create list"

  return (
    <AppDialog
      ariaLabel={titleCopy}
      maxWidth={460}
      onClose={() => !isWriting && onCancel()}
      disableBackdropClose={isWriting}
    >
      <AppDialogHeader
        title={titleCopy}
        onClose={() => !isWriting && onCancel()}
        disabled={isWriting}
      />
      <form className="signin-modal__body profile-lists__create-form" onSubmit={submit}>
        <label className="profile-lists__create-field">
          <span className="profile-lists__create-label">Name</span>
          <input
            ref={inputRef}
            className="profile-lists__create-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            disabled={isWriting}
            placeholder="e.g. Favourite work"
            required
          />
        </label>
        <label className="profile-lists__create-field">
          <span className="profile-lists__create-label">Description (optional)</span>
          <textarea
            className="profile-lists__create-textarea"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={500}
            rows={3}
            disabled={isWriting}
          />
        </label>
        {error ? (
          <p className="profile-lists__create-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="profile-lists__create-actions">
          <Button type="button" variant="ghost" onClick={onCancel} disabled={isWriting}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={isWriting} disabled={isWriting || !title.trim()}>
            {submitCopy}
          </Button>
        </div>
      </form>
    </AppDialog>
  )
}

const LABELS: Record<TypedListType, string> = {
  "list:certs": "certs",
  "list:projects": "projects",
  "list:accounts": "accounts",
}

// ----------------------------- Add-items modal -----------------------------

interface SearchResult {
  uri: string
  cid: string
  title: string
  subtitle?: string | null
  imageUrl?: string | null
  avatarUrl?: string | null
  initials?: string | null
}

// ----------------------------- Bulk-paste modal -----------------------------

interface ParseRow {
  uri: string
  status: "pending" | "writing" | "added" | "already" | "wrong-type" | "missing" | "error"
  message?: string
}

function PasteUrisModal({
  type,
  alreadyIn,
  onAddMany,
  onClose,
}: {
  type: TypedListType
  alreadyIn: Set<string>
  onAddMany: (
    items: readonly { uri: string; cid: string }[],
  ) => Promise<unknown>
  onClose: () => void
}) {
  const [raw, setRaw] = useState("")
  const [rows, setRows] = useState<ParseRow[]>([])
  const [running, setRunning] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  const handleRun = useCallback(async () => {
    if (running) return
    // Accept commas, newlines, and whitespace as separators so users
    // can paste a list of URIs from any reasonable source without
    // hand-formatting it. Dedupe within the input.
    // Accept bare actor URIs (`at://did:plc:…`) in the accounts list:
    // the profile record is conventionally `app.certified.actor.profile/self`,
    // so any URI that ends at the DID gets normalized to the full
    // record path before validation. For certs / projects the rkey
    // is record-specific so we leave those URIs untouched.
    const normalize = (uri: string): string => {
      if (type !== LIST_ACCOUNTS_TYPE) return uri
      const m = uri.match(/^at:\/\/(did:[a-z0-9]+:[a-z0-9-]+)\/?$/)
      return m ? `at://${m[1]}/${ITEM_NSID[LIST_ACCOUNTS_TYPE]}/self` : uri
    }

    const parsed = Array.from(
      new Set(
        raw
          .split(/[\s,]+/)
          .map((s) => s.trim())
          .filter(Boolean)
          .map(normalize),
      ),
    )
    if (parsed.length === 0) return

    const initial: ParseRow[] = parsed.map((uri) => {
      if (!uri.startsWith("at://")) {
        return { uri, status: "error", message: "Not an at:// URI" }
      }
      if (!itemUriMatchesType(uri, type)) {
        return { uri, status: "wrong-type", message: `Doesn't match ${ITEM_NSID[type]}` }
      }
      if (alreadyIn.has(uri)) {
        return { uri, status: "already", message: "Already in list" }
      }
      return { uri, status: "pending" }
    })
    setRows(initial)
    setRunning(true)

    // Phase 1: parallel CID resolution. Each row flips to "writing"
    // as its lookup starts, then either "missing" (no record) or
    // stays writeable. This is the long pole — CID resolution is
    // a PDS round-trip per URI but the requests fan out in parallel.
    const writable = initial.filter((r) => r.status === "pending")
    const resolved = await Promise.all(
      writable.map(async (row) => {
        setRows((prev) =>
          prev.map((r) =>
            r.uri === row.uri ? { ...r, status: "writing" } : r,
          ),
        )
        try {
          const cid = await resolveRecordCid(row.uri)
          if (!cid) {
            setRows((prev) =>
              prev.map((r) =>
                r.uri === row.uri
                  ? { ...r, status: "missing", message: "Record not found on PDS" }
                  : r,
              ),
            )
            return null
          }
          return { uri: row.uri, cid }
        } catch (err) {
          setRows((prev) =>
            prev.map((r) =>
              r.uri === row.uri
                ? {
                    ...r,
                    status: "error",
                    message: err instanceof Error ? err.message : "Lookup failed",
                  }
                : r,
            ),
          )
          return null
        }
      }),
    )

    // Phase 2: single bulk append. One getRecord + one putRecord on
    // the list, regardless of how many items got resolved — much
    // cheaper than the prior per-item RMW loop. If the swap fails
    // (concurrent edit), every row that would've been added is
    // marked error so the viewer can retry.
    const validItems = resolved.filter(
      (r): r is { uri: string; cid: string } => r !== null,
    )
    if (validItems.length > 0) {
      try {
        await onAddMany(validItems)
        const validUris = new Set(validItems.map((it) => it.uri))
        setRows((prev) =>
          prev.map((r) =>
            validUris.has(r.uri)
              ? { ...r, status: "added", message: undefined }
              : r,
          ),
        )
      } catch (err) {
        const message = err instanceof Error ? err.message : "Add failed"
        const validUris = new Set(validItems.map((it) => it.uri))
        setRows((prev) =>
          prev.map((r) =>
            validUris.has(r.uri) ? { ...r, status: "error", message } : r,
          ),
        )
      }
    }
    setRunning(false)
  }, [alreadyIn, onAddMany, raw, running, type])

  return (
    <AppDialog
      ariaLabel="Bulk add by at-URI"
      maxWidth={600}
      onClose={() => !running && onClose()}
      disableBackdropClose={running}
    >
      <AppDialogHeader
        title="Bulk add by at-URI"
        onClose={() => !running && onClose()}
        disabled={running}
      />
      <div className="signin-modal__body profile-lists__paste-body">
        <p className="profile-lists__paste-help">
          Paste at-URIs separated by commas, newlines, or spaces.
          Only items matching{" "}
          <code className="profile-lists__paste-nsid">{ITEM_NSID[type]}</code>{" "}
          will be added.
          {type === LIST_ACCOUNTS_TYPE ? (
            <>
              {" "}For accounts a bare{" "}
              <code className="profile-lists__paste-nsid">at://did:plc:…</code>{" "}
              is also accepted — we&rsquo;ll expand it to the profile record.
            </>
          ) : null}
        </p>
        <textarea
          ref={textareaRef}
          className="profile-lists__paste-textarea"
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          rows={6}
          placeholder="at://did:plc:…/…/abc123, at://did:plc:…/…/def456, …"
          disabled={running}
        />
        {rows.length > 0 ? (
          <>
            <PasteProgress rows={rows} running={running} />
            <ul className="profile-lists__paste-results" aria-live="polite">
              {rows.map((r) => (
                <li key={r.uri} className={`profile-lists__paste-row profile-lists__paste-row--${r.status}`}>
                  <span className="profile-lists__paste-status">{statusLabel(r.status)}</span>
                  <code className="profile-lists__paste-uri">{r.uri}</code>
                  {r.message ? (
                    <span className="profile-lists__paste-message">{r.message}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          </>
        ) : null}
        <div className="profile-lists__paste-actions">
          <Button type="button" variant="ghost" onClick={onClose} disabled={running}>
            {rows.some((r) => r.status === "added") ? "Done" : "Cancel"}
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={handleRun}
            loading={running}
            disabled={running || raw.trim().length === 0}
          >
            Add
          </Button>
        </div>
      </div>
    </AppDialog>
  )
}

function statusLabel(s: ParseRow["status"]): string {
  switch (s) {
    case "pending":
      return "Pending"
    case "writing":
      return "Writing…"
    case "added":
      return "Added"
    case "already":
      return "Already in"
    case "wrong-type":
      return "Wrong type"
    case "missing":
      return "Not found"
    case "error":
      return "Error"
  }
}

/**
 * Overall progress strip above the per-row results list. Shows a
 * spinner + "N of M done" while the run is in flight, and a filled
 * progress bar that animates from 0% → 100%. After the loop ends
 * the spinner drops; the counter stays so the viewer has a record
 * of what landed. `aria-live="polite"` so screen readers get
 * progress updates without the page yanking focus around.
 */
function PasteProgress({
  rows,
  running,
}: {
  rows: ParseRow[]
  running: boolean
}) {
  const total = rows.length
  // "Resolved" = anything that's no longer pending / writing. Counts
  // every terminal state (added / already / wrong-type / missing /
  // error) so the bar fills as the loop progresses regardless of
  // whether each row succeeded.
  const resolved = rows.filter(
    (r) => r.status !== "pending" && r.status !== "writing",
  ).length
  const added = rows.filter((r) => r.status === "added").length
  const percent = total === 0 ? 0 : Math.round((resolved / total) * 100)
  return (
    <div className="profile-lists__paste-progress" aria-live="polite">
      <div className="profile-lists__paste-progress-row">
        {running ? (
          <LoadingSpinner size="sm" />
        ) : null}
        <span className="profile-lists__paste-progress-label">
          {running
            ? `Adding ${resolved} of ${total}…`
            : `${added} of ${total} added`}
        </span>
        <span className="profile-lists__paste-progress-percent">{percent}%</span>
      </div>
      <div
        className="profile-lists__paste-progress-bar"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={resolved}
      >
        <div
          className="profile-lists__paste-progress-bar-fill"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  )
}

function AddItemsModal({
  type,
  alreadyIn,
  onAdd,
  onClose,
}: {
  type: TypedListType
  alreadyIn: Set<string>
  onAdd: (item: { uri: string; cid: string }) => Promise<unknown>
  onClose: () => void
}) {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [addingUri, setAddingUri] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Debounced search keyed by query. Empty query clears results
  // immediately rather than firing a "show me everything" request.
  useEffect(() => {
    const trimmed = query.trim()
    if (trimmed.length === 0) {
      setResults([])
      setSearching(false)
      setError(null)
      return
    }
    setSearching(true)
    const controller = new AbortController()
    const handle = window.setTimeout(async () => {
      try {
        const next = await runSearch(type, trimmed, controller.signal)
        if (controller.signal.aborted) return
        setResults(next)
        setError(null)
      } catch (err) {
        if (controller.signal.aborted) return
        setError(err instanceof Error ? err.message : "Search failed")
        setResults([])
      } finally {
        if (!controller.signal.aborted) setSearching(false)
      }
    }, 250)
    return () => {
      controller.abort()
      window.clearTimeout(handle)
    }
  }, [type, query])

  const handleAdd = async (result: SearchResult) => {
    if (addingUri) return
    setAddingUri(result.uri)
    try {
      // Bluesky's actor search doesn't return profile-record CIDs, so
      // for account-list items we resolve the CID on click before
      // writing the strongRef. Cert + project searches already carry
      // the CID inline from the indexer.
      const cid = result.cid || (await resolveRecordCid(result.uri))
      if (!cid) throw new Error("Couldn't resolve record CID")
      await onAdd({ uri: result.uri, cid })
    } catch (err) {
      console.error("Failed to add item:", err)
      setError(err instanceof Error ? err.message : "Failed to add item")
    } finally {
      setAddingUri(null)
    }
  }

  return (
    <AppDialog
      ariaLabel={`Add ${LABELS[type]} to list`}
      maxWidth={520}
      onClose={onClose}
    >
      <AppDialogHeader
        title={`Add ${LABELS[type]} to list`}
        onClose={onClose}
      />
      <div className="signin-modal__body profile-lists__add-body">
        <label className="profile-lists__add-search">
          <Search size={14} strokeWidth={1.75} aria-hidden />
          <input
            ref={inputRef}
            className="profile-lists__add-input"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={SEARCH_PLACEHOLDERS[type]}
          />
        </label>
        {error ? (
          <p className="profile-lists__add-error" role="alert">
            {error}
          </p>
        ) : null}
        {searching ? (
          <div className="profile-lists__add-spinner">
            <LoadingSpinner size="sm" />
          </div>
        ) : query.trim() && results.length === 0 ? (
          <p className="profile-lists__add-empty">No matches.</p>
        ) : results.length > 0 ? (
          <ul className="profile-lists__add-results">
            {results.map((r) => {
              const isIn = alreadyIn.has(r.uri)
              return (
                <li key={r.uri}>
                  <div className="profile-lists__add-row">
                    <span className="profile-lists__add-avatar">
                      {r.imageUrl ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img src={r.imageUrl} alt="" className="profile-lists__thumb" />
                      ) : type === LIST_ACCOUNTS_TYPE ? (
                        <Avatar
                          size="sm"
                          src={r.avatarUrl ?? undefined}
                          alt=""
                          fallbackInitials={r.initials ?? ""}
                        />
                      ) : (
                        <span className="profile-lists__thumb profile-lists__thumb--placeholder" />
                      )}
                    </span>
                    <span className="profile-lists__add-body">
                      <span className="profile-lists__add-title">{r.title}</span>
                      {r.subtitle ? (
                        <span className="profile-lists__add-subtitle">{r.subtitle}</span>
                      ) : null}
                    </span>
                    <Button
                      type="button"
                      variant={isIn ? "ghost" : "primary"}
                      size="sm"
                      onClick={() => handleAdd(r)}
                      loading={addingUri === r.uri}
                      disabled={isIn || (!!addingUri && addingUri !== r.uri)}
                    >
                      {isIn ? "Added" : "Add"}
                    </Button>
                  </div>
                </li>
              )
            })}
          </ul>
        ) : null}
      </div>
    </AppDialog>
  )
}

const SEARCH_PLACEHOLDERS: Record<TypedListType, string> = {
  "list:certs": "Search certs by title",
  "list:projects": "Search projects by title",
  "list:accounts": "Search accounts by handle or name",
}

// ----------------------------- Search drivers -----------------------------

async function runSearch(
  type: TypedListType,
  query: string,
  signal: AbortSignal,
): Promise<SearchResult[]> {
  if (type === LIST_ACCOUNTS_TYPE) return searchAccounts(query, signal)
  if (type === LIST_CERTS_TYPE) return searchCerts(query, signal)
  return searchProjects(query, signal)
}

async function searchAccounts(query: string, signal: AbortSignal): Promise<SearchResult[]> {
  const res = await fetch(
    `/api/search-actors?q=${encodeURIComponent(query)}&limit=10`,
    { signal },
  )
  if (!res.ok) throw new Error(`Account search failed: ${res.status}`)
  const data = (await res.json()) as {
    actors?: { did?: string; handle?: string; displayName?: string; avatar?: string }[]
  }
  const out: SearchResult[] = []
  for (const a of data.actors ?? []) {
    if (!a.did) continue
    // app.certified.actor.profile records use the literal rkey "self" —
    // the at:// for an account-list item is at://<did>/app.certified.actor.profile/self.
    // Bluesky's actor search doesn't expose profile-record CIDs; we
    // emit an empty placeholder and let `handleAdd` resolve the real
    // CID on click via the shared `resolveRecordCid` helper before
    // the strongRef is written. Keeps the typeahead fast — no per-
    // result PDS round-trip — and writes never use an unsigned CID.
    out.push({
      uri: `at://${a.did}/${ITEM_NSID["list:accounts"]}/self`,
      cid: "",
      title: a.displayName || a.handle || a.did,
      subtitle: a.handle ? `@${a.handle}` : null,
      avatarUrl: a.avatar ?? null,
      initials: getInitials(a.displayName, a.did),
    })
  }
  return out
}

async function searchCerts(query: string, signal: AbortSignal): Promise<SearchResult[]> {
  const result = await fetchIndexerActivities({
    first: 10,
    search: query,
    signal,
  })
  const out: SearchResult[] = []
  for (const rec of result.records) {
    const parsed = parseAtUri(rec.uri)
    const imageUrl =
      rec.value.image && parsed
        ? resolveActivityImageUrl(rec.value.image, parsed.did)
        : null
    out.push({
      uri: rec.uri,
      cid: rec.cid,
      title:
        typeof rec.value.title === "string" && rec.value.title.length > 0
          ? rec.value.title
          : "Untitled cert",
      subtitle: null,
      imageUrl,
    })
  }
  return out
}

interface ProjectsResponse {
  data?: {
    orgHypercertsCollection?: {
      edges: {
        node: {
          uri: string
          cid: string
          title: string | null
          shortDescription: string | null
        } | null
      }[]
    } | null
  } | null
}

async function searchProjects(query: string, signal: AbortSignal): Promise<SearchResult[]> {
  const res = await fetch(INDEXER_PROXY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      operationName: "Projects",
      variables: { first: 10, after: null, authors: null, search: query },
    }),
    signal,
  })
  if (!res.ok) throw new Error(`Project search failed: ${res.status}`)
  const json = (await res.json()) as ProjectsResponse
  const out: SearchResult[] = []
  for (const edge of json.data?.orgHypercertsCollection?.edges ?? []) {
    if (!edge.node) continue
    out.push({
      uri: edge.node.uri,
      cid: edge.node.cid,
      title: edge.node.title?.trim() || "Untitled project",
      subtitle: edge.node.shortDescription || null,
    })
  }
  return out
}

