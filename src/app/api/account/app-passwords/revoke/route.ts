import { NextRequest, NextResponse } from "next/server"
import { getSessionDid } from "@/lib/auth/session"
import { checkCsrf } from "@/lib/auth/csrf"
import { enforceRateLimit, makeLimiter } from "@/lib/auth/rate-limit"
import { parseJsonBody, extractRouteError } from "@/lib/utils/api"
import { logSafe } from "@/lib/utils/log-safe"
import { callPds } from "@/lib/auth/app-password-session"

/**
 * Revoke an app password through the caller's elevated session (issue #223).
 * `POST { name }`. Like list/create, returns `401 { error: "locked" }` when
 * the session is gone so the UI re-prompts.
 */

const MANAGE_LIMITER = makeLimiter("apppw-manage", 60, 600)
const MAX_NAME_LENGTH = 100

export async function POST(request: NextRequest) {
  try {
    const did = await getSessionDid()
    if (!did)
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

    const rateDenied = await enforceRateLimit(MANAGE_LIMITER, did)
    if (rateDenied) return rateDenied

    const csrfError = checkCsrf(request)
    if (csrfError) return csrfError

    const parsed = await parseJsonBody(request, "[account/app-passwords/revoke]")
    if (!parsed.ok) return parsed.response
    const { name: rawName } = (parsed.body ?? {}) as { name?: unknown }

    if (typeof rawName !== "string") {
      return NextResponse.json({ error: "name is required" }, { status: 400 })
    }
    const name = rawName.trim()
    if (name.length === 0 || name.length > MAX_NAME_LENGTH) {
      return NextResponse.json(
        { error: "name must be 1–100 characters" },
        { status: 400 },
      )
    }

    const result = await callPds(did, "com.atproto.server.revokeAppPassword", {
      method: "POST",
      body: { name },
    })
    if (result.kind === "locked")
      return NextResponse.json({ error: "locked" }, { status: 401 })

    const { response } = result
    if (!response.ok) {
      logSafe("[account/app-passwords/revoke] upstream error", undefined, {
        status: response.status,
      })
      return NextResponse.json(
        { error: "Failed to revoke app password" },
        { status: response.status >= 500 ? 502 : response.status },
      )
    }
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const { status, message } = extractRouteError(
      err,
      "[account/app-passwords/revoke] error",
    )
    return NextResponse.json({ error: message }, { status })
  }
}
