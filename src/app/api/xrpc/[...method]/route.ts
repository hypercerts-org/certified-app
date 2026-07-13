import { NextRequest, NextResponse } from "next/server"
import { Agent } from "@atproto/api"
import type {
  ComAtprotoRepoCreateRecord,
  ComAtprotoRepoPutRecord,
  ComAtprotoRepoDeleteRecord,
  ComAtprotoIdentityUpdateHandle,
  ComAtprotoServerRequestPasswordReset,
  ComAtprotoServerResetPassword,
  ComAtprotoServerUpdateEmail,
  ComAtprotoServerCreateAppPassword,
  ComAtprotoServerRevokeAppPassword,
} from "@atproto/api"
import { getOAuthClient } from "@/lib/auth/oauth-client"
import { getSessionDid, deleteSession } from "@/lib/auth/session"
import { checkCsrf } from "@/lib/auth/csrf"
import { resolvePdsUrl, invalidateDidDoc } from "@/lib/atproto/did"
import { LIMIT_MIN, LIMIT_MAX } from "@/lib/utils/constants"
import { redactSecrets, logSafe } from "@/lib/utils/log-safe"
import { parseJsonBody } from "@/lib/utils/api"
import {
  checkAndIncrementWriteRate,
  RATE_LIMITED_WRITE_COLLECTIONS,
  makeLimiter,
  enforceRateLimit,
} from "@/lib/auth/rate-limit"
import { clientIp } from "@/lib/utils/ip"

// INVARIANT: `app.bsky.actor.profile` must NEVER be added to this allowlist
// (certified-app invariant) — writing it clobbers the user's Bluesky profile.
const ALLOWED_WRITE_COLLECTIONS = [
  "org.impactindexer.link.attestation",
  "app.certified.actor.profile",
  "app.certified.actor.organization",
  "app.certified.location",
  // Badge lexicons (issue #65 tracks indexer-side support). `definition`
  // is written once per user the first time they endorse; `award` is the
  // endorsement itself; `response` is the recipient accept/reject (used
  // in a later phase, allowlisted now so we don't ship two PRs).
  "app.certified.badge.definition",
  "app.certified.badge.award",
  "app.certified.badge.response",
  // Certified social graph — follow records live on the viewer's PDS;
  // the followers view is served by the magic-indexer via the
  // `appCertifiedGraphFollow` connection.
  "app.certified.graph.follow",
  // Bluesky social graph — own-repo follow records, written by the
  // settings "Sync to Bluesky" direction (Certified → Bluesky). A follow
  // record is additive and safe; unlike `app.bsky.actor.profile` (see the
  // invariant above) it never clobbers existing Bluesky data.
  "app.bsky.graph.follow",
  "org.hypercerts.claim.activity",
  // Project records (and other curated collections like favorites /
  // portfolio / program — same NSID, distinguished by `type` field).
  // Used by the project detail inline-edit (issue #67) for own-DID
  // writes; group-owned project writes go through the BFF route at
  // `/api/groups/[groupDid]/project`.
  "org.hypercerts.collection",
  // Funding receipts. Recorded/confirmed from the activity-detail Funding
  // section + the receipt detail modal. Both "record" and "confirm" write
  // this same collection; the indexer derives the attestation role from
  // author-vs-from/to and clusters matching coordinates. Rate-limited
  // below (naming arbitrary parties is a plausible spam vector).
  "org.hypercerts.funding.receipt",
  // Contributor Board (org.hyperboards.*). `board` wraps an activity with
  // visual presentation (subject → activity, config, contributorConfigs);
  // `contributorInformation` is the identity record a board's
  // contributorConfigs reference; `displayProfile` is the viewer's own
  // board appearance (rkey self). All written own-repo only — board editing
  // is gated to the activity author.
  "org.hyperboards.board",
  "org.hyperboards.displayProfile",
  "org.hypercerts.claim.contributorInformation",
]

const ALLOWED_BLOB_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]

const MAX_BLOB_SIZE = 4 * 1024 * 1024 // 4MB — Vercel serverless functions have a ~4.5MB request body limit

// Ceiling for foreign-DID blob reads. An allowlisted-but-hostile PDS
// could otherwise stream an arbitrarily large body for an attacker-
// chosen DID's CID through our proxy. We short-circuit on a declared
// Content-Length over this cap AND wrap the response stream in a byte
// counter that aborts once the cap is passed, so a missing/lying length
// can't stream unbounded.
const MAX_FOREIGN_BLOB_SIZE = 10 * 1024 * 1024 // 10MB

