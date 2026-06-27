import { NextRequest, NextResponse } from "next/server"
import { getAuthenticatedAgent } from "@/lib/groups/proxy-agent"
import { checkCsrf } from "@/lib/auth/csrf"
import { isValidDid } from "@/lib/utils/did"
import { extractRouteError } from "@/lib/utils/api"
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

    // DISABLED — changing a group's handle is not supported. CGS does not
    // proxy `com.atproto.identity.updateHandle`; when called through the group
    // proxy the caller's PDS handles the identity op LOCALLY for the
    // authenticated account, so it renames the CALLER, not the group (it
    // corrupted an admin's own handle in testing). Re-enable only once CGS
    // exposes a real, group-targeted handle endpoint.
    return NextResponse.json(
      { error: "Changing a group's handle isn't supported yet." },
      { status: 501 },
    )
  } catch (err: unknown) {
    logSafe("[groups/handle] update failed", err)
    const { status, message } = extractRouteError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
