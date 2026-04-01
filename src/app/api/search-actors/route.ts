import { NextRequest, NextResponse } from "next/server"
import { getAuthenticatedAgent } from "@/lib/organizations/proxy-agent"

/**
 * GET /api/search-actors?q=<query>&limit=<n>
 * Search Bluesky actors by handle/name using typeahead.
 * Returns: { actors: [{ did, handle, displayName, avatar }] }
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthenticatedAgent()
    if (!auth)
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

    const q = request.nextUrl.searchParams.get("q") || ""
    const limit = Math.min(Number(request.nextUrl.searchParams.get("limit") || "8"), 25)

    if (!q.trim()) {
      return NextResponse.json({ actors: [] })
    }

    // Use searchActors for comprehensive results (includes full profiles)
    const result = await auth.agent.app.bsky.actor.searchActors({
      q: q.trim(),
      limit,
    })

    const actors = (result.data.actors || []).map((a) => ({
      did: a.did,
      handle: a.handle,
      displayName: a.displayName || "",
      avatar: a.avatar || null,
    }))

    return NextResponse.json({ actors })
  } catch (err: unknown) {
    console.error("Search actors error:", err)
    const error = err as { message?: string }
    return NextResponse.json(
      { error: error?.message || "Search failed" },
      { status: 500 }
    )
  }
}
