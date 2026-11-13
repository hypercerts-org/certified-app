"use client"

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useId,
  useRef,
  useState,
} from "react"
import { AlertCircle, ChevronDown, Filter, Inbox, Info, Users } from "lucide-react"
import Button from "@/components/ui/button"
import Card from "@/components/ui/card"
import Checkbox from "@/components/ui/checkbox"
import { AppDialogHeader } from "@/components/ui/app-dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import EmptyState from "@/components/ui/empty-state"
import LoadMoreSentinel from "@/components/ui/load-more-sentinel"
import PageHeader from "@/components/ui/page-header"
import ResponsiveDialog from "@/components/ui/responsive-dialog"
import { useAuthorInfo } from "@/hooks/use-author-info"
import { useEvaluatorEndorsements } from "@/hooks/use-evaluator-endorsements"
import { useHomeFeed, type HomeFeedEvent } from "@/hooks/use-home-feed"
import { useLayoutBreakpoints } from "@/hooks/use-layout-breakpoints"
import { groupConsecutiveEndorsements } from "@/lib/utils/group-feed"
import { useFollowing } from "@/hooks/use-following"
import { hideBrokenThumb } from "@/lib/utils/image-fallback"
import {
  DEFAULT_HIDDEN_CERT_LABELS,
  DEFAULT_HIDDEN_ORG_LABELS,
  HYPERLABEL_DISPLAY_LABELS,
  HYPERLABEL_DISPLAY_ORDER,
  HYPERLABEL_TIERS,
  ORGLABEL_TIERS,
  type HyperlabelTier,
  type OrglabelTier,
} from "@/lib/atproto/labels"
import { fetchOrgDidsByLabel } from "@/lib/atproto/workspace"
import { useTrustedEvaluators } from "@/hooks/use-trusted-evaluators"
import EvaluatorPreview from "./evaluator-preview"
import HomeFeedSkeleton from "./home-feed-skeleton"
import { EndorsementGroupRow, HomeFeedRow } from "./home-feed-rows"

const DEFAULT_INCLUDED_TIERS: ReadonlySet<HyperlabelTier> = new Set(
  HYPERLABEL_TIERS.filter(
    (t) => !DEFAULT_HIDDEN_CERT_LABELS.includes(t),
  ),
)

/** Sentinel for the "Not labeled yet" checkbox — separate from the
 *  Hyperlabel tier enum so the filter state can carry it without
 *  widening the tier type. Mirrors the explore-page convention. */
const UNLABELED_SLUG = "unlabeled" as const
type UnlabeledSlug = typeof UNLABELED_SLUG
type QualityFilterValue = HyperlabelTier | UnlabeledSlug
type OrgQualityValue = OrglabelTier | UnlabeledSlug

/** Default org-quality set — everything except the labels in
 *  DEFAULT_HIDDEN_ORG_LABELS (today only "likely-test"). Matches the
 *  explore page's Account-quality default. */
const DEFAULT_INCLUDED_ORG_TIERS: ReadonlySet<OrglabelTier> = new Set(
  ORGLABEL_TIERS.filter((t) => !DEFAULT_HIDDEN_ORG_LABELS.includes(t)),
)

/** The full default selections, "Not labeled yet" included. */
const DEFAULT_TIER_SELECTION: ReadonlySet<QualityFilterValue> = new Set<QualityFilterValue>([
  ...DEFAULT_INCLUDED_TIERS,
  UNLABELED_SLUG,
])
const DEFAULT_ORG_TIER_SELECTION: ReadonlySet<OrgQualityValue> = new Set<OrgQualityValue>([
  ...DEFAULT_INCLUDED_ORG_TIERS,
  UNLABELED_SLUG,
])

/** Highest tier first — same order the explore Account-quality
 *  popover lists them in. */
const ORGLABEL_DISPLAY_ORDER: readonly OrglabelTier[] = [
  "high-quality",
  "standard",
  "likely-test",
]
const ORGLABEL_DISPLAY_LABELS: Record<OrglabelTier, string> = {
  "high-quality": "High quality",
  standard: "Standard",
  "likely-test": "Likely test",
}

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

const FEED_DESCRIPTION =
  "New activities, projects and endorsements from accounts you follow, and from accounts your trusted endorsers have endorsed."

