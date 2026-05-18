import { NextRequest, NextResponse } from "next/server"
import {
  getAuthenticatedAgent,
  createGroupAgent,
} from "@/lib/groups/proxy-agent"
import { resolvePdsUrl } from "@/lib/atproto/did"
import { checkCsrf } from "@/lib/auth/csrf"
import { isValidDid } from "@/lib/utils/did"
import { extractRouteError, pickAllowedFields, parseJsonBody } from "@/lib/utils/api"
import { logSafe } from "@/lib/utils/log-safe"

const PROFILE_FIELDS = ["displayName", "description", "pronouns", "website", "avatar", "banner", "createdAt"] as const

/**
 * GET /api/groups/[groupDid]/profile
 * Read the org's app.certified.actor.profile record.
 * Reads go directly to the group's own PDS (resolved from the DID document).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ groupDid: string }> }
) {
  try {
    const { groupDid } = await params
    if (!isValidDid(groupDid)) {
      return NextResponse.json({ error: "Invalid group DID" }, { status: 400 })
    }

    // Resolve the group's PDS URL from the DID document
    const pdsUrl = await resolvePdsUrl(groupDid)
    if (!pdsUrl) {
      return NextResponse.json({ error: "Could not resolve group PDS" }, { status: 404 })
    }

    // Fetch directly from the group's PDS (unauthenticated — reads are public)
    const res = await fetch(
      `${pdsUrl}/xrpc/com.atproto.repo.getRecord?repo=${encodeURIComponent(groupDid)}&collection=${encodeURIComponent("app.certified.actor.profile")}&rkey=self`,
      { signal: AbortSignal.timeout(10_000) }
    )

    if (!res.ok) {
      if (res.status === 400 || res.status === 404) {
        return NextResponse.json({ error: "Not found" }, { status: 404 })
      }
      throw new Error(`PDS returned ${res.status}`)
    }

    const data = await res.json()
    return NextResponse.json(data.value)
  } catch (err: unknown) {
    logSafe("[groups/profile] GET error", err)
    const { status, message } = extractRouteError(err)
    return NextResponse.json({ error: message }, { status })
  }
}

/**
 * PUT /api/groups/[groupDid]/profile
 * Update the org's profile. Uses custom NSID for writes.
 * Requires admin role.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ groupDid: string }> }
) {
  const csrfError = checkCsrf(request)
  if (csrfError) return csrfError

  try {
    const { groupDid } = await params
    if (!isValidDid(groupDid)) {
      return NextResponse.json({ error: "Invalid group DID" }, { status: 400 })
    }
    const auth = await getAuthenticatedAgent()
    if (!auth)
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

    const parsed = await parseJsonBody(request, "[groups/profile]")
    if (!parsed.ok) return parsed.response
    const body = (parsed.body ?? {}) as Record<string, unknown>
    const record = pickAllowedFields(body, PROFILE_FIELDS, "app.certified.actor.profile")
    const groupAgent = createGroupAgent(auth.agent, groupDid)

    // Use custom NSID for writes — PDS proxies to group service
    await groupAgent.call(
      "app.certified.group.repo.putRecord",
      {},
      {
        repo: groupDid,
        collection: "app.certified.actor.profile",
        rkey: "self",
        record,
      },
      { encoding: "application/json" }
    )

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    console.error("PUT org profile error:", err)
    const { status, message } = extractRouteError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
