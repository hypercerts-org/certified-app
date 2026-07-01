import { NextRequest, NextResponse } from "next/server"
import {
  getAuthenticatedAgent,
  callGroupServiceJson,
} from "@/lib/groups/proxy-agent"
import { isValidDid } from "@/lib/utils/did"
import { extractRouteError } from "@/lib/utils/api"

/**
 * GET /api/groups/[groupDid]/audit
 * Query the audit log (requires admin).
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

    const queryParams: Record<string, string> = { repo: groupDid }
    const actorDid = request.nextUrl.searchParams.get("actorDid")
    const action = request.nextUrl.searchParams.get("action")
    const collection = request.nextUrl.searchParams.get("collection")
    const limit = request.nextUrl.searchParams.get("limit")
    const cursor = request.nextUrl.searchParams.get("cursor")
    if (actorDid) {
      if (!isValidDid(actorDid)) {
        return NextResponse.json({ error: "Invalid actorDid" }, { status: 400 })
      }
      queryParams.actorDid = actorDid
    }
    if (action) queryParams.action = action
    if (collection) queryParams.collection = collection
    const rawLimit = parseInt(limit || "50", 10)
    const clampedLimit = isNaN(rawLimit) ? 50 : Math.min(Math.max(1, rawLimit), 100)
    queryParams.limit = String(clampedLimit)
    if (cursor) queryParams.cursor = cursor

    const data = await callGroupServiceJson(
      auth.agent,
      "app.certified.group.audit.query",
      { query: queryParams }
    )

    return NextResponse.json(data)
  } catch (err: unknown) {
    const { status, message } = extractRouteError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
