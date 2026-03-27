import { NextRequest, NextResponse } from "next/server"
import {
  getAuthenticatedAgent,
  createGroupAgent,
} from "@/lib/organizations/proxy-agent"
import { resolvePdsUrl } from "@/lib/atproto/did"
import { checkCsrf } from "@/lib/auth/csrf"

/**
 * GET /api/organizations/[groupDid]/profile
 * Read the org's app.certified.actor.profile record.
 * Reads go directly to the group's own PDS (resolved from the DID document).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ groupDid: string }> }
) {
  try {
    const { groupDid } = await params

    // Resolve the group's PDS URL from the DID document
    const pdsUrl = await resolvePdsUrl(groupDid)
    if (!pdsUrl) {
      return NextResponse.json({ error: "Could not resolve group PDS" }, { status: 404 })
    }

    // Fetch directly from the group's PDS (unauthenticated — reads are public)
    const res = await fetch(
      `${pdsUrl}/xrpc/com.atproto.repo.getRecord?repo=${encodeURIComponent(groupDid)}&collection=${encodeURIComponent("app.certified.actor.profile")}&rkey=self`
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
    console.error("GET org profile error:", err)
    const error = err as { message?: string }
    return NextResponse.json(
      { error: error?.message || "Internal server error" },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/organizations/[groupDid]/profile
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
    const auth = await getAuthenticatedAgent()
    if (!auth)
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

    const body = await request.json()
    const groupAgent = createGroupAgent(auth.agent, groupDid)

    console.log("PUT org profile: writing to", groupDid, "body:", JSON.stringify(body).slice(0, 200))

    // Use custom NSID for writes — PDS proxies to group service
    const writeResult = await groupAgent.call(
      "app.certified.group.repo.putRecord",
      {},
      {
        repo: groupDid,
        collection: "app.certified.actor.profile",
        rkey: "self",
        record: {
          ...body,
          $type: "app.certified.actor.profile",
        },
      },
      { encoding: "application/json" }
    )

    console.log("PUT org profile: success", JSON.stringify(writeResult.data).slice(0, 200))
    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    console.error("PUT org profile error:", err)
    const error = err as { status?: number; message?: string }
    const status = error?.status || 500
    return NextResponse.json(
      { error: error?.message || "Internal server error" },
      { status }
    )
  }
}