/** Number of entries in `a` or `b` but not both. */
function differenceCount<T>(a: ReadonlySet<T>, b: ReadonlySet<T>): number {
  let n = 0
  for (const v of a) if (!b.has(v)) n++
  for (const v of b) if (!a.has(v)) n++
  return n
}

/**
 * The /feed page header: title, one line on where the items come from,
 * and (below 1100px, where the filters have no column of their own) a
 * Filters button that opens them in a sheet or dialog. `changedCount`
 * shows on the button ("Filters · 2") once the filters differ from the
 * defaults. Without `onOpenFilters` (while the page is still loading) the
 * button renders disabled so the header keeps its size.
 */
export function FeedPageHeader({
  changedCount = 0,
  onOpenFilters,
  filtersOpen = false,
}: {
  changedCount?: number
  onOpenFilters?: () => void
  filtersOpen?: boolean
}) {
  return (
    <PageHeader
      title="Feed"
      description={FEED_DESCRIPTION}
      actions={
        <Button
          variant="secondary"
          size="md"
          className="lg:hidden"
          onClick={onOpenFilters}
          disabled={!onOpenFilters}
          aria-haspopup="dialog"
          aria-expanded={filtersOpen}
          aria-label={
            changedCount > 0
              ? `Filters, ${changedCount} changed`
              : "Filters"
          }
        >
          <Filter size={16} strokeWidth={1.75} aria-hidden />
          <span className="tabular-nums">
            {changedCount > 0 ? `Filters · ${changedCount}` : "Filters"}
          </span>
        </Button>
      }
    />
  )
}

/**
 * The /feed page body, modeled on the certs.social feed design. Each
 * entry is an author byline (avatar, name, @handle and relative time)
 * with the event verb as a muted second line; activity, project and
 * update creates also render the record underneath: image, serif title,
 * short description and a dot-separated meta row. Endorsement events
 * keep to the byline, since the sentence already names both ends.
 *
 * The author set is direct follows ∪ the accounts the selected trusted
 * endorsers have endorsed, narrowed by the account-quality filter; the
 * activity-quality filter narrows the records.
 *
 * Layout: the page header first. At 1100px and wider, three columns: the
 * filters in a sticky box on the left, the list in the middle and `news`
 * on the right. Below 1100px one column, with the filters behind the
 * header's Filters button (a bottom sheet on phones, a dialog from
 * 800px). The list ends in an IntersectionObserver sentinel that calls
 * `useHomeFeed`'s `loadMore` when it enters the viewport.
 */
