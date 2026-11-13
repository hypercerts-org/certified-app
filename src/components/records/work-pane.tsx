"use client"

import { useEffect, useId, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import {
  ChevronRight,
  ExternalLink,
  Folder,
  FolderGit2,
  FolderPlus,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react"
import Button from "@/components/ui/button"
import CertIcon from "@/components/ui/cert-icon"
import DeleteRecordDialog from "@/components/ui/delete-record-dialog"
import EmptyState from "@/components/ui/empty-state"
import RowThumb from "@/components/ui/row-thumb"
import { useToast } from "@/components/ui/toast"
import { useProjectItems } from "@/hooks/use-project-items"
import { USER_PROJECTS_MAX, useUserProjects } from "@/hooks/use-user-projects"
import { resolveActivityImageUrl } from "@/lib/atproto/activity"
import type { ActivityRecord } from "@/lib/atproto/activity-types"
import { projectImage, projectTitle, type CollectionRecord } from "@/lib/atproto/collection"
import {
  ACTIVITY_COLLECTION,
  PROJECT_COLLECTION,
  deleteOwnRecord,
} from "@/lib/atproto/delete-own-record"
import {
  createOwnProject,
  itemUris,
  updateOwnProjectItems,
  type ItemRef,
} from "@/lib/atproto/project-items"
import { parseAtUri, recordUrl, rkeyFromUri } from "@/lib/urls"
import ActivityRow from "@/components/records/activity-row"
import ActivityPickerDialog from "@/components/records/activity-picker-dialog"
import ProjectPickerDialog, {
  type PickedActivity,
  type ProjectChange,
} from "@/components/records/project-picker-dialog"
import {
  PaneHead,
  RowMenu,
  type RowMenuEntry,
  RowsSkeleton,
  SearchField,
  count,
  matches,
} from "@/components/records/records-shared"
import {
  ACTIVITY_MAX_PAGES,
  ACTIVITY_PAGE,
  useOwnActivities,
} from "@/components/records/use-own-activities"
import { WorkspaceFrame } from "@/components/layout/workspace-shell"

const EMPTY_SET: ReadonlySet<string> = new Set()

/** Activity URIs listed in a project's `items`, in the project's order. */
function activityUrisOf(project: CollectionRecord): string[] {
  return itemUris(project.value.items).filter(
    (uri) => parseAtUri(uri)?.collection === ACTIVITY_COLLECTION,
  )
}

/** One project write that went through, kept for its toast and Undo. */
interface DoneChange {
  before: CollectionRecord
  after: CollectionRecord
  added: string[]
  removed: string[]
}

/**
 * Delete-with-confirmation state for one kind of record. `run` does the
 * write; `onDeleted(uri)` tells the page, which keeps the set of deleted
 * URIs (so a deleted row stays hidden after switching kinds and back, even
 * while the indexer still lists it).
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
 * Projects as folders, each holding its activities, and a last folder,
 * "Without a project", for the viewer's activities that sit in none. One
 * activity can sit in several projects, so it shows in each of their
 * folders, with chips naming the others.
 *
 * Own activities can be selected (a checkbox per row: shown on touch, and
 * with a mouse on hover or focus and while anything is selected). The
 * selection bar offers "Add to project…", a picker that ticks and unticks
 * projects and can start a new project from the selection. Each folder
 * has "Add activities", and each row "Remove from project". Every change
 * writes each touched project once (`updateOwnProjectItems`, personal
 * repo only) and confirms with a toast that can undo it.
 *
 * The toolbar above the folders carries the search and the page's create
 * actions: New activity (the page's one primary button) and New project.
 */
export default function WorkPane({
  did,
  actor,
  removed,
  written,
  onDeleted,
  onProjectWritten,
  onRetry,
}: {
  did: string
  /** Handle (preferred) or DID for record URLs. */
  actor: string
  /** URIs deleted on this page (kept by the page across kind switches). */
  removed: ReadonlySet<string>
  /** Projects written on this page (newer than the indexer's copy). */
  written: ReadonlyMap<string, CollectionRecord>
  onDeleted: (uri: string) => void
  onProjectWritten: (record: CollectionRecord) => void
  /** Load both lists again (the page remounts the pane). */
  onRetry: () => void
}) {
  const titleId = useId()
  const router = useRouter()
  const { toast } = useToast()
  const {
    projects: indexed,
    isLoading: projectsLoading,
    error: projectsError,
    truncated: projectsTruncated,
  } = useUserProjects(did)
  const own = useOwnActivities(did)
  // The row menu's trigger that opened the current dialog: on phones the
  // menu is a sheet whose item unmounts, so without this focus would fall
  // to <body> when the dialog closes. Null when a dialog opens from a
  // button that stays put (it gets focus back by itself).
  const returnFocus = useRef<HTMLElement | null>(null)

  const [query, setQuery] = useState("")
  const q = query.trim().toLowerCase()
  // Folders opened or closed by hand; the rest follow `defaultOpen` below.
  const [folderOverrides, setFolderOverrides] = useState<ReadonlyMap<string, boolean>>(new Map())
  const [selected, setSelected] = useState<ReadonlySet<string>>(EMPTY_SET)
  const [picking, setPicking] = useState<PickedActivity[] | null>(null)
  const [adding, setAdding] = useState<CollectionRecord | null>(null)
  const [busyRows, setBusyRows] = useState<ReadonlySet<string>>(EMPTY_SET)
  const setFolderOpen = (key: string, open: boolean) =>
    setFolderOverrides((prev) => new Map(prev).set(key, open))

  const deleteActivity = useDeleteFlow<ActivityRecord>(
    (a) =>
      deleteOwnRecord(did, ACTIVITY_COLLECTION, rkeyFromUri(a.uri), "Couldn't delete this activity. Try again"),
    onDeleted,
  )
  const deleteProject = useDeleteFlow<CollectionRecord>(
    (p) =>
      deleteOwnRecord(did, PROJECT_COLLECTION, rkeyFromUri(p.uri), "Couldn't delete this project. Try again"),
    onDeleted,
  )

  // The indexer's projects, with the versions written here laid over them
  // and projects created here (not indexed yet) first.
  const liveProjects = useMemo(() => {
    const indexedUris = new Set(indexed.map((p) => p.uri))
    const created = [...written.values()].filter((p) => !indexedUris.has(p.uri)).reverse()
    return [...created, ...indexed.map((p) => written.get(p.uri) ?? p)].filter(
      (p) => !removed.has(p.uri),
    )
  }, [indexed, written, removed])
  const ownActivities = useMemo(
    () => own.records.filter((a) => !removed.has(a.uri)),
    [own.records, removed],
  )
  const ownByUri = useMemo(
    () => new Map(ownActivities.map((a) => [a.uri, a])),
    [ownActivities],
  )
  // Which projects hold each activity (for the chips). Deleting a project
  // moves its activities to "Without a project" at once.
  const projectsByActivity = useMemo(() => {
    const map = new Map<string, CollectionRecord[]>()
    for (const p of liveProjects) {
      for (const uri of activityUrisOf(p)) {
        const list = map.get(uri)
        if (list) list.push(p)
        else map.set(uri, [p])
      }
    }
    return map
  }, [liveProjects])
  const loose = ownActivities.filter((a) => !projectsByActivity.has(a.uri))
  const otherProjects = (uri: string, folder?: CollectionRecord) =>
    (projectsByActivity.get(uri) ?? [])
      .filter((p) => p.uri !== folder?.uri)
      .map((p) => projectTitle(p.value))

  // Selection: own activities only, and only ones still here.
  const selectedLive = ownActivities.filter((a) => selected.has(a.uri))
  const toggleSelect = (uri: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(uri)) next.delete(uri)
      else next.add(uri)
      return next
    })
  const clearSelection = () => setSelected(EMPTY_SET)

  // Esc clears the selection, unless it's closing a menu or dialog.
  const hasSelection = selectedLive.length > 0
  const dialogOpen = !!picking || !!adding || !!deleteActivity.target || !!deleteProject.target
  useEffect(() => {
    if (!hasSelection || dialogOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return
      const t = e.target as Element | null
      if (t?.closest?.('[role="menu"], [role="dialog"], dialog')) return
      setSelected(EMPTY_SET)
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [hasSelection, dialogOpen])

  // ------------------------------- Writes ---------------------------------

  /** Write each change in turn; stop at the first failure. */
  const applyChanges = async (
    changes: ProjectChange[],
  ): Promise<{ done: DoneChange[]; error: string | null }> => {
    const done: DoneChange[] = []
    for (const change of changes) {
      try {
        const result = await updateOwnProjectItems(did, change.project.uri, {
          add: change.add,
          remove: change.remove,
        })
        onProjectWritten(result.record)
        done.push({
          before: change.project,
          after: result.record,
          added: result.added,
          removed: result.removed,
        })
      } catch (err) {
        const reason = err instanceof Error ? err.message : "Try again."
        return {
          done,
          error: `Couldn't update ${projectTitle(change.project.value)}. ${reason}`,
        }
      }
    }
    return { done, error: null }
  }

  const nameOf = (uri: string): string =>
    ownByUri.get(uri)?.value.title || "Untitled activity"
  const what = (uris: string[]) => (uris.length === 1 ? `"${nameOf(uris[0])}"` : count(uris.length, "activity", "activities"))

  /** Strong refs for URIs taken out of a project, so Undo can put them back. */
  const refsFor = (uris: string[], before: CollectionRecord): ItemRef[] => {
    const fromItems = new Map<string, string>()
    for (const it of Array.isArray(before.value.items) ? before.value.items : []) {
      const id = (it as { itemIdentifier?: { uri?: unknown; cid?: unknown } } | null)?.itemIdentifier
      if (typeof id?.uri === "string" && typeof id.cid === "string") fromItems.set(id.uri, id.cid)
    }
    return uris
      .map((uri) => ({ uri, cid: fromItems.get(uri) ?? ownByUri.get(uri)?.cid ?? "" }))
      .filter((r) => r.cid)
  }

  const undo = async (done: DoneChange[]) => {
    const inverse: ProjectChange[] = done.map((d) => ({
      project: d.after,
      add: refsFor(d.removed, d.before),
      remove: d.added,
    }))
    const { error } = await applyChanges(inverse)
    toast(
      error
        ? { title: "Couldn't undo the change", description: error, variant: "error", duration: 0 }
        : { title: "Change undone" },
    )
  }

  /** Confirm what was written, with Undo. */
  const announce = (done: DoneChange[]) => {
    const touched = done.filter((d) => d.added.length > 0 || d.removed.length > 0)
    if (touched.length === 0) return
    let title: string
    let description: string | undefined
    if (touched.length === 1) {
      const { after, added, removed: out } = touched[0]
      const name = projectTitle(after.value)
      if (added.length > 0 && out.length === 0) {
        title = `Added ${what(added)} to ${name}`
      } else if (out.length > 0 && added.length === 0) {
        title = `Removed ${what(out)} from ${name}`
        description =
          out.length === 1 ? "The activity itself is kept." : "The activities themselves are kept."
      } else {
        title = `Updated ${name}`
        description = `${count(added.length, "activity", "activities")} added, ${out.length} removed.`
      }
    } else {
      title = `Updated ${touched.length} projects`
    }
    toast({
      title,
      description,
      variant: "success",
      action: { label: "Undo", onClick: () => void undo(touched) },
    })
  }

  const openPicker = (records: ActivityRecord[]) =>
    setPicking(
      records.map((a) => ({
        uri: a.uri,
        cid: a.cid,
        title: a.value.title || "Untitled activity",
      })),
    )

  const savePicker = async (changes: ProjectChange[]): Promise<string | null> => {
    const { done, error } = await applyChanges(changes)
    if (error) {
      // What did go through gets its toast and Undo now; the picker stays
      // open with the error, and saving again writes only the rest (the
      // written projects already hold their change).
      const wrote = done.some((d) => d.added.length > 0 || d.removed.length > 0)
      announce(done)
      if (!wrote) return error
      return `${/[.!?]$/.test(error) ? error : `${error}.`} The other changes were saved.`
    }
    setPicking(null)
    clearSelection()
    announce(done)
    return null
  }

  const createFromSelection = async (title: string): Promise<string | null> => {
    if (!picking) return null
    try {
      const record = await createOwnProject(did, {
        title,
        items: picking.map(({ uri, cid }) => ({ uri, cid })),
      })
      onProjectWritten(record)
      setFolderOpen(record.uri, true)
      const href = recordUrl(actor, "project", rkeyFromUri(record.uri))
      toast({
        title: `Created ${projectTitle(record.value)}`,
        description: `It holds ${what(picking.map((p) => p.uri))}.`,
        variant: "success",
        action: { label: "Open project", onClick: () => router.push(href) },
      })
      setPicking(null)
      clearSelection()
      return null
    } catch (err) {
      return err instanceof Error ? err.message : "Couldn't create the project. Try again."
    }
  }

  const saveAdder = async (change: ProjectChange): Promise<string | null> => {
    const { done, error } = await applyChanges([change])
    if (error) return error
    setAdding(null)
    announce(done)
    return null
  }

  const removeFromProject = async (project: CollectionRecord, record: ActivityRecord) => {
    const key = `${project.uri}|${record.uri}`
    setBusyRows((prev) => new Set(prev).add(key))
    const { done, error } = await applyChanges([{ project, add: [], remove: [record.uri] }])
    setBusyRows((prev) => {
      const next = new Set(prev)
      next.delete(key)
      return next
    })
    if (error) {
      toast({ title: "Couldn't remove the activity", description: error, variant: "error", duration: 0 })
    } else {
      announce(done)
    }
  }

  // ------------------------------ Rendering --------------------------------

  // Search: a project shows when its name matches or one of its activities
  // (that we know the title of) does; matching folders open.
  const folderMatches = (p: CollectionRecord) =>
    matches(projectTitle(p.value), q) ||
    activityUrisOf(p).some((uri) => {
      const a = ownByUri.get(uri)
      return !!a && matches(a.value.title ?? "", q)
    })
  const projectsPending = projectsLoading && indexed.length === 0
  const isLoading = projectsPending || own.isLoading
  // Either list can fail while the other loads. "Without a project" needs
  // both, and the "Add to project" picker needs the projects: without
  // them every activity would look loose, and the picker would offer to
  // start a project that may already exist.
  const projectsFailed = !isLoading && !!projectsError
  const activitiesFailed = !isLoading && own.error
  const projectsReady = !isLoading && !projectsFailed
  const looseKnown = projectsReady && !activitiesFailed
  const shownProjects = q ? liveProjects.filter(folderMatches) : liveProjects
  const shownLoose = looseKnown ? loose.filter((a) => matches(a.value.title ?? "", q)) : []
  const showLooseFolder = looseKnown && (shownLoose.length > 0 || (!q && loose.length > 0))
  const loadError =
    projectsFailed && activitiesFailed
      ? "Couldn't load your projects and activities."
      : projectsFailed
        ? "Couldn't load your projects."
        : activitiesFailed
          ? "Couldn't load your activities."
          : null

  const nothingYet =
    !isLoading && !loadError && liveProjects.length === 0 && loose.length === 0
  // A few folders start open so their activities show at once; a long list
  // starts closed so the projects can be scanned. Searching opens every
  // folder that matches.
  const defaultOpen = liveProjects.length + (showLooseFolder ? 1 : 0) <= 3
  const isFolderOpen = (key: string) => !!q || (folderOverrides.get(key) ?? defaultOpen)
  const toggleFolder = (key: string) => setFolderOpen(key, !isFolderOpen(key))

  /** Remember the row menu that opened a dialog (see `returnFocus`). */
  const fromMenu = (trigger: HTMLElement | null) => {
    returnFocus.current = trigger
  }
  const rowProps = {
    did,
    actor,
    onToggleSelect: toggleSelect,
    onDelete: (a: ActivityRecord, trigger: HTMLElement | null) => {
      fromMenu(trigger)
      deleteActivity.ask(a)
    },
    onAddToProject: projectsReady
      ? (a: ActivityRecord, trigger: HTMLElement | null) => {
          fromMenu(trigger)
          openPicker([a])
        }
      : undefined,
  }

  return (
    <WorkspaceFrame
      // The content opens with the toolbar, a control row, not a heading.
      offset={false}
      header={<PaneHead titleId={titleId} section="activities" />}
    >
      <section
        className="records-pane records-work"
        aria-labelledby={titleId}
        data-selecting={hasSelection || undefined}
      >
        {/* One row: the search takes the width, the create actions sit at
            its end (they wrap under it on a phone). Hidden while loading
            and when there is nothing yet: the empty state below carries
            its own "New activity". */}
        {!isLoading && !nothingYet ? (
          <div className="records-pane__toolbar">
            <SearchField value={query} onChange={setQuery} label="Search projects and activities" />
            <div className="records-pane__actions">
              <Button href="/create" variant="primary" size="md">
                <Plus size={16} strokeWidth={1.75} aria-hidden />
                New activity
              </Button>
              <Button href="/project/new" variant="secondary" size="md">
                <Plus size={16} strokeWidth={1.75} aria-hidden />
                New project
              </Button>
            </div>
          </div>
        ) : null}

        {/* Announces the selection count; the bar itself mounts and unmounts. */}
        <p className="sr-only" aria-live="polite">
          {hasSelection ? `${count(selectedLive.length, "activity", "activities")} selected` : ""}
        </p>
        {/* Before the list in the DOM, so "Add to project…" is the next Tab
            stop after the search rather than after every row; CSS still
            shows it at the bottom of the pane (records.css). */}
        {hasSelection ? (
          <div className="records-selection" role="region" aria-label="Selected activities">
            <span className="records-selection__count">{selectedLive.length} selected</span>
            <div className="records-selection__actions">
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  fromMenu(null)
                  openPicker(selectedLive)
                }}
              >
                <FolderPlus size={16} strokeWidth={1.75} aria-hidden />
                Add to project…
              </Button>
              <Button variant="ghost" size="sm" onClick={clearSelection}>
                Clear
              </Button>
            </div>
          </div>
        ) : null}

        {/* A list that failed: said above whatever did load, with one retry
            (it loads both lists again). */}
        {loadError ? (
          <EmptyState variant="inline" title={loadError}>
            <Button variant="ghost" size="sm" onClick={onRetry}>
              Try again
            </Button>
          </EmptyState>
        ) : null}

        {isLoading ? (
          <RowsSkeleton rows={5} />
        ) : nothingYet ? (
          <EmptyState
            icon={FolderGit2}
            headingLevel={2}
            title="No projects or activities yet"
            description="An activity records a piece of work. Group activities into projects to show how they fit together."
          >
            <Button href="/create" variant="secondary" size="sm">
              <Plus size={16} strokeWidth={1.75} aria-hidden />
              New activity
            </Button>
          </EmptyState>
        ) : q && shownProjects.length === 0 && shownLoose.length === 0 ? (
          <EmptyState variant="inline" title={`Nothing matches "${query.trim()}".`}>
            <Button variant="ghost" size="sm" onClick={() => setQuery("")}>
              Clear search
            </Button>
          </EmptyState>
        ) : shownProjects.length === 0 && !showLooseFolder ? null : (
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
                isOpen={isFolderOpen(p.uri)}
                onToggle={() => toggleFolder(p.uri)}
                onDeleteProject={(project, trigger) => {
                  fromMenu(trigger)
                  deleteProject.ask(project)
                }}
                // "Add activities" lists your activities: not offered while
                // they couldn't be loaded.
                onAddActivities={
                  activitiesFailed
                    ? undefined
                    : (trigger) => {
                        fromMenu(trigger)
                        setAdding(p)
                      }
                }
                renderRow={(record) => (
                  <ActivityRow
                    key={record.uri}
                    record={record}
                    {...rowProps}
                    otherProjects={otherProjects(record.uri, p)}
                    selected={selected.has(record.uri)}
                    onRemoveFromProject={(r) => void removeFromProject(p, r)}
                    folderTitle={projectTitle(p.value)}
                    busy={busyRows.has(`${p.uri}|${record.uri}`)}
                  />
                )}
              />
            ))}
            {showLooseFolder ? (
              <LooseFolder
                count={shownLoose.length}
                isOpen={isFolderOpen("loose")}
                onToggle={() => toggleFolder("loose")}
              >
                {shownLoose.map((a) => (
                  <ActivityRow
                    key={a.uri}
                    record={a}
                    {...rowProps}
                    otherProjects={[]}
                    selected={selected.has(a.uri)}
                  />
                ))}
              </LooseFolder>
            ) : null}
          </ul>
        )}
        {own.truncated || projectsTruncated ? (
          <p className="records-pane__note">
            {own.truncated && projectsTruncated
              ? `Showing your newest ${ACTIVITY_PAGE * ACTIVITY_MAX_PAGES} activities and first ${USER_PROJECTS_MAX} projects.`
              : own.truncated
                ? `Showing your newest ${ACTIVITY_PAGE * ACTIVITY_MAX_PAGES} activities.`
                : `Showing your first ${USER_PROJECTS_MAX} projects.`}
          </p>
        ) : null}

        {picking && projectsReady ? (
          <ProjectPickerDialog
            activities={picking}
            projects={liveProjects}
            onClose={() => setPicking(null)}
            onSave={savePicker}
            onCreateProject={createFromSelection}
            returnFocusRef={returnFocus}
          />
        ) : null}
        {adding ? (
          <ActivityPickerDialog
            project={written.get(adding.uri) ?? adding}
            activities={ownActivities}
            onClose={() => setAdding(null)}
            onSave={saveAdder}
            returnFocusRef={returnFocus}
          />
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
            returnFocusRef={returnFocus}
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
            returnFocusRef={returnFocus}
          />
        ) : null}
      </section>
    </WorkspaceFrame>
  )
}

