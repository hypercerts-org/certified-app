"use client"

import Link from "next/link"
import { Inbox, Users } from "lucide-react"
import Avatar from "@/components/ui/avatar"
import EmptyState from "@/components/ui/empty-state"
import LoadingSpinner from "@/components/ui/loading-spinner"
import { useActivity } from "@/hooks/use-activity"
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
 *
 * Each event renders as a distinct social-media card. Header layout:
 *
 *     ┌─────┐  display-name verbed-something                  · time ·
 *     │ av  │
 *     └─────┘
 *     (body: rich record content — image, title, description)
 *
 * The handle is hidden from the chrome; hovering the avatar or the
 * display name reveals it via the native title tooltip. The action
 * verb sits inline with the display name ("alice created a cert")
 * so the header reads as one sentence. The body shows the actual
 * hydrated record — cert image + title, project banner + title,
 * endorsement subject row, evaluation summary, measurement metric.
 * No raw at-URIs in the body.
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
  // The indexer's denormalised `actorProfile` (displayName, avatarCid)
  // is empty in practice today (magic-indexer#130 — profile ingestion
  // not enabled on prod yet). `useAuthorInfo` does the per-actor PDS
  // resolve and caches at module scope, so multiple cards for the
  // same actor share one request. Prefer its data; treat the
  // indexer's actorProfile as a first-paint hint when present.
  const { info: lookup } = useAuthorInfo(event.actor)
  const indexer = event.actorProfile
  const displayName =
    lookup?.displayName ||
    indexer.displayName ||
    lookup?.handle ||
    indexer.handle ||
    event.actor.slice(0, 16)
  const handle = lookup?.handle ?? indexer.handle
  const initials = getInitials(
    lookup?.displayName ?? indexer.displayName,
    event.actor,
  )
  const avatarUrl =
    lookup?.avatarUrl ||
    buildAvatarUrlFromCid(indexer.did, indexer.avatarCid)
  const profileHref = `/profile/${encodeURIComponent(
    handle || event.actor,
  )}`
  // Native tooltip on hover — shows the handle without crowding the
  // visible chrome. Falls back to the DID for actors with no handle.
  const hoverHint = handle ? `@${handle}` : event.actor

  return (
    <header className="home-card__header">
      <Link
        href={profileHref}
        className="home-card__avatar"
        aria-label={`${displayName}'s profile`}
        title={hoverHint}
      >
        <Avatar
          size="md"
          src={avatarUrl ?? undefined}
          alt=""
          fallbackInitials={initials}
        />
      </Link>
      <p className="home-card__sentence">
        <Link
          href={profileHref}
          className="home-card__actor-name"
          title={hoverHint}
        >
          {displayName}
        </Link>{" "}
        <span className="home-card__action">
          <ActionPhrase event={event} />
        </span>
      </p>
      <time
        className="home-card__time"
        dateTime={event.createdAt}
        title={event.createdAt}
      >
        {formatRelativeTime(event.createdAt)}
      </time>
    </header>
  )
}

/**
 * Header verb phrase for every event kind. Renders JSX rather than a
 * plain string because evaluation + measurement events embed a
 * clickable cert target ("added a measurement to <cert>"), and
 * unhydrated unknown-kind events still recover their verb from
 * `rawKind` instead of degrading to "did something".
 */
function ActionPhrase({ event }: { event: HomeFeedEvent }) {
  switch (event.kind) {
    case "cert.create":
      return <>created a cert</>
    case "collection.create":
      return <>created a {collectionVerb(event.record)}</>
    case "evaluation.create":
      return (
        <CertTargetPhrase verb="added an evaluation to" targetUri={event.targetUri} />
      )
    case "measurement.create":
      return (
        <CertTargetPhrase verb="added a measurement to" targetUri={event.targetUri} />
      )
    case "hyperboard.create":
      return <>created a hyperboard</>
    case "update.create":
      return <>posted an update</>
    case "endorsement.award":
    case "legacy.endorsement":
      return <>endorsed</>
    case "unknown":
      return <>{actionLabelForRawKind(event.rawKind)}</>
  }
}