export default function HomeFeed({
  activeDid,
  news,
}: {
  activeDid: string
  /** Right-column content at 1100px and wider (hidden below). */
  news?: React.ReactNode
}) {
  // The feed reads ONLY the Certified follow graph
  // (`app.certified.graph.follow`). Viewers who want their Bluesky
  // follows reflected here run the social-graph sync in Settings,
  // which mirrors their Bluesky graph into the Certified collection
  // once — after that, the Certified graph is the canonical source
  // and the feed reads from a single place instead of merging
  // both live every page load.
  const {
    subjects: followedDids,
    isLoading: followsLoading,
    error: followsError,
    refetch: refetchFollows,
  } = useFollowing(activeDid)
  // Default state has every visible Hyperlabel tier checked AND
  // "Not labeled yet" checked — same default as the explore page so
  // a viewer who hasn't touched the filter sees the same set of
  // activities here and on /explore.
  const [includedTiers, setIncludedTiers] = useState<Set<QualityFilterValue>>(
    () => new Set<QualityFilterValue>(DEFAULT_TIER_SELECTION),
  )
  // Trusted evaluators are sourced live from the curated list; the
  // hardcoded set is the fallback used until it resolves.
  const { evaluatorDids } = useTrustedEvaluators()
  // Evaluator selection: `null` = default (every current list member
  // checked), a Set once the viewer customizes. Derived rather than
  // stored so it tracks the live list as it resolves and is edited —
  // no state-sync effect needed.
  const [customEvaluators, setCustomEvaluators] = useState<Set<string> | null>(
    null,
  )
  const selectedEvaluators = useMemo(
    () => customEvaluators ?? new Set(evaluatorDids),
    [customEvaluators, evaluatorDids],
  )
  const handleEvaluatorsChange = useCallback(
    (next: Set<string>) => setCustomEvaluators(next),
    [],
  )
  // Account-quality filter (Orglabeler tiers) — applied to the event
  // ACTOR rather than the record, by adjusting the author DID set handed
  // to useHomeFeed (see effectiveFollows below).
  const [includedOrgTiers, setIncludedOrgTiers] = useState<Set<OrgQualityValue>>(
    () => new Set<OrgQualityValue>(DEFAULT_ORG_TIER_SELECTION),
  )

  // Below 1100px the filters open in a sheet (phones) or dialog. Close it
  // if the window widens past 1100px, where the filters column shows.
  const [filtersOpen, setFiltersOpen] = useState(false)
  const { hasRightRail } = useLayoutBreakpoints()
  if (filtersOpen && hasRightRail) setFiltersOpen(false)
  const closeFilters = useCallback(() => setFiltersOpen(false), [])
  const sidebarPanelId = useId()
  const dialogPanelId = useId()

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
  const orgFilter = useOrgQualityFilter(includedOrgTiers)
  // Direct follows ∪ DIDs endorsed by any selected trusted evaluator,
  // then narrowed by the account-quality filter. The viewer's own
  // DID is excluded so the feed doesn't show the viewer's own activity
  // (matches the prior behaviour — direct follows never include self).
  const effectiveFollows = useMemo(() => {
    const out = new Set<string>(followedDids)
    for (const did of endorsedDids) {
      if (did !== activeDid) out.add(did)
    }
    if (orgFilter.dids) {
      if (orgFilter.mode === "exclude") {
        // Unlabeled INCLUDED: drop actors carrying an excluded tier.
        for (const did of orgFilter.dids) out.delete(did)
      } else if (orgFilter.mode === "include-only") {
        // Unlabeled EXCLUDED: keep only actors carrying a checked tier.
        for (const did of [...out]) {
          if (!orgFilter.dids.has(did)) out.delete(did)
        }
      }
    }
    return out
  }, [followedDids, endorsedDids, activeDid, orgFilter.mode, orgFilter.dids])
  // Gate the feed fetch on every author source being resolved (follows,
  // evaluator endorsements, org-label DID set) so the feed renders in a
  // single frame instead of flashing direct-follows first and then a
  // second pass with the narrowed union. All three fetches cache at
  // module scope, so after the first visit `ready` flips
  // effectively-synchronously — only the cold first paint waits.
  const ready = !followsLoading && !endorsementsLoading && !orgFilter.isLoading
  // Bumped by the list's "Try again": remounts FeedList, which loads the
  // feed again from the head.
  const [feedAttempt, setFeedAttempt] = useState(0)
  const retryFeed = useCallback(() => setFeedAttempt((n) => n + 1), [])

  // How many checkboxes differ from their default, across the three
  // groups. Shown on the Filters button; zero means "defaults".
  const changedCount =
    differenceCount(includedTiers, DEFAULT_TIER_SELECTION) +
    differenceCount(includedOrgTiers, DEFAULT_ORG_TIER_SELECTION) +
    (customEvaluators === null
      ? 0
      : evaluatorDids.filter((did) => !customEvaluators.has(did)).length)
  const isDefaultFilters = changedCount === 0

  const resetFilters = useCallback(() => {
    setIncludedTiers(new Set<QualityFilterValue>(DEFAULT_TIER_SELECTION))
    setIncludedOrgTiers(new Set<OrgQualityValue>(DEFAULT_ORG_TIER_SELECTION))
    setCustomEvaluators(null)
  }, [])

  const filterPanelProps = {
    evaluatorDids,
    selectedEvaluators,
    onEvaluatorsChange: handleEvaluatorsChange,
    includedTiers,
    onTiersChange: setIncludedTiers,
    includedOrgTiers,
    onOrgTiersChange: setIncludedOrgTiers,
    isDefault: isDefaultFilters,
    onReset: resetFilters,
  }

  // DOM order is main, filters, news (main content first for keyboard
  // and screen-reader users); the grid areas put the filters on the left.
  return (
    <>
      <FeedPageHeader
        changedCount={changedCount}
        onOpenFilters={() => setFiltersOpen(true)}
        filtersOpen={filtersOpen}
      />

      <div className="feed-layout">
        <div className="feed-layout__main" data-tour="feed">
          <FeedList
            key={feedAttempt}
            authors={effectiveFollows}
            excludeCertLabels={excludeCertLabels}
            includeCertLabels={includeCertLabels}
            ready={ready}
            followsLoading={followsLoading}
            followsError={!!followsError}
            onRetryFollows={refetchFollows}
            filtersChanged={!isDefaultFilters}
            onResetFilters={resetFilters}
            onRetry={retryFeed}
          />
        </div>

        {/* 1100px and wider: the same filters, always open. */}
        <div className="feed-layout__filters">
          <Card unpadded className="feed-layout__box">
            {/* No box title: "Trusted endorsers" leads, styled like the
                "News from Certified" heading in the box opposite. */}
            <FeedFilterPanel
              id={sidebarPanelId}
              previewMode="popover"
              showReset
              {...filterPanelProps}
            />
          </Card>
        </div>

        {news ? <div className="feed-layout__news">{news}</div> : null}
      </div>

      {/* Below 1100px: the filters in a bottom sheet (phones) or a
          dialog (800px and up). Changes apply as they are made; Done
          closes. */}
      <ResponsiveDialog
        open={filtersOpen}
        onClose={closeFilters}
        ariaLabel="Filters"
        header={<AppDialogHeader title="Filters" onClose={closeFilters} />}
        className="feed-filter-dialog"
      >
        <div className="feed-filter-dialog__body">
          <FeedFilterPanel
            id={dialogPanelId}
            previewMode="inline"
            showReset={false}
            {...filterPanelProps}
          />
        </div>
        <div className="feed-filter-dialog__footer">
          <Button
            variant="secondary"
            onClick={resetFilters}
            disabled={isDefaultFilters}
          >
            Reset
          </Button>
          <Button variant="primary" onClick={closeFilters}>
            Done
          </Button>
        </div>
      </ResponsiveDialog>
    </>
  )
}

