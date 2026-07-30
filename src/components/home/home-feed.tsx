"use client"

import { memo, useEffect, useMemo, useRef, useState } from "react"
import { ChevronDown, Inbox, Users } from "lucide-react"
import Banner from "@/components/ui/banner"
import Button from "@/components/ui/button"
import EmptyState from "@/components/ui/empty-state"
import LoadingSpinner from "@/components/ui/loading-spinner"
import LoadMoreSentinel from "@/components/ui/load-more-sentinel"
import { useAuthorInfo } from "@/hooks/use-author-info"
import { useClickOutsideClose } from "@/hooks/use-click-outside-close"
import { useEvaluatorEndorsements } from "@/hooks/use-evaluator-endorsements"
import {
  useHomeFeed,
  useLegacyHomeFeed,
  type HomeFeedResult,
} from "@/hooks/use-home-feed"
import { groupConsecutiveEndorsements } from "@/lib/utils/group-feed"
import { useFollowing } from "@/hooks/use-following"
import { hideBrokenThumb } from "@/lib/utils/image-fallback"
import {
  DEFAULT_HIDDEN_ORG_LABELS,
  ORGLABEL_TIERS,
  type OrglabelTier,
} from "@/lib/atproto/labels"
import { fetchOrgDidsByLabel } from "@/lib/atproto/workspace"
import { useTrustedEvaluators } from "@/hooks/use-trusted-evaluators"
import { parseHomeFeedSource } from "@/lib/atproto/certified-feed"
import { EndorsementGroupRow, HomeFeedRow } from "./home-feed-rows"

const HOME_FEED_SOURCE = parseHomeFeedSource()
const UNLABELED_SLUG = "unlabeled" as const
type UnlabeledSlug = typeof UNLABELED_SLUG
type OrgQualityValue = OrglabelTier | UnlabeledSlug

/** Default org-quality set — everything except the labels in
 *  DEFAULT_HIDDEN_ORG_LABELS (today only "likely-test"). Matches the
 *  explore page's Account-quality default. */
const DEFAULT_INCLUDED_ORG_TIERS: ReadonlySet<OrglabelTier> = new Set(
  ORGLABEL_TIERS.filter((t) => !DEFAULT_HIDDEN_ORG_LABELS.includes(t)),
)

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

/**
 * Social-card activity feed for the home page, modeled on the
 * certs.social feed design. Each entry is an author byline (avatar +
 * display name + @handle + relative time) with the event verb as a
 * muted second line; cert / project / update creates also render a
 * full-card body underneath — full-width image, serif headline title,
 * short description and a dot-separated meta row (period + location
 * count for certs, item count for projects). Endorsement events keep
 * to the byline-only treatment since the sentence already names both
 * ends of the action.
 *
 * A `<header>` above the list carries the "Feed" heading on the
 * left and a per-tier filter popover (Hyperlabel quality tiers) on
 * the right. Bottom of the list hosts an IntersectionObserver
 * sentinel that calls `useHomeFeed`'s `loadMore` when it enters
 * the viewport.
 */
export default function HomeFeed({ activeDid }: { activeDid: string }) {
  const { evaluatorDids, isLoading: evaluatorsLoading } = useTrustedEvaluators()
  const [customEvaluators, setCustomEvaluators] = useState<Set<string> | null>(null)
  const selectedEvaluators = useMemo(
    () => customEvaluators ?? new Set(evaluatorDids),
    [customEvaluators, evaluatorDids],
  )
  const [includedOrgTiers, setIncludedOrgTiers] = useState<Set<OrgQualityValue>>(
    () => new Set<OrgQualityValue>([...DEFAULT_INCLUDED_ORG_TIERS, UNLABELED_SLUG]),
  )
  const [filterOpen, setFilterOpen] = useState(false)
  const filterWrapRef = useRef<HTMLDivElement>(null)
  useClickOutsideClose(filterOpen, filterWrapRef, () => setFilterOpen(false))

  const isDefaultFilters =
    isOrgQualityDefault(includedOrgTiers) &&
    selectedEvaluators.size === evaluatorDids.length &&
    evaluatorDids.every((did) => selectedEvaluators.has(did))

  return (
    <>
      <div ref={filterWrapRef}>
        <div className="feed-tabs" role="tablist" aria-label="Feed">
          <div className="feed-tabs__tab-wrapper">
            <button
              type="button"
              className="feed-tabs__tab feed-tabs__tab--active"
              role="tab"
              aria-selected="true"
              aria-haspopup="dialog"
              aria-expanded={filterOpen}
              onClick={() => setFilterOpen((value) => !value)}
            >
              {isDefaultFilters ? "For you" : "Custom"}
              <ChevronDown
                size={14}
                aria-hidden
                className={`feed-tabs__chevron${filterOpen ? " feed-tabs__chevron--open" : ""}`}
              />
            </button>
          </div>
        </div>
        {filterOpen ? (
          <FeedFilterPanel
            evaluatorDids={evaluatorDids}
            selectedEvaluators={selectedEvaluators}
            onEvaluatorsChange={setCustomEvaluators}
            includedOrgTiers={includedOrgTiers}
            onOrgTiersChange={setIncludedOrgTiers}
            isDefault={isDefaultFilters}
            onReset={() => {
              setIncludedOrgTiers(
                new Set<OrgQualityValue>([
                  ...DEFAULT_INCLUDED_ORG_TIERS,
                  UNLABELED_SLUG,
                ]),
              )
              setCustomEvaluators(null)
            }}
          />
        ) : null}
      </div>
      {HOME_FEED_SOURCE === "service" ? (
        <ServiceHomeFeed
          activeDid={activeDid}
          selectedEvaluators={selectedEvaluators}
          evaluatorsLoading={evaluatorsLoading}
          includedOrgTiers={includedOrgTiers}
        />
      ) : (
        <LegacyHomeFeed
          activeDid={activeDid}
          selectedEvaluators={selectedEvaluators}
          includedOrgTiers={includedOrgTiers}
        />
      )}
    </>
  )
}