/** The folder head: a disclosure button (chevron, thumbnail, name, count)
 *  that opens and closes the folder, plus optional actions on the right
 *  (a project's Edit, and a menu with Open project, Add activities… and
 *  Delete). */
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
        className="records-folder__toggle hover-tint hover-tint--bleed"
        aria-expanded={isOpen}
        aria-controls={bodyId}
        onClick={onToggle}
      >
        <ChevronRight size={16} strokeWidth={1.75} aria-hidden className="records-folder__chevron" />
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
  onAddActivities,
  renderRow,
}: {
  project: CollectionRecord
  did: string
  actor: string
  removed: ReadonlySet<string>
  query: string
  ownByUri: ReadonlyMap<string, ActivityRecord>
  isOpen: boolean
  onToggle: () => void
  /** `trigger` is the folder menu's button, for the dialog's focus return. */
  onDeleteProject: (p: CollectionRecord, trigger: HTMLElement | null) => void
  /** Left out while your activities couldn't be loaded. */
  onAddActivities?: (trigger: HTMLElement | null) => void
  renderRow: (record: ActivityRecord) => React.ReactNode
}) {
  const bodyId = useId()
  const title = projectTitle(project.value)
  const href = recordUrl(actor, "project", rkeyFromUri(project.uri))
  const n = activityUrisOf(project).filter((u) => !removed.has(u)).length
  const raw = projectImage(project.value, "thumb")
  const addEntry: RowMenuEntry[] = onAddActivities
    ? [
        {
          kind: "action",
          key: "add",
          label: "Add activities…",
          icon: Plus,
          onSelect: (trigger) => onAddActivities(trigger),
        },
      ]
    : []
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
        meta={`Project · ${count(n, "activity", "activities")}`}
        actions={
          <>
            {/* A shortcut to the menu's Edit: shown on hover or focus with
                a mouse, always on touch from 800px (records.css). */}
            <Button
              href={`${href}/edit`}
              variant="ghost"
              size="icon-sm"
              aria-label={`Edit ${title}`}
              tooltip="Edit"
              className="records-row__edit records-reveal"
            >
              <Pencil size={16} strokeWidth={1.75} aria-hidden />
            </Button>
            <RowMenu
              label={`More actions for ${title}`}
              title={title}
              entries={[
                { kind: "link", key: "open", label: "Open project", href, icon: ExternalLink },
                {
                  kind: "link",
                  key: "edit",
                  label: "Edit project",
                  href: `${href}/edit`,
                  icon: Pencil,
                },
                ...addEntry,
                { kind: "separator", key: "sep" },
                {
                  kind: "action",
                  key: "delete",
                  label: "Delete",
                  icon: Trash2,
                  destructive: true,
                  onSelect: (trigger) => onDeleteProject(project, trigger),
                },
              ]}
            />
          </>
        }
      />
      {isOpen ? (
        <div id={bodyId} className="records-folder__body">
          <ProjectFolderItems
            project={project}
            removed={removed}
            query={query}
            ownByUri={ownByUri}
            renderRow={renderRow}
          />
          {onAddActivities ? (
            <div className="records-folder__foot">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onAddActivities(null)}
                aria-label={`Add activities to ${title}`}
              >
                <Plus size={16} strokeWidth={1.75} aria-hidden />
                Add activities
              </Button>
            </div>
          ) : null}
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
  removed,
  query,
  ownByUri,
  renderRow,
}: {
  project: CollectionRecord
  removed: ReadonlySet<string>
  query: string
  ownByUri: ReadonlyMap<string, ActivityRecord>
  renderRow: (record: ActivityRecord) => React.ReactNode
}) {
  const { resolutions, isLoading } = useProjectItems(project.value.items)
  const rows = resolutions
    .filter((r) => !removed.has(r.uri))
    .map((r) => ({ uri: r.uri, record: ownByUri.get(r.uri) ?? r.record, error: r.error }))
    .filter((r) => !query || !r.record || matches(r.record.value.title ?? "", query))

  if (isLoading && rows.every((r) => !r.record)) {
    return <RowsSkeleton rows={Math.min(Math.max(rows.length, 1), 3)} />
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
          renderRow(r.record)
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
  count: n,
  isOpen,
  onToggle,
  children,
}: {
  count: number
  isOpen: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  const bodyId = useId()
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
        meta={count(n, "activity", "activities")}
      />
      {isOpen ? (
        <div id={bodyId} className="records-folder__body">
          <ul className="records-list records-folder__list">{children}</ul>
        </div>
      ) : null}
    </li>
  )
}
