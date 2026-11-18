"use client"

import { useEffect, useState } from "react"
import { ThumbsUp } from "lucide-react"
import Badge from "@/components/ui/badge"
import Button from "@/components/ui/button"
import EmptyState from "@/components/ui/empty-state"
import { useToast } from "@/components/ui/toast"
import EndorsementSubjectRow, {
  type EndorsementSubjectRowClasses,
} from "@/components/endorsements/endorsement-subject-row"
import { useAuthorInfo, type AuthorInfo } from "@/hooks/use-author-info"
import type { useOwnResponseStates } from "@/hooks/use-own-response-states"
import type { ReceivedEndorsement } from "@/hooks/use-received-endorsements"
import { createResponse, deleteAllResponsesForAward } from "@/lib/atproto/badges"
import { buildAvatarUrlFromCid } from "@/lib/atproto/profile"
import { deriveIdentity } from "@/lib/utils/identity"
import { caughtErrorMessage } from "@/lib/utils/user-error"
import { RowsSkeleton } from "@/components/records/records-shared"

type OwnStates = ReturnType<typeof useOwnResponseStates>

/** Hidden by you: your "rejected" response, or the stored state while your
 *  responses are still loading. */
export function isHiddenEndorsement(endorsement: ReceivedEndorsement, ownStates: OwnStates): boolean {
  const resolved = ownStates.resolve(endorsement.uri).state
  return resolved === "unknown" ? endorsement.responseState === "rejected" : resolved === "rejected"
}

/** The people row (Followers' size): 40px avatar, the name in `body`,
 *  the handle in `ui`. Shared by Received and Given. */
export const ENDORSEMENT_ROW_CLASSES: EndorsementSubjectRowClasses = {
  main: "records-person__main hover-tint hover-tint--bleed",
  meta: "records-person__text",
  name: "records-person__name",
  handle: "records-person__handle",
  note: "records-person__note",
  date: "records-person__since",
}

/** Issuer profile: the indexer's copy when it is complete, else a fetch. */
function useIssuerInfo(e: ReceivedEndorsement): { info: AuthorInfo | null; isLoading: boolean } {
  const issuer = e.issuer
  const avatar = buildAvatarUrlFromCid(issuer?.did ?? e.issuerDid, issuer?.avatarCid)
  const complete = !!(issuer?.handle && issuer.displayName && avatar)
  const { info: fetched, isLoading } = useAuthorInfo(complete ? null : e.issuerDid)
  if (complete && issuer) {
    return {
      info: {
        did: issuer.did,
        handle: issuer.handle ?? issuer.did,
        displayName: issuer.displayName,
        avatarUrl: avatar,
      },
      isLoading: false,
    }
  }
  return { info: fetched, isLoading }
}

/**
 * One received endorsement: who gave it, when, the note, and "Hide from
 * profile" or "Show on profile" (what the button changes is the profile).
 * A hidden one carries a "Hidden" tag after the name; its text keeps full
 * contrast.
 * Hiding writes a "rejected" response record on your account; showing
 * again removes your responses to it (the same writes the profile's
 * controls make). Acting as a group (`targetDid`), the responses are the
 * group's, written and removed through the group route
 * (`/api/groups/<did>/response`); `ownStates` is then the group's.
 */
