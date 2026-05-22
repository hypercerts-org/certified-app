export type ExploreKind = "users" | "projects" | "certs"

export type UserFilter =
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
  | "by-contributor"
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

export const USER_FILTERS: FilterOption[] = [
  { key: "recent", label: "Recently viewed" },
  { key: "follows", label: "My follows", requiresAuth: true },
  { key: "endorsed", label: "I endorsed", requiresAuth: true },
  { key: "new", label: "New on the network" },
  { key: "all", label: "All users" },
]

export const PROJECT_FILTERS: FilterOption[] = [
  { key: "recent", label: "Recently viewed" },
  { key: "by-me", label: "By me", requiresAuth: true },
  { key: "by-follows", label: "By my follows", requiresAuth: true },
  { key: "by-endorsed", label: "By people I endorsed", requiresAuth: true },
  { key: "trending", label: "Trending" },
  { key: "all", label: "All projects" },
]

export const CERT_FILTERS: FilterOption[] = [
  { key: "recent", label: "Recently viewed" },
  { key: "by-me", label: "By me", requiresAuth: true },
  { key: "by-contributor", label: "I contributed to", requiresAuth: true },
  { key: "by-follows", label: "By my follows", requiresAuth: true },
  { key: "by-endorsed", label: "By people I endorsed", requiresAuth: true },
  { key: "all", label: "All certs" },
]

export function filtersForKind(kind: ExploreKind): FilterOption[] {
  if (kind === "users") return USER_FILTERS
  if (kind === "projects") return PROJECT_FILTERS
  return CERT_FILTERS
}

export function defaultFilterForKind(kind: ExploreKind): string {
  if (kind === "users") return "all"
  if (kind === "projects") return "all"
  return "all"
}
