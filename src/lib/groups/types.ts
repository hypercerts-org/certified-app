import type { CertifiedProfile } from "@/lib/atproto/types"
import type { LongDescriptionValue } from "@/lib/leaflet/types"

export interface Group {
  groupDid: string
  handle: string
  displayName?: string
  role: OrgRole
  accepted: boolean
  avatarUrl?: string
}

export interface RemoteMembership {
  groupDid: string
  role: OrgRole
  joinedAt: string
}

export type OrgRole = "owner" | "admin" | "member"

export interface OrgMember {
  did: string
  role: OrgRole
  addedBy: string
  addedAt: string
}

/**
 * State of a group's pending ownership transfer
 * (`app.certified.group.ownershipTransfer.status`, CGS >= 0.6.0).
 *
 * A member who is not a party to a pending transfer receives the same
 * `pending: false` as when none exists — the service makes the two cases
 * indistinguishable on purpose, so don't try to tell them apart.
 */
export type OwnershipTransfer =
  | { groupDid: string; pending: false }
  | {
      groupDid: string
      pending: true
      /** DID of the member proposed as the new owner. */
      proposedOwner: string
      /** DID of the current owner, who proposed the transfer. */
      proposedBy: string
      createdAt: string
      /** 7 days after `createdAt`; a re-propose restarts the window. */
      expiresAt: string
    }

export type OrgProfile = CertifiedProfile

export interface GroupMetadata {
  $type?: "app.certified.actor.organization"
  /** Allow either the legacy `string[]` shape or a single `string` —
   *  the inline-edit flow writes a single string but older records may
   *  still carry the array form. */
  organizationType?: string | string[]
  urls?: OrgUrlItem[]
  /** Location for the org. Three accepted shapes (all round-trip cleanly
   *  through the reader):
   *   - `string`             — free-text name only (no map pin)
   *   - `{ uri, cid }`       — legacy strong-ref to a separate record
   *   - `{ name?, lat, lng }` — coordinates picked on the map; renders
   *                            as a pin in the overview's right column
   */
  location?:
    | string
    | { uri: string; cid: string }
    | { name?: string; lat: number; lng: number }
  foundedDate?: string
  /** Long-form description. The lexicon (app.certified.actor.organization)
   *  defines this as a union of three refs:
   *    - org.hypercerts.defs#descriptionString — plain text / markdown
   *    - pub.leaflet.pages.linearDocument — inline rich text
   *    - com.atproto.repo.strongRef — separate document record
   *  The renderer (`<LeafletDocument>`) handles all three; the
   *  in-app editor (`<LeafletEditor>`) writes the linearDocument
   *  shape, but the field stays read-compatible with legacy strings. */
  longDescription?: LongDescriptionValue
  createdAt: string
}

export interface OrgUrlItem {
  url: string
  label?: string
}

export interface AuditEntry {
  id: string
  actorDid: string
  action: string
  collection?: string
  rkey?: string
  result: "permitted" | "denied"
  detail?: Record<string, unknown>
  createdAt: string
}

