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
  targetDid,
  canRevoke,
  onAfterRevoke,
}: {
  endorsement: GivenEndorsement
  did: string
  targetDid?: string
  canRevoke: boolean
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
        // The Workspace: the account tells the accounts apart by handle.
        showHandle
        trailing={
          <div className="records-person__action">
            {canRevoke ? (
              <RevokeGivenButton
                appearance="text"
                viewerDid={did}
                targetDid={targetDid}
                rkeys={endorsement.rkeys}
                subjectDisplay={displayName}
                onAfterRevoke={onAfterRevoke}
              />
            ) : null}
          </div>
        }
      />
    </li>
  )
}

/**
 * Endorsements you gave, newest first, each with Revoke (it asks first,
 * then deletes every award you gave that account). Acting as a group,
 * the group's, revoked as the group (`targetDid`); without the role to
 * write (`readOnly`), no Revoke.
 */
export default function GivenEndorsements({
  did,
  targetDid,
  readOnly = false,
  groupName,
  endorsements,
  isLoading,
  error,
  onRetry,
  hideEmpty = false,
}: {
  /** The signed-in person's DID: the revoke is made through it. */
  did: string
  /** Acting as a group: the group's DID; the awards live in its repo and
   *  the revoke goes through the group route. */
  targetDid?: string
  /** No Revoke (a member acting as the group). */
  readOnly?: boolean
  /** Acting as a group: its name, for the empty state. */
  groupName?: string
  endorsements: GivenEndorsement[]
  isLoading: boolean
  error: string | null
  /** Loads them again; also what a revoke calls once it is written. */
  onRetry: () => void | Promise<void>
  /** No empty state (while the Endorse someone panel is open above). */
  hideEmpty?: boolean
}) {
  if (isLoading && endorsements.length === 0) return <RowsSkeleton shape="circle" rows={4} />
  if (error && endorsements.length === 0) {
    return (
      <EmptyState
        variant="inline"
        title={
          groupName
            ? `Couldn't load the endorsements ${groupName} gave.`
            : "Couldn't load the endorsements you gave."
        }
      >
        <Button variant="ghost" size="sm" onClick={() => void onRetry()}>
          Try again
        </Button>
      </EmptyState>
    )
  }
  // No button of its own: "Endorse someone" is in the pane's header.
  if (endorsements.length === 0) {
    if (hideEmpty) return null
    return (
      <EmptyState
        icon={ThumbsUp}
        headingLevel={2}
        title="No endorsements given yet"
        description={
          groupName ? `Accounts ${groupName} endorses show here.` : "Accounts you endorse show here."
        }
      />
    )
  }
  return (
    <ul className="records-list">
      {endorsements.map((e) => (
        <GivenRow
          key={e.uri}
          endorsement={e}
          did={did}
          targetDid={targetDid}
          canRevoke={!readOnly}
          onAfterRevoke={onRetry}
        />
      ))}
    </ul>
  )
}
