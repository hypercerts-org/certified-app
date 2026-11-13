"use client"

import { useCallback, useId, useMemo, useState, useSyncExternalStore } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import {
  ArrowUpDown,
  Globe,
  History,
  LayoutGrid,
  List as ListIcon,
  SearchX,
  ThumbsUp,
  UserCheck,
} from "lucide-react"
import {
  Popover as UiPopover,
  PopoverContent,
  PopoverItem,
  PopoverTrigger,
} from "@/components/ui/popover"
import EmptyState from "@/components/ui/empty-state"
import Tooltip from "@/components/ui/tooltip"
import Button from "@/components/ui/button"
import PageContainer from "@/components/ui/page-container"
import PageHeader from "@/components/ui/page-header"
import SectionHeader, { SeeAllLink } from "@/components/ui/section-header"
import SideNav, { type SideNavItem } from "@/components/ui/side-nav"
import SegmentedControl, { ToggleGroup } from "@/components/ui/segmented-control"
import SharedLoadMoreSentinel from "@/components/ui/load-more-sentinel"
import CertListRow from "./cert-list-row"
import ProjectListRow from "./project-list-row"
import AccountListRow from "./account-list-row"
import FundingReceiptRow, { FundingReceiptHeader } from "./funding-receipt-row"
import FundingConfirmedByPopover from "./funding-confirmed-by-popover"
import ExploreSearchField from "./explore-search-field"
import {
  EMPTY_SELECTION_SENTINEL,
  QualityFilterPopover,
  useQualityFilters,
} from "./quality-filters"
import {
  ExploreRowsSkeleton,
  ResultsArea,
  sortCerts,
  sortProjects,
  sortUsers,
  type EmptyContext,
} from "./explore-results"
import {
  DEFAULT_CONFIRM_ROLES,
  matchesConfirmedBy,
  type ConfirmRole,
} from "@/lib/atproto/funding-provenance"
import { MA_EARTH_FILTER } from "@/lib/atproto/featured"
import { useFundingConfirmedBy } from "@/hooks/use-funding-confirmed-by"
import {
  EMPTY_DID_SET,
  SUB_OPTIONS,
  defaultFilterForView,
  filtersForView,
  parseSubForKind,
  viewFilterToKindFilter,
  type Degree,
  type ExploreKind,
  type ListGalleryView,
  type SortOrder,
} from "./explore-types"
import { useExploreData } from "@/hooks/use-explore"
import { useMergedFunding } from "@/hooks/use-merged-funding"
import { useScrollRestoration } from "@/hooks/use-scroll-restoration"
import { useAuth } from "@/lib/auth/auth-context"
import { useLayoutBreakpoints } from "@/hooks/use-layout-breakpoints"
import { usePageTitle } from "@/lib/navbar-context"
import { getRecentlyViewed } from "@/lib/utils/recently-viewed"

const SORT_LABEL: Record<SortOrder, string> = {
  newest: "Newest first",
  oldest: "Oldest first",
  alphabetical: "Alphabetical",
}

function parseSort(v: string | null): SortOrder {
  if (v === "newest" || v === "oldest" || v === "alphabetical") return v
  return "newest"
}

function parseView(v: string | null): ListGalleryView {
  return v === "gallery" ? "gallery" : "list"
}

const ALL_DEGREES: readonly Degree[] = [1, 2, 3] as const

/** Default funding "Confirmed by" selection — all role buckets, no third
 *  parties — i.e. show only receipts confirmed by the sender, recipient, or
 *  both. The single-kind funding view starts here (the user can change it);
 *  the combined All view applies it as a fixed filter (no control), so its
 *  funding block matches the funding tab's default. */
const DEFAULT_CONFIRM_ROLE_SET: ReadonlySet<ConfirmRole> = new Set(
  DEFAULT_CONFIRM_ROLES,
)

/**
 * Parse the URL into a `Set<Degree>` of selected endorsement rings.
 * The control is a multi-select of three tags — direct, 2nd-hop,
 * 3rd-hop — and the URL serialises the active subset as a sorted
 * comma-separated list (`?degrees=1,3`).
 *
 * Special values:
 *   - missing param → default `{1}` (direct endorsements only)
 *   - `degrees=-`   → empty set (user explicitly deselected every
 *                     ring; result list renders empty until they
 *                     re-add at least one)
 *
 * Migration shim: a legacy `?degree=N` (single integer, cumulative
 * up to N — the old segmented-control semantics) is read as
 * `{1, …, N}`. Preferred form is `degrees=...`; the migration keeps
 * existing bookmarks meaningful.
 */
function parseDegrees(
  rawDegrees: string | null,
  legacyDegree: string | null,
): Set<Degree> {
  if (rawDegrees === EMPTY_SELECTION_SENTINEL) return new Set<Degree>()
  if (rawDegrees) {
    const out = new Set<Degree>()
    for (const part of rawDegrees.split(",")) {
      if (part === "1") out.add(1)
      else if (part === "2") out.add(2)
      else if (part === "3") out.add(3)
    }
    if (out.size > 0) return out
  }
  if (legacyDegree === "2") return new Set<Degree>([1, 2])
  if (legacyDegree === "3") return new Set<Degree>([1, 2, 3])
  return new Set<Degree>([1])
}

