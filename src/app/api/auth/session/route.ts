import { NextResponse } from "next/server"
import { getOAuthClient } from "@/lib/auth/oauth-client"
import { getSessionDid, deleteSession } from "@/lib/auth/session"

export async function GET() {
  const did = await getSessionDid()

  if (!did) {
    return NextResponse.json({ did: null })
  }

  try {
    const client = await getOAuthClient()
    await client.restore(did)
    return NextResponse.json({ did })
  } catch {
    await deleteSession()
    return NextResponse.json({ did: null })
  }
}
