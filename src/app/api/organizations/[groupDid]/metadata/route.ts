import { NextRequest, NextResponse } from "next/server"
import {
  getAuthenticatedAgent,
  createGroupAgent,
} from "@/lib/organizations/proxy-agent"
import { resolvePdsUrl } from "@/lib/atproto/did"
import { checkCsrf } from "@/lib/auth/csrf"

/**
 * GET /api/organizations/[groupDid]/metadata
 * Read the org's app.certified.actor.organization record.
 * Reads go directly to the group's own PDS.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ groupDid: string }> }
) {
  try {
    const { groupDid } = await params

    const pdsUrl = await resolvePdsUrl(groupDid)
    if (!pdsUrl) {
      return NextResponse.json({ error: "Could not resolve group PDS" }, { status: 404 })
    }

    const res = await fetch(
      `${pdsUrl}/xrpc/com.atproto.repo.getRecord?repo=${encodeURIComponent(groupDid)}&collection=${encodeURIComponent("app.certified.actor.organization")}&rkey=self`
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
    console.error("GET org metadata error:", err)
    const error = err as { message?: string }
    return NextResponse.json(
      { error: error?.message || "Internal server error" },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/organizations/[groupDid]/metadata
 * Update the org's organization record.
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

    await groupAgent.call(
      "app.certified.group.repo.putRecord",
      {},
      {
        repo: groupDid,
        collection: "app.certified.actor.organization",
        rkey: "self",
        record: {
          ...body,
          $type: "app.certified.actor.organization",
        },
      },
      { encoding: "application/json" }
    )

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    const error = err as { status?: number; message?: string }
    return NextResponse.json(
      { error: error?.message || "Internal server error" },
      { status: error?.status || 500 }
    )
  }
}
