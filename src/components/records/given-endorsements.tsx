"use client"

import { ThumbsUp } from "lucide-react"
import Button from "@/components/ui/button"
import EmptyState from "@/components/ui/empty-state"
import EndorsementSubjectRow from "@/components/endorsements/endorsement-subject-row"
import { RevokeGivenButton } from "@/components/profile/profile-endorsement-views"
import { useAuthorInfo } from "@/hooks/use-author-info"
import type { GivenEndorsement } from "@/hooks/use-endorsements"
import { deriveIdentity } from "@/lib/utils/identity"
import { ENDORSEMENT_ROW_CLASSES } from "@/components/records/received-endorsements"
import { RowsSkeleton } from "@/components/records/records-shared"

/**
 * One endorsement you gave: who, when, the note, and Revoke. The same row
 * as Received (`records-person`, the people size), so both tabs line up.
 */
function GivenRow({
  endorsement,
  did,
  onAfterRevoke,
}: {
  endorsement: GivenEndorsement
  did: string
  onAfterRevoke: () => void | Promise<void>
}) {
  const { info, isLoading } = useAuthorInfo(endorsement.subjectDid)
  // The same derivation the row renders, so the button's name and the
  // confirm dialog match the visible name.
  const { displayName } = deriveIdentity(info, endorsement.subjectDid)
  return (
    <li className="records-person records-person--endorsement">
      <EndorsementSubjectRow
        did={endorsement.subjectDid}
        info={info}
        isLoading={isLoading}
        createdAt={endorsement.createdAt}
        note={endorsement.note}
        avatarSize="row"
        classes={ENDORSEMENT_ROW_CLASSES}
        trailing={
          <div className="records-person__action">
            <RevokeGivenButton
              appearance="text"
              viewerDid={did}
              rkeys={endorsement.rkeys}
              subjectDisplay={displayName}
              onAfterRevoke={onAfterRevoke}
            />
          </div>
        }
      />
    </li>
  )
}

/**
 * Endorsements you gave, newest first, each with Revoke (it asks first,
 * then deletes every award you gave that account).
 */
export default function GivenEndorsements({
  did,
  endorsements,
  isLoading,
  error,
  onRetry,
}: {
  did: string
  endorsements: GivenEndorsement[]
  isLoading: boolean
  error: string | null
  /** Loads them again; also what a revoke calls once it is written. */
  onRetry: () => void | Promise<void>
}) {
  if (isLoading && endorsements.length === 0) return <RowsSkeleton shape="circle" rows={4} />
  if (error && endorsements.length === 0) {
    return (
      <EmptyState variant="inline" title="Couldn't load the endorsements you gave.">
        <Button variant="ghost" size="sm" onClick={() => void onRetry()}>
          Try again
        </Button>
      </EmptyState>
    )
  }
  // No button of its own: "Endorse someone" is in the pane's header.
  if (endorsements.length === 0) {
    return (
      <EmptyState
        icon={ThumbsUp}
        headingLevel={2}
        title="No endorsements given yet"
        description="Accounts you endorse show here."
      />
    )
  }
  return (
    <ul className="records-list">
      {endorsements.map((e) => (
        <GivenRow key={e.uri} endorsement={e} did={did} onAfterRevoke={onRetry} />
      ))}
    </ul>
  )
}
