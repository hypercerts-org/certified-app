/**
 * Single source of truth for which routes are personal-only — i.e. the
 * Workspace menu leaves them (for /home) when you switch to acting as a
 * group, and the few remaining surfaces that gate on them hide the entry.
 *
 * The primary navigation (Home, Feed, Explore, Records, Apps) never hides
 * a destination per account: a page that a group can't use explains why
 * in place instead (Records does this).
 *
 * The constraints are real, not cosmetic:
 *   - "groups"       : would be self-referential when already in a
 *                      group context — the group is reachable via the
 *                      account menu.
 *
 * Not listed:
 *   - Records stays reachable while acting as a group, so switching
 *     accounts on /records doesn't redirect: Endorsements shows the
 *     group's own (read for its DID, written as the group); the other
 *     sections say where the group's records are. Followers are on the
 *     profile.
 *   - `/endorsements` (retired; it redirects to Records → Endorsements),
 *     which a group has too.
 *   - Create (`/create`): a group can create activities; the create flow
 *     writes as the group being acted as. Switching accounts on /create
 *     keeps the form. "create" stays in the type so existing callers that
 *     ask about it get `true`.
 */
export type PersonalOnlyRoute = "create" | "groups"

const PERSONAL_ONLY_ROUTES: readonly PersonalOnlyRoute[] = ["groups"]

/**
 * Returns true when `route` should be shown in the nav. Takes the
 * caller's "are we acting as a group?" boolean rather than reading
 * the OrgContext so the helper stays pure / testable.
 */
export function isRouteVisibleToActor(
  route: PersonalOnlyRoute,
  isActingAsOrg: boolean,
): boolean {
  if (!isActingAsOrg) return true
  return !PERSONAL_ONLY_ROUTES.includes(route)
}

/**
 * Classify a pathname against the personal-only registry. Returns
 * the matching route key (so callers can pass it to
 * `isRouteVisibleToActor`) or null when the route is allowed for any
 * actor (profile views, search, home, records, create, etc.).
 *
 * Used by the actor switcher to decide whether to stay on the user's
 * current pathname after a persona switch, or redirect to /home
 * because the new persona can't visit the current route.
 */
export function pathnameToPersonalOnlyRoute(
  pathname: string,
): PersonalOnlyRoute | null {
  if (pathname === "/groups" || pathname.startsWith("/groups/")) return "groups"
  return null
}
