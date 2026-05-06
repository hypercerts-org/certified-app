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
 * Searches atproto identities via the public Bluesky AppView. The endpoint is
 * deliberately unauthenticated — `app.bsky.actor.searchActors` is a public read
 * on the AppView, and we want the navbar typeahead to work for signed-out
 * visitors too.
 *
 * Returns: { actors: [{ did, handle, displayName, avatar }] }
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
      // Reasonable upstream timeout — the AppView is normally fast.
      signal: AbortSignal.timeout(5000),
    })

    if (!res.ok) {
      // Sanitize 5xx upstream messages per AGENTS.md §17.
      if (res.status >= 500) {
        return NextResponse.json(
          { error: "Search backend unavailable" },
          { status: 502 }
        )
      }
      const text = await res.text().catch(() => "")
      return NextResponse.json(
        { error: text || "Search failed" },
        { status: res.status }
      )
    }

    const data = (await res.json()) as BskySearchResponse
    const actors = (data.actors ?? [])
      .filter((a): a is BskyActor & { did: string; handle: string } =>
        typeof a.did === "string" && typeof a.handle === "string"
      )
      .map((a) => ({
        did: a.did,
        handle: a.handle,
        displayName: a.displayName || "",
        avatar: a.avatar || null,
      }))

    return NextResponse.json({ actors })
  } catch (err: unknown) {
    console.error("[search-actors]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