function ServiceHomeFeed({
  activeDid,
  selectedEvaluators,
  evaluatorsLoading,
  includedOrgTiers,
}: {
  activeDid: string
  selectedEvaluators: Set<string>
  evaluatorsLoading: boolean
  includedOrgTiers: Set<OrgQualityValue>
}) {
  const organizationQuality = useMemo(
    () => ({
      allowed: ORGLABEL_TIERS.filter((tier) => includedOrgTiers.has(tier)),
      includeUnrated: includedOrgTiers.has(UNLABELED_SLUG),
    }),
    [includedOrgTiers],
  )
  const result = useHomeFeed(activeDid, {
    trustedEvaluators: [...selectedEvaluators],
    organizationQuality,
    ready: !evaluatorsLoading,
  })
  return <HomeFeedBody {...result} />
}

function LegacyHomeFeed({
  activeDid,
  selectedEvaluators,
  includedOrgTiers,
}: {
  activeDid: string
  selectedEvaluators: Set<string>
  includedOrgTiers: Set<OrgQualityValue>
}) {
  const {
    subjects: followedDids,
    isLoading: followsLoading,
    error: followsError,
  } = useFollowing(activeDid)
  const { endorsedDids, isLoading: endorsementsLoading } =
    useEvaluatorEndorsements(selectedEvaluators)
  const orgFilter = useOrgQualityFilter(includedOrgTiers)
  const effectiveFollows = useMemo(() => {
    const next = new Set(followedDids)
    for (const did of endorsedDids) if (did !== activeDid) next.add(did)
    if (orgFilter.dids) {
      if (orgFilter.mode === "exclude") {
        for (const did of orgFilter.dids) next.delete(did)
      } else if (orgFilter.mode === "include-only") {
        for (const did of next) if (!orgFilter.dids.has(did)) next.delete(did)
      }
    }
    return next
  }, [followedDids, endorsedDids, activeDid, orgFilter.mode, orgFilter.dids])
  const result = useLegacyHomeFeed(effectiveFollows, {
    ready: !followsLoading && !endorsementsLoading && !orgFilter.isLoading,
  })
  return (
    <HomeFeedBody
      {...result}
      scopeLoading={followsLoading}
      scopeError={followsError !== null}
      scopeEmpty={effectiveFollows.size === 0}
    />
  )
}

