"use client"

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { Compass, FolderGit2, Pencil, Plus, Trash2 } from "lucide-react"
import Button from "@/components/ui/button"
import CertIcon from "@/components/ui/cert-icon"
import DeleteRecordDialog from "@/components/ui/delete-record-dialog"
import EmptyState from "@/components/ui/empty-state"
import IdentityRow from "@/components/ui/identity-row"
import Input from "@/components/ui/input"
import LoadMoreSentinel from "@/components/ui/load-more-sentinel"
import LoadingSpinner from "@/components/ui/loading-spinner"
import RowThumb from "@/components/ui/row-thumb"
import SegmentedControl from "@/components/ui/segmented-control"
import NewEndorsementPanel from "@/components/endorsements/new-endorsement-panel"
import { GivenList } from "@/components/profile/profile-endorsement-views"
import ProfileLists from "@/components/profile/profile-lists"
import EndorsementLists from "@/components/profile/endorsement-lists"
import { FollowButton } from "@/components/profile/profile-follow-endorse"
import { useAuthorInfo } from "@/hooks/use-author-info"
import { useFollowers } from "@/hooks/use-followers"
import type { useFollowing } from "@/hooks/use-following"
import type { useGivenEndorsements } from "@/hooks/use-endorsements"
import { useUserProjects } from "@/hooks/use-user-projects"
import { resolveActivityImageUrl } from "@/lib/atproto/activity"
import type { ActivityRecord } from "@/lib/atproto/activity-types"
import { fetchUserIndexerActivities } from "@/lib/atproto/indexer"
import { projectImage, projectTitle } from "@/lib/atproto/collection"
import {
  ACTIVITY_COLLECTION,
  PROJECT_COLLECTION,
  deleteOwnRecord,
} from "@/lib/atproto/delete-own-record"
import type { FollowRecord } from "@/lib/atproto/follow"
import { profileUrl, recordUrl, rkeyFromUri } from "@/lib/urls"
import { formatShortDate } from "@/lib/utils/format-date"

type FollowingState = ReturnType<typeof useFollowing>
type GivenState = ReturnType<typeof useGivenEndorsements>

/** People lists render in steps of this many rows. */
const PEOPLE_PAGE = 50
/** Activities load from the indexer in pages of this many. */
const ACTIVITY_PAGE = 30
/** Search waits this long after the last keystroke. */
const SEARCH_DEBOUNCE_MS = 300
const EMPTY_SET: Set<string> = new Set()

// ------------------------------ Shared parts --------------------------------

function PaneHeader({
  titleId,
  title,
  description,
  action,
}: {
  titleId: string
  title: string
  description: string
  action?: React.ReactNode
}) {
  return (
    <div className="records-pane__head">
      <div className="records-pane__heading">
        <h2 id={titleId} className="records-pane__title font-headline text-h3">
          {title}
        </h2>
        <p className="records-pane__desc">{description}</p>
      </div>
      {action ? <div className="records-pane__action">{action}</div> : null}
    </div>
  )
}

function SearchField({
  value,
  onChange,
  label,
}: {
  value: string
  onChange: (v: string) => void
  label: string
}) {
  return (
    <div className="records-pane__search">
      <Input
        type="search"
        size="sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={label}
        aria-label={label}
      />
    </div>
  )
}

/**
 * One activity or project: the thumbnail and title open the record; Edit
 * and Delete sit at the end of the row.
 */
