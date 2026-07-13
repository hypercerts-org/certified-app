"use client"

import { memo, useState, type ReactNode, type SyntheticEvent } from "react"
import { listUrl, profileUrl, recordUrl } from "@/lib/urls"
import Link from "next/link"
import { MapPin } from "lucide-react"
import Avatar from "@/components/ui/avatar"
import IdentityRow from "@/components/ui/identity-row"
import Badge, { type BadgeTone } from "@/components/ui/badge"
import Button from "@/components/ui/button"
import { useActivity } from "@/hooks/use-activity"
import { useProject } from "@/hooks/use-project"
import { useAuthorInfo } from "@/hooks/use-author-info"
import type { HomeFeedEvent } from "@/hooks/use-home-feed"
import type { EndorsementGroupItem } from "@/lib/utils/group-feed"
import { formatRelativeTime, resolveActivityImageUrl } from "@/lib/atproto/activity"
import type { FeedActor } from "@/lib/atproto/follower-events"
import { parseAtUri } from "@/lib/atproto/activity-uri"
import { formatTimePeriod } from "@/lib/utils/format-date"
import { hideBrokenThumb } from "@/lib/utils/image-fallback"
import { getInitials } from "@/lib/utils/initials"
import { buildAvatarUrlFromCid } from "@/lib/atproto/profile"
import type { ActivityRecord } from "@/lib/atproto/activity-types"
import {
  projectImage,
  projectTitle,
  type CollectionRecord,
} from "@/lib/atproto/collection"
import { TYPED_LIST_TYPES, type TypedListType } from "@/lib/atproto/typed-lists"

/**
 * Presentational row layer for the home feed: the per-event card
 * (byline head + verb sentence + record preview) and the grouped
 * endorsement row. Consumed only by HomeFeedBody in home-feed.tsx;
 * every component here takes plain data props — no filter or
 * pagination state crosses the seam.
 */

/**
 * Card head shared by single-event and grouped rows — the certs.social
 * author byline: avatar + display name + @handle linking to the actor's
 * profile, relative time pinned to the right edge, and the event verb
 * sentence as a muted second line. The sentence renders OUTSIDE the
 * byline link because it carries its own links (target cert / project /
 * account names) — nested anchors are invalid HTML.
 *
 * The indexer's denormalised `actorProfile` is empty in practice today
 * (magic-indexer#130 — profile ingestion not enabled on prod).
 * `useAuthorInfo` does the per-actor PDS resolve and caches at module
 * scope. Prefer its data; treat the indexer's actorProfile as a
 * first-paint hint when present.
 */
function FeedCardHead({
  actor,
  actorProfile,
  action,
  createdAt,
}: {
  actor: string
  actorProfile: FeedActor
  action: ReactNode
  createdAt: string
}) {
  const { info: lookup } = useAuthorInfo(actor)
  const actorName =
    lookup?.displayName ||
    actorProfile.displayName ||
    lookup?.handle ||
    actorProfile.handle ||
    actor.slice(0, 16)
  const actorHandle = lookup?.handle || actorProfile.handle || null
  const actorAvatar =
    lookup?.avatarUrl ||
    buildAvatarUrlFromCid(actorProfile.did, actorProfile.avatarCid)
  const actorInitials = getInitials(
    lookup?.displayName ?? actorProfile.displayName,
    actorHandle,
  )
  const profileHref = profileUrl(actorHandle || actor)

  return (
    <header className="home-feed__card-head">
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
      <div className="home-feed__card-head-meta">
        {/* Row 1: display name + relative time pinned right. The
            @handle gets its own second row below the name. */}
        <p className="home-feed__byline">
          <Link href={profileHref} className="home-feed__actor">
            {actorName}
          </Link>
          <time
            className="home-feed__time"
            dateTime={createdAt}
            title={createdAt}
          >
            {formatRelativeTime(createdAt)}
          </time>
        </p>
        {actorHandle ? (
          <p className="home-feed__handle">@{actorHandle}</p>
        ) : null}
        <p className="home-feed__sentence">{action}</p>
      </div>
    </header>
  )
}

