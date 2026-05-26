"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { Inbox, MapPin, SlidersHorizontal, Users } from "lucide-react"
import Avatar from "@/components/ui/avatar"
import EmptyState from "@/components/ui/empty-state"
import LoadingSpinner from "@/components/ui/loading-spinner"
import LoadMoreSentinel from "@/components/ui/load-more-sentinel"
import { useActivity } from "@/hooks/use-activity"
import { useAuthorInfo } from "@/hooks/use-author-info"
import { useHomeFeed, type HomeFeedEvent } from "@/hooks/use-home-feed"
import { useFollowedDids } from "@/hooks/use-followed-dids"
import { formatRelativeTime, resolveActivityImageUrl } from "@/lib/atproto/activity"
import { parseAtUri } from "@/lib/atproto/activity-uri"
import { formatShortDate } from "@/lib/utils/format-date"
import { getInitials } from "@/lib/utils/initials"
import { buildAvatarUrlFromCid } from "@/lib/atproto/profile"
import {
  DEFAULT_HIDDEN_CERT_LABELS,
  HYPERLABEL_TIERS,
  type HyperlabelTier,
} from "@/lib/atproto/labels"
import type { ActivityRecord } from "@/lib/atproto/activity-types"
import type { CollectionRecord } from "@/lib/atproto/collection"

/**
 * Filter popover order — best to worst, opposite of HYPERLABEL_TIERS
 * (which goes lowest → highest for indexer-side comparisons).
 */
const FILTER_TIERS: readonly HyperlabelTier[] = [
  "high-quality",
  "standard",
  "draft",
  "likely-test",
]

const TIER_LABELS: Record<HyperlabelTier, string> = {
  "high-quality": "High quality",
  standard: "Standard",
  draft: "Draft",
  "likely-test": "Likely test",
}

const DEFAULT_INCLUDED_TIERS: ReadonlySet<HyperlabelTier> = new Set(
  HYPERLABEL_TIERS.filter(
    (t) => !DEFAULT_HIDDEN_CERT_LABELS.includes(t),
  ),
)

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
  const [includedTiers, setIncludedTiers] = useState<Set<HyperlabelTier>>(
    () => new Set(DEFAULT_INCLUDED_TIERS),
  )
  const excludeCertLabels = useMemo(
    () => HYPERLABEL_TIERS.filter((t) => !includedTiers.has(t)),
    [includedTiers],
  )
  const { events, isLoading, isLoadingMore, hasMore, loadMore, error } =
    useHomeFeed(followedDids, { excludeCertLabels })

  return (
    <>
      <header className="home-feed__header">
        <h2 className="home-feed__heading">Feed</h2>
        <QualityFilter
          included={includedTiers}
          onChange={setIncludedTiers}
        />
      </header>
      <HomeFeedBody
        followsLoading={followsLoading}
        followsError={!!followsError}
        followedCount={followedDids.size}
        isLoading={isLoading}
        error={error}
        events={events}
        hasMore={hasMore}
        isLoadingMore={isLoadingMore}
        loadMore={loadMore}
      />
    </>
  )
}

function HomeFeedBody({
  followsLoading,
  followsError,
  followedCount,
  isLoading,
  error,
  events,
  hasMore,
  isLoadingMore,
  loadMore,
}: {
  followsLoading: boolean
  followsError: boolean
  followedCount: number
  isLoading: boolean
  error: string | null
  events: HomeFeedEvent[]
  hasMore: boolean
  isLoadingMore: boolean
  loadMore: () => void
}) {
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
  if (followedCount === 0) {
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
    <>
      <ol className="home-feed">
        {events.map((event) => (
          <li key={event.uri} className="home-feed__item">
            <HomeFeedRow event={event} />
          </li>
        ))}
      </ol>
      {hasMore || isLoadingMore ? (
        <LoadMoreSentinel
          onLoadMore={loadMore}
          isLoading={isLoadingMore}
          className="home-feed__load-more"
          buttonClassName="home-feed__load-more-btn"
        />
      ) : null}
    </>
  )
}

/**
 * Right-aligned icon button next to the "Feed" heading. Opens a
 * popover with one checkbox per Hyperlabel tier. The selected set
 * drives `excludeCertLabels` at the hydration round-trip — anything
 * unchecked is filtered out before reaching the timeline.
 */
