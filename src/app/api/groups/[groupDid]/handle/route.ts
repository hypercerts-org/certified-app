import { NextRequest, NextResponse } from "next/server"
import {
  getAuthenticatedAgent,
  createGroupAgent,
} from "@/lib/groups/proxy-agent"
import { checkCsrf } from "@/lib/auth/csrf"
import { isValidDid } from "@/lib/utils/did"
import { extractRouteError, parseJsonBody } from "@/lib/utils/api"
import { invalidateDidDoc } from "@/lib/atproto/did"
import { logSafe } from "@/lib/utils/log-safe"

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
    if (!isValidDid(groupDid)) {
      return NextResponse.json({ error: "Invalid group DID" }, { status: 400 })
    }
    const auth = await getAuthenticatedAgent()
    if (!auth)
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

    const parsed = await parseJsonBody(request, "[groups/handle]")
    if (!parsed.ok) return parsed.response
    const { handle } = (parsed.body ?? {}) as { handle?: string }

    if (!handle?.trim()) {
      return NextResponse.json({ error: "Handle is required" }, { status: 400 })
    }

    // AT Protocol handles are max 253 chars (DNS hostname limit)
    if (handle.trim().length > 253) {
      return NextResponse.json({ error: "Handle too long (max 253 characters)" }, { status: 400 })
    }

    const groupAgent = createGroupAgent(auth.agent, groupDid)

    // Use the standard identity.updateHandle through the proxy
    // The group service intercepts this and updates the group's handle
    await groupAgent.com.atproto.identity.updateHandle({
      handle: handle.trim(),
    })

    // The group's DID document just changed (alsoKnownAs was rewritten).
    // Evict our process-local cache so subsequent resolveHandle(groupDid)
    // calls see the new handle instead of the stale one.
    invalidateDidDoc(groupDid)

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    logSafe("[groups/handle] update failed", err)
    const { status, message } = extractRouteError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
