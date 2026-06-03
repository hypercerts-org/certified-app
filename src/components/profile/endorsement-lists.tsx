"use client"

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import Link from "next/link"
import {
  ArrowLeft,
  ArrowUpDown,
  Check,
  ClipboardPaste,
  ListIcon,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react"
import { resolveHandleToDid } from "@/lib/atproto/did"
import { useClickOutsideClose } from "@/hooks/use-click-outside-close"
import { parseSubjectInput } from "@/lib/utils/parse-subject-input"
import AppDialog, { AppDialogHeader } from "@/components/ui/app-dialog"
import Avatar from "@/components/ui/avatar"
import Button from "@/components/ui/button"
import ConfirmDialog from "@/components/ui/confirm-dialog"
import EmptyState from "@/components/ui/empty-state"
import EndorsePeopleModal from "@/components/profile/endorse-people-modal"
import LoadingSpinner from "@/components/ui/loading-spinner"
import Skeleton from "@/components/ui/skeleton"
import {
  useEndorsementLists,
  type EndorsementList,
} from "@/hooks/use-endorsement-lists"
import { useAuth } from "@/lib/auth/auth-context"
import { useAuthorInfo } from "@/hooks/use-author-info"
import { formatShortDate } from "@/lib/utils/format-date"
import { getInitials } from "@/lib/utils/initials"
import {
  deleteEndorsementAward,
  extractAwardSubjectDid,
} from "@/lib/atproto/badges"

interface EndorsementListsProps {
  /** DID of the profile being viewed. */
  readonly did: string
  /** True when the viewer is the profile owner — controls whether
   *  the "Create list" button renders. List rows are visible to
   *  everyone (definitions are public records). */
  readonly viewerIsOwner: boolean
}

type SortKey = "created-desc" | "created-asc" | "alpha-asc" | "alpha-desc"

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "created-desc", label: "Newest first" },
  { key: "created-asc", label: "Oldest first" },
  { key: "alpha-asc", label: "Title A → Z" },
  { key: "alpha-desc", label: "Title Z → A" },
]

/**
 * "Lists" section on the Endorsements tab. GitHub-stars-style: a
 * collection of user-curated endorsement definitions, each grouping
 * award records that point at that definition.
 *
 * Two views in one component:
 *   - **Master**: the section header ("Lists (N)" + sort + Create)
 *     plus a row per list (title, description, created date, item
 *     count). Click a row to drill in.
 *   - **Detail**: replaces the master view inline. Header swaps the
 *     "Lists" title for a Back arrow + the list's name; the body
 *     shows the list's description and a grid of award subjects.
 */
