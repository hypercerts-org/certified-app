"use client"

import { memo, useState, type ReactNode, type SyntheticEvent } from "react"
import { listUrl, profileUrl, recordUrl } from "@/lib/urls"
import Link from "next/link"
import { MapPin } from "lucide-react"
import Avatar from "@/components/ui/avatar"
import IdentityRow from "@/components/ui/identity-row"
import Button from "@/components/ui/button"
import { useActivity } from "@/hooks/use-activity"
import { useProject } from "@/hooks/use-project"
import { useAuthorInfo } from "@/hooks/use-author-info"
import type {
  ActivityHomeFeedView,
  CollectionHomeFeedView,
  HomeFeedActor,
  HomeFeedEvent,
  SimpleHomeFeedView,
} from "@/hooks/use-home-feed"
import type { EndorsementGroupItem } from "@/lib/utils/group-feed"
import { formatRelativeTime } from "@/lib/atproto/activity"
import { parseAtUri } from "@/lib/atproto/activity-uri"
import { formatShortDate } from "@/lib/utils/format-date"
import { hideBrokenThumb } from "@/lib/utils/image-fallback"
import { getInitials } from "@/lib/utils/initials"
import { TYPED_LIST_TYPES, type TypedListType } from "@/lib/atproto/typed-lists"

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
interface FeedCardHeadProps {
  actor: string
  actorProfile: HomeFeedActor
  action: ReactNode
  createdAt: string
}

function FeedCardHead(props: FeedCardHeadProps) {
  return props.actorProfile.complete ? (
    <FeedCardHeadView {...props} actorProfile={props.actorProfile} />
  ) : (
    <LegacyFeedCardHead {...props} />
  )
}

function useResolvedLegacyActor(actor: HomeFeedActor): HomeFeedActor {
  const { info } = useAuthorInfo(actor.did)
  return {
    ...actor,
    handle: info?.handle || actor.handle || null,
    displayName: info?.displayName || actor.displayName || null,
    avatarUrl: info?.avatarUrl || actor.avatarUrl || null,
  }
}

function LegacyFeedCardHead(props: FeedCardHeadProps) {
  const actorProfile = useResolvedLegacyActor(props.actorProfile)
  return <FeedCardHeadView {...props} actorProfile={actorProfile} />
}

function FeedCardHeadView({
  actor,
  actorProfile,
  action,
  createdAt,
}: FeedCardHeadProps) {
  const actorName =
    actorProfile.displayName || actorProfile.handle || actor.slice(0, 16)
  const actorInitials = getInitials(actorProfile.displayName, actorProfile.handle)
  const profileHref = profileUrl(actorProfile.handle || actor)
  return (
    <header className="home-feed__card-head">
      <Link
        href={profileHref}
        className="home-feed__avatar"
        aria-label={`${actorName}'s profile`}
      >
        <Avatar
          size="sm"
          src={actorProfile.avatarUrl ?? undefined}
          alt=""
          fallbackInitials={actorInitials}
        />
      </Link>
      <div className="home-feed__card-head-meta">
        <p className="home-feed__byline">
          <Link href={profileHref} className="home-feed__actor">
            {actorName}
          </Link>
          <time className="home-feed__time" dateTime={createdAt} title={createdAt}>
            {formatRelativeTime(createdAt)}
          </time>
        </p>
        {actorProfile.handle ? (
          <p className="home-feed__handle">@{actorProfile.handle}</p>
        ) : null}
        <p className="home-feed__sentence">{action}</p>
      </div>
    </header>
  )
}

// Appending a page preserves existing event object identities, so
// unchanged rows can skip reconciliation on long feeds.
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
        <CertPreview view={event.view} uri={event.uri} />
      ) : null}
      {event.kind === "collection.create" ||
      event.kind === "project.created_with_cert" ? (
        <CollectionPreview view={event.view} uri={event.uri} />
      ) : null}
      {event.kind === "update.create" ? (
        <UpdatePreview view={event.view} />
      ) : null}
    </article>
  )
})

/** Expanded endorsement groups reveal one window at a time so a large
 * batch does not mount hundreds of identity rows in one commit. */
const GROUP_EXPAND_PAGE = 50

