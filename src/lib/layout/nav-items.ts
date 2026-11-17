import {
  Compass,
  FolderGit2,
  HandCoins,
  LayoutDashboard,
  ListChecks,
  MapIcon,
  Network,
  Newspaper,
  ThumbsUp,
  Users,
  UsersRound,
  type LucideIcon,
} from "lucide-react"

/**
 * The pages the navigation lists, shared by the desktop sidebar, the
 * Workspace's in-page side list, the Network menu and the Records page.
 */

// ---------------------------------------------------------------------------
// Workspace
// ---------------------------------------------------------------------------

/**
 * The Workspace's sections, in list order: the Overview (`/home`) and the
 * sections that manage what the account holds (`/records?kind=…`).
 * "activities" is the projects-and-activities folder view (the key keeps
 * existing `?kind=activities` links working).
 */
export type WorkspaceSection =
  | "overview"
  | "activities"
  | "endorsements"
  | "followers"
  | "lists"
  | "groups"

export const WORKSPACE_SECTIONS: readonly {
  key: WorkspaceSection
  label: string
  href: string
  icon: LucideIcon
}[] = [
  { key: "overview", label: "Overview", href: "/home", icon: LayoutDashboard },
  {
    key: "activities",
    label: "Projects and activities",
    href: "/records?kind=activities",
    icon: FolderGit2,
  },
  { key: "endorsements", label: "Endorsements", href: "/records?kind=endorsements", icon: ThumbsUp },
  { key: "followers", label: "Followers", href: "/records?kind=followers", icon: Users },
  { key: "lists", label: "Lists", href: "/records?kind=lists", icon: ListChecks },
  { key: "groups", label: "Groups", href: "/records?kind=groups", icon: UsersRound },
]

/** The label of a Workspace section, for page titles. */
export function workspaceSectionLabel(section: WorkspaceSection): string {
  return WORKSPACE_SECTIONS.find((s) => s.key === section)?.label ?? "Workspace"
}

/** The sections the Records page renders (the Overview is /home). */
export type RecordKind = Exclude<WorkspaceSection, "overview">

const RECORD_KINDS: readonly RecordKind[] = WORKSPACE_SECTIONS.map((s) => s.key).filter(
  (k): k is RecordKind => k !== "overview",
)

/** The Records section a `?kind=` value opens. The old Following section
 *  is now a tab of Followers; anything unknown opens the first section. */
export function parseRecordKind(value: string | null): RecordKind {
  if (value === "following") return "followers"
  return (RECORD_KINDS as readonly string[]).includes(value ?? "")
    ? (value as RecordKind)
    : "activities"
}

/** The Workspace section a page is, or null outside the Workspace. */
export function workspaceSectionFor(
  pathname: string | null,
  kind: string | null,
): WorkspaceSection | null {
  if (pathname === "/home") return "overview"
  if (pathname === "/records") return parseRecordKind(kind)
  return null
}

// ---------------------------------------------------------------------------
// Network
// ---------------------------------------------------------------------------

/** The Network's pages, in menu order. */
export type NetworkSection = "feed" | "explore" | "graph" | "map" | "funding"

export const NETWORK_SECTIONS: readonly {
  key: NetworkSection
  label: string
  href: string
  icon: LucideIcon
  /** Signed-in only (the Feed follows your account). */
  requiresAuth?: boolean
}[] = [
  { key: "feed", label: "Feed", href: "/feed", icon: Newspaper, requiresAuth: true },
  { key: "explore", label: "Explore", href: "/explore", icon: Compass },
  { key: "graph", label: "Graph", href: "/graph", icon: Network },
  { key: "map", label: "Map", href: "/map", icon: MapIcon },
  { key: "funding", label: "Funding", href: "/funding", icon: HandCoins },
]

/** The Network pages a viewer sees: no Feed signed out. */
export function networkSectionsFor(isAuthenticated: boolean) {
  return NETWORK_SECTIONS.filter((s) => !s.requiresAuth || isAuthenticated)
}

/** The Network page `pathname` is on, if any. */
export function networkSectionFor(pathname: string | null): NetworkSection | null {
  if (!pathname) return null
  return (
    NETWORK_SECTIONS.find((s) => pathname === s.href || pathname.startsWith(`${s.href}/`))?.key ??
    null
  )
}
