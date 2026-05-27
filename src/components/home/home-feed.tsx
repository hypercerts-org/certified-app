"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { Inbox, MapPin, SlidersHorizontal, UserCheck, Users } from "lucide-react"
import Avatar from "@/components/ui/avatar"
import EmptyState from "@/components/ui/empty-state"
import LoadingSpinner from "@/components/ui/loading-spinner"
import LoadMoreSentinel from "@/components/ui/load-more-sentinel"
import { useActivity } from "@/hooks/use-activity"
import { useProject } from "@/hooks/use-project"
import { useAuthorInfo } from "@/hooks/use-author-info"
import { useClickOutsideClose } from "@/hooks/use-click-outside-close"
import { useEvaluatorEndorsements } from "@/hooks/use-evaluator-endorsements"
import { useHomeFeed, type HomeFeedEvent } from "@/hooks/use-home-feed"
import {
  groupConsecutiveEndorsements,
  type EndorsementGroupItem,
} from "@/lib/utils/group-feed"
import { useFollowedDids } from "@/hooks/use-followed-dids"
import { formatRelativeTime, resolveActivityImageUrl } from "@/lib/atproto/activity"
import { parseAtUri } from "@/lib/atproto/activity-uri"
import { formatShortDate } from "@/lib/utils/format-date"
import { getInitials } from "@/lib/utils/initials"
import { buildAvatarUrlFromCid } from "@/lib/atproto/profile"
import {
  DEFAULT_HIDDEN_CERT_LABELS,
  HYPERLABEL_DISPLAY_LABELS,
  HYPERLABEL_DISPLAY_ORDER,
  HYPERLABEL_TIERS,
  type HyperlabelTier,
} from "@/lib/atproto/labels"
import { TRUSTED_EVALUATOR_DIDS } from "@/lib/atproto/trusted-evaluators"
import type { ActivityRecord } from "@/lib/atproto/activity-types"
import type { CollectionRecord } from "@/lib/atproto/collection"

const DEFAULT_INCLUDED_TIERS: ReadonlySet<HyperlabelTier> = new Set(
  HYPERLABEL_TIERS.filter(
    (t) => !DEFAULT_HIDDEN_CERT_LABELS.includes(t),
  ),
)

/** Sentinel for the "Not labeled yet" checkbox — separate from the
 *  Hyperlabel tier enum so the popover state can carry it without
 *  widening the tier type. Mirrors the explore-page convention. */
const UNLABELED_SLUG = "unlabeled" as const
type UnlabeledSlug = typeof UNLABELED_SLUG
type QualityFilterValue = HyperlabelTier | UnlabeledSlug

/** Visible-row threshold below which the feed auto-paginates. Sized
 *  to "more than fits in one screen on a tall viewport" so a user
 *  who scrolls down rarely lands on an empty feed; the
 *  IntersectionObserver-based sentinel still handles further
 *  scroll-driven loads. */
const MIN_VISIBLE_ITEMS = 10
/** Hard cap on consecutive auto-loads. Sized so a single curator
 *  who batch-endorses ~1000 accounts can be fully absorbed into a
 *  single grouped row before the auto-loader yields to the user's
 *  scroll. 25 × PAGE_SIZE (50 in useHomeFeed) = up to 1250 events
 *  pulled in the auto-loop — covers the 1000-endorsement design
 *  target with headroom for trailing events. Beyond that the
 *  IntersectionObserver sentinel takes over. */
const MAX_AUTO_LOADS = 25

/**
 * GitHub-style activity timeline for the home page. Each entry is
 * an actor byline + verb sentence on top; cert and project creates
 * also render a compact preview card underneath with the record's
 * thumbnail, description, and key meta (period + location count for
 * certs, item count for projects). Endorsement events keep to the
 * single-line treatment since the sentence already names both ends
 * of the action.
 *
 * A `<header>` above the list carries the "Feed" heading on the
 * left and a per-tier filter popover (Hyperlabel quality tiers) on
 * the right. Bottom of the list hosts an IntersectionObserver
 * sentinel that calls `useHomeFeed`'s `loadMore` when it enters
 * the viewport.
 */
