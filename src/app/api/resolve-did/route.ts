import { NextRequest, NextResponse } from "next/server"
import { resolveHandle, resolveHandleToDid, resolvePdsUrl } from "@/lib/atproto/did"
import { isValidDid } from "@/lib/utils/did"
import { extractRouteError } from "@/lib/utils/api"
import { getSessionDid } from "@/lib/auth/session"
import { enforceRateLimitMulti, makeLimiter } from "@/lib/auth/rate-limit"
import { clientIp } from "@/lib/utils/ip"
import {
  buildAvatarUrlFromCid,
  buildBannerUrlFromCid,
} from "@/lib/atproto/profile"

const CERTS_PROFILE_COLLECTION = "app.certified.actor.profile"
const CERTS_PROFILE_RKEY = "self"

/**
 * Optional indexer fast-path (default OFF). When enabled, the route
 * reads identity (handle + the bsky profile block) from the magic-
 * indexer's `actorProfile(did)` query instead of fanning out to
 * `resolveHandle` + `app.bsky.actor.getProfile` for DIDs the indexer
 * has already backfilled. The certs lookup is unchanged and always runs
 * in parallel. Fully backward-compatible: with the flag off the route is
 * byte-identical to the legacy three-upstream fan-out, and even with the
 * flag on every indexer miss falls back to the legacy path per-field, so
 * resolve-did never regresses against an un-deployed / un-indexed
 * upstream. See magic-indexer #151 / #153 / #154.
 */
const USE_INDEXER = process.env.RESOLVE_DID_USE_INDEXER === "true"

/**
 * Upstream indexer GraphQL endpoint. Mirrors the resolution in
 * `/api/indexer` (INDEXER_URL → NEXT_PUBLIC_INDEXER_URL → the railway
 * prod fallback) so the server-side `actorProfile` query targets the
 * same instance as the proxied client ops.
 */
const UPSTREAM_INDEXER_URL =
  process.env.INDEXER_URL ||
  process.env.NEXT_PUBLIC_INDEXER_URL ||
  "https://magic-indexer-prod.up.railway.app/graphql"

const RESOLVE_ACTOR_PROFILE_QUERY = `query ResolveActorProfile($did:String!){ actorProfile(did:$did){ did handle displayName description avatarCid bannerCid } }`

type IndexerActorProfile = {
  did?: string | null
  handle?: string | null
  displayName?: string | null
  description?: string | null
  avatarCid?: string | null
  bannerCid?: string | null
}

/**
 * Server-side `actorProfile(did)` lookup against the magic-indexer.
 * POSTs the fixed GraphQL query with an 8s timeout, attaching the
 * rate-limit bypass header only when `INDEXER_RATELIMIT_BYPASS_KEY` is
 * set. Returns the `actorProfile` object or null on any error, non-OK
 * status, GraphQL error, or empty payload — every failure mode collapses
 * to null so the caller cleanly falls back to the legacy path.
 */
async function fetchIndexerActorProfile(
  did: string
): Promise<IndexerActorProfile | null> {
  try {
    const bypassKey = process.env.INDEXER_RATELIMIT_BYPASS_KEY
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    }
    if (bypassKey) headers["X-RateLimit-Bypass"] = bypassKey

    const res = await fetch(UPSTREAM_INDEXER_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({
        operationName: "ResolveActorProfile",
        query: RESOLVE_ACTOR_PROFILE_QUERY,
        variables: { did },
      }),
      signal: AbortSignal.timeout(8_000),
    })
    if (!res.ok) return null
    const data = (await res.json()) as {
      data?: { actorProfile?: IndexerActorProfile | null }
      errors?: unknown
    }
    if (data.errors) return null
    return data.data?.actorProfile ?? null
  } catch {
    return null
  }
}

// 60/min. Mirrors search-actors (judgment-002): this route is
// unauthenticated and issues up to 3 outbound fetches per request, so
// rate-limit on DID **and** IP simultaneously — a session-DID rotation
// would otherwise bypass the limit, and we don't want to flood the
// upstream PDS / appView we proxy.
const LIMITER_DID = makeLimiter("resolve-did-did", 60, 60)
const LIMITER_IP = makeLimiter("resolve-did-ip", 60, 60)

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
  pronouns?: string
  website?: string
  createdAt?: string
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
  pronouns?: string
  website?: string
  avatarUrl: string | null
  bannerUrl: string | null
  createdAt?: string
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
      pronouns: value.pronouns,
      website: value.website,
      avatarUrl: resolveCertsField(value.avatar, did),
      bannerUrl: resolveCertsField(value.banner, did),
      createdAt: value.createdAt,
    }
  } catch {
    return null
  }
}

