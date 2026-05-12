import { NextRequest, NextResponse } from "next/server"
import { logSafe } from "@/lib/utils/log-safe"

const PUBLIC_RESOLVER = "https://bsky.social"

/**
 * GET /api/resolve-handle?handle=<handle>
 *
 * Resolve a handle to a DID via `com.atproto.identity.resolveHandle`.
 *
 * This is a public, unauthenticated XRPC in AT Protocol, so we hit
 * Bluesky's public PDS directly via plain fetch. Signed-out visitors
 * to a profile page (e.g. `/profile/alice.bsky.social`) need this to
 * work so the page can render at all.
 */
export async function GET(request: NextRequest) {
  const handle = (request.nextUrl.searchParams.get("handle") || "").trim()
  if (!handle) {
    return NextResponse.json({ error: "Handle is required" }, { status: 400 })
  }

  try {
    const upstream = await fetch(
      `${PUBLIC_RESOLVER}/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle)}`,
      { signal: AbortSignal.timeout(8_000) }
    )
    if (!upstream.ok) {
      const status = upstream.status === 400 || upstream.status === 404 ? 404 : 502
      if (status === 502) {
        // Upstream genuinely failed — surface it in logs so we can spot
        // sustained outages.
        console.warn("[resolve-handle] upstream failed", {
          handle,
          status: upstream.status,
        })
      }
      return NextResponse.json({ error: "Could not resolve handle" }, { status })
    }
    const data = (await upstream.json()) as { did?: string }
    if (!data.did) {
      return NextResponse.json({ error: "Could not resolve handle" }, { status: 404 })
    }
    return NextResponse.json(
      { did: data.did, handle },
      {
        headers: {
          // Handle->DID mappings are stable for hours-to-days; the
          // user editing their handle is rare. 60s fresh + 5min SWR
          // makes navigation back to a recently-visited profile instant.
          "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
        },
      }
    )
  } catch (err) {
    logSafe("[resolve-handle] threw", err, { handle })
    return NextResponse.json({ error: "Could not resolve handle" }, { status: 502 })
  }
}
