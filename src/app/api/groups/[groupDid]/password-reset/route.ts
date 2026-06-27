import { NextRequest, NextResponse } from "next/server"
import { getSessionDid } from "@/lib/auth/session"
import { resolvePdsUrl } from "@/lib/atproto/did"
import { checkCsrf } from "@/lib/auth/csrf"
import { isValidDid } from "@/lib/utils/did"
import { extractRouteError, parseJsonBody } from "@/lib/utils/api"
import { enforceRateLimit, makeLimiter } from "@/lib/auth/rate-limit"
import { logSafe } from "@/lib/utils/log-safe"

/**
 * Group password reset (owner/admin), enter-email flow.
 *
 * The app can't read a group account's email (account-level info needs the
 * group's own session, which a non-self owner doesn't have), so the owner
 * supplies the email and we run atproto's standard, email-gated recovery
 * against the GROUP's PDS — unauthenticated, exactly like "forgot password".
 * This never touches the caller's own account.
 *
 *   POST { email }            → com.atproto.server.requestPasswordReset
 *   PUT  { token, password }  → com.atproto.server.resetPassword
 *
 * The reset code lands in the group's mailbox, so security rests on email
 * control (not on this route). We still require a signed-in caller + rate-limit
 * so the app isn't an open reset-spam relay.
 */
const LIMITER = makeLimiter("groups-pw-reset", 8, 600)

async function gate(
  request: NextRequest,
  groupDid: string,
): Promise<{ pds: string } | { error: NextResponse }> {
  const did = await getSessionDid()
  if (!did)
    return {
      error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }),
    }
  const rateDenied = await enforceRateLimit(LIMITER, did)
  if (rateDenied) return { error: rateDenied }
  const csrfError = checkCsrf(request)
  if (csrfError) return { error: csrfError }
  if (!isValidDid(groupDid))
    return {
      error: NextResponse.json({ error: "Invalid group DID" }, { status: 400 }),
    }
  const pds = await resolvePdsUrl(groupDid)
  if (!pds)
    return {
      error: NextResponse.json(
        { error: "Could not resolve the group's PDS" },
        { status: 502 },
      ),
    }
  return { pds }
}

async function forwardError(res: Response, fallback: string): Promise<string> {
  const data = (await res.json().catch(() => ({}))) as {
    message?: string
    error?: string
  }
  return data.message || data.error || fallback
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ groupDid: string }> },
) {
  try {
    const { groupDid } = await context.params
    const g = await gate(request, groupDid)
    if ("error" in g) return g.error

    const parsed = await parseJsonBody(request, "[groups/pw-reset/request]")
    if (!parsed.ok) return parsed.response
    const { email } = (parsed.body ?? {}) as { email?: string }
    if (!email?.trim())
      return NextResponse.json({ error: "Email is required" }, { status: 400 })

    const res = await fetch(
      `${g.pds}/xrpc/com.atproto.server.requestPasswordReset`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      },
    )
    if (!res.ok) {
      return NextResponse.json(
        { error: await forwardError(res, "Failed to send reset code") },
        { status: res.status },
      )
    }
    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    logSafe("[groups/pw-reset/request] failed", err)
    const { status, message } = extractRouteError(err)
    return NextResponse.json({ error: message }, { status })
  }
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ groupDid: string }> },
) {
  try {
    const { groupDid } = await context.params
    const g = await gate(request, groupDid)
    if ("error" in g) return g.error

    const parsed = await parseJsonBody(request, "[groups/pw-reset/confirm]")
    if (!parsed.ok) return parsed.response
    const { token, password } = (parsed.body ?? {}) as {
      token?: string
      password?: string
    }
    if (!token?.trim() || !password)
      return NextResponse.json(
        { error: "Reset code and new password are required" },
        { status: 400 },
      )

    const res = await fetch(`${g.pds}/xrpc/com.atproto.server.resetPassword`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: token.trim(), password }),
    })
    if (!res.ok) {
      return NextResponse.json(
        { error: await forwardError(res, "Failed to reset password") },
        { status: res.status },
      )
    }

    // resetPassword carries no DID — the token targets whatever account owns
    // the email that was entered, which we can't pre-verify (we can't read the
    // group's email). So confirm the reset actually applied to THIS group:
    // log in as the group DID with the new password. If it doesn't work, a
    // different account was reset and the group's password is unchanged.
    const verify = await fetch(
      `${g.pds}/xrpc/com.atproto.server.createSession`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: groupDid, password }),
      },
    )
    if (verify.ok) {
      // Tear down the throwaway session we just opened (best-effort).
      try {
        const sess = (await verify.json()) as { refreshJwt?: string }
        if (sess.refreshJwt) {
          await fetch(`${g.pds}/xrpc/com.atproto.server.deleteSession`, {
            method: "POST",
            headers: { Authorization: `Bearer ${sess.refreshJwt}` },
          })
        }
      } catch {
        // ignore cleanup failures
      }
      return NextResponse.json({ success: true })
    }
    // A correct password on a 2FA-enabled account surfaces as
    // AuthFactorTokenRequired — that still confirms it applied to the group.
    const verifyErr = (await verify.json().catch(() => ({}))) as {
      error?: string
    }
    if (verifyErr.error === "AuthFactorTokenRequired") {
      return NextResponse.json({ success: true })
    }
    return NextResponse.json(
      {
        error:
          "That reset code was for a different account, not this group — the group's password was not changed. Make sure you enter the group's own email.",
      },
      { status: 409 },
    )
  } catch (err: unknown) {
    logSafe("[groups/pw-reset/confirm] failed", err)
    const { status, message } = extractRouteError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
