import { NextRequest, NextResponse } from "next/server"
import { Agent, type ComAtprotoRepoPutRecord } from "@atproto/api"
import { getOAuthClient } from "@/lib/auth/oauth-client"
import { createSession, deleteSession } from "@/lib/auth/session"
import { logSafe } from "@/lib/utils/log-safe"
import { enforceRateLimit, makeLimiter } from "@/lib/auth/rate-limit"
import { clientIp } from "@/lib/utils/ip"

/** Collections that should always have a "self" record after sign-in */
const PROFILE_COLLECTIONS = [
  "app.certified.actor.profile",
  "app.bsky.actor.profile",
]

// 20/min by IP — the OAuth callback completes the PDS handshake;
// legitimate users hit it once per sign-in. Higher than zero to
// allow retries on transient PDS hiccups + multi-tab races.
const LIMITER = makeLimiter("auth-callback", 20, 60)

export async function GET(request: NextRequest) {
  const rateDenied = await enforceRateLimit(LIMITER, clientIp(request))
  if (rateDenied) return rateDenied

  try {
    const params = request.nextUrl.searchParams

    const client = await getOAuthClient()
    const { session } = await client.callback(params)

    // Invalidate any existing session to prevent session fixation.
    // Swallowing the failure is safe: createSession below overwrites the
    // session cookie, so a failed deleteSession can only orphan a TTL'd
    // Redis key (which expires on its own) — not leave a fixable session.
    await deleteSession().catch((err) =>
      logSafe("[auth] old session cleanup failed", err)
    )
    await createSession(session.did)

    // Best-effort: ensure profile records exist (don't fail sign-in if this errors)
    try {
      const oauthSession = await client.restore(session.did)
      const agent = new Agent(oauthSession)
      await ensureProfileRecords(agent, session.did)
    } catch (err) {
      logSafe("[auth] profile seeding failed", err, { did: session.did })
    }

    return NextResponse.json({ did: session.did })
  } catch (err) {
    logSafe("[auth] callback error", err)
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
        const input: ComAtprotoRepoPutRecord.InputSchema = {
          repo: did,
          collection,
          rkey: "self",
          record: {
            $type: collection,
            createdAt: now,
          },
        }
        await agent.com.atproto.repo.putRecord(input)
      } catch {
        // Silently ignore — best effort
      }
    }
  }
}
