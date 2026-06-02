export type ExploreKind = "accounts" | "projects" | "activities"

export type SortOrder = "newest" | "oldest" | "alphabetical"

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

export function filtersForKind(kind: ExploreKind): FilterOption[] {
  if (kind === "accounts") return ACCOUNT_FILTERS
  if (kind === "projects") return PROJECT_FILTERS
  return CERT_FILTERS
}

export function defaultFilterForKind(_kind: ExploreKind): string {
  // Ma Earth is curated as the front door for every kind today.
  // First-load on /explore (no `?filter=` in the URL) lands on this
  // featured set; the All / By me / etc. filters stay one click
  // away in the standard list below the divider.
  return "ma-earth"
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
  activities: [
    { key: "all", label: "All" },
    { key: "created", label: "Created", requiresAuth: true },
    { key: "contributed", label: "Contributed", requiresAuth: true },
  ],
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
