/**
 * Single source of truth for which nav items are personal-only — i.e.
 * hidden when the user is acting as a group. Centralized so the three
 * nav surfaces (desktop left rail, mobile sidebar, bottom nav) can't
 * drift out of sync as features are added.
 *
 * The constraints are real, not cosmetic:
 *   - "create"       : xrpc proxy validates `repo === sessionDid` for
 *                      write methods, so a group-acting user can't
 *                      write a record to the group repo here.
 *   - "groups"       : would be self-referential when already in a
 *                      group context — the group is reachable via the
 *                      account switcher.
 *   - "endorsements" : the underlying record lives in the personal
 *                      repo only; no group analogue exists.
 */
export type PersonalOnlyRoute = "create" | "groups" | "endorsements"

const PERSONAL_ONLY_ROUTES: readonly PersonalOnlyRoute[] = [
  "create",
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
