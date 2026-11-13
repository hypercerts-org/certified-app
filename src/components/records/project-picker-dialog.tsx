"use client"

import { useId, useMemo, useState, type RefObject } from "react"
import { Plus } from "lucide-react"
import Button from "@/components/ui/button"
import Checkbox from "@/components/ui/checkbox"
import Input from "@/components/ui/input"
import ResponsiveDialog from "@/components/ui/responsive-dialog"
import { AppDialogBody, AppDialogHeader } from "@/components/ui/app-dialog"
import { DIALOG_FOOTER_ACTIONS_CLASS } from "@/components/ui/form-dialog"
import { projectTitle, type CollectionRecord } from "@/lib/atproto/collection"
import {
  PROJECT_TITLE_MAX,
  PROJECT_TITLE_MIN,
  itemUris,
  type ItemRef,
} from "@/lib/atproto/project-items"
import { countGraphemes } from "@/lib/utils/graphemes"
import { count, matches } from "@/components/records/records-shared"

export interface PickedActivity extends ItemRef {
  title: string
}

/** One project's change, written as one record update. */
export interface ProjectChange {
  project: CollectionRecord
  add: ItemRef[]
  remove: string[]
}

type Membership = "all" | "some" | "none"

/** How many of `uris` a project already holds, as a checkbox state. */
export function membershipOf(project: CollectionRecord, uris: readonly string[]): Membership {
  const listed = new Set(itemUris(project.value.items))
  const n = uris.filter((u) => listed.has(u)).length
  return n === 0 ? "none" : n === uris.length ? "all" : "some"
}

/**
 * Pure: the writes a picker's ticks add up to. A project ticked on gets
 * every selected activity it doesn't hold yet; ticked off loses every
 * selected activity it holds; untouched (or back to how it started)
 * projects aren't written.
 */
export function changesFor(
  projects: readonly CollectionRecord[],
  activities: readonly ItemRef[],
  choices: ReadonlyMap<string, "all" | "none">,
): ProjectChange[] {
  const uris = activities.map((a) => a.uri)
  const out: ProjectChange[] = []
  for (const project of projects) {
    const choice = choices.get(project.uri)
    if (!choice) continue
    const listed = new Set(itemUris(project.value.items))
    if (choice === "all") {
      const add = activities.filter((a) => !listed.has(a.uri))
      if (add.length > 0) out.push({ project, add: [...add], remove: [] })
    } else {
      const remove = uris.filter((u) => listed.has(u))
      if (remove.length > 0) out.push({ project, add: [], remove })
    }
  }
  return out
}

/**
 * "Add to project…": every project of yours with one checkbox each. A box
 * is ticked when the project holds all the selected activities and mixed
 * when it holds some; ticking adds them, unticking removes them (the
 * activities themselves are kept). Save writes each changed project once.
 * The list ends with "New project from selection", which creates a
 * project holding the selection right here.
 */
