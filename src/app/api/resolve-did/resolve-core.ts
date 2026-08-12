import {
  resolveHandle,
  resolveHandleToDid,
  resolveHandleViaWellKnown,
  resolvePdsUrl,
} from "@/lib/atproto/did"
import { isValidDid } from "@/lib/utils/did"
import {
  buildAvatarUrlFromCid,
  buildBannerUrlFromCid,
} from "@/lib/atproto/profile"

/**
 * Shared DID/handle -> profile resolution, used by both the single-DID
 * `GET /api/resolve-did` route and the batched `POST /api/resolve-dids`
 * route. The batch route exists so author bylines / contributor lists
 * resolve a whole page of identities in one request instead of one
 * request per row (which blows the route's 60/min rate limit — see
 * docs/resolve-did-batch/plan.md).
 *
 * The resolution logic here is byte-for-byte the original GET-handler
 * body; only the rate-limiting and HTTP cache-control wrappers stay in
 * the route files. Both routes therefore share identical certs/bsky
 * precedence and the optional indexer fast-path.
 */

const CERTS_PROFILE_COLLECTION = "app.certified.actor.profile"
const CERTS_PROFILE_RKEY = "self"

/**
 * Optional indexer fast-path (default OFF). When enabled, identity
 * (handle + the bsky profile block) is read from the magic-indexer's
 * `actorProfile(did)` query instead of fanning out to `resolveHandle` +
 * `app.bsky.actor.getProfile` for DIDs the indexer has already
 * backfilled. The certs lookup is unchanged and always runs in parallel.
 * Fully backward-compatible: with the flag off this is byte-identical to
 * the legacy three-upstream fan-out, and even with the flag on every
 * indexer miss falls back to the legacy path per-field, so resolution
 * never regresses against an un-deployed / un-indexed upstream. See
 * magic-indexer #151 / #153 / #154.
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

/**
 * Search the indexer's actor profiles by free text. The actor node does
 * NOT expose `handle`, so the result is candidate DIDs only — the caller
 * confirms the handle separately (see {@link fetchIndexerDidByHandle}).
 * A full dotted handle is a precise `search` term (the indexer matches it
 * against the denormalised handle); a bare domain is broad.
 */
const RESOLVE_DID_BY_HANDLE_QUERY = `query ResolveDidByHandle($search:String!){ appCertifiedActorProfile(first:10,search:$search){ edges { node { did } } } }`

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

/**
 * Recover a DID from a handle the live network can no longer resolve.
 *
 * When an account migrates PDS/handle, `resolveHandleToDid` (Bluesky
 * appView) and the `.well-known` path both fail for the OLD handle — yet
 * old links and the indexer still carry it. The magic-indexer
 * denormalises the handle onto the actor and refreshes it lazily, so an
 * idle migrated account stays indexed under its OLD handle (the one
 * embedded in the stale URL). We `search` the indexer for that handle,
 * then CONFIRM each candidate by exact-matching `actorProfile(did).handle`
 * — the same denormalised value `search` matched on — so a fuzzy search
 * hit (e.g. a display-name match) can never resolve to the wrong account.
 *
 * Returns the DID of the first exact match, or null. Every failure mode
 * (no indexer, GraphQL error, no exact handle match) collapses to null so
 * the caller reports "not found" exactly as it does today — this path is
 * strictly additive and only runs after live resolution has failed.
 */
async function fetchIndexerDidByHandle(handle: string): Promise<string | null> {
  const wanted = handle.trim().toLowerCase()
  if (!wanted) return null
  try {
    const bypassKey = process.env.INDEXER_RATELIMIT_BYPASS_KEY
    const headers: Record<string, string> = { "Content-Type": "application/json" }
    if (bypassKey) headers["X-RateLimit-Bypass"] = bypassKey

    const res = await fetch(UPSTREAM_INDEXER_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({
        operationName: "ResolveDidByHandle",
        query: RESOLVE_DID_BY_HANDLE_QUERY,
        variables: { search: handle.trim() },
      }),
      signal: AbortSignal.timeout(8_000),
    })
    if (!res.ok) return null
    const data = (await res.json()) as {
      data?: {
        appCertifiedActorProfile?: {
          edges?: { node?: { did?: string | null } | null }[] | null
        } | null
      }
      errors?: unknown
    }
    if (data.errors) return null

    const edges = data.data?.appCertifiedActorProfile?.edges ?? []
    const candidates: string[] = []
    for (const edge of edges) {
      const did = edge?.node?.did
      if (typeof did === "string" && isValidDid(did) && !candidates.includes(did)) {
        candidates.push(did)
      }
      if (candidates.length >= 5) break
    }

    // Confirm the search hit really is THIS handle: the indexer's
    // denormalised handle (what `search` matched) must exactly equal the
    // requested handle. Resolves the migrated-but-idle account; abstains
    // when the only matches were fuzzy (display name, etc.).
    for (const did of candidates) {
      const actor = await fetchIndexerActorProfile(did)
      const indexed = actor?.handle?.trim().toLowerCase()
      if (indexed && indexed === wanted) return did
    }
    return null
  } catch {
    return null
  }
}

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
      { redirect: "error", signal: AbortSignal.timeout(8_000) }
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
 * in parallel in the caller and its precedence (certs → bsky) is
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

