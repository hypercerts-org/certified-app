"use client"

import { useId, useState } from "react"
import Button from "@/components/ui/button"
import Checkbox from "@/components/ui/checkbox"
import Input from "@/components/ui/input"
import ResponsiveDialog from "@/components/ui/responsive-dialog"
import { AppDialogBody, AppDialogHeader } from "@/components/ui/app-dialog"
import { DIALOG_FOOTER_ACTIONS_CLASS } from "@/components/ui/form-dialog"
import type { ActivityRecord } from "@/lib/atproto/activity-types"
import { projectTitle, type CollectionRecord } from "@/lib/atproto/collection"
import { itemUris } from "@/lib/atproto/project-items"
import { formatShortDate, formatTimePeriod } from "@/lib/utils/format-date"
import { matches } from "@/components/records/records-shared"
import type { ProjectChange } from "@/components/records/project-picker-dialog"

/**
 * Pure: the one write "Add activities" adds up to. Ticked activities the
 * project doesn't hold are added; own activities it holds that were
 * unticked are removed. Items from other accounts aren't listed here, so
 * they are never touched.
 */
export function projectChangeFor(
  project: CollectionRecord,
  activities: readonly ActivityRecord[],
  checked: ReadonlySet<string>,
): ProjectChange | null {
  const listed = new Set(itemUris(project.value.items))
  const add = activities
    .filter((a) => checked.has(a.uri) && !listed.has(a.uri))
    .map((a) => ({ uri: a.uri, cid: a.cid }))
  const remove = activities
    .filter((a) => !checked.has(a.uri) && listed.has(a.uri))
    .map((a) => a.uri)
  return add.length === 0 && remove.length === 0 ? null : { project, add, remove }
}

/**
 * "Add activities" for one project: your activities with a checkbox each,
 * ticked when the project already holds them. Unticking one takes it out
 * of the project (it isn't deleted). Save writes the project once.
 */
export default function ActivityPickerDialog({
  project,
  activities,
  onClose,
  onSave,
}: {
  project: CollectionRecord
  /** The viewer's own activities. */
  activities: ActivityRecord[]
  onClose: () => void
  /** Resolves to an error message, or null once written. */
  onSave: (change: ProjectChange) => Promise<string | null>
}) {
  const name = projectTitle(project.value)
  const [checked, setChecked] = useState<ReadonlySet<string>>(
    () => new Set(itemUris(project.value.items)),
  )
  const [query, setQuery] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const listId = useId()
  const q = query.trim().toLowerCase()
  const shown = activities.filter((a) => matches(a.value.title ?? "", q))
  const change = projectChangeFor(project, activities, checked)

  const toggle = (uri: string) =>
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(uri)) next.delete(uri)
      else next.add(uri)
      return next
    })

  const close = () => {
    if (!busy) onClose()
  }

  const save = async () => {
    if (!change) {
      onClose()
      return
    }
    setBusy(true)
    setError(null)
    const message = await onSave(change)
    setBusy(false)
    if (message) setError(message)
  }

  return (
    <ResponsiveDialog
      open
      onClose={close}
      ariaLabel={`Add activities to ${name}`}
      header={<AppDialogHeader title="Add activities" onClose={close} disabled={busy} />}
      maxWidth={480}
      disableBackdropClose={busy}
    >
      <AppDialogBody>
        <div className="records-picker">
          <p className="records-picker__lead">
            Tick the activities that belong in <strong dir="auto">{name}</strong>. Unticking one takes it out of the project; it isn&apos;t deleted.
          </p>
          {activities.length > 6 ? (
            <Input
              type="search"
              size="sm"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search your activities"
              aria-label="Search your activities"
              aria-controls={listId}
            />
          ) : null}
          <ul id={listId} className="records-picker__list" aria-label="Your activities">
            {shown.map((a) => {
              const period = formatTimePeriod(a.value.startDate ?? null, a.value.endDate ?? null)
              const meta =
                period ?? (a.value.createdAt ? `Created ${formatShortDate(a.value.createdAt)}` : "")
              return (
                <li key={a.uri} className="records-picker__item">
                  <Checkbox
                    checked={checked.has(a.uri)}
                    onChange={() => toggle(a.uri)}
                    disabled={busy}
                    label={
                      <span className="records-picker__label">
                        <span className="records-picker__name" dir="auto">
                          {a.value.title || "Untitled activity"}
                        </span>
                        {meta ? <span className="records-picker__meta">{meta}</span> : null}
                      </span>
                    }
                  />
                </li>
              )
            })}
            {activities.length === 0 ? (
              <li className="records-picker__empty">You have no activities yet.</li>
            ) : shown.length === 0 ? (
              <li className="records-picker__empty">
                No activity matches &ldquo;{query.trim()}&rdquo;.{" "}
                <button type="button" className="records-link" onClick={() => setQuery("")}>
                  Clear search
                </button>
              </li>
            ) : null}
          </ul>
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
      </AppDialogBody>
    </ResponsiveDialog>
  )
}