export default function ProjectPickerDialog({
  activities,
  projects,
  onClose,
  onSave,
  onCreateProject,
  returnFocusRef,
}: {
  activities: PickedActivity[]
  projects: CollectionRecord[]
  onClose: () => void
  /** Resolves to an error message, or null once everything is written. */
  onSave: (changes: ProjectChange[]) => Promise<string | null>
  onCreateProject: (title: string) => Promise<string | null>
  /** Where focus goes on close when the opener is gone (a row menu item). */
  returnFocusRef?: RefObject<HTMLElement | null>
}) {
  const [mode, setMode] = useState<"pick" | "create">(projects.length === 0 ? "create" : "pick")
  const [query, setQuery] = useState("")
  const [choices, setChoices] = useState<ReadonlyMap<string, "all" | "none">>(new Map())
  const [newTitle, setNewTitle] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const listId = useId()

  const uris = useMemo(() => activities.map((a) => a.uri), [activities])
  const q = query.trim().toLowerCase()
  const shown = projects.filter((p) => matches(projectTitle(p.value), q))
  const changes = changesFor(projects, activities, choices)

  const what =
    activities.length === 1 ? `"${activities[0].title}"` : `${activities.length} activities`

  const stateOf = (p: CollectionRecord): Membership => {
    const choice = choices.get(p.uri)
    return choice ?? membershipOf(p, uris)
  }
  const toggle = (p: CollectionRecord) => {
    const next = stateOf(p) === "all" ? "none" : "all"
    setChoices((prev) => new Map(prev).set(p.uri, next))
  }

  const close = () => {
    if (!busy) onClose()
  }

  const save = async () => {
    if (changes.length === 0) {
      onClose()
      return
    }
    setBusy(true)
    setError(null)
    const message = await onSave(changes)
    setBusy(false)
    if (message) setError(message)
  }

  const titleLength = countGraphemes(newTitle.trim())
  const titleError =
    newTitle.trim() && titleLength < PROJECT_TITLE_MIN
      ? `Use at least ${PROJECT_TITLE_MIN} characters.`
      : titleLength > PROJECT_TITLE_MAX
        ? `Use ${PROJECT_TITLE_MAX} characters or fewer.`
        : undefined
  const canCreate = titleLength >= PROJECT_TITLE_MIN && titleLength <= PROJECT_TITLE_MAX

  const create = async () => {
    if (!canCreate) return
    setBusy(true)
    setError(null)
    const message = await onCreateProject(newTitle)
    setBusy(false)
    if (message) setError(message)
  }

  const header = (
    <AppDialogHeader
      title={mode === "pick" ? "Add to project" : "New project from selection"}
      onClose={close}
      disabled={busy}
    />
  )

  return (
    <ResponsiveDialog
      open
      onClose={close}
      ariaLabel={mode === "pick" ? "Add to project" : "New project from selection"}
      header={header}
      maxWidth={480}
      disableBackdropClose={busy}
      returnFocusRef={returnFocusRef}
    >
      <AppDialogBody>
        {mode === "pick" ? (
          <div className="records-picker">
            <p className="records-picker__lead">
              Tick a project to add {what} to it. Untick to take {activities.length === 1 ? "it" : "them"} out; nothing is deleted.
            </p>
            {projects.length > 6 ? (
              <Input
                type="search"
                size="sm"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search your projects"
                aria-label="Search your projects"
                aria-controls={listId}
              />
            ) : null}
            <ul id={listId} className="records-picker__list" aria-label="Your projects">
              {shown.map((p) => {
                const state = stateOf(p)
                const n = itemUris(p.value.items).length
                return (
                  <li key={p.uri} className="records-picker__item">
                    <Checkbox
                      checked={state === "all"}
                      indeterminate={state === "some"}
                      onChange={() => toggle(p)}
                      disabled={busy}
                      label={
                        <span className="records-picker__label">
                          <span className="records-picker__name" dir="auto">
                            {projectTitle(p.value)}
                          </span>
                          <span className="records-picker__meta">
                            {count(n, "activity", "activities")}
                            {state === "some" ? " · holds some of these" : ""}
                          </span>
                        </span>
                      }
                    />
                  </li>
                )
              })}
              {shown.length === 0 ? (
                <li className="records-picker__empty">
                  No project matches &ldquo;{query.trim()}&rdquo;.{" "}
                  <button type="button" className="records-link" onClick={() => setQuery("")}>
                    Clear search
                  </button>
                </li>
              ) : null}
            </ul>
            <Button
              variant="ghost"
              size="sm"
              className="records-picker__new"
              onClick={() => {
                setError(null)
                setMode("create")
              }}
              disabled={busy}
            >
              <Plus size={16} strokeWidth={1.75} aria-hidden />
              New project from selection
            </Button>
            {error ? (
              <p className="records-picker__error" role="alert">{error}</p>
            ) : null}
            <div className={DIALOG_FOOTER_ACTIONS_CLASS}>
              <Button variant="secondary" onClick={close} disabled={busy}>
                Cancel
              </Button>
              <Button variant="primary" onClick={save} loading={busy} disabled={busy}>
                Save
              </Button>
            </div>
          </div>
        ) : (
          <form
            className="records-picker"
            onSubmit={(e) => {
              e.preventDefault()
              void create()
            }}
          >
            <p className="records-picker__lead">
              A new project on your account, holding {what}. You can add a description and a banner on the project page afterwards.
            </p>
            <Input
              label="Project name"
              size="md"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              error={titleError}
              autoFocus
              disabled={busy}
              maxLength={800}
            />
            {error ? (
              <p className="records-picker__error" role="alert">{error}</p>
            ) : null}
            <div className={DIALOG_FOOTER_ACTIONS_CLASS}>
              {projects.length > 0 ? (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setError(null)
                    setMode("pick")
                  }}
                  disabled={busy}
                >
                  Back
                </Button>
              ) : (
                <Button variant="secondary" onClick={close} disabled={busy}>
                  Cancel
                </Button>
              )}
              <Button type="submit" variant="primary" loading={busy} disabled={busy || !canCreate}>
                Create project
              </Button>
            </div>
          </form>
        )}
      </AppDialogBody>
    </ResponsiveDialog>
  )
}
