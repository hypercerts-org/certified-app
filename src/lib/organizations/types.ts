export interface Organization {
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

export interface OrgProfile {
  $type?: "app.certified.actor.profile"
  displayName?: string
  description?: string
  pronouns?: string
  website?: string
  avatar?: unknown
  banner?: unknown
  createdAt?: string
}

export interface OrgOrganization {
  $type?: "app.certified.actor.organization"
  organizationType?: string[]
  urls?: OrgUrlItem[]
  location?: { uri: string; cid: string }
  foundedDate?: string
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

export interface CreateOrgParams {
  name: string
  handle: string
}
