import { NextRequest, NextResponse } from "next/server"
import {
  getAuthenticatedAgent,
  createGroupAgent,
} from "@/lib/organizations/proxy-agent"
import { checkCsrf } from "@/lib/auth/csrf"

/**
 * PUT /api/organizations/[groupDid]/role
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
    const auth = await getAuthenticatedAgent()
    if (!auth)
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

    const body = await request.json()
    const { memberDid, role } = body as { memberDid: string; role: string }

    if (!memberDid || !role) {
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
    const error = err as { status?: number; message?: string }
    return NextResponse.json(
      { error: error?.message || "Internal server error" },
      { status: error?.status || 500 }
    )
  }
}
