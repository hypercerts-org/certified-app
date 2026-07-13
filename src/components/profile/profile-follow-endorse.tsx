"use client"

import { useEffect, useState } from "react"
import { Check, ThumbsUp, UserPlus } from "lucide-react"
import Button from "@/components/ui/button"
import ConfirmDialog from "@/components/ui/confirm-dialog"
import { useAuth } from "@/lib/auth/auth-context"
import { useSession } from "@/hooks/use-session"
import { useOrg } from "@/lib/groups/org-context"
import type { Group } from "@/lib/groups/types"
import { useFollowing } from "@/hooks/use-following"
import { useFollowers } from "@/hooks/use-followers"
import { useGivenEndorsements } from "@/hooks/use-endorsements"
import {
  addOptimisticReceivedEndorsement,
  removeOptimisticReceivedEndorsement,
} from "@/hooks/use-received-endorsements"
import { useEndorsementLists } from "@/hooks/use-endorsement-lists"
import { useAuthorInfo } from "@/hooks/use-author-info"
import { deriveIdentity } from "@/lib/utils/identity"
import EndorseReasonModal, {
  type EndorseReasonActingAs,
} from "@/components/profile/endorse-reason-modal"
import { runEndorseReasonConfirm } from "@/components/profile/endorse-reason-confirm"
import { createFollow, deleteFollow, listFollowing } from "@/lib/atproto/follow"
import {
  createEndorsementAward,
  deleteEndorsementAward,
} from "@/lib/atproto/badges"
import { appendItemToList } from "@/lib/atproto/collection"

/**
 * Shared Follow + Endorse action pair for a foreign profile. Used by both
 * the desktop sidebar (`<ProfileSidebar>`) and the mobile header
 * (`<ProfileHeader>`) so the two surfaces stay in lock-step rather than
 * one carrying the live flow and the other a dead placeholder.
 *
 * Renders nothing for own-profile views; a disabled "Follow" when signed
 * out; the live Follow + Endorse toggles otherwise. Returns the buttons
 * directly — the caller supplies the row wrapper (the sidebar and header
 * style their action rows differently).
 *
 * Acting-as-group is honoured: when a group is active the writes route to
 * the group's repo and the button state tracks the group's follow /
 * endorsement sets (mirrors the sidebar's original inline wiring).
 */
export function FollowEndorseActions({ did }: { did: string }) {
  const { did: viewerDid, isAuthenticated } = useAuth()
  const { handle: operatorHandle } = useSession()
  const { activeOrg } = useOrg()
  const isOwnProfile = !!viewerDid && viewerDid === did
  // The repo we're acting as — the active group, or the viewer when
  // personal. Drives the Follow / Endorse button state.
  const actingDid = activeOrg?.groupDid ?? viewerDid
  // The acting repo's "following" set — keyed to `actingDid` (the group
  // when delegating), so Follow reflects whether the GROUP follows the
  // subject. Skipped on own-profile / signed-out views.
  const viewerFollowing = useFollowing(
    isAuthenticated && !isOwnProfile ? actingDid : null,
  )
  const viewedFollowers = useFollowers(did)

  if (isOwnProfile) return null

  if (!isAuthenticated || !viewerDid || !actingDid) {
    return (
      <Button variant="primary" size="sm" disabled>
        <UserPlus size={14} strokeWidth={1.75} aria-hidden />
        Follow
      </Button>
    )
  }

  return (
    <>
      <FollowButton
        viewerDid={viewerDid}
        subjectDid={did}
        targetDid={activeOrg?.groupDid}
        isFollowing={viewerFollowing.subjects.has(did)}
        isLoading={viewerFollowing.isLoading}
        onFollowed={(uri, cid) => {
          // Both surfaces update instantly: the acting repo's "following"
          // set gains the subject; the foreign profile's follower list
          // gains the acting repo (group when delegating, viewer
          // otherwise).
          viewerFollowing.addFollow(did, uri, cid)
          viewedFollowers.addFollower(actingDid, uri, cid)
        }}
        onUnfollowed={() => {
          viewerFollowing.removeFollow(did)
          viewedFollowers.removeFollower(actingDid)
        }}
      />
      <EndorseButton
        viewerDid={viewerDid}
        subjectDid={did}
        actingDid={actingDid}
        activeOrg={activeOrg}
        operatorHandle={operatorHandle}
      />
    </>
  )
}