export default function EndorsementLists({
  did,
  viewerIsOwner,
}: EndorsementListsProps) {
  const {
    lists,
    isLoading,
    error,
    refetch,
    createList,
    updateList,
    deleteList,
    addSubjectToList,
    addManySubjectsToList,
    removeSubjectFromList,
  } = useEndorsementLists(did)
  const { did: viewerDid } = useAuth()
  const [selectedListUri, setSelectedListUri] = useState<string | null>(null)
  // `+` button on the list-detail toolbar reuses the regular
  // endorsement modal. On confirm each subject gets a default-def
  // endorsement award (idempotency guard in `addSubjectToList`) plus
  // a strong-ref entry in the list's collection record.
  const [isAddingPeople, setIsAddingPeople] = useState(false)
  // Bulk-paste flow — mirrors the typed-list paste modal. The button
  // sits next to `+` on the detail header and opens a textarea that
  // accepts DIDs / handles / profile URLs separated by any
  // whitespace or commas.
  const [isBulkPasting, setIsBulkPasting] = useState(false)
  const [sort, setSort] = useState<SortKey>("created-desc")
  const [sortOpen, setSortOpen] = useState(false)
  // Modal mode: `null` closed, `"create"` for a fresh list, or an
  // existing rkey for editing an existing list. Sharing one piece
  // of state guarantees the two modes are mutually exclusive.
  const [modalMode, setModalMode] = useState<null | "create" | { rkey: string }>(
    null,
  )
  // Delete confirmation lives on the detail view; we lift its state
  // here so the in-flight flag (`isDeleting`) drives the modal's
  // spinner without coupling the dialog tree to the parent.
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const sortWrapRef = useRef<HTMLDivElement>(null)
  useClickOutsideClose(sortOpen, sortWrapRef, () => setSortOpen(false))

  const sortedLists = useMemo(() => sortLists(lists, sort), [lists, sort])
  const selectedList = useMemo(
    () => lists.find((l) => l.uri === selectedListUri) ?? null,
    [lists, selectedListUri],
  )

  // Drop the selection if a refetch removes the list out from under
  // us (e.g. the viewer deleted it elsewhere). Avoids a stale detail
  // view rendering against a list that no longer exists.
  useEffect(() => {
    if (selectedListUri && !lists.some((l) => l.uri === selectedListUri)) {
      setSelectedListUri(null)
    }
  }, [lists, selectedListUri])

  if (selectedList) {
    const alreadyInList = new Set<string>()
    for (const award of selectedList.items) {
      const subj = extractAwardSubjectDid(award.value.subject)
      if (subj) alreadyInList.add(subj)
    }
    return (
      <section className="endorsement-lists" aria-label="List detail">
        <ListDetail
          list={selectedList}
          canEdit={viewerIsOwner}
          viewerDid={viewerDid}
          onBack={() => setSelectedListUri(null)}
          onAdd={() => setIsAddingPeople(true)}
          onBulkPaste={() => setIsBulkPasting(true)}
          onEdit={() => setModalMode({ rkey: selectedList.rkey })}
          onDelete={() => {
            setDeleteError(null)
            setIsConfirmingDelete(true)
          }}
          onRemoveItem={(awardUri) =>
            removeSubjectFromList(selectedList.rkey, awardUri)
          }
          onRevokeAward={
            viewerDid
              ? async (awardUri) => {
                  // Award URIs are at://<did>/<collection>/<rkey>;
                  // deleteEndorsementAward purges the award from every
                  // list owned by the issuer, so a list-side refetch
                  // catches the cleanup across all lists.
                  const rkey = awardUri.split("/").pop()
                  if (!rkey) return
                  await deleteEndorsementAward(viewerDid, rkey)
                  await refetch()
                }
              : undefined
          }
        />
        {isBulkPasting && viewerIsOwner ? (
          <PasteSubjectsModal
            list={selectedList}
            onAddMany={(subjectDids) =>
              addManySubjectsToList(selectedList.rkey, subjectDids)
            }
            onClose={() => setIsBulkPasting(false)}
          />
        ) : null}
        {isAddingPeople && viewerIsOwner && viewerDid ? (
          <EndorsePeopleModal
            viewerDid={viewerDid}
            alreadyEndorsedDids={alreadyInList}
            onEndorse={(subjectDid) =>
              addSubjectToList(selectedList.rkey, subjectDid)
            }
            title="Add people to list"
            subtitle={`They'll be endorsed (if not already) and added to "${selectedList.title}".`}
            confirmActionLabel="Add"
            alreadyLabel="In list"
            onClose={() => setIsAddingPeople(false)}
            onCompleted={async () => {
              // Refetch so the new items appear under this list and
              // the count bumps. The modal closes itself on completion.
              setIsAddingPeople(false)
              await refetch()
            }}
          />
        ) : null}
        {modalMode && typeof modalMode === "object" && viewerIsOwner ? (
          <CreateListModal
            mode="edit"
            initialTitle={selectedList.title}
            initialDescription={selectedList.description}
            onClose={() => setModalMode(null)}
            onSubmit={async (title, description) => {
              await updateList(selectedList.rkey, title, description)
              setModalMode(null)
            }}
          />
        ) : null}
        {isConfirmingDelete && viewerIsOwner ? (
          <ConfirmDialog
            title={`Delete "${selectedList.title}"?`}
            message={
              selectedList.items.length > 0
                ? `This will permanently delete the list. The ${selectedList.items.length} endorsement${
                    selectedList.items.length === 1 ? "" : "s"
                  } from you stay${selectedList.items.length === 1 ? "s" : ""} — only the list membership goes away.`
                : "This will permanently delete the list. It has no endorsements in it yet."
            }
            confirmLabel="Delete list"
            cancelLabel="Cancel"
            confirmVariant="destructive"
            isConfirming={isDeleting}
            onCancel={() => {
              if (!isDeleting) setIsConfirmingDelete(false)
            }}
            onConfirm={async () => {
              setIsDeleting(true)
              setDeleteError(null)
              try {
                await deleteList(selectedList.rkey)
                // Drop the selection so the master view re-renders
                // without the now-deleted list, then close the
                // confirm dialog.
                setSelectedListUri(null)
                setIsConfirmingDelete(false)
              } catch (err) {
                setDeleteError(
                  err instanceof Error ? err.message : "Failed to delete list",
                )
              } finally {
                setIsDeleting(false)
              }
            }}
          />
        ) : null}
        {deleteError ? (
          <p className="endorsement-lists__detail-error" role="alert">
            {deleteError}
          </p>
        ) : null}
      </section>
    )
  }

  return (
    <section className="endorsement-lists" aria-label="Lists">
      <header className="endorsement-lists__header">
        <h2 className="endorsement-lists__title">
          Lists
          {!isLoading ? (
            <span className="endorsement-lists__title-count">
              {lists.length}
            </span>
          ) : null}
        </h2>
        <div className="endorsement-lists__actions">
          <div className="endorsement-lists__sort-wrap" ref={sortWrapRef}>
            <button
              type="button"
              className="endorsement-lists__sort-btn"
              onClick={() => setSortOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={sortOpen}
              aria-label="Sort lists"
              title="Sort"
            >
              <ArrowUpDown size={16} strokeWidth={1.75} aria-hidden />
            </button>
            {sortOpen ? (
              <div
                className="endorsement-lists__sort-menu"
                role="menu"
              >
                {SORT_OPTIONS.map((opt) => {
                  const active = opt.key === sort
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      role="menuitemradio"
                      aria-checked={active}
                      className="endorsement-lists__sort-item"
                      onClick={() => {
                        setSort(opt.key)
                        setSortOpen(false)
                      }}
                    >
                      <span className="endorsement-lists__sort-item-check">
                        {active ? (
                          <Check size={14} strokeWidth={2} aria-hidden />
                        ) : null}
                      </span>
                      {opt.label}
                    </button>
                  )
                })}
              </div>
            ) : null}
          </div>
          {viewerIsOwner ? (
            <Button
              variant="primary"
              size="sm"
              onClick={() => setModalMode("create")}
            >
              <Plus size={14} strokeWidth={1.75} aria-hidden />
              New list
            </Button>
          ) : null}
        </div>
      </header>

      <ListsBody
        lists={sortedLists}
        isLoading={isLoading}
        error={error}
        viewerIsOwner={viewerIsOwner}
        onOpen={(uri) => setSelectedListUri(uri)}
      />

      {modalMode === "create" && viewerIsOwner ? (
        <CreateListModal
          mode="create"
          onClose={() => setModalMode(null)}
          onSubmit={async (title, description) => {
            // Optimistic insert lives inside `createList` — the new
            // row appears at the top of the master view the instant
            // the write resolves. We deliberately stay in the
            // master view (instead of auto-opening the detail) so
            // the user sees their new list land alongside the
            // others. Refetch in the background to reconcile any
            // PDS-side normalization.
            await createList(title, description)
            setModalMode(null)
            void refetch()
          }}
        />
      ) : null}
    </section>
  )
}