/**
 * Verb + clickable cert link, e.g. "added a measurement to <cert>".
 * Falls back to the verb minus its trailing "to" when the target
 * URI isn't known (rare — hydration miss).
 */
function CertTargetPhrase({
  verb,
  targetUri,
}: {
  verb: string
  targetUri: string | null
}) {
  if (!targetUri) {
    return <>{verb.replace(/ to$/, "")}</>
  }
  const parsed = parseAtUri(targetUri)
  const href = parsed
    ? `/activity/${encodeURIComponent(parsed.did)}/${encodeURIComponent(parsed.rkey)}`
    : null
  return (
    <>
      {verb}{" "}
      {href ? (
        <Link href={href} className="home-card__action-target">
          <CertTargetName did={parsed!.did} rkey={parsed!.rkey} />
        </Link>
      ) : (
        <CertTargetName did={parsed?.did ?? ""} rkey={parsed?.rkey ?? ""} />
      )}
    </>
  )
}

function CertTargetName({ did, rkey }: { did: string; rkey: string }) {
  const { activity } = useActivity(did || null, rkey || null)
  const title =
    typeof activity?.value.title === "string" && activity.value.title.length > 0
      ? activity.value.title
      : null
  return <>{title ?? "a cert"}</>
}

function actionLabelForRawKind(kind: string): string {
  switch (kind) {
    case "cert.create":
      return "created a cert"
    case "collection.create":
      return "created a project"
    case "evaluation.create":
      return "added an evaluation"
    case "measurement.create":
      return "added a measurement"
    case "hyperboard.create":
      return "created a hyperboard"
    case "update.create":
      return "posted an update"
    case "endorsement.award":
    case "legacy.endorsement":
      return "endorsed"
    default:
      return "did something"
  }
}

function collectionVerb(record: CollectionRecord): string {
  const t =
    typeof record.value.type === "string"
      ? record.value.type.toLowerCase()
      : null
  if (t === "endorsement-list") return "list"
  if (t === "portfolio") return "portfolio"
  return "project"
}

// ----------------------------------------------------------------------
// Body dispatch — no more action line in here; that's in the header.
// Each body just renders the rich record content.
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
    case "measurement.create":
    case "update.create":
      return event.title ? <TitleOnlyBody title={event.title} /> : null
    case "hyperboard.create":
      // Hyperboard lexicon doesn't surface a title — header carries
      // the full message.
      return null
    case "unknown":
      // Wire kind we couldn't hydrate (or genuinely unknown). The
      // header already carries the recovered verb; no body content
      // to surface beyond that.
      return null
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
  // Priority: avatar (the collection's primary image) → image
  // (legacy field on older records) → banner (decorative). Avatar
  // is the identity image; banner is the wide hero. For a feed
  // card the avatar reads as the project, not the banner.
  const rawImage = v.avatar ?? v.image ?? v.banner
  const imageUrl =
    rawImage && parsed
      ? resolveActivityImageUrl(
          rawImage as Parameters<typeof resolveActivityImageUrl>[0],
          parsed.did,
        )
      : null

  return (
    <div className="home-card__body">
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
  const subjectHint = info?.handle ? `@${info.handle}` : subjectDid
  return (
    <div className="home-card__body">
      <Link
        href={subjectHref}
        className="home-card__subject"
        title={subjectHint}
      >
        <Avatar
          size="sm"
          src={subjectAvatar ?? undefined}
          alt=""
          fallbackInitials={subjectInitials}
        />
        <span className="home-card__subject-name">{subjectName}</span>
      </Link>
      {note ? <p className="home-card__note">{note}</p> : null}
    </div>
  )
}

// ----------------------------------------------------------------------
// Title-only body — evaluation summary, measurement metric, attachment
// title. Pure text headline; no image, no description.
// ----------------------------------------------------------------------

function TitleOnlyBody({ title }: { title: string }) {
  return (
    <div className="home-card__body">
      <span className="home-card__primary home-card__primary--standalone">
        <span className="home-card__title">{title}</span>
      </span>
    </div>
  )
}

// ----------------------------------------------------------------------
// Card link wrapper — degrades to a div when the target route doesn't
// exist (some kinds don't have a detail page yet).
// ----------------------------------------------------------------------

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
