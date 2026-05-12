import { NextRequest, NextResponse } from "next/server"
import { deleteSession } from "@/lib/auth/session"
import { checkCsrf } from "@/lib/auth/csrf"

export async function POST(request: NextRequest) {
  const csrfError = checkCsrf(request)
  if (csrfError) return csrfError

  // We intentionally preserve the OAuth session in Redis (tokens, DPoP
  // keys stored under "oauth:session:{did}"). Only the application
  // session (cookie + "session:did:{id}" Redis key) is deleted.
  //
  // This means the next sign-in can reuse the existing PDS grant via
  // client.restore(did), avoiding the "authorize again?" consent prompt
  // that confused returning users (issue #47).
  //
  // We also do NOT call oauthSession.signOut() — that would revoke the
  // refresh token at the PDS, destroying the grant entirely.
  //
  // Security notes:
  //   - The cookie and application session are deleted below, so no
  //     further requests can use the stored OAuth tokens through our API.
  //   - OAuth tokens sit unused in Redis until they expire (30-day TTL)
  //     or the user logs in again.
  //   - If we ever need "revoke everywhere", add a separate endpoint
  //     that calls oauthSession.signOut() AND deletes the Redis session.

  await deleteSession()

  return NextResponse.json({ success: true })
}
