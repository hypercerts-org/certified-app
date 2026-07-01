"use client"

import { useMemo } from "react"
import { useAuth } from "@/lib/auth/auth-context"
import { useOrg } from "@/lib/groups/org-context"
import { ownedOrAdminGroups } from "@/lib/groups/managed"
import type { Group, OrgRole } from "@/lib/groups/types"

/**
 * One identity the viewer reads-and-writes as: their personal account,
 * plus every group they own or admin. `member`-role groups are NOT
 * managed identities — they're excluded entirely.
 */
export interface ManagedIdentity {
  did: string
  kind: "personal" | "group"
  /** The viewer's role on the group. Undefined for the personal identity. */
  role?: OrgRole
  /** The underlying group. Undefined for the personal identity. */
  group?: Group
  /** Display label: "You" for personal, displayName || handle for groups. */
  label: string
}

export interface ManagedAuthorsResult {
  /**
   * DIDs to pass as `authors` to the indexer aggregation calls:
   * `[viewerDid, ...ownerOrAdminGroupDids]`, deduped, viewer first.
   * Empty array when there's no signed-in viewer.
   */
  authors: string[]
  /** The personal identity plus each managed group, viewer first. */
  identities: ManagedIdentity[]
  /** `did -> ManagedIdentity` lookup for owner-tagging records. */
  byDid: Map<string, ManagedIdentity>
  /** True while either auth or the org list is still resolving. */
  isLoading: boolean
}

/**
 * The set of identities the signed-in viewer reads aggregated activity
 * for and can write as: their personal account plus every group where
 * their role is `owner` or `admin`.
 *
 * Freshness is inherited from org-context: `useOrg()` re-runs
 * `resolveGroups` (which carries each group's role) whenever auth or
 * the active org changes, so we deliberately do NOT issue a second
 * role fetch here — we just re-derive in a `useMemo` keyed on
 * `[did, groups]`.
 *
 * Returns an empty author set (and only `isLoading` reflecting the
 * underlying loaders) when there's no signed-in `did`.
 */
export function useManagedAuthors(): ManagedAuthorsResult {
  const { did, isLoading: authLoading } = useAuth()
  const { groups, isLoading: orgLoading } = useOrg()

  return useMemo<ManagedAuthorsResult>(() => {
    if (!did) {
      return {
        authors: [],
        identities: [],
        byDid: new Map(),
        isLoading: authLoading || orgLoading,
      }
    }

    const personal: ManagedIdentity = {
      did,
      kind: "personal",
      label: "You",
    }

    // owner/admin only — member groups are dropped by ownedOrAdminGroups.
    const groupIdentities: ManagedIdentity[] = ownedOrAdminGroups(groups).map(
      (group) => ({
        did: group.groupDid,
        kind: "group",
        role: group.role,
        group,
        label: group.displayName || group.handle,
      }),
    )

    // Viewer first, then groups; dedupe by DID. A group whose DID somehow
    // equals the viewer's (shouldn't happen — a group is its own DID) is
    // collapsed into the personal identity rather than double-counted.
    const seen = new Set<string>()
    const identities: ManagedIdentity[] = []
    for (const identity of [personal, ...groupIdentities]) {
      if (seen.has(identity.did)) continue
      seen.add(identity.did)
      identities.push(identity)
    }

    const byDid = new Map<string, ManagedIdentity>()
    for (const identity of identities) byDid.set(identity.did, identity)

    return {
      authors: identities.map((i) => i.did),
      identities,
      byDid,
      isLoading: authLoading || orgLoading,
    }
  }, [did, groups, authLoading, orgLoading])
}
