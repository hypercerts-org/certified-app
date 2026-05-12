import { NextRequest, NextResponse } from "next/server"

const PUBLIC_BSKY_APPVIEW = "https://public.api.bsky.app"

interface BskyActor {
  did?: string
  handle?: string
  displayName?: string
  avatar?: string
}

interface BskySearchResponse {
  actors?: BskyActor[]
}

/**
 * GET /api/search-actors?q=<query>&limit=<n>
 *
 * Search atproto identities via the public Bluesky AppView. Deliberately
 * unauthenticated — `app.bsky.actor.searchActors` is a public read on the
 * AppView and we want the typeahead to work for signed-out visitors too.
 *
 * Returns: { actors: [{ did, handle, displayName, avatar }] }
 *
 * Mirrors the implementation in hypercerts-org/certified-app#51.
 */
export async function GET(request: NextRequest) {
  const q = (request.nextUrl.searchParams.get("q") || "").trim()
  const rawLimit = Number(request.nextUrl.searchParams.get("limit") || "8")
  const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : 8, 1), 25)

  if (!q) {
    return NextResponse.json({ actors: [] })
  }

  try {
    const url = new URL("/xrpc/app.bsky.actor.searchActors", PUBLIC_BSKY_APPVIEW)
    url.searchParams.set("q", q)
    url.searchParams.set("limit", String(limit))

    const res = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    })

    if (!res.ok) {
      if (res.status >= 500) {
        return NextResponse.json(
          { error: "Search backend unavailable" },
          { status: 502 }
        )
      }
      // Don't echo the upstream 4xx body — log it server-side for
      // diagnosis and return a fixed string.
      const text = await res.text().catch(() => "")
      if (text) console.warn("[search-actors] upstream 4xx", { status: res.status, text })
      return NextResponse.json({ error: "Search failed" }, { status: res.status })
    }

    const data = (await res.json()) as BskySearchResponse
    const actors = (data.actors ?? [])
      .filter(
        (a): a is BskyActor & { did: string; handle: string } =>
          typeof a.did === "string" && typeof a.handle === "string"
      )
      .map((a) => ({
        did: a.did,
        handle: a.handle,
        displayName: a.displayName || "",
        avatar: a.avatar || null,
      }))

    return NextResponse.json(
      { actors },
      {
        headers: {
          // Typeahead queries repeat as the user types and across users
          // searching the same names. Short fresh window + SWR keeps
          // perceived latency low without going stale.
          "Cache-Control": "public, max-age=30, stale-while-revalidate=120",
        },
      }
    )
  } catch (err: unknown) {
    console.error("[search-actors]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
