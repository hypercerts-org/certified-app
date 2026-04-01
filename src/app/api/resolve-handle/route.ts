import { NextRequest, NextResponse } from "next/server"
import { getAuthenticatedAgent } from "@/lib/organizations/proxy-agent"

/**
 * GET /api/resolve-handle?handle=<handle>
 * Resolve a handle to a DID using com.atproto.identity.resolveHandle.
 */
export async function GET(request: NextRequest) {
  try {
    const handle = request.nextUrl.searchParams.get("handle") || ""
    if (!handle.trim()) {
      return NextResponse.json({ error: "Handle is required" }, { status: 400 })
    }

    const auth = await getAuthenticatedAgent()
    if (!auth)
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

    const result = await auth.agent.com.atproto.identity.resolveHandle({
      handle: handle.trim(),
    })

    return NextResponse.json({ did: result.data.did, handle: handle.trim() })
  } catch (err: unknown) {
    const error = err as { message?: string }
    return NextResponse.json(
      { error: error?.message || "Could not resolve handle" },
      { status: 404 }
    )
  }
}