function RecordRow({
  href,
  editHref,
  title,
  meta,
  imageUrl,
  icon,
  onDelete,
}: {
  href: string
  editHref: string
  title: string
  meta: string
  imageUrl: string | null
  icon: React.ReactNode
  onDelete: () => void
}) {
  return (
    <li className="records-row">
      <Link href={href} className="records-row__main">
        <RowThumb className="records-row__thumb" src={imageUrl} icon={icon} />
        <span className="records-row__text">
          <span className="records-row__title" dir="auto">{title}</span>
          <span className="records-row__meta">{meta}</span>
        </span>
      </Link>
      <div className="records-row__actions">
        <Button
          href={editHref}
          variant="ghost"
          size="icon-sm"
          aria-label={`Edit ${title}`}
          tooltip="Edit"
        >
          <Pencil size={16} strokeWidth={1.75} aria-hidden />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Delete ${title}`}
          tooltip="Delete"
          onClick={onDelete}
        >
          <Trash2 size={16} strokeWidth={1.75} aria-hidden />
        </Button>
      </div>
    </li>
  )
}

/**
 * Delete-with-confirmation state for one pane. `run` does the write;
 * `onDeleted(uri)` tells the page, which keeps the set of deleted URIs per
 * kind (so a deleted row stays hidden after switching kinds and back, even
 * while the indexer still lists it) and lowers the count once.
 */
function useDeleteFlow<T extends { uri: string }>(
  run: (item: T) => Promise<void>,
  onDeleted: (uri: string) => void,
) {
  const [target, setTarget] = useState<T | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const confirm = async () => {
    if (!target) return
    setIsDeleting(true)
    setError(null)
    try {
      await run(target)
      onDeleted(target.uri)
      setTarget(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't delete this record. Try again.")
    } finally {
      setIsDeleting(false)
    }
  }

  return {
    target,
    isDeleting,
    error,
    ask: (item: T) => {
      setError(null)
      setTarget(item)
    },
    // Esc still reaches onCancel while the write runs; keep the dialog
    // open so a failure can be shown.
    cancel: () => {
      if (!isDeleting) setTarget(null)
    },
    confirm,
  }
}

/** `value`, updated only after it has been still for `ms`. */
function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return debounced
}

/**
 * The signed-in person's own activities (authored only, never ones they
 * only contributed to), paged from the indexer with its server-side
 * search, so "load more" and search cover every activity, not just the
 * pages already loaded.
 */
function useOwnActivities(did: string, search: string) {
  type State = {
    records: ActivityRecord[]
    cursor: string | null
    hasMore: boolean
    isLoading: boolean
    isLoadingMore: boolean
    error: boolean
  }
  const initial: State = {
    records: [],
    cursor: null,
    hasMore: false,
    isLoading: true,
    isLoadingMore: false,
    error: false,
  }
  const [state, setState] = useState<State>(initial)
  // Reset during render when the query changes (adjust-state pattern), so
  // old results never show under a new search.
  const queryKey = `${did}|${search}`
  const [prevKey, setPrevKey] = useState(queryKey)
  if (prevKey !== queryKey) {
    setPrevKey(queryKey)
    setState(initial)
  }
  // Bumped per first-page load; a "load more" that lands after a newer
  // search started is dropped.
  const generation = useRef(0)

  useEffect(() => {
    const gen = ++generation.current
    const controller = new AbortController()
    fetchUserIndexerActivities(did, {
      mode: "authored",
      first: ACTIVITY_PAGE,
      search: search || undefined,
      signal: controller.signal,
    })
      .then((res) => {
        if (controller.signal.aborted || gen !== generation.current) return
        setState({
          records: res.records,
          cursor: res.endCursor,
          hasMore: res.hasMore,
          isLoading: false,
          isLoadingMore: false,
          error: false,
        })
      })
      .catch(() => {
        if (controller.signal.aborted || gen !== generation.current) return
        setState((s) => ({ ...s, isLoading: false, error: true }))
      })
    return () => controller.abort()
  }, [did, search])

  const { cursor, hasMore, isLoadingMore } = state
  const loadMore = useCallback(() => {
    if (!hasMore || isLoadingMore || !cursor) return
    const gen = generation.current
    setState((s) => ({ ...s, isLoadingMore: true }))
    fetchUserIndexerActivities(did, {
      mode: "authored",
      first: ACTIVITY_PAGE,
      after: cursor,
      search: search || undefined,
    })
      .then((res) => {
        if (gen !== generation.current) return
        setState((s) => {
          const seen = new Set(s.records.map((r) => r.uri))
          return {
            ...s,
            records: [...s.records, ...res.records.filter((r) => !seen.has(r.uri))],
            cursor: res.endCursor,
            hasMore: res.hasMore,
            isLoadingMore: false,
          }
        })
      })
      .catch(() => {
        if (gen !== generation.current) return
        setState((s) => ({ ...s, isLoadingMore: false, hasMore: false }))
      })
  }, [did, search, cursor, hasMore, isLoadingMore])

  return { ...state, loadMore }
}

// ------------------------------- Activities ---------------------------------

export function ActivitiesPane({
  did,
  actor,
  removed,
  onDeleted,
}: {
  did: string
  /** Handle (preferred) or DID for record URLs. */
  actor: string
  /** URIs deleted on this page (kept by the page across kind switches). */
  removed: ReadonlySet<string>
  onDeleted: (uri: string) => void
}) {
  const titleId = useId()
  const [query, setQuery] = useState("")
  const search = useDebounced(query.trim(), SEARCH_DEBOUNCE_MS)
  const { records, isLoading, isLoadingMore, hasMore, loadMore, error } =
    useOwnActivities(did, search)
  const del = useDeleteFlow<ActivityRecord>(
    (a) =>
      deleteOwnRecord(did, ACTIVITY_COLLECTION, rkeyFromUri(a.uri), "Couldn't delete this activity. Try again."),
    onDeleted,
  )

  const rows = records.filter((a) => !removed.has(a.uri))
  const searching = search.length > 0

  return (
    <section className="records-pane" aria-labelledby={titleId}>
      <PaneHeader
        titleId={titleId}
        title="Activities"
        description="Activities you published, here or in other apps. Open one to see it, or edit and delete it from its row."
        action={
          <Button href="/create" variant="primary" size="sm">
            <Plus size={14} aria-hidden />
            New activity
          </Button>
        }
      />
      {rows.length > 0 || searching || query ? (
        <SearchField value={query} onChange={setQuery} label="Search your activities" />
      ) : null}

      {isLoading ? (
        <div className="records-pane__loading"><LoadingSpinner size="sm" /></div>
      ) : error && rows.length === 0 ? (
        <p className="records-pane__note">Couldn&apos;t load your activities. Try again in a moment.</p>
      ) : rows.length === 0 && searching ? (
        <p className="records-pane__note">No activities match “{search}”.</p>
      ) : rows.length === 0 ? (
        <EmptyState icon={CertIcon} title="No activities yet">
          <Button href="/create" variant="secondary" size="sm">Create an activity</Button>
        </EmptyState>
      ) : (
        <ul className="records-list">
          {rows.map((a) => {
            const rkey = rkeyFromUri(a.uri)
            const title = a.value.title || "Untitled activity"
            return (
              <RecordRow
                key={a.uri}
                href={recordUrl(actor, "activity", rkey)}
                editHref={`${recordUrl(actor, "activity", rkey)}/edit`}
                title={title}
                meta={a.value.createdAt ? `Created ${formatShortDate(a.value.createdAt)}` : "Activity"}
                imageUrl={a.value.image ? resolveActivityImageUrl(a.value.image, did) : null}
                icon={<CertIcon size={16} strokeWidth={1.5} aria-hidden />}
                onDelete={() => del.ask(a)}
              />
            )
          })}
        </ul>
      )}
      {hasMore && !isLoading ? (
        <LoadMoreSentinel
          onLoadMore={loadMore}
          isLoading={isLoadingMore}
          className="records-pane__more"
        />
      ) : null}

      {del.target ? (
        <DeleteRecordDialog
          title="Delete activity"
          recordName={del.target.value.title || "Untitled activity"}
          recordTypeLabel="activity"
          isDeleting={del.isDeleting}
          errorMessage={del.error}
          onCancel={del.cancel}
          onConfirm={del.confirm}
        />
      ) : null}
    </section>
  )
}

// -------------------------------- Projects ----------------------------------

export function ProjectsPane({
  did,
  actor,
  removed,
  onDeleted,
}: {
  did: string
  actor: string
  removed: ReadonlySet<string>
  onDeleted: (uri: string) => void
}) {
  const titleId = useId()
  const { projects, isLoading, error } = useUserProjects(did)
  const [query, setQuery] = useState("")
  const del = useDeleteFlow<(typeof projects)[number]>(
    (p) =>
      deleteOwnRecord(did, PROJECT_COLLECTION, rkeyFromUri(p.uri), "Couldn't delete this project. Try again."),
    onDeleted,
  )

  const q = query.trim().toLowerCase()
  const rows = projects.filter(
    (p) =>
      !removed.has(p.uri) &&
      (!q || projectTitle(p.value).toLowerCase().includes(q)),
  )

  return (
    <section className="records-pane" aria-labelledby={titleId}>
      <PaneHeader
        titleId={titleId}
        title="Projects"
        description="Projects you created. Each one groups activities under one name."
        action={
          <Button href="/project/new" variant="primary" size="sm">
            <Plus size={14} aria-hidden />
            New project
          </Button>
        }
      />
      {projects.length > 0 ? (
        <SearchField value={query} onChange={setQuery} label="Search your projects" />
      ) : null}

      {isLoading && projects.length === 0 ? (
        <div className="records-pane__loading"><LoadingSpinner size="sm" /></div>
      ) : error && projects.length === 0 ? (
        <p className="records-pane__note">Couldn&apos;t load your projects. Try again in a moment.</p>
      ) : projects.length === 0 ? (
        <EmptyState icon={FolderGit2} title="No projects yet">
          <Button href="/project/new" variant="secondary" size="sm">Create a project</Button>
        </EmptyState>
      ) : rows.length === 0 ? (
        <p className="records-pane__note">No projects match “{query}”.</p>
      ) : (
        <ul className="records-list">
          {rows.map((p) => {
            const rkey = rkeyFromUri(p.uri)
            const title = projectTitle(p.value)
            const raw = projectImage(p.value, "thumb")
            return (
              <RecordRow
                key={p.uri}
                href={recordUrl(actor, "project", rkey)}
                editHref={`${recordUrl(actor, "project", rkey)}/edit`}
                title={title}
                meta={p.value.createdAt ? `Created ${formatShortDate(p.value.createdAt)}` : "Project"}
                imageUrl={raw ? resolveActivityImageUrl(raw, did) : null}
                icon={<FolderGit2 size={16} strokeWidth={1.5} aria-hidden />}
                onDelete={() => del.ask(p)}
              />
            )
          })}
        </ul>
      )}

      {del.target ? (
        <DeleteRecordDialog
          title="Delete project"
          recordName={projectTitle(del.target.value)}
          recordTypeLabel="project"
          isDeleting={del.isDeleting}
          errorMessage={del.error}
          onCancel={del.cancel}
          onConfirm={del.confirm}
        />
      ) : null}
    </section>
  )
}

// ------------------------------ Endorsements --------------------------------

export function EndorsementsPane({ did, given }: { did: string; given: GivenState }) {
  const titleId = useId()
  const [panelOpen, setPanelOpen] = useState(false)
  const existing = useMemo(
    () => new Set(given.endorsements.map((e) => e.subjectDid)),
    [given.endorsements],
  )

  return (
    <section className="records-pane" aria-labelledby={titleId}>
      <PaneHeader
        titleId={titleId}
        title="Endorsements given"
        description="Accounts you have endorsed. An endorsement can't be edited; remove it and endorse again to change the note."
        action={
          <Button
            variant="primary"
            size="sm"
            aria-expanded={panelOpen}
            onClick={() => setPanelOpen((v) => !v)}
          >
            <Plus size={14} aria-hidden />
            Endorse someone
          </Button>
        }
      />
      {panelOpen ? (
        <NewEndorsementPanel
          ownDid={did}
          existingSubjectDids={existing}
          onClose={() => setPanelOpen(false)}
          onCreated={given.refetch}
        />
      ) : null}
      {/* The profile's list view, with its remove action per row. */}
      <GivenList
        visible={given.endorsements}
        total={given.endorsements.length}
        isLoading={given.isLoading}
        error={given.error}
        onRetry={given.refetch}
        viewerIsOwner
        viewerDid={did}
        selectable={false}
        selected={EMPTY_SET}
        onToggleOne={() => {}}
        onAfterRevoke={given.refetch}
      />
    </section>
  )
}

// ------------------------------ Following -----------------------------------

function PersonRow({
  did,
  since,
  action,
}: {
  did: string
  since: string
  /** Built with the person's name, for per-person button names. */
  action: (name: string) => React.ReactNode
}) {
  const { info, isLoading } = useAuthorInfo(did)
  const name = info?.displayName || (info?.handle ? `@${info.handle}` : did)
  return (
    <li className="records-person">
      <div className="records-person__identity">
        <IdentityRow
          did={did}
          handle={info?.handle ?? undefined}
          displayName={info?.displayName ?? undefined}
          avatarUrl={info?.avatarUrl ?? undefined}
          href={profileUrl(info?.handle || did)}
          loading={isLoading && !info}
        />
      </div>
      {since ? (
        <span className="records-person__since">Since {formatShortDate(since)}</span>
      ) : null}
      <div className="records-person__action">{action(name)}</div>
    </li>
  )
}

export function FollowingPane({ did, following }: { did: string; following: FollowingState }) {
  const titleId = useId()
  const [shown, setShown] = useState(PEOPLE_PAGE)
  // Accounts unfollowed on this page keep their row (with a Follow button)
  // until the pane closes, so an accidental unfollow can be undone.
  const [unfollowed, setUnfollowed] = useState<ReadonlyMap<string, FollowRecord>>(new Map())
  const rows = useMemo(() => {
    const bySubject = new Map<string, FollowRecord>()
    for (const r of following.records) {
      if (following.subjects.has(r.value.subject)) bySubject.set(r.value.subject, r)
    }
    for (const [subject, r] of unfollowed) {
      if (!bySubject.has(subject)) bySubject.set(subject, r)
    }
    return [...bySubject.values()].sort((a, b) =>
      a.value.createdAt < b.value.createdAt ? 1 : -1,
    )
  }, [following.records, following.subjects, unfollowed])

  return (
    <section className="records-pane" aria-labelledby={titleId}>
      <PaneHeader
        titleId={titleId}
        title="Following"
        description="Accounts you follow. What they publish shows in your feed."
        action={
          <Button href="/explore" variant="secondary" size="sm">
            <Compass size={14} aria-hidden />
            Find accounts
          </Button>
        }
      />
      {following.isLoading && rows.length === 0 ? (
        <div className="records-pane__loading"><LoadingSpinner size="sm" /></div>
      ) : following.error && rows.length === 0 ? (
        <p className="records-pane__note">Couldn&apos;t load who you follow. Try again in a moment.</p>
      ) : rows.length === 0 ? (
        <EmptyState icon={Compass} title="You're not following anyone yet">
          <Button href="/explore" variant="secondary" size="sm">Find accounts on Explore</Button>
        </EmptyState>
      ) : (
        <ul className="records-list">
          {rows.slice(0, shown).map((r) => {
            const subject = r.value.subject
            return (
              <PersonRow
                key={subject}
                did={subject}
                since={r.value.createdAt}
                action={(name) => (
                  <FollowButton
                    viewerDid={did}
                    subjectDid={subject}
                    subjectName={name}
                    isFollowing={following.subjects.has(subject)}
                    isLoading={false}
                    onFollowed={(uri, cid) => {
                      following.addFollow(subject, uri, cid)
                      setUnfollowed((prev) => {
                        const next = new Map(prev)
                        next.delete(subject)
                        return next
                      })
                    }}
                    onUnfollowed={() => {
                      following.removeFollow(subject)
                      setUnfollowed((prev) => new Map(prev).set(subject, r))
                    }}
                  />
                )}
              />
            )
          })}
        </ul>
      )}
      {rows.length > shown ? (
        <div className="records-pane__more">
          <Button variant="secondary" size="sm" onClick={() => setShown((n) => n + PEOPLE_PAGE)}>
            Show more
          </Button>
        </div>
      ) : null}
    </section>
  )
}

// ------------------------------ Followers -----------------------------------

export function FollowersPane({ did, following }: { did: string; following: FollowingState }) {
  const titleId = useId()
  const followers = useFollowers(did)
  const [shown, setShown] = useState(PEOPLE_PAGE)

  return (
    <section className="records-pane" aria-labelledby={titleId}>
      <PaneHeader
        titleId={titleId}
        title="Followers"
        description="Accounts that follow you. A follow is the follower's record, so it can't be removed here; you can follow them back."
      />
      {followers.isLoading && followers.entries.length === 0 ? (
        <div className="records-pane__loading"><LoadingSpinner size="sm" /></div>
      ) : followers.error && followers.entries.length === 0 ? (
        <p className="records-pane__note">Couldn&apos;t load your followers. Try again in a moment.</p>
      ) : followers.entries.length === 0 ? (
        <p className="records-pane__note">No followers yet.</p>
      ) : (
        <ul className="records-list">
          {followers.entries.slice(0, shown).map((f) => (
            <PersonRow
              key={f.uri}
              did={f.followerDid}
              since={f.createdAt}
              action={(name) => (
                <FollowButton
                  viewerDid={did}
                  subjectDid={f.followerDid}
                  subjectName={name}
                  isFollowing={following.subjects.has(f.followerDid)}
                  isLoading={following.isLoading}
                  onFollowed={(uri, cid) => following.addFollow(f.followerDid, uri, cid)}
                  onUnfollowed={() => following.removeFollow(f.followerDid)}
                />
              )}
            />
          ))}
        </ul>
      )}
      {followers.entries.length > shown ? (
        <div className="records-pane__more">
          <Button variant="secondary" size="sm" onClick={() => setShown((n) => n + PEOPLE_PAGE)}>
            Show more
          </Button>
        </div>
      ) : null}
    </section>
  )
}

// --------------------------------- Lists ------------------------------------

type ListsView = "records" | "endorsements"

export function ListsPane({ did }: { did: string }) {
  const titleId = useId()
  // One manager at a time: showing both stacked put an open list's detail
  // above the other manager's overview.
  const [view, setView] = useState<ListsView>("records")
  return (
    <section className="records-pane" aria-labelledby={titleId}>
      <PaneHeader
        titleId={titleId}
        title="Lists"
        description="Your lists of activities, projects and accounts, and your lists of endorsed accounts. Open a list to rename it, add to it or delete it."
      />
      <SegmentedControl
        aria-label="Kind of list"
        value={view}
        onValueChange={(v) => setView(v as ListsView)}
        options={[
          { value: "records", label: "Your lists" },
          { value: "endorsements", label: "Endorsement lists" },
        ]}
      />
      {/* The profile's list managers, which carry create, edit and delete. */}
      {view === "records" ? (
        <ProfileLists did={did} viewerIsOwner />
      ) : (
        <EndorsementLists did={did} viewerIsOwner />
      )}
    </section>
  )
}
