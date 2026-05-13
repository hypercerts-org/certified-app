"use client"

import Link from "next/link"
import { useGivenEndorsements, type GivenEndorsement } from "@/hooks/use-endorsements"
import { useReceivedEndorsements, type ReceivedEndorsement } from "@/hooks/use-received-endorsements"
import { useAuthorInfo } from "@/hooks/use-author-info"
import EndorsementRow from "@/components/endorsements/endorsement-row"
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
  const given = useGivenEndorsements(did)
  const received = useReceivedEndorsements(did)

  return (
    <div className="profile-endorsements">
      <section className="profile-endorsements__section">
        <h3 className="profile-endorsements__heading">Endorsements received</h3>
        <ReceivedBody {...received} />
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
}

function ReceivedBody({ isLoading, error, endorsements }: ReceivedBodyProps) {
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
      <p className="profile-endorsements__placeholder profile-endorsements__placeholder--centered">
        This user hasn&rsquo;t been endorsed yet.
      </p>
    )
  }
  return (
    <ul className="endorsements-list">
      {endorsements.map((e) => (
        <ReceivedRow key={e.uri} endorsement={e} />
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
 *  + handle), the note if any, and the date. */
function ReceivedRow({ endorsement }: { endorsement: ReceivedEndorsement }) {
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
    </li>
  )
}
