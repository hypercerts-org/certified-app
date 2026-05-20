import { NextRequest, NextResponse } from "next/server"
import { getOAuthClient, PDS_URL } from "@/lib/auth/oauth-client"
import { checkCsrf } from "@/lib/auth/csrf"
import { sanitizeEmail, sanitizeHandle } from "@/lib/utils/sanitize"

export async function POST(request: NextRequest) {
  const csrfError = checkCsrf(request)
  if (csrfError) return csrfError

  try {
    const body: unknown = await request.json()
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
    }
    const { input: rawInput, mode, prompt } = body as {
      input?: unknown
      mode?: unknown
      prompt?: unknown
    }

    if (mode !== "email" && mode !== "handle" && mode !== "default") {
      return NextResponse.json({ error: "Invalid mode" }, { status: 400 })
    }

    if (prompt !== undefined && prompt !== "login" && prompt !== "create") {
      return NextResponse.json({ error: "Invalid prompt" }, { status: 400 })
    }

    if ((mode === "email" || mode === "handle") && typeof rawInput !== "string") {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 })
    }

    const client = await getOAuthClient()

    // Default mode: bounce straight to the Certified PDS authorization server with
    // no login_hint. If the user already has a session at the PDS (e.g. they signed
    // in via another partner app on this browser), the auth server can return a code
    // immediately without asking for credentials. Otherwise the PDS shows its own
    // login UI. Either way, we never have to collect an email here.
    if (mode === "default") {
      const url = await client.authorize(PDS_URL, {
        scope: "atproto transition:generic identity:handle account:email",
        ...(prompt ? { prompt } : {}),
      })
      return NextResponse.json({ url: url.href })
    }

    const input = mode === "handle"
      ? sanitizeHandle(rawInput as string)
      : sanitizeEmail(rawInput as string)

    if (!input) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 })
    }

    if (mode === "email") {
      const url = await client.authorize(PDS_URL, {
        scope: "atproto transition:generic identity:handle account:email",
        ...(prompt ? { prompt } : {}),
      })
      url.searchParams.set("login_hint", input)
      return NextResponse.json({ url: url.href })
    }

    if (mode === "handle") {
      let url: URL
      try {
        url = await client.authorize(input, {
          scope: "atproto transition:generic identity:handle account:email",
        })
      } catch (err) {
        if (!input.startsWith("http") && !input.startsWith("did")) {
          url = await client.authorize("https://" + input, {
            scope: "atproto transition:generic identity:handle account:email",
          })
        } else {
          throw err
        }
      }
      return NextResponse.json({ url: url.href })
    }

    return NextResponse.json({ error: "Invalid mode" }, { status: 400 })
  } catch (err) {
    console.error("[Auth] Login error:", err)
    return NextResponse.json({ error: "Authentication failed" }, { status: 500 })
  }
}

// ePDS handle-mode hand-off. Wired up via `epds_handle_login_url` in
// the OAuth client metadata. When a user clicks "Or sign in with
// ATProto/Bluesky" on the ePDS login page and types a handle, ePDS
// navigates the browser here with ?handle=<value>; we resolve the
// handle to its PDS and start a fresh OAuth flow against it.
//
// No CSRF: no state-changing body to forge — the OAuth state param
// protects the round-trip.
export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("handle")
  if (!raw) {
    return NextResponse.redirect(new URL("/", request.url), { status: 302 })
  }

  const handle = sanitizeHandle(raw)
  if (!handle) {
    return NextResponse.redirect(new URL("/?error=invalid_handle", request.url), { status: 302 })
  }

  try {
    const client = await getOAuthClient()
    const scope = "atproto transition:generic identity:handle account:email"
    let url: URL
    try {
      url = await client.authorize(handle, { scope })
    } catch (err) {
      if (!handle.startsWith("http") && !handle.startsWith("did")) {
        url = await client.authorize("https://" + handle, { scope })
      } else {
        throw err
      }
    }
    return NextResponse.redirect(url, { status: 302 })
  } catch (err) {
    console.error("[Auth] Handle login error:", err)
    return NextResponse.redirect(new URL("/?error=auth_failed", request.url), { status: 302 })
  }
}