interface ListsBodyProps {
  lists: EndorsementList[]
  isLoading: boolean
  error: string | null
  viewerIsOwner: boolean
  onOpen: (uri: string) => void
}

function ListsBody({
  lists,
  isLoading,
  error,
  viewerIsOwner,
  onOpen,
}: ListsBodyProps) {
  if (isLoading && lists.length === 0) {
    return (
      <div className="endorsement-lists__loading">
        <LoadingSpinner size="md" />
      </div>
    )
  }
  if (error) {
    return (
      <EmptyState
        icon={ListIcon}
        title="Couldn’t load lists"
        description={error}
      />
    )
  }
  if (lists.length === 0) {
    // Both viewer kinds get the same compact single-line note —
    // per #76, the large icon-card empty state ate too much
    // vertical space for a "you can do this later" prompt. The
    // outer section header still surfaces the "Create" CTA to
    // owners, so the next-step affordance isn't lost. Foreign
    // viewers see the note too (the wrapping `{viewerIsOwner ?}`
    // in profile-endorsements gates the whole section so this
    // branch is unreachable for them today, but keep the inner
    // foreign-safe shape as defense in depth).
    return (
      <p className="endorsement-lists__empty-inline">
        {viewerIsOwner
          ? "No lists yet. Use lists to structure your endorsements."
          : "No lists yet."}
      </p>
    )
  }
  return (
    <ul className="endorsement-lists__rows">
      {lists.map((list) => (
        <li key={list.uri}>
          <button
            type="button"
            className="endorsement-lists__row"
            onClick={() => onOpen(list.uri)}
          >
            <div className="endorsement-lists__row-main">
              <span className="endorsement-lists__row-title">{list.title}</span>
              {list.description ? (
                <span className="endorsement-lists__row-desc">
                  {list.description}
                </span>
              ) : null}
            </div>
            <div className="endorsement-lists__row-meta">
              <span className="endorsement-lists__row-count">
                {list.items.length} item{list.items.length === 1 ? "" : "s"}
              </span>
              <time
                className="endorsement-lists__row-date"
                dateTime={list.createdAt}
                title={new Date(list.createdAt).toLocaleString()}
              >
                {formatShortDate(list.createdAt)}
              </time>
            </div>
          </button>
        </li>
      ))}
    </ul>
  )
}

