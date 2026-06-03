"use client"

import { useMemo } from "react"
import { useOrg } from "./org-context"
import type { Group } from "./types"

/**
 * Org-identity gate + filter source.
 *
 * A viewer "manages" a group when their role on it is `owner` or
 * `admin` — `member` is read/participate-only and does NOT grant the
 * org-aggregation surfaces (the managed feeds, the org-as-author write
 * affordances, etc.). This module is the single place that encodes that
 * rule so the nav gating and the data layer can't drift apart.
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
 * Nav-gating hook: true when the viewer owns or admins at least one
 * group. Used to decide whether org-identity surfaces (managed feeds,
 * the org switcher's "act as org" affordances) should appear at all.
 *
 * Re-derives from `useOrg().groups`, so it tracks org-context refreshes
 * (role changes, accepted invites) without a second fetch.
 */
export function useManagesAnyGroup(): boolean {
  const { groups } = useOrg()
  return useMemo(() => ownedOrAdminGroups(groups).length > 0, [groups])
}
