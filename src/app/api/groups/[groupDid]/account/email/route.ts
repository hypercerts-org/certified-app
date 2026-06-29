import { NextRequest, NextResponse } from "next/server"
import { getSessionDid } from "@/lib/auth/session"
import { checkCsrf } from "@/lib/auth/csrf"
import { enforceRateLimit, makeLimiter } from "@/lib/auth/rate-limit"
import { parseJsonBody, extractRouteError } from "@/lib/utils/api"
import { isValidDid } from "@/lib/utils/did"
import { callPds } from "@/lib/auth/group-account-session"

/**
 * Read / change the GROUP account's email through the elevated session opened
 * by `/account/session`. The session must be unlocked first; when it isn't (no
 * session, or the stored token lapsed) these return `401 { error: "locked" }`
 * so the UI drops back to the unlock gate. `/api/groups/*` is not a
 * session-bearing prefix (see auth/fetch), so that 401 never logs the user out.
 *
 *   GET  → { email, emailConfirmed }   (com.atproto.server.getSession)
 *   POST → { tokenRequired }           (requestEmailUpdate; emails the CURRENT
 *          address a code when the email is confirmed)
 *   PUT  { email, token? }             (updateEmail)
 */
const LIMITER = makeLimiter("groupacct-email", 20, 600)

async function gate(
  groupDid: string,
): Promise<{ did: string } | { error: NextResponse }> {
  const did = await getSessionDid()
  if (!did)
    return {
      error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }),
    }
  if (!isValidDid(groupDid))
    return {
      error: NextResponse.json({ error: "Invalid group DID" }, { status: 400 }),
    }
  const rateDenied = await enforceRateLimit(LIMITER, did)
  if (rateDenied) return { error: rateDenied }
  return { did }
}

const locked = () => NextResponse.json({ error: "locked" }, { status: 401 })

async function forwardError(res: Response, fallback: string): Promise<string> {
  const data = (await res.json().catch(() => ({}))) as {
    message?: string
    error?: string
  }
  return data.message || data.error || fallback
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ groupDid: string }> },
) {
  try {
    const { groupDid } = await context.params
    const g = await gate(groupDid)
    if ("error" in g) return g.error

    const r = await callPds(g.did, groupDid, "com.atproto.server.getSession")
    if (r.kind === "locked") return locked()
    if (!r.response.ok)
      return NextResponse.json(
        { error: await forwardError(r.response, "Failed to read email") },
        { status: r.response.status },
      )
    const data = (await r.response.json()) as {
      email?: string
      emailConfirmed?: boolean
    }
    return NextResponse.json({
      email: data.email ?? null,
      emailConfirmed: !!data.emailConfirmed,
    })
  } catch (err: unknown) {
    const { status, message } = extractRouteError(
      err,
      "[groups/account/email] read error",
    )
    return NextResponse.json({ error: message }, { status })
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ groupDid: string }> },
) {
  try {
    const { groupDid } = await context.params
    const g = await gate(groupDid)
    if ("error" in g) return g.error
    const csrfError = checkCsrf(request)
    if (csrfError) return csrfError

    // requestEmailUpdate takes NO input — sending even an empty `{}` body
    // makes the PDS reject it ("A request body was provided when none was
    // expected"). Omit the body so callPds sends a bodyless POST.
    const r = await callPds(
      g.did,
      groupDid,
      "com.atproto.server.requestEmailUpdate",
      { method: "POST" },
    )
    if (r.kind === "locked") return locked()
    if (!r.response.ok)
      return NextResponse.json(
        {
          error: await forwardError(r.response, "Failed to request email update"),
        },
        { status: r.response.status },
      )
    const data = (await r.response.json()) as { tokenRequired?: boolean }
    return NextResponse.json({ tokenRequired: !!data.tokenRequired })
  } catch (err: unknown) {
    const { status, message } = extractRouteError(
      err,
      "[groups/account/email] request-update error",
    )
    return NextResponse.json({ error: message }, { status })
  }
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ groupDid: string }> },
) {
  try {
    const { groupDid } = await context.params
    const g = await gate(groupDid)
    if ("error" in g) return g.error
    const csrfError = checkCsrf(request)
    if (csrfError) return csrfError

    const parsed = await parseJsonBody(request, "[groups/account/email]")
    if (!parsed.ok) return parsed.response
    const { email, token } = (parsed.body ?? {}) as {
      email?: string
      token?: string
    }
    if (!email?.trim())
      return NextResponse.json({ error: "Email is required" }, { status: 400 })

    const body: { email: string; token?: string } = { email: email.trim() }
    if (token?.trim()) body.token = token.trim()

    const r = await callPds(
      g.did,
      groupDid,
      "com.atproto.server.updateEmail",
      { method: "POST", body },
    )
    if (r.kind === "locked") return locked()
    if (!r.response.ok)
      return NextResponse.json(
        { error: await forwardError(r.response, "Failed to update email") },
        { status: r.response.status },
      )
    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    const { status, message } = extractRouteError(
      err,
      "[groups/account/email] update error",
    )
    return NextResponse.json({ error: message }, { status })
  }
}
