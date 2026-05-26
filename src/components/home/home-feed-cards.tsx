"use client"

import Link from "next/link"
import {
  Award,
  BarChart3,
  FolderGit2,
  Inbox,
  LayoutDashboard,
  Megaphone,
  Sparkles,
  Users,
} from "lucide-react"
import Avatar from "@/components/ui/avatar"
import EmptyState from "@/components/ui/empty-state"
import LoadingSpinner from "@/components/ui/loading-spinner"
import { useAuthorInfo } from "@/hooks/use-author-info"
import { useHomeFeed, type HomeFeedEvent } from "@/hooks/use-home-feed"
import { useFollowedDids } from "@/hooks/use-followed-dids"
import {
  formatRelativeTime,
  resolveActivityImageUrl,
} from "@/lib/atproto/activity"
import { parseAtUri } from "@/lib/atproto/activity-uri"
import { buildAvatarUrlFromCid } from "@/lib/atproto/profile"
import { getInitials } from "@/lib/utils/initials"
import type { ActivityRecord } from "@/lib/atproto/activity-types"
import type { CollectionRecord } from "@/lib/atproto/collection"

/**
 * Card-style alternative to the GitHub-style timeline at `<HomeFeed>`.
 * Each event renders as a distinct social-media card (Twitter / Bluesky
 * shape): prominent actor header, action line, large image, body
 * copy. Cards sit in a vertical column with whitespace between them
 * rather than the dense list-rhythm of the timeline.
 *
 * Consumes the same `useHomeFeed` data as the timeline — the
 * difference is purely visual. Toggle UI in `home.tsx` swaps between
 * `<HomeFeed>` and this component.
 */
