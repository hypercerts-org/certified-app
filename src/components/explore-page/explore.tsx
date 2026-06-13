"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import {
  ArrowUpDown,
  ChevronDown,
  ChevronRight,
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
  type HyperlabelTier,
} from "@/lib/atproto/labels"
import CertIcon from "@/components/ui/cert-icon"
import Input from "@/components/ui/input"
import Checkbox from "@/components/ui/checkbox"
import {
  Popover as UiPopover,
  PopoverContent,
  PopoverItem,
  PopoverTrigger,
} from "@/components/ui/popover"
import LoadingSpinner from "@/components/ui/loading-spinner"
import Tooltip from "@/components/ui/tooltip"
import SegmentedControl, { ToggleGroup } from "@/components/ui/segmented-control"
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
  defaultFilterForView,
  filtersForView,
  parseSubForKind,
  viewFilterToKindFilter,
  type ExploreKind,
  type FilterOption,
  type SortOrder,
} from "./explore-types"
import { useExploreData } from "@/hooks/use-explore"
import { useScrollRestoration } from "@/hooks/use-scroll-restoration"
import { useAuth } from "@/lib/auth/auth-context"
import { useLayoutBreakpoints } from "@/hooks/use-layout-breakpoints"
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
 * Orglabeler tier slugs used in the URL `?orgQuality=` param. These are
 * also the exact kebab-case label values the indexer stores (per issue
 * #145), so a slug is sent straight to the indexer as the org `labels` /
 * `excludeLabels` value — no slug↔value mapping needed. */
const ORG_TIER_SLUGS = ["high-quality", "standard", "likely-test"] as const
type OrgTierSlug = (typeof ORG_TIER_SLUGS)[number]

const ORG_TIER_DISPLAY_LABEL: Record<OrgTierSlug, string> = {
  "high-quality": "High quality",
  standard: "Standard",
  "likely-test": "Likely test",
}

/** Default org-quality set when `?orgQuality=` is missing —
 *  everything except the labels listed in DEFAULT_HIDDEN_ORG_LABELS
 *  (today only "likely-test"). Matches the home feed's policy. */
const DEFAULT_ORG_TIER_SLUGS: readonly OrgTierSlug[] = ORG_TIER_SLUGS.filter(
  (slug) => !DEFAULT_HIDDEN_ORG_LABELS.includes(slug),
)

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
 * Sentinel for an explicitly-empty selection. Without this, a writer
 * that puts `""` into the URL would be normalised away by setUrl
 * (which deletes empty values), and the next read would resolve to
 * the default set — making "deselect all" indistinguishable from "no
 * preference" for the user. We pick `-` because it never collides
 * with a legitimate value across degrees / quality / orgQuality.
 */
const EMPTY_SELECTION_SENTINEL = "-"

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
 * /explore entry point. The page is always the combined "All" view now
 * (the old per-kind top tabs were removed); category switching happens
 * via the on-page dropdown, which drives `?show=`. {@link ExploreAll}
 * branches that into the three-block layout or a single-category pane.
 */
/**
 * URL-backed quality-filter state shared by the single-kind view
 * (`ExploreMain`) and the combined All view (`ExploreAllBlocks`). Owns
 * the `?quality=` (cert / Activity Labeler tiers) and `?orgQuality=`
 * (Orglabeler tiers) params, derives the include/exclude label arrays
 * the loaders pass to the indexer, and exposes the toggle/reset
 * handlers + "is default" flags the popover renders against.
 */
function useQualityFilters() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const router = useRouter()

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

  // Cert quality (Activity Labeler tiers) — INCLUDED set, with the
  // synthetic `unlabeled` sentinel. Missing param = home-feed default
  // (every non-hidden tier + unlabeled).
  const qualityParam = searchParams?.get("quality")
  const qualityIncluded = useMemo<Set<HyperlabelTier | UnlabeledSlug>>(() => {
    if (qualityParam == null) {
      return new Set<HyperlabelTier | UnlabeledSlug>([
        ...HYPERLABEL_TIERS.filter((t) => !DEFAULT_HIDDEN_CERT_LABELS.includes(t)),
        UNLABELED_SLUG,
      ])
    }
    if (qualityParam === EMPTY_SELECTION_SENTINEL) {
      return new Set<HyperlabelTier | UnlabeledSlug>()
    }
    const valid = new Set<string>([...HYPERLABEL_TIERS, UNLABELED_SLUG])
    return new Set(
      qualityParam
        .split(",")
        .filter((v): v is HyperlabelTier | UnlabeledSlug => valid.has(v)),
    )
  }, [qualityParam])
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

  // Org quality (Orglabeler tiers) — same pattern.
  const orgQualityParam = searchParams?.get("orgQuality")
  const orgQualityIncluded = useMemo<Set<OrgTierSlug | UnlabeledSlug>>(() => {
    if (orgQualityParam == null) {
      return new Set<OrgTierSlug | UnlabeledSlug>([
        ...DEFAULT_ORG_TIER_SLUGS,
        UNLABELED_SLUG,
      ])
    }
    if (orgQualityParam === EMPTY_SELECTION_SENTINEL) {
      return new Set<OrgTierSlug | UnlabeledSlug>()
    }
    const valid = new Set<string>([...ORG_TIER_SLUGS, UNLABELED_SLUG])
    return new Set(
      orgQualityParam
        .split(",")
        .filter((v): v is OrgTierSlug | UnlabeledSlug => valid.has(v)),
    )
  }, [orgQualityParam])
  const orgIncludeUnlabeled = orgQualityIncluded.has(UNLABELED_SLUG)
  const excludeOrgLabels = useMemo<readonly OrgTierSlug[] | undefined>(
    () =>
      orgIncludeUnlabeled
        ? ORG_TIER_SLUGS.filter((slug) => !orgQualityIncluded.has(slug))
        : undefined,
    [orgQualityIncluded, orgIncludeUnlabeled],
  )
  const includeOrgLabels = useMemo<readonly OrgTierSlug[] | undefined>(
    () =>
      orgIncludeUnlabeled
        ? undefined
        : ORG_TIER_SLUGS.filter((slug) => orgQualityIncluded.has(slug)),
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

  const onResetQuality = useCallback(() => {
    setUrl({ quality: null, orgQuality: null })
  }, [setUrl])
  const onQualityToggle = useCallback(
    (slug: HyperlabelTier | UnlabeledSlug) => {
      const next = new Set(qualityIncluded)
      if (next.has(slug)) next.delete(slug)
      else next.add(slug)
      const defaultSlugs = new Set<HyperlabelTier | UnlabeledSlug>([
        ...HYPERLABEL_TIERS.filter((t) => !DEFAULT_HIDDEN_CERT_LABELS.includes(t)),
        UNLABELED_SLUG,
      ])
      const isDefault =
        next.size === defaultSlugs.size &&
        Array.from(defaultSlugs).every((s) => next.has(s))
      const ordered: (HyperlabelTier | UnlabeledSlug)[] = [
        ...HYPERLABEL_TIERS.filter((t) => next.has(t)),
        ...(next.has(UNLABELED_SLUG) ? [UNLABELED_SLUG] : []),
      ]
      const value = isDefault
        ? null
        : ordered.length === 0
          ? EMPTY_SELECTION_SENTINEL
          : ordered.join(",")
      setUrl({ quality: value })
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
      const value = isDefault
        ? null
        : ordered.length === 0
          ? EMPTY_SELECTION_SENTINEL
          : ordered.join(",")
      setUrl({ orgQuality: value })
    },
    [orgQualityIncluded, setUrl],
  )

  return {
    qualityIncluded,
    orgQualityIncluded,
    excludeCertLabels,
    includeCertLabels,
    excludeOrgLabels,
    includeOrgLabels,
    qualityIsDefault,
    orgQualityIsDefault,
    onQualityToggle,
    onOrgQualityToggle,
    onResetQuality,
  }
}

type QualityFilters = ReturnType<typeof useQualityFilters>

/**
 * The quality-filter popover (trigger + content). `showCertSection`
 * adds the Activity-quality (cert) section above Account quality — true
 * on the certs single-kind view and on the All view (which includes
 * activities); false on accounts/projects single-kind views, where only
 * the author-org tier applies.
 */
function QualityFilterPopover({
  q,
  showCertSection,
  open,
  onOpenChange,
}: {
  q: QualityFilters
  showCertSection: boolean
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const filtered =
    (showCertSection && !q.qualityIsDefault) || !q.orgQualityIsDefault
  return (
    <UiPopover open={open} onOpenChange={onOpenChange}>
      <Tooltip label="Filter by quality">
        <PopoverTrigger>
          <button
            type="button"
            className={`explore__chrome-btn explore__chrome-btn--icon${
              filtered ? " explore__chrome-btn--active" : ""
            }`}
            aria-label={`Filter by quality${filtered ? " (filtered)" : ""}`}
          >
            <FilterIcon size={13} strokeWidth={1.75} aria-hidden />
          </button>
        </PopoverTrigger>
      </Tooltip>
      <PopoverContent align="end">
        {showCertSection ? (
          <>
            <p className="popover__section-heading">Activity quality</p>
            {HYPERLABEL_DISPLAY_ORDER.map((tier) => (
              <div key={tier} className="popover__item popover__item--check">
                <Checkbox
                  label={HYPERLABEL_DISPLAY_LABELS[tier]}
                  checked={q.qualityIncluded.has(tier)}
                  onChange={() => q.onQualityToggle(tier)}
                />
              </div>
            ))}
            <div className="popover__item popover__item--check">
              <Checkbox
                label={UNLABELED_LABEL}
                checked={q.qualityIncluded.has(UNLABELED_SLUG)}
                onChange={() => q.onQualityToggle(UNLABELED_SLUG)}
              />
            </div>
            <hr className="popover__divider" aria-hidden="true" />
          </>
        ) : null}
        <p className="popover__section-heading">Account quality</p>
        {ORG_TIER_SLUGS.map((slug) => (
          <div key={slug} className="popover__item popover__item--check">
            <Checkbox
              label={ORG_TIER_DISPLAY_LABEL[slug]}
              checked={q.orgQualityIncluded.has(slug)}
              onChange={() => q.onOrgQualityToggle(slug)}
            />
          </div>
        ))}
        <div className="popover__item popover__item--check">
          <Checkbox
            label={UNLABELED_LABEL}
            checked={q.orgQualityIncluded.has(UNLABELED_SLUG)}
            onChange={() => q.onOrgQualityToggle(UNLABELED_SLUG)}
          />
        </div>
        <hr className="popover__divider" aria-hidden="true" />
        <button
          type="button"
          className="popover__reset-btn"
          onClick={q.onResetQuality}
          disabled={(!showCertSection || q.qualityIsDefault) && q.orgQualityIsDefault}
        >
          Reset to default
        </button>
      </PopoverContent>
    </UiPopover>
  )
}

export default function Explore() {
  // Register the page title in the top bar's title slot — mirrors the
  // convention every other top-level page uses (Apps, Settings…).
  usePageTitle("Explore")
  return <ExploreAll />
}

/** Icon component shape shared by lucide icons + the bespoke CertIcon —
 *  used for the All view's per-section headers. */
type SectionIcon = React.ComponentType<{
  size?: number
  strokeWidth?: number
  "aria-hidden"?: boolean
}>

interface ExploreMainProps {
  kind: ExploreKind
  /** Already resolved to the kind-specific filter key. The All view
   *  maps its unified key through `viewFilterToKindFilter` before
   *  passing it here; the single-kind tab passes the URL filter as-is. */
  filter: string
  /** Optional control rendered at the start of the chrome row, before
   *  the sub-dropdown. The All view hosts its category dropdown here. */
  leadingControl?: React.ReactNode
  /** When set, ExploreMain renders the mobile category pill strip inside
   *  the chrome row (with access to sub/setUrl). The All view passes its
   *  current `show` value and `setShow` handler. */
  mobilePillsShow?: AllShow
  mobilePillsSetShow?: (next: AllShow) => void
  /** Render the endorsement-degree control in its compact, low-padding
   *  variant instead of the standalone bar. Used by the All view's
   *  single-category mode (no section header there, so the pills sit
   *  tight under the chrome). */
  compactDegrees?: boolean
}

/**
 * The single-kind chrome + results pane (everything right of the filter
 * sidebar). Shared by the dedicated Activities/Projects/Accounts tabs
 * and by the All view when one category is selected from its dropdown —
 * which is what gives that mode the same sub-dropdown, view toggle,
 * sort, and quality controls as the real tabs. `kind` + `filter` come
 * in as props; everything else (sub / sort / view / quality / degrees /
 * q) is read from and written to the URL.
 */
function ExploreMain({
  kind,
  filter,
  leadingControl,
  mobilePillsShow,
  mobilePillsSetShow,
  compactDegrees,
}: ExploreMainProps) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const router = useRouter()

  const sub = parseSubForKind(kind, searchParams?.get("sub") ?? null)
  const search = searchParams?.get("q") ?? ""
  const sort = parseSort(searchParams?.get("sort") ?? null)
  const view = parseView(searchParams?.get("view") ?? null)
  const { isDesktop } = useLayoutBreakpoints()
  // On mobile always use gallery — denser grid fits more on a small screen.
  const effectiveView: ListGalleryView = isDesktop ? view : "gallery"
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
  // default prod-build pipeline) was hoisting the loop variable out of
  // the per-iteration `.map()` scope and sharing it across every
  // button's onClick. Reading from the DOM dataset is minifier-proof
  // because there's no captured variable. (The sidebar filter buttons
  // use the same pattern; their handler lives in the parent that owns
  // the sidebar.)
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
    // Org-quality filter — used on accounts (filters the actor list)
    // and certs (filters certs whose author org carries the tier).
    excludeOrgLabels:
      kind === "accounts" || kind === "activities" || kind === "projects"
        ? quality.excludeOrgLabels
        : undefined,
    includeOrgLabels:
      kind === "accounts" || kind === "activities" || kind === "projects"
        ? quality.includeOrgLabels
        : undefined,
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

  // Local search debounce: keep typing snappy, hit indexer once typing stops.
  const [localQuery, setLocalQuery] = useState(search)
  // Remember the value we last wrote to the URL so the URL→local
  // sync below can tell our own debounce writes apart from external
  // URL changes (back/forward, filter switch that clears `q`). Without
  // this, the sync effect fires every time we write — and if the user
  // typed an extra keystroke between scheduling the write and the URL
  // commit, that keystroke gets stomped (it shows on screen briefly,
  // then the URL→local sync overwrites localQuery with the older URL
  // value). Symptom: "not all keystrokes are recognised when results
  // come in."
  const lastWroteToUrlRef = useRef<string | null>(null)
  useEffect(() => {
    if (search === lastWroteToUrlRef.current) return
    setLocalQuery(search)
  }, [search])
  useEffect(() => {
    const t = setTimeout(() => {
      if (localQuery !== search) {
        lastWroteToUrlRef.current = localQuery
        setUrl({ q: localQuery || null })
      }
    }, 350)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localQuery])

  const [sortOpen, setSortOpen] = useState(false)
  const [qualityOpen, setQualityOpen] = useState(false)
  const [subPrefixOpen, setSubPrefixOpen] = useState(false)

  return (
    <main className="explore__main">
          {/* Kind switcher (Certs / Projects / Accounts) is now
              rendered as a second row in the top navbar — same
              pattern profile pages use for their tab strip. See
              EXPLORE_TABS in desktop-top-bar.tsx. */}
          <div className="explore__chrome">
            {leadingControl}
            {/* The All view's single-category mode renders the sub-options
                as inline pills below the chrome (see the inline-controls
                row), so the dropdown is suppressed there. */}
            {!compactDegrees && SUB_OPTIONS[kind].length > 0 ? (
              <SubPrefixDropdown
                kind={kind}
                sub={sub}
                viewerDid={viewerDid}
                onSelect={onSubOptionClick}
                open={subPrefixOpen}
                setOpen={setSubPrefixOpen}
              />
            ) : null}

            <div className="explore__search-field">
              <Input
                type="search"
                size="sm"
                leadingIcon={
                  <Search size={14} strokeWidth={1.75} aria-hidden />
                }
                placeholder={searchPlaceholder(kind)}
                value={localQuery}
                onChange={(e) => setLocalQuery(e.target.value)}
                aria-label={searchPlaceholder(kind)}
              />
            </div>

            {mobilePillsShow !== undefined && mobilePillsSetShow ? (
              <AllCategoryPills
                show={mobilePillsShow}
                setShow={mobilePillsSetShow}
                kind={kind}
                sub={sub}
                onSubChange={(nextSub) =>
                  setUrl({ sub: nextSub === "all" ? null : nextSub })
                }
              />
            ) : null}

            <div className="explore__chrome-actions">
              {isDesktop && (
                <SegmentedControl
                  aria-label={`${kind === "activities" ? "Activity" : kind === "projects" ? "Project" : "Account"} view`}
                  value={view}
                  // List is the default view, so selecting it clears the
                  // `?view=` param (keeps the URL clean); Gallery writes
                  // `?view=gallery`. Same mapping the two buttons had.
                  onValueChange={(next) =>
                    setUrl({ view: next === "gallery" ? "gallery" : null })
                  }
                  options={[
                    {
                      value: "list",
                      icon: <ListIcon size={14} strokeWidth={1.75} aria-hidden />,
                      ariaLabel: "List view",
                      tooltip: "List view",
                    },
                    {
                      value: "gallery",
                      icon: (
                        <LayoutGrid size={14} strokeWidth={1.75} aria-hidden />
                      ),
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
                <Tooltip label="Sort">
                  <PopoverTrigger>
                    <button
                      type="button"
                      className="explore__chrome-btn explore__chrome-btn--icon"
                      aria-label="Sort"
                    >
                      <ArrowUpDown
                        size={13}
                        strokeWidth={1.75}
                        aria-hidden
                      />
                    </button>
                  </PopoverTrigger>
                </Tooltip>
                <PopoverContent align="end">
                  {(["newest", "oldest", "alphabetical"] as SortOrder[]).map(
                    (s) => (
                      <PopoverItem
                        key={s}
                        selected={sort === s}
                        data-sort-key={s}
                        onClick={onSortOptionClick}
                      >
                        {SORT_LABEL[s]}
                      </PopoverItem>
                    ),
                  )}
                  <hr className="popover__divider" aria-hidden="true" />
                  <button
                    type="button"
                    className="popover__reset-btn"
                    onClick={onResetSort}
                    disabled={sort === "newest"}
                  >
                    Reset to default
                  </button>
                </PopoverContent>
              </UiPopover>

              {/* Activity + account quality filter — shared with the
                  All view. The cert (Activity Labeler) section shows
                  only on the certs kind; the account (Orglabeler)
                  section shows on every kind. */}
              <QualityFilterPopover
                q={quality}
                showCertSection={kind === "activities"}
                open={qualityOpen}
                onOpenChange={setQualityOpen}
              />
            </div>
          </div>

          {compactDegrees ? (
            // All-view single-category mode: the sub-options (e.g.
            // People / Organizations) and the endorsement-degree pills
            // share one inline row in place of the chrome's sub-dropdown
            // and the standalone degree bar. A light divider separates
            // them when both are present.
            SUB_OPTIONS[kind].length > 0 || showsDegreeControl ? (
              <div className="explore__inline-controls">
                {SUB_OPTIONS[kind].length > 0 ? (
                  <SegmentedControl
                    aria-label={`${kind === "accounts" ? "Account" : "Activity"} sub-category`}
                    value={sub}
                    onValueChange={(next) =>
                      setUrl({ sub: next === "all" ? null : next })
                    }
                    options={SUB_OPTIONS[kind].map((o) => ({
                      value: o.key,
                      label: o.label,
                      disabled: !!o.requiresAuth && !viewerDid,
                    }))}
                    size="sm"
                    shape="pill"
                    joined={false}
                  />
                ) : null}
                {SUB_OPTIONS[kind].length > 0 && showsDegreeControl ? (
                  <span className="explore__inline-divider" aria-hidden="true" />
                ) : null}
                {showsDegreeControl ? (
                  <EndorsementDegreeBar
                    degrees={degrees}
                    onChange={onDegreesChange}
                    onReset={onResetDegrees}
                    meta={data.endorsementClosure}
                    inline
                  />
                ) : null}
              </div>
            ) : null
          ) : showsDegreeControl ? (
            <EndorsementDegreeBar
              degrees={degrees}
              onChange={onDegreesChange}
              onReset={onResetDegrees}
              meta={data.endorsementClosure}
            />
          ) : null}
          <ResultsArea
            kind={kind}
            data={data}
            sort={sort}
            view={effectiveView}
            degrees={showsDegreeControl ? degrees : null}
          />
          {data.hasMore || data.isLoadingMore ? (
            <LoadMoreSentinel
              onLoadMore={data.loadMore}
              isLoading={data.isLoadingMore}
            />
          ) : null}
    </main>
  )
}

/**
 * The filter list in the left rail. Shared by the single-kind browser
 * and the All view — each passes the filter set its view exposes
 * (`filtersForKind` vs the trimmed `filtersForView("all")`). Splits
 * the list into a standard group and a "Featured" group below a
 * divider; the active filter is highlighted. Click handling is hoisted
 * to the parent via `data-filter-key` so the SWC minifier can't share
 * a hoisted loop variable across buttons (see `onFilterButtonClick`).
 */
function ExploreFilterSidebar({
  filters,
  activeFilter,
  onFilterClick,
}: {
  filters: FilterOption[]
  activeFilter: string
  onFilterClick: (e: React.MouseEvent<HTMLButtonElement>) => void
}) {
  const featured = filters.filter((f) => f.featured)
  const standard = filters.filter((f) => !f.featured)
  return (
    <aside className="explore__sidebar" aria-label="Explore filters">
      <ul className="explore__filter-list">
        {standard.map((f) => (
          <li key={f.key}>
            <button
              type="button"
              className={`explore__filter${activeFilter === f.key ? " explore__filter--active" : ""}`}
              data-filter-key={f.key}
              onClick={onFilterClick}
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
                  className={`explore__filter${activeFilter === f.key ? " explore__filter--active" : ""}`}
                  data-filter-key={f.key}
                  onClick={onFilterClick}
                >
                  {f.label}
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </aside>
  )
}

// ----------------------------- All view -------------------------------------

/** How many results each block on the All view shows. The loader still
 *  fetches a full page per kind; we just render the head of each list. */
const ALL_VIEW_BLOCK_SIZE = 5

function isValidViewFilter(filter: string): boolean {
  return filtersForView("all").some((f) => f.key === filter)
}

/** Which category the All view is showing. "all" renders all three
 *  capped blocks; a concrete kind collapses to that one section shown
 *  in full (with pagination). Backed by the `?show=` URL param. */
type AllShow = "all" | ExploreKind

function parseAllShow(v: string | null): AllShow {
  if (v === "activities" || v === "projects" || v === "accounts") return v
  return "all"
}

const SHOW_OPTIONS: { key: AllShow; label: string }[] = [
  { key: "all", label: "All" },
  { key: "activities", label: "Activities" },
  { key: "projects", label: "Projects" },
  { key: "accounts", label: "Accounts" },
]

/** Shared URL state for the All view — the unified sidebar filter, the
 *  `?show=` category, and the writers both All-view modes need. */
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

  const onFilterButtonClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      const key = e.currentTarget.dataset.filterKey
      if (key) setUrl({ filter: key === defaultFilterForView("all") ? null : key })
    },
    [setUrl],
  )

  // Category selection — "all" is the default, so it clears the param.
  const setShow = useCallback(
    (next: AllShow) => setUrl({ show: next === "all" ? null : next }),
    [setUrl],
  )
  const [showOpen, setShowOpen] = useState(false)
  const onShowOptionClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      const key = e.currentTarget.dataset.showKey as AllShow | undefined
      if (key) {
        setShow(key)
        setShowOpen(false)
      }
    },
    [setShow],
  )

  return {
    filter,
    show,
    setUrl,
    onFilterButtonClick,
    setShow,
    showOpen,
    setShowOpen,
    onShowOptionClick,
  }
}

/**
 * Combined "All" view. A category dropdown sits before the search field.
 * Its default ("All") shows the first {@link ALL_VIEW_BLOCK_SIZE} of
 * each kind as its own block (Activities, Projects, Accounts), each
 * ending in a thin "Show all" row. Picking a concrete category — via the
 * dropdown OR a "Show all" row — collapses to that one category, shown
 * with the full single-kind chrome (sub / view / sort / quality) through
 * {@link ExploreMain}. Selection rides the `?show=` URL param.
 *
 * Split so the two modes are separate components: the blocks mode runs
 * three loaders, the single mode runs exactly one (inside ExploreMain).
 * Branching at this boundary keeps the other two loaders from firing
 * wasted queries while a single category is selected.
 */
function ExploreAll() {
  const searchParams = useSearchParams()
  const show = parseAllShow(searchParams?.get("show") ?? null)
  return show === "all" ? <ExploreAllBlocks /> : <ExploreAllSingle show={show} />
}

/** All view, default mode: three capped blocks side by side. */
function ExploreAllBlocks() {
  const {
    filter,
    setUrl,
    onFilterButtonClick,
    setShow,
    showOpen,
    setShowOpen,
    onShowOptionClick,
  } = useAllView()
  const searchParams = useSearchParams()
  const search = searchParams?.get("q") ?? ""
  // Quality filter shared with the single-kind view. The All view
  // always includes the activities block, so it shows both the cert
  // (Activity Labeler) and account (Orglabeler) sections.
  const quality = useQualityFilters()
  const [qualityOpen, setQualityOpen] = useState(false)

  // Search debounce — same pattern as the single-kind view. Keeps
  // typing snappy, hits the indexer once typing stops, and reconciles
  // external URL changes (filter switch / back-forward) into the input.
  const [localQuery, setLocalQuery] = useState(search)
  const lastWroteToUrlRef = useRef<string | null>(null)
  useEffect(() => {
    if (search === lastWroteToUrlRef.current) return
    setLocalQuery(search)
  }, [search])
  useEffect(() => {
    const t = setTimeout(() => {
      if (localQuery !== search) {
        lastWroteToUrlRef.current = localQuery
        setUrl({ q: localQuery || null })
      }
    }, 350)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localQuery])

  // Three independent loaders — one per kind. Each maps the unified
  // All-view filter to that kind's concrete filter key. `sub` is pinned
  // to "all" (the All view has no People/Created sub-toggle).
  const activities = useExploreData({
    kind: "activities",
    filter: viewFilterToKindFilter(filter, "activities"),
    sub: "all",
    search,
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
    // Projects + accounts filter by the author org's tier only.
    excludeOrgLabels: quality.excludeOrgLabels,
    includeOrgLabels: quality.includeOrgLabels,
  })
  const accounts = useExploreData({
    kind: "accounts",
    filter: viewFilterToKindFilter(filter, "accounts"),
    sub: "all",
    search,
    excludeOrgLabels: quality.excludeOrgLabels,
    includeOrgLabels: quality.includeOrgLabels,
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

  return (
    <div className="explore">
      <div className="explore__layout">
        <ExploreFilterSidebar
          filters={filtersForView("all")}
          activeFilter={filter}
          onFilterClick={onFilterButtonClick}
        />

        <main className="explore__main">
          <div className="explore__chrome">
            <span className="explore__category-dropdown">
              <AllCategoryDropdown
                show="all"
                onSelect={onShowOptionClick}
                open={showOpen}
                setOpen={setShowOpen}
              />
            </span>

            <div className="explore__search-field">
              <Input
                type="search"
                size="sm"
                leadingIcon={<Search size={14} strokeWidth={1.75} aria-hidden />}
                placeholder="Search Certified"
                value={localQuery}
                onChange={(e) => setLocalQuery(e.target.value)}
                aria-label="Search Certified"
              />
            </div>

            <AllCategoryPills show="all" setShow={setShow} />

            <div className="explore__chrome-actions">
              <QualityFilterPopover
                q={quality}
                showCertSection
                open={qualityOpen}
                onOpenChange={setQualityOpen}
              />
            </div>
          </div>

          <div className="explore__all">
            <AllSection
              title="Activities"
              icon={CertIcon}
              isLoading={activities.isLoading}
              isEmpty={activityItems.length === 0}
            >
              <ul className="explore__list explore__list--certs">
                {activityItems.map((rec) => {
                  const did = activities.certDids.get(rec.uri) ?? ""
                  return (
                    <li key={rec.uri}>
                      <CertListRow record={rec} did={did} />
                    </li>
                  )
                })}
                <ShowAllRow onClick={() => setShow("activities")} />
              </ul>
            </AllSection>

            <AllSection
              title="Projects"
              icon={FolderGit2}
              isLoading={projects.isLoading}
              isEmpty={projectItems.length === 0}
            >
              <ul className="explore__list explore__list--projects">
                {projectItems.map((p) => (
                  <li key={p.uri}>
                    <ProjectListRow project={p} />
                  </li>
                ))}
                <ShowAllRow onClick={() => setShow("projects")} />
              </ul>
            </AllSection>

            <AllSection
              title="Accounts"
              icon={Users}
              isLoading={accounts.isLoading}
              isEmpty={accountItems.length === 0}
            >
              <ul className="explore__list explore__list--accounts">
                {accountItems.map((a) => (
                  <li key={a.did}>
                    <AccountListRow actor={a} />
                  </li>
                ))}
                <ShowAllRow onClick={() => setShow("accounts")} />
              </ul>
            </AllSection>
          </div>
        </main>
      </div>
    </div>
  )
}

/** All view, single-category mode: the chosen kind rendered with the
 *  full single-kind chrome via {@link ExploreMain}, behind the trimmed
 *  All-view sidebar and the category dropdown. */
function ExploreAllSingle({ show }: { show: ExploreKind }) {
  const {
    filter,
    setShow,
    onFilterButtonClick,
    showOpen,
    setShowOpen,
    onShowOptionClick,
  } = useAllView()
  return (
    <div className="explore">
      <div className="explore__layout">
        <ExploreFilterSidebar
          filters={filtersForView("all")}
          activeFilter={filter}
          onFilterClick={onFilterButtonClick}
        />
        <ExploreMain
          kind={show}
          filter={viewFilterToKindFilter(filter, show)}
          compactDegrees
          leadingControl={
            <span className="explore__category-dropdown">
              <AllCategoryDropdown
                show={show}
                onSelect={onShowOptionClick}
                open={showOpen}
                setOpen={setShowOpen}
              />
            </span>
          }
          mobilePillsShow={show}
          mobilePillsSetShow={setShow}
        />
      </div>
    </div>
  )
}

/** The thin "Show all" row pinned as the last item inside a capped
 *  block's list — collapses the All view to that single category. Lives
 *  inside the bordered list so it reads as the list's final row (no gap
 *  to the rows above). */
function ShowAllRow({ onClick }: { onClick: () => void }) {
  return (
    <li>
      <Tooltip label="Show all" className="w-full">
        <button type="button" className="explore__show-all" onClick={onClick}>
          Show all
          <ChevronRight size={14} strokeWidth={1.75} aria-hidden />
        </button>
      </Tooltip>
    </li>
  )
}

/** Mobile-only pill strip in the filter row — Activities / Projects / Accounts.
 *  When showing all: three plain pills.
 *  When one is selected: that pill becomes a dropdown to switch to the other
 *  two; "Restore default" deselects back to all three. For accounts, also
 *  renders a vertical separator + sub-filter (All / People / Organizations).
 *  Hidden on desktop. */
function AllCategoryPills({
  show,
  setShow,
  kind,
  sub,
  onSubChange,
}: {
  show: AllShow
  setShow: (next: AllShow) => void
  kind?: ExploreKind
  sub?: string
  onSubChange?: (next: string) => void
}) {
  const [categoryOpen, setCategoryOpen] = useState(false)
  const [subOpen, setSubOpen] = useState(false)

  if (show !== "all") {
    const active = SHOW_OPTIONS.find((o) => o.key === show)!
    // Other categories (no "All" — replaced by "Restore default" below)
    const otherCategories = SHOW_OPTIONS.filter(
      (o) => o.key !== show && o.key !== "all",
    )
    const showSubFilter =
      kind === "accounts" && sub !== undefined && onSubChange
    const subOptions = SUB_OPTIONS.accounts
    const activeSub = subOptions.find((o) => o.key === sub) ?? subOptions[0]
    // Exclude "all" from the switch list (replaced by "Show all" button below)
    const otherSubs = subOptions.filter(
      (o) => o.key !== activeSub.key && o.key !== "all",
    )

    return (
      <div className="explore__category-pills">
        <UiPopover open={categoryOpen} onOpenChange={setCategoryOpen}>
          <PopoverTrigger>
            <button
              type="button"
              className="explore__category-pill explore__category-pill--active"
              aria-haspopup="listbox"
              aria-expanded={categoryOpen}
            >
              {active.label}
              <ChevronDown size={12} strokeWidth={1.75} aria-hidden />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start">
            {otherCategories.map((opt) => (
              <PopoverItem
                key={opt.key}
                selected={false}
                onClick={() => {
                  setShow(opt.key)
                  setCategoryOpen(false)
                }}
              >
                {opt.label}
              </PopoverItem>
            ))}
            {otherCategories.length > 0 && (
              <hr className="popover__divider" aria-hidden="true" />
            )}
            <button
              type="button"
              className="popover__reset-btn"
              onClick={() => {
                setShow("all")
                setCategoryOpen(false)
              }}
            >
              Show all
            </button>
          </PopoverContent>
        </UiPopover>

        {showSubFilter && (
          <>
            <span className="explore__category-pills-sep" aria-hidden />
            <UiPopover open={subOpen} onOpenChange={setSubOpen}>
              <PopoverTrigger>
                <button
                  type="button"
                  className={`explore__category-pill${activeSub.key !== "all" ? " explore__category-pill--active" : ""}`}
                  aria-haspopup="listbox"
                  aria-expanded={subOpen}
                >
                  {activeSub.label}
                  <ChevronDown size={12} strokeWidth={1.75} aria-hidden />
                </button>
              </PopoverTrigger>
              <PopoverContent align="start">
                {otherSubs.map((opt) => (
                  <PopoverItem
                    key={opt.key}
                    selected={false}
                    onClick={() => {
                      onSubChange!(opt.key)
                      setSubOpen(false)
                    }}
                  >
                    {opt.label}
                  </PopoverItem>
                ))}
                {activeSub.key !== "all" && (
                  <>
                    <hr className="popover__divider" aria-hidden="true" />
                    <button
                      type="button"
                      className="popover__reset-btn"
                      onClick={() => {
                        onSubChange!("all")
                        setSubOpen(false)
                      }}
                    >
                      Show all
                    </button>
                  </>
                )}
              </PopoverContent>
            </UiPopover>
          </>
        )}
      </div>
    )
  }

  return (
    <div className="explore__category-pills">
      {SHOW_OPTIONS.filter((o) => o.key !== "all").map((opt) => (
        <button
          key={opt.key}
          type="button"
          className="explore__category-pill"
          onClick={() => setShow(opt.key)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

/** Category dropdown that sits before the All view's search field —
 *  All / Activities / Projects / Accounts. Mirrors the single-kind
 *  SubPrefixDropdown's chrome + the data-attr click handoff (so the SWC
 *  minifier can't share a hoisted loop variable across the options). */
function AllCategoryDropdown({
  show,
  onSelect,
  open,
  setOpen,
}: {
  show: AllShow
  onSelect: (e: React.MouseEvent<HTMLButtonElement>) => void
  open: boolean
  setOpen: (next: boolean) => void
}) {
  const active = SHOW_OPTIONS.find((o) => o.key === show) ?? SHOW_OPTIONS[0]
  return (
    <UiPopover open={open} onOpenChange={setOpen}>
      <Tooltip label="Filter by type">
        <PopoverTrigger>
          <button type="button" className="explore__sub-dropdown-trigger">
            <span className="explore__sub-dropdown-label">{active.label}</span>
            <ChevronDown size={13} strokeWidth={1.75} aria-hidden />
          </button>
        </PopoverTrigger>
      </Tooltip>
      <PopoverContent align="start">
        {SHOW_OPTIONS.map((opt) => (
          <PopoverItem
            key={opt.key}
            selected={show === opt.key}
            data-show-key={opt.key}
            onClick={onSelect}
          >
            {opt.label}
          </PopoverItem>
        ))}
      </PopoverContent>
    </UiPopover>
  )
}

/**
 * One block on the All view's default (three-block) layout: an uppercase
 * section heading, then either a spinner (still loading), a muted empty
 * line (no matches), or the result list passed as children. The list
 * itself carries the trailing {@link ShowAllRow}.
 */
function AllSection({
  title,
  icon: Icon,
  isLoading,
  isEmpty,
  children,
}: {
  title: string
  icon: SectionIcon
  isLoading: boolean
  isEmpty: boolean
  children: React.ReactNode
}) {
  return (
    <section className="explore__all-section">
      <div className="explore__all-section-head">
        <h2 className="explore__all-section-title">
          <Icon size={14} strokeWidth={1.75} aria-hidden />
          {title}
        </h2>
      </div>
      {isLoading ? (
        <div className="explore__all-loading">
          <LoadingSpinner size="sm" />
        </div>
      ) : isEmpty ? (
        <p className="explore__all-empty">No {title.toLowerCase()} found</p>
      ) : (
        children
      )}
    </section>
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

/**
 * Multi-select pill row above the result list when the active filter
 * is endorsement-based (Accounts/"endorsed", Projects|Certs/"by-endorsed").
 *
 * Each pill — 1st / 2nd / 3rd — toggles independently so the user can
 * compose any non-empty subset of rings (e.g. show only direct
 * endorsements, or only 3rd-degree connections, or skip the 2nd ring
 * entirely). The caption tracks the current selection.
 *
 * Rendered with the canonical <ToggleGroup> primitive (gapped pills,
 * neutral tone): it owns the aria-pressed buttons + role="group" and
 * emits the full next subset, which we convert back into the
 * `Set<Degree>` the URL serialiser expects. (This also sidesteps the
 * old SWC-minifier closure-capture hazard the data-degree-key hand-roll
 * was working around — the primitive carries no per-button closure.)
 */
function EndorsementDegreeBar({
  degrees,
  onChange,
  onReset,
  meta,
  inline = false,
}: {
  degrees: Set<Degree>
  onChange: (next: Set<Degree>) => void
  onReset: () => void
  meta: ReturnType<typeof useExploreData>["endorsementClosure"]
  /** Compact layout for the All view's single-category section header —
   *  drops the standalone bar's block padding so the pills sit inline
   *  next to the section title. */
  inline?: boolean
}) {
  // Default is {1}. Hide the reset affordance when we're already
  // there so the inline control doesn't read as "active" on a fresh
  // visit.
  const isDefault = degrees.size === 1 && degrees.has(1)
  return (
    <div
      className={`explore__degree-bar${inline ? " explore__degree-bar--inline" : ""}`}
    >
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
    <UiPopover open={open} onOpenChange={setOpen}>
      <Tooltip label={kind === "accounts" ? "Filter accounts" : "Filter by type"}>
        <PopoverTrigger>
          <button type="button" className="explore__sub-dropdown-trigger">
            <span className="explore__sub-dropdown-label">{active.label}</span>
            <ChevronDown size={13} strokeWidth={1.75} aria-hidden />
          </button>
        </PopoverTrigger>
      </Tooltip>
      <PopoverContent align="start">
        {options.map((opt) => {
          const disabled = opt.requiresAuth && !viewerDid
          return (
            <PopoverItem
              key={opt.key}
              disabled={disabled}
              title={disabled ? "Sign in to filter by your role" : undefined}
              className={sub === opt.key ? "font-medium" : ""}
              data-sub-key={opt.key}
              onClick={onSelect}
            >
              {opt.label}
            </PopoverItem>
          )
        })}
      </PopoverContent>
    </UiPopover>
  )
}

function searchPlaceholder(kind: ExploreKind): string {
  if (kind === "accounts") return "Search accounts by name…"
  if (kind === "projects") return "Search projects…"
  return "Search activities…"
}

/** Render whatever the data hook returned, applying client-side sort
 *  and routing through the right card. */
function ResultsArea({
  kind,
  data,
  sort,
  view,
  degrees,
}: {
  kind: ExploreKind
  data: ReturnType<typeof useExploreData>
  sort: SortOrder
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
  certs = sortCerts(certs, sort)
  if (certs.length === 0) return <EmptyResults kind={kind} />

  if (view === "list") {
    return (
      <ul className="explore__list explore__list--certs">
        {certs.map((rec) => {
          const did = certDids.get(rec.uri) ?? ""
          return (
            <li key={rec.uri}>
              <CertListRow record={rec} did={did} />
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
    kind === "accounts" ? "accounts" : kind === "projects" ? "projects" : "activities"
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
