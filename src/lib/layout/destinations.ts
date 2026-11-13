import { FolderOpen, Globe, LayoutGrid, type LucideIcon } from "lucide-react"

/**
 * The app's destinations, in the one order every navigation surface uses
 * (DESIGN.md §4): the desktop top bar and the phone bottom tab bar:
 *
 *    Workspace | Network · Apps
 *
 *  - **Workspace**: what your account holds and what you manage (the
 *    Overview at /home, and the Records sections and Groups at /records),
 *    behind one side list (`WorkspaceShell`).
 *  - **Network**: everyone's work, as four tabs (`NetworkNav`): Feed,
 *    Explore, Graph and Map. It opens on Feed (Explore when signed out).
 *  - **Apps**: other apps that work with the same account.
 *
 * Nothing else is a top-level destination; Profile, Settings and Help live
 * in the account menu. Signed-out visitors see only the public ones
 * (Network, opening on Explore, and Apps). No destination is ever hidden per account: a section
 * a group can't use explains why in place.
 */
export type DestinationKey = "workspace" | "network" | "apps"

export type DestinationGroup = "workspace" | "network"

export interface Destination {
  readonly key: DestinationKey
  readonly label: string
  readonly href: string
  /** Paths the destination covers (it is current on them and below), when
   *  more than its `href`: Workspace covers /home and /records, Network
   *  its four tabs. */
  readonly paths?: readonly string[]
  readonly group: DestinationGroup
  readonly icon: LucideIcon
  /** Shown to signed-out visitors too. */
  readonly isPublic: boolean
  /** `data-tour` anchor for the product tour. */
  readonly tour: string
}

export const DESTINATIONS: readonly Destination[] = [
  {
    key: "workspace",
    label: "Workspace",
    href: "/home",
    paths: ["/home", "/records"],
    group: "workspace",
    icon: FolderOpen,
    isPublic: false,
    tour: "nav-workspace",
  },
  {
    key: "network",
    label: "Network",
    href: "/feed",
    paths: ["/feed", "/explore", "/graph", "/map"],
    group: "network",
    icon: Globe,
    isPublic: true,
    tour: "nav-network",
  },
  // Apps sits beside Network, after the divider, as its own destination.
  { key: "apps", label: "Apps", href: "/apps", group: "network", icon: LayoutGrid, isPublic: true, tour: "nav-apps" },
]

/** Where Network opens for signed-out visitors: Feed follows your account. */
const NETWORK_PUBLIC_HREF = "/explore"

/**
 * The destinations to show: all of them signed in; signed out, the public
 * ones (Network, opening on Explore, and Apps).
 */
export function destinationsFor(isAuthenticated: boolean): readonly Destination[] {
  if (isAuthenticated) return DESTINATIONS
  return DESTINATIONS.filter((d) => d.isPublic).map((d) =>
    d.key === "network" ? { ...d, href: NETWORK_PUBLIC_HREF } : d,
  )
}

/** True when `pathname` is one of the destination's paths or a page under one. */
export function isDestinationActive(
  destination: Pick<Destination, "href"> & { paths?: readonly string[] },
  pathname: string | null,
): boolean {
  if (!pathname) return false
  return (destination.paths ?? [destination.href]).some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  )
}

/**
 * Pages that are a place of their own rather than a detail of something
 * else. On phones their top bar starts with the wordmark; every other page
 * gets a back chevron there instead, PageHeader or not. The user's own
 * profile counts too; the navbar checks that separately because it depends
 * on the session.
 */
const TOP_LEVEL_PATHS: ReadonlySet<string> = new Set([
  ...DESTINATIONS.flatMap((d) => d.paths ?? [d.href]),
  "/settings",
  "/help",
])

export function isTopLevelPath(pathname: string | null): boolean {
  return !!pathname && TOP_LEVEL_PATHS.has(pathname)
}
