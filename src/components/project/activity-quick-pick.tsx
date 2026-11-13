"use client"

import { useRef } from "react"
import { Plus } from "lucide-react"

export interface QuickPickActivity {
  uri: string
  cid: string
  title: string
}

/**
 * "Add your activities" on the new and edit project pages: the author's
 * own activities that aren't in the project yet, each a button that adds
 * it. An added activity leaves this list and shows in the project's list
 * above it, so nothing appears twice. Focus moves to the next row, so
 * keyboard users can keep adding.
 */
export default function ActivityQuickPick({
  activities,
  addedUris,
  onAdd,
}: {
  activities: readonly QuickPickActivity[]
  /** The activities already in the project. */
  addedUris: ReadonlySet<string>
  onAdd: (activity: QuickPickActivity) => void
}) {
  const listRef = useRef<HTMLUListElement>(null)
  const available = activities.filter((a) => !addedUris.has(a.uri))

  if (available.length === 0) {
    return (
      <p className="create-project__quick-pick-label">
        All your activities are in this project.
      </p>
    )
  }

  const add = (activity: QuickPickActivity, index: number) => {
    onAdd(activity)
    // The row leaves the list; put focus on the one that takes its place
    // (or the new last row) once React has re-rendered.
    requestAnimationFrame(() => {
      const buttons = listRef.current?.querySelectorAll<HTMLButtonElement>("button")
      if (!buttons || buttons.length === 0) return
      buttons[Math.min(index, buttons.length - 1)].focus()
    })
  }

  return (
    <>
      <p className="create-project__quick-pick-label">Add your activities:</p>
      <ul ref={listRef} className="create-project__quick-pick-list">
        {available.map((activity, index) => (
          <li key={activity.uri} className="create-project__quick-pick-row">
            <button
              type="button"
              className="create-project__quick-pick-add"
              aria-label={`Add ${activity.title}`}
              onClick={() => add(activity, index)}
            >
              <Plus size={14} strokeWidth={1.75} aria-hidden />
              <span className="create-project__quick-pick-title">{activity.title}</span>
            </button>
          </li>
        ))}
      </ul>
    </>
  )
}
