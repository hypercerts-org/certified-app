import { NextRequest, NextResponse } from "next/server"
import { extractRouteError } from "@/lib/utils/api"
import { getSessionDid } from "@/lib/auth/session"
import { enforceRateLimitMulti, makeLimiter } from "@/lib/auth/rate-limit"
import { clientIp } from "@/lib/utils/ip"
import { buildProfilePayload, resolveInputToDid } from "./resolve-core"

// 60/min. Mirrors search-actors (judgment-002): this route is
// unauthenticated and issues up to 3 outbound fetches per request, so
// rate-limit on DID **and** IP simultaneously — a session-DID rotation
// would otherwise bypass the limit, and we don't want to flood the
// upstream PDS / appView we proxy. Callers that need many identities at
// once should use the batched `POST /api/resolve-dids` instead of
// firing one GET per identity.
const LIMITER_DID = makeLimiter("resolve-did-did", 60, 60)
const LIMITER_IP = makeLimiter("resolve-did-ip", 60, 60)

/**
 * GET /api/resolve-did?did=<did>
 * GET /api/resolve-did?handle=<handle>
 *
 * Resolve a DID or handle to its handle, display name, description,
 * avatar URL and banner URL. Used by activity card author bylines, the
 * profile hooks (useProfile / useUserProfile), the contributor list on
 * the activity detail view, and anywhere else in the app that needs a
 * resolved author/subject. Per-field fallback:
 *
 *   displayName = Certs displayName → Bluesky displayName → undefined
 *   description = Certs description → Bluesky description → undefined
 *   avatar      = Certs avatar      → Bluesky avatar      → undefined
 *   banner      = Certs banner      → Bluesky banner      → undefined
 *
 * The Bluesky values come from `app.bsky.actor.getProfile` which
 * returns pre-resolved `cdn.bsky.app` URLs — no blob-ref construction
 * needed, so these work for users on any PDS in the network.
 *
 * Both profile lookups are unauthenticated:
 * - Certs: direct public XRPC against the target DID's PDS
 * - Bluesky: public appView at public.api.bsky.app
 * so this route works for signed-out visitors too.
 *
 * The resolution itself lives in `resolve-core.ts` and is shared with
 * the batch route; this handler only owns rate-limiting, input parsing,
 * and the per-DID HTTP cache-control.
 */
export async function GET(request: NextRequest) {
  try {
    // Rate-limit first — this route is unauthenticated and fans out to
    // up to 3 upstream fetches, so block floods before any work. DID
    // **and** IP, mirroring search-actors (judgment-002). fail-OPEN on
    // a limiter backend error (handled inside enforceRateLimitMulti).
    const sessionDid = await getSessionDid()
    const rateDenied = await enforceRateLimitMulti([
      { limit: LIMITER_DID, identifier: sessionDid ?? "anon" },
      { limit: LIMITER_IP, identifier: clientIp(request) },
    ])
    if (rateDenied) return rateDenied

    const did = await resolveInputToDid(
      request.nextUrl.searchParams.get("did") || "",
      request.nextUrl.searchParams.get("handle") || ""
    )
    if (!did) {
      return NextResponse.json({ error: "Invalid DID" }, { status: 400 })
    }

    const payload = await buildProfilePayload(did)

    // Own DID: short 10s cache so repeat navigations (clicking your own
    // profile from the nav) feel instant without a network hit, while
    // edits still propagate within seconds. The edit-profile save
    // handlers also call this endpoint with `cache: "reload"` right
    // after putRecord to evict the entry explicitly — that path is what
    // guarantees the freshly-saved values show on the very next page
    // load. Foreign lookups (feed bylines, handle search, etc.) keep the
    // longer cache. `sessionDid` was resolved once at the top for the
    // rate limiter; reuse it here.
    const cacheControl =
      sessionDid && sessionDid === did
        ? "private, max-age=10"
        : "public, max-age=60, stale-while-revalidate=300"

    return NextResponse.json(payload, {
      headers: { "Cache-Control": cacheControl },
    })
  } catch (err: unknown) {
    const { status, message } = extractRouteError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
