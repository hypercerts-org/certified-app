"use client"

import { useEffect, useState } from "react"
import { ThumbsUp } from "lucide-react"
import Badge from "@/components/ui/badge"
import Button from "@/components/ui/button"
import EmptyState from "@/components/ui/empty-state"
import EndorsementSubjectRow, {
  type EndorsementSubjectRowClasses,
} from "@/components/endorsements/endorsement-subject-row"
import { useAuthorInfo, type AuthorInfo } from "@/hooks/use-author-info"
import type { useOwnResponseStates } from "@/hooks/use-own-response-states"
import type { ReceivedEndorsement } from "@/hooks/use-received-endorsements"
import { createResponse, deleteAllResponsesForAward } from "@/lib/atproto/badges"
import { buildAvatarUrlFromCid } from "@/lib/atproto/profile"
import { deriveIdentity } from "@/lib/utils/identity"
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
  main: "records-person__main",
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
 * One received endorsement: who gave it, when, the note, and Hide or Show.
 * A hidden one carries a "Hidden" tag after the name; its text keeps full
 * contrast.
 * Hiding writes a "rejected" response record on your account; showing
 * again removes your responses to it (the same writes the profile's
 * controls make).
 */
function ReceivedRow({
  endorsement,
  did,
  ownStates,
}: {
  endorsement: ReceivedEndorsement
  did: string
  ownStates: OwnStates
}) {
  const { info, isLoading } = useIssuerInfo(endorsement)
  const { displayName } = deriveIdentity(info, endorsement.issuerDid)
  const storedHidden = isHiddenEndorsement(endorsement, ownStates)
  // Optimistic until the refetched responses agree (AGENTS.md §15a).
  const [optimistic, setOptimistic] = useState<boolean | null>(null)
  const hidden = optimistic ?? storedHidden
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    // Intentional setState in effect (TECH-814): the reconciler clears the
    // optimistic value only once the stored state confirms it.
    if (optimistic !== null && storedHidden === optimistic) setOptimistic(null)
  }, [storedHidden, optimistic])

  const toggle = async () => {
    const next = !hidden
    setBusy(true)
    setError(null)
    setOptimistic(next)
    try {
      if (next) {
        await createResponse(did, { uri: endorsement.uri, cid: endorsement.cid }, "rejected")
      } else {
        await deleteAllResponsesForAward(did, endorsement.uri, ownStates.responses)
      }
      ownStates.invalidate()
      await ownStates.refetch()
    } catch (err) {
      setOptimistic(null)
      setError(err instanceof Error ? err.message : "Couldn't save that. Try again.")
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
        // On the name's line, so the date and the button keep their place.
        nameAside={hidden ? <Badge variant="tag">Hidden</Badge> : null}
        trailing={
          <div className="records-person__action">
            <Button
              variant="secondary"
              size="sm"
              loading={busy}
              onClick={() => void toggle()}
              aria-label={`${hidden ? "Show" : "Hide"} the endorsement from ${displayName}`}
            >
              {hidden ? "Show" : "Hide"}
            </Button>
          </div>
        }
      />
      {error ? (
        <p className="records-person__error" role="alert">{error}</p>
      ) : null}
    </li>
  )
}

/**
 * Endorsements other accounts gave you, hidden ones included (this is where
 * you show them again). Hidden ones are tagged "Hidden"; the rest show on
 * your profile.
 */
export default function ReceivedEndorsements({
  did,
  endorsements,
  isLoading,
  error,
  onRetry,
  ownStates,
  profileHref,
}: {
  did: string
  /** The viewer's own profile, for the empty state's action. */
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
      <EmptyState variant="inline" title="Couldn't load your endorsements.">
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
        description="When another account endorses yours, it shows here. You choose which ones show on your profile."
      >
        <Button href={profileHref} variant="secondary" size="sm">
          View your profile
        </Button>
      </EmptyState>
    )
  }
  return (
    <ul className="records-list">
      {endorsements.map((e) => (
        <ReceivedRow key={e.uri} endorsement={e} did={did} ownStates={ownStates} />
      ))}
    </ul>
  )
}