export const HomeFeedBody = memo(function HomeFeedBody({
  events,
  isLoading,
  isLoadingMore,
  hasMore,
  error,
  continuationError,
  retryAt,
  canAutoLoad,
  requestKey,
  retryInitial,
  loadMore,
  scopeLoading = false,
  scopeError = false,
  scopeEmpty = false,
}: HomeFeedResult & {
  scopeLoading?: boolean
  scopeError?: boolean
  scopeEmpty?: boolean
}) {
  const items = useMemo(() => groupConsecutiveEndorsements(events), [events])
  const autoLoadAttemptsRef = useRef(0)
  useEffect(() => {
    autoLoadAttemptsRef.current = 0
  }, [requestKey])
  useEffect(() => {
    if (!canAutoLoad || !hasMore || isLoading || isLoadingMore) return
    if (items.length >= MIN_VISIBLE_ITEMS) {
      autoLoadAttemptsRef.current = 0
      return
    }
    if (autoLoadAttemptsRef.current >= MAX_AUTO_LOADS) return
    autoLoadAttemptsRef.current++
    loadMore()
  }, [items.length, canAutoLoad, hasMore, isLoading, isLoadingMore, loadMore])

  const [retryClock, setRetryClock] = useState(0)
  useEffect(() => {
    if (retryAt === null) return
    const delay = Math.max(0, retryAt - Date.now())
    const timer = window.setTimeout(() => setRetryClock(retryAt), delay)
    return () => window.clearTimeout(timer)
  }, [retryAt])
  const retryBlocked = retryAt !== null && retryClock < retryAt

  if (scopeLoading || isLoading) {
    return (
      <div className="home-feed__loading">
        <LoadingSpinner size="md" />
      </div>
    )
  }
  if (scopeError) {
    return <Banner variant="warning">Could not load your follow list. Try again later.</Banner>
  }
  if (scopeEmpty) {
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
      <Banner variant="warning" title="Could not load activity">
        <p>{error}</p>
        <Button
          className="mt-3"
          variant="secondary"
          size="sm"
          onClick={retryInitial}
          disabled={retryBlocked}
        >
          {retryBlocked ? "Retry shortly" : "Try again"}
        </Button>
      </Banner>
    )
  }
  if (continuationError && events.length === 0) {
    return (
      <Banner variant="warning" title="Could not continue the feed">
        <p>{continuationError}</p>
        <Button
          className="mt-3"
          variant="secondary"
          size="sm"
          onClick={loadMore}
          disabled={retryBlocked}
        >
          {retryBlocked ? "Retry shortly" : "Try again"}
        </Button>
      </Banner>
    )
  }
  if (events.length === 0) {
    return (
      <>
        <EmptyState
          icon={Inbox}
          title="No activity yet"
          description="There isn't any matching activity to show yet."
        />
        {hasMore || isLoadingMore ? (
          <div className="home-feed__load-more">
            <Button
              variant="secondary"
              size="sm"
              onClick={loadMore}
              loading={isLoadingMore}
            >
              Load more
            </Button>
          </div>
        ) : null}
      </>
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
      {continuationError ? (
        <Banner variant="warning" title="Could not load more activity" className="mt-4">
          <p>{continuationError}</p>
          <Button
            className="mt-3"
            variant="secondary"
            size="sm"
            onClick={loadMore}
            disabled={retryBlocked || isLoadingMore}
          >
            {retryBlocked ? "Retry shortly" : "Try again"}
          </Button>
        </Banner>
      ) : hasMore || isLoadingMore ? (
        <LoadMoreSentinel
          onLoadMore={loadMore}
          isLoading={isLoadingMore}
          className="home-feed__load-more"
          buttonClassName="home-feed__load-more-btn"
        />
      ) : null}
    </>
  )
})

function isOrgQualityDefault(included: Set<OrgQualityValue>): boolean {
  if (included.size !== DEFAULT_INCLUDED_ORG_TIERS.size + 1) return false
  if (!included.has(UNLABELED_SLUG)) return false
  for (const t of DEFAULT_INCLUDED_ORG_TIERS) if (!included.has(t)) return false
  return true
}

/**
 * Resolve the organization-quality checkboxes into a DID set + how to
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

/** Ephemeral request filters supported by the hydrated service contract. */
function FeedFilterPanel({
  evaluatorDids,
  selectedEvaluators,
  onEvaluatorsChange,
  includedOrgTiers,
  onOrgTiersChange,
  isDefault,
  onReset,
}: {
  evaluatorDids: string[]
  selectedEvaluators: Set<string>
  onEvaluatorsChange: (next: Set<string>) => void
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
      className="feed-evaluator-panel"
      role="region"
      aria-label="Feed filters"
    >
      <p className="feed-evaluator-panel__heading">
        Show activities from accounts that are endorsed by:
      </p>
      <div className="feed-evaluators__list">
        {evaluatorDids.map((did) => (
          <EvaluatorRow
            key={did}
            did={did}
            checked={selectedEvaluators.has(did)}
            onToggle={() =>
              onEvaluatorsChange(toggled(selectedEvaluators, did))
            }
          />
        ))}
      </div>
      <div className="feed-evaluators__separator" aria-hidden="true" />
      <p className="feed-evaluator-panel__heading">Organization quality</p>
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
      <div className="feed-evaluators__separator" aria-hidden="true" />
      <button
        type="button"
        className="feed-evaluator-panel__reset"
        onClick={onReset}
        disabled={isDefault}
      >
        Reset to default
      </button>
    </div>
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
    <label className="feed-evaluators__row">
      <input
        type="checkbox"
        className="feed-evaluators__checkbox"
        checked={checked}
        onChange={onToggle}
      />
      <span className="feed-evaluators__name">{label}</span>
    </label>
  )
}

/**
 * One trusted-evaluator row — checkbox + avatar + display name +
 * @handle, the whole row a click-to-toggle label (certs.social's
 * EvaluatorCheckbox layout). Selecting an evaluator pulls every DID
 * they've endorsed into the effective follow set, so the feed shows
 * transitively-vouched activity.
 */
function EvaluatorRow({
  did,
  checked,
  onToggle,
}: {
  did: string
  checked: boolean
  onToggle: () => void
}) {
  const { info } = useAuthorInfo(did)
  const label =
    info?.displayName ||
    (info?.handle ? `@${info.handle}` : did.slice(0, 14) + "…")
  return (
    <label className="feed-evaluators__row">
      <input
        type="checkbox"
        className="feed-evaluators__checkbox"
        checked={checked}
        onChange={onToggle}
        aria-label={`Include endorsements by ${label}`}
      />
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
      <span className="feed-evaluators__name">{label}</span>
      {info?.displayName && info?.handle ? (
        <span className="feed-evaluators__handle">@{info.handle}</span>
      ) : null}
    </label>
  )
}