/** Serialise a degree set for URL storage — sorted, comma-joined.
 *  Returns null for the `{1}` default so the URL stays clean, and
 *  the explicit-empty sentinel when the user deselected every ring. */
function serializeDegrees(degrees: Set<Degree>): string | null {
  if (degrees.size === 0) return EMPTY_SELECTION_SENTINEL
  if (degrees.size === 1 && degrees.has(1)) return null
  return ALL_DEGREES.filter((d) => degrees.has(d)).join(",")
}

function maxDegree(degrees: Set<Degree>): Degree {
  if (degrees.has(3)) return 3
  if (degrees.has(2)) return 2
  return 1
}

/**
 * The filter keys that consume the endorsement-graph closure
 * (magic-indexer #117). When the active filter is in this set,
 * the degree-selector renders above the results and the loader
 * threads `degree` into `fetchEndorsementClosure`.
 */
function isEndorsementFilter(kind: ExploreKind, filter: string): boolean {
  if (kind === "accounts") return filter === "endorsed"
  return filter === "by-endorsed"
}

/**
 * /explore entry point: the page header, the list navigation (All,
 * Accounts I follow, Endorsed accounts, Recently viewed) and the main
 * column. The main column starts with the search field, then the type
 * chips (All · Activities · Projects · Accounts · Funding, `?show=`),
 * then the results: on "All", one short section per type (Featured
 * first on the plain All list); on a single type, that type in full.
 * Public: signed-out visitors can browse everything except the lists
 * built from their own follows and endorsements.
 */
export default function Explore() {
  // Kept for the chrome's document / phone title; PageHeader owns the h1.
  usePageTitle("Explore")
  return <ExploreAll />
}

// ----------------------------- URL state ------------------------------------

/** How many results each block on the All view shows. The loaders fetch
 *  a 2x window per kind (`pageSize` below) — enough to fill a block after
 *  client-side trimming without pulling a full 50-row page for 5 rows. */
const ALL_VIEW_BLOCK_SIZE = 5

/** Filter keys accepted in `?filter=`: the SideNav lists plus the
 *  featured Ma Earth set (reached from the Featured section). */
function isValidViewFilter(filter: string): boolean {
  return filtersForView("all").some((f) => f.key === filter)
}

/** Which type the page is showing. "all" renders one capped section per
 *  type; a concrete kind shows that type in full (with pagination).
 *  Backed by the `?show=` URL param. */
type AllShow = "all" | ExploreKind

function parseAllShow(v: string | null): AllShow {
  if (
    v === "activities" ||
    v === "projects" ||
    v === "accounts" ||
    v === "funding"
  )
    return v
  return "all"
}

const SHOW_OPTIONS: { key: AllShow; label: string }[] = [
  { key: "all", label: "All" },
  { key: "activities", label: "Activities" },
  { key: "projects", label: "Projects" },
  { key: "accounts", label: "Accounts" },
  { key: "funding", label: "Funding" },
]

/** Shared URL state: the list (`?filter=`), the type (`?show=`), the
 *  search (`?q=`), a replace-in-place writer and an href builder for
 *  links that change one of them. */
function useAllView() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const router = useRouter()

  const rawFilter = searchParams?.get("filter") ?? null
  const filter =
    rawFilter && isValidViewFilter(rawFilter)
      ? rawFilter
      : defaultFilterForView("all")
  const show = parseAllShow(searchParams?.get("show") ?? null)
  const search = searchParams?.get("q") ?? ""

  const setUrl = useCallback(
    (patch: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams?.toString() ?? "")
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === "") params.delete(k)
        else params.set(k, v)
      }
      const qs = params.toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    },
    [pathname, searchParams, router],
  )

  /** The current URL with `patch` applied — for links (SideNav, See all). */
  const hrefWith = useCallback(
    (patch: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams?.toString() ?? "")
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === "") params.delete(k)
        else params.set(k, v)
      }
      const qs = params.toString()
      return qs ? `${pathname}?${qs}` : (pathname ?? "/explore")
    },
    [pathname, searchParams],
  )

  // Type selection — "all" is the default, so it clears the param.
  const setShow = useCallback(
    (next: AllShow) => setUrl({ show: next === "all" ? null : next }),
    [setUrl],
  )

  return { filter, show, search, setUrl, hrefWith, setShow }
}

type AllView = ReturnType<typeof useAllView>

// --------------------------- Recently viewed --------------------------------

function subscribeStorage(onChange: () => void): () => void {
  window.addEventListener("storage", onChange)
  return () => window.removeEventListener("storage", onChange)
}

function hasRecentlyViewedSnapshot(): boolean {
  return (
    getRecentlyViewed("cert").length > 0 ||
    getRecentlyViewed("project").length > 0 ||
    getRecentlyViewed("user").length > 0
  )
}

/** Whether this browser has any recently viewed records (localStorage).
 *  False on the server and the first client render, so hydration matches. */
function useHasRecentlyViewed(): boolean {
  return useSyncExternalStore(
    subscribeStorage,
    hasRecentlyViewedSnapshot,
    () => false,
  )
}

// ------------------------------- Page ---------------------------------------

const LIST_LABEL: Record<string, string> = {
  all: "All",
  follows: "Accounts I follow",
  endorsed: "Endorsed accounts",
  recent: "Recently viewed",
}

