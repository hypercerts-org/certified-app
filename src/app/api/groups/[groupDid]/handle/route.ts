import { NextRequest, NextResponse } from "next/server"
import {
  getAuthenticatedAgent,
  createGroupAgent,
} from "@/lib/groups/proxy-agent"
import { checkCsrf } from "@/lib/auth/csrf"

/**
 * PUT /api/groups/[groupDid]/handle
 * Update the group's handle via the group service proxy.
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
    const { handle } = body as { handle: string }

    if (!handle?.trim()) {
      return NextResponse.json({ error: "Handle is required" }, { status: 400 })
    }

    const groupAgent = createGroupAgent(auth.agent, groupDid)

    // Use the standard identity.updateHandle through the proxy
    // The group service intercepts this and updates the group's handle
    await groupAgent.com.atproto.identity.updateHandle({
      handle: handle.trim(),
    })

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    console.error("Update org handle error:", err)
    const error = err as { status?: number; message?: string }
    return NextResponse.json(
      { error: error?.message || "Failed to update handle" },
      { status: error?.status || 500 }
    )
  }
}
