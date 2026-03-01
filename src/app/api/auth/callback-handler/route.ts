import { NextRequest, NextResponse } from "next/server"
import { getOAuthClient } from "@/lib/auth/oauth-client"
import { createSession } from "@/lib/auth/session"

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams

    const client = await getOAuthClient()
    const { session } = await client.callback(params)

    await createSession(session.did)

    return NextResponse.json({ did: session.did })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
