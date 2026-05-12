import { NextRequest, NextResponse } from "next/server"
import { resolveHandle, resolveHandleToDid, resolvePdsUrl } from "@/lib/atproto/did"
import { isValidDid } from "@/lib/utils/did"
import { extractRouteError } from "@/lib/utils/api"

const CERTS_PROFILE_COLLECTION = "app.certified.actor.profile"
const CERTS_PROFILE_RKEY = "self"

/** Bluesky's public appView — serves `app.bsky.actor.getProfile`
 *  unauthenticated. */
const BSKY_APPVIEW = "https://public.api.bsky.app"

type BlobLike = {
  ref?: { $link: string } | string
}

function extractBlobLink(ref: BlobLike["ref"]): string | null {
  if (!ref) return null
  if (typeof ref === "string") return ref
  if (typeof ref === "object" && "$link" in ref) return ref.$link
  return null
}

type CertsProfileValue = {
  displayName?: string
  description?: string
  avatar?: { $type?: string; uri?: string; image?: BlobLike } | undefined
  banner?: { $type?: string; uri?: string; image?: BlobLike } | undefined
}

/**
 * Resolve a Certs profile field (avatar or banner) into a URL.
 *
 * - `org.hypercerts.defs#uri` → return `uri` verbatim.
 * - blob variant → a relative URL through our XRPC proxy so federated
 *   DIDs get their blob streamed from their home PDS (see the
 *   `com.atproto.sync.getBlob` branch in /api/xrpc).
 * - anything else (missing, malformed) → null.
 */
function resolveCertsField(
  field: CertsProfileValue["avatar"] | CertsProfileValue["banner"],
  did: string
): string | null {
  if (!field) return null
  if (field.$type === "org.hypercerts.defs#uri" && field.uri) {
    return field.uri
  }
  const link = extractBlobLink(field.image?.ref)
  if (link) {
    return `/api/xrpc/com/atproto/sync/getBlob?did=${encodeURIComponent(
      did
    )}&cid=${encodeURIComponent(link)}`
  }
  return null
}

/**
 * Fetch the Certified profile record for a DID and return the
 * pre-resolved avatar + banner URLs alongside the text fields. Returns
 * null if the record is missing or unreachable. Errors are swallowed —
 * callers fall back to the Bluesky profile.
 *
 * We resolve the DID to its actual PDS first so that Certs profiles
 * for users on any PDS in the network work, not just our own. The
 * request uses the public unauthenticated XRPC directly against the
 * target PDS.
 */
async function getCertsProfile(did: string): Promise<{
  displayName?: string
  description?: string
  avatarUrl: string | null
  bannerUrl: string | null
} | null> {
  try {
    const targetPds = await resolvePdsUrl(did)
    if (!targetPds) return null

    const params = new URLSearchParams({
      repo: did,
      collection: CERTS_PROFILE_COLLECTION,
      rkey: CERTS_PROFILE_RKEY,
    })
    const res = await fetch(
      `${targetPds}/xrpc/com.atproto.repo.getRecord?${params.toString()}`,
      { signal: AbortSignal.timeout(8_000) }
    )
    if (!res.ok) return null
    const data = (await res.json()) as { value?: CertsProfileValue }
    const value = data.value
    if (!value) return null
    return {
      displayName: value.displayName,
      description: value.description,
      avatarUrl: resolveCertsField(value.avatar, did),
      bannerUrl: resolveCertsField(value.banner, did),
    }
  } catch {
    return null
  }
}

/** Fetch a user's Bluesky profile view from the public appView. Works
 *  without authentication, so signed-out visitors to the profile page
 *  still get full author info + avatar + banner. */
async function getBlueskyProfile(did: string): Promise<{
  displayName?: string
  description?: string
  avatar?: string
  banner?: string
} | null> {
  try {
    const res = await fetch(
      `${BSKY_APPVIEW}/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`,
      { signal: AbortSignal.timeout(8_000) }
    )
    if (!res.ok) return null
    const data = (await res.json()) as {
      displayName?: string
      description?: string
      avatar?: string
      banner?: string
    }
    return data
  } catch {
    return null
  }
}

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
 */
export async function GET(request: NextRequest) {
  try {
    let did = request.nextUrl.searchParams.get("did") || ""
    const handleParam = request.nextUrl.searchParams.get("handle") || ""

    // If a handle was provided (and no valid DID), resolve it to a DID
    // via Bluesky's public appView. Lets the endpoint serve contributor
    // rows where the identity was typed as a handle, not a DID.
    if (!isValidDid(did) && handleParam) {
      const resolved = await resolveHandleToDid(handleParam.trim())
      if (resolved) {
        did = resolved
      }
    }

    if (!isValidDid(did)) {
      return NextResponse.json({ error: "Invalid DID" }, { status: 400 })
    }

    // Run handle resolution and both profile lookups in parallel.
    // Each is independently allowed to fail — we combine whatever
    // succeeds.
    const [handleResult, certsResult, bskyResult] = await Promise.allSettled([
      resolveHandle(did),
      getCertsProfile(did),
      getBlueskyProfile(did),
    ])

    const handle =
      handleResult.status === "fulfilled" ? handleResult.value : null
    const certs =
      certsResult.status === "fulfilled" ? certsResult.value : null
    const bsky =
      bskyResult.status === "fulfilled" ? bskyResult.value : null

    const displayName = certs?.displayName || bsky?.displayName || undefined
    const description = certs?.description || bsky?.description || undefined
    const avatar = certs?.avatarUrl ?? bsky?.avatar ?? undefined
    const banner = certs?.bannerUrl ?? bsky?.banner ?? undefined

    return NextResponse.json(
      {
        did,
        handle: handle || did,
        displayName,
        description,
        avatar,
        banner,
      },
      {
        headers: {
          // Profile data changes rarely. Cache 60s fresh + 5min SWR so
          // back/forward navigation between profiles is instant; edits
          // become visible within ~1 minute. Used by use-user-profile,
          // use-profile, use-author-info, use-contributor-info,
          // org-settings, handle-search.
          "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
        },
      }
    )
  } catch (err: unknown) {
    const { status, message } = extractRouteError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