// Memoized: useHomeFeed's loadMore appends with a new events-array
// identity but stable per-event object refs, so unchanged cards bail
// out of reconciliation on long feeds — the same hazard ActivityCard
// documents in feed/activity-card.tsx.
export const HomeFeedRow = memo(function HomeFeedRow({
  event,
}: {
  event: HomeFeedEvent
}) {
  return (
    <article className="home-feed__card">
      <FeedCardHead
        actor={event.actor}
        actorProfile={event.actorProfile}
        action={<EventSentence event={event} />}
        createdAt={event.createdAt}
      />
      {event.kind === "cert.create" ? (
        <CertPreview record={event.record} uri={event.uri} labels={event.labels} />
      ) : null}
      {event.kind === "collection.create" ||
      event.kind === "project.created_with_cert" ? (
        <CollectionPreview record={event.record} uri={event.uri} />
      ) : null}
      {event.kind === "update.create" ? (
        <UpdatePreview
          title={event.title}
          shortDescription={event.shortDescription}
          targetUri={event.targetUri}
          imageUrl={event.imageUrl}
        />
      ) : null}
    </article>
  )
})

/** Page size for the expanded subject list. Grouping is designed to
 *  absorb ~1000-endorsement bursts into one row (see MAX_AUTO_LOADS
 *  in home-feed.tsx); mounting that many IdentityRows in a single
 *  commit stalls the main thread, so expansion reveals this many at
 *  a time. Groups of 2-20 (the common case) are unaffected. */
const GROUP_EXPAND_PAGE = 50

/**
 * Grouped row: "<actor> endorsed <first> and N others" with a "Show
 * all" toggle that expands an inline list of every endorsed account.
 *
 * The head follows the same byline layout as the single-event
 * HomeFeedRow so the visual rhythm of the feed stays consistent across
 * mixed single + grouped rows. The first-subject sentence is the row's
 * primary identity, since subjectDids[0] is the most recent
 * endorsement in the burst.
 */
export const EndorsementGroupRow = memo(
  function EndorsementGroupRow({ group }: { group: EndorsementGroupItem }) {
    const othersCount = group.subjectDids.length - 1
    const [expanded, setExpanded] = useState(false)
    const [visibleCount, setVisibleCount] = useState(GROUP_EXPAND_PAGE)
    const remaining = group.subjectDids.length - visibleCount

    return (
      <article className="home-feed__card">
        <FeedCardHead
          actor={group.actor}
          actorProfile={group.actorProfile}
          createdAt={group.createdAt}
          action={
            <>
              endorsed{" "}
              <EndorsementGroupSummary
                firstDid={group.subjectDids[0]}
                othersCount={othersCount}
              />
            </>
          }
        />
        <Button
          variant="ghost"
          size="sm"
          pressed={expanded}
          aria-expanded={expanded}
          className="home-feed__group-toggle"
          onClick={() => {
            // Collapse resets the window so re-expanding starts at
            // one page again.
            if (expanded) setVisibleCount(GROUP_EXPAND_PAGE)
            setExpanded(!expanded)
          }}
        >
          {expanded ? "Show fewer" : "Show all"}
        </Button>
        {expanded ? (
          <>
            <ul className="home-feed__group-list">
              {group.subjectDids.slice(0, visibleCount).map((did) => (
                <li key={did} className="home-feed__group-list-item">
                  <EndorsedAccountLink did={did} />
                </li>
              ))}
            </ul>
            {remaining > 0 ? (
              <Button
                variant="ghost"
                size="sm"
                className="home-feed__group-toggle"
                onClick={() => setVisibleCount((c) => c + GROUP_EXPAND_PAGE)}
              >
                Show more ({remaining} remaining)
              </Button>
            ) : null}
          </>
        ) : null}
      </article>
    )
  },
  // groupConsecutiveEndorsements rebuilds every group object (and its
  // subjectDids array) on each events change, so shallow compare never
  // bails. A group's identity is its key + headline time + actor
  // profile + subject composition — compare those element-wise. O(n)
  // only on re-render attempts, trivially cheap vs. the render saved.
  (prev, next) =>
    prev.group.key === next.group.key &&
    prev.group.createdAt === next.group.createdAt &&
    prev.group.actorProfile === next.group.actorProfile &&
    prev.group.subjectDids.length === next.group.subjectDids.length &&
    prev.group.subjectDids.every((d, i) => d === next.group.subjectDids[i]),
)

