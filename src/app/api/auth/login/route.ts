import { NextRequest, NextResponse } from "next/server"
import { getOAuthClient, PDS_URL } from "@/lib/auth/oauth-client"
import { getSessionDid } from "@/lib/auth/session"
import { checkCsrf } from "@/lib/auth/csrf"
import { sanitizeEmail, sanitizeHandle } from "@/lib/utils/sanitize"
import { resolveHandleToDid, resolveHandleViaWellKnown } from "@/lib/atproto/did"
import { parseJsonBody } from "@/lib/utils/api"
import { logSafe } from "@/lib/utils/log-safe"
import { enforceRateLimit, makeLimiter } from "@/lib/auth/rate-limit"
import { clientIp } from "@/lib/utils/ip"

// 30/min by IP. Bumped from #70's table-suggested 10/min to avoid
// breaking shared-NAT / CGNAT users where dozens of legitimate users
// share one egress IP (corporate, mobile carriers). Plan H4.
const LIMITER = makeLimiter("auth-login", 30, 60)

const HANDLE_SCOPE = "atproto transition:generic identity:handle account:email"

// judgment-001: `prompt` is forwarded into client.authorize and shapes the
// external OAuth authorization request, but the request body is untrusted.
// Coerce anything outside the allowlist to undefined (silent — no 400) so a
// caller can't slip in prompt=none / select_account / consent. Pure + exported
// for unit testing.
export function coercePrompt(prompt: unknown): "login" | "create" | undefined {
  return prompt === "login" || prompt === "create" ? prompt : undefined
}

// Two-fallback handle authorize: try the handle as-is, then with an
// `https://` prefix (PDS URL typed by the user), then via .well-known
// resolution for custom-domain handles without a DNS TXT record.
// Shared by the POST JSON path and the GET ?handle= ePDS hand-off.
async function authorizeHandleWithFallbacks(
  client: Awaited<ReturnType<typeof getOAuthClient>>,
  handle: string,
): Promise<URL> {
  try {
    return await client.authorize(handle, { scope: HANDLE_SCOPE })
  } catch (err) {
    if (handle.startsWith("http") || handle.startsWith("did")) throw err
    try {
      return await client.authorize("https://" + handle, { scope: HANDLE_SCOPE })
    } catch {
      const resolvedDid = await resolveHandleViaWellKnown(handle)
      if (!resolvedDid) throw err
      return await client.authorize(resolvedDid, { scope: HANDLE_SCOPE })
    }
  }
}

