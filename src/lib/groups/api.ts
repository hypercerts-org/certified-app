import { authFetch } from "@/lib/auth/fetch"
import { resolveHandle, resolvePdsUrl } from "@/lib/atproto/did"
import { getAvatarUrl } from "@/lib/atproto/profile"
import { extractError } from "@/lib/utils/api"
import type {
  Group,
  OrgProfile,
  GroupMetadata,
  OrgMember,
  AuditEntry,
  OrgRole,
  RemoteMembership,
} from "./types"

// ─── Group service operations (proxied through BFF API routes) ───────

/**
 * Upload a blob (image) to the group's repo via the group service proxy.
 * Returns a typed UploadedBlob matching the lexicon BlobRef shape.
 */
export async function uploadOrgBlob(
  groupDid: string,
  file: File
): Promise<import("@/lib/atproto/profile").UploadedBlob> {
  const buffer = await file.arrayBuffer()
  const res = await authFetch(
    `/api/groups/${encodeURIComponent(groupDid)}/upload-blob`,
    {
      method: "POST",
      headers: { "Content-Type": file.type },
      body: buffer,
    }
  )
  if (!res.ok) {
    throw new Error(await extractError(res, "Failed to upload image"))
  }
  const data = (await res.json()) as { blob?: import("@/lib/atproto/profile").UploadedBlob }
  if (!data.blob || typeof data.blob.ref?.$link !== "string") {
    throw new Error("uploadOrgBlob response missing blob.ref.$link")
  }
  return data.blob
}

/**
 * Create an empty app.bsky.actor.profile record for the org (ensures discoverability).
 */
export async function createBskyProfile(
  groupDid: string
): Promise<void> {
  const res = await authFetch(
    `/api/groups/${encodeURIComponent(groupDid)}/bsky-profile`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    }
  )
  if (!res.ok) {
    throw new Error(await extractError(res, "Failed to create Bluesky profile"))
  }
}

/**
 * Register a new group via the group service.
 */
/** Error thrown by registerGroup that preserves the server's error code. */
export class RegisterGroupError extends Error {
  readonly code?: string
  constructor(message: string, code?: string) {
    super(message)
    this.code = code
    this.name = "RegisterGroupError"
  }
}

export async function registerGroup(
  handle: string,
  ownerDid: string,
  email?: string
): Promise<{ groupDid: string; handle: string }> {
  const res = await authFetch("/api/groups/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ handle, ownerDid, email }),
  })
  if (!res.ok) {
    let message = "Failed to register group"
    let code: string | undefined
    try {
      const data = await res.json() as { error?: string; code?: string }
      if (typeof data.error === "string") message = data.error
      if (typeof data.code === "string") code = data.code
    } catch {
      // fall through
    }
    throw new RegisterGroupError(message, code)
  }
  return await res.json()
}

/**
 * Promote the currently authenticated account into a group (the sibling
 * of {@link registerGroup} that reuses an existing account). The caller
 * supplies an app password for that account; `ownerDid` defaults to the
 * importer server-side. Reuses {@link RegisterGroupError} so callers can
 * surface structured codes (e.g. `InvalidAppPassword`,
 * `GroupAlreadyRegistered`).
 */
export async function importGroup(
  appPassword: string,
  ownerDid?: string,
): Promise<{ groupDid: string; handle: string }> {
  const res = await authFetch("/api/groups/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ appPassword, ownerDid }),
  })
  if (!res.ok) {
    let message = "Failed to import group"
    let code: string | undefined
    try {
      const data = (await res.json()) as { error?: string; code?: string }
      if (typeof data.error === "string") message = data.error
      if (typeof data.code === "string") code = data.code
    } catch {
      // fall through
    }
    throw new RegisterGroupError(message, code)
  }
  return await res.json()
}

/**
 * Remove a group from the group service (owner-only; CGS enforces the
 * role). The underlying PDS account is left intact and can be
 * re-imported later. Reuses {@link RegisterGroupError} for structured
 * codes (e.g. `GroupNotFound`).
 */
