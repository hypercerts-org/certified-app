import type { Group, OrgRole } from "./types"
import {
  isRouteVisibleToActor,
  pathnameToPersonalOnlyRoute,
} from "./personal-only"

/**
 * Decide where to go after the user switches actor (personal ↔ org)
 * in the account menu.
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

/** Display order of roles in the Workspace menu: the groups you run first. */
const ROLE_ORDER: Record<OrgRole, number> = { owner: 0, admin: 1, member: 2 }

/**
 * The groups list as the Workspace menu shows it: accepted memberships
 * first, then by role (owner, admin, member), then by name. Returns a new
 * array; the input is not mutated.
 */
export function sortGroupsForSwitcher(groups: readonly Group[]): Group[] {
  return [...groups].sort((a, b) => {
    if (a.accepted !== b.accepted) return a.accepted ? -1 : 1
    const roleA = ROLE_ORDER[a.role] ?? 3
    const roleB = ROLE_ORDER[b.role] ?? 3
    if (roleA !== roleB) return roleA - roleB
    const nameA = (a.displayName || a.handle).toLowerCase()
    const nameB = (b.displayName || b.handle).toLowerCase()
    return nameA.localeCompare(nameB)
  })
}
