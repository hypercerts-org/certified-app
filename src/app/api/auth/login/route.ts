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
      mode?: "email" | "handle"
      prompt?: "login" | "create"
    }

    if (typeof rawInput !== "string" || (mode !== "email" && mode !== "handle")) {
      return NextResponse.json({ error: "Invalid input or mode" }, { status: 400 })
    }

    const input = mode === "handle" ? sanitizeHandle(rawInput) : sanitizeEmail(rawInput)
    const maxLen = mode === "handle" ? 253 : 254
    if (input.length > maxLen) {
      return NextResponse.json({ error: `Input too long (max ${maxLen} characters)` }, { status: 400 })
    }

    const client = await getOAuthClient()

    if (mode === "email") {
      const url = await client.authorize(PDS_URL, {
        scope: "atproto transition:generic identity:handle account:email",
        ...(prompt ? { prompt } : {}),
      })
      url.searchParams.set("login_hint", input)
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

      // Standard path: full OAuth redirect via the PDS.
      //
      // The OAuth client resolves the handle using the configured
      // handleResolver (certified.one). This works for handles hosted
      // on certified.one and for handles with a DNS TXT record at
      // `_atproto.<handle>`, but fails for handles that only publish
      // their DID via `.well-known/atproto-did` (e.g. custom domains
      // pointed at a Bluesky PDS). When the primary resolution fails,
      // we resolve the handle ourselves and retry with the DID.
      let url: URL
      try {
        url = await client.authorize(input, {
          scope: "atproto transition:generic identity:handle account:email",
        })
      } catch (err) {
        // Fallback 1: try as a URL (e.g. user typed a PDS URL)
        if (!input.startsWith("http") && !input.startsWith("did")) {
          try {
            url = await client.authorize("https://" + input, {
              scope: "atproto transition:generic identity:handle account:email",
            })
          } catch {
            // Fallback 2: resolve via .well-known/atproto-did and retry with the DID.
            // This handles custom-domain handles (e.g. holke.xyz) that
            // don't have a DNS TXT record and aren't hosted on our PDS.
            const resolvedDid = await resolveHandleViaWellKnown(input)
            if (resolvedDid) {
              url = await client.authorize(resolvedDid, {
                scope: "atproto transition:generic identity:handle account:email",
              })
            } else {
              throw err // throw the original error
            }
          }
        } else {
          throw err
        }
      }
      return NextResponse.json({ restored: false, url: url.href })
    }

    return NextResponse.json({ error: "Invalid mode" }, { status: 400 })
  } catch (err) {
    logSafe("[auth/login] error", err)
    return NextResponse.json({ error: "Authentication failed" }, { status: 500 })
  }
}
