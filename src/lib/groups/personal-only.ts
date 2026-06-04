/**
 * Single source of truth for which nav items are personal-only — i.e.
 * hidden when the user is acting as a group. Centralized so the three
 * nav surfaces (desktop left rail, mobile sidebar, bottom nav) can't
 * drift out of sync as features are added.
 *
 * The constraints are real, not cosmetic:
 *   - "groups"       : would be self-referential when already in a
 *                      group context — the group is reachable via the
 *                      account switcher.
 *   - "endorsements" : the underlying record lives in the personal
 *                      repo only; no group analogue exists.
 *
 * Note: "create" used to live here because the write target was derived
 * from the (sticky) active org, which the xrpc proxy then rejected as a
 * cross-repo write. As of the per-action posting-as model the Create
 * flow chooses its write target explicitly via `<PostingAs>` (default
 * You, opt into a group through the picker / group BFF), so Create is
 * available regardless of the active read-scope. It is therefore no
 * longer personal-only — the route key is kept in the union so existing
 * callers/tests that reference it still type-check.
 */
export type PersonalOnlyRoute = "create" | "groups" | "endorsements"

const PERSONAL_ONLY_ROUTES: readonly PersonalOnlyRoute[] = [
  "groups",
  "endorsements",
]

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
 * actor (profile views, search, home, etc.).
 *
 * Used by the actor switcher to decide whether to stay on the user's
 * current pathname after a persona switch, or redirect to /home
 * because the new persona can't visit the current route.
 */
export function pathnameToPersonalOnlyRoute(
  pathname: string,
): PersonalOnlyRoute | null {
  if (pathname === "/create" || pathname.startsWith("/create/")) return "create"
  if (pathname === "/groups" || pathname.startsWith("/groups/")) return "groups"
  if (pathname === "/endorsements" || pathname.startsWith("/endorsements/")) {
    return "endorsements"
  }
  return null
}
