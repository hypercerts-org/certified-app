import { NextResponse } from "next/server"
import { getOAuthClient } from "@/lib/auth/oauth-client"
import { getSessionDid, deleteSession } from "@/lib/auth/session"

export async function POST() {
  const did = await getSessionDid()

  if (did) {
    try {
      const client = await getOAuthClient()
      const oauthSession = await client.restore(did)
      await oauthSession.signOut()
    } catch {
      // Session may already be invalid — ignore errors
    }
  }

  await deleteSession()

  return NextResponse.json({ ok: true })
}
