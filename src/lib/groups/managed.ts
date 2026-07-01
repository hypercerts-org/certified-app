import type { Group } from "./types"

/**
 * Org-identity aggregation: which groups' records fold into a viewer's
 * "My projects" / "My activities".
 *
 * A viewer "manages" a group when their role on it is `owner` or `admin`
 * — `member` is read/participate-only and does NOT fold the group's
 * records into the viewer's surfaces. This module is the single place
 * that encodes that rule so every surface (Home, explore, profile)
 * aggregates the same author set.
 *
 * `accepted` is intentionally NOT part of the predicate: a pending
 * (unaccepted) owner/admin invite still confers management for the
 * read-aggregation surfaces. If a caller needs accepted-only groups it
 * should filter `group.accepted` itself on top of this.
 */

/** Roles that confer org-management. `member` is excluded by design. */
const MANAGING_ROLES = new Set(["owner", "admin"])

/**
 * Filter a list of groups down to the ones the viewer owns or
 * administers. Pure — safe to call outside React. Preserves input
 * order so callers control sort.
 */
export function ownedOrAdminGroups(groups: Group[]): Group[] {
  return groups.filter((g) => MANAGING_ROLES.has(g.role))
}

/**
 * The "My X" author set for aggregated record listings (Home sidebar,
 * profile tabs, explore "My projects" / "My activities"). Pure — safe to
 * call outside React.
 *
 *   - Acting as a group (`activeOrg` set) → just that group's records
 *     (unchanged "viewing as" behaviour).
 *   - Personal context → the viewer's own records PLUS every group they
 *     OWN or ADMIN (member-role groups excluded), viewer DID first and
 *     deduped, so group-owned records surface under "My X" attributed to
 *     the owning group.
 *
 * Empty when there's no signed-in `personalDid` and no active group.
 */
export function managedAuthorDids(
  activeOrg: Group | null,
  personalDid: string | null,
  groups: Group[],
): string[] {
  if (activeOrg) return [activeOrg.groupDid]
  if (!personalDid) return []
  const groupDids = ownedOrAdminGroups(groups).map((g) => g.groupDid)
  return [personalDid, ...groupDids.filter((d) => d !== personalDid)]
}