/** The resolved-profile payload returned by both routes. */
export interface ResolvedProfilePayload {
  did: string
  handle: string
  displayName?: string
  description?: string
  pronouns?: string
  website?: string
  // null is a meaningful wire value here: a Certs profile with a
  // deliberately-cleared avatar/banner resolves to null (not undefined),
  // which the all-or-nothing precedence below relies on.
  avatar?: string | null
  banner?: string | null
  createdAt?: string
  hasCertifiedProfile: boolean
  hasBlueskyProfile: boolean
  blueskyProfile: {
    displayName?: string
    description?: string
    avatar?: string
    banner?: string
  } | null
}

/**
 * Resolve a free-form identity (a DID, or a handle that gets resolved to
 * a DID via the public appView) to a DID. Returns null when the input is
 * neither a valid DID nor a resolvable handle.
 */
export async function resolveInputToDid(
  didParam: string,
  handleParam: string
): Promise<string | null> {
  let did = didParam || ""
  const handle = handleParam || ""

  // If a handle was provided (and no valid DID), resolve it to a DID.
  // Lets callers pass an identity that was typed as a handle, not a DID
  // (e.g. contributor rows). Falls through a chain so a MIGRATED handle —
  // one the live network can no longer resolve — is still recovered to
  // its stable DID, which is all the downstream PDS-by-DID resolution
  // needs to render the record (#184):
  //   1. Bluesky's public appView (DNS TXT / HTTP) — the common case.
  //   2. the AT Protocol `.well-known/atproto-did` path — custom domains
  //      that never had a DNS TXT record.
  //   3. the indexer's denormalised (possibly stale) handle — recovers an
  //      account that migrated PDS/handle and whose old handle no longer
  //      resolves anywhere live.
  if (!isValidDid(did) && handle) {
    const trimmed = handle.trim()
    const resolved =
      (await resolveHandleToDid(trimmed)) ||
      (await resolveHandleViaWellKnown(trimmed)) ||
      (await fetchIndexerDidByHandle(trimmed))
    if (resolved) did = resolved
  }

  return isValidDid(did) ? did : null
}

/**
 * Resolve a single (already-validated) DID into the full profile
 * payload. This is the exact merge the GET route used to inline: the
 * certs lookup and the identity (handle + bsky) resolution run in
 * parallel, then the certs profile takes all-or-nothing precedence over
 * the bsky fallback.
 */
export async function buildProfilePayload(
  did: string
): Promise<ResolvedProfilePayload> {
  // Run the certs lookup and the identity (handle + bsky) resolution in
  // parallel. `resolveIdentity` is the adaptive layer (indexer fast-path
  // or legacy fan-out). Certs ALWAYS comes from its own PDS lookup and
  // its precedence over bsky below is unchanged. Each branch is allowed
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
  const certs = certsResult.status === "fulfilled" ? certsResult.value : null

  // ALL-OR-NOTHING fallback rule (maintainer product decision): the
  // Bluesky profile is only a wholesale fallback. We use the Bluesky
  // fields ONLY when the user has no Certified profile, or a completely
  // empty one. The moment a Certified profile carries ANY meaningful
  // content, we treat it as authoritative and use ITS fields exclusively
  // — a blank field in a partly-filled certs profile is assumed to be
  // INTENTIONALLY blank, so we must NOT backfill it from Bluesky
  // per-field (e.g. someone who set a display name but deliberately
  // cleared their avatar should get no avatar, not their old bsky one).
  //
  // `certsHasContent` is the single gate: a certs record exists AND at
  // least one displayed profile field is non-empty. A stub record that
  // only carries {$type, createdAt} therefore counts as empty, so the
  // bsky fallback still applies to it.
  const certsHasContent = !!(
    certs &&
    (certs.displayName ||
      certs.description ||
      certs.avatarUrl ||
      certs.bannerUrl ||
      certs.pronouns ||
      certs.website)
  )
  const displayName = certsHasContent ? certs?.displayName : bsky?.displayName
  const description = certsHasContent ? certs?.description : bsky?.description
  const pronouns = certs?.pronouns
  const website = certs?.website
  const avatar = certsHasContent ? certs?.avatarUrl : bsky?.avatar
  const banner = certsHasContent ? certs?.bannerUrl : bsky?.banner
  const createdAt = certs?.createdAt
  // True when the user has a non-empty app.certified.actor.profile (the
  // same `certsHasContent` gate above). Surfaced to the client so the
  // profile sidebar / header can render the "Bluesky profile" tag only
  // when the user has NOT authored a Certified profile. Issue #74.
  const hasCertifiedProfile = certsHasContent
  // True when an app.bsky.actor.profile is reachable + populated. Used by
  // the first-signin onboarding gate so the import modal only opens for
  // users who actually have bsky content worth importing.
  const hasBlueskyProfile = !!(bsky?.displayName || bsky?.avatar)
  // The raw bsky-derived seed values, surfaced separately from the
  // merged fields above so the onboarding form can populate its inputs
  // from bsky even when the merged values already resolve to certified.
  const blueskyProfile = bsky
    ? {
        displayName: bsky.displayName,
        description: bsky.description,
        avatar: bsky.avatar,
        banner: bsky.banner,
      }
    : null

  return {
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
  }
}
