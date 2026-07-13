"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { profileUrl, recordUrl } from "@/lib/urls"
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
  Trash2,
  X,
} from "lucide-react"
import Avatar from "@/components/ui/avatar"
import Button from "@/components/ui/button"
import ConfirmDialog from "@/components/ui/confirm-dialog"
import EmptyState from "@/components/ui/empty-state"
import LoadingSpinner from "@/components/ui/loading-spinner"
import Tooltip from "@/components/ui/tooltip"
import { useAuthorInfo } from "@/hooks/use-author-info"
import { useActivity } from "@/hooks/use-activity"
import { useProject } from "@/hooks/use-project"
import { useTypedLists } from "@/hooks/use-typed-lists"
import ProjectListRow from "@/components/explore-page/project-list-row"
import {
  AddItemsModal,
  CreateListModal,
  PasteUrisModal,
} from "@/components/profile/list-modals"
import {
  LIST_ACCOUNTS_TYPE,
  LIST_CERTS_TYPE,
  LIST_PROJECTS_TYPE,
  type TypedListRecord,
  type TypedListType,
} from "@/lib/atproto/typed-lists"
import { resolveActivityImageUrl } from "@/lib/atproto/activity"
import { parseAtUri } from "@/lib/atproto/activity-uri"
import { getInitials } from "@/lib/utils/initials"

const SECTIONS: { type: TypedListType; title: string; emptyHint: string }[] = [
  { type: LIST_CERTS_TYPE, title: "Activities", emptyHint: "No activity lists yet." },
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
          <Tooltip label="Create a new list">
            <button
              type="button"
              className="profile-lists__create-btn"
              onClick={onCreate}
              aria-label={`Create new ${title.toLowerCase()}`}
            >
              <Plus size={16} strokeWidth={1.75} aria-hidden />
            </button>
          </Tooltip>
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
        <Tooltip label="Back to all lists">
          <button
            type="button"
            className="profile-lists__back"
            onClick={onBack}
            aria-label="Back to all lists"
          >
            <ArrowLeft size={16} strokeWidth={1.75} aria-hidden />
          </button>
        </Tooltip>
        <h2 className="profile-lists__detail-title">
          {list.title}
          <span className="profile-lists__detail-count">{list.items.length}</span>
        </h2>
        {viewerIsOwner ? (
          <div className="profile-lists__detail-actions">
            <Tooltip label="Add items">
              <button
                type="button"
                className="profile-lists__create-btn"
                onClick={() => setAddOpen(true)}
                aria-label="Add items"
              >
                <Plus size={16} strokeWidth={1.75} aria-hidden />
              </button>
            </Tooltip>
            <Tooltip label="Bulk add by at-URI">
              <button
                type="button"
                className="profile-lists__create-btn"
                onClick={() => setPasteOpen(true)}
                aria-label="Bulk add by at-URI"
              >
                <ClipboardPaste size={16} strokeWidth={1.75} aria-hidden />
              </button>
            </Tooltip>
            <Tooltip label="Edit list">
              <button
                type="button"
                className="profile-lists__create-btn"
                onClick={() => setEditOpen(true)}
                aria-label="Edit list title and description"
              >
                <Pencil size={16} strokeWidth={1.75} aria-hidden />
              </button>
            </Tooltip>
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
            {list.items.map((item, index) => {
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
                      aria-label={`Select item ${index + 1}`}
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
  const initials = getInitials(info?.displayName, info?.handle ?? did ?? undefined)
  const href = did ? profileUrl(info?.handle || did) : null
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
      : "Untitled activity"
  const imageUrl =
    activity?.value.image && parsed
      ? resolveActivityImageUrl(activity.value.image, parsed.did)
      : null
  const href = parsed
    ? recordUrl(parsed.did, "activity", parsed.rkey)
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

export function ProjectItemRow({
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
  if (isLoading) {
    return (
      <div className="profile-lists__project profile-lists__project--loading">
        <span className="profile-lists__project-skel" aria-hidden />
        {canRemove ? (
          <Tooltip label="Remove project">
            <button
              type="button"
              className="profile-lists__item-remove"
              onClick={handleRemove}
              disabled={removing}
              aria-label="Remove project"
            >
              <X size={14} strokeWidth={2} aria-hidden />
            </button>
          </Tooltip>
        ) : null}
      </div>
    )
  }

  // Loading finished but the record didn't resolve (404 / error /
  // malformed URI). Instead of a permanent skeleton, show a terminal
  // fallback row — the URI's rkey tail if we have one, else a generic
  // label — and keep the remove button so owners can still drop the
  // dangling reference. Mirrors the cert/account variants' "Untitled
  // cert" / "Unknown" fallbacks.
  if (!project) {
    return (
      <ItemRowShell
        href={null}
        avatar={
          <span className="profile-lists__thumb profile-lists__thumb--placeholder" />
        }
        title={parsed?.rkey ?? "Project unavailable"}
        subtitle={null}
        canRemove={canRemove}
        onRemove={onRemove}
      />
    )
  }

  return (
    <div className="profile-lists__project">
      <div className="profile-lists__project-row">
        <ProjectListRow project={project} />
      </div>
      {canRemove ? (
        <Tooltip label="Remove from list">
          <button
            type="button"
            className="profile-lists__item-remove"
            onClick={handleRemove}
            disabled={removing}
            aria-label={`Remove ${project.value.title ?? "project"}`}
          >
            <X size={14} strokeWidth={2} aria-hidden />
          </button>
        </Tooltip>
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
        <Tooltip label="Remove from list">
          <button
            type="button"
            className="profile-lists__item-remove"
            onClick={handleRemove}
            disabled={removing}
            aria-label={`Remove ${title}`}
          >
            <X size={14} strokeWidth={2} aria-hidden />
          </button>
        </Tooltip>
      ) : null}
    </div>
  )
}
