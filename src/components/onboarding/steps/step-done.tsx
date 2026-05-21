"use client"

import { useEffect, useRef } from "react"
import LoadingSpinner from "@/components/ui/loading-spinner"
import type { ProfileDraft } from "./step-profile"
import type { CommitState } from "../use-onboarding-commit"

interface StepDoneProps {
  readonly draft: ProfileDraft
  readonly commit: CommitState
  onRun: () => void
}

/**
 * Final step — fires the profile commit (clone blobs → putProfile)
 * automatically the moment the user navigates to this pane (either
 * by clicking the Finish tab in the step header or the Continue
 * button on Step 2). The Finish button in the modal footer is the
 * manual / "Try again" trigger for retries after an error.
 */
export default function StepDone({ draft, commit, onRun }: StepDoneProps) {
  const hasRunRef = useRef(false)
  useEffect(() => {
    if (hasRunRef.current) return
    if (commit.status !== "idle") return
    hasRunRef.current = true
    onRun()
  }, [commit.status, onRun])

  return (
    <div className="onboarding-step onboarding-step--done">
      <h3 className="onboarding-step__heading">Almost there</h3>
      <ul className="onboarding-step__checklist">
        <ChecklistItem
          label={`Save your profile as ${
            draft.displayName.trim() || "you"
          }`}
          state={profileStateLabel(commit)}
        />
      </ul>

      {commit.status === "error" && commit.error ? (
        <p className="onboarding-step__error" role="alert">
          {commit.error}
        </p>
      ) : null}

      {commit.status === "success" ? (
        <p className="onboarding-step__success">
          Welcome aboard. Your Certified profile is live.
        </p>
      ) : null}
    </div>
  )
}

type CellState = "pending" | "running" | "done" | "error"

function profileStateLabel(commit: CommitState): CellState {
  if (commit.status === "idle") return "pending"
  if (commit.status === "running") return "running"
  if (commit.status === "success") return "done"
  return "error"
}

function ChecklistItem({
  label,
  state,
}: {
  label: string
  state: CellState
}) {
  return (
    <li
      className={`onboarding-step__check onboarding-step__check--${state}`}
    >
      <span className="onboarding-step__check-icon" aria-hidden>
        {state === "running" ? (
          <LoadingSpinner size="sm" />
        ) : state === "done" ? (
          "✓"
        ) : state === "error" ? (
          "✕"
        ) : (
          "·"
        )}
      </span>
      <span className="onboarding-step__check-label">{label}</span>
    </li>
  )
}
