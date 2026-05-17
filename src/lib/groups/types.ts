import type { CertifiedProfile } from "@/lib/atproto/types"

export interface Group {
  groupDid: string
  handle: string
  displayName?: string
  role: OrgRole
  accepted: boolean
  avatarUrl?: string
  rkey?: string
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
  /** Long-form description (multi-line). Separate from the short
   *  `description` field on the profile record. */
  longDescription?: string
  createdAt: string
}

export interface OrgUrlItem {
  url: string
  label?: string
}

export interface MembershipRecord {
  $type: "app.certified.actor.membership"
  groupDid: string
  role: OrgRole
  joinedAt: string
  /** The record key (TID), extracted from the AT URI after listing. */
  rkey?: string
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