export async function destroyGroup(
  groupDid: string,
): Promise<{ groupDid: string }> {
  const res = await authFetch(
    `/api/groups/${encodeURIComponent(groupDid)}/destroy`,
    { method: "POST" },
  )
  if (!res.ok) {
    let message = "Failed to remove group"
    let code: string | undefined
    try {
      const data = (await res.json()) as { error?: string; code?: string }
      if (typeof data.error === "string") message = data.error
      if (typeof data.code === "string") code = data.code
    } catch {
      // fall through
    }
    throw new RegisterGroupError(message, code)
  }
  return await res.json()
}

/**
 * Group password reset (owner/admin), enter-email flow. The owner supplies the
 * group's email; the BFF runs atproto's email-gated recovery against the
 * group's PDS (see the route). Step 1 sends a code to that mailbox.
 */
export async function requestGroupPasswordReset(
  groupDid: string,
  email: string,
): Promise<void> {
  const res = await authFetch(
    `/api/groups/${encodeURIComponent(groupDid)}/password-reset`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    },
  )
  if (!res.ok) {
    throw new Error(await extractError(res, "Failed to send reset code"))
  }
}

/** Step 2: complete the reset with the emailed code + a new password. */
export async function confirmGroupPasswordReset(
  groupDid: string,
  token: string,
  password: string,
): Promise<void> {
  const res = await authFetch(
    `/api/groups/${encodeURIComponent(groupDid)}/password-reset`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    },
  )
  if (!res.ok) {
    throw new Error(await extractError(res, "Failed to reset password"))
  }
}

/**
 * Get a group's profile (reads go to the PDS directly).
 */
export async function getOrgProfile(
  groupDid: string,
  signal?: AbortSignal
): Promise<OrgProfile | null> {
  const res = await authFetch(
    `/api/groups/${encodeURIComponent(groupDid)}/profile`,
    { signal }
  )
  if (!res.ok) {
    // 404 retained for backward compatibility (older route revisions and
    // the dev mock). The route now returns 200 + null for an absent
    // profile (issue #156) so the browser doesn't log a red 404 for every
    // gone-group row; both shapes coerce to null here.
    if (res.status === 404) return null
    throw new Error("Failed to fetch org profile")
  }
  // 200 body is the bare profile record, or `null` when the record is
  // absent / the group's PDS no longer resolves.
  return (await res.json()) as OrgProfile | null
}

/**
 * Update a group's profile.
 */
export async function putOrgProfile(
  groupDid: string,
  profile: OrgProfile
): Promise<void> {
  const res = await authFetch(
    `/api/groups/${encodeURIComponent(groupDid)}/profile`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(profile),
    }
  )
  if (!res.ok) {
    throw new Error(await extractError(res, "Failed to update org profile"))
  }
}

/**
 * Get group metadata record.
 */
export async function getOrgMetadata(
  groupDid: string,
  signal?: AbortSignal
): Promise<GroupMetadata | null> {
  const res = await authFetch(
    `/api/groups/${encodeURIComponent(groupDid)}/metadata`,
    { signal }
  )
  if (!res.ok) {
    if (res.status === 404) return null
    throw new Error("Failed to fetch org metadata")
  }
  return res.json()
}

/**
 * Update group metadata.
 */
export async function putOrgMetadata(
  groupDid: string,
  metadata: GroupMetadata
): Promise<void> {
  const res = await authFetch(
    `/api/groups/${encodeURIComponent(groupDid)}/metadata`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(metadata),
    }
  )
  if (!res.ok) {
    throw new Error(await extractError(res, "Failed to update org metadata"))
  }
}

/**
 * List members of a group.
 */
export async function listOrgMembers(
  groupDid: string,
  signal?: AbortSignal
): Promise<OrgMember[]> {
  const res = await authFetch(
    `/api/groups/${encodeURIComponent(groupDid)}/members`,
    { signal }
  )
  if (!res.ok) throw new Error("Failed to fetch members")
  const data = await res.json()
  return data.members || []
}

/**
 * Add a member to a group.
 */
export async function addOrgMember(
  groupDid: string,
  memberDid: string,
  role: OrgRole = "member"
): Promise<OrgMember> {
  const res = await authFetch(
    `/api/groups/${encodeURIComponent(groupDid)}/members`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memberDid, role }),
    }
  )
  if (!res.ok) {
    throw new Error(await extractError(res, "Failed to add member"))
  }
  return res.json()
}

/**
 * Remove a member from a group.
 */
