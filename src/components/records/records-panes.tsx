"use client"

import { useEffect, useId, useMemo, useState } from "react"
import Link from "next/link"
import {
  ChevronRight,
  Compass,
  Eye,
  Folder,
  FolderGit2,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react"
import Button from "@/components/ui/button"
import CertIcon from "@/components/ui/cert-icon"
import DeleteRecordDialog from "@/components/ui/delete-record-dialog"
import EmptyState from "@/components/ui/empty-state"
import IdentityRow from "@/components/ui/identity-row"
import Input from "@/components/ui/input"
import LoadingSpinner from "@/components/ui/loading-spinner"
import RowThumb from "@/components/ui/row-thumb"
import { Tab, TabList, TabPanel, Tabs } from "@/components/ui/tabs"
import NewEndorsementPanel from "@/components/endorsements/new-endorsement-panel"
import { GivenList, ReceivedList } from "@/components/profile/profile-endorsement-views"
import ProfileLists from "@/components/profile/profile-lists"
import EndorsementLists from "@/components/profile/endorsement-lists"
import { FollowButton } from "@/components/profile/profile-follow-endorse"
import { useAuthorInfo } from "@/hooks/use-author-info"
import { useFollowers } from "@/hooks/use-followers"
import type { useFollowing } from "@/hooks/use-following"
import type { useGivenEndorsements } from "@/hooks/use-endorsements"
import { useOwnResponseStates } from "@/hooks/use-own-response-states"
import { useProjectItems } from "@/hooks/use-project-items"
import { useReceivedEndorsements } from "@/hooks/use-received-endorsements"
import { useUserProjects } from "@/hooks/use-user-projects"
import { resolveActivityImageUrl } from "@/lib/atproto/activity"
import { parseAtUri } from "@/lib/atproto/activity-uri"
import type { ActivityRecord } from "@/lib/atproto/activity-types"
import {
  projectImage,
  projectTitle,
  type CollectionRecord,
} from "@/lib/atproto/collection"
import {
  ACTIVITY_COLLECTION,
  PROJECT_COLLECTION,
  deleteOwnRecord,
} from "@/lib/atproto/delete-own-record"
import type { FollowRecord } from "@/lib/atproto/follow"
import { fetchUserIndexerActivities } from "@/lib/atproto/indexer"
import { profileUrl, recordUrl, rkeyFromUri } from "@/lib/urls"
import { formatShortDate } from "@/lib/utils/format-date"

type FollowingState = ReturnType<typeof useFollowing>
type GivenState = ReturnType<typeof useGivenEndorsements>

/** People lists render in steps of this many rows. */
const PEOPLE_PAGE = 50
/** Own activities load from the indexer in pages of this many… */
const ACTIVITY_PAGE = 100
/** …up to this many pages, so "Without a project" can be worked out. */
const ACTIVITY_MAX_PAGES = 10
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
 * One activity: the thumbnail and title open it; Edit and Delete sit at
 * the end of the row when it is the viewer's own (an activity another
 * account published can sit in your project, but only they can change it).
 */
function ActivityRow({
  record,
  did,
  actor,
  onDelete,
}: {
  record: ActivityRecord
  /** The viewer's DID: rows from other repos are read-only. */
  did: string
  actor: string
  onDelete: (record: ActivityRecord) => void
}) {
  const parsed = parseAtUri(record.uri)
  const ownerDid = parsed?.did ?? did
  const isOwn = ownerDid === did
  const rkey = parsed?.rkey ?? rkeyFromUri(record.uri)
  const href = recordUrl(isOwn ? actor : ownerDid, "activity", rkey)
  const title = record.value.title || "Untitled activity"
  const created = record.value.createdAt ? formatShortDate(record.value.createdAt) : null
  return (
    <li className="records-row">
      <Link href={href} className="records-row__main">
        <RowThumb
          className="records-row__thumb"
          src={record.value.image ? resolveActivityImageUrl(record.value.image, ownerDid) : null}
          icon={<CertIcon size={16} strokeWidth={1.5} aria-hidden />}
        />
        <span className="records-row__text">
          <span className="records-row__title" dir="auto">{title}</span>
          <span className="records-row__meta">
            {isOwn
              ? created ? `Activity · created ${created}` : "Activity"
              : "Activity by another account"}
          </span>
        </span>
      </Link>
      {isOwn ? (
        <div className="records-row__actions">
          <Button
            href={`${href}/edit`}
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
            onClick={() => onDelete(record)}
          >
            <Trash2 size={16} strokeWidth={1.75} aria-hidden />
          </Button>
        </div>
      ) : null}
    </li>
  )
}