/**
 * Loads the feed for `authors` and renders it. Its own component so the
 * parent can key it: "Try again" after a failed load remounts it, which
 * starts a fresh load from the head.
 */
function FeedList({
  authors,
  excludeCertLabels,
  includeCertLabels,
  ready,
  followsLoading,
  followsError,
  onRetryFollows,
  filtersChanged,
  onResetFilters,
  onRetry,
}: {
  authors: Set<string>
  excludeCertLabels: readonly string[] | undefined
  includeCertLabels: readonly string[] | undefined
  ready: boolean
  followsLoading: boolean
  followsError: boolean
  onRetryFollows: () => void
  filtersChanged: boolean
  onResetFilters: () => void
  onRetry: () => void
}) {
  const { events, isLoading, isLoadingMore, hasMore, loadMore, error } =
    useHomeFeed(authors, { excludeCertLabels, includeCertLabels, ready })
  return (
    <HomeFeedBody
      followsLoading={followsLoading}
      followsError={followsError}
      onRetryFollows={onRetryFollows}
      followedCount={authors.size}
      isLoading={isLoading}
      error={error}
      onRetry={onRetry}
      events={events}
      hasMore={hasMore}
      isLoadingMore={isLoadingMore}
      loadMore={loadMore}
      filtersChanged={filtersChanged}
      onResetFilters={onResetFilters}
    />
  )
}

