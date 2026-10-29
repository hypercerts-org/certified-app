import { NextResponse } from "next/server"
import { getOAuthClient } from "@/lib/auth/oauth-client"
import { getSessionDid, deleteSession } from "@/lib/auth/session"
import { isSessionGone } from "@/lib/auth/restore-error"
import { logSafe } from "@/lib/utils/log-safe"

// Session state must never be cached (CDN or browser): a stale copy can
// tell the client it is signed in/out when it isn't. Mirrors the XRPC
// proxy's same-session no-store posture.
const NO_STORE_HEADERS = { "Cache-Control": "private, no-store" } as const

export async function GET() {
  const did = await getSessionDid()

  if (!did) {
    return NextResponse.json({ did: null }, { headers: NO_STORE_HEADERS })
  }

  try {
    const client = await getOAuthClient()
    await client.restore(did)
    return NextResponse.json({ did }, { headers: NO_STORE_HEADERS })
  } catch (err) {
    // Don't immediately nuke the session on a transient PDS hiccup —
    // a network/timeout error shouldn't bounce the user to signed-out.
    // Only delete on a genuine auth failure (see isSessionGone).
    if (await isSessionGone(err, did)) {
      logSafe("[auth/session] restore failed (auth)", err)
      await deleteSession()
      return NextResponse.json({ did: null }, { headers: NO_STORE_HEADERS })
    }

    // Transient: leave the session in place; report did as known. The
    // client may retry on the next request.
    logSafe("[auth/session] restore failed (transient)", err)
    return NextResponse.json(
      { did, transient: true },
      { headers: NO_STORE_HEADERS },
    )
  }
}