/**
 * Delete-with-confirmation state for one pane. `run` does the write;
 * `onDeleted(uri)` tells the page, which keeps the set of deleted URIs (so
 * a deleted row stays hidden after switching kinds and back, even while
 * the indexer still lists it).
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

/**
 * All of the signed-in person's own activities (authored only), loaded in
 * full (up to ACTIVITY_PAGE × ACTIVITY_MAX_PAGES) so the page can tell
 * which ones sit in no project.
 */
function useAllOwnActivities(did: string) {
  const [state, setState] = useState<{
    records: ActivityRecord[]
    isLoading: boolean
    error: boolean
    truncated: boolean
  }>({ records: [], isLoading: true, error: false, truncated: false })

  useEffect(() => {
    const controller = new AbortController()
    const run = async () => {
      const all: ActivityRecord[] = []
      let after: string | undefined
      for (let page = 0; page < ACTIVITY_MAX_PAGES; page++) {
        const res = await fetchUserIndexerActivities(did, {
          mode: "authored",
          first: ACTIVITY_PAGE,
          after,
          signal: controller.signal,
        })
        all.push(...res.records)
        if (!res.hasMore || !res.endCursor) {
          return { records: all, truncated: false }
        }
        after = res.endCursor
      }
      return { records: all, truncated: true }
    }
    run()
      .then(({ records, truncated }) => {
        if (controller.signal.aborted) return
        setState({ records, isLoading: false, error: false, truncated })
      })
      .catch(() => {
        if (controller.signal.aborted) return
        setState((s) => ({ ...s, isLoading: false, error: true }))
      })
    return () => controller.abort()
  }, [did])

  return state
}

/** Activity URIs listed in a project's `items`, in the project's order. */
function activityUrisOf(project: CollectionRecord): string[] {
  const items = project.value.items
  if (!Array.isArray(items)) return []
  const out: string[] = []
  for (const it of items) {
    const uri = (it as { itemIdentifier?: { uri?: unknown } } | null)?.itemIdentifier?.uri
    if (typeof uri === "string" && parseAtUri(uri)?.collection === ACTIVITY_COLLECTION) {
      out.push(uri)
    }
  }
  return out
}

function matches(text: string, q: string): boolean {
  return !q || text.toLowerCase().includes(q)
}

// --------------------------- Projects / Activities --------------------------

/**
 * Projects as folders, each holding its activities, and a last folder,
 * "Without a project", for the viewer's activities that sit in none. A
 * search narrows both the folders and the activities inside them.
 */
