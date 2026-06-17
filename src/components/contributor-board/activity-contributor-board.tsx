"use client"

import { useState } from "react"
import { Pencil } from "lucide-react"
import { useHyperboard } from "@/hooks/use-hyperboard"
import { useDisplayProfile } from "@/hooks/use-display-profile"
import LoadingSpinner from "@/components/ui/loading-spinner"
import Button from "@/components/ui/button"
import { ContributorBoard } from "./contributor-board"
import { EditableContributorBoard } from "./editable-contributor-board"
import type { ActivityContributor, ClaimActivity } from "@/lib/atproto/activity-types"

interface ActivityContributorBoardProps {
  /** the activity author / repo DID */
  did: string
  /** the activity record key */
  rkey: string | null
  /** the full activity record (preserved when saving the board) */
  value: ClaimActivity
  /** the activity record CID (swap guard on save) */
  cid: string
  contributors: ActivityContributor[]
  /** viewer may edit (own-repo activities only) */
  canEdit: boolean
}

/**
 * The "Contributor Board" tab: a weighted treemap of the activity's
 * contributors. Read-only for everyone; the activity author additionally gets
 * an edit mode (add/remove people, drag-to-resize weights, cosmetics, share,
 * and their own board appearance). Renders a default board straight from the
 * contributors when the author hasn't created a board record yet.
 */
export function ActivityContributorBoard({
  did,
  rkey,
  value,
  cid,
  contributors,
  canEdit,
}: ActivityContributorBoardProps) {
  const { boardRef, config, entries, isLoading, reload } = useHyperboard(
    did,
    rkey,
    contributors,
  )
  const { profile: displayProfile } = useDisplayProfile(canEdit ? did : null)
  const [editing, setEditing] = useState(false)

  if (editing && canEdit && rkey) {
    return (
      <EditableContributorBoard
        did={did}
        rkey={rkey}
        activity={value}
        activityCid={cid}
        boardRef={boardRef}
        initialEntries={entries}
        config={config}
        displayProfile={displayProfile}
        onDone={() => {
          setEditing(false)
          reload()
        }}
      />
    )
  }

  return (
    <section className="cert-detail__section">
      <div className="cert-detail__section-header">
        <h2 className="cert-detail__section-title">Contributor Board</h2>
        <span className="cert-detail__section-count">{entries.length}</span>
        {canEdit && rkey ? (
          <div className="cert-detail__section-actions">
            <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
              <Pencil size={14} /> Edit board
            </Button>
          </div>
        ) : null}
      </div>

      {isLoading && entries.length === 0 ? (
        <div className="cert-detail__funding-loading">
          <LoadingSpinner size="sm" />
        </div>
      ) : (
        <ContributorBoard
          entries={entries}
          config={config}
          boardDid={did}
          emptyMessage={
            canEdit
              ? "No contributors on this board yet — click Edit board to add people."
              : "No contributors on this board yet."
          }
        />
      )}
    </section>
  )
}

export default ActivityContributorBoard
