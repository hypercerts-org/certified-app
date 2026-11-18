import { DESTINATIONS, isTopLevelPath } from "@/lib/layout/destinations"
import {
  NETWORK_SECTIONS,
  workspaceSectionFor,
  workspaceSectionLabel,
} from "@/lib/layout/nav-items"

/**
 * The phone top bar's title on a top-level page, from the route alone: the
 * navigation's own label for it (a Workspace section, a Network page, Apps,
 * Settings, Help). The page's `<PageHeader>` says the same once it mounts;
 * this lets the server render the bar as it will stand, so the title is
 * there on first paint and the wordmark never swaps for it.
 *
 * `kind` is the `?kind=` of /records (which section is open). Null off the
 * top-level pages.
 */
export function topLevelBarTitle(pathname: string | null, kind: string | null): string | null {
  if (!pathname || !isTopLevelPath(pathname)) return null
  const section = workspaceSectionFor(pathname, kind)
  if (section) return workspaceSectionLabel(section)
  const network = NETWORK_SECTIONS.find((s) => s.href === pathname)
  if (network) return network.label
  const destination = DESTINATIONS.find((d) => d.href === pathname)
  if (destination) return destination.label
  // The sidebar's and the pill's own labels for them.
  if (pathname === "/settings") return "Settings"
  if (pathname === "/help") return "Help"
  return null
}