function EndorsementGroupSummary({
  firstDid,
  othersCount,
}: {
  firstDid: string
  othersCount: number
}) {
  const { info } = useAuthorInfo(firstDid)
  const name = info?.displayName || (info?.handle ? `@${info.handle}` : null)
  const href = profileUrl(info?.handle || firstDid)
  return (
    <>
      <Link href={href} className="home-feed__target">
        {name ?? "an account"}
      </Link>
      {othersCount > 0 ? (
        <>
          {" "}
          and {othersCount} {othersCount === 1 ? "other" : "others"}
        </>
      ) : null}
    </>
  )
}

function EndorsedAccountLink({ did }: { did: string }) {
  const { info } = useAuthorInfo(did)
  const href = profileUrl(info?.handle || did)
  return (
    <IdentityRow
      did={did}
      handle={info?.handle ?? undefined}
      displayName={info?.displayName ?? undefined}
      avatarUrl={info?.avatarUrl ?? undefined}
      href={href}
      size="sm"
    />
  )
}

function EventSentence({ event }: { event: HomeFeedEvent }) {
  switch (event.kind) {
    case "cert.create":
      return <>created an activity</>
    case "collection.create":
      return <CollectionSentence record={event.record} />
    case "project.created_with_cert":
      return <>created a project with an activity</>
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
      return <TargetSentence verb="posted an update to" targetUri={event.targetUri} fallback="posted an update" />
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
    ? recordUrl(parsed.did, "activity", parsed.rkey)
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
  return <>{title ?? "an activity"}</>
}

/**
 * Generalized verb-and-target sentence that dispatches on the
 * target URI's collection (NSID) — cert URIs route through the
 * cert-detail link, project collection URIs through the project
 * detail link, anything else falls back to plain text. Used by
 * update.create events, whose target can be either a cert
 * (`org.hypercerts.claim.activity`) OR a project / endorsements-list
 * (`org.hypercerts.collection`).
 *
 * `fallback` is the text shown when `targetUri` is null (lexicon
 * didn't populate `subjects[]`) — typically a shorter sentence
 * without the trailing "to" preposition.
 */
function TargetSentence({
  verb,
  targetUri,
  fallback,
}: {
  verb: string
  targetUri: string | null
  fallback: string
}) {
  if (!targetUri) return <>{fallback}</>
  const parsed = parseAtUri(targetUri)
  if (!parsed) return <>{fallback}</>
  if (parsed.collection === "org.hypercerts.claim.activity") {
    return <CertTargetSentence verb={verb} targetUri={targetUri} />
  }
  if (parsed.collection === "org.hypercerts.collection") {
    const href = recordUrl(parsed.did, "project", parsed.rkey)
    return (
      <>
        {verb}{" "}
        <Link href={href} className="home-feed__target">
          <ProjectTargetName did={parsed.did} rkey={parsed.rkey} />
        </Link>
      </>
    )
  }
  // Unknown lexicon — keep the verb but drop the "to <X>" tail.
  return <>{fallback}</>
}

/**
 * Resolves the linked project's title for use as inline link text.
 * Falls back to "a project" while loading or on miss.
 */
function ProjectTargetName({ did, rkey }: { did: string; rkey: string }) {
  const { project } = useProject(did || null, rkey || null)
  const title =
    typeof project?.value.title === "string" && project.value.title.length > 0
      ? project.value.title
      : typeof project?.value.name === "string" && project.value.name.length > 0
        ? project.value.name
        : null
  return <>{title ?? "a project"}</>
}

function UnhydratedSentence({ rawKind }: { rawKind: string }) {
  switch (rawKind) {
    case "cert.create":
      return <>created an activity</>
    case "collection.create":
      return <>created a project</>
    case "project.created_with_cert":
      return <>created a project with an activity</>
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

/**
 * Sentence for `collection.create` events. The
 * `org.hypercerts.collection` lexicon carries a `type` discriminator
 * that the renderer routes off to pick the right verb phrase:
 *
 *   project           → "created a project"
 *   list:endorsements → "created an endorsement list"
 *   list:projects     → "created a list of projects"
 *   list:certs        → "created a list of certs"
 *   list:accounts     → "created a list of accounts"
 *   portfolio         → "created a portfolio"   (legacy)
 *   unknown           → "created a collection"  (defensive)
 *
 * The collection's title + description + image render in the preview
 * card immediately below the sentence, so the sentence itself stays
 * short — naming "what kind" without re-stating "which one".
 */
function CollectionSentence({ record }: { record: CollectionRecord }) {
  const rawType =
    typeof record.value.type === "string"
      ? record.value.type.toLowerCase()
      : null

  switch (rawType) {
    case "project":
      return <>created a project</>
    case "list:endorsements":
      return <>created an endorsement list</>
    case "list:projects":
      return <>created a list of projects</>
    case "list:certs":
      return <>created a list of activities</>
    case "list:accounts":
      return <>created a list of accounts</>
    case "portfolio":
      return <>created a portfolio</>
    default:
      return <>created a collection</>
  }
}

function EndorsementSentence({ subjectDid }: { subjectDid: string }) {
  const { info } = useAuthorInfo(subjectDid)
  const name = info?.displayName || (info?.handle ? `@${info.handle}` : null)
  const href = profileUrl(info?.handle || subjectDid)
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

// Square-tag tone per quality label. The Badge square variant treats
// "warn" as error-toned (red), so draft reads error-tone and
// likely-test reads neutral — preserving the legacy
// home-feed__preview-tag look (--warn = red, base = muted).
const QUALITY_TAGS: Record<string, { label: string; tone: BadgeTone }> = {
  draft: { label: "Draft", tone: "warn" },
  "likely-test": { label: "Likely test", tone: "neutral" },
}

function certQualityTags(labels: readonly string[]): { key: string; label: string; tone: BadgeTone }[] {
  return labels
    .map((l) => (QUALITY_TAGS[l] ? { key: l, ...QUALITY_TAGS[l] } : null))
    .filter((x): x is { key: string; label: string; tone: BadgeTone } => !!x)
}

export function CertPreview({
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
    ? recordUrl(parsed.did, "activity", parsed.rkey)
    : null
  const title =
    typeof record.value.title === "string" && record.value.title.length > 0
      ? record.value.title
      : "Untitled activity"
  const description =
    typeof record.value.shortDescription === "string" &&
    record.value.shortDescription.length > 0
      ? record.value.shortDescription
      : null
  const imageUrl =
    record.value.image && parsed
      ? resolveActivityImageUrl(record.value.image, parsed.did)
      : null
  const period = formatTimePeriod(
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
        locationCount > 0 ? (
          <>
            <MapPin size={11} strokeWidth={1.75} aria-hidden />
            {`${locationCount} location${locationCount === 1 ? "" : "s"}`}
          </>
        ) : null,
      ].filter((m): m is NonNullable<typeof m> => m !== null && m !== undefined)}
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
  const v = record.value as Record<string, unknown>
  const collectionType =
    typeof v.type === "string" ? v.type.toLowerCase() : "project"
  // Typed lists (projects / accounts / certs) have no record route —
  // they open in-place on the owner's Lists tab. Everything else
  // (project, list:endorsements, portfolio) keeps the project link.
  const href = parsed
    ? TYPED_LIST_TYPES.includes(collectionType as TypedListType)
      ? listUrl(parsed.did, parsed.rkey)
      : recordUrl(parsed.did, "project", parsed.rkey)
    : null
  const fallbackTitle =
    collectionType === "list:endorsements"
      ? "Untitled list"
      : collectionType === "portfolio"
        ? "Untitled portfolio"
        : "Untitled project"
  const title = projectTitle(record.value, fallbackTitle)
  const description =
    typeof v.shortDescription === "string" && v.shortDescription.length > 0
      ? v.shortDescription
      : null
  // Feed-card thumbnail — avatar-first (`projectImage` thumb slot):
  // the avatar is the identity image; the banner is the wide hero.
  const rawImage = projectImage(record.value, "thumb")
  const imageUrl =
    rawImage && parsed ? resolveActivityImageUrl(rawImage, parsed.did) : null
  const itemCount = Array.isArray(v.items) ? v.items.length : 0
  const itemNoun =
    collectionType === "list:endorsements"
      ? itemCount === 1
        ? "endorsement"
        : "endorsements"
      : itemCount === 1
        ? "activity"
        : "activities"

  return (
    <PreviewCard
      href={href}
      title={title}
      imageUrl={imageUrl}
      description={description}
      meta={[
        itemCount > 0 ? `${itemCount} ${itemNoun}` : null,
      ].filter((s): s is string => !!s)}
    />
  )
}

// ----------------------------- Update preview ------------------------------

/**
 * Card preview for an `update.create` event. Modeled on the project
 * card: the attachment lexicon's `title` + `shortDescription`
 * populate the body; the first `image/*` blob in `content[]`
 * (resolved server-side via the indexer's hydration round-trip)
 * supplies the thumb when present. The card links to the target
 * cert / project detail page when `subjects[0]` resolves, matching
 * the inline "posted an update to <X>" sentence above. When the
 * attachment has no image content the PreviewCard falls back to
 * its no-image flow automatically.
 */
function UpdatePreview({
  title,
  shortDescription,
  targetUri,
  imageUrl,
}: {
  title: string | null
  shortDescription: string | null
  targetUri: string | null
  imageUrl: string | null
}) {
  const parsed = targetUri ? parseAtUri(targetUri) : null
  const href = parsed
    ? parsed.collection === "org.hypercerts.claim.activity"
      ? recordUrl(parsed.did, "activity", parsed.rkey)
      : parsed.collection === "org.hypercerts.collection"
        ? recordUrl(parsed.did, "project", parsed.rkey)
        : null
    : null
  return (
    <PreviewCard
      href={href}
      title={title?.trim() || "Update"}
      imageUrl={imageUrl}
      description={shortDescription}
      meta={[]}
    />
  )
}

// ---------------------------------- Card body ------------------------------

/**
 * Hide the full-width image block entirely when the blob 404s — the
 * generic `hideBrokenThumb` only hides the `<img>`, which would leave
 * the empty aspect-square container dominating the card.
 */
function hideBrokenCardImage(
  event: SyntheticEvent<HTMLImageElement>,
): void {
  const wrap = event.currentTarget.closest<HTMLElement>(
    ".home-feed__card-image",
  )
  if (wrap) wrap.style.display = "none"
  else hideBrokenThumb(event)
}

/**
 * Record body below the byline — the certs.social feed-card layout:
 * full-width square image (when the record has one), serif headline
 * title (plus quality tags), 3-line-clamped short description, and a
 * dot-separated muted meta row. The whole body links to the record's
 * detail page; only the title underlines on hover so the card still
 * reads as a card.
 */
function PreviewCard({
  href,
  title,
  tags,
  imageUrl,
  description,
  meta,
}: {
  href: string | null
  title: string
  tags?: { key: string; label: string; tone: BadgeTone }[]
  imageUrl: string | null
  description: string | null
  meta: ReactNode[]
}) {
  const body = (
    <>
      {imageUrl ? (
        <span className="home-feed__card-image">
          {/* eslint-disable-next-line @next/next/no-img-element -- dynamic bsky-CDN/blob card image URL; next/image remotePatterns limited to **.certified.app */}
          <img
            src={imageUrl}
            alt={title ? `Image for ${title}` : ""}
            loading="lazy"
            onError={hideBrokenCardImage}
          />
        </span>
      ) : null}
      <span className="home-feed__card-title-row">
        <span className="home-feed__card-title">{title}</span>
        {tags?.map((t) => (
          <Badge key={t.key} variant="tag" shape="square" tone={t.tone}>
            {t.label}
          </Badge>
        ))}
      </span>
      {description ? (
        <span className="home-feed__card-desc">{description}</span>
      ) : null}
      {meta.length > 0 ? (
        <span className="home-feed__card-meta">
          {meta.map((m, i) => (
            <span key={i} className="home-feed__card-meta-item">
              {m}
            </span>
          ))}
        </span>
      ) : null}
    </>
  )

  if (href) {
    return (
      <Link href={href} className="home-feed__card-body">
        {body}
      </Link>
    )
  }
  return <div className="home-feed__card-body">{body}</div>
}
