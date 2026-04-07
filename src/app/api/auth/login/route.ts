import { NextRequest, NextResponse } from "next/server"
import { getOAuthClient, PDS_URL } from "@/lib/auth/oauth-client"
import { checkCsrf } from "@/lib/auth/csrf"

export async function POST(request: NextRequest) {
  const csrfError = checkCsrf(request)
  if (csrfError) return csrfError

  try {
    const body = await request.json()
    const { input: rawInput, mode, prompt } = body as {
      input: string
      mode: "email" | "handle"
      prompt?: "login" | "create"
    }

    if (typeof rawInput !== "string" || (mode !== "email" && mode !== "handle")) {
      return NextResponse.json({ error: "Invalid input or mode" }, { status: 400 })
    }

    // Strip invisible Unicode characters and whitespace that can sneak in via clipboard paste
    const stripped = rawInput.replace(/[\u200B-\u200F\u2028-\u202F\u2060-\u206F\uFEFF\u00AD\u034F\u061C\u180E\s]/g, '')
    const input = mode === "handle" ? stripped.replace(/^@/, '') : stripped.toLowerCase()

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
    return NextResponse.json({ error: "Authentication failed" }, { status: 400 })
  }
}
