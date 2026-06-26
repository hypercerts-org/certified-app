import { NextRequest, NextResponse } from "next/server"
import {
  getAuthenticatedAgent,
  createGroupClient,
} from "@/lib/groups/proxy-agent"
import { checkCsrf } from "@/lib/auth/csrf"
import { isValidDid } from "@/lib/utils/did"
import { extractRouteError } from "@/lib/utils/api"

/**
 * POST /api/groups/[groupDid]/bsky-profile
 * Create an empty app.bsky.actor.profile record for discoverability.
 * Uses the group service proxy (custom NSID) for writes.
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

    const groupAgent = createGroupClient(auth.agent, groupDid)

    await groupAgent.call(
      "app.certified.group.repo.putRecord",
      {},
      {
        repo: groupDid,
        collection: "app.bsky.actor.profile",
        rkey: "self",
        record: {
          $type: "app.bsky.actor.profile",
        },
      },
      { encoding: "application/json" }
    )

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    const { status, message } = extractRouteError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