function ReceivedRow({
  endorsement,
  did,
  targetDid,
  canRespond,
  ownStates,
}: {
  endorsement: ReceivedEndorsement
  did: string
  targetDid?: string
  canRespond: boolean
  ownStates: OwnStates
}) {
  const { info, isLoading } = useIssuerInfo(endorsement)
  const { displayName } = deriveIdentity(info, endorsement.issuerDid)
  const storedHidden = isHiddenEndorsement(endorsement, ownStates)
  // Optimistic until the refetched responses agree (AGENTS.md §15a).
  const [optimistic, setOptimistic] = useState<boolean | null>(null)
  const hidden = optimistic ?? storedHidden
  const [busy, setBusy] = useState(false)
  const { toast } = useToast()
  useEffect(() => {
    // Intentional setState in effect (TECH-814): the reconciler clears the
    // optimistic value only once the stored state confirms it.
    if (optimistic !== null && storedHidden === optimistic) setOptimistic(null)
  }, [storedHidden, optimistic])

  const toggle = async () => {
    const next = !hidden
    setBusy(true)
    setOptimistic(next)
    try {
      // With a group, the group route; without, your own repo.
      const opts = targetDid ? { targetDid } : undefined
      if (next) {
        await createResponse(did, { uri: endorsement.uri, cid: endorsement.cid }, "rejected", opts)
      } else {
        await deleteAllResponsesForAward(did, endorsement.uri, ownStates.responses, opts)
      }
      ownStates.invalidate()
      await ownStates.refetch()
    } catch (err) {
      setOptimistic(null)
      // A row action reports in a toast, as the Workspace's other row
      // actions do (work-pane.tsx), in words a person can act on.
      toast({
        title: next
          ? `Couldn't hide the endorsement from ${displayName}`
          : `Couldn't show the endorsement from ${displayName}`,
        description: caughtErrorMessage(err, "Try again in a moment"),
        variant: "error",
        duration: 0,
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className="records-person records-person--endorsement" data-hidden={hidden || undefined}>
      <EndorsementSubjectRow
        did={endorsement.issuerDid}
        info={info}
        isLoading={isLoading}
        createdAt={endorsement.createdAt}
        note={endorsement.note}
        avatarSize="row"
        classes={ENDORSEMENT_ROW_CLASSES}
        // The Workspace: the account tells the accounts apart by handle.
        showHandle
        // On the name's line, so the date and the button keep their place.
        nameAside={hidden ? <Badge variant="tag">Hidden</Badge> : null}
        trailing={
          <div className="records-person__action">
            {/* As Followers' Follow / Following: the exception (a hidden
                endorsement) gets the filled button, so it stands out in
                the list; the usual state is the quiet outlined one. */}
            {canRespond ? (
              <Button
                variant={hidden ? "primary" : "secondary"}
                size="sm"
                loading={busy}
                onClick={() => void toggle()}
                aria-label={`${hidden ? "Show on profile" : "Hide from profile"}: the endorsement from ${displayName}`}
              >
                {hidden ? "Show on profile" : "Hide from profile"}
              </Button>
            ) : null}
          </div>
        }
      />
    </li>
  )
}

/**
 * Endorsements other accounts gave you, hidden ones included (this is where
 * you show them again). Hidden ones are tagged "Hidden"; the rest show on
 * your profile. Acting as a group, the group's, hidden or shown as the
 * group (`targetDid`); without the role to write (`readOnly`), the tags
 * without the buttons.
 */
export default function ReceivedEndorsements({
  did,
  targetDid,
  readOnly = false,
  groupName,
  endorsements,
  isLoading,
  error,
  onRetry,
  ownStates,
  profileHref,
}: {
  /** The signed-in person's DID: the responses are written through it. */
  did: string
  /** Acting as a group: the group's DID; its responses live in its repo
   *  and are written through the group route. */
  targetDid?: string
  /** No Hide / Show (a member acting as the group). */
  readOnly?: boolean
  /** Acting as a group: its name, for the empty state. */
  groupName?: string
  /** The account's profile (yours or the group's), for the empty
   *  state's action. */
  profileHref: string
  endorsements: ReceivedEndorsement[]
  isLoading: boolean
  error: string | null
  onRetry: () => void
  ownStates: OwnStates
}) {
  if (isLoading && endorsements.length === 0) return <RowsSkeleton shape="circle" rows={4} />
  if (error && endorsements.length === 0) {
    return (
      <EmptyState
        variant="inline"
        title={groupName ? `Couldn't load ${groupName}'s endorsements.` : "Couldn't load your endorsements."}
      >
        <Button variant="ghost" size="sm" onClick={onRetry}>
          Try again
        </Button>
      </EmptyState>
    )
  }
  if (endorsements.length === 0) {
    return (
      <EmptyState
        icon={ThumbsUp}
        headingLevel={2}
        title="No endorsements received yet"
        description={
          groupName
            ? `When another account endorses ${groupName}, it shows here.`
            : "When another account endorses yours, it shows here. You choose which ones show on your profile."
        }
      >
        <Button href={profileHref} variant="secondary" size="sm">
          {groupName ? "View its profile" : "View your profile"}
        </Button>
      </EmptyState>
    )
  }
  return (
    <ul className="records-list">
      {endorsements.map((e) => (
        <ReceivedRow
          key={e.uri}
          endorsement={e}
          did={did}
          targetDid={targetDid}
          canRespond={!readOnly}
          ownStates={ownStates}
        />
      ))}
    </ul>
  )
}
