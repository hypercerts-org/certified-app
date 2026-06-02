import { NextRequest, NextResponse } from "next/server"
import { Agent, type ComAtprotoRepoPutRecord } from "@atproto/api"
import { getOAuthClient } from "@/lib/auth/oauth-client"
import { createSession, deleteSession } from "@/lib/auth/session"
import { logSafe } from "@/lib/utils/log-safe"
import { enforceRateLimit, makeLimiter } from "@/lib/auth/rate-limit"
import { clientIp } from "@/lib/utils/ip"

/**
 * Collections that should always have a "self" record after sign-in.
 *
 * INVARIANT: certified-app must NEVER write `app.bsky.actor.profile`.
 * Seeding an empty bsky profile here clobbers the user's existing Bluesky
 * profile (avatar, banner, display name) — the avatar-data-loss bug. This
 * array is the loop's only consumer, so it is the sole gate on what we seed.
 */
const PROFILE_COLLECTIONS = ["app.certified.actor.profile"]

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
    } catch (err) {
      // Only seed on a GENUINE record-not-found. Any other failure
      // (5xx / network / timeout / rate-limit) leaves the existing-record
      // question UNKNOWN — seeding then would risk overwriting a record
      // that's actually present, so we must not putRecord. The atproto SDK
      // surfaces the discriminator on `err.error` (an XRPCError whose
      // `.error === "RecordNotFound"`); we match the error-NAME string
      // rather than `instanceof` so a structurally-equal error from any SDK
      // layer still counts. See ComAtprotoRepoGetRecord.RecordNotFoundError.
      if (!isRecordNotFound(err)) {
        logSafe("[auth] profile getRecord failed (not seeding)", err, {
          did,
          collection,
        })
        continue
      }
      // Record genuinely absent — create an empty one.
      try {
        const input: ComAtprotoRepoPutRecord.InputSchema = {
          repo: did,
          collection,
          rkey: "self",
          // Belt-and-suspenders: create-if-absent only. `swapRecord: null`
          // tells the PDS to reject the write if a record already exists at
          // (collection, rkey), so a TOCTOU race or a misclassified error
          // can never clobber existing profile data.
          swapRecord: null,
          record: {
            $type: collection,
            createdAt: now,
          },
        }
        await agent.com.atproto.repo.putRecord(input)
      } catch (putErr) {
        logSafe("[auth] profile putRecord failed", putErr, { did, collection })
      }
    }
  }
}

/**
 * True iff `err` is a genuine "record not found" from the PDS — i.e. the
 * record really is absent and seeding is safe. The atproto SDK throws an
 * `XRPCError` carrying the lexicon error discriminator on `.error`
 * (`ComAtprotoRepoGetRecord.RecordNotFoundError` sets `.error ===
 * "RecordNotFound"`). We match the error-NAME string rather than using
 * `instanceof`, so an equivalently-shaped error from any SDK/transport layer
 * still classifies correctly. Everything else (5xx, network, timeout, rate
 * limit, auth) returns false → caller must NOT seed.
 */
function isRecordNotFound(err: unknown): boolean {
  return (
    !!err &&
    typeof err === "object" &&
    (err as { error?: unknown }).error === "RecordNotFound"
  )
}
