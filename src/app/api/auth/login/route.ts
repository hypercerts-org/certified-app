import { NextRequest, NextResponse } from "next/server"
import { getOAuthClient, PDS_URL } from "@/lib/auth/oauth-client"
import { checkCsrf } from "@/lib/auth/csrf"

export async function POST(request: NextRequest) {
  const csrfError = checkCsrf(request)
  if (csrfError) return csrfError

  try {
    const body = await request.json()
    const { input, mode, prompt } = body as {
      input: string
      mode: "email" | "handle"
      prompt?: "login" | "create"
    }

    const client = await getOAuthClient()

    if (mode === "email") {
      const url = await client.authorize(PDS_URL, {
        scope: "atproto transition:generic identity:handle account:email",
        prompt: prompt || "login",
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
    const message = err instanceof Error ? err.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
