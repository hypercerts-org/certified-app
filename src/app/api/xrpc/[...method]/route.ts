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
} from "@/lib/auth/rate-limit"

const ALLOWED_WRITE_COLLECTIONS = [
  "org.impactindexer.link.attestation",
  "app.certified.actor.profile",
  "app.certified.actor.membership",
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
  "org.hypercerts.claim.activity",
  // Project records (and other curated collections like favorites /
  // portfolio / program — same NSID, distinguished by `type` field).
  // Used by the project detail inline-edit (issue #67) for own-DID
  // writes; group-owned project writes go through the BFF route at
  // `/api/groups/[groupDid]/project`.
  "org.hypercerts.collection",
]

const ALLOWED_BLOB_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]

const MAX_BLOB_SIZE = 4 * 1024 * 1024 // 4MB — Vercel serverless functions have a ~4.5MB request body limit

function asString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined
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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ method: string[] }> }
) {
  try {
    const { method } = await params
    const methodName = method.join(".")

    const did = await getSessionDid()

    // Try to build a bound agent if we have a session — it's nice to
    // have for methods that target the user's own repo (avoids a
    // roundtrip through resolvePdsUrl). Not having one is fine for the
    // public read methods below, which will always federate via plain
    // fetch against the target PDS.
    let agent: Agent | null = null
    if (did) {
      try {
        const client = await getOAuthClient()
        const oauthSession = await client.restore(did)
        agent = new Agent(oauthSession)
      } catch (err) {
        logSafe("[xrpc] oauth restore failed", err, { method: methodName })
        await deleteSession()
        // If it's a public read method, we can still proceed unauth;
        // otherwise fall through to the 401 below.
        if (!PUBLIC_READ_METHODS.has(methodName)) {
          return NextResponse.json({ error: "Session expired" }, { status: 401 })
        }
      }
    } else if (!PUBLIC_READ_METHODS.has(methodName)) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
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
          const targetPds = await resolvePdsUrl(repo)
          if (!targetPds) {
            return NextResponse.json({ error: "PDS not found for repo" }, { status: 404 })
          }

          const params = new URLSearchParams({ repo, collection, rkey })
          if (cid) params.set("cid", cid)

          try {
            const upstream = await fetch(
              `${targetPds}/xrpc/com.atproto.repo.getRecord?${params.toString()}`,
              { signal: AbortSignal.timeout(10_000) }
            )
            if (!upstream.ok) {
              const status = upstream.status
              return NextResponse.json(
                { error: `Upstream PDS returned ${status}` },
                { status }
              )
            }
            const data = await upstream.json()
            return NextResponse.json(data, { headers: FOREIGN_READ_CACHE_HEADERS })
          } catch (err) {
            logSafe("[xrpc] foreign-pds upstream", err, { method: methodName, pds: targetPds })
            return NextResponse.json({ error: "Upstream request failed" }, { status: 502 })
          }
        }

        // Same-session repo path — reuse the bound agent when we have
        // one; null agent at this point is unreachable because the
        // foreign-repo branch above already handled the !did case.
        if (!agent) {
          return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
        }
        const result = await agent.com.atproto.repo.getRecord({ repo, collection, rkey, cid })
        return NextResponse.json(result.data, { headers: SAME_SESSION_NO_STORE_HEADERS })
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
          const targetPds = await resolvePdsUrl(repo)
          if (!targetPds) {
            // Cache the empty-result shortcut too — otherwise a feed
            // that hits an unresolvable DID will repeatedly retry the
            // (cached-as-null) DID lookup and short-circuit here.
            return NextResponse.json(
              { records: [] },
              { headers: FOREIGN_READ_CACHE_HEADERS },
            )
          }

          const params = new URLSearchParams({ repo, collection })
          const limit = parseLimit(queryParams.limit)
          if (limit !== undefined) params.set("limit", String(limit))
          if (cursor) params.set("cursor", cursor)
          if (reverse === "true") params.set("reverse", "true")
          if (rkeyEnd) params.set("rkeyEnd", rkeyEnd)
          if (rkeyStart) params.set("rkeyStart", rkeyStart)

          try {
            const upstream = await fetch(
              `${targetPds}/xrpc/com.atproto.repo.listRecords?${params.toString()}`,
              {
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
            // Short cache for foreign-repo public reads — a typical feed
            // render fans this out across many DIDs and the user is fine
            // seeing data that's <30s stale. Their *own* repo skips this
            // (see else branch) so they always see fresh writes.
            return NextResponse.json(data, { headers: FOREIGN_READ_CACHE_HEADERS })
          } catch (err) {
            logSafe("[xrpc] foreign-pds upstream", err, { method: methodName, pds: targetPds })
            return NextResponse.json(
              { error: "Upstream request failed", records: [] },
              { status: 502 }
            )
          }
        }

        if (!agent) {
          return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
        }
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
      }
      case "com.atproto.server.getSession": {
        if (!agent) {
          return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
        }
        const result = await agent.com.atproto.server.getSession()
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
          const targetPds = await resolvePdsUrl(blobDid)
          if (!targetPds) {
            return NextResponse.json({ error: "PDS not found for did" }, { status: 404 })
          }

          try {
            const params = new URLSearchParams({ did: blobDid, cid })
            const upstream = await fetch(
              `${targetPds}/xrpc/com.atproto.sync.getBlob?${params.toString()}`,
              { signal: AbortSignal.timeout(15_000) }
            )
            if (!upstream.ok) {
              return NextResponse.json(
                { error: `Upstream PDS returned ${upstream.status}` },
                { status: upstream.status }
              )
            }
            return new NextResponse(upstream.body, {
              status: 200,
              headers: {
                "Content-Type":
                  upstream.headers.get("content-type") || "application/octet-stream",
                "Cache-Control": upstream.headers.get("cache-control") || "public, max-age=3600",
                "X-Content-Type-Options": "nosniff",
                "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
              },
            })
          } catch (err) {
            logSafe("[xrpc] foreign-pds upstream", err, { method: methodName, pds: targetPds })
            return NextResponse.json({ error: "Upstream request failed" }, { status: 502 })
          }
        }

        if (!agent) {
          return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
        }
        const result = await agent.com.atproto.sync.getBlob({ did: blobDid, cid })
        const blob = result.data as Uint8Array
        return new NextResponse(Buffer.from(blob), {
          headers: {
            "Content-Type":
              result.headers["content-type"] || "application/octet-stream",
            "X-Content-Type-Options": "nosniff",
            "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
          },
        })
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
                error: "Too many endorsement writes — try again later.",
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
