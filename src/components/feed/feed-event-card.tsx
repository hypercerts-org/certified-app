"use client"

import Link from "next/link"
import { Award, FolderOpen, Heart, Sparkles } from "lucide-react"
import Avatar from "@/components/ui/avatar"
import { useAuthorInfo } from "@/hooks/use-author-info"
import { getInitials } from "@/lib/utils/initials"
import { formatRelativeTime, resolveActivityImageUrl } from "@/lib/atproto/activity"
import { activityDetailHref, parseActivityUri } from "@/lib/atproto/activity-uri"
import { buildAvatarUrlFromCid } from "@/lib/atproto/profile"
import type {
  FeedEvent,
  HydratedPayload,
} from "@/lib/atproto/follower-events"

interface FeedEventCardProps {
  event: FeedEvent
  payload: HydratedPayload | null
}

/**
 * Renders one row of the home-timeline feed. Dispatches on
 * `event.kind` to a body component matching the four documented
 * kinds; unknown kinds fall through to a generic actor + subjectUri
 * card so we don't drop events silently when the server ships a new
 * kind before the client updates (issue #88 "Unknown-kind contract").
 *
 * Visual chrome (the outer `.feed-card`) is shared with `ActivityCard`
 * so the mixed feed reads as one coherent column. Body content is
 * kind-specific.
 */
export default function FeedEventCard({ event, payload }: FeedEventCardProps) {
  return (
    <article className="feed-card">
      <FeedActorByline actor={event.actor} createdAt={event.sortAt} />
      <FeedEventBody event={event} payload={payload} />
    </article>
  )
}

// ----------------------------------------------------------------------
// Actor byline — uses the denormalised FeedEvent.actor directly, no
// extra resolve round-trip.
// ----------------------------------------------------------------------

interface FeedActorBylineProps {
  actor: FeedEvent["actor"]
  createdAt: string
}

function FeedActorByline({ actor, createdAt }: FeedActorBylineProps) {
  const displayName = actor.displayName || actor.handle || "Anonymous"
  const initials = getInitials(actor.displayName, actor.did)
  const avatarUrl = buildAvatarUrlFromCid(actor.did, actor.avatarCid)
  const profileHref = `/profile/${encodeURIComponent(actor.handle || actor.did)}`

  return (
    <div className="feed-card__author-row">
      <Link
        href={profileHref}
        className="feed-card__author"
        aria-label={`View ${displayName}'s profile`}
      >
        <Avatar
          size="sm"
          src={avatarUrl || undefined}
          alt=""
          fallbackInitials={initials}
          className="shrink-0"
        />
        <span className="feed-card__author-meta">
          <span className="feed-card__author-name-line">
            <span className="feed-card__author-name">{displayName}</span>
          </span>
          {actor.handle ? (
            <span className="feed-card__author-handle">@{actor.handle}</span>
          ) : null}
        </span>
      </Link>
      <time className="feed-card__time feed-card__time--inline" dateTime={createdAt}>
        {formatRelativeTime(createdAt)}
      </time>
    </div>
  )
}

// ----------------------------------------------------------------------
// Body dispatch
// ----------------------------------------------------------------------

function FeedEventBody({ event, payload }: FeedEventCardProps) {
  if (payload?.kind === "cert.create") {
    return <CertCreateBody event={event} record={payload.record} />
  }
  if (payload?.kind === "collection.create") {
    return <CollectionCreateBody event={event} record={payload.record} />
  }
  if (payload?.kind === "badge.award") {
    return (
      <SubjectActionBody
        event={event}
        subjectDid={payload.subjectDid}
        action="awarded a badge to"
        note={payload.note}
        icon={<Award size={16} strokeWidth={1.75} aria-hidden="true" />}
      />
    )
  }
  if (payload?.kind === "legacy.endorsement") {
    return (
      <SubjectActionBody
        event={event}
        subjectDid={payload.subjectDid}
        action="endorsed"
        note={null}
        icon={<Heart size={16} strokeWidth={1.75} aria-hidden="true" />}
      />
    )
  }
  return <UnknownKindBody event={event} />
}

// ----------------------------------------------------------------------
// cert.create
// ----------------------------------------------------------------------

