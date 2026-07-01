import type { Group } from "./types"
import {
  isRouteVisibleToActor,
  pathnameToPersonalOnlyRoute,
} from "./personal-only"

/**
 * Decide where to go after the user switches actor (personal ↔ org)
 * in the account switcher.
 *
 * Default: stay on the current path. The switch should feel like a
 * mode change, not a navigation — the user's reading context is
 * preserved across the swap.
 *
 * Only redirect to /home when the current route is personal-only
 * AND the new actor is an org (so the route would render its "this
 * isn't visible to your org" empty state instead of useful content).
 * The personal-only registry is the single source of truth shared
 * with the nav-visibility helpers, so the two surfaces can't drift.
 */
export function routeForActorSwitch(
  pathname: string | null,
  next: Group | null,
): string {
  if (!pathname) return "/home"
  const routeKey = pathnameToPersonalOnlyRoute(pathname)
  const nextIsOrg = !!next
  if (routeKey && !isRouteVisibleToActor(routeKey, nextIsOrg)) {
    return "/home"
  }
  return pathname
}