/* ------------------------------ Follow ------------------------------
 *
 * Follow / Following toggle, shown to signed-in viewers who are looking
 * at someone else's profile. Optimistically flips its own label while
 * the write is in flight; the parent's optimistic-update callbacks keep
 * the viewer's following set and the subject's follower list in sync.
 */

interface FollowButtonProps {
  viewerDid: string
  subjectDid: string
  /** When set (acting-as-group), the follow write routes to the group's
   *  repo via the BFF instead of the viewer's personal PDS. */
  targetDid?: string
  isFollowing: boolean
  isLoading: boolean
  /** Fired after a successful createFollow with the new record's strong
   *  ref. Caller does the optimistic state update on both the viewer's
   *  "following" hook and the subject's "followers" hook. */
  onFollowed: (uri: string, cid: string) => void
  /** Fired after a successful deleteFollow. Caller does the optimistic
   *  state update mirroring `onFollowed`. */
  onUnfollowed: () => void
}

export function FollowButton({
  viewerDid,
  subjectDid,
  targetDid,
  isFollowing,
  isLoading,
  onFollowed,
  onUnfollowed,
}: FollowButtonProps) {
  const [isWriting, setIsWriting] = useState(false)
  const disabled = isLoading || isWriting
  // The repo the follow record lives in — the group when delegating, the
  // viewer otherwise.
  const actingRepo = targetDid ?? viewerDid

  const handleClick = async () => {
    if (disabled) return
    const next = !isFollowing
    setIsWriting(true)
    try {
      if (next) {
        const result = await createFollow(viewerDid, subjectDid, { targetDid })
        onFollowed(result.uri, result.cid)
      } else {
        // Unfollow path: walk the acting repo's follows to find the rkey
        // targeting this subject. Fetched fresh to handle the
        // duplicate-follow edge case (delete the most recent record).
        const { records } = await listFollowing(actingRepo, undefined, {
          noCache: true,
        })
        const match = records
          .filter((r) => r.value.subject === subjectDid)
          .sort((a, b) => (a.value.createdAt < b.value.createdAt ? 1 : -1))[0]
        if (match) {
          await deleteFollow(viewerDid, match.rkey, { targetDid })
        }
        onUnfollowed()
      }
    } catch (err) {
      console.error("Follow toggle failed:", err)
    } finally {
      setIsWriting(false)
    }
  }

  return (
    <Button
      variant={isFollowing ? "secondary" : "primary"}
      size="sm"
      onClick={handleClick}
      disabled={disabled}
      aria-pressed={isFollowing}
    >
      {isFollowing ? (
        <Check size={14} strokeWidth={1.75} aria-hidden />
      ) : (
        <UserPlus size={14} strokeWidth={1.75} aria-hidden />
      )}
      {isFollowing ? "Following" : "Follow"}
    </Button>
  )
}

/* ----------------------------- Endorse ------------------------------
 *
 * Endorse / Endorsed toggle. Lives next to FollowButton on foreign
 * profiles. Writes against the viewer's default endorsement definition
 * (`ensureEndorsementDefinition` runs implicitly inside
 * `createEndorsementAward`). Revoking gates on a Confirm dialog because
 * endorsement deletion is silent on the recipient's side.
 */

interface EndorseButtonProps {
  viewerDid: string
  subjectDid: string
  /** The DID the endorsement is authored AS — the active group when
   *  delegating, the viewer otherwise. */
  actingDid: string
  /** The active group, when the viewer is acting as one. `null` for the
   *  personal path. */
  activeOrg: Group | null
  /** The signed-in operator's handle, surfaced in the delegation header
   *  of the reason modal. */
  operatorHandle: string | null
}

