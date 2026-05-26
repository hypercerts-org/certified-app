"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import {
  ArrowUpDown,
  ChevronDown,
  Filter as FilterIcon,
  FolderGit2,
  LayoutGrid,
  List as ListIcon,
  Search,
  Users,
} from "lucide-react"
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
import CertIcon from "@/components/ui/cert-icon"
import LoadingSpinner from "@/components/ui/loading-spinner"
import EmptyState from "@/components/ui/empty-state"
import SharedLoadMoreSentinel from "@/components/ui/load-more-sentinel"
import ActivityCard from "@/components/feed/activity-card"
import CertListRow from "./cert-list-row"
import ExploreUserCard from "./explore-user-card"
import ExploreProjectCard from "./explore-project-card"
import ProjectListRow from "./project-list-row"
import AccountListRow from "./account-list-row"
import {
  SUB_OPTIONS,
  defaultFilterForKind,
  filtersForKind,
  parseSubForKind,
  type ExploreKind,
  type SortOrder,
} from "./explore-types"
import { useExploreData } from "@/hooks/use-explore"
import { useAuth } from "@/lib/auth/auth-context"
import { usePageTitle } from "@/lib/navbar-context"


const SORT_LABEL: Record<SortOrder, string> = {
  newest: "Newest first",
  oldest: "Oldest first",
  alphabetical: "Alphabetical",
}

/** Sentinel slug for the "no label yet" checkbox that sits at the
 *  end of every labeler popover. Backed by an `includeLabels` /
 *  `excludeLabels` swap at the loader (see comment on
 *  `excludeCertLabels` / `includeCertLabels` below). */
const UNLABELED_SLUG = "unlabeled" as const
type UnlabeledSlug = typeof UNLABELED_SLUG

const UNLABELED_LABEL = "Not labeled yet"

/**
 * Orglabeler tier slugs used in the URL `?orgQuality=` param.
 * Map to the unicode-prefixed values the lexicon actually stores
 * (see `ORGLABEL_TIERS` in labels.ts) at filter-evaluation time so
 * the URL stays printable. */
const ORG_TIER_SLUGS = ["high-quality", "standard", "likely-test"] as const
type OrgTierSlug = (typeof ORG_TIER_SLUGS)[number]

const ORG_TIER_DISPLAY_LABEL: Record<OrgTierSlug, string> = {
  "high-quality": "High quality",
  standard: "Standard",
  "likely-test": "Likely test",
}

/** Slug ↔ raw lexicon value (the glyph-prefixed strings the
 *  orglabeler emits). */
const ORG_TIER_BY_SLUG: Record<OrgTierSlug, OrglabelTier> = {
  "high-quality": "✦ High Quality",
  standard: "● Standard",
  "likely-test": "⚠ Likely Test",
}

/** Inverse of ORG_TIER_BY_SLUG. Used when checking which slug a raw
 *  label value belongs to. */
const ORG_TIER_BY_VALUE = {
  "✦ High Quality": "high-quality" as const,
  "● Standard": "standard" as const,
  "⚠ Likely Test": "likely-test" as const,
} satisfies Record<OrglabelTier, OrgTierSlug>

/** Default org-quality set when `?orgQuality=` is missing —
 *  everything except the labels listed in DEFAULT_HIDDEN_ORG_LABELS
 *  (today only "⚠ Likely Test"). Matches the home feed's policy. */
const DEFAULT_ORG_TIER_SLUGS: readonly OrgTierSlug[] = ORG_TIER_SLUGS.filter(
  (slug) => !DEFAULT_HIDDEN_ORG_LABELS.includes(ORG_TIER_BY_SLUG[slug]),
)

function parseKind(v: string | null): ExploreKind {
  if (v === "accounts" || v === "projects" || v === "certs") return v
  // Migration shim — old URLs with ?kind=users or ?kind=profiles still
  // resolve to accounts so external links keep working.
  if (v === "users" || v === "profiles") return "accounts"
  return "certs"
}

function parseSort(v: string | null): SortOrder {
  if (v === "newest" || v === "oldest" || v === "alphabetical") return v
  return "newest"
}

type ListGalleryView = "list" | "gallery"
function parseView(v: string | null): ListGalleryView {
  return v === "gallery" ? "gallery" : "list"
}

type Degree = 1 | 2 | 3

const ALL_DEGREES: readonly Degree[] = [1, 2, 3] as const

/**
 * Parse the URL into a non-empty `Set<Degree>` of selected endorsement
 * rings. The control is a multi-select of three tags — direct, 2nd-hop,
 * 3rd-hop — and the URL serialises the active subset as a sorted
 * comma-separated list (`?degrees=1,3`).
 *
 * Migration shim: a legacy `?degree=N` (single integer, cumulative
 * up to N — the old segmented-control semantics) is read as
 * `{1, …, N}`. Preferred form is `degrees=...`; the migration keeps
 * existing bookmarks meaningful.
 *
 * Returns `{1}` (default — direct endorsements only) when neither
 * param is present, matching the old default-degree behaviour.
 */
