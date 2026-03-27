import { NextRequest, NextResponse } from "next/server"
import {
  getAuthenticatedAgent,
  createGroupAgent,
} from "@/lib/organizations/proxy-agent"

/**
 * GET /api/organizations/[groupDid]/audit
 * Query the audit log (requires admin).
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

    const queryParams: Record<string, string> = {}
    const actorDid = request.nextUrl.searchParams.get("actorDid")
    const action = request.nextUrl.searchParams.get("action")
    const collection = request.nextUrl.searchParams.get("collection")
    const cursor = request.nextUrl.searchParams.get("cursor")
    if (actorDid) queryParams.actorDid = actorDid
    if (action) queryParams.action = action
    if (collection) queryParams.collection = collection
    if (cursor) queryParams.cursor = cursor

    const { data } = await groupAgent.call(
      "app.certified.group.audit.query",
      queryParams
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