export function EndorseButton({
  viewerDid,
  subjectDid,
  actingDid,
  activeOrg,
  operatorHandle,
}: EndorseButtonProps) {
  const targetDid = activeOrg?.groupDid
  const ownGiven = useGivenEndorsements(actingDid)
  // Endorsement lists are personal-only — never load while acting as a
  // group (the reason modal hides the picker too).
  const ownLists = useEndorsementLists(activeOrg ? null : viewerDid)
  const { info: subjectInfo } = useAuthorInfo(subjectDid)
  const subjectLabel = deriveIdentity(subjectInfo, subjectDid).displayName
  const [isWriting, setIsWriting] = useState(false)
  const [confirmRevoke, setConfirmRevoke] = useState(false)
  const [reasonOpen, setReasonOpen] = useState(false)
  // Optimistic flip — the hook's `endorsements` refetch may lag the PDS
  // write by a beat, so we override locally until it catches up.
  const [optimistic, setOptimistic] = useState<boolean | null>(null)

  const existing = ownGiven.endorsements.find(
    (e) => e.subjectDid === subjectDid,
  )
  const isEndorsedFromState = !!existing
  const isEndorsed = optimistic ?? isEndorsedFromState

  useEffect(() => {
    if (optimistic !== null && isEndorsedFromState === optimistic) {
      setOptimistic(null)
    }
  }, [isEndorsedFromState, optimistic])

  const disabled = isWriting || ownGiven.isLoading

  const handleEndorseClick = () => {
    if (disabled) return
    setReasonOpen(true)
  }

  const handleReasonConfirm = async (note: string, listRkey: string | null) => {
    setOptimistic(true)
    setIsWriting(true)
    try {
      await runEndorseReasonConfirm({
        note,
        listRkey,
        createAward: (n) =>
          createEndorsementAward(viewerDid, subjectDid, n, { targetDid }),
        onAwardCreated: (award) =>
          addOptimisticReceivedEndorsement(subjectDid, {
            uri: award.uri,
            cid: award.cid,
            issuerDid: actingDid,
            createdAt: new Date().toISOString(),
            note: note || undefined,
            responseState: null,
          }),
        appendToList: (rkey, award) =>
          appendItemToList(viewerDid, rkey, award),
        refetchGiven: () => ownGiven.refetch(),
        refetchLists: () => ownLists.refetch(),
        setOptimistic,
      })
      setReasonOpen(false)
    } catch (err) {
      throw err
    } finally {
      setIsWriting(false)
    }
  }

  const handleConfirmRevoke = async () => {
    if (!existing || disabled) return
    setOptimistic(false)
    setIsWriting(true)
    try {
      await deleteEndorsementAward(viewerDid, existing.rkey, { targetDid })
      removeOptimisticReceivedEndorsement(subjectDid, existing.uri)
      await ownGiven.refetch()
      setConfirmRevoke(false)
    } catch (err) {
      console.error("Revoke endorsement failed:", err)
      setOptimistic(null)
    } finally {
      setIsWriting(false)
    }
  }

  const actingAs: EndorseReasonActingAs | undefined = activeOrg
    ? {
        orgName: activeOrg.displayName || activeOrg.handle,
        orgHandle: activeOrg.handle,
        operatorHandle: operatorHandle ?? "you",
        operatorRole: activeOrg.role,
      }
    : undefined

  return (
    <>
      <Button
        variant={isEndorsed ? "secondary" : "primary"}
        size="sm"
        onClick={isEndorsed ? () => setConfirmRevoke(true) : handleEndorseClick}
        disabled={disabled}
        aria-pressed={isEndorsed}
      >
        {isEndorsed ? (
          <Check size={14} strokeWidth={1.75} aria-hidden />
        ) : (
          <ThumbsUp size={14} strokeWidth={1.75} aria-hidden />
        )}
        {isEndorsed ? "Endorsed" : "Endorse"}
      </Button>
      {reasonOpen ? (
        <EndorseReasonModal
          subjectLabel={subjectLabel}
          actingAs={actingAs}
          lists={ownLists.lists.map((l) => ({ rkey: l.rkey, title: l.title }))}
          onConfirm={handleReasonConfirm}
          onClose={() => setReasonOpen(false)}
        />
      ) : null}
      {confirmRevoke ? (
        <ConfirmDialog
          title="Revoke endorsement?"
          message="Your endorsement will be removed from this profile. You can endorse them again later."
          confirmLabel="Revoke"
          cancelLabel="Keep endorsement"
          confirmVariant="destructive"
          isConfirming={isWriting}
          onConfirm={handleConfirmRevoke}
          onCancel={() => !isWriting && setConfirmRevoke(false)}
        />
      ) : null}
    </>
  )
}
