"use client"

import { useMemo } from "react"
import Link from "next/link"
import { useGivenEndorsements } from "@/hooks/use-endorsements"
import { useTrustedEndorsedDids, type EvaluatorAttribution } from "@/hooks/use-trusted-endorsed-dids"
import { useAuthorInfo } from "@/hooks/use-author-info"
import { ALL_EVALUATOR_DIDS, ALL_EVALUATORS_STABLE_KEY } from "@/config/trusted-evaluators"
import EndorsementRow from "@/components/endorsements/endorsement-row"
import Avatar from "@/components/ui/avatar"
import LoadingSpinner from "@/components/ui/loading-spinner"
import { formatShortDate } from "@/lib/utils/format-date"
import { getInitials } from "@/lib/utils/initials"

interface ProfileEndorsementsProps {
  /** DID of the profile being viewed. */
  readonly did: string
}

interface GivenSectionBodyProps {
  readonly isLoading: boolean
  readonly error: string | null
  readonly endorsements: ReturnType<typeof useGivenEndorsements>["endorsements"]
}

function GivenSectionBody({ isLoading, error, endorsements }: GivenSectionBodyProps) {
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
          subjectDid={e.value.subject.did}
          createdAt={e.value.createdAt}
        />
      ))}
    </ul>
  )
}

/** Renders a single endorser row (avatar + name + handle + date). */
function EndorserRow({ evaluatorDid, createdAt }: EvaluatorAttribution) {
  const { info, isLoading } = useAuthorInfo(evaluatorDid)

  const displayName = info?.displayName || info?.handle || evaluatorDid
  const handle = info?.handle && info.handle !== info.did ? info.handle : null
  const initials = getInitials(info?.displayName, evaluatorDid)
  const href = `/profile/${encodeURIComponent(info?.handle || evaluatorDid)}`

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
          {handle ? (
            <span className="endorsement-row__handle">@{handle}</span>
          ) : null}
        </div>
      </Link>
      <time
        dateTime={createdAt}
        className="endorsement-row__date"
        title={new Date(createdAt).toLocaleString()}
      >
        {formatShortDate(createdAt)}
      </time>
    </li>
  )
}

/**
 * Endorsements tab content on a user profile page. Renders two
 * sections stacked vertically:
 *
 *   - Endorsements received: fetched from all trusted evaluators via
 *     `useTrustedEndorsedDids` and filtered to this profile's DID.
 *   - Endorsements given: fetched from the profile user's own repo
 *     via listRecords.
 */
export default function ProfileEndorsements({ did }: ProfileEndorsementsProps) {
  const { endorsements, isLoading, error } = useGivenEndorsements(did)

  // Use ALL trusted evaluators (not the user's toggle selection) so
  // the profile always shows every trusted endorsement.
  const {
    attribution,
    isLoading: isEndorsedLoading,
  } = useTrustedEndorsedDids(ALL_EVALUATOR_DIDS, ALL_EVALUATORS_STABLE_KEY)

  const receivedEndorsements = useMemo(
    () => attribution.get(did) ?? [],
    [attribution, did],
  )

  return (
    <div className="profile-endorsements">
      <section className="profile-endorsements__section">
        <h3 className="profile-endorsements__heading">Endorsements received</h3>
        {isEndorsedLoading ? (
          <div className="profile-endorsements__loading">
            <LoadingSpinner size="md" />
          </div>
        ) : receivedEndorsements.length === 0 ? (
          <p className="profile-endorsements__placeholder profile-endorsements__placeholder--centered">
            This user hasn&rsquo;t been endorsed yet.
          </p>
        ) : (
          <ul className="endorsements-list">
            {receivedEndorsements.map((attr) => (
              <EndorserRow key={attr.evaluatorDid} {...attr} />
            ))}
          </ul>
        )}
      </section>

      <section className="profile-endorsements__section">
        <h3 className="profile-endorsements__heading">Endorsements given</h3>
        <GivenSectionBody
          isLoading={isLoading}
          error={error}
          endorsements={endorsements}
        />
      </section>
    </div>
  )
}