/**
 * Grouped row: "<actor> endorsed <first> and N others" with a "Show
 * all" toggle that expands an inline list of every endorsed account.
 *
 * The head follows the same byline layout as the single-event
 * HomeFeedRow so the visual rhythm of the feed stays consistent across
 * mixed single + grouped rows. The first subject is the most recent
 * endorsement in the burst.
 */
export const EndorsementGroupRow = memo(
  function EndorsementGroupRow({ group }: { group: EndorsementGroupItem }) {
    const othersCount = group.subjects.length - 1
    const [expanded, setExpanded] = useState(false)
    const [visibleCount, setVisibleCount] = useState(GROUP_EXPAND_PAGE)
    const remaining = group.subjects.length - visibleCount

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
                first={group.subjects[0]}
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
            setVisibleCount(GROUP_EXPAND_PAGE)
            setExpanded((current) => !current)
          }}
        >
          {expanded ? "Show fewer" : "Show all"}
        </Button>
        {expanded ? (
          <>
            <ul className="home-feed__group-list">
              {group.subjects.slice(0, visibleCount).map((subject, index) => (
                <li
                  key={`${subject.did}-${index}`}
                  className="home-feed__group-list-item"
                >
                  <EndorsedAccountLink subject={subject} />
                </li>
              ))}
            </ul>
            {remaining > 0 ? (
              <Button
                variant="ghost"
                size="sm"
                className="home-feed__group-toggle"
                onClick={() =>
                  setVisibleCount((count) => count + GROUP_EXPAND_PAGE)
                }
              >
                Show more ({remaining} remaining)
              </Button>
            ) : null}
          </>
        ) : null}
      </article>
    )
  },
  (previous, next) =>
    previous.group.key === next.group.key &&
    previous.group.actor === next.group.actor &&
    previous.group.createdAt === next.group.createdAt &&
    previous.group.actorProfile === next.group.actorProfile &&
    previous.group.subjects.length === next.group.subjects.length &&
    previous.group.subjects.every((subject, index) => {
      const candidate = next.group.subjects[index]
      return (
        subject.did === candidate.did &&
        subject.handle === candidate.handle &&
        subject.displayName === candidate.displayName &&
        subject.avatarUrl === candidate.avatarUrl &&
        subject.complete === candidate.complete
      )
    }),
)

function EndorsementGroupSummary({
  first,
  othersCount,
}: {
  first: HomeFeedActor
  othersCount: number
}) {
  return first.complete ? (
    <EndorsementGroupSummaryView first={first} othersCount={othersCount} />
  ) : (
    <LegacyEndorsementGroupSummary first={first} othersCount={othersCount} />
  )
}

function LegacyEndorsementGroupSummary({
  first,
  othersCount,
}: {
  first: HomeFeedActor
  othersCount: number
}) {
  const resolvedFirst = useResolvedLegacyActor(first)
  return (
    <EndorsementGroupSummaryView
      first={resolvedFirst}
      othersCount={othersCount}
    />
  )
}

