import { NextRequest, NextResponse } from "next/server"
import { getSessionDid } from "@/lib/auth/session"
import { checkCsrf } from "@/lib/auth/csrf"
import { enforceRateLimit, makeLimiter } from "@/lib/auth/rate-limit"
import { parseJsonBody, extractRouteError } from "@/lib/utils/api"
import { callPds } from "@/lib/auth/app-password-session"

/**
 * Confirm the SIGNED-IN user's CURRENT email, through the same elevated
 * session as `/api/account/email` (see that route for why email ops can't
 * ride the OAuth session).
 *
 * The change flow leaves the new address unconfirmed; this verifies the
 * user actually controls it:
 *
 *   POST → { }              (requestEmailConfirmation; emails the CURRENT
 *          address — i.e. the just-set new one — a code)
 *   PUT  { email, token }   (confirmEmail; email must be the current address)
 *
 * Returns `401 { error: "locked" }` when the elevated session isn't open, so
 * the UI can drop back to the unlock gate.
 */
const LIMITER = makeLimiter("acct-email-confirm", 20, 600)

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

export async function POST(request: NextRequest) {
  try {
    const g = await gate()
    if ("error" in g) return g.error
    const csrfError = checkCsrf(request)
    if (csrfError) return csrfError

    // requestEmailConfirmation takes NO input — omit the body so callPds
    // sends a bodyless POST (an empty `{}` makes the PDS reject it).
    const r = await callPds(
      g.did,
      "com.atproto.server.requestEmailConfirmation",
      { method: "POST" },
    )
    if (r.kind === "locked") return locked()
    if (!r.response.ok)
      return NextResponse.json(
        {
          error: await forwardError(
            r.response,
            "Failed to send the confirmation code",
          ),
        },
        { status: r.response.status },
      )
    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    const { status, message } = extractRouteError(
      err,
      "[account/email/confirm] request error",
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

    const parsed = await parseJsonBody(request, "[account/email/confirm]")
    if (!parsed.ok) return parsed.response
    const { email, token } = (parsed.body ?? {}) as {
      email?: string
      token?: string
    }
    if (!email?.trim() || !token?.trim())
      return NextResponse.json(
        { error: "Email and code are required" },
        { status: 400 },
      )

    const r = await callPds(g.did, "com.atproto.server.confirmEmail", {
      method: "POST",
      body: { email: email.trim(), token: token.trim() },
    })
    if (r.kind === "locked") return locked()
    if (!r.response.ok)
      return NextResponse.json(
        { error: await forwardError(r.response, "Failed to confirm your email") },
        { status: r.response.status },
      )
    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    const { status, message } = extractRouteError(
      err,
      "[account/email/confirm] confirm error",
    )
    return NextResponse.json({ error: message }, { status })
  }
}