// Memoized: filter state (dialog open/close, evaluator + tier checkbox
// ticks) lives in HomeFeed, so without memo every filter interaction
// re-executes the full row map. Props are primitives plus a stable
// events ref and useCallback-stable loadMore / onResetFilters, so the
// default shallow compare bails correctly.
const HomeFeedBody = memo(function HomeFeedBody({
  followsLoading,
  followsError,
  onRetryFollows,
  followedCount,
  isLoading,
  error,
  onRetry,
  events,
  hasMore,
  isLoadingMore,
  loadMore,
  filtersChanged,
  onResetFilters,
}: {
  followsLoading: boolean
  followsError: boolean
  onRetryFollows: () => void
  followedCount: number
  isLoading: boolean
  error: string | null
  /** Load the feed again after `error`. */
  onRetry: () => void
  events: HomeFeedEvent[]
  hasMore: boolean
  isLoadingMore: boolean
  loadMore: () => void
  /** Any filter differs from its default: empty states name the filters
   *  and offer to reset them. */
  filtersChanged: boolean
  onResetFilters: () => void
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
    return <HomeFeedSkeleton />
  }
  // Load failures: the page's one error pattern (an empty-state block
  // with Try again), as on /explore.
  if (followsError) {
    return (
      <EmptyState
        icon={AlertCircle}
        title="Couldn't load the accounts you follow"
        description="Something went wrong on our side. Try again in a moment."
      >
        <Button variant="secondary" size="sm" onClick={onRetryFollows}>
          Try again
        </Button>
      </EmptyState>
    )
  }
  if (followedCount === 0) {
    return filtersChanged ? (
      <EmptyState
        icon={Users}
        title="No accounts match your filters"
        description="Your filters leave out every account. Reset them to see the accounts you follow and the accounts your trusted endorsers have endorsed."
      >
        <Button variant="secondary" size="sm" onClick={onResetFilters}>
          Reset filters
        </Button>
      </EmptyState>
    ) : (
      <EmptyState
        icon={Users}
        title="You're not following anyone yet"
        description="Follow accounts to see their new activities, projects and endorsements here."
      >
        <Button href="/explore?show=accounts" variant="secondary" size="sm">
          Find accounts
        </Button>
      </EmptyState>
    )
  }
  if (error) {
    return (
      <EmptyState
        icon={AlertCircle}
        title="Couldn't load the feed"
        description="Something went wrong on our side. Try again in a moment."
      >
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Try again
        </Button>
      </EmptyState>
    )
  }
  if (events.length === 0) {
    return filtersChanged ? (
      <EmptyState
        icon={Inbox}
        title="Nothing matches your filters"
        description="No new activities, projects or endorsements pass the filters you set."
      >
        <Button variant="secondary" size="sm" onClick={onResetFilters}>
          Reset filters
        </Button>
      </EmptyState>
    ) : (
      <EmptyState
        icon={Inbox}
        title="Nothing new yet"
        description="The accounts you follow haven't published anything yet."
      >
        <Button href="/explore" variant="secondary" size="sm">
          Explore the network
        </Button>
      </EmptyState>
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
        />
      ) : null}
    </>
  )
})

/**
 * Resolve the account-quality checkboxes into a DID set + how to
 * apply it to the feed's author set. Two modes, mirroring the cert
 * quality filter's polarity logic:
 *   - Unlabeled INCLUDED → "exclude": fetch the DIDs carrying any
 *     UNchecked tier and subtract them (unlabeled actors pass).
 *   - Unlabeled EXCLUDED → "include-only": fetch the DIDs carrying a
 *     checked tier and intersect (unlabeled actors drop).
 * `fetchOrgDidsByLabel` caches per label tuple at module scope, so the
 * default exclusion costs one request per session. On fetch failure the
 * filter degrades to unfiltered (`dids: null`) rather than blanking the
 * feed.
 */
function useOrgQualityFilter(included: Set<OrgQualityValue>): {
  mode: "none" | "exclude" | "include-only"
  dids: Set<string> | null
  isLoading: boolean
} {
  const includeUnlabeled = included.has(UNLABELED_SLUG)
  const labels = useMemo(
    () =>
      includeUnlabeled
        ? ORGLABEL_TIERS.filter((t) => !included.has(t))
        : ORGLABEL_TIERS.filter((t) => included.has(t)),
    [included, includeUnlabeled],
  )
  const mode = includeUnlabeled
    ? labels.length === 0
      ? ("none" as const)
      : ("exclude" as const)
    : ("include-only" as const)
  const key = mode === "none" ? "none" : `${mode}:${labels.join(",")}`
  const [state, setState] = useState<{ key: string; dids: Set<string> | null }>(
    { key: "none", dids: null },
  )
  useEffect(() => {
    if (mode === "none") return
    let cancelled = false
    fetchOrgDidsByLabel({ labels })
      .then((dids) => {
        if (!cancelled) setState({ key, dids })
      })
      .catch(() => {
        if (!cancelled) setState({ key, dids: null })
      })
    return () => {
      cancelled = true
    }
  }, [key, mode, labels])
  if (mode === "none") return { mode, dids: null, isLoading: false }
  const fresh = state.key === key
  return { mode, dids: fresh ? state.dids : null, isLoading: !fresh }
}

