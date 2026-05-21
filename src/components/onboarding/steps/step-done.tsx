"use client"

import { useEffect, useRef } from "react"
import LoadingSpinner from "@/components/ui/loading-spinner"
import type { ProfileDraft } from "./step-profile"
import type { GraphIntent } from "./step-graph"
import type { CommitState } from "../use-onboarding-commit"

interface StepDoneProps {
  readonly draft: ProfileDraft
  readonly intent: GraphIntent
  readonly commit: CommitState
  onRun: () => void
}

/**
 * Final step — summarises what's about to happen, and runs the batched
 * commit. The Finish button in the modal footer triggers `onRun`; this
 * pane mirrors the commit state so the user gets per-substep progress.
 */
export default function StepDone({
  draft,
  intent,
  commit,
  onRun,
}: StepDoneProps) {
  const hasRunRef = useRef(false)

  // Auto-run the commit the first time this pane mounts, so the user
  // doesn't have to press a button they just navigated to. The footer
  // Finish button is the manual / "Try again" trigger for retries.
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
          label={`Save your profile as @${draft.displayName.trim() || "you"}`}
          state={profileStateLabel(commit)}
        />
        <ChecklistItem
          label={
            intent.kind === "importAll"
              ? "Copy your Bluesky follows to Certified"
              : "Skip social-graph import (you can run it later)"
          }
          state={syncStateLabel(commit, intent)}
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

type CellState = "pending" | "running" | "done" | "skipped" | "error"

function profileStateLabel(commit: CommitState): CellState {
  if (commit.status === "idle") return "pending"
  if (commit.status === "running") {
    if (commit.stage === "profile-clone" || commit.stage === "profile-write")
      return "running"
    return "done"
  }
  if (commit.status === "success") return "done"
  // error
  return commit.stage === "sync" ? "done" : "error"
}

function syncStateLabel(commit: CommitState, intent: GraphIntent): CellState {
  if (intent.kind === "skip") return "skipped"
  if (commit.status === "idle") return "pending"
  if (commit.status === "running") {
    return commit.stage === "sync" ? "running" : "pending"
  }
  if (commit.status === "success") return "done"
  return commit.stage === "sync" ? "error" : "pending"
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
        ) : state === "skipped" ? (
          "—"
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
