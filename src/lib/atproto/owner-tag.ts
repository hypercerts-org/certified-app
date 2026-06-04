import { parseAtUri } from "./activity-uri"
import { truncateDid } from "@/lib/utils/did"
import type { ManagedIdentity } from "@/hooks/use-managed-authors"
import type { Group, OrgRole } from "@/lib/groups/types"

/**
 * The provenance tag the managed feeds attach to every aggregated
 * record: who owns it (the repo DID that hosts the AT-URI), whether
 * that's the viewer's personal account or one of their groups, and how
 * to label it. Records are owned by their AT-URI repo DID; a group is
 * its own DID, and group-authored records live in the group repo — so
 * the owner of a record is exactly the DID in its URI.
 */
export interface OwnerTag {
  /** The repo DID that owns the record. */
  ownerDid: string
  kind: "personal" | "group"
  /** The viewer's role on the owning group. Undefined for personal. */
  role?: OrgRole
  /** The owning group. Undefined for personal. */
  group?: Group
  /** Display label: "You" for the viewer, displayName || handle for a group. */
  label: string
}

/**
 * Tag a record by its owning DID, given the viewer's managed-identity
 * map (`useManagedAuthors().byDid`) and the viewer's own DID.
 *
 * Resolution:
 *   - Known DID in `byDid` -> reuse that identity's kind/role/group/label.
 *   - `ownerDid === viewerDid` but not in the map -> personal/"You".
 *   - Unknown DID that is NOT the viewer -> a defensive group-shaped tag
 *     labelled with the truncated DID. We never mislabel a stranger's
 *     record as "You"; this branch should not normally fire (the feed is
 *     scoped to the managed author set) so we dev-warn when it does.
 */
export function ownerTagForDid(
  ownerDid: string,
  byDid: Map<string, ManagedIdentity>,
  viewerDid: string | null,
): OwnerTag {
  const identity = byDid.get(ownerDid)
  if (identity) {
    return {
      ownerDid: identity.did,
      kind: identity.kind,
      role: identity.role,
      group: identity.group,
      label: identity.label,
    }
  }

  if (viewerDid && ownerDid === viewerDid) {
    return { ownerDid, kind: "personal", label: "You" }
  }

  if (process.env.NODE_ENV !== "production") {
    console.warn(
      `[owner-tag] DID ${ownerDid} is not in the managed-identity map and is ` +
        `not the viewer (${viewerDid ?? "none"}). Tagging defensively as a ` +
        `group with a truncated-DID label.`,
    )
  }
  // Defensive group-shaped tag — never "You" for a non-viewer DID.
  return { ownerDid, kind: "group", label: truncateDid(ownerDid) }
}

/**
 * Tag a record by its AT-URI. The owner is the repo DID in the URI.
 * On a parse failure we fall back to the viewer's personal identity —
 * an unparseable URI in a viewer-scoped feed is almost certainly the
 * viewer's own malformed record, and "You" is the safe, non-leaking
 * default.
 */
export function ownerTagForUri(
  uri: string,
  byDid: Map<string, ManagedIdentity>,
  viewerDid: string | null,
): OwnerTag {
  const parsed = parseAtUri(uri)
  if (!parsed) {
    if (viewerDid) {
      const identity = byDid.get(viewerDid)
      if (identity) {
        return {
          ownerDid: identity.did,
          kind: identity.kind,
          role: identity.role,
          group: identity.group,
          label: identity.label,
        }
      }
      return { ownerDid: viewerDid, kind: "personal", label: "You" }
    }
    // No viewer to anchor to — return an inert personal tag rather than
    // throwing into the render path.
    return { ownerDid: "", kind: "personal", label: "You" }
  }
  return ownerTagForDid(parsed.did, byDid, viewerDid)
}
