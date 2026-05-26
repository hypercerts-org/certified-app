"use client"

import Link from "next/link"
import { Award, FolderGit2, Inbox, MapPin, Users } from "lucide-react"
import Avatar from "@/components/ui/avatar"
import EmptyState from "@/components/ui/empty-state"
import LoadingSpinner from "@/components/ui/loading-spinner"
import { useAuthorInfo } from "@/hooks/use-author-info"
import { useHomeFeed, type HomeFeedEvent } from "@/hooks/use-home-feed"
import { useFollowedDids } from "@/hooks/use-followed-dids"
import { formatRelativeTime, resolveActivityImageUrl } from "@/lib/atproto/activity"
import { parseAtUri } from "@/lib/atproto/activity-uri"
import { formatShortDate } from "@/lib/utils/format-date"
import { getInitials } from "@/lib/utils/initials"
import { buildAvatarUrlFromCid } from "@/lib/atproto/profile"
import type { ActivityRecord } from "@/lib/atproto/activity-types"
import type { CollectionRecord } from "@/lib/atproto/collection"

/**
 * GitHub-style activity timeline for the home page. Each entry is
 * an actor byline + verb sentence on top; cert and project creates
 * also render a compact preview card underneath with the record's
 * thumbnail, description, and key meta (period + location count for
 * certs, item count for projects). Endorsement events keep to the
 * single-line treatment since the sentence already names both ends
 * of the action.
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
  // The indexer's denormalised `actorProfile` is empty in practice
  // today (magic-indexer#130 — profile ingestion not enabled on
  // prod). `useAuthorInfo` does the per-actor PDS resolve and caches
  // at module scope. Prefer its data; treat the indexer's
  // actorProfile as a first-paint hint when present.
  const { info: lookup } = useAuthorInfo(event.actor)
  const indexer = event.actorProfile
  const actorName =
    lookup?.displayName ||
    indexer.displayName ||
    lookup?.handle ||
    indexer.handle ||
    event.actor.slice(0, 16)
  const actorAvatar =
    lookup?.avatarUrl ||
    buildAvatarUrlFromCid(indexer.did, indexer.avatarCid)
  const actorInitials = getInitials(
    lookup?.displayName ?? indexer.displayName,
    event.actor,
  )
  const profileHref = `/profile/${encodeURIComponent(
    lookup?.handle || indexer.handle || event.actor,
  )}`

  return (
    <article className="home-feed__row">
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
      <div className="home-feed__content">
        <p className="home-feed__sentence">
          <Link href={profileHref} className="home-feed__actor">
            {actorName}
          </Link>{" "}
          <EventSentence event={event} />
        </p>
        {event.kind === "cert.create" ? (
          <CertPreview record={event.record} uri={event.uri} />
        ) : null}
        {event.kind === "collection.create" ? (
          <CollectionPreview record={event.record} uri={event.uri} />
        ) : null}
      </div>
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

function EventSentence({ event }: { event: HomeFeedEvent }) {
  switch (event.kind) {
    case "cert.create":
      return <>created a cert</>
    case "collection.create":
      return <>created a {collectionTypeLabel(event.record)}</>
    case "endorsement.award":
    case "legacy.endorsement":
      return <EndorsementSentence subjectDid={event.subjectDid} />
    case "evaluation.create":
      return <>added an evaluation</>
    case "measurement.create":
      return <>added a measurement</>
    case "hyperboard.create":
      return <>created a hyperboard</>
    case "update.create":
      return <>posted an update</>
    case "unknown":
      // The wire kind was known but hydration didn't return a
      // payload (or it was genuinely unknown). Recover the verb
      // sentence from the wire kind when we recognise it — losing
      // the body content is OK; losing the action label isn't.
      return <UnhydratedSentence rawKind={event.rawKind} />
  }
}

function UnhydratedSentence({ rawKind }: { rawKind: string }) {
  switch (rawKind) {
    case "cert.create":
      return <>created a cert</>
    case "collection.create":
      return <>created a project</>
    case "evaluation.create":
      return <>added an evaluation</>
    case "measurement.create":
      return <>added a measurement</>
    case "hyperboard.create":
      return <>created a hyperboard</>
    case "update.create":
      return <>posted an update</>
    case "endorsement.award":
    case "legacy.endorsement":
      return <>endorsed someone</>
    default:
      return <>did something</>
  }
}

function collectionTypeLabel(record: CollectionRecord): string {
  const t =
    typeof record.value.type === "string" ? record.value.type.toLowerCase() : null
  if (t === "endorsement-list") return "list"
  if (t === "portfolio") return "portfolio"
  return "project"
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

// ---------------------------------- Cert preview ----------------------------

function CertPreview({ record, uri }: { record: ActivityRecord; uri: string }) {
  const parsed = parseAtUri(uri)
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
  const period = formatPeriod(
    typeof record.value.startDate === "string" ? record.value.startDate : null,
    typeof record.value.endDate === "string" ? record.value.endDate : null,
  )
  const locationCount = Array.isArray(record.value.locations)
    ? record.value.locations.length
    : 0

  return (
    <PreviewCard
      href={href}
      title={title}
      titleIcon={<Award size={12} strokeWidth={1.75} aria-hidden />}
      imageUrl={imageUrl}
      description={description}
      meta={[
        period,
        locationCount > 0
          ? `${locationCount} location${locationCount === 1 ? "" : "s"}`
          : null,
      ].filter((s): s is string => !!s)}
      withLocationIcon={locationCount > 0}
    />
  )
}

// ------------------------------ Collection preview --------------------------

function CollectionPreview({
  record,
  uri,
}: {
  record: CollectionRecord
  uri: string
}) {
  const parsed = parseAtUri(uri)
  const href = parsed
    ? `/project/${encodeURIComponent(parsed.did)}/${encodeURIComponent(parsed.rkey)}`
    : null
  const v = record.value as Record<string, unknown>
  const collectionType =
    typeof v.type === "string" ? v.type.toLowerCase() : "project"
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
  const itemCount = Array.isArray(v.items) ? v.items.length : 0
  const itemNoun = collectionType === "endorsement-list" ? "endorsement" : "cert"

  return (
    <PreviewCard
      href={href}
      title={title}
      titleIcon={<FolderGit2 size={12} strokeWidth={1.75} aria-hidden />}
      imageUrl={imageUrl}
      description={description}
      meta={[
        itemCount > 0
          ? `${itemCount} ${itemNoun}${itemCount === 1 ? "" : "s"}`
          : null,
      ].filter((s): s is string => !!s)}
    />
  )
}

// ---------------------------------- Card shell ------------------------------

function PreviewCard({
  href,
  title,
  titleIcon,
  imageUrl,
  description,
  meta,
  withLocationIcon = false,
}: {
  href: string | null
  title: string
  titleIcon: React.ReactNode
  imageUrl: string | null
  description: string | null
  meta: string[]
  withLocationIcon?: boolean
}) {
  const body = (
    <>
      {imageUrl ? (
        <span className="home-feed__preview-thumb">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageUrl} alt="" loading="lazy" />
        </span>
      ) : (
        <span className="home-feed__preview-thumb home-feed__preview-thumb--placeholder">
          {titleIcon}
        </span>
      )}
      <span className="home-feed__preview-body">
        <span className="home-feed__preview-title">{title}</span>
        {description ? (
          <span className="home-feed__preview-desc">{description}</span>
        ) : null}
        {meta.length > 0 ? (
          <span className="home-feed__preview-meta">
            {meta.map((m, i) => (
              <span key={i} className="home-feed__preview-meta-item">
                {i === 0 && withLocationIcon && i === meta.length - 1 ? (
                  <MapPin size={11} strokeWidth={1.75} aria-hidden />
                ) : null}
                {m}
              </span>
            ))}
          </span>
        ) : null}
      </span>
    </>
  )

  if (href) {
    return (
      <Link href={href} className="home-feed__preview">
        {body}
      </Link>
    )
  }
  return <div className="home-feed__preview">{body}</div>
}

function formatPeriod(
  start: string | null,
  end: string | null,
): string | null {
  if (!start && !end) return null
  const s = start ? formatShortDate(start) : null
  const e = end ? formatShortDate(end) : null
  if (s && e) return `${s} – ${e}`
  if (s) return `${s} (ongoing)`
  if (e) return `Until ${e}`
  return null
}