export default function HomeFeed({ activeDid }: { activeDid: string }) {
  const {
    followedDids,
    isLoading: followsLoading,
    error: followsError,
  } = useFollowedDids(activeDid)
  // Default state has every visible Hyperlabel tier checked AND
  // "Not labeled yet" checked — same default as the explore page so
  // a viewer who hasn't touched the filter sees the same set of certs
  // here and on /explore.
  const [includedTiers, setIncludedTiers] = useState<Set<QualityFilterValue>>(
    () => new Set<QualityFilterValue>([...DEFAULT_INCLUDED_TIERS, UNLABELED_SLUG]),
  )
  const [selectedEvaluators, setSelectedEvaluators] = useState<Set<string>>(
    () => new Set(TRUSTED_EVALUATOR_DIDS),
  )
  // Two filter modes, mirroring the explore page (see the
  // `certIncludeUnlabeled` comment block there for the full rationale):
  //   - Unlabeled INCLUDED → use `excludeCertLabels` (drop specific
  //     tiers; unlabeled records pass because they have nothing to
  //     match the exclude list against). Default mode.
  //   - Unlabeled EXCLUDED → use `includeCertLabels` (only records
  //     carrying one of the checked tiers pass; unlabeled records
  //     don't qualify).
  // Only one is non-undefined at a time. The hydration query treats
  // null on either side as "no filter on that axis".
  const includeUnlabeled = includedTiers.has(UNLABELED_SLUG)
  const excludeCertLabels = useMemo<readonly string[] | undefined>(
    () =>
      includeUnlabeled
        ? HYPERLABEL_TIERS.filter((t) => !includedTiers.has(t))
        : undefined,
    [includedTiers, includeUnlabeled],
  )
  const includeCertLabels = useMemo<readonly string[] | undefined>(
    () =>
      includeUnlabeled
        ? undefined
        : HYPERLABEL_TIERS.filter((t) => includedTiers.has(t)),
    [includedTiers, includeUnlabeled],
  )
  const { endorsedDids, isLoading: endorsementsLoading } =
    useEvaluatorEndorsements(selectedEvaluators)
  // Direct follows ∪ DIDs endorsed by any selected trusted evaluator.
  // The viewer's own DID is excluded so the feed doesn't show the
  // viewer's own activity (matches the prior behaviour — direct
  // follows never include self).
  const effectiveFollows = useMemo(() => {
    const out = new Set<string>(followedDids)
    for (const did of endorsedDids) {
      if (did !== activeDid) out.add(did)
    }
    return out
  }, [followedDids, endorsedDids, activeDid])
  // Gate the feed fetch on BOTH author sources being resolved so the
  // feed renders in a single frame instead of flashing direct-follows
  // first and then a second pass with the evaluator-endorsed union.
  // useEvaluatorEndorsements caches its result at module scope, so
  // after the first /home visit `ready` flips effectively-synchronously
  // on the next visit — only the cold first paint waits.
  const ready = !followsLoading && !endorsementsLoading
  const { events, isLoading, isLoadingMore, hasMore, loadMore, error } =
    useHomeFeed(effectiveFollows, {
      excludeCertLabels,
      includeCertLabels,
      ready,
    })

  return (
    <>
      <header className="home-feed__header">
        <h2 className="home-feed__heading">Feed</h2>
        <div className="home-feed__header-actions">
          <EvaluatorFilter
            selected={selectedEvaluators}
            onChange={setSelectedEvaluators}
          />
          <QualityFilter
            included={includedTiers}
            onChange={setIncludedTiers}
          />
        </div>
      </header>
      <HomeFeedBody
        followsLoading={followsLoading}
        followsError={!!followsError}
        followedCount={effectiveFollows.size}
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
  // Hooks at the top, before any early return — rules-of-hooks
  // requires identical hook ordering on every render. The branches
  // below all bail before render but the hooks above run regardless.
  const items = useMemo(
    () => groupConsecutiveEndorsements(events),
    [events],
  )

  // Auto-load-more when grouping collapses a page into too few
  // visible rows. The indexer pages by event count (PAGE_SIZE = 25
  // in useHomeFeed); a burst of 50+ endorsements by one user
  // becomes a single grouped row, leaving the screen feeling
  // empty. Trigger a follow-up loadMore when the visible-item
  // count is below MIN_VISIBLE_ITEMS, until that's no longer true
  // OR we've made MAX_AUTO_LOADS consecutive auto-fetches (cap
  // so a run of 1000+ same-actor endorsements doesn't fan out
  // dozens of requests).
  const autoLoadAttemptsRef = useRef(0)
  useEffect(() => {
    if (!hasMore || isLoading || isLoadingMore) return
    if (items.length >= MIN_VISIBLE_ITEMS) {
      autoLoadAttemptsRef.current = 0
      return
    }
    if (autoLoadAttemptsRef.current >= MAX_AUTO_LOADS) return
    autoLoadAttemptsRef.current++
    loadMore()
  }, [items.length, hasMore, isLoading, isLoadingMore, loadMore])

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
        {items.map((item) =>
          item.type === "single" ? (
            <li key={item.event.uri} className="home-feed__item">
              <HomeFeedRow event={item.event} />
            </li>
          ) : (
            <li key={item.key} className="home-feed__item">
              <EndorsementGroupRow group={item} />
            </li>
          ),
        )}
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
  included: Set<QualityFilterValue>
  onChange: (next: Set<QualityFilterValue>) => void
}) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useClickOutsideClose(open, wrapRef, () => setOpen(false))

  const toggle = (value: QualityFilterValue) => {
    const next = new Set(included)
    if (next.has(value)) next.delete(value)
    else next.add(value)
    onChange(next)
  }

  // "Filtered" badge highlights the button when the popover state
  // diverges from the default (every visible tier + unlabeled).
  // Total filter slots = number of Hyperlabel tiers + 1 for unlabeled.
  const filtered = included.size !== HYPERLABEL_TIERS.length + 1

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
            {HYPERLABEL_DISPLAY_ORDER.map((tier) => (
              <li key={tier}>
                <label className="home-feed__filter-item">
                  <input
                    type="checkbox"
                    checked={included.has(tier)}
                    onChange={() => toggle(tier)}
                  />
                  <span>{HYPERLABEL_DISPLAY_LABELS[tier]}</span>
                </label>
              </li>
            ))}
            <li>
              <label className="home-feed__filter-item">
                <input
                  type="checkbox"
                  checked={included.has(UNLABELED_SLUG)}
                  onChange={() => toggle(UNLABELED_SLUG)}
                />
                <span>Not labeled yet</span>
              </label>
            </li>
          </ul>
        </div>
      ) : null}
    </div>
  )
}