function QualityFilter({
  included,
  onChange,
}: {
  included: Set<HyperlabelTier>
  onChange: (next: Set<HyperlabelTier>) => void
}) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handleDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", handleDown)
    document.addEventListener("keydown", handleKey)
    return () => {
      document.removeEventListener("mousedown", handleDown)
      document.removeEventListener("keydown", handleKey)
    }
  }, [open])

  const toggle = (tier: HyperlabelTier) => {
    const next = new Set(included)
    if (next.has(tier)) next.delete(tier)
    else next.add(tier)
    onChange(next)
  }

  const activeCount = included.size
  const filtered = activeCount !== HYPERLABEL_TIERS.length

  return (
    <div className="home-feed__filter" ref={wrapRef}>
      <button
        type="button"
        className={`home-feed__filter-btn${filtered ? " home-feed__filter-btn--active" : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label="Filter feed by cert quality"
      >
        <SlidersHorizontal size={14} strokeWidth={1.75} aria-hidden />
      </button>
      {open ? (
        <div className="home-feed__filter-pop" role="dialog" aria-label="Cert quality filters">
          <p className="home-feed__filter-title">Show certs labeled</p>
          <ul className="home-feed__filter-list">
            {FILTER_TIERS.map((tier) => (
              <li key={tier}>
                <label className="home-feed__filter-item">
                  <input
                    type="checkbox"
                    checked={included.has(tier)}
                    onChange={() => toggle(tier)}
                  />
                  <span>{TIER_LABELS[tier]}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
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
          <CertPreview record={event.record} uri={event.uri} labels={event.labels} />
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
      return <CertTargetSentence verb="added an evaluation to" targetUri={event.targetUri} />
    case "measurement.create":
      return <CertTargetSentence verb="added a measurement to" targetUri={event.targetUri} />
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

/**
 * Evaluation / measurement sentence with a clickable cert target.
 * If hydration didn't surface a targetUri, falls back to plain text
 * "added a measurement" (no "to <cert>" tail).
 */
function CertTargetSentence({
  verb,
  targetUri,
}: {
  verb: string
  targetUri: string | null
}) {
  if (!targetUri) {
    // Trim the "to" off the verb when there's no link target.
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
        <Link href={href} className="home-feed__target">
          <CertTargetName did={parsed!.did} rkey={parsed!.rkey} />
        </Link>
      ) : (
        <CertTargetName did={parsed?.did ?? ""} rkey={parsed?.rkey ?? ""} />
      )}
    </>
  )
}

/**
 * Resolves the linked cert's title for use as inline link text.
 * Falls back to "a cert" while loading or on miss.
 */
function CertTargetName({ did, rkey }: { did: string; rkey: string }) {
  const { activity } = useActivity(did || null, rkey || null)
  const title =
    typeof activity?.value.title === "string" && activity.value.title.length > 0
      ? activity.value.title
      : null
  return <>{title ?? "a cert"}</>
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

const QUALITY_TAGS: Record<string, { label: string; tone: "neutral" | "warn" }> = {
  draft: { label: "Draft", tone: "neutral" },
  "likely-test": { label: "Likely test", tone: "warn" },
}

function certQualityTags(labels: readonly string[]): { key: string; label: string; tone: string }[] {
  return labels
    .map((l) => (QUALITY_TAGS[l] ? { key: l, ...QUALITY_TAGS[l] } : null))
    .filter((x): x is { key: string; label: string; tone: "neutral" | "warn" } => !!x)
}

function CertPreview({
  record,
  uri,
  labels,
}: {
  record: ActivityRecord
  uri: string
  labels: readonly string[]
}) {
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
      tags={certQualityTags(labels)}
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
  const itemCount = Array.isArray(v.items) ? v.items.length : 0
  const itemNoun = collectionType === "endorsement-list" ? "endorsement" : "cert"

  return (
    <PreviewCard
      href={href}
      title={title}
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
  tags,
  imageUrl,
  description,
  meta,
  withLocationIcon = false,
}: {
  href: string | null
  title: string
  tags?: { key: string; label: string; tone: string }[]
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
      ) : null}
      <span className="home-feed__preview-body">
        <span className="home-feed__preview-title-row">
          <span className="home-feed__preview-title">{title}</span>
          {tags?.map((t) => (
            <span
              key={t.key}
              className={`home-feed__preview-tag home-feed__preview-tag--${t.tone}`}
            >
              {t.label}
            </span>
          ))}
        </span>
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

  // When there's no image, drop the 56px thumb column entirely so
  // the body flows to the card's left edge instead of sitting in a
  // ghosted gutter next to an empty placeholder.
  const cardClass = imageUrl
    ? "home-feed__preview"
    : "home-feed__preview home-feed__preview--no-image"

  if (href) {
    return (
      <Link href={href} className={cardClass}>
        {body}
      </Link>
    )
  }
  return <div className={cardClass}>{body}</div>
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