export default function HomeFeedCards({ activeDid }: { activeDid: string }) {
  const {
    followedDids,
    isLoading: followsLoading,
    error: followsError,
  } = useFollowedDids(activeDid)
  const { events, isLoading, error } = useHomeFeed(followedDids)

  if (followsLoading || isLoading) {
    return (
      <div className="home-cards__loading">
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
    <ol className="home-cards">
      {events.map((event) => (
        <li key={event.uri} className="home-cards__item">
          <HomeFeedCard event={event} />
        </li>
      ))}
    </ol>
  )
}

// ----------------------------------------------------------------------
// Card shell
// ----------------------------------------------------------------------

function HomeFeedCard({ event }: { event: HomeFeedEvent }) {
  return (
    <article className="home-card">
      <ActorHeader event={event} />
      <CardBody event={event} />
    </article>
  )
}

function ActorHeader({ event }: { event: HomeFeedEvent }) {
  const actor = event.actorProfile
  const displayName =
    actor.displayName || actor.handle || event.actor.slice(0, 16)
  const initials = getInitials(actor.displayName, event.actor)
  const avatarUrl = buildAvatarUrlFromCid(actor.did, actor.avatarCid)
  const profileHref = `/profile/${encodeURIComponent(
    actor.handle || event.actor,
  )}`

  return (
    <header className="home-card__header">
      <Link
        href={profileHref}
        className="home-card__avatar"
        aria-label={`${displayName}'s profile`}
      >
        <Avatar
          size="md"
          src={avatarUrl ?? undefined}
          alt=""
          fallbackInitials={initials}
        />
      </Link>
      <div className="home-card__meta">
        <Link href={profileHref} className="home-card__actor-name">
          {displayName}
        </Link>
        <span className="home-card__actor-sub">
          {actor.handle ? (
            <Link href={profileHref} className="home-card__handle">
              @{actor.handle}
            </Link>
          ) : null}
          {actor.handle ? (
            <span className="home-card__dot" aria-hidden="true">
              ·
            </span>
          ) : null}
          <time
            className="home-card__time"
            dateTime={event.createdAt}
            title={event.createdAt}
          >
            {formatRelativeTime(event.createdAt)}
          </time>
        </span>
      </div>
    </header>
  )
}

// ----------------------------------------------------------------------
// Body dispatch
// ----------------------------------------------------------------------

function CardBody({ event }: { event: HomeFeedEvent }) {
  switch (event.kind) {
    case "cert.create":
      return <CertCardBody event={event} record={event.record} />
    case "collection.create":
      return <CollectionCardBody event={event} record={event.record} />
    case "endorsement.award":
    case "legacy.endorsement":
      return (
        <EndorsementCardBody
          subjectDid={event.subjectDid}
          note={"note" in event ? event.note : null}
        />
      )
    case "evaluation.create":
      return (
        <SimpleCardBody
          icon={<BarChart3 size={14} strokeWidth={1.75} aria-hidden />}
          action="added an evaluation"
          title={event.title}
        />
      )
    case "measurement.create":
      return (
        <SimpleCardBody
          icon={<BarChart3 size={14} strokeWidth={1.75} aria-hidden />}
          action="added a measurement"
          title={event.title}
        />
      )
    case "hyperboard.create":
      return (
        <SimpleCardBody
          icon={<LayoutDashboard size={14} strokeWidth={1.75} aria-hidden />}
          action="created a hyperboard"
          title={event.title}
        />
      )
    case "update.create":
      return (
        <SimpleCardBody
          icon={<Megaphone size={14} strokeWidth={1.75} aria-hidden />}
          action="posted an update"
          title={event.title}
        />
      )
    case "unknown":
      return (
        <SimpleCardBody
          icon={<Sparkles size={14} strokeWidth={1.75} aria-hidden />}
          action="did something"
          title={null}
          subjectUri={event.subjectUri}
        />
      )
  }
}

// ----------------------------------------------------------------------
// cert.create
// ----------------------------------------------------------------------

function CertCardBody({
  event,
  record,
}: {
  event: HomeFeedEvent & { kind: "cert.create" }
  record: ActivityRecord
}) {
  const parsed = parseAtUri(event.uri)
  const href = parsed
    ? `/activity/${encodeURIComponent(parsed.did)}/${encodeURIComponent(parsed.rkey)}`
    : null
  const title =
    typeof record.value.title === "string" && record.value.title.length > 0
      ? record.value.title
      : "Untitled cert"
  const description =
    typeof record.value.shortDescription === "string" &&
    record.value.shortDescription.length > 0
      ? record.value.shortDescription
      : null
  const imageUrl =
    record.value.image && parsed
      ? resolveActivityImageUrl(record.value.image, parsed.did)
      : null

  return (
    <div className="home-card__body">
      <ActionLine
        icon={<Award size={14} strokeWidth={1.75} aria-hidden />}
        label="created a cert"
      />
      <CardLink href={href}>
        {imageUrl ? (
          <span className="home-card__media">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageUrl} alt="" loading="lazy" />
          </span>
        ) : null}
        <span className="home-card__primary">
          <span className="home-card__title">{title}</span>
          {description ? (
            <span className="home-card__desc">{description}</span>
          ) : null}
        </span>
      </CardLink>
    </div>
  )
}

// ----------------------------------------------------------------------
// collection.create
// ----------------------------------------------------------------------