interface ListDetailProps {
  list: EndorsementList
  canEdit: boolean
  viewerDid: string | null
  onBack: () => void
  onAdd: () => void
  /** Opens the bulk-paste modal. Owner-only; ignored on foreign views. */
  onBulkPaste: () => void
  onEdit: () => void
  onDelete: () => void
  /** Called when the viewer confirms the × on an item row. Removes
   *  the item from the list's collection record; the underlying
   *  endorsement award is NOT deleted. */
  onRemoveItem: (awardUri: string) => Promise<unknown>
  /** Called when the viewer chooses "Revoke endorsement" from the
   *  remove confirmation. Deletes the underlying award entirely —
   *  the badge layer also purges the award from every list owned by
   *  the issuer, so the row disappears from this view too. */
  onRevokeAward?: (awardUri: string) => Promise<unknown>
}

function ListDetail({
  list,
  canEdit,
  viewerDid,
  onBack,
  onAdd,
  onBulkPaste,
  onEdit,
  onDelete,
  onRemoveItem,
  onRevokeAward,
}: ListDetailProps) {
  const canRevokeItems = canEdit
  return (
    <>
      <header className="endorsement-lists__header endorsement-lists__header--detail">
        {/* Back + title + counter group sits hard-left so the
            navigation hand-off is obvious; the Edit action (when
            the viewer can edit) lives on the right of the row. */}
        <div className="endorsement-lists__detail-lede">
          <button
            type="button"
            className="endorsement-lists__back"
            onClick={onBack}
            aria-label="Back to all lists"
          >
            <ArrowLeft size={16} strokeWidth={1.75} aria-hidden />
          </button>
          <h2 className="endorsement-lists__title">
            {list.title}
            <span className="endorsement-lists__title-count">
              {list.items.length}
            </span>
          </h2>
        </div>
        {canEdit ? (
          <div className="endorsement-lists__actions">
            <button
              type="button"
              className="endorsement-lists__add-btn"
              onClick={onAdd}
              aria-label="Add people to list"
              title="Add people"
            >
              <Plus size={16} strokeWidth={1.75} aria-hidden />
            </button>
            <button
              type="button"
              className="endorsement-lists__add-btn"
              onClick={onBulkPaste}
              aria-label="Bulk add people by handle or DID"
              title="Bulk paste"
            >
              <ClipboardPaste size={16} strokeWidth={1.75} aria-hidden />
            </button>
            <Button variant="secondary" size="sm" onClick={onEdit}>
              <Pencil size={14} strokeWidth={1.75} aria-hidden />
              Edit
            </Button>
            <Button variant="destructive" size="sm" onClick={onDelete}>
              <Trash2 size={14} strokeWidth={1.75} aria-hidden />
              Delete
            </Button>
          </div>
        ) : null}
      </header>

      <div className="endorsement-lists__detail-meta">
        {list.description ? (
          <p className="endorsement-lists__detail-desc">{list.description}</p>
        ) : null}
        <span className="endorsement-lists__detail-date">
          Created{" "}
          <time
            dateTime={list.createdAt}
            title={new Date(list.createdAt).toLocaleString()}
          >
            {formatShortDate(list.createdAt)}
          </time>
        </span>
      </div>

      {list.items.length === 0 ? (
        <EmptyState
          icon={ListIcon}
          title="No items yet"
          description="Awards added to this list will show up here."
        />
      ) : (
        <ul className="endorsement-lists__items">
          {list.items.map((award) => {
            const subjectDid = extractAwardSubjectDid(award.value.subject)
            return (
              <ListItemRow
                key={award.uri}
                subjectDid={subjectDid}
                createdAt={award.value.createdAt}
                note={award.value.note}
                revoke={
                  canRevokeItems && viewerDid
                    ? {
                        awardUri: award.uri,
                        listTitle: list.title,
                        onRemove: () => onRemoveItem(award.uri),
                        onRevokeAward: onRevokeAward
                          ? () => onRevokeAward(award.uri)
                          : undefined,
                      }
                    : null
                }
              />
            )
          })}
        </ul>
      )}
    </>
  )
}

interface ListItemRowProps {
  subjectDid: string | null
  createdAt: string
  note?: string
  /** Owner-only "remove from list" handle. When set, the row renders
   *  a × that opens a confirmation. `onRemove` drops the item from
   *  the list (award untouched); `onRevokeAward`, when present,
   *  surfaces a second action that deletes the underlying award
   *  outright. When `onRevokeAward` is omitted the dialog falls
   *  back to the legacy 2-option (remove / cancel) layout. */
  revoke: {
    awardUri: string
    listTitle: string
    onRemove: () => Promise<unknown>
    onRevokeAward?: () => Promise<unknown>
  } | null
}