function CertCreateBody({
  event,
  record,
}: {
  event: FeedEvent
  record: Extract<HydratedPayload, { kind: "cert.create" }>["record"]
}) {
  const { value } = record
  const imageUrl = value.image
    ? resolveActivityImageUrl(value.image, event.actor.did)
    : null
  const parsed = parseActivityUri(record.uri)
  const detailHref = parsed ? activityDetailHref(parsed.did, parsed.rkey) : null

  const body = (
    <>
      <div className="feed-card__action">
        <Sparkles size={16} strokeWidth={1.75} aria-hidden="true" />
        <span>created a cert</span>
      </div>
      {imageUrl ? (
        <div className="feed-card__image-wrap">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="feed-card__image"
            src={imageUrl}
            alt={value.title || "Cert image"}
            loading="lazy"
          />
        </div>
      ) : (
        <div
          className="feed-card__image-wrap feed-card__image-wrap--placeholder"
          aria-hidden="true"
        >
          <Award size={40} strokeWidth={1.25} className="feed-card__image-placeholder-icon" />
        </div>
      )}
      {value.title ? <h2 className="feed-card__title">{value.title}</h2> : null}
      {value.shortDescription ? (
        <p className="feed-card__desc">{value.shortDescription}</p>
      ) : null}
    </>
  )

  return detailHref ? (
    <Link href={detailHref} className="feed-card__body">
      {body}
    </Link>
  ) : (
    <div className="feed-card__body">{body}</div>
  )
}

// ----------------------------------------------------------------------
// collection.create
// ----------------------------------------------------------------------

function CollectionCreateBody({
  event,
  record,
}: {
  event: FeedEvent
  record: Extract<HydratedPayload, { kind: "collection.create" }>["record"]
}) {
  const { value } = record
  const collectionType = value.type ?? "project"
  const actionLabel =
    collectionType === "endorsement-list"
      ? "created a list"
      : collectionType === "portfolio"
        ? "created a portfolio"
        : "created a project"
  // Banner can be the same shape as activity image (uri | { image: { ref } }).
  const imageUrl = value.banner
    ? resolveActivityImageUrl(
        value.banner as Parameters<typeof resolveActivityImageUrl>[0],
        event.actor.did,
      )
    : null

  return (
    <div className="feed-card__body">
      <div className="feed-card__action">
        <FolderOpen size={16} strokeWidth={1.75} aria-hidden="true" />
        <span>{actionLabel}</span>
      </div>
      {imageUrl ? (
        <div className="feed-card__image-wrap">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="feed-card__image"
            src={imageUrl}
            alt={value.title || "Collection banner"}
            loading="lazy"
          />
        </div>
      ) : null}
      {value.title ? <h2 className="feed-card__title">{value.title}</h2> : null}
      {value.shortDescription ? (
        <p className="feed-card__desc">{value.shortDescription}</p>
      ) : null}
    </div>
  )
}

// ----------------------------------------------------------------------
// badge.award + legacy.endorsement (subject-focused)
// ----------------------------------------------------------------------

function SubjectActionBody({
  event: _event,
  subjectDid,
  action,
  note,
  icon,
}: {
  event: FeedEvent
  subjectDid: string
  action: string
  note: string | null
  icon: React.ReactNode
}) {
  const { info } = useAuthorInfo(subjectDid)
  const subjectName = info?.displayName || info?.handle || null
  const subjectHandle = info?.handle ?? null
  const profileHref = info?.handle
    ? `/profile/${encodeURIComponent(info.handle)}`
    : `/profile/${encodeURIComponent(subjectDid)}`

  return (
    <div className="feed-card__body">
      <div className="feed-card__action">
        {icon}
        <span>{action}</span>{" "}
        <Link href={profileHref} className="feed-card__action-subject">
          {subjectName ?? subjectHandle ?? "someone"}
        </Link>
      </div>
      {note ? <p className="feed-card__note">{note}</p> : null}
    </div>
  )
}

// ----------------------------------------------------------------------
// unknown kind — fallback per issue #88's "Unknown-kind contract"
// ----------------------------------------------------------------------

function UnknownKindBody({ event }: { event: FeedEvent }) {
  return (
    <div className="feed-card__body">
      <div className="feed-card__action">
        <Sparkles size={16} strokeWidth={1.75} aria-hidden="true" />
        <span>did something</span>
      </div>
      <p className="feed-card__desc feed-card__desc--unknown" title={event.subjectUri}>
        {event.subjectUri}
      </p>
    </div>
  )
}
