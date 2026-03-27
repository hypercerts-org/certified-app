import { authFetch } from "@/lib/auth/fetch"
import { resolveHandle, resolvePdsUrl } from "@/lib/atproto/did"
import { getAvatarUrl } from "@/lib/atproto/profile"
import type { CertifiedProfile } from "@/lib/atproto/types"
import type {
  Organization,
  OrgProfile,
  OrgOrganization,
  OrgMember,
  AuditEntry,
  MembershipRecord,
  OrgRole,
  RemoteMembership,
} from "./types"
import { ORG_MEMBERSHIP_COLLECTION } from "./constants"

// ─── Membership records (stored in user's own PDS) ───────────────────

/**
 * List all membership records from the current user's PDS.
 * Each record represents an organization the user belongs to.
 */
export async function listMemberships(
  did: string,
  signal?: AbortSignal
): Promise<MembershipRecord[]> {
  const res = await authFetch(
    `/api/xrpc/com/atproto/repo/listRecords?repo=${encodeURIComponent(did)}&collection=${encodeURIComponent(ORG_MEMBERSHIP_COLLECTION)}&limit=100`,
    { signal }
  )
  if (!res.ok) {
    if (res.status === 400 || res.status === 404) return []
    throw new Error(`Failed to list memberships: ${res.statusText}`)
  }
  const data = await res.json()
  return (data.records || []).map(
    (r: { value: MembershipRecord; uri: string }) => ({
      ...r.value,
      rkey: r.uri.split("/").pop(),
    })
  )
}

/**
 * Create a membership record in the user's PDS.
 */
export async function putMembership(
  did: string,
  groupDid: string,
  role: OrgRole
): Promise<void> {
  // Use a stable rkey derived from the group DID
  const rkey = groupDid.replace(/[^a-zA-Z0-9]/g, "-")
  const record: MembershipRecord = {
    $type: "app.certified.actor.membership",
    groupDid,
    role,
    joinedAt: new Date().toISOString(),
  }
  const res = await authFetch("/api/xrpc/com/atproto/repo/putRecord", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      repo: did,
      collection: ORG_MEMBERSHIP_COLLECTION,
      rkey,
      record,
    }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(
      (data as { error?: string }).error || "Failed to save membership"
    )
  }
}

/**
 * Delete a membership record from the user's PDS.
 */
export async function deleteMembership(
  did: string,
  groupDid: string
): Promise<void> {
  const rkey = groupDid.replace(/[^a-zA-Z0-9]/g, "-")
  const res = await authFetch("/api/xrpc/com/atproto/repo/deleteRecord", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      repo: did,
      collection: ORG_MEMBERSHIP_COLLECTION,
      rkey,
    }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(
      (data as { error?: string }).error || "Failed to delete membership"
    )
  }
}

// ─── Group service operations (proxied through BFF API routes) ───────

/**
 * Upload a blob (image) to the group's repo via the group service proxy.
 */
export async function uploadOrgBlob(
  groupDid: string,
  file: File
): Promise<Record<string, unknown>> {
  const buffer = await file.arrayBuffer()
  const res = await authFetch(
    `/api/organizations/${encodeURIComponent(groupDid)}/upload-blob`,
    {
      method: "POST",
      headers: { "Content-Type": file.type },
      body: buffer,
    }
  )
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error((data as { error?: string }).error || "Failed to upload image")
  }
  const data = await res.json()
  return data.blob as Record<string, unknown>
}

/**
 * Create an empty app.bsky.actor.profile record for the org (ensures discoverability).
 */
export async function createBskyProfile(
  groupDid: string
): Promise<void> {
  const res = await authFetch(
    `/api/organizations/${encodeURIComponent(groupDid)}/bsky-profile`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    }
  )
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(
      (data as { error?: string }).error || "Failed to create Bluesky profile"
    )
  }
}

/**
 * Register a new organization via the group service.
 */
export async function registerOrganization(
  handle: string,
  ownerDid: string,
  email?: string
): Promise<{ groupDid: string; handle: string }> {
  const res = await authFetch("/api/organizations/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ handle, ownerDid, email }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(
      (data as { error?: string }).error || "Failed to register organization"
    )
  }
  return res.json()
}

/**
 * Get an organization's profile (reads go to the PDS directly).
 */
export async function getOrgProfile(
  groupDid: string,
  signal?: AbortSignal
): Promise<OrgProfile | null> {
  const res = await authFetch(
    `/api/organizations/${encodeURIComponent(groupDid)}/profile`,
    { signal }
  )
  if (!res.ok) {
    if (res.status === 404) return null
    throw new Error("Failed to fetch org profile")
  }
  return res.json()
}

/**
 * Update an organization's profile.
 */
export async function putOrgProfile(
  groupDid: string,
  profile: OrgProfile
): Promise<void> {
  const res = await authFetch(
    `/api/organizations/${encodeURIComponent(groupDid)}/profile`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(profile),
    }
  )
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(
      (data as { error?: string }).error || "Failed to update org profile"
    )
  }
}

/**
 * Get organization metadata record.
 */
export async function getOrgMetadata(
  groupDid: string,
  signal?: AbortSignal
): Promise<OrgOrganization | null> {
  const res = await authFetch(
    `/api/organizations/${encodeURIComponent(groupDid)}/metadata`,
    { signal }
  )
  if (!res.ok) {
    if (res.status === 404) return null
    throw new Error("Failed to fetch org metadata")
  }
  return res.json()
}

