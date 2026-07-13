import { NextRequest, NextResponse } from "next/server"
import { checkCsrf } from "@/lib/auth/csrf"
import { enforceRateLimit, makeLimiter } from "@/lib/auth/rate-limit"
import { clientIp } from "@/lib/utils/ip"
import { logSafe } from "@/lib/utils/log-safe"
import { OPERATIONS } from "./operations"
import { buildVariables, type ClientVariables } from "./variables"

/**
 * Same-origin proxy in front of the Magic Indexer's public GraphQL
 * endpoint.
 *
 * Trust boundary: the client sends an `operationName` + `variables`.
 * The server holds the actual query strings (see `OPERATIONS` in
 * ./operations.ts) and per-operation variable validators. The indexer endpoint itself
 * is public (read-only, no service-auth required for these
 * operations), but holding the queries server-side means:
 *
 *   - Same-origin contexts (including any XSS payload that lands
 *     in our origin via a leaflet link / facet) can only invoke
 *     queries we know about — not arbitrary `mutation` ops, not
 *     deeply-nested introspection, not server-side request forgery
 *     of arbitrary indexer endpoints.
 *   - Variables are clamped + type-checked per-operation rather than
 *     forwarded raw, so an attacker can't push pathological inputs
 *     (10k-element arrays, multi-MB strings) downstream.
 *
 * The operations below are public reads (feed, followers, received
 * endorsements) and run unauthenticated against the indexer.
 */

const UPSTREAM_INDEXER_URL =
  process.env.INDEXER_URL ||
  process.env.NEXT_PUBLIC_INDEXER_URL ||
  "https://magic-indexer-prod.up.railway.app/graphql"

// Module-load warning — flags the case where neither INDEXER_URL nor
// NEXT_PUBLIC_INDEXER_URL is
// set so the fallback default is silent in dev too. Production used
// to fall back to the dev indexer here; the default now points at
// prod so an unset env doesn't break the feed.
if (
  process.env.NODE_ENV === "production" &&
  !process.env.INDEXER_URL &&
  !process.env.NEXT_PUBLIC_INDEXER_URL
) {
  console.warn(
    "[indexer] no INDEXER_URL set in production — using the built-in " +
      "fallback (magic-indexer-prod). Set INDEXER_URL in the Vercel project " +
      "env to override.",
  )
}

const UPSTREAM_TIMEOUT_MS = 15_000
// 32KB — operationName + variables. The 16KB original was too tight for
// HydrateFeedPage, which sends up to 50 at:// URIs per kind × 4 kinds.
const MAX_BODY_SIZE = 32 * 1024

// IP-scoped rate limiter — defence in depth against a same-origin
// script / XSS fan-out abusing the proxy. Sized higher than the
// other BFF routes (resolve-handle = 100/min, search-actors =
// 60/min) because the indexer is the highest-fan-out route in the
// app: every home-feed page is 2 RPCs (FollowerEvents +
// HydrateFeedPage), every explore filter change is 2-3 RPCs, every
// profile-tab switch is 1+N. A power user navigating across tabs
// can plausibly cross 120/min in normal use. The real
// XSS/abuse defences here are the per-op variable caps, the
// 15s upstream timeout, and the 32KB body cap — this limit is just
// the global brake that ensures one IP can't monopolise the
// upstream throughput.
const LIMITER = makeLimiter("indexer-proxy", 240, 60)

/**
 * POST /api/indexer
 *
 * Body: `{ operationName: string; variables?: Record<string, unknown> }`
 *
 * Response: the upstream GraphQL response body verbatim, with
 * upstream status code preserved. GraphQL errors (200 with `errors`)
 * pass through to the client as they always have.
 */
