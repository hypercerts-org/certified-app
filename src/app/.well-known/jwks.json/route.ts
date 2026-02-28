import { NextResponse } from "next/server"
import { getOAuthClient } from "@/lib/auth/oauth-client"

export async function GET() {
  const client = await getOAuthClient()
  return NextResponse.json(client.jwks, {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=600",
    },
  })
}