/**
 * Trusted-evaluator settings popover (left of the quality filter).
 * Each checkbox represents one curated evaluator account; selecting
 * an evaluator pulls every DID they've endorsed into the effective
 * follow set, so the feed shows transitively-vouched activity. The
 * popover lists evaluators by display name / handle resolved via
 * `useAuthorInfo` — the underlying DID is hidden behind the friendly
 * label.
 */
function EvaluatorFilter({
  selected,
  onChange,
}: {
  selected: Set<string>
  onChange: (next: Set<string>) => void
}) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useClickOutsideClose(open, wrapRef, () => setOpen(false))

  const toggle = (did: string) => {
    const next = new Set(selected)
    if (next.has(did)) next.delete(did)
    else next.add(did)
    onChange(next)
  }

  const partial = selected.size !== TRUSTED_EVALUATOR_DIDS.length

  return (
    <div className="home-feed__filter" ref={wrapRef}>
      <button
        type="button"
        className={`home-feed__filter-btn${partial ? " home-feed__filter-btn--active" : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label="Trusted-evaluator settings"
      >
        <UserCheck size={14} strokeWidth={1.75} aria-hidden />
      </button>
      {open ? (
        <div className="home-feed__filter-pop home-feed__filter-pop--evaluators" role="dialog" aria-label="Trusted evaluators">
          <p className="home-feed__filter-help">
            Show activities from accounts that are endorsed by:
          </p>
          <ul className="home-feed__filter-list">
            {TRUSTED_EVALUATOR_DIDS.map((did) => (
              <li key={did}>
                <EvaluatorOption
                  did={did}
                  checked={selected.has(did)}
                  onToggle={() => toggle(did)}
                />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}

function EvaluatorOption({
  did,
  checked,
  onToggle,
}: {
  did: string
  checked: boolean
  onToggle: () => void
}) {
  const { info } = useAuthorInfo(did)
  const label = info?.displayName || (info?.handle ? `@${info.handle}` : did.slice(0, 14) + "…")
  const initials = getInitials(info?.displayName, did)
  const profileHref = `/profile/${encodeURIComponent(info?.handle || did)}`
  return (
    <div className="home-feed__evaluator-row">
      <input
        id={`eval-${did}`}
        type="checkbox"
        className="home-feed__evaluator-check"
        checked={checked}
        onChange={onToggle}
        aria-label={`Include endorsements by ${label}`}
      />
      <Link href={profileHref} className="home-feed__evaluator-link">
        <Avatar
          size="sm"
          src={info?.avatarUrl ?? undefined}
          alt=""
          fallbackInitials={initials}
        />
        <span className="home-feed__evaluator-name">{label}</span>
      </Link>
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

/**
 * Grouped row: "<actor> endorsed <first> and N others" with a "Show
 * all" toggle that expands an inline list of every endorsed account.
 *
 * Time + avatar follow the same layout as the single-event HomeFeedRow
 * so the visual rhythm of the feed stays consistent across mixed
 * single + grouped rows. The first-subject sentence is the row's
 * primary identity, since subjectDids[0] is the most recent
 * endorsement in the burst.
 */
function EndorsementGroupRow({ group }: { group: EndorsementGroupItem }) {
  const { info: lookup } = useAuthorInfo(group.actor)
  const indexer = group.actorProfile
  const actorName =
    lookup?.displayName ||
    indexer.displayName ||
    lookup?.handle ||
    indexer.handle ||
    group.actor.slice(0, 16)
  const actorAvatar =
    lookup?.avatarUrl ||
    buildAvatarUrlFromCid(indexer.did, indexer.avatarCid)
  const actorInitials = getInitials(
    lookup?.displayName ?? indexer.displayName,
    group.actor,
  )
  const profileHref = `/profile/${encodeURIComponent(
    lookup?.handle || indexer.handle || group.actor,
  )}`

  const othersCount = group.subjectDids.length - 1
  const [expanded, setExpanded] = useState(false)

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
          endorsed{" "}
          <EndorsementGroupSummary
            firstDid={group.subjectDids[0]}
            othersCount={othersCount}
          />
        </p>
        <button
          type="button"
          className="home-feed__group-toggle"
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? "Show fewer" : "Show all"}
        </button>
        {expanded ? (
          <ul className="home-feed__group-list">
            {group.subjectDids.map((did) => (
              <li key={did} className="home-feed__group-list-item">
                <EndorsedAccountLink did={did} />
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <time
        className="home-feed__time"
        dateTime={group.createdAt}
        title={group.createdAt}
      >
        {formatRelativeTime(group.createdAt)}
      </time>
    </article>
  )
}

function EndorsementGroupSummary({
  firstDid,
  othersCount,
}: {
  firstDid: string
  othersCount: number
}) {
  const { info } = useAuthorInfo(firstDid)
  const name = info?.displayName || (info?.handle ? `@${info.handle}` : null)
  const href = `/profile/${encodeURIComponent(info?.handle || firstDid)}`
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
  const name = info?.displayName || (info?.handle ? `@${info.handle}` : null)
  const href = `/profile/${encodeURIComponent(info?.handle || did)}`
  return (
    <Link href={href} className="home-feed__target">
      {name ?? did.slice(0, 16)}
    </Link>
  )
}

function EventSentence({ event }: { event: HomeFeedEvent }) {
  switch (event.kind) {
    case "cert.create":
      return <>created a cert</>
    case "collection.create":
      return <>created a {collectionTypeLabel(event.record)}</>
    case "project.created_with_cert":
      return <>created a project with a cert</>
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
    const href = `/project/${encodeURIComponent(parsed.did)}/${encodeURIComponent(parsed.rkey)}`
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
      return <>created a cert</>
    case "collection.create":
      return <>created a project</>
    case "project.created_with_cert":
      return <>created a project with a cert</>
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
  if (t === "list:endorsements") return "list"
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
    collectionType === "list:endorsements"
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
  const itemNoun = collectionType === "list:endorsements" ? "endorsement" : "cert"

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
      ? `/activity/${encodeURIComponent(parsed.did)}/${encodeURIComponent(parsed.rkey)}`
      : parsed.collection === "org.hypercerts.collection"
        ? `/project/${encodeURIComponent(parsed.did)}/${encodeURIComponent(parsed.rkey)}`
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