// IP-scoped limiter for the unauthenticated GET proxy. This handler
// resolves an arbitrary client-supplied repo/did to a PDS and issues an
// upstream fetch (getRecord / listRecords / sync.getBlob) for signed-out
// callers, so it needs its own ceiling — every other outbound-fetching
// proxy route (resolve-did, indexer, geocode, …) has one. Sized
// generously (300/60s) for feed/profile fan-out from a single client.
const GET_LIMITER = makeLimiter("xrpc-get-ip", 300, 60)

/**
 * Fixed Cache-Control for foreign-DID blob reads. CIDs are content-
 * addressed and immutable, so we own the directive rather than
 * forwarding the upstream PDS's (which an attacker-chosen, hostile
 * PDS controls). Mirrors the FOREIGN_READ_CACHE_HEADERS pattern.
 * `s-maxage` lets the Vercel edge serve repeat visitors without a
 * function invocation (max-age alone is browser-only there); 24h
 * bounds takedown latency for deleted blobs, so no longer-lived
 * CDN directive.
 */
const FOREIGN_BLOB_CACHE_HEADERS = {
  "Cache-Control": "public, max-age=3600, s-maxage=86400, immutable",
} as const

/**
 * Same-session blob reads went through the bound OAuth agent, so keep
 * them out of shared caches — but the cid in the URL still makes the
 * bytes immutable, so let the browser keep the user's own avatar /
 * banner instead of re-streaming it through a full agent restore on
 * every mount.
 */
const SAME_SESSION_BLOB_CACHE_HEADERS = {
  "Cache-Control": "private, max-age=3600, immutable",
} as const

function asString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined
}

/**
 * Wrap a response body stream in a byte counter that errors the stream
 * once `maxBytes` have passed through, independent of any declared
 * Content-Length. A hostile-but-allowlisted PDS can omit or understate
 * the header and stream an unbounded body for an attacker-chosen CID;
 * this caps the bytes we proxy regardless. Returns null unchanged when
 * the upstream has no body.
 */
function capStream(
  body: ReadableStream<Uint8Array> | null,
  maxBytes: number,
): ReadableStream<Uint8Array> | null {
  if (!body) return null
  let total = 0
  const counter = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      total += chunk.byteLength
      if (total > maxBytes) {
        controller.error(new Error("Foreign blob exceeded size cap"))
        return
      }
      controller.enqueue(chunk)
    },
  })
  return body.pipeThrough(counter)
}

/**
 * Short Cache-Control for foreign-repo public reads. Feeds and profile
 * pages fan out across many DIDs and re-fetch the same records — even
 * a 30s shared cache collapses that into one upstream call per server
 * instance. Use `private` so we don't share between users via a CDN;
 * the data itself is public AT-Protocol records but we don't have an
 * audit trail of who's allowed to see what at the proxy layer yet.
 */
const FOREIGN_READ_CACHE_HEADERS = {
  "Cache-Control": "private, max-age=30",
} as const

/**
 * No-store for same-session getRecord — the edit form re-reads this
 * URL when the user opens it again, and any stale window can mean
 * "I saved but my old name is back in the form". Cost: one network
 * round-trip every time edit-profile mounts. Acceptable.
 */
const SAME_SESSION_NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store",
} as const

/**
 * Short cache for same-session listRecords. This is what the
 * Activities tab on the user's own profile hits, and every "click
 * Profile in the nav" triggers a re-mount → re-fetch. A 5s window
 * keeps the page snappy on quick re-navigation without holding
 * stale data long enough to matter — fresh writes go through the
 * SAME PDS that this endpoint queries, so the most-recent record is
 * visible the next time the cache expires.
 */
const SAME_SESSION_LIST_HEADERS = {
  "Cache-Control": "private, max-age=5",
} as const