function EndorsementGroupSummaryView({
  first,
  othersCount,
}: {
  first: HomeFeedActor
  othersCount: number
}) {
  const name = first.displayName || (first.handle ? `@${first.handle}` : null)
  return (
    <>
      <Link href={profileUrl(first.handle || first.did)} className="home-feed__target">
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

function EndorsedAccountLink({ subject }: { subject: HomeFeedActor }) {
  return subject.complete ? (
    <EndorsedAccountLinkView subject={subject} />
  ) : (
    <LegacyEndorsedAccountLink subject={subject} />
  )
}

function LegacyEndorsedAccountLink({ subject }: { subject: HomeFeedActor }) {
  const resolvedSubject = useResolvedLegacyActor(subject)
  return <EndorsedAccountLinkView subject={resolvedSubject} />
}

function EndorsedAccountLinkView({ subject }: { subject: HomeFeedActor }) {
  return (
    <IdentityRow
      did={subject.did}
      handle={subject.handle ?? undefined}
      displayName={subject.displayName ?? undefined}
      avatarUrl={subject.avatarUrl ?? undefined}
      href={profileUrl(subject.handle || subject.did)}
      size="sm"
    />
  )
}

function EventSentence({ event }: { event: HomeFeedEvent }) {
  switch (event.kind) {
    case "cert.create":
      return <>created an activity</>
    case "collection.create":
      return <CollectionSentence collectionType={event.view.collectionType} />
    case "project.created_with_cert":
      return <>created a project with an activity</>
    case "endorsement.award":
    case "legacy.endorsement":
      return <EndorsementSentence subject={event.subject} />
    case "evaluation.create":
      return <CertTargetSentence verb="added an evaluation to" targetUri={event.view.targetUri} />
    case "measurement.create":
      return <CertTargetSentence verb="added a measurement to" targetUri={event.view.targetUri} />
    case "hyperboard.create":
      return <>created a hyperboard</>
    case "update.create":
      return <TargetSentence verb="posted an update to" targetUri={event.view.targetUri} fallback="posted an update" />
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
function CollectionSentence({ collectionType }: { collectionType: string | null }) {
  switch (collectionType?.toLowerCase()) {
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

function EndorsementSentence({ subject }: { subject: HomeFeedActor }) {
  return subject.complete ? (
    <EndorsementSentenceView subject={subject} />
  ) : (
    <LegacyEndorsementSentence subject={subject} />
  )
}

function LegacyEndorsementSentence({ subject }: { subject: HomeFeedActor }) {
  const resolvedSubject = useResolvedLegacyActor(subject)
  return <EndorsementSentenceView subject={resolvedSubject} />
}

function EndorsementSentenceView({ subject }: { subject: HomeFeedActor }) {
  const name = subject.displayName || (subject.handle ? `@${subject.handle}` : null)
  return (
    <>
      endorsed{" "}
      <Link
        href={profileUrl(subject.handle || subject.did)}
        className="home-feed__target"
      >
        {name ?? "an account"}
      </Link>
    </>
  )
}

export function CertPreview({
  view,
  uri,
}: {
  view: ActivityHomeFeedView
  uri: string
}) {
  const parsed = parseAtUri(uri)
  const href = parsed ? recordUrl(parsed.did, "activity", parsed.rkey) : null
  const period = formatPeriod(view.startDate, view.endDate)
  return (
    <PreviewCard
      href={href}
      title={view.title || "Untitled activity"}
      imageUrl={view.imageUrl}
      description={view.shortDescription}
      meta={[
        period,
        view.locationCount > 0 ? (
          <>
            <MapPin size={11} strokeWidth={1.75} aria-hidden />
            {`${view.locationCount} location${view.locationCount === 1 ? "" : "s"}`}
          </>
        ) : null,
      ].filter((item): item is NonNullable<typeof item> => item !== null)}
    />
  )
}

function CollectionPreview({
  view,
  uri,
}: {
  view: CollectionHomeFeedView
  uri: string
}) {
  const parsed = parseAtUri(uri)
  const collectionType = view.collectionType?.toLowerCase() ?? "project"
  const href = parsed
    ? TYPED_LIST_TYPES.includes(collectionType as TypedListType)
      ? listUrl(parsed.did, parsed.rkey)
      : recordUrl(parsed.did, "project", parsed.rkey)
    : null
  const itemNoun =
    collectionType === "list:endorsements"
      ? view.itemCount === 1
        ? "endorsement"
        : "endorsements"
      : view.itemCount === 1
        ? "activity"
        : "activities"
  return (
    <PreviewCard
      href={href}
      title={view.title || "Untitled project"}
      imageUrl={view.imageUrl}
      description={view.shortDescription}
      meta={view.itemCount > 0 ? [`${view.itemCount} ${itemNoun}`] : []}
    />
  )
}

function UpdatePreview({ view }: { view: SimpleHomeFeedView }) {
  const parsed = view.targetUri ? parseAtUri(view.targetUri) : null
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
      title={view.title?.trim() || "Update"}
      imageUrl={view.imageUrl}
      description={view.shortDescription}
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
  imageUrl,
  description,
  meta,
}: {
  href: string | null
  title: string
  imageUrl: string | null
  description: string | null
  meta: ReactNode[]
}) {
  const body = (
    <>
      {imageUrl ? (
        <span className="home-feed__card-image">
          {/* eslint-disable-next-line @next/next/no-img-element */}
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
