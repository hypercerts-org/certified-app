import { NextRequest, NextResponse } from "next/server"
import {
  getAuthenticatedAgent,
  createGroupAgent,
} from "@/lib/groups/proxy-agent"
import { checkCsrf } from "@/lib/auth/csrf"
import { isValidDid } from "@/lib/utils/did"
import { extractRouteError, parseJsonBody } from "@/lib/utils/api"

/**
 * PUT /api/groups/[groupDid]/role
 * Set a member's role (requires owner).
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

    const parsed = await parseJsonBody(request, "[groups/role]")
    if (!parsed.ok) return parsed.response
    const { memberDid, role } = (parsed.body ?? {}) as {
      memberDid?: string
      role?: string
    }

    if (!memberDid || !isValidDid(memberDid) || !role) {
      return NextResponse.json(
        { error: "memberDid and role are required" },
        { status: 400 }
      )
    }

    if (!["member", "admin", "owner"].includes(role)) {
      return NextResponse.json(
        { error: "role must be member, admin, or owner" },
        { status: 400 }
      )
    }

    const groupAgent = createGroupAgent(auth.agent, groupDid)
    await groupAgent.call(
      "app.certified.group.role.set",
      {},
      { memberDid, role },
      { encoding: "application/json" }
    )

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    const { status, message } = extractRouteError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
