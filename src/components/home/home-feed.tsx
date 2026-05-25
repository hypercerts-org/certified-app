"use client"

import Link from "next/link"
import { Award, FolderGit2, Inbox, Star, Users } from "lucide-react"
import Avatar from "@/components/ui/avatar"
import EmptyState from "@/components/ui/empty-state"
import LoadingSpinner from "@/components/ui/loading-spinner"
import { useAuthorInfo } from "@/hooks/use-author-info"
import { useHomeFeed, type HomeFeedEvent } from "@/hooks/use-home-feed"
import { useFollowedDids } from "@/hooks/use-followed-dids"
import { formatRelativeTime, resolveActivityImageUrl } from "@/lib/atproto/activity"
import { parseAtUri } from "@/lib/atproto/activity-uri"
import { getInitials } from "@/lib/utils/initials"
import type { ActivityRecord } from "@/lib/atproto/activity-types"
import type { CollectionRecord } from "@/lib/atproto/collection"

/**
 * GitHub-style activity timeline for the home page. Each row is a
 * compact single-line entry: actor avatar, verb sentence, action
 * icon, and relative time. Multiple event kinds (cert creates,
 * project creates, endorsements) render through one row template so
 * the timeline reads as a unified history rather than a stack of
 * cards.
 *
 * Pagination intentionally absent in this first cut — see
 * `useHomeFeed` for the rationale (no unified indexer events op
 * yet).
 */
export default function HomeFeed({ activeDid }: { activeDid: string }) {
  const {
    followedDids,
    isLoading: followsLoading,
    error: followsError,
  } = useFollowedDids(activeDid)
  const { events, isLoading, error } = useHomeFeed(followedDids)

  if (followsLoading || isLoading) {
    return (
      <div className="home-feed__loading">
        <LoadingSpinner size="md" />
      </div>
    )
  }

  if (followsError) {
    return (
      <div className="feed__warning" role="alert">
        Could not load your follow list. Please try again later.
      </div>
    )
  }

  if (followedDids.size === 0) {
    return (
      <EmptyState
        icon={Users}
        title="You're not following anyone yet"
        description="Follow people to see their activity here."
      />
    )
  }

  if (error) {
    return (
      <div className="feed__warning" role="alert">
        Could not load activity: {error}
      </div>
    )
  }

  if (events.length === 0) {
    return (
      <EmptyState
        icon={Inbox}
        title="No activity yet"
        description="People you follow haven't posted any activity yet."
      />
    )
  }

  return (
    <ol className="home-feed">
      {events.map((event) => (
        <li key={event.uri} className="home-feed__item">
          <HomeFeedRow event={event} />
        </li>
      ))}
    </ol>
  )
}

function HomeFeedRow({ event }: { event: HomeFeedEvent }) {
  const { info: actorInfo } = useAuthorInfo(event.actor)
  const actorName =
    actorInfo?.displayName || actorInfo?.handle || event.actor.slice(0, 16)
  const actorHandle = actorInfo?.handle ?? null
  const actorAvatar = actorInfo?.avatarUrl ?? null
  const actorInitials = getInitials(actorInfo?.displayName, event.actor)
  const profileHref = `/profile/${encodeURIComponent(
    actorHandle || event.actor,
  )}`

  return (
    <article className="home-feed__row">
      <span className={`home-feed__icon home-feed__icon--${event.kind.split(".")[0]}`}>
        <EventIcon kind={event.kind} />
      </span>
      <Link
        href={profileHref}
        className="home-feed__avatar"
        aria-label={`${actorName}'s profile`}
      >
        <Avatar
          size="sm"
          src={actorAvatar ?? undefined}
          alt=""
          fallbackInitials={actorInitials}
        />
      </Link>
      <p className="home-feed__sentence">
        <Link href={profileHref} className="home-feed__actor">
          {actorName}
        </Link>{" "}
        <EventSentence event={event} />
      </p>
      <time
        className="home-feed__time"
        dateTime={event.createdAt}
        title={event.createdAt}
      >
        {formatRelativeTime(event.createdAt)}
      </time>
    </article>
  )
}

function EventIcon({ kind }: { kind: HomeFeedEvent["kind"] }) {
  const props = { size: 12, strokeWidth: 1.75, "aria-hidden": true } as const
  if (kind === "cert.create") return <Award {...props} />
  if (kind === "project.create") return <FolderGit2 {...props} />
  return <Star {...props} />
}

function EventSentence({ event }: { event: HomeFeedEvent }) {
  if (event.kind === "cert.create") {
    const title = certTitle(event.record) ?? "a cert"
    const parsed = parseAtUri(event.uri)
    const href = parsed
      ? `/activity/${encodeURIComponent(parsed.did)}/${encodeURIComponent(parsed.rkey)}`
      : null
    return (
      <>
        created a cert{" "}
        {href ? (
          <Link href={href} className="home-feed__target">
            {title}
          </Link>
        ) : (
          <span className="home-feed__target">{title}</span>
        )}
        <CertThumb record={event.record} />
      </>
    )
  }
  if (event.kind === "project.create") {
    const title = projectTitle(event.record) ?? "a project"
    const parsed = parseAtUri(event.uri)
    const href = parsed
      ? `/project/${encodeURIComponent(parsed.did)}/${encodeURIComponent(parsed.rkey)}`
      : null
    return (
      <>
        created a project{" "}
        {href ? (
          <Link href={href} className="home-feed__target">
            {title}
          </Link>
        ) : (
          <span className="home-feed__target">{title}</span>
        )}
      </>
    )
  }
  return <EndorsementSentence subjectDid={event.subjectDid} />
}

function EndorsementSentence({ subjectDid }: { subjectDid: string }) {
  const { info } = useAuthorInfo(subjectDid)
  const name = info?.displayName || (info?.handle ? `@${info.handle}` : null)
  const href = `/profile/${encodeURIComponent(info?.handle || subjectDid)}`
  return (
    <>
      endorsed{" "}
      <Link href={href} className="home-feed__target">
        {name ?? "an account"}
      </Link>
    </>
  )
}

/** Compact 18px square thumbnail tucked inline after a cert title —
 *  same affordance GitHub uses to preview avatars in event rows. */
function CertThumb({ record }: { record: ActivityRecord }) {
  const parsed = parseAtUri(record.uri)
  if (!parsed) return null
  if (!record.value.image) return null
  const url = resolveActivityImageUrl(record.value.image, parsed.did)
  if (!url) return null
  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img className="home-feed__thumb" src={url} alt="" loading="lazy" />
  )
}

function certTitle(record: ActivityRecord): string | null {
  return typeof record.value.title === "string" && record.value.title.length > 0
    ? record.value.title
    : null
}

function projectTitle(record: CollectionRecord): string | null {
  const v = record.value as Record<string, unknown>
  const title = typeof v.title === "string" ? v.title : null
  if (title) return title
  const name = typeof v.name === "string" ? v.name : null
  return name && name.length > 0 ? name : null
}
