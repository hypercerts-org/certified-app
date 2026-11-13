"use client"

import { useMemo } from "react"
import Link from "next/link"
import Avatar from "@/components/ui/avatar"
import Skeleton from "@/components/ui/skeleton"
import { useAuth } from "@/lib/auth/auth-context"
import { useOrg } from "@/lib/groups/org-context"
import { useFollowers } from "@/hooks/use-followers"
import { useFollowing } from "@/hooks/use-following"
import {
  useReceivedEndorsements,
  type ReceivedEndorsement,
} from "@/hooks/use-received-endorsements"
import { formatGraphCount } from "@/lib/utils/format-graph-count"
import { useEndorserIdentity } from "@/components/profile/use-endorser-identity"

/** How many endorsers the line names (and shows faces for). */
const NAMED = 2
const FACES = 3

interface ProfileTrustLineProps {
  did: string
  /** Path of the profile page, without the query. */
  basePath: string
}

/**
 * The line under the profile header that says who vouches for this account:
 * "Endorsed by {name}, {name} and N others", with the endorsers' faces,
 * linking to the Endorsements tab; then the follower and following counts.
 *
 * Endorsers the viewer (or the group they act as) follows are named first,
 * so a visitor sees the people they already know; the rest follow newest
 * first. One endorser counts once, even with several awards.
 */
export default function ProfileTrustLine({ did, basePath }: ProfileTrustLineProps) {
  const { did: viewerDid, isAuthenticated } = useAuth()
  const { activeOrg } = useOrg()
  const actingDid = activeOrg?.groupDid ?? viewerDid
  const isOwn = !!actingDid && actingDid === did

  const received = useReceivedEndorsements(did)
  const followers = useFollowers(did)
  const following = useFollowing(did)
  // The acting account's follows, to name familiar endorsers first. Same
  // cache key as the Follow button's read, so this is not an extra fetch.
  const viewerFollowing = useFollowing(isAuthenticated && !isOwn ? actingDid : null)

  const endorsers = useMemo(() => {
    const byIssuer = new Map<string, ReceivedEndorsement>()
    const newestFirst = [...received.endorsements].sort((a, b) =>
      a.createdAt < b.createdAt ? 1 : -1,
    )
    for (const e of newestFirst) {
      if (!byIssuer.has(e.issuerDid)) byIssuer.set(e.issuerDid, e)
    }
    const unique = [...byIssuer.values()]
    const known = viewerFollowing.subjects
    if (known.size === 0) return unique
    return [
      ...unique.filter((e) => known.has(e.issuerDid)),
      ...unique.filter((e) => !known.has(e.issuerDid)),
    ]
  }, [received.endorsements, viewerFollowing.subjects])

  const followerCount = followers.count
  const followingLoading = following.isLoading && following.count === 0

  return (
    <div className="profile-trust">
      {received.isLoading && endorsers.length === 0 ? (
        <div className="profile-trust__skeleton" aria-hidden>
          <Skeleton variant="line" width={220} height={16} />
        </div>
      ) : endorsers.length === 0 ? (
        <p className="profile-trust__none">No endorsements yet</p>
      ) : (
        <Link
          href={`${basePath}?tab=endorsements`}
          scroll={false}
          className="profile-trust__endorsed"
        >
          <span className="profile-trust__faces" aria-hidden>
            {endorsers.slice(0, FACES).map((e) => (
              <EndorserFace key={e.issuerDid} endorsement={e} />
            ))}
          </span>
          <span className="profile-trust__text">
            Endorsed by{" "}
            <EndorserNames endorsers={endorsers} />
          </span>
        </Link>
      )}

      <div className="profile-trust__counts">
        {followerCount === null ? (
          <Skeleton variant="line" width={72} height={14} aria-hidden />
        ) : (
          <Link
            href={`${basePath}?tab=followers`}
            scroll={false}
            className="profile-trust__count"
          >
            <strong>{formatGraphCount(followerCount)}</strong>{" "}
            {followerCount === 1 ? "follower" : "followers"}
          </Link>
        )}
        <span aria-hidden className="profile-trust__sep">·</span>
        {followingLoading ? (
          <Skeleton variant="line" width={72} height={14} aria-hidden />
        ) : (
          <Link
            href={`${basePath}?tab=followers&sub=following`}
            scroll={false}
            className="profile-trust__count"
            title={
              following.truncated
                ? "Showing the first 10,000 follows; this account has more."
                : undefined
            }
          >
            <strong>{formatGraphCount(following.count, following.truncated)}</strong>{" "}
            following
          </Link>
        )}
      </div>
    </div>
  )
}

function EndorserNames({ endorsers }: { endorsers: ReceivedEndorsement[] }) {
  const named = endorsers.slice(0, NAMED)
  const rest = endorsers.length - named.length
  if (named.length === 1) return <EndorserName endorsement={named[0]} />
  if (rest === 0) {
    return (
      <>
        <EndorserName endorsement={named[0]} /> and{" "}
        <EndorserName endorsement={named[1]} />
      </>
    )
  }
  return (
    <>
      <EndorserName endorsement={named[0]} />,{" "}
      <EndorserName endorsement={named[1]} /> and{" "}
      <span className="profile-trust__name">
        {formatGraphCount(rest)} {rest === 1 ? "other" : "others"}
      </span>
    </>
  )
}

function EndorserName({ endorsement }: { endorsement: ReceivedEndorsement }) {
  const { displayName } = useEndorserIdentity(endorsement)
  return (
    <span className="profile-trust__name" dir="auto">
      {displayName}
    </span>
  )
}

function EndorserFace({ endorsement }: { endorsement: ReceivedEndorsement }) {
  const { avatarSrc, initials } = useEndorserIdentity(endorsement)
  return (
    <span className="profile-trust__face">
      <Avatar
        size="xs"
        src={avatarSrc}
        fallbackInitials={initials}
        seed={endorsement.issuerDid}
      />
    </span>
  )
}