/** Extract a usable HTTP status + message from an unknown XRPC error. */
export function xrpcError(err: unknown): {
  status: number
  message: string
  code?: string
} {
  if (!err || typeof err !== "object") {
    return { status: 500, message: "Internal server error" }
  }
  const e = err as Record<string, unknown>
  const statusRaw = typeof e.status === "number" ? e.status : e.statusCode
  const statusNum = typeof statusRaw === "number" ? statusRaw : 500
  // Clamp to the valid HTTP range. An upstream status of 0, a negative
  // number, >599, or a non-integer would throw a RangeError when passed
  // straight to NextResponse.json(..., { status }) — surfacing an opaque
  // framework 500 instead of our masked error. Mirrors clampHttpStatus
  // in src/lib/utils/api.ts.
  const status =
    Number.isInteger(statusNum) && statusNum >= 200 && statusNum <= 599
      ? statusNum
      : 500
  const rawMessage = asString(e.message)
  const message = status >= 500 || !rawMessage ? "Internal server error" : redactSecrets(rawMessage)
  // Preserve the atproto error discriminator (`InvalidSwap`,
  // `RecordNotFound`, etc.) so the client can branch on it
  // without re-parsing a localised human-readable string. The
  // @atproto/api `XRPCError` carries it on `.error`.
  const code = asString(e.error) ?? undefined
  // Server-side log so the masked-to-client message can still be diagnosed
  // from Vercel logs. Client never sees the original PDS error body.
  console.error("[xrpc] upstream error", {
    name: asString(e.name),
    status,
    error: code,
    message: rawMessage ? redactSecrets(rawMessage) : undefined,
  })
  return { status, message, code }
}

/** Clamp and validate a limit query param. */
function parseLimit(raw: string | undefined): number | undefined {
  if (!raw) return undefined
  const n = parseInt(raw, 10)
  if (isNaN(n)) return undefined
  return Math.min(Math.max(LIMIT_MIN, n), LIMIT_MAX)
}

/** GET-accessible XRPCs that are public in AT Protocol — signed-out
 *  visitors can call these without a session. Write methods remain
 *  auth-gated below. */
const PUBLIC_READ_METHODS = new Set<string>([
  "com.atproto.repo.getRecord",
  "com.atproto.repo.listRecords",
  "com.atproto.sync.getBlob",
])

// The three helpers below proxy the *public* (unauthenticated) form of
// each read XRPC straight to the target repo's home PDS. They back two
// callers: the foreign-repo branch (repo !== session DID) and the
// same-session FALLBACK — when a user reads their OWN repo but the bound
// OAuth agent throws (expired/unrefreshable session, DPoP hiccup, a
// transient PDS-auth 5xx), we drop to the public read instead of bubbling
// a 500. These are public XRPCs, so a degraded session must never break
// reading a user's own public records. Fallback reads carry the foreign
// short cache rather than the same-session no-store/5s headers; that's an
// exceptional path and a <=30s private cache is acceptable.

async function proxyPublicGetRecord(
  methodName: string,
  repo: string,
  collection: string,
  rkey: string,
  cid: string | undefined,
): Promise<NextResponse> {
  const targetPds = await resolvePdsUrl(repo)
  if (!targetPds) {
    return NextResponse.json({ error: "PDS not found for repo" }, { status: 404 })
  }
  const params = new URLSearchParams({ repo, collection, rkey })
  if (cid) params.set("cid", cid)
  try {
    const upstream = await fetch(
      `${targetPds}/xrpc/com.atproto.repo.getRecord?${params.toString()}`,
      { redirect: "error", signal: AbortSignal.timeout(10_000) }
    )
    if (!upstream.ok) {
      return NextResponse.json(
        { error: `Upstream PDS returned ${upstream.status}` },
        { status: upstream.status }
      )
    }
    const data = await upstream.json()
    return NextResponse.json(data, { headers: FOREIGN_READ_CACHE_HEADERS })
  } catch (err) {
    logSafe("[xrpc] foreign-pds upstream", err, { method: methodName, pds: targetPds })
    return NextResponse.json({ error: "Upstream request failed" }, { status: 502 })
  }
}

