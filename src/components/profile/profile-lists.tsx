"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { recordUrl, rkeyFromUri } from "@/lib/urls"
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
import SectionHeader from "@/components/ui/section-header"
import Tooltip from "@/components/ui/tooltip"
import {
  PanelCount,
  ProfileRowsSkeleton,
} from "@/components/profile/profile-panel"
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
import { deriveIdentity } from "@/lib/utils/identity"

const SECTIONS: {
  type: TypedListType
  title: string
  noun: string
  emptyHint: string
}[] = [
  { type: LIST_CERTS_TYPE, title: "Activities", noun: "activity", emptyHint: "No activity lists yet." },
  { type: LIST_PROJECTS_TYPE, title: "Projects", noun: "project", emptyHint: "No project lists yet." },
  { type: LIST_ACCOUNTS_TYPE, title: "Accounts", noun: "account", emptyHint: "No account lists yet." },
]

interface ProfileListsProps {
  did: string
  viewerIsOwner: boolean
  /** Show only this kind of list, without a section heading (a tab above
   *  names it) and with a "New list" button above the rows. Records →
   *  Lists has a tab per kind. */
  only?: TypedListType
}

export default function ProfileLists(props: ProfileListsProps) {
  // The lists hook exposes no refetch, so "Try again" remounts the body.
  const [attempt, setAttempt] = useState(0)
  return (
    <ProfileListsBody
      key={attempt}
      {...props}
      onRetry={() => setAttempt((n) => n + 1)}
    />
  )
}

function ProfileListsBody({
  did,
  viewerIsOwner,
  only,
  onRetry,
}: ProfileListsProps & { onRetry: () => void }) {
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

  if (isLoading) return <ProfileRowsSkeleton rows={3} />
  if (error) {
    return (
      <EmptyState
        icon={ListIcon}
        title="Couldn't load lists"
        description="Something went wrong on our side. Try again in a moment."
      >
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Try again
        </Button>
      </EmptyState>
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
      {SECTIONS.filter((section) => !only || section.type === only).map((section) => (
        <ListSection
          key={section.type}
          headless={!!only}
          title={section.title}
          noun={section.noun}
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
            const rkey = rkeyFromUri(ref.uri) || null
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
  headless = false,
  title,
  noun,
  emptyHint,
  lists,
  canCreate,
  onCreate,
  onOpen,
}: {
  /** No heading: a tab names the section; "New list" sits above the rows. */
  headless?: boolean
  title: string
  /** Singular noun for the "New … list" button, e.g. "activity". */
  noun: string
  emptyHint: string
  lists: TypedListRecord[]
  canCreate: boolean
  onCreate: () => void
  onOpen: (rkey: string) => void
}) {
  return (
    <section className="profile-lists__section" aria-label={title}>
      {headless ? (
        canCreate ? (
          <div className="profile-lists__toolbar">
            <Button variant="secondary" size="sm" onClick={onCreate}>
              <Plus size={16} strokeWidth={1.75} aria-hidden />
              New {noun} list
            </Button>
          </div>
        ) : null
      ) : (
        <SectionHeader
          title={
            <>
              {title} <PanelCount n={lists.length} />
            </>
          }
          action={
            canCreate ? (
              <Tooltip label="New list">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={onCreate}
                  aria-label={`New ${noun} list`}
                >
                  <Plus size={16} strokeWidth={1.75} aria-hidden />
                </Button>
              </Tooltip>
            ) : null
          }
        />
      )}
      {lists.length === 0 ? (
        <EmptyState variant="inline" title={emptyHint} />
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
                  <span className="profile-lists__row-title" dir="auto">{list.title}</span>
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
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onBack}
            aria-label="Back to all lists"
          >
            <ArrowLeft size={16} strokeWidth={1.75} aria-hidden />
          </Button>
        </Tooltip>
        <h2 className="profile-lists__detail-title">
          <bdi>{list.title}</bdi>
          <span className="profile-lists__detail-count">{list.items.length}</span>
        </h2>
        {viewerIsOwner ? (
          <div className="profile-lists__detail-actions">
            <Button variant="secondary" size="sm" onClick={() => setAddOpen(true)}>
              <Plus size={16} strokeWidth={1.75} aria-hidden />
              Add items
            </Button>
            {/* Labelled, not an icon: pasting many links, handles or DIDs
                is the way to fill a long list, and was hard to find as a
                bare icon. */}
            <Button variant="secondary" size="sm" onClick={() => setPasteOpen(true)}>
              <ClipboardPaste size={16} strokeWidth={1.75} aria-hidden />
              Paste many
            </Button>
            <Tooltip label="Edit list">
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setEditOpen(true)}
                aria-label="Edit list title and description"
              >
                <Pencil size={16} strokeWidth={1.75} aria-hidden />
              </Button>
            </Tooltip>
            <Tooltip label="Delete list">
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setConfirmingDelete(true)}
                disabled={isDeleting}
                aria-label="Delete list"
              >
                <Trash2 size={16} strokeWidth={1.75} aria-hidden />
              </Button>
            </Tooltip>
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
              ? "Items you add to this list show here."
              : "This list is empty."
          }
        >
          {viewerIsOwner ? (
            <Button variant="secondary" size="sm" onClick={() => setAddOpen(true)}>
              Add items
            </Button>
          ) : null}
        </EmptyState>
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
          message="This deletes the list. The items in it are not deleted."
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
  const identity = did ? deriveIdentity(info, did) : null
  const display = identity?.displayName ?? "Unknown"
  const initials = identity?.initials ?? "?"
  const href = identity?.profileHref ?? null
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
      subtitle={identity?.handle ? `@${identity.handle}` : null}
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