/** Fetch a user's Bluesky profile view from the public appView. Works
 *  without authentication, so signed-out visitors to the profile page
 *  still get full author info + avatar + banner.
 *
 *  Named `fetchBskyAppViewProfile` (not `getBlueskyProfile`) to avoid
 *  shadowing the exported `getBlueskyProfile` in `lib/atproto/profile.ts`,
 *  which reads `app.bsky.actor.profile` from the user's OWN PDS — a
 *  different operation with the same name. */
async function fetchBskyAppViewProfile(did: string): Promise<{
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

/** The bsky identity block fed into the downstream per-field merge —
 *  the same shape whether it originated from the indexer's
 *  `actorProfile` or the appView's `app.bsky.actor.getProfile`. */
type BskyIdentity = {
  displayName?: string
  description?: string
  avatar?: string
  banner?: string
}

/**
 * Resolve the `{ handle, bsky }` identity for a DID — the part of the
 * lookup the indexer fast-path can replace. Two modes:
 *
 *   - Legacy (flag OFF, or the indexer query failed entirely): the
 *     original `resolveHandle(did)` + `fetchBskyAppViewProfile(did)`
 *     fan-out, run in parallel.
 *   - Indexer (flag ON + a non-null `actorProfile`): handle comes from
 *     `actorProfile.handle ?? resolveHandle(did)`; the bsky block is
 *     built from the indexer's denormalised fields when the indexer
 *     HAS a bsky profile for this DID (signalled by a displayName or
 *     avatarCid), otherwise it falls back to `fetchBskyAppViewProfile`
 *     for an un-backfilled / un-observed DID.
 *
 * The certs lookup is intentionally NOT handled here — it always runs
 * in parallel in the GET handler and its precedence (certs → bsky) is
 * unchanged.
 */
async function resolveIdentity(did: string): Promise<{
  handle: string | null
  bsky: BskyIdentity | null
}> {
  // Legacy fan-out, also the universal fallback when the flag is off.
  const legacy = async (): Promise<{
    handle: string | null
    bsky: BskyIdentity | null
  }> => {
    const [handleResult, bskyResult] = await Promise.allSettled([
      resolveHandle(did),
      fetchBskyAppViewProfile(did),
    ])
    return {
      handle: handleResult.status === "fulfilled" ? handleResult.value : null,
      bsky: bskyResult.status === "fulfilled" ? bskyResult.value : null,
    }
  }

  if (!USE_INDEXER) return legacy()

  const actor = await fetchIndexerActorProfile(did)
  // Indexer query failed / returned nothing → full legacy fallback so
  // the route never regresses against an un-deployed indexer schema.
  if (!actor) return legacy()

  // handle: prefer the indexer's denormalised handle, else resolve it.
  const handle =
    actor.handle ??
    (await resolveHandle(did).catch(() => null))

  // The indexer HAS a bsky profile for this DID when it carries a
  // displayName or an avatarCid — build the bsky block from its
  // denormalised fields. Otherwise the DID is un-backfilled / not
  // observed, so fall back to the appView for the bsky block only.
  const indexerHasBsky = !!(actor.displayName || actor.avatarCid)
  if (indexerHasBsky) {
    const indexerAvatar = buildAvatarUrlFromCid(did, actor.avatarCid)
    const indexerBanner = buildBannerUrlFromCid(did, actor.bannerCid)

    // PER-FIELD fallback: a displayName-set-but-avatarCid-null indexer row
    // used to render a sticky blank avatar (the read-side amplifier of the
    // data-loss bug) because `indexerHasBsky` skipped the appView wholesale.
    // When the indexer is missing a needed image field, lazily hit the
    // appView ONCE and fill ONLY the gaps — the indexer stays authoritative
    // for whatever it does carry, and the fast path stays fast (no appView
    // fetch) whenever the avatar+banner CIDs are present.
    let appView: BskyIdentity | null = null
    if (!actor.avatarCid || !actor.bannerCid) {
      appView = await fetchBskyAppViewProfile(did)
    }

    return {
      handle,
      bsky: {
        displayName: actor.displayName ?? appView?.displayName ?? undefined,
        description: actor.description ?? appView?.description ?? undefined,
        avatar: indexerAvatar ?? appView?.avatar ?? undefined,
        banner: indexerBanner ?? appView?.banner ?? undefined,
      },
    }
  }

  const bsky = await fetchBskyAppViewProfile(did)
  return { handle, bsky }
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

    // Run the certs lookup and the identity (handle + bsky) resolution
    // in parallel. `resolveIdentity` is the adaptive layer: with the
    // indexer flag off it's the original `resolveHandle` +
    // `fetchBskyAppViewProfile` fan-out; with the flag on it reads
    // identity from the indexer's `actorProfile(did)` with per-field
    // fallback. Certs ALWAYS comes from its own PDS lookup and its
    // precedence over bsky below is unchanged. Each branch is allowed
    // to fail independently — we combine whatever succeeds.
    const [identityResult, certsResult] = await Promise.allSettled([
      resolveIdentity(did),
      getCertsProfile(did),
    ])

    const identity =
      identityResult.status === "fulfilled"
        ? identityResult.value
        : { handle: null, bsky: null }
    const handle = identity.handle
    const bsky = identity.bsky
    const certs =
      certsResult.status === "fulfilled" ? certsResult.value : null

    // ALL-OR-NOTHING fallback rule (maintainer product decision):
    // the Bluesky profile is only a wholesale fallback. We use the
    // Bluesky fields ONLY when the user has no Certified profile, or
    // a completely empty one. The moment a Certified profile carries
    // ANY meaningful content, we treat it as authoritative and use
    // ITS fields exclusively — a blank field in a partly-filled certs
    // profile is assumed to be INTENTIONALLY blank, so we must NOT
    // backfill it from Bluesky per-field (e.g. someone who set a
    // display name but deliberately cleared their avatar should get
    // no avatar, not their old bsky one).
    //
    // `certsHasContent` is the single gate: a certs record exists AND
    // at least one displayed profile field is non-empty. A stub record
    // that only carries {$type, createdAt} therefore counts as empty,
    // so the bsky fallback still applies to it.
    const certsHasContent = !!(
      certs &&
      (certs.displayName ||
        certs.description ||
        certs.avatarUrl ||
        certs.bannerUrl ||
        certs.pronouns ||
        certs.website)
    )
    const displayName = certsHasContent
      ? certs?.displayName
      : bsky?.displayName
    const description = certsHasContent
      ? certs?.description
      : bsky?.description
    const pronouns = certs?.pronouns
    const website = certs?.website
    const avatar = certsHasContent ? certs?.avatarUrl : bsky?.avatar
    const banner = certsHasContent ? certs?.bannerUrl : bsky?.banner
    const createdAt = certs?.createdAt
    // True when the user has a non-empty app.certified.actor.profile
    // (the same `certsHasContent` gate above). Surfaced to the client
    // so the profile sidebar / header can render the "Bluesky profile"
    // tag only when the user has NOT authored a Certified profile
    // (i.e. the fields we're showing all originate from
    // app.bsky.actor.profile). Issue #74.
    const hasCertifiedProfile = certsHasContent
    // True when an app.bsky.actor.profile is reachable + populated.
    // Used by the first-signin onboarding gate so the import modal
    // only opens for users who actually have bsky content worth
    // importing (skips first-time-on-atproto users).
    const hasBlueskyProfile = !!(bsky?.displayName || bsky?.avatar)
    // The raw bsky-derived seed values, surfaced separately from
    // the merged fields above so the onboarding form can populate
    // its inputs from bsky even when the merged values already
    // resolve to certified (e.g. partial onboarding states).
    const blueskyProfile = bsky
      ? {
          displayName: bsky.displayName,
          description: bsky.description,
          avatar: bsky.avatar,
          banner: bsky.banner,
        }
      : null

    // Own DID: short 10s cache so repeat navigations (clicking your
    // own profile from the nav) feel instant without a network hit,
    // while edits still propagate within seconds. The edit-profile
    // save handlers also call this endpoint with `cache: "reload"`
    // right after putRecord to evict the entry explicitly — that
    // path is what guarantees the freshly-saved values show on the
    // very next page load. Foreign lookups (feed bylines, handle
    // search, etc.) keep the longer cache. `sessionDid` was resolved
    // once at the top for the rate limiter; reuse it here.
    const cacheControl =
      sessionDid && sessionDid === did
        ? "private, max-age=10"
        : "public, max-age=60, stale-while-revalidate=300"

    return NextResponse.json(
      {
        did,
        handle: handle || did,
        displayName,
        description,
        pronouns,
        website,
        avatar,
        banner,
        createdAt,
        hasCertifiedProfile,
        hasBlueskyProfile,
        blueskyProfile,
      },
      { headers: { "Cache-Control": cacheControl } }
    )
  } catch (err: unknown) {
    const { status, message } = extractRouteError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
