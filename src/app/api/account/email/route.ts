import { NextRequest, NextResponse } from "next/server"
import { getSessionDid } from "@/lib/auth/session"
import { checkCsrf } from "@/lib/auth/csrf"
import { enforceRateLimit, makeLimiter } from "@/lib/auth/rate-limit"
import { parseJsonBody, extractRouteError } from "@/lib/utils/api"
import { callPds } from "@/lib/auth/app-password-session"

/**
 * Read / change the SIGNED-IN user's own email through the elevated session
 * opened by `/account/app-passwords/session`.
 *
 * certified-app is OAuth-only, but atproto's account-management endpoints
 * (`com.atproto.server.requestEmailUpdate` / `updateEmail`) reject OAuth
 * credentials the same way the app-password ops do — they need a full
 * password session. So this reuses the shared elevated session (one unlock
 * covers app passwords AND email). When it isn't open (no session, or the
 * stored token lapsed) these return `401 { error: "locked" }` so the UI drops
 * back to the unlock gate.
 *
 *   GET  → { email, emailConfirmed }   (com.atproto.server.getSession)
 *   POST → { tokenRequired }           (requestEmailUpdate; emails the CURRENT
 *          address a code when the email is confirmed)
 *   PUT  { email, token? }             (updateEmail)
 *
 * Mirrors the group-account email route, minus the groupDid: the DID is always
 * the caller's own session DID, so a caller can only ever read or change the
 * email of the account they're already signed in as.
 */
const LIMITER = makeLimiter("acct-email", 20, 600)

async function gate(): Promise<{ did: string } | { error: NextResponse }> {
  const did = await getSessionDid()
  if (!did)
    return {
      error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }),
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

export async function GET() {
  try {
    const g = await gate()
    if ("error" in g) return g.error

    const r = await callPds(g.did, "com.atproto.server.getSession")
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
      "[account/email] read error",
    )
    return NextResponse.json({ error: message }, { status })
  }
}

export async function POST(request: NextRequest) {
  try {
    const g = await gate()
    if ("error" in g) return g.error
    const csrfError = checkCsrf(request)
    if (csrfError) return csrfError

    // requestEmailUpdate takes NO input — sending even an empty `{}` body
    // makes the PDS reject it ("A request body was provided when none was
    // expected"). Omit the body so callPds sends a bodyless POST.
    const r = await callPds(g.did, "com.atproto.server.requestEmailUpdate", {
      method: "POST",
    })
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
      "[account/email] request-update error",
    )
    return NextResponse.json({ error: message }, { status })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const g = await gate()
    if ("error" in g) return g.error
    const csrfError = checkCsrf(request)
    if (csrfError) return csrfError

    const parsed = await parseJsonBody(request, "[account/email]")
    if (!parsed.ok) return parsed.response
    const { email, token } = (parsed.body ?? {}) as {
      email?: string
      token?: string
    }
    if (!email?.trim())
      return NextResponse.json({ error: "Email is required" }, { status: 400 })

    const body: { email: string; token?: string } = { email: email.trim() }
    if (token?.trim()) body.token = token.trim()

    const r = await callPds(g.did, "com.atproto.server.updateEmail", {
      method: "POST",
      body,
    })
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
      "[account/email] update error",
    )
    return NextResponse.json({ error: message }, { status })
  }
}
