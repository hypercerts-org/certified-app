export type ExploreKind = "accounts" | "projects" | "certs"

export type AccountFilter =
  | "recent"
  | "follows"
  | "endorsed"
  | "new"
  | "all"

export type ProjectFilter =
  | "recent"
  | "by-me"
  | "by-follows"
  | "by-endorsed"
  | "all"
  | "trending"

export type CertFilter =
  | "recent"
  | "by-me"
  | "by-follows"
  | "by-endorsed"
  | "all"

export type SortOrder = "newest" | "oldest" | "alphabetical"

export interface FilterOption {
  key: string
  label: string
  /** Whether the filter requires the viewer to be signed in. Used to
   *  disable filters the viewer can't usefully see (e.g. "By me"). */
  requiresAuth?: boolean
}

export const ACCOUNT_FILTERS: FilterOption[] = [
  { key: "recent", label: "Recently viewed" },
  { key: "follows", label: "My follows", requiresAuth: true },
  { key: "endorsed", label: "I endorsed", requiresAuth: true },
  { key: "new", label: "New on the network" },
  { key: "all", label: "All accounts" },
]

export const PROJECT_FILTERS: FilterOption[] = [
  { key: "recent", label: "Recently viewed" },
  { key: "by-me", label: "My projects", requiresAuth: true },
  { key: "by-follows", label: "Users I follow", requiresAuth: true },
  { key: "by-endorsed", label: "Endorsed users", requiresAuth: true },
  { key: "trending", label: "Trending" },
  { key: "all", label: "All projects" },
]

export const CERT_FILTERS: FilterOption[] = [
  { key: "recent", label: "Recently viewed" },
  { key: "by-me", label: "My certs", requiresAuth: true },
  { key: "by-follows", label: "Users I follow", requiresAuth: true },
  { key: "by-endorsed", label: "Endorsed users", requiresAuth: true },
  { key: "all", label: "All certs" },
]

export function filtersForKind(kind: ExploreKind): FilterOption[] {
  if (kind === "accounts") return ACCOUNT_FILTERS
  if (kind === "projects") return PROJECT_FILTERS
  return CERT_FILTERS
}

export function defaultFilterForKind(kind: ExploreKind): string {
  if (kind === "accounts") return "all"
  if (kind === "projects") return "all"
  return "all"
}

// ---------------------------------------------------------------------------
// Sub-category (second segmented row in the sidebar, under the kind switcher)
// ---------------------------------------------------------------------------

export type AccountSub = "all" | "people" | "organizations"
export type CertSub = "all" | "created" | "contributed"
export type ProjectSub = "all"
export type SubCategory = AccountSub | CertSub | ProjectSub

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
  certs: [
    { key: "all", label: "All" },
    { key: "created", label: "Created", requiresAuth: true },
    { key: "contributed", label: "Contributed", requiresAuth: true },
  ],
}

export function defaultSubForKind(kind: ExploreKind): string {
  return "all"
}

export function parseSubForKind(kind: ExploreKind, v: string | null): string {
  if (!v) return defaultSubForKind(kind)
  const opts = SUB_OPTIONS[kind]
  if (opts.some((o) => o.key === v)) return v
  return defaultSubForKind(kind)
}