function ListItemRow({ subjectDid, createdAt, note, revoke }: ListItemRowProps) {
  const { info, isLoading } = useAuthorInfo(subjectDid)
  const displayName = info?.displayName || info?.handle || subjectDid || "Unknown"
  const handle = info?.handle && info.handle !== info.did ? info.handle : null
  const initials = getInitials(info?.displayName, subjectDid ?? undefined)
  const href = subjectDid
    ? `/profile/${encodeURIComponent(info?.handle || subjectDid)}`
    : null

  const body = (
    <>
      {isLoading && !info ? (
        <Skeleton circle animate={false} width={32} height={32} />
      ) : (
        <Avatar
          size="md"
          src={info?.avatarUrl || undefined}
          alt=""
          fallbackInitials={initials}
        />
      )}
      <div className="endorsement-lists__item-body">
        <span className="endorsement-lists__item-name">{displayName}</span>
        {handle ? (
          <span className="endorsement-lists__item-handle">@{handle}</span>
        ) : null}
        <time
          className="endorsement-lists__item-date"
          dateTime={createdAt}
          title={new Date(createdAt).toLocaleString()}
        >
          {formatShortDate(createdAt)}
        </time>
        {note ? (
          <p className="endorsement-lists__item-note">{note}</p>
        ) : null}
      </div>
    </>
  )

  return (
    <li className="endorsement-lists__item">
      {href ? (
        <Link href={href} className="endorsement-lists__item-link">
          {body}
        </Link>
      ) : (
        <div className="endorsement-lists__item-link">{body}</div>
      )}
      {revoke ? (
        <RevokeListItemButton
          listTitle={revoke.listTitle}
          subjectDisplay={displayName}
          onRemove={revoke.onRemove}
          onRevokeAward={revoke.onRevokeAward}
        />
      ) : null}
    </li>
  )
}

// --------------------- Create / edit list modal ---------------------

interface CreateListModalProps {
  /** "create" → empty inputs + "Create" CTA. "edit" → pre-filled
   *  inputs + "Save" CTA. */
  mode: "create" | "edit"
  initialTitle?: string
  initialDescription?: string
  onClose: () => void
  /** Caller decides whether the title+description go to createList
   *  or updateList. Throws → modal stays open and surfaces error. */
  onSubmit: (title: string, description?: string) => Promise<void>
}

