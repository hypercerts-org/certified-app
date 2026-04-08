/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server"
import { Agent } from "@atproto/api"
import { getOAuthClient } from "@/lib/auth/oauth-client"
import { createSession, deleteSession } from "@/lib/auth/session"

/** Collections that should always have a "self" record after sign-in */
const PROFILE_COLLECTIONS = [
  "app.certified.actor.profile",
  "app.bsky.actor.profile",
]

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams

    const client = await getOAuthClient()
    const { session } = await client.callback(params)

    // Invalidate any existing session to prevent session fixation
    await deleteSession().catch((err) => console.error("[Auth] Old session cleanup failed:", err))
    await createSession(session.did)

    // Best-effort: ensure profile records exist (don't fail sign-in if this errors)
    try {
      const oauthSession = await client.restore(session.did)
      const agent = new Agent(oauthSession)
      await ensureProfileRecords(agent, session.did)
    } catch (err) {
      console.error("[Auth] Profile seeding failed for", session.did, err)
    }

    return NextResponse.json({ did: session.did })
  } catch (err) {
    console.error("[Auth] Callback error:", err)
    return NextResponse.json({ error: "Authentication failed" }, { status: 500 })
  }
}

/**
 * For each profile collection, check if a "self" record exists.
 * If not, create an empty one with only createdAt set.
 */
async function ensureProfileRecords(agent: Agent, did: string) {
  const now = new Date().toISOString()

  for (const collection of PROFILE_COLLECTIONS) {
    try {
      await agent.com.atproto.repo.getRecord({
        repo: did,
        collection,
        rkey: "self",
      })
      // Record exists — nothing to do
    } catch {
      // Record missing or error — try to create it
      try {
        await agent.com.atproto.repo.putRecord({
          repo: did,
          collection,
          rkey: "self",
          record: {
            $type: collection,
            createdAt: now,
          },
        } as any)
      } catch {
        // Silently ignore — best effort
      }
    }
  }
}