async function proxyPublicListRecords(
  methodName: string,
  repo: string,
  collection: string,
  q: {
    limit?: string
    cursor?: string
    reverse?: string
    rkeyEnd?: string
    rkeyStart?: string
  },
): Promise<NextResponse> {
  const targetPds = await resolvePdsUrl(repo)
  if (!targetPds) {
    // Cache the empty-result shortcut too — otherwise a feed that hits an
    // unresolvable DID will repeatedly retry the (cached-as-null) DID
    // lookup and short-circuit here.
    return NextResponse.json(
      { records: [] },
      { headers: FOREIGN_READ_CACHE_HEADERS },
    )
  }
  const params = new URLSearchParams({ repo, collection })
  const limit = parseLimit(q.limit)
  if (limit !== undefined) params.set("limit", String(limit))
  if (q.cursor) params.set("cursor", q.cursor)
  if (q.reverse === "true") params.set("reverse", "true")
  if (q.rkeyEnd) params.set("rkeyEnd", q.rkeyEnd)
  if (q.rkeyStart) params.set("rkeyStart", q.rkeyStart)
  try {
    const upstream = await fetch(
      `${targetPds}/xrpc/com.atproto.repo.listRecords?${params.toString()}`,
      {
        redirect: "error",
        headers: { "Content-Type": "application/json" },
        // Abort after 10s so a slow PDS doesn't block our handler.
        signal: AbortSignal.timeout(10_000),
      }
    )
    if (!upstream.ok) {
      if (upstream.status === 400 || upstream.status === 404) {
        return NextResponse.json(
          { records: [] },
          { headers: FOREIGN_READ_CACHE_HEADERS },
        )
      }
      return NextResponse.json(
        { error: `Upstream PDS returned ${upstream.status}` },
        { status: upstream.status }
      )
    }
    const data = await upstream.json()
    return NextResponse.json(data, { headers: FOREIGN_READ_CACHE_HEADERS })
  } catch (err) {
    logSafe("[xrpc] foreign-pds upstream", err, { method: methodName, pds: targetPds })
    return NextResponse.json(
      { error: "Upstream request failed", records: [] },
      { status: 502 }
    )
  }
}

