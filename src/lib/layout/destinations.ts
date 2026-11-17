/**
 * The app's destinations, in the one order every navigation surface uses
 * (DESIGN.md §4): the desktop sidebar (app-sidebar.tsx) and the phone pill
 * (bottom-nav.tsx):
 *
 *    Workspace | Network · Apps
 *
 *  - **Workspace**: what your account holds and what you manage (the
 *    Overview at /home, and the Records sections and Groups at /records).
 *    The sidebar lists its sections from 1300px (lib/layout/nav-items).
 *  - **Network**: everyone's work, five pages: Feed, Explore, Graph, Map
 *    and Funding. The sidebar lists them from 1300px; the rail's Network
 *    and the pill's open a menu of them (`network-menu.tsx`).
 *  - **Apps**: other apps that work with the same account.
 *
 * Nothing else is a top-level destination: who you act as, your profile
 * and signing out are the account control's (account-switcher.tsx); Help
 * and Settings sit at the bottom of the sidebar and in the pill's More.
 * Signed-out visitors see Network (without Feed) and Apps. No destination
 * is ever hidden per account: a section a group can't use explains why in
 * place.
 */
export type DestinationKey = "workspace" | "network" | "apps"

export interface Destination {
  readonly key: DestinationKey
  readonly label: string
  readonly href: string
  /** Paths the destination covers (it is current on them and below), when
   *  more than its `href`: Workspace covers /home and /records, Network
   *  its five pages. */
  readonly paths?: readonly string[]
}

export const DESTINATIONS: readonly Destination[] = [
  { key: "workspace", label: "Workspace", href: "/home", paths: ["/home", "/records"] },
  {
    key: "network",
    label: "Network",
    href: "/feed",
    paths: ["/feed", "/explore", "/graph", "/map", "/funding"],
  },
  { key: "apps", label: "Apps", href: "/apps" },
]

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
