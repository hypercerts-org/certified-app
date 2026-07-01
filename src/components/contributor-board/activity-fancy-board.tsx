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
 * The deluxe contributor board shown at the top of the Contributors tab: a
 * read-only rendering of the same board record the standard Contributor
 * Board tab edits. It reuses the weighted treemap geometry but skins it with
 * depth, a gold hover highlight, and motion. Edits still happen on the plain
 * Contributor Board tab — this is a showcase view, no edit affordance here.
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
