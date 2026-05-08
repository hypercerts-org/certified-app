import { NextRequest, NextResponse } from "next/server"
import { getOAuthClient, PDS_URL } from "@/lib/auth/oauth-client"
import { checkCsrf } from "@/lib/auth/csrf"
import { sanitizeEmail, sanitizeHandle } from "@/lib/utils/sanitize"

export async function POST(request: NextRequest) {
  const csrfError = checkCsrf(request)
  if (csrfError) return csrfError

  try {
    const body = await request.json()
    const { input: rawInput, mode, prompt } = body as {
      input?: string
      mode: "email" | "handle" | "default"
      prompt?: "login" | "create"
    }

    if (mode !== "email" && mode !== "handle" && mode !== "default") {
      return NextResponse.json({ error: "Invalid mode" }, { status: 400 })
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
