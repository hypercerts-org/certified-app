import { NextRequest, NextResponse } from "next/server"
import { getSessionDid } from "@/lib/auth/session"
import { checkCsrf } from "@/lib/auth/csrf"
import { enforceRateLimit, makeLimiter } from "@/lib/auth/rate-limit"
import { parseJsonBody, extractRouteError } from "@/lib/utils/api"
import { logSafe } from "@/lib/utils/log-safe"
import { callPds } from "@/lib/auth/app-password-session"

/**
 * App-password list + create, run through the caller's elevated session
 * (issue #223).
 *
 *   GET  — list the account's app passwords.
 *   POST — create one: `{ name }` → returns the one-time secret.
 *
 * Both require an unlocked elevated session; without one (or once it
 * expires) they return `401 { error: "locked" }` so the UI drops back to
 * the locked gate. GET is a read, so it skips CSRF; POST is a mutation and
 * runs the full gate.
 */

// Shared per-DID budget for list/create/revoke. Generous — a user managing
// their app passwords does a handful of ops; this only trips a script.
const MANAGE_LIMITER = makeLimiter("apppw-manage", 60, 600)
const MAX_NAME_LENGTH = 100

const LOCKED = () =>
  NextResponse.json({ error: "locked" }, { status: 401 })

export async function GET() {
  try {
    const did = await getSessionDid()
    if (!did)
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

    const rateDenied = await enforceRateLimit(MANAGE_LIMITER, did)
    if (rateDenied) return rateDenied

    const result = await callPds(did, "com.atproto.server.listAppPasswords")
    if (result.kind === "locked") return LOCKED()

    const { response } = result
    if (!response.ok) {
      logSafe("[account/app-passwords] list upstream error", undefined, {
        status: response.status,
      })
      return NextResponse.json(
        { error: "Failed to load app passwords" },
        { status: 502 },
      )
    }
    const data = (await response.json()) as {
      passwords?: { name: string; createdAt: string }[]
    }
    return NextResponse.json({ passwords: data.passwords ?? [] })
  } catch (err: unknown) {
    const { status, message } = extractRouteError(
      err,
      "[account/app-passwords] list error",
    )
    return NextResponse.json({ error: message }, { status })
  }
}

export async function POST(request: NextRequest) {
  try {
    const did = await getSessionDid()
    if (!did)
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

    const rateDenied = await enforceRateLimit(MANAGE_LIMITER, did)
    if (rateDenied) return rateDenied

    const csrfError = checkCsrf(request)
    if (csrfError) return csrfError

    const parsed = await parseJsonBody(request, "[account/app-passwords]")
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

    const result = await callPds(did, "com.atproto.server.createAppPassword", {
      method: "POST",
      body: { name },
    })
    if (result.kind === "locked") return LOCKED()

    const { response } = result
    if (!response.ok) {
      // Forward a structured atproto error (e.g. a duplicate-name conflict)
      // so the client can show something actionable, but never the raw body.
      let message = "Failed to create app password"
      try {
        const data = (await response.json()) as {
          error?: string
          message?: string
        }
        if (typeof data.message === "string") message = data.message
        else if (typeof data.error === "string") message = data.error
      } catch {
        // keep the default
      }
      const status = response.status >= 500 ? 502 : response.status
      return NextResponse.json({ error: message }, { status })
    }
    const created = (await response.json()) as {
      name: string
      password: string
      createdAt: string
    }
    return NextResponse.json(created)
  } catch (err: unknown) {
    const { status, message } = extractRouteError(
      err,
      "[account/app-passwords] create error",
    )
    return NextResponse.json({ error: message }, { status })
  }
}