function ExploreAll() {
  const view = useAllView()
  const { filter, show, hrefWith } = view
  const { isLoading: authLoading, isAuthenticated, openSignIn } = useAuth()
  const hasRecent = useHasRecentlyViewed()

  // The lists. "All" first: it is the default, so it is the one in view
  // when the phone pill row loads. Featured (`?filter=ma-earth`) is part
  // of All, so All stays current while it is shown. Recently viewed
  // appears once this browser has viewed something (or when linked to).
  const listItems: SideNavItem[] = [
    { key: "all", label: LIST_LABEL.all, icon: Globe },
    { key: "follows", label: LIST_LABEL.follows, icon: UserCheck },
    { key: "endorsed", label: LIST_LABEL.endorsed, icon: ThumbsUp },
    ...(hasRecent || filter === "recent"
      ? [{ key: "recent", label: LIST_LABEL.recent, icon: History }]
      : []),
  ].map((item) => ({
    ...item,
    href: hrefWith({
      filter: item.key === defaultFilterForView("all") ? null : item.key,
    }),
    current:
      item.key === filter ||
      (item.key === "all" && filter === MA_EARTH_FILTER),
  }))

  // "Accounts I follow" and "Endorsed accounts" are built from the
  // viewer's own graph: signed out, explain and offer to sign in.
  const needsSignIn =
    !authLoading &&
    !isAuthenticated &&
    (filter === "follows" || filter === "endorsed")

  return (
    <PageContainer width="wide" className="explore-page">
      <PageHeader
        title="Explore"
        description="Activities, projects and accounts across the Certified network."
      />
      <div className="explore__layout">
        <SideNav
          aria-label="Explore lists"
          items={listItems}
          className="explore__lists"
        />
        <div className="explore__main">
          {needsSignIn ? (
            <EmptyState
              icon={filter === "follows" ? UserCheck : ThumbsUp}
              headingLevel={2}
              title={
                filter === "follows"
                  ? "Sign in to see the accounts you follow"
                  : "Sign in to see endorsed accounts"
              }
              description={
                filter === "follows"
                  ? "This list shows activities, projects and accounts from the accounts you follow."
                  : "This list starts from the accounts you have endorsed, and the accounts they endorsed."
              }
            >
              <Button variant="primary" onClick={() => void openSignIn?.()}>
                Sign in
              </Button>
            </EmptyState>
          ) : show === "all" ? (
            <ExploreAllBlocks view={view} />
          ) : (
            <ExploreMain
              key={show}
              kind={show}
              filter={viewFilterToKindFilter(filter, show)}
              view={view}
            />
          )}
        </div>
      </div>
    </PageContainer>
  )
}

/**
 * The top of the main column: the search field with the result actions
 * (view, sort, filters) beside it, then the type chips.
 */
function ExploreToolbar({
  view,
  placeholder,
  actions,
}: {
  view: AllView
  placeholder: string
  actions: React.ReactNode
}) {
  const { search, setUrl, show, setShow } = view
  // Debounced search — ExploreSearchField owns the keystroke state so
  // typing re-renders the input alone, not the results below.
  const onSearchCommit = useCallback(
    (q: string | null) => setUrl({ q }),
    [setUrl],
  )
  return (
    <div className="explore__toolbar">
      <div className="explore__search-row">
        <ExploreSearchField
          search={search}
          placeholder={placeholder}
          onCommit={onSearchCommit}
        />
        <div className="explore__actions">{actions}</div>
      </div>
      {/* data-tour anchors the product tour's "Activities, projects, and
          accounts" step on a real box (the chips' own wrapper). */}
      <div className="explore__types" data-tour="explore-category">
        <SegmentedControl
          aria-label="Type"
          value={show}
          onValueChange={(next) => setShow(parseAllShow(next))}
          options={SHOW_OPTIONS.map((o) => ({ value: o.key, label: o.label }))}
          size="md"
          joined
          shape="square"
        />
      </div>
    </div>
  )
}

/** A short line above the results while the featured Ma Earth set is
 *  shown (it is reached from the Featured section, not the list nav). */
function FeaturedNote({ view }: { view: AllView }) {
  return (
    <div className="explore__note">
      <p className="explore__note-text">Showing featured picks from Ma Earth.</p>
      <Button
        variant="ghost"
        size="sm"
        href={view.hrefWith({ filter: null })}
      >
        Show everything
      </Button>
    </div>
  )
}

/** How an empty result should explain itself and what it offers. */
function emptyContextFor(view: AllView): EmptyContext {
  const { search, filter, setUrl, hrefWith } = view
  return {
    search,
    list: filter,
    onClearSearch: () => setUrl({ q: null }),
    allListHref: hrefWith({ filter: null }),
  }
}

// ------------------------- Single type ----------------------------------------

interface ExploreMainProps {
  kind: ExploreKind
  /** Already resolved to the kind-specific filter key
   *  (`viewFilterToKindFilter`). */
  filter: string
  view: AllView
}

/**
 * One type shown in full: the toolbar (search, view toggle, sort, quality
 * and, for funding, "Confirmed by"), a row for the accounts sub-type and
 * the endorsement rings when they apply, then the results with
 * pagination. `kind` + `filter` come in as props; everything else (sub /
 * sort / view / quality / degrees / q) is read from and written to the
 * URL.
 */
