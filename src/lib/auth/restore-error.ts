import { NextResponse } from "next/server"
import {
  TokenInvalidError,
  TokenRefreshError,
  TokenRevokedError,
} from "@atproto/oauth-client-node"
import { RequestLockTimeoutError } from "./request-lock"
import { RedisSessionStore } from "./stores"

// The client's CachedGetter swallows session-store read errors and treats
// them as "no stored session", so an Upstash blip and a genuinely deleted
// session both surface as this TokenRefreshError.
const MISSING_SESSION = "The session was deleted by another process"

/**
 * Whether a failed `client.restore(did)` means the OAuth session is really
 * gone (delete the app session, answer 401) rather than temporarily
 * unreachable (keep it, answer 503).
 *
 * Callers used to delete the session on any restore error, so a short
 * outage fetching the authorization server's metadata, an Upstash error or
 * a request-lock timeout signed the user out (TECH-807).
 */
export async function isSessionGone(err: unknown, did: string): Promise<boolean> {
  if (err instanceof RequestLockTimeoutError) return false

  if (err instanceof TokenRefreshError && err.message === MISSING_SESSION) {
    try {
      return (await new RedisSessionStore().get(did)) === undefined
    } catch {
      return false
    }
  }

  if (
    err instanceof TokenRefreshError ||
    err instanceof TokenRevokedError ||
    err instanceof TokenInvalidError
  ) {
    return true
  }

  const e = err as { status?: number; message?: string }
  return (
    e?.status === 401 ||
    e?.status === 403 ||
    /invalid[_ ]?token|revoked|expired/i.test(e?.message ?? "")
  )
}

/** Response for a session that exists but can't be restored right now.
 *  Not 401: authFetch treats a 401 as signed out. */
export function sessionUnavailable(): NextResponse {
  return NextResponse.json(
    { error: "Session temporarily unavailable" },
    { status: 503, headers: { "Retry-After": "5" } },
  )
}