/**
 * Update organization metadata.
 */
export async function putOrgMetadata(
  groupDid: string,
  metadata: OrgOrganization
): Promise<void> {
  const res = await authFetch(
    `/api/organizations/${encodeURIComponent(groupDid)}/metadata`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(metadata),
    }
  )
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(
      (data as { error?: string }).error || "Failed to update org metadata"
    )
  }
}

/**
 * List members of an organization.
 */
export async function listOrgMembers(
  groupDid: string,
  signal?: AbortSignal
): Promise<OrgMember[]> {
  const res = await authFetch(
    `/api/organizations/${encodeURIComponent(groupDid)}/members`,
    { signal }
  )
  if (!res.ok) throw new Error("Failed to fetch members")
  const data = await res.json()
  return data.members || []
}

/**
 * Add a member to an organization.
 */
export async function addOrgMember(
  groupDid: string,
  memberDid: string,
  role: OrgRole = "member"
): Promise<OrgMember> {
  const res = await authFetch(
    `/api/organizations/${encodeURIComponent(groupDid)}/members`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memberDid, role }),
    }
  )
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(
      (data as { error?: string }).error || "Failed to add member"
    )
  }
  return res.json()
}

/**
 * Remove a member from an organization.
 */
export async function removeOrgMember(
  groupDid: string,
  memberDid: string
): Promise<void> {
  const res = await authFetch(
    `/api/organizations/${encodeURIComponent(groupDid)}/members`,
    {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memberDid }),
    }
  )
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(
      (data as { error?: string }).error || "Failed to remove member"
    )
  }
}

/**
 * Set a member's role.
 */
export async function setOrgMemberRole(
  groupDid: string,
  memberDid: string,
  role: OrgRole
): Promise<void> {
  const res = await authFetch(
    `/api/organizations/${encodeURIComponent(groupDid)}/role`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memberDid, role }),
    }
  )
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(
      (data as { error?: string }).error || "Failed to set role"
    )
  }
}

/**
 * Query the organization audit log.
 */
export async function queryOrgAuditLog(
  groupDid: string,
  filters?: { actorDid?: string; action?: string; collection?: string },
  signal?: AbortSignal
): Promise<AuditEntry[]> {
  const params = new URLSearchParams()
  if (filters?.actorDid) params.set("actorDid", filters.actorDid)
  if (filters?.action) params.set("action", filters.action)
  if (filters?.collection) params.set("collection", filters.collection)
  const qs = params.toString()
  const res = await authFetch(
    `/api/organizations/${encodeURIComponent(groupDid)}/audit${qs ? `?${qs}` : ""}`,
    { signal }
  )
  if (!res.ok) throw new Error("Failed to fetch audit log")
  const data = await res.json()
  return data.entries || []
}

/**
 * Fetch all organizations the user belongs to from the group service.
 * This is the source of truth for membership — it calls
 * app.certified.groups.membership.list via our BFF proxy.
 */
export async function fetchRemoteMemberships(
  signal?: AbortSignal
): Promise<RemoteMembership[]> {
  const all: RemoteMembership[] = []
  let cursor: string | undefined

  // Paginate through all results
  do {
    const params = new URLSearchParams({ limit: "100" })
    if (cursor) params.set("cursor", cursor)

    const res = await authFetch(
      `/api/organizations/memberships?${params.toString()}`,
      { signal }
    )
    if (!res.ok) {
      if (res.status === 401) return []
      throw new Error("Failed to fetch remote memberships")
    }
    const data = await res.json()
    all.push(...(data.groups || []))
    cursor = data.cursor
  } while (cursor)

  return all
}

/**
 * Resolve a user's organizations by merging remote group service memberships
 * (source of truth) with local PDS records (to determine accepted status).
 */
export async function resolveOrganizations(
  did: string,
  signal?: AbortSignal
): Promise<Organization[]> {
  // Fetch both sources in parallel
  const [remoteMemberships, localMemberships] = await Promise.all([
    fetchRemoteMemberships(signal),
    listMemberships(did, signal),
  ])

  // Build set of locally-accepted groupDids
  const acceptedSet = new Set(localMemberships.map((m) => m.groupDid))

  // Resolve each remote membership into a full Organization
  const orgs: Organization[] = []
  for (const rm of remoteMemberships) {
    let displayName: string | undefined
    let handle = rm.groupDid
    let avatarUrl: string | undefined
    try {
      const [profile, resolvedHandle, pdsUrl] = await Promise.all([
        getOrgProfile(rm.groupDid, signal).catch(() => null),
        resolveHandle(rm.groupDid).catch(() => null),
        resolvePdsUrl(rm.groupDid).catch(() => null),
      ])
      if (profile?.displayName) displayName = profile.displayName
      if (resolvedHandle) handle = resolvedHandle
      if (profile && pdsUrl) {
        const url = getAvatarUrl(
          profile as CertifiedProfile,
          rm.groupDid,
          pdsUrl
        )
        if (url) avatarUrl = url
      }
    } catch {
      // ignore — profile or handle may not resolve
    }
    orgs.push({
      groupDid: rm.groupDid,
      handle,
      displayName,
      role: rm.role,
      accepted: acceptedSet.has(rm.groupDid),
      avatarUrl,
      rkey: rm.groupDid.replace(/[^a-zA-Z0-9]/g, "-"),
    })
  }

  return orgs
}