export async function POST(request: NextRequest) {
  const csrfError = checkCsrf(request)
  if (csrfError) return csrfError

  const rateDenied = await enforceRateLimit(LIMITER, clientIp(request))
  if (rateDenied) return rateDenied

  const contentLength = request.headers.get("content-length")
  if (contentLength && Number(contentLength) > MAX_BODY_SIZE) {
    return NextResponse.json(
      { error: "Request body too large" },
      { status: 413 },
    )
  }

  let parsed: { operationName?: unknown; variables?: unknown }
  try {
    const text = await request.text()
    if (Buffer.byteLength(text, "utf8") > MAX_BODY_SIZE) {
      return NextResponse.json(
        { error: "Request body too large" },
        { status: 413 },
      )
    }
    parsed = JSON.parse(text) as typeof parsed
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  if (typeof parsed.operationName !== "string") {
    return NextResponse.json(
      { error: "operationName is required" },
      { status: 400 },
    )
  }
  const operationName = parsed.operationName

  // Own-key check: a plain `OPERATIONS[operationName]` lookup would let
  // Object.prototype keys (`constructor`, `toString`, …) return truthy
  // inherited members and slip past this gate.
  if (!Object.hasOwn(OPERATIONS, operationName)) {
    return NextResponse.json({ error: "Unknown operation" }, { status: 400 })
  }
  const query = OPERATIONS[operationName]

  const clientVars =
    parsed.variables && typeof parsed.variables === "object"
      ? (parsed.variables as ClientVariables)
      : {}
  const variables = buildVariables(operationName, clientVars)
  if (!variables) {
    return NextResponse.json(
      { error: "Invalid variables for operation" },
      { status: 400 },
    )
  }

  const result = await forwardToIndexer(
    query,
    operationName,
    variables,
    request.signal,
  )
  if (result instanceof NextResponse) return result

  return new NextResponse(result.responseBody, {
    status: result.upstream.status,
    headers: {
      "Content-Type":
        result.upstream.headers.get("content-type") || "application/json",
    },
  })
}

/**
 * Forward one validated operation to the upstream GraphQL endpoint.
 * Shared by POST (verbatim passthrough) and GET (edge-cacheable
 * variant): same timeout, same rate-limit-bypass header, same
 * error-to-status mapping. Returns the upstream Response + body text,
 * or a ready-made error NextResponse on timeout / network failure.
 */
async function forwardToIndexer(
  query: string,
  operationName: string,
  variables: Record<string, unknown>,
  requestSignal: AbortSignal,
): Promise<{ upstream: Response; responseBody: string } | NextResponse> {
  const timeoutController = new AbortController()
  const timeoutId = setTimeout(
    () => timeoutController.abort(),
    UPSTREAM_TIMEOUT_MS,
  )
  const signal = AbortSignal.any([requestSignal, timeoutController.signal])

  // Bypass the indexer's per-IP `/graphql` rate limiter (magic-indexer
  // R-7): the app's own proxied traffic should never be throttled.
  // Mirrors `resolve-did`; the header is only attached when
  // `INDEXER_RATELIMIT_BYPASS_KEY` is set, so the public default stays
  // limiter-eligible and unset envs are a no-op.
  const bypassKey = process.env.INDEXER_RATELIMIT_BYPASS_KEY
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  }
  if (bypassKey) headers["X-RateLimit-Bypass"] = bypassKey

  try {
    const upstream = await fetch(UPSTREAM_INDEXER_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({ query, variables, operationName }),
      signal,
    })

    const responseBody = await upstream.text()
    return { upstream, responseBody }
  } catch (err: unknown) {
    const error = err as { name?: string; message?: string }
    if (error?.name === "AbortError") {
      logSafe("[indexer] upstream timeout", err)
      return NextResponse.json(
        { error: "Indexer request timed out" },
        { status: 504 },
      )
    }
    logSafe("[indexer] upstream failed", err)
    return NextResponse.json(
      { error: "Indexer request failed" },
      { status: 502 },
    )
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * Shared-cache directives for the GET variant below. The five network
 * counts change on the order of hours — a 5 min shared TTL plus a day
 * of stale-while-revalidate keeps the /welcome stats strip warm
 * without a function invocation per visitor. The paginated scans
 * (AllEndorsements / OrganizationDids) get a shorter window so a
 * fresh write shows up within a minute.
 */
const COUNT_CACHE_CONTROL = "public, s-maxage=300, stale-while-revalidate=86400"
const SCAN_CACHE_CONTROL = "public, s-maxage=60, stale-while-revalidate=600"

/**
 * Operations servable via GET, mapped to their Cache-Control. Only
 * public, viewer-independent, staleness-tolerant reads belong here —
 * the edge cache key is the full query string, so every variable must
 * ride in it. NEVER add: FundingReceipts / FundingReceiptsForActivity
 * (money-adjacent attestation state must not be stale-shared),
 * ReceivedEndorsements / EvaluatorEndorsements (accept/reject state
 * drives UX immediately after a user action), FollowerEvents /
 * HydrateFeedPage / EndorsementClosure (viewer-derived variables,
 * cache-key explosion), or any op invoked with `search` / label
 * variance.
 */
const CACHEABLE_OPS: Record<string, string> = {
  ProfileCount: COUNT_CACHE_CONTROL,
  OrganizationCount: COUNT_CACHE_CONTROL,
  ActivityCount: COUNT_CACHE_CONTROL,
  ProjectCount: COUNT_CACHE_CONTROL,
  AwardCount: COUNT_CACHE_CONTROL,
  AllEndorsements: SCAN_CACHE_CONTROL,
  OrganizationDids: SCAN_CACHE_CONTROL,
}

/**
 * GET /api/indexer?op=<name>[&first][&after][&badgeType]
 *
 * Edge-cacheable variant of POST for the CACHEABLE_OPS allowlist —
 * POST responses are never edge-cached by Vercel, so the hot
 * zero-variable counts (5 parallel RPCs per cold /welcome visit) and
 * the /endorsement-graph scans invoked the function for every
 * visitor. Response body is identical to the POST form; anything
 * outside the allowlist 400s. Cache-Control is only set on a clean
 * 200 (no GraphQL `errors`, parseable body) so a transient upstream
 * failure is never pinned at the edge for the full TTL.
 *
 * No CSRF check: read-only, no credentials, allowlisted ops only.
 * The IP limiter stays — edge hits never reach the function, so it
 * only meters cache misses.
 */
export async function GET(request: NextRequest) {
  const rateDenied = await enforceRateLimit(LIMITER, clientIp(request))
  if (rateDenied) return rateDenied

  const searchParams = request.nextUrl.searchParams
  const operationName = searchParams.get("op") ?? ""
  // Own-key check — same reason as POST: prototype keys must not pass
  // the allowlist.
  if (!Object.hasOwn(CACHEABLE_OPS, operationName)) {
    return NextResponse.json({ error: "Unknown operation" }, { status: 400 })
  }
  const cacheControl = CACHEABLE_OPS[operationName]

  // Re-materialise the POST variable shape from the query string; the
  // per-op validators clamp exactly as they do for POST.
  const clientVars: ClientVariables = {}
  const first = searchParams.get("first")
  if (first !== null) clientVars.first = Number(first)
  const after = searchParams.get("after")
  if (after !== null) clientVars.after = after
  const badgeType = searchParams.get("badgeType")
  if (badgeType !== null) clientVars.badgeType = badgeType

  const variables = buildVariables(operationName, clientVars)
  if (!variables) {
    return NextResponse.json(
      { error: "Invalid variables for operation" },
      { status: 400 },
    )
  }

  const result = await forwardToIndexer(
    OPERATIONS[operationName],
    operationName,
    variables,
    request.signal,
  )
  if (result instanceof NextResponse) return result
  const { upstream, responseBody } = result

  const headers: Record<string, string> = {
    "Content-Type": upstream.headers.get("content-type") || "application/json",
  }
  if (upstream.status === 200 && !bodyHasErrors(responseBody)) {
    headers["Cache-Control"] = cacheControl
  }
  return new NextResponse(responseBody, { status: upstream.status, headers })
}

/** True when a 200 body carries GraphQL `errors` or isn't JSON at all. */
function bodyHasErrors(responseBody: string): boolean {
  try {
    const parsed = JSON.parse(responseBody) as { errors?: unknown }
    return parsed.errors !== undefined
  } catch {
    return true
  }
}