function ExploreMain({ kind, filter, view: allView }: ExploreMainProps) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { setUrl, search } = allView

  const sub = parseSubForKind(kind, searchParams?.get("sub") ?? null)
  // Funding "Confirmed by" filter (client-side — the role buckets aren't a
  // single indexer arg). URL-backed state shared with the activity detail
  // page via `useFundingConfirmedBy`. Only meaningful on the funding kind.
  const confirmedBy = useFundingConfirmedBy()
  const sort = parseSort(searchParams?.get("sort") ?? null)
  const view = parseView(searchParams?.get("view") ?? null)
  const { isDesktop } = useLayoutBreakpoints()
  // Phones: accounts as rows, activities and projects as image-led cards
  // (one column). The list / gallery toggle is desktop only.
  const effectiveView: ListGalleryView = isDesktop
    ? view
    : kind === "accounts"
      ? "list"
      : "gallery"
  // Endorsement-graph ring tags — multi-select of {1, 2, 3}. The URL
  // stores the active subset under `?degrees=` (sorted); legacy
  // `?degree=N` is read as the cumulative set {1..N} so old bookmarks
  // keep working.
  const degreesParam = searchParams?.get("degrees") ?? null
  const legacyDegreeParam = searchParams?.get("degree") ?? null
  const degrees = useMemo(
    () => parseDegrees(degreesParam, legacyDegreeParam),
    [degreesParam, legacyDegreeParam],
  )
  const showsDegreeControl = isEndorsementFilter(kind, filter)
  const { did: viewerDid } = useAuth()

  // Cert + org quality filters — URL-backed, shared with the All view
  // via useQualityFilters(). Returns the included sets, the
  // include/exclude label arrays the loader passes to the indexer, the
  // "is default" flags, and the toggle/reset handlers.
  const quality = useQualityFilters()

  const [sortOpen, setSortOpen] = useState(false)
  const [qualityOpen, setQualityOpen] = useState(false)
  const [confirmedByOpen, setConfirmedByOpen] = useState(false)

  // Read the target's `data-*` attribute instead of capturing the
  // iteration variable in a closure. The SWC minifier (Next 16's
  // default prod-build pipeline) was hoisting the loop variable out of
  // the per-iteration `.map()` scope and sharing it across every
  // button's onClick. Reading from the DOM dataset is minifier-proof
  // because there's no captured variable.
  const onSortOptionClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      const key = e.currentTarget.dataset.sortKey
      if (key) {
        setUrl({ sort: key === "newest" ? null : key })
        setSortOpen(false)
      }
    },
    [setUrl],
  )

  // "Reset to default" buttons clear the URL params they own. The
  // readers fall back to the canonical default sets when those params
  // are missing, so a single `setUrl({ key: null })` is enough.
  const onResetDegrees = useCallback(() => {
    setUrl({ degrees: null, degree: null })
  }, [setUrl])

  const onResetSort = useCallback(() => {
    setUrl({ sort: null })
    setSortOpen(false)
  }, [setUrl])

  const data = useExploreData({
    kind,
    filter,
    sub,
    search,
    // Fetch the closure deep enough to include every selected ring.
    // Only pass when the active filter actually consumes it, so a
    // stale `?degrees=…` on a non-endorsement filter doesn't perturb
    // caching keys / loader behaviour.
    degree: showsDegreeControl ? maxDegree(degrees) : undefined,
    // Signals "user deselected every endorsement ring on the
    // endorsement-graph filter" — the loader short-circuits to an
    // empty page in that state instead of defaulting back to {1}.
    noEndorsementRings: showsDegreeControl && degrees.size === 0,
    // Cert-quality filter — only meaningful for the certs kind, but
    // passing it for other kinds is a no-op at the load-page level.
    excludeCertLabels: kind === "activities" ? quality.excludeCertLabels : undefined,
    includeCertLabels: kind === "activities" ? quality.includeCertLabels : undefined,
    // Org-quality filter — used on accounts (filters the actor list),
    // certs (filters certs whose author org carries the tier), projects
    // and funding (filters receipts whose creator account carries the
    // tier).
    excludeOrgLabels: quality.excludeOrgLabels,
    includeOrgLabels: quality.includeOrgLabels,
    // The funding "Confirmed by" filter is applied client-side (see
    // ResultsArea); the loader fetches the full receipt set so the popover
    // can offer every third-party attestor as a candidate.
  })

  // Restore the window scroll offset when the reader returns from a
  // project/activity detail page (back button). Keyed by the full URL so
  // each kind/filter/search combination restores independently; gated on
  // the list having finished its initial load so the page is tall enough.
  const scrollKey = `${pathname}?${searchParams?.toString() ?? ""}`
  useScrollRestoration(scrollKey, !data.isLoading)

  const onDegreesChange = useCallback(
    (next: Set<Degree>) => {
      // Each ring toggles independently; deselecting the last ring is
      // allowed — the result list renders empty until the user re-adds a
      // ring. serializeDegrees encodes the empty set as the explicit
      // sentinel so the round-trip through the URL doesn't collapse it
      // back to the default. Clear the legacy `degree=` param while we're
      // patching so it doesn't outlive a multi-select edit and re-take
      // precedence on the next read.
      setUrl({ degrees: serializeDegrees(next), degree: null })
    },
    [setUrl],
  )

  const emptyContext = emptyContextFor(allView)
  const hasSubOptions = SUB_OPTIONS[kind].length > 0

  const actions = (
    <>
      {/* Funding receipts have a single list layout (no gallery card),
          so the list/gallery toggle is suppressed there. */}
      {isDesktop && kind !== "funding" && (
        <SegmentedControl
          aria-label={`${kind === "activities" ? "Activity" : kind === "projects" ? "Project" : "Account"} view`}
          value={view}
          // List is the default view, so selecting it clears the
          // `?view=` param (keeps the URL clean); Gallery writes
          // `?view=gallery`.
          onValueChange={(next) =>
            setUrl({ view: next === "gallery" ? "gallery" : null })
          }
          options={[
            {
              value: "list",
              icon: <ListIcon size={16} strokeWidth={1.75} aria-hidden />,
              ariaLabel: "List view",
              tooltip: "List view",
            },
            {
              value: "gallery",
              icon: <LayoutGrid size={16} strokeWidth={1.75} aria-hidden />,
              ariaLabel: "Gallery view",
              tooltip: "Gallery view",
            },
          ]}
          size="md"
          joined
          shape="square"
          iconOnly
        />
      )}
      <UiPopover open={sortOpen} onOpenChange={setSortOpen}>
        <PopoverTrigger>
          <Button
            size="icon"
            variant="secondary"
            className="explore__action-btn"
            aria-label="Sort"
          >
            <ArrowUpDown size={16} strokeWidth={1.75} aria-hidden />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end">
          {(["newest", "oldest", "alphabetical"] as SortOrder[]).map((s) => (
            <PopoverItem
              key={s}
              selected={sort === s}
              data-sort-key={s}
              onClick={onSortOptionClick}
            >
              {SORT_LABEL[s]}
            </PopoverItem>
          ))}
          <hr className="popover__divider" aria-hidden="true" />
          <PopoverItem
            className="popover__item--quiet"
            onClick={onResetSort}
            disabled={sort === "newest"}
          >
            Reset to default
          </PopoverItem>
        </PopoverContent>
      </UiPopover>

      {/* Activity + account quality filter — shared with the All view.
          The cert (Activity Labeler) section shows only on activities;
          the account (Orglabeler) section shows on every kind. On
          funding it filters receipts by the creator account's tier. */}
      <QualityFilterPopover
        q={quality}
        showCertSection={kind === "activities"}
        open={qualityOpen}
        onOpenChange={setQualityOpen}
      />
      {/* Funding also offers the "Confirmed by" filter (role buckets +
          specific third-party attestors). */}
      {kind === "funding" ? (
        <FundingConfirmedByPopover
          receipts={data.fundingReceipts}
          roles={confirmedBy.roles}
          onToggleRole={confirmedBy.toggleRole}
          thirdParties={confirmedBy.thirdParties}
          onToggleThirdParty={confirmedBy.toggleThirdParty}
          isDefault={confirmedBy.isDefault}
          onReset={confirmedBy.reset}
          open={confirmedByOpen}
          onOpenChange={setConfirmedByOpen}
        />
      ) : null}
    </>
  )

  return (
    <>
      <ExploreToolbar
        view={allView}
        placeholder={searchPlaceholder(kind)}
        actions={actions}
      />

      {/* The accounts sub-type (People / Organizations) and the
          endorsement rings share one row when either applies. */}
      {hasSubOptions || showsDegreeControl ? (
        <div className="explore__inline-controls">
          {hasSubOptions ? (
            <SegmentedControl
              aria-label="Account type"
              value={sub}
              onValueChange={(next) =>
                setUrl({ sub: next === "all" ? null : next })
              }
              options={SUB_OPTIONS[kind].map((o) => ({
                value: o.key,
                label: o.label,
                disabled: !!o.requiresAuth && !viewerDid,
              }))}
              size="md"
              shape="pill"
              joined={false}
            />
          ) : null}
          {hasSubOptions && showsDegreeControl ? (
            <span className="explore__inline-divider" aria-hidden="true" />
          ) : null}
          {showsDegreeControl ? (
            <EndorsementDegreeBar
              degrees={degrees}
              onChange={onDegreesChange}
              onReset={onResetDegrees}
              meta={data.endorsementClosure}
            />
          ) : null}
        </div>
      ) : null}

      {filter === MA_EARTH_FILTER ? <FeaturedNote view={allView} /> : null}

      <ResultsArea
        kind={kind}
        data={data}
        sort={sort}
        view={effectiveView}
        degrees={showsDegreeControl ? degrees : null}
        confirmRoles={kind === "funding" ? confirmedBy.roles : undefined}
        confirmThirdParties={
          kind === "funding" ? confirmedBy.thirdParties : undefined
        }
        emptyContext={emptyContext}
      />
      {data.hasMore || data.isLoadingMore ? (
        <SharedLoadMoreSentinel
          onLoadMore={data.loadMore}
          isLoading={data.isLoadingMore}
          className="explore__load-more"
        />
      ) : null}
    </>
  )
}

