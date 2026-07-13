export type ExploreKind = "accounts" | "projects" | "activities" | "funding"

/** The kind switcher in the top bar plus the synthetic "all" tab,
 *  which isn't a real loader kind — it's a combined view that runs the
 *  three per-kind queries side by side. Used for tab + sidebar wiring;
 *  the data hook still only ever sees a concrete `ExploreKind`. */
export type ExploreView = ExploreKind | "all"

export type SortOrder = "newest" | "oldest" | "alphabetical"

export type ListGalleryView = "list" | "gallery"

/** Endorsement-graph ring — 1st / 2nd / 3rd degree. */
export type Degree = 1 | 2 | 3

/** Shared empty set for the funding "Confirmed by" third-party axis when
 *  none are selected (avoids re-allocating on every receipt filter pass). */
export const EMPTY_DID_SET: ReadonlySet<string> = new Set<string>()

export interface FilterOption {
  key: string
  label: string
  /** Whether the filter requires the viewer to be signed in. Used to
   *  disable filters the viewer can't usefully see (e.g. "By me"). */
  requiresAuth?: boolean
  /** Curated featured groups (today only Ma Earth). Renders above the
   *  generic filter list under a "Featured" heading, with a divider
   *  between the two groups. */
  featured?: boolean
}

const FEATURED_FILTERS: FilterOption[] = [
  { key: "ma-earth", label: "Ma Earth", featured: true },
]

const ACCOUNT_FILTERS: FilterOption[] = [
  ...FEATURED_FILTERS,
  { key: "recent", label: "Recently viewed" },
  { key: "my-groups", label: "My organizations", requiresAuth: true },
  { key: "follows", label: "Accounts I follow", requiresAuth: true },
  { key: "endorsed", label: "Endorsed accounts", requiresAuth: true },
  { key: "all", label: "All accounts" },
]

const PROJECT_FILTERS: FilterOption[] = [
  ...FEATURED_FILTERS,
  { key: "recent", label: "Recently viewed" },
  { key: "by-me", label: "My projects", requiresAuth: true },
  { key: "by-follows", label: "Accounts I follow", requiresAuth: true },
  { key: "by-endorsed", label: "Endorsed accounts", requiresAuth: true },
  { key: "all", label: "All projects" },
]

const CERT_FILTERS: FilterOption[] = [
  ...FEATURED_FILTERS,
  { key: "recent", label: "Recently viewed" },
  { key: "by-me", label: "My activities", requiresAuth: true },
  { key: "by-follows", label: "Accounts I follow", requiresAuth: true },
  { key: "by-endorsed", label: "Endorsed accounts", requiresAuth: true },
  { key: "all", label: "All activities" },
]

/** Filters for the combined "All" view. Same building blocks as the
 *  per-kind lists, with two deliberate edits per the All-tab spec:
 *    - the "mine" filters (My activities / My projects / My
 *      organizations) are dropped — the All view is a cross-section
 *      browse/search surface, not a personal-records one;
 *    - the per-kind "All activities" / "All projects" / "All accounts"
 *      collapse to a single "All".
 *  The follows + endorsed keys here are the unified All-view keys;
 *  `viewFilterToKindFilter` maps them to each kind's concrete key. */
const ALL_FILTERS: FilterOption[] = [
  ...FEATURED_FILTERS,
  { key: "recent", label: "Recently viewed" },
  { key: "follows", label: "Accounts I follow", requiresAuth: true },
  { key: "endorsed", label: "Endorsed accounts", requiresAuth: true },
  { key: "all", label: "All" },
]

/** Funding has a single, minimal listing — no social-graph or
 *  Ma-Earth filters (the gate is applied in the loader, not via the
 *  sidebar). Just "All funding". */
const FUNDING_FILTERS: FilterOption[] = [
  { key: "all", label: "All funding" },
]

export function filtersForKind(kind: ExploreKind): FilterOption[] {
  if (kind === "accounts") return ACCOUNT_FILTERS
  if (kind === "projects") return PROJECT_FILTERS
  if (kind === "funding") return FUNDING_FILTERS
  return CERT_FILTERS
}

export function filtersForView(view: ExploreView): FilterOption[] {
  if (view === "all") return ALL_FILTERS
  return filtersForKind(view)
}

export function defaultFilterForKind(kind: ExploreKind): string {
  // Funding has no curated Ma Earth front door — its only filter is the
  // plain "all" listing, so default there.
  if (kind === "funding") return "all"
  // Ma Earth is curated as the front door for every other kind today.
  // First-load on /explore (no `?filter=` in the URL) lands on this
  // featured set; the All / By me / etc. filters stay one click
  // away in the standard list below the divider.
  return "ma-earth"
}

export function defaultFilterForView(view: ExploreView): string {
  // The All view defaults to "All" rather than the curated Ma Earth
  // front door the single-kind tabs use: a search on the All tab
  // should hit the whole index, not just the curated set.
  if (view === "all") return "all"
  return defaultFilterForKind(view)
}

/**
 * Map a unified All-view filter key to the concrete per-kind filter
 * key the loader (`useExploreData`) expects. Most keys are shared
 * across kinds (`ma-earth`, `recent`, `all`); only the social-graph
 * filters diverge — accounts use `follows` / `endorsed`, while
 * projects and certs use `by-follows` / `by-endorsed`.
 */
export function viewFilterToKindFilter(
  filter: string,
  kind: ExploreKind,
): string {
  switch (filter) {
    case "follows":
      return kind === "accounts" ? "follows" : "by-follows"
    case "endorsed":
      return kind === "accounts" ? "endorsed" : "by-endorsed"
    case "ma-earth":
    case "recent":
    case "all":
      return filter
    default:
      return "all"
  }
}

// ---------------------------------------------------------------------------
// Sub-category (second segmented row in the sidebar, under the kind switcher)
// ---------------------------------------------------------------------------

/** Options shown in the sub-category row per kind. Empty array =
 *  don't render the row at all. */
export const SUB_OPTIONS: Record<
  ExploreKind,
  { key: string; label: string; requiresAuth?: boolean }[]
> = {
  accounts: [
    { key: "all", label: "All" },
    { key: "people", label: "People" },
    { key: "organizations", label: "Organizations" },
  ],
  projects: [],
  // Activities have no sub-toggle — the "Created" / "Contributed"
  // options were removed; an empty list renders no sub-pills.
  activities: [],
  // Funding is a flat list — no sub-categories.
  funding: [],
}

function defaultSubForKind(): string {
  return "all"
}

export function parseSubForKind(kind: ExploreKind, v: string | null): string {
  if (!v) return defaultSubForKind()
  const opts = SUB_OPTIONS[kind]
  if (opts.some((o) => o.key === v)) return v
  return defaultSubForKind()
}
