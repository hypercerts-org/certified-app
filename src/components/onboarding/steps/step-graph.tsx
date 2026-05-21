"use client"

import LoadingSpinner from "@/components/ui/loading-spinner"
import type {
  SocialGraphSyncStats,
} from "@/hooks/use-social-graph-sync"

/**
 * The user's intent for the social-graph sync step. Captured here so
 * the batched Finish action on Step 3 knows what (if anything) to
 * trigger after the profile commit succeeds.
 *
 * - `skip`: user chose to skip the import; Finish only commits the
 *   profile.
 * - `importAll`: user opted in to copy every bluesky-only follow into
 *   the certified graph. Finish triggers `importDids` on the candidate
 *   list at commit time.
 */
export type GraphIntent = { kind: "skip" } | { kind: "importAll" }

interface StepGraphProps {
  readonly stats: SocialGraphSyncStats
  readonly isLoading: boolean
  readonly truncated: boolean
  readonly error: string | null
  readonly intent: GraphIntent
  onChange: (intent: GraphIntent) => void
}

/**
 * Inline stats display + opt-in toggle. The actual import isn't fired
 * here — only the user's intent is captured. The Finish action on
 * Step 3 calls `importDids(stats.onlyBluesky)` against the same hook
 * the modal lifts at its root.
 */
export default function StepGraph({
  stats,
  isLoading,
  truncated,
  error,
  intent,
  onChange,
}: StepGraphProps) {
  const candidateCount = stats.onlyBluesky.length
  const overlapCount = stats.inBoth.length
  const canImport = !isLoading && !truncated && !error && candidateCount > 0

  return (
    <div className="onboarding-step onboarding-step--graph">
      <p className="onboarding-step__lede">
        Copy the people you follow on Bluesky into your Certified follow
        graph. You can skip and run this from Settings later.
      </p>

      {isLoading ? (
        <div className="onboarding-step__loading">
          <LoadingSpinner size="md" />
          <span>Comparing your Bluesky and Certified graphs…</span>
        </div>
      ) : error ? (
        <p className="onboarding-step__error" role="alert">
          {error}
        </p>
      ) : truncated ? (
        <p className="onboarding-step__error" role="alert">
          Your follow list is too large to compare safely (more than
          10,000 follows). Sync is disabled — use Settings → Sync
          social graph after onboarding to import in smaller batches.
        </p>
      ) : (
        <div className="onboarding-step__graph-stats">
          <Tile label="Follows on Bluesky only" value={candidateCount} highlight />
          <Tile label="Already on both" value={overlapCount} />
        </div>
      )}

      {canImport ? (
        <fieldset className="onboarding-step__choice">
          <legend className="onboarding-step__choice-legend">
            What should we do with the {candidateCount}{" "}
            {candidateCount === 1 ? "follow" : "follows"} that aren't on
            Certified yet?
          </legend>
          <label className="onboarding-step__radio">
            <input
              type="radio"
              name="onboarding-graph-intent"
              checked={intent.kind === "importAll"}
              onChange={() => onChange({ kind: "importAll" })}
            />
            <span>
              <strong>Import everything</strong>
              <span className="onboarding-step__radio-desc">
                Follow them on Certified too. One record per person, written
                to your repo at Finish.
              </span>
            </span>
          </label>
          <label className="onboarding-step__radio">
            <input
              type="radio"
              name="onboarding-graph-intent"
              checked={intent.kind === "skip"}
              onChange={() => onChange({ kind: "skip" })}
            />
            <span>
              <strong>Skip for now</strong>
              <span className="onboarding-step__radio-desc">
                You can revisit this from Settings → Sync social graph
                whenever you're ready.
              </span>
            </span>
          </label>
        </fieldset>
      ) : null}
    </div>
  )
}

function Tile({
  label,
  value,
  highlight,
}: {
  label: string
  value: number
  highlight?: boolean
}) {
  return (
    <div
      className={`onboarding-step__tile${
        highlight ? " onboarding-step__tile--highlight" : ""
      }`}
    >
      <span className="onboarding-step__tile-value">
        {new Intl.NumberFormat().format(value)}
      </span>
      <span className="onboarding-step__tile-label">{label}</span>
    </div>
  )
}
