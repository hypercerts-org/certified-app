import { NextRequest, NextResponse } from "next/server"
import { getSessionDid } from "@/lib/auth/session"
import { checkCsrf } from "@/lib/auth/csrf"
import { enforceRateLimit, makeLimiter } from "@/lib/auth/rate-limit"
import { parseJsonBody, extractRouteError } from "@/lib/utils/api"
import { isValidDid } from "@/lib/utils/did"
import { invalidateDidDoc } from "@/lib/atproto/did"
import { callPds } from "@/lib/auth/group-account-session"

/**
 * Change the GROUP's handle through the elevated session opened by
 * `/account/session` (owner/admin who unlocked with the group's password).
 *
 * This is the ONLY safe way to rename a group: `com.atproto.identity.updateHandle`
 * is run with the GROUP's own access token, so the group's PDS applies it to the
 * group account. (The old group-proxy route renamed the caller instead, because
 * the PDS handles identity ops locally for the authenticated account.)
 *
 *   PUT { handle }  → com.atproto.identity.updateHandle
 *
 * 401 { error: "locked" } when the session isn't unlocked; the UI re-unlocks.
 */
const LIMITER = makeLimiter("groupacct-handle", 10, 600)

const locked = () => NextResponse.json({ error: "locked" }, { status: 401 })

async function forwardError(res: Response, fallback: string): Promise<string> {
  const data = (await res.json().catch(() => ({}))) as {
    message?: string
    error?: string
  }
  return data.message || data.error || fallback
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ groupDid: string }> },
) {
  try {
    const did = await getSessionDid()
    if (!did)
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    const { groupDid } = await context.params
    if (!isValidDid(groupDid))
      return NextResponse.json({ error: "Invalid group DID" }, { status: 400 })
    const rateDenied = await enforceRateLimit(LIMITER, did)
    if (rateDenied) return rateDenied
    const csrfError = checkCsrf(request)
    if (csrfError) return csrfError

    const parsed = await parseJsonBody(request, "[groups/account/handle]")
    if (!parsed.ok) return parsed.response
    const { handle } = (parsed.body ?? {}) as { handle?: string }
    if (!handle?.trim())
      return NextResponse.json({ error: "Handle is required" }, { status: 400 })
    if (handle.trim().length > 253)
      return NextResponse.json(
        { error: "Handle too long (max 253 characters)" },
        { status: 400 },
      )

    const r = await callPds(
      did,
      groupDid,
      "com.atproto.identity.updateHandle",
      { method: "POST", body: { handle: handle.trim() } },
    )
    if (r.kind === "locked") return locked()
    if (!r.response.ok)
      return NextResponse.json(
        { error: await forwardError(r.response, "Failed to update handle") },
        { status: r.response.status },
      )

    // The group's DID document (alsoKnownAs) just changed — evict our cache so
    // subsequent resolveHandle(groupDid) sees the new handle.
    invalidateDidDoc(groupDid)
    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    const { status, message } = extractRouteError(
      err,
      "[groups/account/handle] update error",
    )
    return NextResponse.json({ error: message }, { status })
  }
}
