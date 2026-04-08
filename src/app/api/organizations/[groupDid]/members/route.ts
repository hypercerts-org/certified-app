import { NextRequest, NextResponse } from "next/server"
import {
  getAuthenticatedAgent,
  createGroupAgent,
} from "@/lib/organizations/proxy-agent"
import { checkCsrf } from "@/lib/auth/csrf"

/**
 * GET /api/organizations/[groupDid]/members
 * List members (any member can do this).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ groupDid: string }> }
) {
  try {
    const { groupDid } = await params
    const auth = await getAuthenticatedAgent()
    if (!auth)
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

    const groupAgent = createGroupAgent(auth.agent, groupDid)
    const rawLimit = parseInt(request.nextUrl.searchParams.get("limit") || "50", 10)
    const limit = isNaN(rawLimit) ? 50 : Math.min(Math.max(1, rawLimit), 100)

    const { data } = await groupAgent.call(
      "app.certified.group.member.list",
      { limit }
    )

    return NextResponse.json(data)
  } catch (err: unknown) {
    const error = err as { status?: number; message?: string }
    return NextResponse.json(
      { error: error?.message || "Internal server error" },
      { status: error?.status || 500 }
    )
  }
}

/**
 * POST /api/organizations/[groupDid]/members
 * Add a member (requires admin).
 */
export async function POST(
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
    const { memberDid, role = "member" } = body as {
      memberDid: string
      role?: string
    }

    if (!memberDid) {
      return NextResponse.json(
        { error: "memberDid is required" },
        { status: 400 }
      )
    }

    const groupAgent = createGroupAgent(auth.agent, groupDid)
    const { data } = await groupAgent.call(
      "app.certified.group.member.add",
      {},
      { memberDid, role },
      { encoding: "application/json" }
    )

    return NextResponse.json(data)
  } catch (err: unknown) {
    const error = err as { status?: number; message?: string }
    return NextResponse.json(
      { error: error?.message || "Internal server error" },
      { status: error?.status || 500 }
    )
  }
}

/**
 * DELETE /api/organizations/[groupDid]/members
 * Remove a member (requires admin, or self-removal).
 */
export async function DELETE(
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
    const { memberDid } = body as { memberDid: string }

    if (!memberDid) {
      return NextResponse.json(
        { error: "memberDid is required" },
        { status: 400 }
      )
    }

    const groupAgent = createGroupAgent(auth.agent, groupDid)
    await groupAgent.call(
      "app.certified.group.member.remove",
      {},
      { memberDid },
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