export function WorkPane({
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
  const { projects, isLoading: projectsLoading, error: projectsError } = useUserProjects(did)
  const own = useAllOwnActivities(did)
  const [query, setQuery] = useState("")
  const q = query.trim().toLowerCase()
  const [openFolders, setOpenFolders] = useState<ReadonlySet<string>>(EMPTY_SET)
  const toggle = (key: string) =>
    setOpenFolders((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  const deleteActivity = useDeleteFlow<ActivityRecord>(
    (a) =>
      deleteOwnRecord(did, ACTIVITY_COLLECTION, rkeyFromUri(a.uri), "Couldn't delete this activity. Try again."),
    onDeleted,
  )
  const deleteProject = useDeleteFlow<CollectionRecord>(
    (p) =>
      deleteOwnRecord(did, PROJECT_COLLECTION, rkeyFromUri(p.uri), "Couldn't delete this project. Try again."),
    onDeleted,
  )

  const liveProjects = useMemo(
    () => projects.filter((p) => !removed.has(p.uri)),
    [projects, removed],
  )
  const ownByUri = useMemo(
    () => new Map(own.records.map((a) => [a.uri, a])),
    [own.records],
  )
  // From the projects still here: deleting a project moves its activities
  // to "Without a project" at once.
  const inAProject = useMemo(() => {
    const set = new Set<string>()
    for (const p of liveProjects) for (const uri of activityUrisOf(p)) set.add(uri)
    return set
  }, [liveProjects])
  const loose = own.records.filter(
    (a) => !removed.has(a.uri) && !inAProject.has(a.uri),
  )

  // Search: a project shows when its name matches or one of its activities
  // (that we know the title of) does; matching folders open.
  const folderMatches = (p: CollectionRecord) =>
    matches(projectTitle(p.value), q) ||
    activityUrisOf(p).some((uri) => {
      const a = ownByUri.get(uri)
      return !!a && matches(a.value.title ?? "", q)
    })
  const shownProjects = q ? liveProjects.filter(folderMatches) : liveProjects
  const shownLoose = loose.filter((a) => matches(a.value.title ?? "", q))

  const isLoading = (projectsLoading && projects.length === 0) || own.isLoading
  const nothingYet = !isLoading && liveProjects.length === 0 && loose.length === 0
  const onlyLoose = liveProjects.length === 0

  return (
    <section className="records-pane" aria-labelledby={titleId}>
      <PaneHeader
        titleId={titleId}
        title="Projects and activities"
        description="Each project is a folder of its activities. Activities that belong to no project are under “Without a project”."
        action={
          <div className="records-pane__actions">
            <Button href="/project/new" variant="secondary" size="sm">
              <Plus size={14} aria-hidden />
              New project
            </Button>
            <Button href="/create" variant="primary" size="sm">
              <Plus size={14} aria-hidden />
              New activity
            </Button>
          </div>
        }
      />
      {!isLoading && !nothingYet ? (
        <SearchField
          value={query}
          onChange={setQuery}
          label="Search projects and activities"
        />
      ) : null}

      {isLoading ? (
        <div className="records-pane__loading"><LoadingSpinner size="sm" /></div>
      ) : (projectsError || own.error) && nothingYet ? (
        <p className="records-pane__note">
          Couldn&apos;t load your projects and activities. Try again in a moment.
        </p>
      ) : nothingYet ? (
        <EmptyState icon={FolderGit2} title="No projects or activities yet">
          <Button href="/create" variant="secondary" size="sm">Create an activity</Button>
        </EmptyState>
      ) : q && shownProjects.length === 0 && shownLoose.length === 0 ? (
        <p className="records-pane__note">Nothing matches “{query.trim()}”.</p>
      ) : (
        <ul className="records-folders">
          {shownProjects.map((p) => (
            <ProjectFolder
              key={p.uri}
              project={p}
              did={did}
              actor={actor}
              removed={removed}
              query={q}
              ownByUri={ownByUri}
              isOpen={!!q || openFolders.has(p.uri)}
              onToggle={() => toggle(p.uri)}
              onDeleteProject={deleteProject.ask}
              onDeleteActivity={deleteActivity.ask}
            />
          ))}
          {shownLoose.length > 0 || (!q && loose.length > 0) ? (
            <LooseFolder
              records={shownLoose}
              did={did}
              actor={actor}
              // With no projects this is the only folder: start it open.
              isOpen={!!q || onlyLoose || openFolders.has("loose")}
              onToggle={() => toggle("loose")}
              onDeleteActivity={deleteActivity.ask}
            />
          ) : null}
        </ul>
      )}
      {own.truncated ? (
        <p className="records-pane__note">
          Showing your newest {ACTIVITY_PAGE * ACTIVITY_MAX_PAGES} activities.
        </p>
      ) : null}

      {deleteActivity.target ? (
        <DeleteRecordDialog
          title="Delete activity"
          recordName={deleteActivity.target.value.title || "Untitled activity"}
          recordTypeLabel="activity"
          isDeleting={deleteActivity.isDeleting}
          errorMessage={deleteActivity.error}
          onCancel={deleteActivity.cancel}
          onConfirm={deleteActivity.confirm}
        />
      ) : null}
      {deleteProject.target ? (
        <DeleteRecordDialog
          title="Delete project"
          recordName={projectTitle(deleteProject.target.value)}
          recordTypeLabel="project"
          isDeleting={deleteProject.isDeleting}
          errorMessage={deleteProject.error}
          onCancel={deleteProject.cancel}
          onConfirm={deleteProject.confirm}
        />
      ) : null}
    </section>
  )
}

/** The folder head: a disclosure button (chevron, thumbnail, name, count)
 *  plus optional actions on the right. */
function FolderHead({
  bodyId,
  isOpen,
  onToggle,
  thumb,
  title,
  meta,
  actions,
}: {
  bodyId: string
  isOpen: boolean
  onToggle: () => void
  thumb: React.ReactNode
  title: string
  meta: string
  actions?: React.ReactNode
}) {
  return (
    <div className="records-folder__head">
      <button
        type="button"
        className="records-folder__toggle"
        aria-expanded={isOpen}
        aria-controls={bodyId}
        onClick={onToggle}
      >
        <ChevronRight
          size={16}
          strokeWidth={1.75}
          aria-hidden
          className="records-folder__chevron"
        />
        {thumb}
        <span className="records-row__text">
          <span className="records-folder__title" dir="auto">{title}</span>
          <span className="records-row__meta">{meta}</span>
        </span>
      </button>
      {actions ? <div className="records-row__actions">{actions}</div> : null}
    </div>
  )
}

function ProjectFolder({
  project,
  did,
  actor,
  removed,
  query,
  ownByUri,
  isOpen,
  onToggle,
  onDeleteProject,
  onDeleteActivity,
}: {
  project: CollectionRecord
  did: string
  actor: string
  removed: ReadonlySet<string>
  query: string
  ownByUri: ReadonlyMap<string, ActivityRecord>
  isOpen: boolean
  onToggle: () => void
  onDeleteProject: (p: CollectionRecord) => void
  onDeleteActivity: (a: ActivityRecord) => void
}) {
  const bodyId = useId()
  const title = projectTitle(project.value)
  const rkey = rkeyFromUri(project.uri)
  const href = recordUrl(actor, "project", rkey)
  const n = activityUrisOf(project).filter((u) => !removed.has(u)).length
  const raw = projectImage(project.value, "thumb")
  return (
    <li className="records-folder">
      <FolderHead
        bodyId={bodyId}
        isOpen={isOpen}
        onToggle={onToggle}
        thumb={
          <RowThumb
            className="records-row__thumb"
            src={raw ? resolveActivityImageUrl(raw, did) : null}
            icon={<Folder size={16} strokeWidth={1.5} aria-hidden />}
          />
        }
        title={title}
        meta={`Project · ${n} ${n === 1 ? "activity" : "activities"}`}
        actions={
          <>
            <Button href={href} variant="ghost" size="icon-sm" aria-label={`Open ${title}`} tooltip="Open">
              <Eye size={16} strokeWidth={1.75} aria-hidden />
            </Button>
            <Button href={`${href}/edit`} variant="ghost" size="icon-sm" aria-label={`Edit ${title}`} tooltip="Edit">
              <Pencil size={16} strokeWidth={1.75} aria-hidden />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Delete ${title}`}
              tooltip="Delete"
              onClick={() => onDeleteProject(project)}
            >
              <Trash2 size={16} strokeWidth={1.75} aria-hidden />
            </Button>
          </>
        }
      />
      {isOpen ? (
        <div id={bodyId} className="records-folder__body">
          <ProjectFolderItems
            project={project}
            did={did}
            actor={actor}
            removed={removed}
            query={query}
            ownByUri={ownByUri}
            onDeleteActivity={onDeleteActivity}
          />
        </div>
      ) : null}
    </li>
  )
}

/** A project's activities, resolved only once its folder opens. Own
 *  activities come from the page's list; others resolve through the same
 *  hook the project page uses. */
function ProjectFolderItems({
  project,
  did,
  actor,
  removed,
  query,
  ownByUri,
  onDeleteActivity,
}: {
  project: CollectionRecord
  did: string
  actor: string
  removed: ReadonlySet<string>
  query: string
  ownByUri: ReadonlyMap<string, ActivityRecord>
  onDeleteActivity: (a: ActivityRecord) => void
}) {
  const { resolutions, isLoading } = useProjectItems(project.value.items)
  const rows = resolutions
    .filter((r) => !removed.has(r.uri))
    .map((r) => ({ uri: r.uri, record: ownByUri.get(r.uri) ?? r.record, error: r.error }))
    .filter((r) => !query || (r.record && matches(r.record.value.title ?? "", query)) || !r.record)

  if (isLoading && rows.every((r) => !r.record)) {
    return <div className="records-pane__loading"><LoadingSpinner size="sm" /></div>
  }
  if (rows.length === 0) {
    return (
      <p className="records-folder__empty">
        {query ? "No activities in this project match." : "No activities in this project yet."}
      </p>
    )
  }
  return (
    <ul className="records-list records-folder__list">
      {rows.map((r) =>
        r.record ? (
          <ActivityRow
            key={r.uri}
            record={r.record}
            did={did}
            actor={actor}
            onDelete={onDeleteActivity}
          />
        ) : (
          <li key={r.uri} className="records-row records-row--missing">
            <span className="records-row__meta">
              {r.error ? "This activity couldn't be loaded." : "Loading…"}
            </span>
          </li>
        ),
      )}
    </ul>
  )
}

function LooseFolder({
  records,
  did,
  actor,
  isOpen,
  onToggle,
  onDeleteActivity,
}: {
  records: ActivityRecord[]
  did: string
  actor: string
  isOpen: boolean
  onToggle: () => void
  onDeleteActivity: (a: ActivityRecord) => void
}) {
  const bodyId = useId()
  const n = records.length
  return (
    <li className="records-folder records-folder--loose">
      <FolderHead
        bodyId={bodyId}
        isOpen={isOpen}
        onToggle={onToggle}
        thumb={
          <span className="records-row__thumb records-folder__loose-thumb" aria-hidden>
            <CertIcon size={16} strokeWidth={1.5} />
          </span>
        }
        title="Without a project"
        meta={`${n} ${n === 1 ? "activity" : "activities"}`}
      />
      {isOpen ? (
        <div id={bodyId} className="records-folder__body">
          <ul className="records-list records-folder__list">
            {records.map((a) => (
              <ActivityRow
                key={a.uri}
                record={a}
                did={did}
                actor={actor}
                onDelete={onDeleteActivity}
              />
            ))}
          </ul>
        </div>
      ) : null}
    </li>
  )
}

// ------------------------------ Endorsements --------------------------------

type EndorsementsTab = "given" | "received" | "lists"

/** Endorsements given and received, and the lists of endorsed accounts. */
export function EndorsementsPane({ did, given }: { did: string; given: GivenState }) {
  const titleId = useId()
  const [tab, setTab] = useState<EndorsementsTab>("given")
  const [panelOpen, setPanelOpen] = useState(false)
  // Hidden ones included: this is where you can show them again.
  const received = useReceivedEndorsements(did, { includeRejected: true })
  const ownStates = useOwnResponseStates()
  const existing = useMemo(
    () => new Set(given.endorsements.map((e) => e.subjectDid)),
    [given.endorsements],
  )

  return (
    <section className="records-pane" aria-labelledby={titleId}>
      <PaneHeader
        titleId={titleId}
        title="Endorsements"
        description="Endorsements you gave and received, and your lists of endorsed accounts."
        action={
          tab === "given" ? (
            <Button
              variant="primary"
              size="sm"
              aria-expanded={panelOpen}
              onClick={() => setPanelOpen((v) => !v)}
            >
              <Plus size={14} aria-hidden />
              Endorse someone
            </Button>
          ) : null
        }
      />
      <Tabs value={tab} onChange={(v) => setTab(v as EndorsementsTab)}>
        <TabList aria-label="Endorsements">
          <Tab
            value="given"
            count={given.isLoading && given.endorsements.length === 0 ? undefined : given.endorsements.length}
          >
            Given
          </Tab>
          <Tab
            value="received"
            count={received.isLoading && received.endorsements.length === 0 ? undefined : received.endorsements.length}
          >
            Received
          </Tab>
          <Tab value="lists">Lists</Tab>
        </TabList>

        <TabPanel value="given">
          <div className="records-pane__tab-body">
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
          </div>
        </TabPanel>

        <TabPanel value="received">
          <div className="records-pane__tab-body">
            {/* The profile's list view, with Show / Hide per endorsement. */}
            <ReceivedList
              visible={received.endorsements}
              total={received.endorsements.length}
              isLoading={received.isLoading}
              error={received.error}
              onRetry={received.refetch}
              responseFilter="show-all"
              viewerIsOwner
              viewerDid={did}
              resolve={ownStates.resolve}
              allResponses={ownStates.responses}
              selectable={false}
              selected={EMPTY_SET}
              onToggleOne={() => {}}
              onAfterWrite={async () => {
                ownStates.invalidate()
                await ownStates.refetch()
              }}
            />
          </div>
        </TabPanel>

        <TabPanel value="lists">
          <div className="records-pane__tab-body">
            <EndorsementLists did={did} viewerIsOwner />
          </div>
        </TabPanel>
      </Tabs>
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

// --------------------------------- Lists ------------------------------------

/** Lists of activities, projects and accounts (endorsement lists live
 *  under Endorsements). */
export function ListsPane({ did }: { did: string }) {
  const titleId = useId()
  return (
    <section className="records-pane" aria-labelledby={titleId}>
      <PaneHeader
        titleId={titleId}
        title="Lists"
        description="Your lists of activities, projects and accounts. Open a list to rename it, add to it or delete it."
      />
      {/* The profile's list manager, which carries create, edit and delete. */}
      <ProfileLists did={did} viewerIsOwner />
    </section>
  )
}