// ----------------------------- All types -----------------------------------

/**
 * The All type: one short section per type (Activities, Projects,
 * Accounts, Funding), each with up to {@link ALL_VIEW_BLOCK_SIZE} rows and
 * a "See all" link that switches to that type. On the plain All list with
 * no search, a Featured section (Ma Earth's picks) leads.
 *
 * Runs one loader per type; the single-type view (ExploreMain) runs just
 * one, so switching type doesn't keep the other queries running.
 */
function ExploreAllBlocks({ view }: { view: AllView }) {
  const { filter, search, hrefWith, setUrl } = view
  // Quality filter shared with the single-type view. The All view
  // always includes the activities block, so it shows both the cert
  // (Activity Labeler) and account (Orglabeler) sections.
  const quality = useQualityFilters()
  const [qualityOpen, setQualityOpen] = useState(false)

  // Three independent loaders — one per kind. Each maps the unified
  // All-view filter to that kind's concrete filter key. `sub` is pinned
  // to "all" (the All view has no People/Organizations sub-toggle).
  const activities = useExploreData({
    kind: "activities",
    filter: viewFilterToKindFilter(filter, "activities"),
    sub: "all",
    search,
    // 2x the block cap — a short server page still fills the block
    // after any client-side trimming, without fetching 50 rows for 5.
    pageSize: ALL_VIEW_BLOCK_SIZE * 2,
    // Activities carry both their own cert tier and their author org's
    // tier, so both quality axes apply.
    excludeCertLabels: quality.excludeCertLabels,
    includeCertLabels: quality.includeCertLabels,
    excludeOrgLabels: quality.excludeOrgLabels,
    includeOrgLabels: quality.includeOrgLabels,
  })
  const projects = useExploreData({
    kind: "projects",
    filter: viewFilterToKindFilter(filter, "projects"),
    sub: "all",
    search,
    pageSize: ALL_VIEW_BLOCK_SIZE * 2,
    // Projects + accounts filter by the author org's tier only.
    excludeOrgLabels: quality.excludeOrgLabels,
    includeOrgLabels: quality.includeOrgLabels,
  })
  const accounts = useExploreData({
    kind: "accounts",
    filter: viewFilterToKindFilter(filter, "accounts"),
    sub: "all",
    search,
    pageSize: ALL_VIEW_BLOCK_SIZE * 2,
    excludeOrgLabels: quality.excludeOrgLabels,
    includeOrgLabels: quality.includeOrgLabels,
  })
  // Funding has no social-graph / featured filters and no quality axis;
  // the loader lists receipts gated to an AT Protocol account on either
  // side, so it always runs with the plain "all" filter.
  // Keeps the default PAGE_SIZE window (no pageSize cap): the fixed
  // "Confirmed by" filter below is client-side and can drop most
  // receipts, so a trimmed page could leave the block short.
  const funding = useExploreData({
    kind: "funding",
    filter: "all",
    sub: "all",
    search,
  })

  const activityItems = useMemo(
    () => sortCerts(activities.certs, "newest").slice(0, ALL_VIEW_BLOCK_SIZE),
    [activities.certs],
  )
  const projectItems = useMemo(
    () => sortProjects(projects.projects, "newest").slice(0, ALL_VIEW_BLOCK_SIZE),
    [projects.projects],
  )
  const accountItems = useMemo(
    () => sortUsers(accounts.users, "newest").slice(0, ALL_VIEW_BLOCK_SIZE),
    [accounts.users],
  )
  // Same default "Confirmed by" filter as the funding type — show only
  // receipts the recipient confirmed (recipient or both); sender-only and
  // third-party-only are hidden. Fixed here (the All view has no confirmer
  // control). Merge optimistic confirmations first so a just-confirmed pair
  // shows as one row.
  const mergedFunding = useMergedFunding(funding.fundingReceipts)
  const fundingItems = useMemo(
    () =>
      mergedFunding
        .filter((r) =>
          matchesConfirmedBy(r.attestations, DEFAULT_CONFIRM_ROLE_SET, EMPTY_DID_SET),
        )
        .slice(0, ALL_VIEW_BLOCK_SIZE),
    [mergedFunding],
  )

  const blocks = [activities, projects, accounts, funding]
  const allLoaded = blocks.every((b) => !b.isLoading)
  const nothingFound =
    allLoaded &&
    blocks.every((b) => !b.error) &&
    activityItems.length === 0 &&
    projectItems.length === 0 &&
    accountItems.length === 0 &&
    fundingItems.length === 0

  const seeAll = (kind: ExploreKind) => hrefWith({ show: kind })
  const showFeatured = filter === "all" && search === ""

  const actions = (
    <QualityFilterPopover
      q={quality}
      showCertSection
      open={qualityOpen}
      onOpenChange={setQualityOpen}
    />
  )

  return (
    <>
      <ExploreToolbar
        view={view}
        placeholder="Search all of Explore"
        actions={actions}
      />

      {filter === MA_EARTH_FILTER ? <FeaturedNote view={view} /> : null}

      {nothingFound && (search || filter !== "all") ? (
        <AllEmpty view={view} onClearSearch={() => setUrl({ q: null })} />
      ) : (
        <div className="explore__sections">
          {showFeatured ? (
            <FeaturedSection
              quality={quality}
              seeAllHref={hrefWith({ filter: MA_EARTH_FILTER, show: "activities" })}
            />
          ) : null}

          <AllSection
            title="Activities"
            seeAllHref={seeAll("activities")}
            seeAllLabel="All activities"
            isLoading={activities.isLoading}
            error={activities.error}
            onRetry={activities.refetch}
            isEmpty={activityItems.length === 0}
            emptyText={sectionEmptyText("activities", filter, search)}
          >
            <ul className="explore__list explore__list--certs">
              {activityItems.map((rec) => {
                const did = activities.certDids.get(rec.uri) ?? ""
                return (
                  <li key={rec.uri}>
                    <CertListRow record={rec} did={did} showByline />
                  </li>
                )
              })}
            </ul>
          </AllSection>

          <AllSection
            title="Projects"
            seeAllHref={seeAll("projects")}
            seeAllLabel="All projects"
            isLoading={projects.isLoading}
            error={projects.error}
            onRetry={projects.refetch}
            isEmpty={projectItems.length === 0}
            emptyText={sectionEmptyText("projects", filter, search)}
          >
            <ul className="explore__list explore__list--projects">
              {projectItems.map((p) => (
                <li key={p.uri}>
                  <ProjectListRow project={p} />
                </li>
              ))}
            </ul>
          </AllSection>

          <AllSection
            title="Accounts"
            seeAllHref={seeAll("accounts")}
            seeAllLabel="All accounts"
            isLoading={accounts.isLoading}
            error={accounts.error}
            onRetry={accounts.refetch}
            isEmpty={accountItems.length === 0}
            emptyText={sectionEmptyText("accounts", filter, search)}
            skeleton="account"
          >
            <ul className="explore__list explore__list--accounts">
              {accountItems.map((a) => (
                <li key={a.did}>
                  <AccountListRow actor={a} />
                </li>
              ))}
            </ul>
          </AllSection>

          <AllSection
            title="Funding"
            description="Payments to and from accounts on Certified."
            seeAllHref={seeAll("funding")}
            seeAllLabel="All funding"
            isLoading={funding.isLoading}
            error={funding.error}
            onRetry={funding.refetch}
            isEmpty={fundingItems.length === 0}
            emptyText={sectionEmptyText("funding receipts", "all", search)}
          >
            <ul className="explore__list explore__list--funding">
              <li>
                <FundingReceiptHeader />
              </li>
              {fundingItems.map((r) => (
                <li key={r.uri}>
                  <FundingReceiptRow receipt={r} showTextParties />
                </li>
              ))}
            </ul>
          </AllSection>
        </div>
      )}
    </>
  )
}