/**
 * The feed filters: trusted endorsers, activity quality (Hyperlabel
 * tiers) and account quality (Orglabeler tiers), each a fieldset,
 * plus an optional reset row. Rendered twice: in the filters column at
 * 1100px and wider (`previewMode="popover"`, previews in a portalled
 * popover because the column scrolls) and in the sheet / dialog below
 * that (`previewMode="inline"`, previews open under the row, since a
 * portalled popover would sit beneath the dialog layer).
 */
function FeedFilterPanel({
  id,
  previewMode,
  showReset,
  evaluatorDids,
  selectedEvaluators,
  onEvaluatorsChange,
  includedTiers,
  onTiersChange,
  includedOrgTiers,
  onOrgTiersChange,
  isDefault,
  onReset,
}: {
  id: string
  previewMode: "popover" | "inline"
  /** Show the "Reset to default" row (the dialog has its own Reset). */
  showReset: boolean
  evaluatorDids: string[]
  selectedEvaluators: Set<string>
  onEvaluatorsChange: (next: Set<string>) => void
  includedTiers: Set<QualityFilterValue>
  onTiersChange: (next: Set<QualityFilterValue>) => void
  includedOrgTiers: Set<OrgQualityValue>
  onOrgTiersChange: (next: Set<OrgQualityValue>) => void
  isDefault: boolean
  onReset: () => void
}) {
  function toggled<T>(set: Set<T>, value: T): Set<T> {
    const next = new Set(set)
    if (next.has(value)) next.delete(value)
    else next.add(value)
    return next
  }

  return (
    <div
      id={id}
      className={`feed-evaluator-panel feed-evaluator-panel--${previewMode}`}
      role="region"
      aria-label="Feed filters"
    >
      {/* Each checkbox group is a <fieldset> so its heading (the
          <legend>) is announced when focus moves into the group. */}
      <fieldset className="feed-evaluators__group">
        <legend className="feed-evaluator-panel__heading">
          <TrustedEndorsersInfo inPortal={previewMode === "popover"} />
        </legend>
        <div className="feed-evaluators__list">
          {evaluatorDids.map((did) => (
            <EvaluatorRow
              key={did}
              did={did}
              previewMode={previewMode}
              checked={selectedEvaluators.has(did)}
              onToggle={() =>
                onEvaluatorsChange(toggled(selectedEvaluators, did))
              }
            />
          ))}
        </div>
      </fieldset>
      <div className="feed-evaluators__separator" aria-hidden="true" />
      <fieldset className="feed-evaluators__group">
        <legend className="feed-evaluator-panel__heading">Activity quality</legend>
        <div className="feed-evaluators__list">
          {HYPERLABEL_DISPLAY_ORDER.map((tier) => (
            <FilterCheckRow
              key={tier}
              label={HYPERLABEL_DISPLAY_LABELS[tier]}
              checked={includedTiers.has(tier)}
              onToggle={() => onTiersChange(toggled(includedTiers, tier))}
            />
          ))}
          <FilterCheckRow
            label="Not labeled yet"
            checked={includedTiers.has(UNLABELED_SLUG)}
            onToggle={() => onTiersChange(toggled(includedTiers, UNLABELED_SLUG))}
          />
        </div>
      </fieldset>
      <div className="feed-evaluators__separator" aria-hidden="true" />
      <fieldset className="feed-evaluators__group">
        <legend className="feed-evaluator-panel__heading">Account quality</legend>
        <div className="feed-evaluators__list">
          {ORGLABEL_DISPLAY_ORDER.map((tier) => (
            <FilterCheckRow
              key={tier}
              label={ORGLABEL_DISPLAY_LABELS[tier]}
              checked={includedOrgTiers.has(tier)}
              onToggle={() => onOrgTiersChange(toggled(includedOrgTiers, tier))}
            />
          ))}
          <FilterCheckRow
            label="Not labeled yet"
            checked={includedOrgTiers.has(UNLABELED_SLUG)}
            onToggle={() =>
              onOrgTiersChange(toggled(includedOrgTiers, UNLABELED_SLUG))
            }
          />
        </div>
      </fieldset>
      {showReset ? (
        <>
          <div className="feed-evaluators__separator" aria-hidden="true" />
          <button
            type="button"
            className="feed-evaluator-panel__reset"
            onClick={onReset}
            disabled={isDefault}
          >
            Reset to default
          </button>
        </>
      ) : null}
    </div>
  )
}

