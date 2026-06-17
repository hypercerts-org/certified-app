"use client"

import { useMemo } from "react"
import { useActivity } from "@/hooks/use-activity"
import { useHyperboard } from "@/hooks/use-hyperboard"
import LoadingSpinner from "@/components/ui/loading-spinner"
import { ContributorBoard } from "@/components/contributor-board/contributor-board"

/**
 * Public, auth-less renderer for an embedded contributor board. Reads the
 * activity (public getRecord) for its contributors, then builds + renders the
 * weighted treemap. No edit affordances.
 */
export function EmbedBoardClient({ did, rkey }: { did: string; rkey: string }) {
  const { activity, isLoading, error } = useActivity(did, rkey)
  const contributors = useMemo(
    () => activity?.value.contributors ?? [],
    [activity],
  )
  const { config, entries, isLoading: boardLoading } = useHyperboard(
    did,
    rkey,
    contributors,
  )

  if (error) {
    return <p className="contributor-board__empty">Board not found.</p>
  }
  if ((isLoading || boardLoading) && entries.length === 0) {
    return (
      <div className="cert-detail__funding-loading">
        <LoadingSpinner size="sm" />
      </div>
    )
  }
  return (
    <ContributorBoard
      entries={entries}
      config={config}
      boardDid={did}
      emptyMessage="No contributors on this board yet."
    />
  )
}

export default EmbedBoardClient
