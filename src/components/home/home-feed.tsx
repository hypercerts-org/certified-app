"use client"

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { ChevronDown, Inbox, Users } from "lucide-react"
import Banner from "@/components/ui/banner"
import EmptyState from "@/components/ui/empty-state"
import LoadingSpinner from "@/components/ui/loading-spinner"
import LoadMoreSentinel from "@/components/ui/load-more-sentinel"
import { useAuthorInfo } from "@/hooks/use-author-info"
import { useClickOutsideClose } from "@/hooks/use-click-outside-close"
import { useEvaluatorEndorsements } from "@/hooks/use-evaluator-endorsements"
import { useHomeFeed, type HomeFeedEvent } from "@/hooks/use-home-feed"
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
import { EndorsementGroupRow, HomeFeedRow } from "./home-feed-rows"

// CertPreview moved to the rows layer; re-exported so the colocated
// test's `import { CertPreview } from "../home-feed"` keeps working.
export { CertPreview } from "./home-feed-rows"

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
  // Home feed reads ONLY the Certified follow graph
  // (`app.certified.graph.follow`). Viewers who want their Bluesky
  // follows reflected here run the social-graph sync in Settings,
  // which mirrors their Bluesky graph into the Certified collection
  // once — after that, the Certified graph is the canonical source
  // and the home feed reads from a single place instead of merging
  // both live every page load.
  const {
    subjects: followedDids,
    isLoading: followsLoading,
    error: followsError,
  } = useFollowing(activeDid)
  // Default state has every visible Hyperlabel tier checked AND
  // "Not labeled yet" checked — same default as the explore page so
  // a viewer who hasn't touched the filter sees the same set of certs
  // here and on /explore.
  const [includedTiers, setIncludedTiers] = useState<Set<QualityFilterValue>>(
    () => new Set<QualityFilterValue>([...DEFAULT_INCLUDED_TIERS, UNLABELED_SLUG]),
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
  // Organization-quality filter (Orglabeler tiers) — applied to the
  // event ACTOR rather than the record, by adjusting the author DID
  // set handed to useHomeFeed (see effectiveFollows below).
  const [includedOrgTiers, setIncludedOrgTiers] = useState<Set<OrgQualityValue>>(
    () => new Set<OrgQualityValue>([...DEFAULT_INCLUDED_ORG_TIERS, UNLABELED_SLUG]),
  )
  // Inline filter panel under the "For you" tab (certs.social pattern:
  // clicking the active tab toggles the disclosure).
  const [filterOpen, setFilterOpen] = useState(false)
  const filterWrapRef = useRef<HTMLDivElement>(null)
  useClickOutsideClose(filterOpen, filterWrapRef, () => setFilterOpen(false))
  useEffect(() => {
    if (!filterOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFilterOpen(false)
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [filterOpen])
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
  // then narrowed by the organization-quality filter. The viewer's own
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
  // module scope, so after the first /home visit `ready` flips
  // effectively-synchronously — only the cold first paint waits.
  const ready = !followsLoading && !endorsementsLoading && !orgFilter.isLoading
  const { events, isLoading, isLoadingMore, hasMore, loadMore, error } =
    useHomeFeed(effectiveFollows, {
      excludeCertLabels,
      includeCertLabels,
      ready,
    })

  // "For you" flips to "Custom" once any filter diverges from the
  // defaults — same affordance certs.social uses on its feed tabs.
  const isDefaultFilters =
    isQualityDefault(includedTiers) &&
    isOrgQualityDefault(includedOrgTiers) &&
    selectedEvaluators.size === evaluatorDids.length

  const resetFilters = () => {
    setIncludedTiers(
      new Set<QualityFilterValue>([...DEFAULT_INCLUDED_TIERS, UNLABELED_SLUG]),
    )
    setIncludedOrgTiers(
      new Set<OrgQualityValue>([...DEFAULT_INCLUDED_ORG_TIERS, UNLABELED_SLUG]),
    )
    setCustomEvaluators(null)
  }

  return (
    <>
      {/* certs.social-style tab strip. One tab for now ("For you");
          clicking the active tab toggles the inline filter panel. */}
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
              onClick={() => setFilterOpen((v) => !v)}
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
            onEvaluatorsChange={handleEvaluatorsChange}
            includedTiers={includedTiers}
            onTiersChange={setIncludedTiers}
            includedOrgTiers={includedOrgTiers}
            onOrgTiersChange={setIncludedOrgTiers}
            isDefault={isDefaultFilters}
            onReset={resetFilters}
          />
        ) : null}
      </div>
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

// Memoized: filter state (panel open/close, evaluator + tier checkbox
// ticks) lives in HomeFeed, so without memo every filter interaction
// re-executes the full row map. Props are primitives plus a stable
// events ref and a useCallback-stable loadMore, so the default shallow
// compare bails correctly.
const HomeFeedBody = memo(function HomeFeedBody({
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
      <Banner variant="warning">
        Could not load your follow list. Please try again later.
      </Banner>
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
      <Banner variant="warning">
        Could not load activity: {error}
      </Banner>
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
})

function isQualityDefault(included: Set<QualityFilterValue>): boolean {
  // Default = every tier in DEFAULT_INCLUDED_TIERS, plus unlabeled.
  if (included.size !== DEFAULT_INCLUDED_TIERS.size + 1) return false
  if (!included.has(UNLABELED_SLUG)) return false
  for (const t of DEFAULT_INCLUDED_TIERS) if (!included.has(t)) return false
  return true
}

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

/**
 * Inline filter panel under the "For you" tab — the certs.social
 * evaluator-panel pattern (`.feed-evaluator-panel` / `.feed-evaluators`
 * styles), extended with three sections: trusted evaluators, activity
 * quality (Hyperlabel tiers) and organization quality (Orglabeler
 * tiers), plus a reset row.
 */
function FeedFilterPanel({
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
      <p className="feed-evaluator-panel__heading">Activity quality</p>
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