export async function POST(request: NextRequest) {
  // Rate-limit BEFORE CSRF (plan H6): the limiter is cheap (one
  // Redis INCR) and catches floods before they parse headers, and
  // pre-session bots hitting /api/auth/login don't have a CSRF
  // cookie yet — gating them on volume is the only available knob.
  const rateDenied = await enforceRateLimit(LIMITER, clientIp(request))
  if (rateDenied) return rateDenied

  const csrfError = checkCsrf(request)
  if (csrfError) return csrfError

  try {
    const parsed = await parseJsonBody(request, "[auth/login]")
    if (!parsed.ok) return parsed.response
    const { input: rawInput, mode, prompt } = (parsed.body ?? {}) as {
      input?: string
      mode?: "email" | "handle" | "default"
      prompt?: "login" | "create"
    }

    if (mode !== "email" && mode !== "handle" && mode !== "default") {
      return NextResponse.json({ error: "Invalid mode" }, { status: 400 })
    }

    const safePrompt = coercePrompt(prompt)

    const client = await getOAuthClient()

    // Silent-default: bounce straight to the Certified PDS authorization
    // server with no login_hint. If the user already has a session at
    // the PDS (e.g. signed in via another partner app on this browser),
    // the auth server returns a code immediately. Otherwise the PDS
    // shows its own login UI. No email/handle input required here.
    if (mode === "default") {
      const url = await client.authorize(PDS_URL, {
        scope: "atproto transition:generic identity:handle account:email",
        ...(safePrompt ? { prompt: safePrompt } : {}),
      })
      // ePDS reads `prompt` from the authorize URL query, not the PAR body
      // (which `client.authorize` puts it in) — so a PAR-only prompt is
      // silently ignored and the account chooser still shows. Mirror it onto
      // the URL so forcing a fresh sign-in actually engages. (epds-login skill)
      if (safePrompt) url.searchParams.set("prompt", safePrompt)
      return NextResponse.json({ url: url.href })
    }

    if (typeof rawInput !== "string") {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 })
    }

    const input = mode === "handle" ? sanitizeHandle(rawInput) : sanitizeEmail(rawInput)
    const maxLen = mode === "handle" ? 253 : 254
    if (input.length > maxLen) {
      return NextResponse.json({ error: `Input too long (max ${maxLen} characters)` }, { status: 400 })
    }

    if (mode === "email") {
      const url = await client.authorize(PDS_URL, {
        scope: "atproto transition:generic identity:handle account:email",
        ...(safePrompt ? { prompt: safePrompt } : {}),
      })
      url.searchParams.set("login_hint", input)
      // ePDS honors `prompt` only on the authorize URL query (PAR body is
      // ignored) — mirror it so a forced fresh sign-in engages. (epds-login)
      if (safePrompt) url.searchParams.set("prompt", safePrompt)
      return NextResponse.json({ url: url.href })
    }

    if (mode === "handle") {
      // Fast path: if the user already has an active app session for
      // the same DID, try to restore the OAuth session from Redis
      // instead of redirecting to the PDS. This avoids the consent
      // screen for returning users (issue #47).
      try {
        const existingDid = await getSessionDid()
        if (existingDid) {
          const resolvedDid = await resolveHandleToDid(input)
          if (resolvedDid && resolvedDid === existingDid) {
            await client.restore(resolvedDid)
            return NextResponse.json({ restored: true, did: resolvedDid })
          }
        }
      } catch {
        // Restore failed (expired, revoked, etc.) — fall through to authorize
      }

      // Standard path: full OAuth redirect via the PDS. The OAuth
      // client's primary handle resolver (certified.one) only handles
      // certified.one-hosted handles and handles with a DNS TXT
      // record; custom-domain handles using .well-known/atproto-did
      // need the second-fallback resolution that
      // authorizeHandleWithFallbacks does.
      const url = await authorizeHandleWithFallbacks(client, input)
      return NextResponse.json({ restored: false, url: url.href })
    }

    return NextResponse.json({ error: "Invalid mode" }, { status: 400 })
  } catch (err) {
    logSafe("[auth/login] error", err)
    return NextResponse.json({ error: "Authentication failed" }, { status: 500 })
  }
}

// ePDS handle-mode hand-off. Wired up via `epds_handle_login_url` in
// the OAuth client metadata. When a user clicks "Or sign in with
// ATProto/Bluesky" on the ePDS login page and types a handle, ePDS
// navigates the browser here with ?handle=<value>; we resolve the
// handle to its PDS and start a fresh OAuth flow against that PDS.
//
// No CSRF (no state-changing body — the OAuth state param protects
// the round-trip). Same per-IP rate limit as the POST path.
export async function GET(request: NextRequest) {
  const rateDenied = await enforceRateLimit(LIMITER, clientIp(request))
  if (rateDenied) return rateDenied

  const raw = request.nextUrl.searchParams.get("handle")
  if (!raw) {
    return NextResponse.redirect(new URL("/welcome", request.url), { status: 302 })
  }

  const handle = sanitizeHandle(raw)
  if (!handle || handle.length > 253) {
    return NextResponse.redirect(
      new URL("/welcome?error=invalid_handle", request.url),
      { status: 302 },
    )
  }

  try {
    const client = await getOAuthClient()
    const url = await authorizeHandleWithFallbacks(client, handle)
    return NextResponse.redirect(url, { status: 302 })
  } catch (err) {
    logSafe("[auth/login] GET error", err)
    return NextResponse.redirect(
      new URL("/welcome?error=auth_failed", request.url),
      { status: 302 },
    )
  }
}
