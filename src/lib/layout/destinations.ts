import {
  Compass,
  FolderOpen,
  House,
  LayoutGrid,
  Newspaper,
  type LucideIcon,
} from "lucide-react"

/**
 * The app's five destinations, in the one order every navigation surface
 * uses (DESIGN.md §4): the desktop top bar and the phone bottom tab bar.
 * Nothing else is a top-level destination; Profile, Settings and Help live
 * in the account menu.
 *
 * Signed-out visitors see only the public ones (Explore and Apps). No
 * destination is ever hidden per account: a page a group can't use (Records)
 * explains why in place.
 */
export type DestinationKey = "home" | "feed" | "explore" | "records" | "apps"

export interface Destination {
  readonly key: DestinationKey
  readonly label: string
  readonly href: string
  readonly icon: LucideIcon
  /** Shown to signed-out visitors too. */
  readonly isPublic: boolean
  /** `data-tour` anchor for the product tour. */
  readonly tour: string
}

export const DESTINATIONS: readonly Destination[] = [
  { key: "home", label: "Home", href: "/home", icon: House, isPublic: false, tour: "nav-home" },
  { key: "feed", label: "Feed", href: "/feed", icon: Newspaper, isPublic: false, tour: "nav-feed" },
  { key: "explore", label: "Explore", href: "/explore", icon: Compass, isPublic: true, tour: "nav-explore" },
  { key: "records", label: "Records", href: "/records", icon: FolderOpen, isPublic: false, tour: "nav-records" },
  { key: "apps", label: "Apps", href: "/apps", icon: LayoutGrid, isPublic: true, tour: "nav-apps" },
]

/** The destinations to show: all five signed in, the public two signed out. */
export function destinationsFor(isAuthenticated: boolean): readonly Destination[] {
  return isAuthenticated ? DESTINATIONS : DESTINATIONS.filter((d) => d.isPublic)
}

/** True when `pathname` is the destination or a page under it. */
export function isDestinationActive(
  destination: Pick<Destination, "href">,
  pathname: string | null,
): boolean {
  if (!pathname) return false
  return pathname === destination.href || pathname.startsWith(`${destination.href}/`)
}

/**
 * Pages that are a place of their own rather than a detail of something
 * else. On phones their top bar shows the brandmark (not a back chevron),
 * the New button and the account button. The user's own profile counts too;
 * the navbar checks that separately because it depends on the session.
 */
const TOP_LEVEL_PATHS: ReadonlySet<string> = new Set([
  ...DESTINATIONS.map((d) => d.href),
  "/settings",
  "/help",
])

export function isTopLevelPath(pathname: string | null): boolean {
  return !!pathname && TOP_LEVEL_PATHS.has(pathname)
}
