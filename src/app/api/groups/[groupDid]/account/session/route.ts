import { NextRequest, NextResponse } from "next/server"
import { getSessionDid } from "@/lib/auth/session"
import { checkCsrf } from "@/lib/auth/csrf"
import {
  checkHttpRateLimit,
  enforceRateLimit,
  makeLimiter,
  rateLimitResponse,
} from "@/lib/auth/rate-limit"
import { parseJsonBody, extractRouteError } from "@/lib/utils/api"
import { isValidDid } from "@/lib/utils/did"
import { establish, end } from "@/lib/auth/group-account-session"

/**
 * Elevated GROUP-account session (owner/admin who knows the group's password).
 * Same short-lived, non-persistent shape as the app-password unlock — a
 * ~10-minute session, cleared on lock — but opened against the group account so
 * its email can be read + changed. See `group-account-session`.
 *
 *   POST   — unlock: `{ password, authFactorToken? }` → `{ status }`.
 *   DELETE — lock: tear down the session.
 *
 * Gate: auth → rate-limit(by caller DID) → CSRF → parse → execute.
 */
const UNLOCK_LIMITER = makeLimiter("groupacct-unlock", 10, 600)
// Per-TARGET bucket keyed on the group DID being unlocked. The per-caller
// bucket alone lets an attacker with N caller DIDs get 10N guesses against one
// victim; this caps aggregate attempts against a single account regardless of
// how many caller DIDs are spun up. Deny if EITHER bucket trips.
const UNLOCK_TARGET_LIMITER = makeLimiter("groupacct-unlock-target", 20, 600)
const LOCK_LIMITER = makeLimiter("groupacct-lock", 30, 600)

export async function POST(
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

    // Fail CLOSED on this password-verification path (bounds guessing): if we
    // can't account for the attempt, don't allow it. Check the per-caller and
    // per-target buckets together (both INCR so a burst attacker stays on
    // trajectory) and deny if EITHER trips.
    let rates
    try {
      rates = await Promise.all([
        checkHttpRateLimit(UNLOCK_LIMITER, did),
        checkHttpRateLimit(UNLOCK_TARGET_LIMITER, groupDid),
      ])
    } catch {
      return NextResponse.json(
        {
          error:
            "Unlock is temporarily unavailable. Please try again shortly.",
        },
        { status: 503 },
      )
    }
    const denied = rates.find((r) => !r.allowed)
    if (denied) return rateLimitResponse(denied)

    const csrfError = checkCsrf(request)
    if (csrfError) return csrfError

    const parsed = await parseJsonBody(request, "[groups/account/session]")
    if (!parsed.ok) return parsed.response
    const { password, authFactorToken } = (parsed.body ?? {}) as {
      password?: unknown
      authFactorToken?: unknown
    }
    if (typeof password !== "string" || password.length === 0)
      return NextResponse.json({ error: "Password is required" }, { status: 400 })
    if (
      authFactorToken !== undefined &&
      (typeof authFactorToken !== "string" || authFactorToken.length > 256)
    )
      return NextResponse.json(
        { error: "Invalid authFactorToken" },
        { status: 400 },
      )

    const result = await establish(
      did,
      groupDid,
      password,
      typeof authFactorToken === "string" ? authFactorToken : undefined,
    )
    return NextResponse.json(result)
  } catch (err: unknown) {
    const { status, message } = extractRouteError(
      err,
      "[groups/account/session] unlock error",
    )
    return NextResponse.json({ error: message }, { status })
  }
}

export async function DELETE(
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

    const rateDenied = await enforceRateLimit(LOCK_LIMITER, did)
    if (rateDenied) return rateDenied

    const csrfError = checkCsrf(request)
    if (csrfError) return csrfError

    await end(did, groupDid)
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const { status, message } = extractRouteError(
      err,
      "[groups/account/session] lock error",
    )
    return NextResponse.json({ error: message }, { status })
  }
}