function CollectionCardBody({
  event,
  record,
}: {
  event: HomeFeedEvent & { kind: "collection.create" }
  record: CollectionRecord
}) {
  const parsed = parseAtUri(event.uri)
  const href = parsed
    ? `/project/${encodeURIComponent(parsed.did)}/${encodeURIComponent(parsed.rkey)}`
    : null
  const v = record.value as Record<string, unknown>
  const collectionType =
    typeof v.type === "string" ? v.type.toLowerCase() : "project"
  const verb =
    collectionType === "endorsement-list"
      ? "created a list"
      : collectionType === "portfolio"
        ? "created a portfolio"
        : "created a project"
  const fallbackTitle =
    collectionType === "endorsement-list"
      ? "Untitled list"
      : collectionType === "portfolio"
        ? "Untitled portfolio"
        : "Untitled project"
  const title =
    (typeof v.title === "string" && v.title.length > 0 ? v.title : null) ||
    (typeof v.name === "string" && v.name.length > 0 ? v.name : null) ||
    fallbackTitle
  const description =
    typeof v.shortDescription === "string" && v.shortDescription.length > 0
      ? v.shortDescription
      : null
  const rawImage = v.banner ?? v.image
  const imageUrl =
    rawImage && parsed
      ? resolveActivityImageUrl(
          rawImage as Parameters<typeof resolveActivityImageUrl>[0],
          parsed.did,
        )
      : null

  return (
    <div className="home-card__body">
      <ActionLine
        icon={<FolderGit2 size={14} strokeWidth={1.75} aria-hidden />}
        label={verb}
      />
      <CardLink href={href}>
        {imageUrl ? (
          <span className="home-card__media">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageUrl} alt="" loading="lazy" />
          </span>
        ) : null}
        <span className="home-card__primary">
          <span className="home-card__title">{title}</span>
          {description ? (
            <span className="home-card__desc">{description}</span>
          ) : null}
        </span>
      </CardLink>
    </div>
  )
}

// ----------------------------------------------------------------------
// endorsement.award / legacy.endorsement
// ----------------------------------------------------------------------

function EndorsementCardBody({
  subjectDid,
  note,
}: {
  subjectDid: string
  note: string | null
}) {
  const { info } = useAuthorInfo(subjectDid)
  const subjectName =
    info?.displayName || info?.handle || subjectDid.slice(0, 16)
  const subjectInitials = getInitials(info?.displayName, subjectDid)
  const subjectAvatar = info?.avatarUrl ?? null
  const subjectHref = `/profile/${encodeURIComponent(
    info?.handle || subjectDid,
  )}`
  return (
    <div className="home-card__body">
      <ActionLine
        icon={<Award size={14} strokeWidth={1.75} aria-hidden />}
        label="endorsed"
      />
      <Link href={subjectHref} className="home-card__subject">
        <Avatar
          size="sm"
          src={subjectAvatar ?? undefined}
          alt=""
          fallbackInitials={subjectInitials}
        />
        <span className="home-card__subject-meta">
          <span className="home-card__subject-name">{subjectName}</span>
          {info?.handle ? (
            <span className="home-card__subject-handle">@{info.handle}</span>
          ) : null}
        </span>
      </Link>
      {note ? <p className="home-card__note">{note}</p> : null}
    </div>
  )
}

// ----------------------------------------------------------------------
// Simple-title body (evaluation, measurement, hyperboard, update,
// unknown). Keeps the card chrome consistent without an image
// preview — the source records don't reliably surface one.
// ----------------------------------------------------------------------

function SimpleCardBody({
  icon,
  action,
  title,
  subjectUri,
}: {
  icon: React.ReactNode
  action: string
  title: string | null
  subjectUri?: string
}) {
  return (
    <div className="home-card__body">
      <ActionLine icon={icon} label={action} />
      {title ? (
        <span className="home-card__primary home-card__primary--standalone">
          <span className="home-card__title">{title}</span>
        </span>
      ) : null}
      {subjectUri ? (
        <p className="home-card__subject-uri" title={subjectUri}>
          {subjectUri}
        </p>
      ) : null}
    </div>
  )
}

// ----------------------------------------------------------------------
// Card subprimitives
// ----------------------------------------------------------------------

function ActionLine({
  icon,
  label,
}: {
  icon: React.ReactNode
  label: string
}) {
  return (
    <div className="home-card__action">
      {icon}
      <span>{label}</span>
    </div>
  )
}

function CardLink({
  href,
  children,
}: {
  href: string | null
  children: React.ReactNode
}) {
  if (href) {
    return (
      <Link href={href} className="home-card__link">
        {children}
      </Link>
    )
  }
  return <div className="home-card__link home-card__link--inert">{children}</div>
}
