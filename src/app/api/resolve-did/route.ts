import { NextRequest, NextResponse } from "next/server"
import { resolveHandle } from "@/lib/atproto/did"
import { getAuthenticatedAgent } from "@/lib/organizations/proxy-agent"

/**
 * GET /api/resolve-did?did=<did>
 * Resolve a DID to its handle and display name.
 */
export async function GET(request: NextRequest) {
  try {
    const did = request.nextUrl.searchParams.get("did") || ""
    if (!did.startsWith("did:")) {
      return NextResponse.json({ error: "Invalid DID" }, { status: 400 })
    }

    const handle = await resolveHandle(did)

    // Try to get display name from Bluesky profile
    let displayName: string | undefined
    try {
      const auth = await getAuthenticatedAgent()
      if (auth) {
        const result = await auth.agent.app.bsky.actor.getProfile({ actor: did })
        displayName = result.data.displayName || undefined
      }
    } catch {
      // ignore — profile may not exist
    }

    return NextResponse.json({ did, handle: handle || did, displayName })
  } catch (err: unknown) {
    const error = err as { message?: string }
    return NextResponse.json(
      { error: error?.message || "Failed to resolve DID" },
      { status: 500 }
    )
  }
}