function CreateListModal({
  mode,
  initialTitle = "",
  initialDescription = "",
  onClose,
  onSubmit,
}: CreateListModalProps) {
  const titleRef = useRef<HTMLInputElement>(null)
  const [title, setTitle] = useState(initialTitle)
  const [description, setDescription] = useState(initialDescription)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // AppDialog owns showModal/close. This effect just autofocuses the
  // title field.
  useEffect(() => {
    titleRef.current?.focus()
  }, [])

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      if (isSaving) return
      const trimmed = title.trim()
      if (!trimmed) {
        setError("Title is required")
        return
      }
      setIsSaving(true)
      setError(null)
      try {
        await onSubmit(trimmed, description.trim() || undefined)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save list")
        setIsSaving(false)
      }
    },
    [title, description, isSaving, onSubmit],
  )

  const headerLabel = mode === "edit" ? "Edit list" : "Create list"
  const submitLabel = mode === "edit" ? "Save" : "Create"

  return (
    <AppDialog
      ariaLabel={headerLabel}
      className="endorsement-lists__create-modal"
      maxWidth={480}
      onClose={onClose}
      disableBackdropClose={isSaving}
    >
      <AppDialogHeader title={headerLabel} onClose={onClose} disabled={isSaving} />

      <form className="signin-modal__body" onSubmit={handleSubmit}>
        <label className="endorsement-lists__create-field">
          <span className="endorsement-lists__create-label">Title</span>
          <input
            ref={titleRef}
            type="text"
            className="endorsement-lists__create-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={256}
            required
            disabled={isSaving}
            autoComplete="off"
            spellCheck={false}
          />
        </label>

        <label className="endorsement-lists__create-field">
          <span className="endorsement-lists__create-label">
            Description <span className="endorsement-lists__create-optional">(optional)</span>
          </span>
          <textarea
            className="endorsement-lists__create-textarea"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={1000}
            rows={3}
            disabled={isSaving}
          />
        </label>

        {error ? (
          <p className="endorsement-lists__create-error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="endorsement-lists__create-footer">
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            loading={isSaving}
            disabled={isSaving || !title.trim()}
          >
            {submitLabel}
          </Button>
        </div>
      </form>
    </AppDialog>
  )
}

// --------------------- Remove a single list item ---------------------

/**
 * `×` rendered to the right of each list-item row when the viewer
 * owns the list. Confirms in a destructive dialog, then drops the
 * item from the list's `org.hypercerts.collection` record. The
 * underlying endorsement award survives — the subject still appears
 * in the issuer's Given panel.
 */
function RevokeListItemButton({
  listTitle,
  subjectDisplay,
  onRemove,
  onRevokeAward,
}: {
  listTitle: string
  subjectDisplay: string
  onRemove: () => Promise<unknown>
  onRevokeAward?: () => Promise<unknown>
}) {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [busy, setBusy] = useState<null | "remove" | "revoke">(null)
  const [error, setError] = useState<string | null>(null)

  const run = async (action: "remove" | "revoke") => {
    if (busy) return
    setBusy(action)
    setError(null)
    try {
      await (action === "remove" ? onRemove() : onRevokeAward!())
      setConfirmOpen(false)
    } catch (err) {
      console.error(`Failed to ${action} endorsement:`, err)
      setError(err instanceof Error ? err.message : `Failed to ${action}`)
    } finally {
      setBusy(null)
    }
  }

  // Without onRevokeAward, fall back to the legacy 2-button confirm
  // so call sites that haven't opted into the revoke flow stay unchanged.
  const supportsRevoke = !!onRevokeAward

  return (
    <>
      <button
        type="button"
        className="endorsement-lists__item-remove"
        onClick={(e) => {
          // Outer list row wraps a <Link>; without stopping
          // propagation the click would navigate to the subject.
          e.preventDefault()
          e.stopPropagation()
          setConfirmOpen(true)
        }}
        aria-label={`Remove ${subjectDisplay} from ${listTitle}`}
        title="Remove from list"
      >
        <X size={14} strokeWidth={2} aria-hidden />
      </button>
      {confirmOpen && !supportsRevoke ? (
        <ConfirmDialog
          title={`Remove ${subjectDisplay} from "${listTitle}"?`}
          message="Their endorsement from you stays — only the list membership is removed."
          confirmLabel="Remove"
          cancelLabel="Cancel"
          confirmVariant="destructive"
          isConfirming={busy === "remove"}
          onConfirm={() => run("remove")}
          onCancel={() => !busy && setConfirmOpen(false)}
        />
      ) : null}
      {confirmOpen && supportsRevoke ? (
        <AppDialog
          ariaLabel="Remove or revoke endorsement"
          role="alertdialog"
          className="endorsement-lists__revoke-dialog"
          maxWidth={560}
          onClose={() => !busy && setConfirmOpen(false)}
          disableBackdropClose={!!busy}
        >
          <AppDialogHeader
            title={`Remove ${subjectDisplay} from "${listTitle}"?`}
          />
          <div className="signin-modal__body endorsement-lists__revoke-body">
            <p className="endorsement-lists__revoke-copy">
              You can drop them from this list and keep your
              endorsement, or revoke the endorsement entirely (which
              also removes them from every list they&rsquo;re in).
            </p>
            {error ? (
              <p className="endorsement-lists__revoke-error" role="alert">
                {error}
              </p>
            ) : null}
            <div className="endorsement-lists__revoke-actions">
              <Button
                type="button"
                variant="ghost"
                onClick={() => !busy && setConfirmOpen(false)}
                disabled={!!busy}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => run("remove")}
                loading={busy === "remove"}
                disabled={!!busy}
              >
                Remove from list
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={() => run("revoke")}
                loading={busy === "revoke"}
                disabled={!!busy}
              >
                Revoke endorsement
              </Button>
            </div>
          </div>
        </AppDialog>
      ) : null}
    </>
  )
}

// --------------------------- Bulk paste modal ---------------------------

/**
 * Status of one row in the bulk-paste preview list.
 *
 *   - `pending`     — accepted by the parser, waiting on the run.
 *   - `resolving`   — handle / profile-URL being resolved to a DID.
 *   - `unresolved`  — handle failed to resolve (typo / deactivated).
 *   - `wrong-shape` — the raw input didn't look like a DID, handle, or
 *                     profile URL we know how to parse.
 *   - `already`     — the subject is already in the list (no-op).
 *   - `endorsing`   — endorsement award is being minted on the PDS.
 *   - `error`       — award create or list-append failed for this row.
 *   - `added`       — full success: endorsement minted + list updated.
 */
type SubjectPasteStatus =
  | "pending"
  | "resolving"
  | "unresolved"
  | "wrong-shape"
  | "already"
  | "endorsing"
  | "error"
  | "added"

interface SubjectPasteRow {
  /** The raw token the user pasted; verbatim so the preview is honest. */
  input: string
  /** Resolved DID once we have it. */
  did: string | null
  status: SubjectPasteStatus
  message?: string
}

function statusLabelForSubject(s: SubjectPasteStatus): string {
  switch (s) {
    case "pending":
      return "Pending"
    case "resolving":
      return "Resolving…"
    case "unresolved":
      return "Not found"
    case "wrong-shape":
      return "Unrecognized"
    case "already":
      return "Already in"
    case "endorsing":
      return "Endorsing…"
    case "error":
      return "Error"
    case "added":
      return "Added"
  }
}

