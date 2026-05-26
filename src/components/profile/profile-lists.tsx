"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import {
  ArrowLeft,
  ChevronRight,
  Inbox,
  ListIcon,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react"
import AppDialog from "@/components/ui/app-dialog"
import Avatar from "@/components/ui/avatar"
import Button from "@/components/ui/button"
import ConfirmDialog from "@/components/ui/confirm-dialog"
import EmptyState from "@/components/ui/empty-state"
import LoadingSpinner from "@/components/ui/loading-spinner"
import { authFetch } from "@/lib/auth/fetch"
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
  type TypedListRecord,
  type TypedListType,
} from "@/lib/atproto/typed-lists"
import { resolveActivityImageUrl } from "@/lib/atproto/activity"
import { parseAtUri } from "@/lib/atproto/activity-uri"
import { getInitials } from "@/lib/utils/initials"

const SECTIONS: { type: TypedListType; title: string; emptyHint: string }[] = [
  { type: LIST_CERTS_TYPE, title: "Certs lists", emptyHint: "No cert lists yet." },
  { type: LIST_PROJECTS_TYPE, title: "Projects lists", emptyHint: "No project lists yet." },
  { type: LIST_ACCOUNTS_TYPE, title: "Accounts lists", emptyHint: "No account lists yet." },
]

interface ProfileListsProps {
  did: string
  viewerIsOwner: boolean
}

export default function ProfileLists({ did, viewerIsOwner }: ProfileListsProps) {
  const { byType, isLoading, error, createList, deleteList, addItem, removeItem } =
    useTypedLists(did)
  const [selectedRkey, setSelectedRkey] = useState<string | null>(null)
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
    if (selectedRkey && !selected) setSelectedRkey(null)
  }, [selectedRkey, selected])

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
        onBack={() => setSelectedRkey(null)}
        onDelete={async () => {
          await deleteList(selected.rkey)
          setSelectedRkey(null)
        }}
        onAdd={async (item) => addItem(selected.rkey, selected.type, item)}
        onRemove={async (uri) => removeItem(selected.rkey, uri)}
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
          onCreate={async (title, description) => {
            const ref = await createList(creating, title, description)
            setCreating(null)
            setSelectedRkey(ref.uri.split("/").pop() ?? null)
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
  onAdd,
  onRemove,
}: {
  list: TypedListRecord
  viewerIsOwner: boolean
  onBack: () => void
  onDelete: () => Promise<void>
  onAdd: (item: { uri: string; cid: string }) => Promise<unknown>
  onRemove: (uri: string) => Promise<unknown>
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [addOpen, setAddOpen] = useState(false)

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
        <ul className="profile-lists__items">
          {list.items.map((item) => (
            <li key={item.itemIdentifier.uri}>
              <ItemRow
                type={list.type}
                uri={item.itemIdentifier.uri}
                canRemove={viewerIsOwner}
                onRemove={() => onRemove(item.itemIdentifier.uri)}
              />
            </li>
          ))}
        </ul>
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
  const [removing, setRemoving] = useState(false)

  const handleRemove = async () => {
    if (removing) return
    setRemoving(true)
    try {
      await onRemove()
    } catch (err) {
      console.error("Failed to remove item:", err)
      setRemoving(false)
    }
  }

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
  const [removing, setRemoving] = useState(false)
  const handleRemove = async () => {
    if (removing) return
    setRemoving(true)
    try {
      await onRemove()
    } catch (err) {
      console.error("Failed to remove item:", err)
      setRemoving(false)
    }
  }
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

// ----------------------------- Create modal -----------------------------

function CreateListModal({
  type,
  onCreate,
  onCancel,
}: {
  type: TypedListType
  onCreate: (title: string, description?: string) => Promise<void>
  onCancel: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [isWriting, setIsWriting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isWriting || !title.trim()) return
    setIsWriting(true)
    setError(null)
    try {
      await onCreate(title.trim(), description.trim() || undefined)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create list")
      setIsWriting(false)
    }
  }

  return (
    <AppDialog
      ariaLabel={`Create ${LABELS[type]} list`}
      maxWidth={460}
      onClose={() => !isWriting && onCancel()}
      disableBackdropClose={isWriting}
    >
      <div className="signin-modal__header">
        <span className="signin-modal__title">Create {LABELS[type]} list</span>
        <button
          type="button"
          className="signin-modal__close"
          onClick={() => !isWriting && onCancel()}
          aria-label="Close"
          disabled={isWriting}
        >
          <X size={18} />
        </button>
      </div>
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
            Create list
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
      <div className="signin-modal__header">
        <span className="signin-modal__title">Add {LABELS[type]} to list</span>
        <button
          type="button"
          className="signin-modal__close"
          onClick={onClose}
          aria-label="Close"
        >
          <X size={18} />
        </button>
      </div>
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
    // We don't have a CID for the profile record at search time; the
    // PDS read on append uses the latest, so we use an empty CID and
    // let the proxy resolve it. The lexicon validator only requires
    // a string. (If this turns out to be brittle we can resolve the
    // profile record's CID before append via a getRecord call.)
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

async function resolveRecordCid(uri: string): Promise<string | null> {
  // Parse at://<did>/<collection>/<rkey>.
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