function parseDegrees(
  rawDegrees: string | null,
  legacyDegree: string | null,
): Set<Degree> {
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
 *  Returns null for the `{1}` default so the URL stays clean. */
function serializeDegrees(degrees: Set<Degree>): string | null {
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


function isValidFilter(kind: ExploreKind, filter: string): boolean {
  return filtersForKind(kind).some((f) => f.key === filter)
}

export default function Explore() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const router = useRouter()

  const kind = parseKind(searchParams?.get("kind") ?? null)
  const rawFilter = searchParams?.get("filter") ?? null
  const filter = rawFilter && isValidFilter(kind, rawFilter)
    ? rawFilter
    : defaultFilterForKind(kind)
  const sub = parseSubForKind(kind, searchParams?.get("sub") ?? null)
  const search = searchParams?.get("q") ?? ""
  const sort = parseSort(searchParams?.get("sort") ?? null)
  const view = parseView(searchParams?.get("view") ?? null)
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

  // Client-side filter chip(s) — kind-specific simple boolean attributes
  // captured in URL as a comma-separated list under `attrs=`.
  const attrsParam = searchParams?.get("attrs") ?? ""
  const attrs = useMemo(
    () => new Set(attrsParam.split(",").filter(Boolean)),
    [attrsParam],
  )

  // Cert-quality filter — URL-backed `Set<HyperlabelTier>` of
  // INCLUDED tiers. Missing param falls back to the same default as
  // the home feed (`high-quality` + `standard`), so first-load on
  // /explore?kind=certs hides `draft` + `likely-test` rows out of
  // the box. An explicit empty string is treated as "show nothing"
  // (every tier excluded) so toggling all four off is a legible
  // state rather than a coincidental no-op.
  const qualityParam = searchParams?.get("quality")
  // Slug set holds both named Hyperlabel tiers AND the synthetic
  // `unlabeled` sentinel. Default includes every tier that isn't
  // in DEFAULT_HIDDEN_CERT_LABELS, plus `unlabeled` (records with
  // no Hyperlabel verdict yet stay visible by default — matches
  // the home feed policy).
  const qualityIncluded = useMemo<Set<HyperlabelTier | UnlabeledSlug>>(() => {
    if (qualityParam == null) {
      return new Set<HyperlabelTier | UnlabeledSlug>([
        ...HYPERLABEL_TIERS.filter(
          (t) => !DEFAULT_HIDDEN_CERT_LABELS.includes(t),
        ),
        UNLABELED_SLUG,
      ])
    }
    const valid = new Set<string>([...HYPERLABEL_TIERS, UNLABELED_SLUG])
    return new Set(
      qualityParam
        .split(",")
        .filter((v): v is HyperlabelTier | UnlabeledSlug => valid.has(v)),
    )
  }, [qualityParam])
  // Two filter modes:
  //   - Unlabeled INCLUDED → use `excludeLabels` (filter out specific
  //     tiers; unlabeled passes because it has nothing to match).
  //   - Unlabeled EXCLUDED → use `labels` (must have one of the
  //     checked tiers; unlabeled records don't qualify).
  // Only one of the two is non-undefined at a time.
  const certIncludeUnlabeled = qualityIncluded.has(UNLABELED_SLUG)
  const excludeCertLabels = useMemo<readonly string[] | undefined>(
    () =>
      certIncludeUnlabeled
        ? HYPERLABEL_TIERS.filter((t) => !qualityIncluded.has(t))
        : undefined,
    [qualityIncluded, certIncludeUnlabeled],
  )
  const includeCertLabels = useMemo<readonly string[] | undefined>(
    () =>
      certIncludeUnlabeled
        ? undefined
        : HYPERLABEL_TIERS.filter((t) => qualityIncluded.has(t)),
    [qualityIncluded, certIncludeUnlabeled],
  )
  const qualityIsDefault = useMemo(() => {
    // Default = every non-hidden tier + unlabeled.
    const expectedSize =
      HYPERLABEL_TIERS.length - DEFAULT_HIDDEN_CERT_LABELS.length + 1
    if (qualityIncluded.size !== expectedSize) return false
    if (!qualityIncluded.has(UNLABELED_SLUG)) return false
    for (const t of HYPERLABEL_TIERS) {
      const shouldBeIncluded = !DEFAULT_HIDDEN_CERT_LABELS.includes(t)
      if (qualityIncluded.has(t) !== shouldBeIncluded) return false
    }
    return true
  }, [qualityIncluded])

  // Orglabeler quality state — same pattern as the Hyperlabel one,
  // including the `unlabeled` sentinel for org records without a tier.
  const orgQualityParam = searchParams?.get("orgQuality")
  const orgQualityIncluded = useMemo<Set<OrgTierSlug | UnlabeledSlug>>(() => {
    if (orgQualityParam == null) {
      return new Set<OrgTierSlug | UnlabeledSlug>([
        ...DEFAULT_ORG_TIER_SLUGS,
        UNLABELED_SLUG,
      ])
    }
    const valid = new Set<string>([...ORG_TIER_SLUGS, UNLABELED_SLUG])
    return new Set(
      orgQualityParam
        .split(",")
        .filter((v): v is OrgTierSlug | UnlabeledSlug => valid.has(v)),
    )
  }, [orgQualityParam])
  const orgIncludeUnlabeled = orgQualityIncluded.has(UNLABELED_SLUG)
  const excludeOrgLabels = useMemo<readonly OrglabelTier[] | undefined>(
    () =>
      orgIncludeUnlabeled
        ? ORG_TIER_SLUGS.filter((slug) => !orgQualityIncluded.has(slug)).map(
            (slug) => ORG_TIER_BY_SLUG[slug],
          )
        : undefined,
    [orgQualityIncluded, orgIncludeUnlabeled],
  )
  const includeOrgLabels = useMemo<readonly OrglabelTier[] | undefined>(
    () =>
      orgIncludeUnlabeled
        ? undefined
        : ORG_TIER_SLUGS.filter((slug) => orgQualityIncluded.has(slug)).map(
            (slug) => ORG_TIER_BY_SLUG[slug],
          ),
    [orgQualityIncluded, orgIncludeUnlabeled],
  )
  const orgQualityIsDefault = useMemo(() => {
    if (orgQualityIncluded.size !== DEFAULT_ORG_TIER_SLUGS.length + 1) return false
    if (!orgQualityIncluded.has(UNLABELED_SLUG)) return false
    for (const slug of ORG_TIER_SLUGS) {
      const shouldBeIncluded = DEFAULT_ORG_TIER_SLUGS.includes(slug)
      if (orgQualityIncluded.has(slug) !== shouldBeIncluded) return false
    }
    return true
  }, [orgQualityIncluded])

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

  // Read the target's `data-*` attribute instead of capturing the
  // iteration variable in a closure. The SWC minifier (Next 16's
  // default prod-build pipeline) was hoisting `f` out of the per-
  // iteration `.map()` scope and sharing it across every button's
  // onClick — meaning every sidebar filter ended up calling
  // setUrl({ filter: <last_filter_key> }), which on certs is "all"
  // and produces no observable change. Reading from the DOM dataset
  // is minifier-proof because there's no captured variable. Same
  // pattern applied to the sub-category dropdown's option buttons
  // below.
  const onFilterButtonClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      const key = e.currentTarget.dataset.filterKey
      if (key) setUrl({ filter: key })
    },
    [setUrl],
  )

  const onSubOptionClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      const key = e.currentTarget.dataset.subKey
      if (key) {
        setUrl({ sub: key === "all" ? null : key })
        setSubPrefixOpen(false)
      }
    },
    [setUrl],
  )

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

  const onAttrToggle = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const key = e.currentTarget.dataset.attrKey
      if (!key) return
      const next = new Set(attrs)
      if (e.currentTarget.checked) next.add(key)
      else next.delete(key)
      setUrl({ attrs: next.size > 0 ? Array.from(next).join(",") : null })
    },
    [attrs, setUrl],
  )

  const onQualityToggle = useCallback(
    (slug: HyperlabelTier | UnlabeledSlug) => {
      const next = new Set(qualityIncluded)
      if (next.has(slug)) next.delete(slug)
      else next.add(slug)
      // Default = every non-hidden tier + unlabeled.
      const defaultSlugs = new Set<HyperlabelTier | UnlabeledSlug>([
        ...HYPERLABEL_TIERS.filter(
          (t) => !DEFAULT_HIDDEN_CERT_LABELS.includes(t),
        ),
        UNLABELED_SLUG,
      ])
      const isDefault =
        next.size === defaultSlugs.size &&
        Array.from(defaultSlugs).every((s) => next.has(s))
      // URL preserves slug order matching the popover render order
      // (named tiers first, then unlabeled).
      const ordered: (HyperlabelTier | UnlabeledSlug)[] = [
        ...HYPERLABEL_TIERS.filter((t) => next.has(t)),
        ...(next.has(UNLABELED_SLUG) ? [UNLABELED_SLUG] : []),
      ]
      setUrl({ quality: isDefault ? null : ordered.join(",") })
    },
    [qualityIncluded, setUrl],
  )

  const onOrgQualityToggle = useCallback(
    (slug: OrgTierSlug | UnlabeledSlug) => {
      const next = new Set(orgQualityIncluded)
      if (next.has(slug)) next.delete(slug)
      else next.add(slug)
      const defaultSlugs = new Set<OrgTierSlug | UnlabeledSlug>([
        ...DEFAULT_ORG_TIER_SLUGS,
        UNLABELED_SLUG,
      ])
      const isDefault =
        next.size === defaultSlugs.size &&
        Array.from(defaultSlugs).every((s) => next.has(s))
      const ordered: (OrgTierSlug | UnlabeledSlug)[] = [
        ...ORG_TIER_SLUGS.filter((s) => next.has(s)),
        ...(next.has(UNLABELED_SLUG) ? [UNLABELED_SLUG] : []),
      ]
      setUrl({ orgQuality: isDefault ? null : ordered.join(",") })
    },
    [orgQualityIncluded, setUrl],
  )

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
    // Cert-quality filter — only meaningful for the certs kind, but
    // passing it for other kinds is a no-op at the load-page level.
    excludeCertLabels: kind === "certs" ? excludeCertLabels : undefined,
    includeCertLabels: kind === "certs" ? includeCertLabels : undefined,
    // Org-quality filter — used on accounts (filters the actor list)
    // and certs (filters certs whose author org carries the tier).
    excludeOrgLabels:
      kind === "accounts" || kind === "certs" ? excludeOrgLabels : undefined,
    includeOrgLabels:
      kind === "accounts" || kind === "certs" ? includeOrgLabels : undefined,
  })

  const onDegreeButtonClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      const raw = e.currentTarget.dataset.degreeKey
      const key =
        raw === "1" ? 1 : raw === "2" ? 2 : raw === "3" ? 3 : null
      if (!key) return
      // Toggle: deselect if already active, select otherwise. Block
      // the move that would leave the set empty — at least one ring
      // must stay active so the result list isn't filtered to zero.
      const next = new Set<Degree>(degrees)
      if (next.has(key)) {
        if (next.size === 1) return
        next.delete(key)
      } else {
        next.add(key)
      }
      // Clear the legacy `degree=` param while we're patching so it
      // doesn't outlive a multi-select edit and re-take precedence
      // on the next read.
      setUrl({ degrees: serializeDegrees(next), degree: null })
    },
    [degrees, setUrl],
  )

  // Local search debounce: keep typing snappy, hit indexer once typing stops.
  const [localQuery, setLocalQuery] = useState(search)
  useEffect(() => setLocalQuery(search), [search])
  useEffect(() => {
    const t = setTimeout(() => {
      if (localQuery !== search) setUrl({ q: localQuery || null })
    }, 250)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localQuery])

  const [sortOpen, setSortOpen] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [qualityOpen, setQualityOpen] = useState(false)
  const [subPrefixOpen, setSubPrefixOpen] = useState(false)

  // Register the page title in the top bar's title slot — the chrome
  // already pairs the brandmark with this. Mirrors the convention
  // every other top-level page uses (Apps, Settings, Endorsements…).
  usePageTitle("Explore")

  return (
    <div className="explore">
      <div className="explore__layout">
        <aside className="explore__sidebar" aria-label="Explore filters">
          {/* Kind switcher used to live here but didn't fit in 220px
              with three labels; promoted to the top of the main pane
              (see below). Sidebar is now filter-list-only. */}
          {(() => {
            const all = filtersForKind(kind)
            const featured = all.filter((f) => f.featured)
            const standard = all.filter((f) => !f.featured)
            return (
              <>
                <ul className="explore__filter-list">
                  {standard.map((f) => (
                    <li key={f.key}>
                      <button
                        type="button"
                        className={`explore__filter${filter === f.key ? " explore__filter--active" : ""}`}
                        data-filter-key={f.key}
                        onClick={onFilterButtonClick}
                      >
                        {f.label}
                      </button>
                    </li>
                  ))}
                </ul>
                {featured.length > 0 ? (
                  <>
                    <hr className="explore__filter-divider" aria-hidden="true" />
                    <h3 className="explore__filter-heading">Featured</h3>
                    <ul className="explore__filter-list explore__filter-list--indented">
                      {featured.map((f) => (
                        <li key={f.key}>
                          <button
                            type="button"
                            className={`explore__filter${filter === f.key ? " explore__filter--active" : ""}`}
                            data-filter-key={f.key}
                            onClick={onFilterButtonClick}
                          >
                            {f.label}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : null}
              </>
            )
          })()}
        </aside>

        <main className="explore__main">
          {/* Kind switcher (Certs / Projects / Accounts) is now
              rendered as a second row in the top navbar — same
              pattern profile pages use for their tab strip. See
              EXPLORE_TABS in desktop-top-bar.tsx. */}
          <div className="explore__chrome">
            {SUB_OPTIONS[kind].length > 0 ? (
              <SubPrefixDropdown
                kind={kind}
                sub={sub}
                viewerDid={viewerDid}
                onSelect={onSubOptionClick}
                open={subPrefixOpen}
                setOpen={setSubPrefixOpen}
              />
            ) : null}

            <label className="explore__search">
              <Search size={14} strokeWidth={1.75} aria-hidden />
              <input
                type="search"
                placeholder={searchPlaceholder(kind)}
                value={localQuery}
                onChange={(e) => setLocalQuery(e.target.value)}
                className="explore__search-input"
                aria-label={searchPlaceholder(kind)}
              />
            </label>

            <div className="explore__chrome-actions">
              <div
                className="explore__view-toggle"
                role="group"
                aria-label={`${kind === "certs" ? "Cert" : kind === "projects" ? "Project" : "Account"} view`}
              >
                <button
                  type="button"
                  aria-label="List view"
                  aria-pressed={view === "list"}
                  className={`explore__view-btn${view === "list" ? " explore__view-btn--active" : ""}`}
                  onClick={() => setUrl({ view: null })}
                >
                  <ListIcon size={14} strokeWidth={1.75} aria-hidden />
                </button>
                <button
                  type="button"
                  aria-label="Gallery view"
                  aria-pressed={view === "gallery"}
                  className={`explore__view-btn${view === "gallery" ? " explore__view-btn--active" : ""}`}
                  onClick={() => setUrl({ view: "gallery" })}
                >
                  <LayoutGrid size={14} strokeWidth={1.75} aria-hidden />
                </button>
              </div>
              <Popover
                open={sortOpen}
                onClose={() => setSortOpen(false)}
                trigger={
                  <button
                    type="button"
                    className="explore__chrome-btn"
                    onClick={() => setSortOpen((v) => !v)}
                    aria-expanded={sortOpen}
                  >
                    <ArrowUpDown
                      size={13}
                      strokeWidth={1.75}
                      aria-hidden
                    />
                    Sort: {SORT_LABEL[sort]}
                  </button>
                }
              >
                {(["newest", "oldest", "alphabetical"] as SortOrder[]).map(
                  (s) => (
                    <button
                      key={s}
                      type="button"
                      className={`popover__item${sort === s ? " popover__item--active" : ""}`}
                      data-sort-key={s}
                      onClick={onSortOptionClick}
                    >
                      {SORT_LABEL[s]}
                    </button>
                  ),
                )}
              </Popover>

              {/* The generic attr-based Filter popover stays for
                  projects only; on certs + accounts it's replaced
                  by the labeler-tier Quality popover below. */}
              {kind === "projects" ? (
                <Popover
                  open={filtersOpen}
                  onClose={() => setFiltersOpen(false)}
                  trigger={
                    <button
                      type="button"
                      className="explore__chrome-btn"
                      onClick={() => setFiltersOpen((v) => !v)}
                      aria-expanded={filtersOpen}
                    >
                      <FilterIcon size={13} strokeWidth={1.75} aria-hidden />
                      Filter{attrs.size ? ` (${attrs.size})` : ""}
                    </button>
                  }
                >
                  {attrOptions(kind).map((opt) => {
                    const on = attrs.has(opt.key)
                    return (
                      <label
                        key={opt.key}
                        className="popover__item popover__item--check"
                      >
                        <input
                          type="checkbox"
                          checked={on}
                          data-attr-key={opt.key}
                          onChange={onAttrToggle}
                        />
                        {opt.label}
                      </label>
                    )
                  })}
                </Popover>
              ) : null}

              {kind === "certs" || kind === "accounts" ? (
                <Popover
                  open={qualityOpen}
                  onClose={() => setQualityOpen(false)}
                  trigger={
                    <button
                      type="button"
                      className={`explore__chrome-btn explore__chrome-btn--icon${
                        (kind === "certs" && !qualityIsDefault) ||
                        !orgQualityIsDefault
                          ? " explore__chrome-btn--active"
                          : ""
                      }`}
                      onClick={() => setQualityOpen((v) => !v)}
                      aria-expanded={qualityOpen}
                      aria-label={`Filter by quality${
                        (kind === "certs" && !qualityIsDefault) ||
                        !orgQualityIsDefault
                          ? " (filtered)"
                          : ""
                      }`}
                      title="Filter by quality"
                    >
                      <FilterIcon size={13} strokeWidth={1.75} aria-hidden />
                    </button>
                  }
                >
                  {kind === "certs" ? (
                    <>
                      <p className="popover__section-heading">Cert quality</p>
                      {HYPERLABEL_DISPLAY_ORDER.map((tier) => (
                        <label
                          key={tier}
                          className="popover__item popover__item--check"
                        >
                          <input
                            type="checkbox"
                            checked={qualityIncluded.has(tier)}
                            onChange={() => onQualityToggle(tier)}
                          />
                          {HYPERLABEL_DISPLAY_LABELS[tier]}
                        </label>
                      ))}
                      <label className="popover__item popover__item--check">
                        <input
                          type="checkbox"
                          checked={qualityIncluded.has(UNLABELED_SLUG)}
                          onChange={() => onQualityToggle(UNLABELED_SLUG)}
                        />
                        {UNLABELED_LABEL}
                      </label>
                      <hr className="popover__divider" aria-hidden="true" />
                      <p className="popover__section-heading">Account quality</p>
                    </>
                  ) : null}
                  {ORG_TIER_SLUGS.map((slug) => (
                    <label
                      key={slug}
                      className="popover__item popover__item--check"
                    >
                      <input
                        type="checkbox"
                        checked={orgQualityIncluded.has(slug)}
                        onChange={() => onOrgQualityToggle(slug)}
                      />
                      {ORG_TIER_DISPLAY_LABEL[slug]}
                    </label>
                  ))}
                  <label className="popover__item popover__item--check">
                    <input
                      type="checkbox"
                      checked={orgQualityIncluded.has(UNLABELED_SLUG)}
                      onChange={() => onOrgQualityToggle(UNLABELED_SLUG)}
                    />
                    {UNLABELED_LABEL}
                  </label>
                </Popover>
              ) : null}
            </div>
          </div>

          {showsDegreeControl ? (
            <EndorsementDegreeBar
              degrees={degrees}
              onSelect={onDegreeButtonClick}
              meta={data.endorsementClosure}
            />
          ) : null}
          <ResultsArea
            kind={kind}
            data={data}
            sort={sort}
            attrs={attrs}
            view={view}
            degrees={showsDegreeControl ? degrees : null}
          />
          {data.hasMore || data.isLoadingMore ? (
            <LoadMoreSentinel
              onLoadMore={data.loadMore}
              isLoading={data.isLoadingMore}
            />
          ) : null}
        </main>
      </div>
    </div>
  )
}

/** Pagination sentinel — auto-fires `onLoadMore` when scrolled into
 *  view (IntersectionObserver) and also renders an explicit "Load
 *  more" button so the affordance is keyboard-accessible and
 *  visually anchored at the end of the list. */

// ----------------------- Endorsement-degree selector ------------------------

const DEGREE_LABEL: Record<Degree, string> = {
  1: "1st",
  2: "2nd",
  3: "3rd",
}

/** Hover tooltip per degree pill. Explains the ring in plain language
 *  so the abbreviated "1st / 2nd / 3rd" labels don't have to. */
const DEGREE_TITLE: Record<Degree, string> = {
  1: "1st-degree — accounts you endorse directly.",
  2: "2nd-degree — accounts endorsed by the people you endorse.",
  3: "3rd-degree — accounts endorsed by your 2nd-degree connections.",
}

/**
 * Multi-select pill row above the result list when the active filter
 * is endorsement-based (Accounts/"endorsed", Projects|Certs/"by-endorsed").
 *
 * Each pill — 1st / 2nd / 3rd — toggles independently so the user can
 * compose any non-empty subset of rings (e.g. show only direct
 * endorsements, or only 3rd-degree connections, or skip the 2nd ring
 * entirely). The caption tracks the current selection.
 *
 * Implementation note: data-degree-key on each button + a captured
 * onSelect avoids the same SWC-minifier closure-capture hazard the
 * filter / sub-option buttons solve via `data-filter-key` / `data-sub-key`.
 */
function EndorsementDegreeBar({
  degrees,
  onSelect,
  meta,
}: {
  degrees: Set<Degree>
  onSelect: (e: React.MouseEvent<HTMLButtonElement>) => void
  meta: ReturnType<typeof useExploreData>["endorsementClosure"]
}) {
  return (
    <div
      className="explore__degree-bar"
      role="group"
      aria-label="Endorsement rings — mark one or more"
    >
      <div className="explore__degree-pills">
        {ALL_DEGREES.map((d) => {
          const active = degrees.has(d)
          return (
            <button
              key={d}
              type="button"
              data-degree-key={String(d)}
              onClick={onSelect}
              className={`explore__degree-pill${active ? " explore__degree-pill--active" : ""}`}
              aria-pressed={active}
              title={DEGREE_TITLE[d]}
              aria-label={DEGREE_TITLE[d]}
            >
              {DEGREE_LABEL[d]}
            </button>
          )
        })}
      </div>
      {meta?.truncated ? (
        <p
          className="explore__degree-truncated"
          role="status"
          aria-live="polite"
        >
          Showing a subset of your trust graph (capped for performance).
        </p>
      ) : null}
      {meta?.warming ? (
        <p
          className="explore__degree-truncated"
          role="status"
          aria-live="polite"
        >
          Building your endorsement graph — results in a moment.
        </p>
      ) : null}
    </div>
  )
}

function LoadMoreSentinel({
  onLoadMore,
  isLoading,
}: {
  onLoadMore: () => void
  isLoading: boolean
}) {
  return (
    <SharedLoadMoreSentinel
      onLoadMore={onLoadMore}
      isLoading={isLoading}
      className="explore__load-more"
      buttonClassName="explore__load-more-btn"
    />
  )
}

/** Sub-category dropdown control — sits to the left of the search
 *  input in the chrome row. Single button shows the active option,
 *  click opens a Popover-style menu listing the rest. */
function SubPrefixDropdown({
  kind,
  sub,
  viewerDid,
  onSelect,
  open,
  setOpen,
}: {
  kind: ExploreKind
  sub: string
  viewerDid: string | null
  /** Click handler shared across all option buttons — reads the
   *  selected key from `event.currentTarget.dataset.subKey` rather
   *  than capturing the loop variable in a closure, so the SWC
   *  minifier can't share a single hoisted variable across all
   *  iterations (see comment on `onFilterButtonClick` in the parent
   *  Explore component). */
  onSelect: (e: React.MouseEvent<HTMLButtonElement>) => void
  open: boolean
  setOpen: (next: boolean) => void
}) {
  const options = SUB_OPTIONS[kind]
  if (options.length === 0) return null
  const active = options.find((o) => o.key === sub) ?? options[0]
  return (
    <Popover
      open={open}
      onClose={() => setOpen(false)}
      align="left"
      trigger={
        <button
          type="button"
          className="explore__sub-dropdown-trigger"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-haspopup="menu"
        >
          <span className="explore__sub-dropdown-label">{active.label}</span>
          <ChevronDown size={13} strokeWidth={1.75} aria-hidden />
        </button>
      }
    >
      {options.map((opt) => {
        const disabled = opt.requiresAuth && !viewerDid
        return (
          <button
            key={opt.key}
            type="button"
            role="menuitem"
            disabled={disabled}
            title={disabled ? "Sign in to filter by your role" : undefined}
            className={`popover__item${sub === opt.key ? " popover__item--active" : ""}`}
            data-sub-key={opt.key}
            onClick={onSelect}
          >
            {opt.label}
          </button>
        )
      })}
    </Popover>
  )
}

function searchPlaceholder(kind: ExploreKind): string {
  if (kind === "accounts") return "Search accounts by name…"
  if (kind === "projects") return "Search projects…"
  return "Search certs…"
}

function attrOptions(kind: ExploreKind): { key: string; label: string }[] {
  if (kind === "accounts")
    return [
      { key: "has-avatar", label: "Has avatar" },
      { key: "has-description", label: "Has description" },
    ]
  if (kind === "projects")
    return [
      { key: "has-banner", label: "Has banner" },
      { key: "has-items", label: "Has at least one cert" },
    ]
  return [
    { key: "has-image", label: "Has image" },
    { key: "has-shortDescription", label: "Has description" },
  ]
}

function Popover({
  open,
  onClose,
  trigger,
  children,
  align = "right",
}: {
  open: boolean
  onClose: () => void
  trigger: React.ReactNode
  children: React.ReactNode
  /** Which edge of the menu aligns with the trigger.
   *  "right" (default) — menu's right edge under trigger's right (good
   *  for trailing controls like sort/filter).
   *  "left" — menu's left edge under trigger's left (good for leading
   *  controls like the sub-category dropdown at the start of the chrome). */
  align?: "left" | "right"
}) {
  return (
    <div className="popover">
      {trigger}
      {open ? (
        <>
          <div
            className="popover__overlay"
            onClick={onClose}
            aria-hidden
          />
          <div
            className={`popover__menu popover__menu--${align}`}
            role="menu"
          >
            {children}
          </div>
        </>
      ) : null}
    </div>
  )
}

/** Render whatever the data hook returned, applying client-side sort
 *  + attribute filters and routing through the right card. */
function ResultsArea({
  kind,
  data,
  sort,
  attrs,
  view,
  degrees,
}: {
  kind: ExploreKind
  data: ReturnType<typeof useExploreData>
  sort: SortOrder
  attrs: Set<string>
  view: ListGalleryView
  /** Non-null only when the active filter is endorsement-based.
   *  When present, rows whose author's degree isn't in the set are
   *  filtered out — the loader fetched the full closure up to
   *  `max(degrees)`, this trims the subset the user actually wants
   *  to see. */
  degrees: Set<Degree> | null
}) {
  const closure = data.endorsementClosure
  const degreeMatches = (did: string | null | undefined): boolean => {
    if (!degrees || !closure) return true
    if (!did) return false
    const meta = closure.closureByDid.get(did)
    if (!meta) return false
    return degrees.has(meta.degree)
  }

  if (data.isLoading && data.users.length === 0 && data.projects.length === 0 && data.certs.length === 0) {
    return (
      <div className="explore__loading">
        <LoadingSpinner size="md" />
      </div>
    )
  }

  if (kind === "accounts") {
    let actors = data.users
    if (degrees) actors = actors.filter((a) => degreeMatches(a.did))
    if (attrs.has("has-avatar"))
      actors = actors.filter((a) => !!a.avatarUrl)
    if (attrs.has("has-description"))
      actors = actors.filter((a) => !!a.description)
    actors = sortUsers(actors, sort)
    if (actors.length === 0) return <EmptyResults kind={kind} />
    if (view === "list") {
      return (
        <ul className="explore__list explore__list--accounts">
          {actors.map((a) => (
            <li key={a.did}>
              <AccountListRow
                actor={a}
                endorsementMeta={closure?.closureByDid.get(a.did)}
              />
            </li>
          ))}
        </ul>
      )
    }
    return (
      <ul className="explore__grid explore__grid--users">
        {actors.map((a) => (
          <li key={a.did}>
            <ExploreUserCard actor={a} />
          </li>
        ))}
      </ul>
    )
  }

  if (kind === "projects") {
    let projects = data.projects
    if (degrees)
      projects = projects.filter((p) => degreeMatches(projectAuthorDid(p)))
    if (attrs.has("has-banner"))
      projects = projects.filter((p) => !!p.value.banner || !!p.value.image)
    if (attrs.has("has-items"))
      projects = projects.filter(
        (p) =>
          Array.isArray(p.value.items) &&
          (p.value.items as unknown[]).length > 0,
      )
    projects = sortProjects(projects, sort)
    if (projects.length === 0) return <EmptyResults kind={kind} />
    if (view === "list") {
      return (
        <ul className="explore__list explore__list--projects">
          {projects.map((p) => {
            const authorDid = projectAuthorDid(p)
            const meta = closure && authorDid
              ? closure.closureByDid.get(authorDid)
              : undefined
            return (
              <li key={p.uri}>
                <ProjectListRow
                  project={p}
                  endorsementMeta={meta}
                />
              </li>
            )
          })}
        </ul>
      )
    }
    return (
      <ul className="explore__grid explore__grid--projects">
        {projects.map((p) => (
          <li key={p.uri}>
            <ExploreProjectCard project={p} />
          </li>
        ))}
      </ul>
    )
  }

  // certs
  let certs = data.certs
  const certDids = data.certDids
  if (degrees)
    certs = certs.filter((c) => degreeMatches(certDids.get(c.uri) ?? null))
  if (attrs.has("has-image"))
    certs = certs.filter((c) => !!c.value.image)
  if (attrs.has("has-shortDescription"))
    certs = certs.filter(
      (c) => typeof c.value.shortDescription === "string" && c.value.shortDescription.length > 0,
    )
  certs = sortCerts(certs, sort)
  if (certs.length === 0) return <EmptyResults kind={kind} />

  if (view === "list") {
    return (
      <ul className="explore__list explore__list--certs">
        {certs.map((rec) => {
          const did = certDids.get(rec.uri) ?? ""
          const meta = closure && did
            ? closure.closureByDid.get(did)
            : undefined
          return (
            <li key={rec.uri}>
              <CertListRow
                record={rec}
                did={did}
                endorsementMeta={meta}
              />
            </li>
          )
        })}
      </ul>
    )
  }

  return (
    <ul className="explore__grid explore__grid--certs">
      {certs.map((rec) => {
        const did = certDids.get(rec.uri) ?? ""
        return (
          <li key={rec.uri}>
            <ActivityCard record={rec} did={did} />
          </li>
        )
      })}
    </ul>
  )
}

function EmptyResults({ kind }: { kind: ExploreKind }) {
  const label =
    kind === "accounts" ? "accounts" : kind === "projects" ? "projects" : "certs"
  return (
    <EmptyState
      icon={kind === "accounts" ? Users : kind === "projects" ? FolderGit2 : CertIcon}
      title={`No ${label} match`}
      description="Try a different filter, clear the search, or pick a broader scope."
    />
  )
}

function sortUsers<T extends { displayName: string | null; did: string }>(
  list: T[],
  sort: SortOrder,
): T[] {
  if (sort === "alphabetical") {
    return [...list].sort((a, b) =>
      (a.displayName ?? a.did).localeCompare(b.displayName ?? b.did),
    )
  }
  // newest/oldest don't map cleanly to actors (no createdAt on profile
  // record here); keep insertion order which is roughly recently-indexed.
  if (sort === "oldest") return [...list].reverse()
  return list
}

function sortProjects<
  T extends { value: { createdAt?: string; title?: string } },
>(list: T[], sort: SortOrder): T[] {
  if (sort === "alphabetical") {
    return [...list].sort((a, b) =>
      (a.value.title ?? "").localeCompare(b.value.title ?? ""),
    )
  }
  return [...list].sort((a, b) => {
    const ac = a.value.createdAt ?? ""
    const bc = b.value.createdAt ?? ""
    return sort === "oldest" ? ac.localeCompare(bc) : bc.localeCompare(ac)
  })
}

function sortCerts<
  T extends { value: { createdAt?: string; title?: string } },
>(list: T[], sort: SortOrder): T[] {
  if (sort === "alphabetical") {
    return [...list].sort((a, b) =>
      (a.value.title ?? "").localeCompare(b.value.title ?? ""),
    )
  }
  return [...list].sort((a, b) => {
    const ac = a.value.createdAt ?? ""
    const bc = b.value.createdAt ?? ""
    return sort === "oldest" ? ac.localeCompare(bc) : bc.localeCompare(ac)
  })
}

/**
 * Extract the author DID from an AT-URI of the form
 * `at://<did>/<collection>/<rkey>`. Returns null on a malformed
 * URI so callers can skip the row's endorsement decoration
 * silently rather than crashing the render.
 */
function projectAuthorDid(p: { uri: string }): string | null {
  if (!p.uri.startsWith("at://")) return null
  const tail = p.uri.slice("at://".length)
  const slash = tail.indexOf("/")
  return slash >= 0 ? tail.slice(0, slash) : null
}
