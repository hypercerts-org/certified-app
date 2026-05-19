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
  ListIcon,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react"
import AppDialog from "@/components/ui/app-dialog"
import Avatar from "@/components/ui/avatar"
import Button from "@/components/ui/button"
import ConfirmDialog from "@/components/ui/confirm-dialog"
import EmptyState from "@/components/ui/empty-state"
import EndorsePeopleModal from "@/components/profile/endorse-people-modal"
import LoadingSpinner from "@/components/ui/loading-spinner"
import {
  useEndorsementLists,
  type EndorsementList,
} from "@/hooks/use-endorsement-lists"
import { useAuth } from "@/lib/auth/auth-context"
import { useAuthorInfo } from "@/hooks/use-author-info"
import { formatShortDate } from "@/lib/utils/format-date"
import { getInitials } from "@/lib/utils/initials"
import {
  createListAward,
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
  const { lists, isLoading, error, refetch, createList, updateList, deleteList } =
    useEndorsementLists(did)
  const { did: viewerDid } = useAuth()
  const [selectedListUri, setSelectedListUri] = useState<string | null>(null)
  // `+` button on the list-detail toolbar opens the same modal we
  // use for issuing regular endorsements, just bound to the list's
  // own badge ref so awards land under THIS list instead of the
  // user's default "Endorsement" definition.
  const [isAddingPeople, setIsAddingPeople] = useState(false)
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

  const sortBtnRef = useRef<HTMLButtonElement>(null)
  const sortMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!sortOpen) return
    const onMouseDown = (e: MouseEvent) => {
      const t = e.target
      if (!(t instanceof Node)) return
      if (sortBtnRef.current?.contains(t)) return
      if (sortMenuRef.current?.contains(t)) return
      setSortOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSortOpen(false)
    }
    document.addEventListener("mousedown", onMouseDown)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onMouseDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [sortOpen])

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
          onEdit={() => setModalMode({ rkey: selectedList.rkey })}
          onDelete={() => {
            setDeleteError(null)
            setIsConfirmingDelete(true)
          }}
          onAfterItemRevoke={() => refetch()}
        />
        {isAddingPeople && viewerIsOwner && viewerDid ? (
          <EndorsePeopleModal
            viewerDid={viewerDid}
            alreadyEndorsedDids={alreadyInList}
            onEndorse={(subjectDid) =>
              createListAward(viewerDid, subjectDid, {
                uri: selectedList.uri,
                cid: selectedList.cid,
              })
            }
            title="Add people to list"
            subtitle={`They'll be added to "${selectedList.title}".`}
            confirmActionLabel="Add"
            alreadyLabel="In list"
            onClose={() => setIsAddingPeople(false)}
            onCompleted={async () => {
              // Refetch so the new awards appear under this list
              // and the item count bumps. The modal closes itself
              // on completion.
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
                ? `This will permanently delete the list AND remove all ${selectedList.items.length} endorsement${
                    selectedList.items.length === 1 ? "" : "s"
                  } in it. The people you endorsed via this list will no longer show up as endorsed by you.`
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
          <div className="endorsement-lists__sort-wrap">
            <button
              ref={sortBtnRef}
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
                ref={sortMenuRef}
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
              Create list
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
    // Owner view keeps the full EmptyState with its call-to-action
    // copy so a fresh user has a clear next step ("create your
    // first list"). On a foreign profile that prompt is irrelevant
    // — collapse to a single-line note so the section doesn't
    // dominate the page with empty real-estate the viewer can't
    // act on.
    if (!viewerIsOwner) {
      return (
        <p className="endorsement-lists__empty-inline">No lists yet.</p>
      )
    }
    return (
      <EmptyState
        icon={ListIcon}
        title="No lists yet"
        description="Custom endorsement lists you create will appear here."
      />
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
  onEdit: () => void
  onDelete: () => void
  /** Fired after a per-item × revoke succeeds. Caller should refetch
   *  so the deleted award row drops and the counter ticks down. */
  onAfterItemRevoke: () => void | Promise<void>
}

function ListDetail({
  list,
  canEdit,
  viewerDid,
  onBack,
  onAdd,
  onEdit,
  onDelete,
  onAfterItemRevoke,
}: ListDetailProps) {
  const canRevokeItems = canEdit
  const onAfterRevoke = onAfterItemRevoke
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
                        viewerDid,
                        rkey: award.rkey,
                        listTitle: list.title,
                        onAfterRevoke,
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
  /** Owner-only delete handle for the linked award. When set, the
   *  row renders a × that confirms + deletes the award + invokes
   *  `onAfterRevoke` so the list refetches and the row drops. */
  revoke: {
    viewerDid: string
    rkey: string
    listTitle: string
    onAfterRevoke: () => void | Promise<void>
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
        <div
          className="endorsement-lists__item-avatar-skel"
          aria-hidden="true"
        />
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
          viewerDid={revoke.viewerDid}
          rkey={revoke.rkey}
          listTitle={revoke.listTitle}
          subjectDisplay={displayName}
          onAfterRevoke={revoke.onAfterRevoke}
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
      <div className="signin-modal__header">
        <span className="signin-modal__title">{headerLabel}</span>
        <button
          type="button"
          className="signin-modal__close"
          onClick={onClose}
          aria-label="Close"
          disabled={isSaving}
        >
          <X size={18} />
        </button>
      </div>

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

// --------------------- Revoke a single list item ---------------------

/**
 * `×` rendered to the right of each list-item row when the viewer
 * owns the list. Confirms in a destructive dialog, then deletes the
 * underlying `app.certified.badge.award` record. Doesn't touch the
 * list's definition — only one award disappears.
 */
function RevokeListItemButton({
  viewerDid,
  rkey,
  listTitle,
  subjectDisplay,
  onAfterRevoke,
}: {
  viewerDid: string
  rkey: string
  listTitle: string
  subjectDisplay: string
  onAfterRevoke: () => void | Promise<void>
}) {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [isRevoking, setIsRevoking] = useState(false)

  const handleConfirm = async () => {
    if (isRevoking) return
    setIsRevoking(true)
    try {
      await deleteEndorsementAward(viewerDid, rkey)
      await onAfterRevoke()
      setConfirmOpen(false)
    } catch (err) {
      console.error("Failed to remove list item:", err)
    } finally {
      setIsRevoking(false)
    }
  }

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
      {confirmOpen ? (
        <ConfirmDialog
          title={`Remove ${subjectDisplay} from "${listTitle}"?`}
          message="The endorsement awarded under this list will be deleted. The person will no longer appear in the list."
          confirmLabel="Remove"
          cancelLabel="Cancel"
          confirmVariant="destructive"
          isConfirming={isRevoking}
          onConfirm={handleConfirm}
          onCancel={() => !isRevoking && setConfirmOpen(false)}
        />
      ) : null}
    </>
  )
}

// ----------------------------- Sort util -----------------------------

function sortLists(lists: EndorsementList[], sort: SortKey): EndorsementList[] {
  const out = lists.slice()
  switch (sort) {
    case "created-desc":
      out.sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1))
      break
    case "created-asc":
      out.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
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