/** The one-line empty text of an All-type section, naming the search or
 *  list that left it empty. Funding ignores the list (it has none). */
function sectionEmptyText(noun: string, filter: string, search: string): string {
  if (search) return `No ${noun} match “${search}”.`
  if (filter === "follows") return `No ${noun} from accounts you follow.`
  if (filter === "endorsed") return `No ${noun} from endorsed accounts.`
  if (filter === "recent") return `No recently viewed ${noun}.`
  if (filter === MA_EARTH_FILTER) return `No featured ${noun}.`
  return `No ${noun} yet.`
}

/** Every section came back empty for a search or a narrowed list: one
 *  message for the page, naming what narrowed it, instead of five. */
function AllEmpty({
  view,
  onClearSearch,
}: {
  view: AllView
  onClearSearch: () => void
}) {
  const { search, filter, hrefWith } = view
  if (search) {
    return (
      <EmptyState
        icon={SearchX}
        headingLevel={2}
        title={`Nothing matches “${search}”`}
        description="No activities, projects, accounts or funding receipts match this search. Try another word."
      >
        <Button variant="secondary" size="sm" onClick={onClearSearch}>
          Clear search
        </Button>
      </EmptyState>
    )
  }
  const listLabel =
    filter === MA_EARTH_FILTER ? "Featured" : (LIST_LABEL[filter] ?? filter)
  return (
    <EmptyState
      icon={SearchX}
      headingLevel={2}
      title={`Nothing in ${listLabel} yet`}
      description="There are no activities, projects or accounts in this list yet."
    >
      <Button variant="secondary" size="sm" href={hrefWith({ filter: null })}>
        Show all
      </Button>
    </EmptyState>
  )
}

