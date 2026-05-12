import { NextResponse } from "next/server"
import { getOAuthClient } from "@/lib/auth/oauth-client"
import { getSessionDid, deleteSession } from "@/lib/auth/session"
import { logSafe } from "@/lib/utils/log-safe"

export async function GET() {
  const did = await getSessionDid()

  if (!did) {
    return NextResponse.json({ did: null })
  }

  try {
    const client = await getOAuthClient()
    await client.restore(did)
    return NextResponse.json({ did })
  } catch (err) {
    // Don't immediately nuke the session on a transient PDS hiccup —
    // a network/timeout error shouldn't bounce the user to signed-out.
    // Only delete on a genuine auth failure (401/403/invalid_token).
    const e = err as { status?: number; message?: string; name?: string }
    const isAuthFailure =
      e?.status === 401 ||
      e?.status === 403 ||
      /invalid[_ ]?token|revoked|expired/i.test(e?.message ?? "")

    if (isAuthFailure) {
      logSafe("[auth/session] restore failed (auth)", err)
      await deleteSession()
      return NextResponse.json({ did: null })
    }

    // Transient: leave the session in place; report did as known. The
    // client may retry on the next request.
    logSafe("[auth/session] restore failed (transient)", err)
    return NextResponse.json({ did, transient: true })
  }
}