function PasteSubjectsModal({
  list,
  onAddMany,
  onClose,
}: {
  list: EndorsementList
  onAddMany: (subjectDids: readonly string[]) => Promise<{
    added: string[]
    skippedAlreadyIn: string[]
    awardFailed: { subjectDid: string; message: string }[]
  }>
  onClose: () => void
}) {
  const [raw, setRaw] = useState("")
  const [rows, setRows] = useState<SubjectPasteRow[]>([])
  const [running, setRunning] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  // Pre-compute the set of subject DIDs already in this list so the
  // parse phase can flag `already` rows without a server round-trip.
  const alreadyInList = useMemo(() => {
    const out = new Set<string>()
    for (const award of list.items) {
      const subj = extractAwardSubjectDid(award.value.subject)
      if (subj) out.add(subj)
    }
    return out
  }, [list.items])

  const handleRun = useCallback(async () => {
    if (running) return
    // Same separator policy as the typed-list paste flow: any
    // whitespace or comma splits inputs; dedupe-by-input within the
    // batch so a viewer pasting the same handle twice only mints one
    // award.
    const tokens = Array.from(
      new Set(
        raw
          .split(/[\s,]+/)
          .map((s) => s.trim())
          .filter(Boolean),
      ),
    )
    if (tokens.length === 0) return

    const initial: SubjectPasteRow[] = tokens.map((input) => {
      const parsed = parseSubjectInput(input)
      if (!parsed) {
        return {
          input,
          did: null,
          status: "wrong-shape",
          message: "Not a DID, handle, or profile URL",
        }
      }
      if (parsed.kind === "did") {
        if (alreadyInList.has(parsed.value)) {
          return { input, did: parsed.value, status: "already" }
        }
        return { input, did: parsed.value, status: "pending" }
      }
      // handle — resolve next.
      return { input, did: null, status: "resolving" }
    })
    setRows(initial)
    setRunning(true)

    // Phase 1: parallel handle resolution. Each handle hits the
    // public appView via `resolveHandleToDid`. Results flip the row
    // into `pending` (with a DID) or `unresolved`.
    const handleRows = initial
      .map((row, i) => ({ row, i }))
      .filter(({ row }) => row.status === "resolving")
    const resolved = await Promise.all(
      handleRows.map(async ({ row, i }) => {
        const parsed = parseSubjectInput(row.input)
        if (!parsed || parsed.kind !== "handle") return { i, did: null }
        try {
          const did = await resolveHandleToDid(parsed.value)
          return { i, did }
        } catch {
          return { i, did: null }
        }
      }),
    )
    // Splice resolution results back into the row table. Handles that
    // resolve into a DID already in the list flip to `already`.
    setRows((prev) => {
      const next = prev.slice()
      for (const { i, did } of resolved) {
        if (did === null) {
          next[i] = {
            ...next[i],
            status: "unresolved",
            message: "Handle did not resolve",
          }
        } else if (alreadyInList.has(did)) {
          next[i] = { ...next[i], did, status: "already" }
        } else {
          next[i] = { ...next[i], did, status: "pending" }
        }
      }
      return next
    })

    // Snapshot the post-resolution rows so we don't depend on a stale
    // closure capture. (`initial` is pre-resolution.)
    const postResolve: SubjectPasteRow[] = initial.map((row, i) => {
      const hit = resolved.find((r) => r.i === i)
      if (!hit) return row
      if (hit.did === null) {
        return { ...row, status: "unresolved", message: "Handle did not resolve" }
      }
      if (alreadyInList.has(hit.did)) {
        return { ...row, did: hit.did, status: "already" }
      }
      return { ...row, did: hit.did, status: "pending" }
    })

    // Phase 2: bulk endorse+append. Flip every pending row to
    // `endorsing` so the user sees motion; the hook fans out the
    // award creates in parallel and then writes the list in one
    // shot.
    const toEndorse = postResolve.filter(
      (r): r is SubjectPasteRow & { did: string } =>
        r.status === "pending" && r.did !== null,
    )
    if (toEndorse.length === 0) {
      setRunning(false)
      return
    }
    setRows((prev) =>
      prev.map((r) =>
        toEndorse.some((t) => t.input === r.input)
          ? { ...r, status: "endorsing" }
          : r,
      ),
    )

    try {
      const result = await onAddMany(toEndorse.map((t) => t.did))
      const addedSet = new Set(result.added)
      const skippedSet = new Set(result.skippedAlreadyIn)
      const failedMap = new Map<string, string>()
      for (const f of result.awardFailed) failedMap.set(f.subjectDid, f.message)
      setRows((prev) =>
        prev.map((r) => {
          if (r.status !== "endorsing" || !r.did) return r
          if (addedSet.has(r.did)) {
            return { ...r, status: "added", message: undefined }
          }
          if (skippedSet.has(r.did)) {
            return { ...r, status: "already", message: undefined }
          }
          const failMsg = failedMap.get(r.did)
          if (failMsg) {
            return { ...r, status: "error", message: failMsg }
          }
          // Defensive — shouldn't reach here unless the hook returned
          // a result we don't know how to slot. Mark the row error so
          // the user knows it wasn't a silent no-op.
          return { ...r, status: "error", message: "Unknown result" }
        }),
      )
    } catch (err) {
      const message = err instanceof Error ? err.message : "Bulk add failed"
      setRows((prev) =>
        prev.map((r) =>
          r.status === "endorsing" ? { ...r, status: "error", message } : r,
        ),
      )
    } finally {
      setRunning(false)
    }
  }, [alreadyInList, onAddMany, raw, running])

  // Three terminal states drive the action-row layout:
  //
  //   - `allDone`: every row was either added or already in the list.
  //     Nothing left to act on — collapse to a single Close button so
  //     the viewer isn't given a misleading "Cancel" affordance after
  //     a fully-successful run.
  //   - `hasErrors`: at least one row hit a write-side error (typical
  //     case: the per-DID endorsement-write rate limit). Swap "Add"
  //     for "Try again" so the retry path is the obvious next move.
  //     handleRun() is idempotent — rows that succeeded the first time
  //     are now in the list (via parent refetch), so on retry the
  //     parser flags them `already` and the bulk hook only re-mints
  //     the failed subjects.
  //   - default: the original "Cancel + Add" pair, used while the
  //     viewer is still composing or after a partial-result run with
  //     remaining `wrong-shape` / `unresolved` rows they might want
  //     to edit and retry.
  const allDone =
    rows.length > 0 &&
    rows.every((r) => r.status === "added" || r.status === "already")
  const hasErrors = rows.some((r) => r.status === "error")
  const showCloseOnly = !running && allDone
  const showTryAgain = !running && hasErrors && !allDone

  return (
    <AppDialog
      ariaLabel="Bulk add people by handle or DID"
      maxWidth={600}
      onClose={() => !running && onClose()}
      disableBackdropClose={running}
    >
      <AppDialogHeader
        title={`Bulk add to "${list.title}"`}
        onClose={() => !running && onClose()}
        disabled={running}
      />
      <div className="signin-modal__body profile-lists__paste-body">
        <p className="profile-lists__paste-help">
          Paste handles, DIDs, or profile URLs separated by commas,
          newlines, or spaces. Each person gets an endorsement from you
          (if they don&rsquo;t have one already) and is added to this
          list.
        </p>
        <textarea
          ref={textareaRef}
          className="profile-lists__paste-textarea"
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          rows={6}
          placeholder="alice.bsky.social, did:plc:…, https://redesign.certified.app/profile/bob.bsky.social"
          disabled={running || showCloseOnly}
        />
        {rows.length > 0 ? (
          <ul className="profile-lists__paste-results" aria-live="polite">
            {rows.map((r, i) => (
              <li
                key={`${r.input}-${i}`}
                className={`profile-lists__paste-row profile-lists__paste-row--${r.status}`}
              >
                <span className="profile-lists__paste-status">
                  {statusLabelForSubject(r.status)}
                </span>
                <code className="profile-lists__paste-uri">{r.input}</code>
                {r.message ? (
                  <span className="profile-lists__paste-message">
                    {r.message}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
        <div className="profile-lists__paste-actions">
          {showCloseOnly ? (
            <Button type="button" variant="primary" onClick={onClose}>
              Close
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant="ghost"
                onClick={onClose}
                disabled={running}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={handleRun}
                loading={running}
                disabled={running || raw.trim().length === 0}
              >
                {showTryAgain ? "Try again" : "Add"}
              </Button>
            </>
          )}
        </div>
      </div>
    </AppDialog>
  )
}

// ----------------------------- Sort util -----------------------------

/** Exported for unit tests. Three-way `compareString` keeps the
 *  createdAt sort stable: equal timestamps return 0, so same-second
 *  lists preserve their incoming order instead of shuffling between
 *  renders (quality-046). */
export function sortLists(
  lists: EndorsementList[],
  sort: SortKey,
): EndorsementList[] {
  const out = lists.slice()
  switch (sort) {
    case "created-desc":
      out.sort((a, b) => compareString(b.createdAt, a.createdAt))
      break
    case "created-asc":
      out.sort((a, b) => compareString(a.createdAt, b.createdAt))
      break
    case "alpha-asc":
      out.sort((a, b) => a.title.localeCompare(b.title))
      break
    case "alpha-desc":
      out.sort((a, b) => b.title.localeCompare(a.title))
      break
  }
  return out
}

function compareString(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}