/**
 * The first section on the plain All list: activities picked by Ma Earth
 * (the featured curated set). Its own component so its loader only runs
 * while it is shown.
 */
function FeaturedSection({
  quality,
  seeAllHref,
}: {
  quality: ReturnType<typeof useQualityFilters>
  seeAllHref: string
}) {
  const featured = useExploreData({
    kind: "activities",
    filter: MA_EARTH_FILTER,
    sub: "all",
    search: "",
    pageSize: ALL_VIEW_BLOCK_SIZE * 2,
    excludeCertLabels: quality.excludeCertLabels,
    includeCertLabels: quality.includeCertLabels,
    excludeOrgLabels: quality.excludeOrgLabels,
    includeOrgLabels: quality.includeOrgLabels,
  })
  const items = featured.certs.slice(0, ALL_VIEW_BLOCK_SIZE)
  // Nothing curated (or the curated set failed): leave the section out
  // rather than lead the page with an empty box.
  if (!featured.isLoading && (featured.error || items.length === 0)) return null
  return (
    <AllSection
      title="Featured"
      description="Activities picked by Ma Earth."
      seeAllHref={seeAllHref}
      seeAllLabel="All featured"
      isLoading={featured.isLoading}
      isEmpty={false}
      emptyText=""
    >
      <ul className="explore__list explore__list--certs">
        {items.map((rec) => {
          const did = featured.certDids.get(rec.uri) ?? ""
          return (
            <li key={rec.uri}>
              <CertListRow record={rec} did={did} showByline />
            </li>
          )
        })}
      </ul>
    </AllSection>
  )
}

