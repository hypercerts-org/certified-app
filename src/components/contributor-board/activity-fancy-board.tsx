"use client"

import { useHyperboard } from "@/hooks/use-hyperboard"
import LoadingSpinner from "@/components/ui/loading-spinner"
import { FancyContributorBoard } from "./fancy-contributor-board"
import type { ActivityContributor } from "@/lib/atproto/activity-types"

interface ActivityFancyBoardProps {
  /** the activity author / repo DID */
  did: string
  /** the activity record key */
  rkey: string | null
  contributors: ActivityContributor[]
}

/**
 * The "Board ✦" tab: a deluxe, read-only rendering of the same contributor
 * board record that the standard Contributor Board tab edits. It reuses the
 * weighted treemap geometry but skins it with depth, glow, rank medals, and
 * motion. Edits still happen on the plain Contributor Board tab — this is a
 * showcase view, so there's no edit affordance here.
 */
export function ActivityFancyBoard({
  did,
  rkey,
  contributors,
}: ActivityFancyBoardProps) {
  const { config, entries, isLoading } = useHyperboard(did, rkey, contributors)

  return (
    <section className="cert-detail__section">
      <div className="cert-detail__section-header">
        <h2 className="cert-detail__section-title">Contributor Board</h2>
        <span className="cert-detail__section-count">{entries.length}</span>
      </div>

      {isLoading && entries.length === 0 ? (
        <div className="cert-detail__funding-loading">
          <LoadingSpinner size="sm" />
        </div>
      ) : (
        <FancyContributorBoard
          entries={entries}
          config={config}
          boardDid={did}
        />
      )}
    </section>
  )
}

export default ActivityFancyBoard