async function proxyPublicGetBlob(
  methodName: string,
  blobDid: string,
  cid: string,
): Promise<NextResponse> {
  const targetPds = await resolvePdsUrl(blobDid)
  if (!targetPds) {
    return NextResponse.json({ error: "PDS not found for did" }, { status: 404 })
  }
  try {
    const params = new URLSearchParams({ did: blobDid, cid })
    const upstream = await fetch(
      `${targetPds}/xrpc/com.atproto.sync.getBlob?${params.toString()}`,
      { redirect: "error", signal: AbortSignal.timeout(15_000) }
    )
    if (!upstream.ok) {
      return NextResponse.json(
        { error: `Upstream PDS returned ${upstream.status}` },
        { status: upstream.status }
      )
    }
    // Short-circuit a *declared* oversize before streaming — cheap fast
    // path when the PDS is honest about a large body.
    const upstreamLength = upstream.headers.get("content-length")
    if (upstreamLength && Number(upstreamLength) > MAX_FOREIGN_BLOB_SIZE) {
      return NextResponse.json({ error: "Payload too large" }, { status: 413 })
    }
    return new NextResponse(capStream(upstream.body, MAX_FOREIGN_BLOB_SIZE), {
      status: 200,
      headers: {
        "Content-Type":
          upstream.headers.get("content-type") || "application/octet-stream",
        // Server-controlled directive — don't forward upstream's.
        ...FOREIGN_BLOB_CACHE_HEADERS,
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
      },
    })
  } catch (err) {
    logSafe("[xrpc] foreign-pds upstream", err, { method: methodName, pds: targetPds })
    return NextResponse.json({ error: "Upstream request failed" }, { status: 502 })
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ method: string[] }> }
) {
  try {
    // Rate-limit first: this handler is reachable unauthenticated and
    // resolves a client-supplied repo/did to a PDS it then fetches, so
    // block floods (SSRF / amplification fan-out) before any upstream
    // work. IP-scoped; fail-open on a limiter backend error (handled
    // inside enforceRateLimit). Run the session lookup concurrently —
    // both are independent Upstash round-trips, and the limiter INCRs
    // regardless, so discarding the session result on the (rare)
    // denied path changes no semantics.
    const [rateDenied, did] = await Promise.all([
      enforceRateLimit(GET_LIMITER, clientIp(request)),
      getSessionDid(),
    ])
    if (rateDenied) return rateDenied

    const { method } = await params
    const methodName = method.join(".")

    if (!did && !PUBLIC_READ_METHODS.has(methodName)) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }

    // Lazily build the bound agent — restoring the OAuth session costs
    // at least one Upstash round-trip plus DPoP deserialization and can
    // trigger a token refresh, and the foreign-repo/blob branches below
    // never touch the agent (feeds fan out dozens of those per page).
    // Only the same-session branches and the auth-required methods pay
    // for it. Restore failure keeps its semantics: log, drop the stale
    // session cookie, and return null — same-session reads then fall
    // back to the public proxy, auth-required methods 401.
    const getAgent = async (): Promise<Agent | null> => {
      if (!did) return null
      try {
        const client = await getOAuthClient()
        const oauthSession = await client.restore(did)
        return new Agent(oauthSession)
      } catch (err) {
        logSafe("[xrpc] oauth restore failed", err, { method: methodName })
        await deleteSession()
        return null
      }
    }

    // Query params come as Record<string, string> from URLSearchParams.
    // AT Protocol SDK expects specific typed params — we validate the required
    // fields per-method below and cast through unknown for the proxy pattern.
    const queryParams: Record<string, string> = Object.fromEntries(
      request.nextUrl.searchParams.entries()
    )

    switch (methodName) {
      case "com.atproto.repo.getRecord": {
        const { repo, collection, rkey, cid } = queryParams
        if (!repo || !collection || !rkey) {
          return NextResponse.json({ error: "repo, collection, and rkey are required" }, { status: 400 })
        }

        // Foreign repo → resolve PDS and proxy the public XRPC directly.
        if (repo !== did) {
          return proxyPublicGetRecord(methodName, repo, collection, rkey, cid)
        }

        // Same-session repo path — prefer the bound agent (fresh,
        // no-store). If it throws (expired/unrefreshable OAuth session or
        // a transient PDS-auth error) fall back to the public read so a
        // degraded session doesn't 500 a read of the user's own record.
        const agent = await getAgent()
        if (agent) {
          try {
            const result = await agent.com.atproto.repo.getRecord({ repo, collection, rkey, cid })
            return NextResponse.json(result.data, { headers: SAME_SESSION_NO_STORE_HEADERS })
          } catch (err) {
            logSafe("[xrpc] same-session read failed, falling back to public", err, { method: methodName })
          }
        }
        return proxyPublicGetRecord(methodName, repo, collection, rkey, cid)
      }
      case "com.atproto.repo.listRecords": {
        const { repo, collection, cursor, reverse, rkeyEnd, rkeyStart } = queryParams
        if (!repo || !collection) {
          return NextResponse.json({ error: "repo and collection are required" }, { status: 400 })
        }

        // If we're asking for someone else's repo, `agent` is bound to
        // the session user's PDS and a listRecords call there would
        // return nothing for a foreign repo. Resolve the target DID to
        // its home PDS and query that directly.
        //
        // listRecords is an unauthenticated public XRPC, so a plain fetch
        // works for any PDS in the network — we don't need to talk to
        // the target user's auth service.
        if (repo !== did) {
          return proxyPublicListRecords(methodName, repo, collection, queryParams)
        }

        // Same-session repo path — prefer the bound agent (fresh writes
        // visible on a 5s cache). If it throws (expired/unrefreshable
        // OAuth session or a transient PDS-auth error) fall back to the
        // public read so a degraded session doesn't 500 the user's own
        // Lists/Activities tabs — listRecords is a public XRPC.
        const agent = await getAgent()
        if (agent) {
          try {
            const result = await agent.com.atproto.repo.listRecords({
              repo,
              collection,
              limit: parseLimit(queryParams.limit),
              cursor,
              reverse: reverse === "true" ? true : undefined,
              rkeyEnd,
              rkeyStart,
            })
            return NextResponse.json(result.data, { headers: SAME_SESSION_LIST_HEADERS })
          } catch (err) {
            logSafe("[xrpc] same-session read failed, falling back to public", err, { method: methodName })
          }
        }
        return proxyPublicListRecords(methodName, repo, collection, queryParams)
      }
      case "com.atproto.server.getSession": {
        // Auth-required: a cookie whose session no longer restores must
        // still 401 (getAgent already dropped the stale cookie).
        const agent = await getAgent()
        if (!agent) {
          return NextResponse.json({ error: "Session expired" }, { status: 401 })
        }
        const result = await agent.com.atproto.server.getSession()
        return NextResponse.json(result.data, { headers: SAME_SESSION_NO_STORE_HEADERS })
      }
      case "com.atproto.server.listAppPasswords": {
        const agent = await getAgent()
        if (!agent) {
          return NextResponse.json({ error: "Session expired" }, { status: 401 })
        }
        const result = await agent.com.atproto.server.listAppPasswords()
        return NextResponse.json(result.data, { headers: SAME_SESSION_NO_STORE_HEADERS })
      }
      case "com.atproto.sync.getBlob": {
        const { did: blobDid, cid } = queryParams
        if (!blobDid || !cid) {
          return NextResponse.json({ error: "did and cid are required" }, { status: 400 })
        }

        // Foreign DID → resolve to its home PDS and stream the blob
        // directly. Bound agent would target the session user's PDS,
        // which doesn't have the foreign user's blobs.
        if (blobDid !== did) {
          return proxyPublicGetBlob(methodName, blobDid, cid)
        }

        // Same-session blob → prefer the bound agent, fall back to the
        // public read if a degraded session makes it throw.
        const agent = await getAgent()
        if (agent) {
          try {
            const result = await agent.com.atproto.sync.getBlob({ did: blobDid, cid })
            const blob = result.data as Uint8Array
            return new NextResponse(Buffer.from(blob), {
              headers: {
                "Content-Type":
                  result.headers["content-type"] || "application/octet-stream",
                ...SAME_SESSION_BLOB_CACHE_HEADERS,
                "X-Content-Type-Options": "nosniff",
                "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
              },
            })
          } catch (err) {
            logSafe("[xrpc] same-session read failed, falling back to public", err, { method: methodName })
          }
        }
        return proxyPublicGetBlob(methodName, blobDid, cid)
      }
      default:
        return NextResponse.json(
          { error: `Unknown method: ${methodName}` },
          { status: 400 }
        )
    }
  } catch (err: unknown) {
    const { status, message, code } = xrpcError(err)
    return NextResponse.json(
      code ? { error: message, code } : { error: message },
      { status },
    )
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ method: string[] }> }
) {
  const csrfError = checkCsrf(request)
  if (csrfError) return csrfError

  try {
    const { method } = await params
    const methodName = method.join(".")

    const did = await getSessionDid()
    if (!did)
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

    const client = await getOAuthClient()
    let oauthSession
    try {
      oauthSession = await client.restore(did)
    } catch (err) {
      logSafe("[xrpc] oauth restore failed", err, { method: methodName })
      await deleteSession()
      return NextResponse.json({ error: "Session expired" }, { status: 401 })
    }
    const agent = new Agent(oauthSession)

    // Parse body once (uploadBlob uses arrayBuffer instead)
    let body: Record<string, unknown> | null = null
    if (methodName !== "com.atproto.repo.uploadBlob") {
      const parsed = await parseJsonBody(request, `[xrpc ${methodName}]`)
      if (!parsed.ok) return parsed.response
      body = (parsed.body ?? {}) as Record<string, unknown>
    }

    // Validate repo on write methods — reject cross-repo writes
    const REPO_METHODS = ["com.atproto.repo.createRecord", "com.atproto.repo.putRecord", "com.atproto.repo.deleteRecord"]
    if (body && REPO_METHODS.includes(methodName)) {
      if (!body.repo || body.repo !== did) {
        return NextResponse.json(
          { error: "repo is required and must match the authenticated user" },
          { status: 403 }
        )
      }
      if (
        typeof body.collection !== "string" ||
        !ALLOWED_WRITE_COLLECTIONS.includes(body.collection)
      ) {
        return NextResponse.json(
          { error: "collection is required and must be an allowed collection" },
          { status: 403 }
        )
      }
      // Rate-limit endorsement-issuance lexicons. badge.award and
      // its legacy temp predecessor are the abuse vector (default-
      // show + no recipient gate at issue time). Other collections
      // pass through untouched. Per-DID, fixed-window counters in
      // Upstash — see lib/auth/rate-limit.ts for the cap rationale.
      const rateScope = RATE_LIMITED_WRITE_COLLECTIONS[body.collection]
      if (rateScope && methodName === "com.atproto.repo.createRecord") {
        try {
          const rate = await checkAndIncrementWriteRate(did, rateScope)
          if (!rate.allowed) {
            const retryAfterSec = Math.max(
              1,
              Math.ceil((rate.resetAt - Date.now()) / 1000),
            )
            return NextResponse.json(
              {
                error: "Too many writes — try again later.",
                resetAt: rate.resetAt,
              },
              {
                status: 429,
                headers: {
                  "Retry-After": String(retryAfterSec),
                  "X-RateLimit-Reset": String(Math.floor(rate.resetAt / 1000)),
                },
              },
            )
          }
        } catch (err) {
          // Rate-limit infrastructure failure should NOT block
          // writes — it's a hardening measure, not a hard gate.
          // Log and fall through.
          logSafe("[xrpc] rate-limit check failed", err, {
            method: methodName,
            collection: body.collection,
          })
        }
      }
    }

    switch (methodName) {
      case "com.atproto.repo.createRecord": {
        const result = await agent.com.atproto.repo.createRecord(
          body as ComAtprotoRepoCreateRecord.InputSchema
        )
        return NextResponse.json(result.data)
      }
      case "com.atproto.repo.putRecord": {
        const result = await agent.com.atproto.repo.putRecord(
          body as ComAtprotoRepoPutRecord.InputSchema
        )
        return NextResponse.json(result.data)
      }
      case "com.atproto.repo.deleteRecord": {
        const result = await agent.com.atproto.repo.deleteRecord(
          body as ComAtprotoRepoDeleteRecord.InputSchema
        )
        return NextResponse.json(result.data)
      }
      case "com.atproto.repo.uploadBlob": {
        const contentType =
          request.headers.get("content-type") || "application/octet-stream"
        // Check content type
        const mimeType = contentType.split(";")[0].trim()
        if (!ALLOWED_BLOB_CONTENT_TYPES.includes(mimeType)) {
          return NextResponse.json(
            { error: "Unsupported media type" },
            { status: 415 }
          )
        }
        // Check content length
        const contentLengthHeader = request.headers.get("content-length")
        if (contentLengthHeader && Number(contentLengthHeader) > MAX_BLOB_SIZE) {
          return NextResponse.json(
            { error: "Payload too large" },
            { status: 413 }
          )
        }
        const buffer = await request.arrayBuffer()
        if (buffer.byteLength > MAX_BLOB_SIZE) {
          return NextResponse.json(
            { error: "Payload too large" },
            { status: 413 }
          )
        }
        const result = await agent.com.atproto.repo.uploadBlob(
          new Uint8Array(buffer),
          { encoding: contentType }
        )
        return NextResponse.json(result.data)
      }
      case "com.atproto.identity.updateHandle": {
        await agent.com.atproto.identity.updateHandle(
          body as ComAtprotoIdentityUpdateHandle.InputSchema
        )
        // The DID document's `alsoKnownAs` just changed. Drop our
        // cached copy so resolveHandle(did) returns the new value on
        // the next call instead of serving up to 5 minutes of stale.
        invalidateDidDoc(did)
        // Void operation — no data to return
        return NextResponse.json({})
      }
      case "com.atproto.server.requestPasswordReset": {
        await agent.com.atproto.server.requestPasswordReset(
          body as ComAtprotoServerRequestPasswordReset.InputSchema
        )
        return NextResponse.json({})
      }
      case "com.atproto.server.resetPassword": {
        await agent.com.atproto.server.resetPassword(
          body as ComAtprotoServerResetPassword.InputSchema
        )
        return NextResponse.json({})
      }
      case "com.atproto.server.requestEmailUpdate": {
        const result = await agent.com.atproto.server.requestEmailUpdate()
        return NextResponse.json(result.data)
      }
      case "com.atproto.server.updateEmail": {
        await agent.com.atproto.server.updateEmail(
          body as ComAtprotoServerUpdateEmail.InputSchema
        )
        return NextResponse.json({})
      }
      case "com.atproto.server.createAppPassword": {
        // Returns the generated password ONCE (the PDS never reveals it
        // again). The caller shows it for copy then drops it.
        const result = await agent.com.atproto.server.createAppPassword(
          body as ComAtprotoServerCreateAppPassword.InputSchema
        )
        return NextResponse.json(result.data)
      }
      case "com.atproto.server.revokeAppPassword": {
        await agent.com.atproto.server.revokeAppPassword(
          body as ComAtprotoServerRevokeAppPassword.InputSchema
        )
        return NextResponse.json({})
      }
      default:
        return NextResponse.json(
          { error: `Unknown method: ${methodName}` },
          { status: 400 }
        )
    }
  } catch (err: unknown) {
    const { status, message, code } = xrpcError(err)
    return NextResponse.json(
      code ? { error: message, code } : { error: message },
      { status },
    )
  }
}
