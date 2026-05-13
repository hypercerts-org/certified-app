"use client"

import Link from "next/link"
import { useGivenEndorsements, type GivenEndorsement } from "@/hooks/use-endorsements"
import { useReceivedEndorsements, type ReceivedEndorsement } from "@/hooks/use-received-endorsements"
import { useOwnResponseStates } from "@/hooks/use-own-response-states"
import { useAuthorInfo } from "@/hooks/use-author-info"
import { useAuth } from "@/lib/auth/auth-context"
import EndorsementRow from "@/components/endorsements/endorsement-row"
import ResponseMenu from "@/components/badges/response-menu"
import Avatar from "@/components/ui/avatar"
import LoadingSpinner from "@/components/ui/loading-spinner"
import { formatShortDate } from "@/lib/utils/format-date"
import { getInitials } from "@/lib/utils/initials"

interface ProfileEndorsementsProps {
  /** DID of the profile being viewed. */
  readonly did: string
}

/**
 * Endorsements tab content on a user profile page.
 *
 * Read paths:
 *   - "Endorsements received" — runs the cross-network scan via
 *     useReceivedEndorsements (PDS fan-out per known issuer until
 *     the indexer exposes a `subjectDid` filter on badge awards).
 *   - "Endorsements given" — direct PDS listRecords on the profile
 *     user's own repo via useGivenEndorsements.
 *
 * Trust model: every user owns their own endorsement badge
 * definition, so the surface shows *all* badge.award records that
 * target the profile DID. No global trusted-evaluator allowlist.
 */
export default function ProfileEndorsements({ did }: ProfileEndorsementsProps) {
  const { did: viewerDid } = useAuth()
  const viewerIsOwner = !!viewerDid && viewerDid === did

  const given = useGivenEndorsements(did)
  const received = useReceivedEndorsements(did)

  // Owner-only response state. The hook is keyed on the viewer's
  // own DID via useAuth, so we only get response data for our own
  // profile — never leak per-row state for someone else's profile.
  const ownStates = useOwnResponseStates()

  return (
    <div className="profile-endorsements">
      <section className="profile-endorsements__section">
        <h3 className="profile-endorsements__heading">Endorsements received</h3>
        <ReceivedBody
          {...received}
          viewerIsOwner={viewerIsOwner}
          resolve={ownStates.resolve}
          allResponses={ownStates.responses}
          onAfterWrite={async () => {
            ownStates.invalidate()
            await ownStates.refetch()
          }}
        />
      </section>

      <section className="profile-endorsements__section">
        <h3 className="profile-endorsements__heading">Endorsements given</h3>
        <GivenBody
          isLoading={given.isLoading}
          error={given.error}
          endorsements={given.endorsements}
        />
      </section>
    </div>
  )
}

interface ReceivedBodyProps {
  isLoading: boolean
  error: string | null
  endorsements: ReceivedEndorsement[]
  viewerIsOwner: boolean
  resolve: ReturnType<typeof useOwnResponseStates>["resolve"]
  allResponses: ReturnType<typeof useOwnResponseStates>["responses"]
  onAfterWrite: () => void | Promise<void>
}

function ReceivedBody({
  isLoading,
  error,
  endorsements,
  viewerIsOwner,
  resolve,
  allResponses,
  onAfterWrite,
}: ReceivedBodyProps) {
  if (isLoading) {
    return (
      <div className="profile-endorsements__loading">
        <LoadingSpinner size="md" />
      </div>
    )
  }
  if (error) {
    return (
      <p className="profile-endorsements__placeholder">
        Couldn&rsquo;t load endorsements: {error}
      </p>
    )
  }
  if (endorsements.length === 0) {
    return (
      <p className="profile-endorsements__placeholder">
        This user hasn&rsquo;t been endorsed yet.
      </p>
    )
  }
  return (
    <ul className="endorsements-list">
      {endorsements.map((e) => (
        <ReceivedRow
          key={e.uri}
          endorsement={e}
          viewerIsOwner={viewerIsOwner}
          resolve={resolve}
          allResponses={allResponses}
          onAfterWrite={onAfterWrite}
        />
      ))}
    </ul>
  )
}

interface GivenBodyProps {
  isLoading: boolean
  error: string | null
  endorsements: GivenEndorsement[]
}

function GivenBody({ isLoading, error, endorsements }: GivenBodyProps) {
  if (isLoading) {
    return (
      <div className="profile-endorsements__loading">
        <LoadingSpinner size="md" />
      </div>
    )
  }
  if (error) {
    return (
      <p className="profile-endorsements__placeholder">
        Couldn&rsquo;t load endorsements: {error}
      </p>
    )
  }
  if (endorsements.length === 0) {
    return (
      <p className="profile-endorsements__placeholder">
        This user hasn&rsquo;t endorsed anyone yet.
      </p>
    )
  }
  return (
    <ul className="endorsements-list">
      {endorsements.map((e) => (
        <EndorsementRow
          key={e.uri}
          subjectDid={e.subjectDid}
          createdAt={e.createdAt}
          note={e.note}
        />
      ))}
    </ul>
  )
}

/** A row in "Endorsements received": shows the issuer (avatar + name
 *  + handle), the note if any, and the date. When the viewer owns
 *  the profile, the row also gets a kebab menu for hide/show/reset
 *  per the badge.response flow. */
function ReceivedRow({
  endorsement,
  viewerIsOwner,
  resolve,
  allResponses,
  onAfterWrite,
}: {
  endorsement: ReceivedEndorsement
  viewerIsOwner: boolean
  resolve: ReturnType<typeof useOwnResponseStates>["resolve"]
  allResponses: ReturnType<typeof useOwnResponseStates>["responses"]
  onAfterWrite: () => void | Promise<void>
}) {
  const { did: viewerDid } = useAuth()
  const { info, isLoading } = useAuthorInfo(endorsement.issuerDid)
  const displayName = info?.displayName || info?.handle || endorsement.issuerDid
  const handle = info?.handle && info.handle !== info.did ? info.handle : null
  const initials = getInitials(info?.displayName, endorsement.issuerDid)
  const href = `/profile/${encodeURIComponent(info?.handle || endorsement.issuerDid)}`

  return (
    <li className="endorsement-row">
      <Link href={href} className="endorsement-row__main">
        {isLoading && !info ? (
          <div className="endorsement-row__avatar-skel" aria-hidden="true" />
        ) : (
          <Avatar
            size="md"
            src={info?.avatarUrl || undefined}
            alt=""
            fallbackInitials={initials}
          />
        )}
        <div className="endorsement-row__meta">
          <span className="endorsement-row__name">{displayName}</span>
          {handle ? <span className="endorsement-row__handle">@{handle}</span> : null}
          {endorsement.note ? (
            <span className="endorsement-row__note">{endorsement.note}</span>
          ) : null}
        </div>
      </Link>
      <time
        dateTime={endorsement.createdAt}
        className="endorsement-row__date"
        title={new Date(endorsement.createdAt).toLocaleString()}
      >
        {formatShortDate(endorsement.createdAt)}
      </time>
      {viewerIsOwner ? (
        <ResponseMenu
          awardUri={endorsement.uri}
          awardCid={endorsement.cid}
          issuerDisplayName={displayName}
          ownerDid={viewerDid}
          state={resolve(endorsement.uri).state}
          allResponses={allResponses}
          onAfterWrite={onAfterWrite}
        />
      ) : null}
    </li>
  )
}