/**
 * One section on the All type: a SectionHeader with a "See all" link
 * (once there is something to see), then skeleton rows while loading, a
 * retry on error, one muted line when empty, or the rows.
 */
function AllSection({
  title,
  description,
  seeAllHref,
  seeAllLabel,
  isLoading,
  isEmpty,
  emptyText,
  error = false,
  onRetry,
  skeleton = "record",
  children,
}: {
  title: string
  description?: string
  seeAllHref: string
  seeAllLabel: string
  isLoading: boolean
  isEmpty: boolean
  emptyText: string
  /** The block's fetch failed: show a retry instead of the empty line. */
  error?: boolean
  onRetry?: () => void
  skeleton?: "record" | "account"
  children: React.ReactNode
}) {
  const headingId = useId()
  return (
    <section
      className="explore__section"
      aria-labelledby={headingId}
      aria-busy={isLoading || undefined}
    >
      <SectionHeader
        id={headingId}
        title={title}
        description={description}
        action={
          !isLoading && !isEmpty && !error ? (
            <SeeAllLink href={seeAllHref} label={seeAllLabel} />
          ) : null
        }
      />
      {isLoading ? (
        <ExploreRowsSkeleton rows={ALL_VIEW_BLOCK_SIZE} variant={skeleton} />
      ) : error ? (
        <EmptyState
          variant="inline"
          title={`Couldn't load ${title.toLowerCase()}.`}
        >
          {onRetry ? (
            <Button variant="ghost" size="sm" onClick={onRetry}>
              Try again
            </Button>
          ) : null}
        </EmptyState>
      ) : isEmpty ? (
        <EmptyState variant="inline" title={emptyText} />
      ) : (
        children
      )}
    </section>
  )
}

// ----------------------- Endorsement-degree selector ------------------------

const DEGREE_LABEL: Record<Degree, string> = {
  1: "1st",
  2: "2nd",
  3: "3rd",
}

/**
 * Multi-select pill row shown when the active list is endorsement-based
 * (Accounts/"endorsed", Projects|Activities/"by-endorsed").
 *
 * Each pill — 1st / 2nd / 3rd — toggles independently so the user can
 * compose any subset of rings (e.g. show only direct endorsements, or
 * only 3rd-degree connections, or skip the 2nd ring entirely).
 *
 * Rendered with the canonical <ToggleGroup> primitive (gapped pills,
 * neutral tone): it owns the aria-pressed buttons + role="group" and
 * emits the full next subset, which we convert back into the
 * `Set<Degree>` the URL serialiser expects.
 */
function EndorsementDegreeBar({
  degrees,
  onChange,
  onReset,
  meta,
}: {
  degrees: Set<Degree>
  onChange: (next: Set<Degree>) => void
  onReset: () => void
  meta: ReturnType<typeof useExploreData>["endorsementClosure"]
}) {
  // Default is {1}. Hide the reset affordance when we're already
  // there so the inline control doesn't read as "active" on a fresh
  // visit.
  const isDefault = degrees.size === 1 && degrees.has(1)
  return (
    <div className="explore__degree-bar">
      <div className="explore__degree-pills">
        <ToggleGroup
          aria-label="Endorsement rings — mark one or more"
          value={ALL_DEGREES.filter((d) => degrees.has(d)).map(String)}
          onValueChange={(values) =>
            onChange(
              new Set<Degree>(
                ALL_DEGREES.filter((d) => values.includes(String(d))),
              ),
            )
          }
          options={ALL_DEGREES.map((d) => ({
            value: String(d),
            label: DEGREE_LABEL[d],
            tooltip: `Show ${DEGREE_LABEL[d]}-degree endorsements`,
          }))}
          tone="neutral"
          shape="pill"
          joined={false}
          size="md"
        />
        {!isDefault ? (
          <Tooltip label="Reset to default">
            <button
              type="button"
              className="explore__degree-reset"
              onClick={onReset}
              aria-label="Reset endorsement rings to default"
            >
              Reset
            </button>
          </Tooltip>
        ) : null}
      </div>
      {meta?.truncated ? (
        <p
          className="explore__degree-note"
          role="status"
          aria-live="polite"
        >
          Showing part of your trust graph; it is capped so the page stays fast.
        </p>
      ) : null}
      {meta?.warming ? (
        <p
          className="explore__degree-note"
          role="status"
          aria-live="polite"
        >
          Building your endorsement network. Results arrive in a moment.
        </p>
      ) : null}
    </div>
  )
}

function searchPlaceholder(kind: ExploreKind): string {
  if (kind === "accounts") return "Search accounts"
  if (kind === "projects") return "Search projects"
  if (kind === "funding") return "Search funding"
  return "Search activities"
}
