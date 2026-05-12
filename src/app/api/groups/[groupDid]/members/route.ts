import { NextRequest, NextResponse } from "next/server"
import {
  getAuthenticatedAgent,
  createGroupAgent,
} from "@/lib/groups/proxy-agent"
import { checkCsrf } from "@/lib/auth/csrf"
import { isValidDid } from "@/lib/utils/did"
import { extractRouteError, parseJsonBody } from "@/lib/utils/api"

/**
 * GET /api/groups/[groupDid]/members
 * List members (any member can do this).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ groupDid: string }> }
) {
  try {
    const { groupDid } = await params
    if (!isValidDid(groupDid)) {
      return NextResponse.json({ error: "Invalid group DID" }, { status: 400 })
    }
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
    const { status, message } = extractRouteError(err)
    return NextResponse.json({ error: message }, { status })
  }
}

/**
 * POST /api/groups/[groupDid]/members
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
    if (!isValidDid(groupDid)) {
      return NextResponse.json({ error: "Invalid group DID" }, { status: 400 })
    }
    const auth = await getAuthenticatedAgent()
    if (!auth)
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

    const parsed = await parseJsonBody(request, "[groups/members POST]")
    if (!parsed.ok) return parsed.response
    const { memberDid, role = "member" } = (parsed.body ?? {}) as {
      memberDid?: string
      role?: string
    }

    if (!memberDid || !isValidDid(memberDid)) {
      return NextResponse.json(
        { error: "memberDid is required" },
        { status: 400 }
      )
    }

    if (role && !["member", "admin"].includes(role)) {
      return NextResponse.json(
        { error: "role must be 'member' or 'admin'" },
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
    const { status, message } = extractRouteError(err)
    return NextResponse.json({ error: message }, { status })
  }
}

/**
 * DELETE /api/groups/[groupDid]/members
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
    if (!isValidDid(groupDid)) {
      return NextResponse.json({ error: "Invalid group DID" }, { status: 400 })
    }
    const auth = await getAuthenticatedAgent()
    if (!auth)
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

    const parsed = await parseJsonBody(request, "[groups/members DELETE]")
    if (!parsed.ok) return parsed.response
    const { memberDid } = (parsed.body ?? {}) as { memberDid?: string }

    if (!memberDid || !isValidDid(memberDid)) {
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
    const { status, message } = extractRouteError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