export async function removeOrgMember(
  groupDid: string,
  memberDid: string
): Promise<void> {
  const res = await authFetch(
    `/api/groups/${encodeURIComponent(groupDid)}/members`,
    {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memberDid }),
    }
  )
  if (!res.ok) {
    throw new Error(await extractError(res, "Failed to remove member"))
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
    `/api/groups/${encodeURIComponent(groupDid)}/role`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memberDid, role }),
    }
  )
  if (!res.ok) {
    throw new Error(await extractError(res, "Failed to set role"))
  }
}

/**
 * Query the group audit log.
 * Paginates if the endpoint returns a cursor.
 */
export async function queryOrgAuditLog(
  groupDid: string,
  filters?: { actorDid?: string; action?: string; collection?: string },
  signal?: AbortSignal
): Promise<AuditEntry[]> {
  const all: AuditEntry[] = []
  let cursor: string | undefined
  const MAX_PAGES = 50
  let pages = 0

  do {
    const params = new URLSearchParams({ limit: "100" })
    if (filters?.actorDid) params.set("actorDid", filters.actorDid)
    if (filters?.action) params.set("action", filters.action)
    if (filters?.collection) params.set("collection", filters.collection)
    if (cursor) params.set("cursor", cursor)

    const res = await authFetch(
      `/api/groups/${encodeURIComponent(groupDid)}/audit?${params.toString()}`,
      { signal }
    )
    if (!res.ok) throw new Error("Failed to fetch audit log")
    const data = await res.json()
    all.push(...(data.entries || []))
    cursor = data.cursor
    pages++
  } while (cursor && pages < MAX_PAGES)

  return all
}

/**
 * Fetch all groups the user belongs to from the group service.
 * This is the source of truth for membership — it calls
 * app.certified.groups.membership.list via our BFF proxy.
 */
export async function fetchRemoteMemberships(
  signal?: AbortSignal
): Promise<RemoteMembership[]> {
  const all: RemoteMembership[] = []
  let cursor: string | undefined
  const MAX_PAGES = 50
  let pages = 0

  // Paginate through all results
  do {
    const params = new URLSearchParams({ limit: "100" })
    if (cursor) params.set("cursor", cursor)

    const res = await authFetch(
      `/api/groups/memberships?${params.toString()}`,
      { signal }
    )
    if (!res.ok) {
      if (res.status === 401) return []
      throw new Error("Failed to fetch remote memberships")
    }
    const data = await res.json()
    all.push(...(data.groups || []))
    cursor = data.cursor
    pages++
  } while (cursor && pages < MAX_PAGES)

  return all
}

/**
 * Count how many groups the user created themselves.
 * An org is "self-created" if the user's member entry has addedBy === userDid.
 */
export async function getSelfCreatedOrgCount(
  userDid: string,
  groups: Group[],
  signal?: AbortSignal
): Promise<number> {
  const memberLists = await Promise.all(
    groups.map((org) =>
      listOrgMembers(org.groupDid, signal)
        .then((members) => members)
        .catch(() => [] as OrgMember[])
    )
  )

  let count = 0
  for (const members of memberLists) {
    const selfEntry = members.find(
      (m) => m.did === userDid && m.addedBy === userDid
    )
    if (selfEntry) count++
  }

  return count
}

/**
 * Resolve a user's groups by merging remote group service memberships
 * (source of truth) with local PDS records (to determine accepted status).
 */
export async function resolveGroups(
  _did: string,
  signal?: AbortSignal
): Promise<Group[]> {
  // Groups come from the CGS membership list (the source of truth). We no
  // longer keep a local `app.certified.actor.membership` marker.
  const remoteMemberships = await fetchRemoteMemberships(signal)

  // Resolve all remote memberships in parallel (profile, handle, PDS per org)
  const orgs = await Promise.all(
    remoteMemberships.map(async (rm) => {
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
            profile,
            rm.groupDid,
            pdsUrl
          )
          if (url) avatarUrl = url
        }
      } catch {
        // ignore — profile or handle may not resolve
      }
      return {
        groupDid: rm.groupDid,
        handle,
        displayName,
        role: rm.role,
        accepted: true,
        avatarUrl,
      } satisfies Group
    })
  )

  return orgs
}
