"use client"

import { useMemo } from "react"
import Link from "next/link"
import Avatar from "@/components/ui/avatar"
import Skeleton from "@/components/ui/skeleton"
import { KindPendingAvatar, useAccountKind } from "@/components/feed/account-kind"
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
  /** The viewer's identity is this account. Only the account itself sees
   *  "No endorsements yet" and a following count of zero; a visitor sees
   *  what there is. */
  isOwner?: boolean
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
export default function ProfileTrustLine({
  did,
  basePath,
  isOwner = false,
}: ProfileTrustLineProps) {
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

  const endorsers = useMemo(
    () => uniqueEndorsers(received.endorsements, viewerFollowing.subjects),
    [received.endorsements, viewerFollowing.subjects],
  )

  const followerCount = followers.count
  const followingLoading = following.isLoading && following.count === 0
  const endorsersLoading = received.isLoading && endorsers.length === 0
  // A visitor isn't told about what isn't there.
  const showFollowers = isOwner || followerCount !== 0
  const showFollowing = isOwner || followingLoading || following.count > 0
  const showNone = isOwner && !endorsersLoading && endorsers.length === 0
  const nothing =
    !endorsersLoading &&
    endorsers.length === 0 &&
    !showNone &&
    !showFollowing &&
    followerCount === 0
  if (nothing) return null

  return (
    <div className="profile-trust">
      {endorsersLoading ? (
        <div className="profile-trust__skeleton" aria-hidden>
          <Skeleton variant="line" width={200} height={16} />
        </div>
      ) : endorsers.length === 0 ? (
        showNone ? <p className="profile-trust__none">No endorsements yet</p> : null
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
          <span className="profile-trust__text profile-trust__text--long">
            Endorsed by{" "}
            <EndorserNames endorsers={endorsers} />
          </span>
          {/* Phones: one name and how many more ("Endorsed by Ma Earth
              +2"), so the count is never cut off with the names. */}
          <EndorsedByShort
            endorsers={endorsers}
            className="profile-trust__text profile-trust__text--short"
          />
        </Link>
      )}

      <div className="profile-trust__counts">
        {followerCount === null ? (
          // A failed count is left out, not shown as a placeholder forever.
          followers.error ? null : (
            <Skeleton variant="line" width={72} height={14} aria-hidden />
          )
        ) : showFollowers ? (
          <Link
            href={`${basePath}?tab=followers`}
            scroll={false}
            className="profile-trust__count"
          >
            <strong>{formatGraphCount(followerCount)}</strong>{" "}
            {followerCount === 1 ? "follower" : "followers"}
          </Link>
        ) : null}
        {showFollowers && showFollowing && !(followerCount === null && followers.error) ? (
          <span aria-hidden className="profile-trust__sep profile-trust__following">
            ·
          </span>
        ) : null}
        {!showFollowing ? null : followingLoading ? (
          <Skeleton variant="line" width={72} height={14} aria-hidden />
        ) : (
          <Link
            href={`${basePath}?tab=followers&sub=following`}
            scroll={false}
            className="profile-trust__count profile-trust__following"
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

/** An endorser's face, in the shape of its kind (an organization square,
 *  a person round, a neutral block while that isn't known). */
function EndorserFace({ endorsement }: { endorsement: ReceivedEndorsement }) {
  const { avatarSrc, initials } = useEndorserIdentity(endorsement)
  const account = useAccountKind(endorsement.issuerDid, { autoRetry: false })
  return (
    <span className="profile-trust__face" data-kind={account.kind}>
      {account.kind === "unknown" ? (
        <KindPendingAvatar size={20} animate={account.pending} />
      ) : (
        <Avatar
          size="xs"
          shape={account.kind === "org" ? "square" : "circle"}
          src={avatarSrc}
          fallbackInitials={initials}
          seed={endorsement.issuerDid}
        />
      )}
    </span>
  )
}

/**
 * The accounts that endorsed this one, each once (the newest of its
 * awards), newest first; with `known` (the accounts the viewer follows),
 * those come first, so a visitor sees the people they already know.
 */
export function uniqueEndorsers(
  endorsements: readonly ReceivedEndorsement[],
  known?: ReadonlySet<string>,
): ReceivedEndorsement[] {
  const byIssuer = new Map<string, ReceivedEndorsement>()
  const newestFirst = [...endorsements].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
  for (const e of newestFirst) {
    if (!byIssuer.has(e.issuerDid)) byIssuer.set(e.issuerDid, e)
  }
  const unique = [...byIssuer.values()]
  if (!known || known.size === 0) return unique
  return [
    ...unique.filter((e) => known.has(e.issuerDid)),
    ...unique.filter((e) => !known.has(e.issuerDid)),
  ]
}

/**
 * The short form of "Endorsed by": the first endorser's name and how many
 * more ("Endorsed by Ma Earth +2"). The name gives way (an ellipsis)
 * before the count does.
 */
function EndorsedByShort({
  endorsers,
  className = "",
}: {
  endorsers: readonly ReceivedEndorsement[]
  className?: string
}) {
  if (endorsers.length === 0) return null
  const rest = endorsers.length - 1
  return (
    <span className={`profile-trust__short ${className}`}>
      <span className="profile-trust__short-lead">
        Endorsed by <EndorserName endorsement={endorsers[0]} />
      </span>
      {rest > 0 ? (
        <span className="profile-trust__name profile-trust__more">
          <span aria-hidden="true">+{formatGraphCount(rest)}</span>
          <span className="sr-only">
            {" "}
            and {formatGraphCount(rest)} {rest === 1 ? "other" : "others"}
          </span>
        </span>
      ) : null}
    </span>
  )
}

/**
 * The trust line in brief, for a card about an account elsewhere (a record
 * page's "Who's behind it"): "Endorsed by Ma Earth +2 · 12 followers".
 * The same reads as the profile's line (cached per account, so opening the
 * profile next costs nothing). Renders nothing until they answer, when
 * nobody vouches for the account yet, or when they fail.
 */
export function CompactTrustLine({ did, className = "" }: { did: string; className?: string }) {
  const received = useReceivedEndorsements(did)
  const followers = useFollowers(did)
  const endorsers = useMemo(() => uniqueEndorsers(received.endorsements), [received.endorsements])
  const followerCount = followers.error ? 0 : followers.count ?? 0
  if (endorsers.length === 0 && followerCount === 0) return null
  return (
    <p className={`profile-trust-compact ${className}`}>
      {endorsers.length > 0 ? <EndorsedByShort endorsers={endorsers} /> : null}
      {endorsers.length > 0 && followerCount > 0 ? (
        <span aria-hidden="true" className="profile-trust__sep">
          ·
        </span>
      ) : null}
      {followerCount > 0 ? (
        <span className="profile-trust-compact__count">
          <strong>{formatGraphCount(followerCount)}</strong>{" "}
          {followerCount === 1 ? "follower" : "followers"}
        </span>
      ) : null}
    </p>
  )
}