/**
 * The "Trusted endorsers" group label, as a button that explains what the
 * group does: the feed always has the accounts you follow, and each checked
 * endorser adds the accounts it has endorsed.
 */
function TrustedEndorsersInfo({ inPortal }: { inPortal: boolean }) {
  return (
    <Popover>
      <PopoverTrigger>
        <button type="button" className="feed-evaluator-panel__info">
          Trusted endorsers
          <Info size={14} strokeWidth={1.75} aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent
        portal={inPortal}
        role="group"
        align="start"
        minWidth={260}
        aria-label="About trusted endorsers"
      >
        <p className="feed-evaluator-panel__info-text">
          Your feed always shows what the accounts you follow publish. It also
          shows activities from accounts these trusted organizations have
          endorsed, so you see vetted work beyond the people you follow.
          Uncheck an organization to leave out the accounts it endorsed.
        </p>
      </PopoverContent>
    </Popover>
  )
}

function FilterCheckRow({
  label,
  checked,
  onToggle,
}: {
  label: string
  checked: boolean
  onToggle: () => void
}) {
  return (
    <div className="feed-evaluators__row">
      <Checkbox
        checked={checked}
        onChange={onToggle}
        label={<span className="feed-evaluators__name">{label}</span>}
      />
    </div>
  )
}

/**
 * One trusted-evaluator row: a checkbox, then the evaluator's avatar and
 * display name. The checkbox includes or leaves out the accounts they
 * endorse (selecting an evaluator pulls every DID they've endorsed into the
 * effective follow set, so the feed shows transitively-vouched activity).
 * The avatar and name open a short profile preview with a link to the full
 * profile: a popover in the filters column, or a panel that opens under the
 * row in the sheet / dialog.
 */
function EvaluatorRow({
  did,
  checked,
  onToggle,
  previewMode,
}: {
  did: string
  checked: boolean
  onToggle: () => void
  previewMode: "popover" | "inline"
}) {
  const { info } = useAuthorInfo(did)
  const [expanded, setExpanded] = useState(false)
  const previewId = useId()
  const label =
    info?.displayName ||
    (info?.handle ? `@${info.handle}` : did.slice(0, 14) + "…")

  const person = (
    <>
      {info?.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={info.avatarUrl}
          alt=""
          className="feed-evaluators__avatar"
          width={24}
          height={24}
          onError={hideBrokenThumb}
        />
      ) : (
        <span className="feed-evaluators__avatar feed-evaluators__avatar--placeholder" />
      )}
      <span className="feed-evaluators__name" dir="auto">{label}</span>
    </>
  )

  const checkbox = (
    <Checkbox
      checked={checked}
      onChange={onToggle}
      aria-label={`Include endorsements by ${label}`}
    />
  )

  if (previewMode === "inline") {
    return (
      <div className="feed-evaluators__item">
        <div className="feed-evaluators__row feed-evaluators__row--evaluator">
          {checkbox}
          <button
            type="button"
            className="feed-evaluators__person"
            aria-expanded={expanded}
            aria-controls={previewId}
            aria-label={`Profile preview: ${label}`}
            onClick={() => setExpanded((v) => !v)}
          >
            {person}
            <ChevronDown
              size={14}
              strokeWidth={1.75}
              aria-hidden
              className="feed-evaluators__chevron"
            />
          </button>
        </div>
        {expanded ? (
          <div id={previewId} className="feed-evaluators__preview">
            <EvaluatorPreview did={did} />
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <div className="feed-evaluators__row feed-evaluators__row--evaluator">
      {checkbox}
      <Popover>
        <PopoverTrigger>
          <button
            type="button"
            className="feed-evaluators__person"
            aria-label={`Show profile preview: ${label}`}
          >
            {person}
          </button>
        </PopoverTrigger>
        <PopoverContent
          portal
          role="group"
          align="start"
          minWidth={288}
          aria-label={`Profile preview: ${label}`}
        >
          <EvaluatorPreview did={did} />
        </PopoverContent>
      </Popover>
    </div>
  )
}
