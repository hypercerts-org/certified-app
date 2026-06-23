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
import { establish, end } from "@/lib/auth/app-password-session"

/**
 * Elevated-session lifecycle for app-password management (issue #223).
 *
 *   POST   — unlock: `{ password, authFactorToken? }` → open a short-lived
 *            password session (see `establish`). Returns a discriminated
 *            `{ status }` so the client can drive the 2FA / invalid-password
 *            UI without treating "wrong password" as an auth error.
 *   DELETE — lock: tear down the session (`deleteSession` + clear Redis).
 *
 * Gate order is auth → rate-limit(by DID) → CSRF → parse → validate →
 * execute, matching the `groups/register` template (rate-limit keys off the
 * session DID, which is only known after auth).
 */

// Tighter than the management limiter: bounds password-guessing attempts.
// 10 / 10 min per DID. The PDS rate-limits createSession too; this just
// keeps our app from hammering it. Keyed by DID rather than IP is correct
// here — `did` is the CALLER's own session DID, so a caller can only ever
// spend budget against (and guess the password of) the account they're
// already signed in as; you can't aim this at someone else's DID.
const UNLOCK_LIMITER = makeLimiter("apppw-unlock", 10, 600)
// Lock is cheap and idempotent; a light cap is plenty.
const LOCK_LIMITER = makeLimiter("apppw-lock", 30, 600)

export async function POST(request: NextRequest) {
  try {
    const did = await getSessionDid()
    if (!did)
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

    // Fail CLOSED on this credential-verification path. The shared
    // `enforceRateLimit` fails open (don't block legit traffic if Redis is
    // down) — fine for the read/write routes, but on the password-guessing
    // bound that's the wrong default: if we can't account for an attempt,
    // we don't allow it.
    let rate
    try {
      rate = await checkHttpRateLimit(UNLOCK_LIMITER, did)
    } catch {
      return NextResponse.json(
        { error: "Unlock is temporarily unavailable. Please try again shortly." },
        { status: 503 },
      )
    }
    if (!rate.allowed) return rateLimitResponse(rate)

    const csrfError = checkCsrf(request)
    if (csrfError) return csrfError

    const parsed = await parseJsonBody(request, "[account/app-passwords/session]")
    if (!parsed.ok) return parsed.response
    const { password, authFactorToken } = (parsed.body ?? {}) as {
      password?: unknown
      authFactorToken?: unknown
    }

    if (typeof password !== "string" || password.length === 0) {
      return NextResponse.json({ error: "Password is required" }, { status: 400 })
    }
    if (
      authFactorToken !== undefined &&
      (typeof authFactorToken !== "string" || authFactorToken.length > 256)
    ) {
      return NextResponse.json(
        { error: "Invalid authFactorToken" },
        { status: 400 },
      )
    }

    const result = await establish(
      did,
      password,
      typeof authFactorToken === "string" ? authFactorToken : undefined,
    )
    return NextResponse.json(result)
  } catch (err: unknown) {
    const { status, message } = extractRouteError(
      err,
      "[account/app-passwords/session] unlock error",
    )
    return NextResponse.json({ error: message }, { status })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const did = await getSessionDid()
    if (!did)
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

    const rateDenied = await enforceRateLimit(LOCK_LIMITER, did)
    if (rateDenied) return rateDenied

    const csrfError = checkCsrf(request)
    if (csrfError) return csrfError

    await end(did)
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const { status, message } = extractRouteError(
      err,
      "[account/app-passwords/session] lock error",
    )
    return NextResponse.json({ error: message }, { status })
  }
}
