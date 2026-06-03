import { NextRequest, NextResponse } from "next/server"
import { Agent } from "@atproto/api"
import { getOAuthClient } from "@/lib/auth/oauth-client"
import { getSessionDid, deleteSession } from "@/lib/auth/session"
import { checkCsrf } from "@/lib/auth/csrf"
import { getServiceAuthToken } from "@/lib/atproto/service-auth"
import { NOTIFICATIONS_AGGREGATION_ENABLED } from "@/lib/utils/config"

/**
 * Trust boundary between the client and the indexer's service-auth
 * GraphQL endpoint. The client sends an operationName + variables.
 * The server holds the actual query strings, mints a short-lived
 * AT Protocol service-auth JWT via the user's OAuth session, and
 * forwards to the indexer. The indexer reads the acting DID from
 * the JWT `iss` claim — we no longer inject `did` into variables.
 *
 * Endpoint: POST {INDEXER_URL_BASE}/notifications/graphql
 *   Authorization: Bearer <jwt>
 *     iss  = user's DID       (from OAuth agent / PDS signature)
 *     aud  = indexer's DID    (INDEXER_DID env)
 *     lxm  = "com.hypergoat.notification.query"
 *     exp  = ~60s in future   (SDK default)
 *     jti  = random           (replay-cache protected indexer-side)
 */

const INDEXER_URL_BASE = (
  process.env.INDEXER_URL ||
  process.env.NEXT_PUBLIC_INDEXER_URL ||
  "https://magic-indexer-dev.up.railway.app/graphql"
).replace(/\/graphql$/, "")

const INDEXER_DID = process.env.INDEXER_DID || ""
const SERVICE_AUTH_LXM = "com.hypergoat.notification.query"

if (process.env.NODE_ENV === "production" && !INDEXER_DID) {
  console.warn(
    "[Notifications] INDEXER_DID is not set — notification requests will return 503.",
  )
} else if (INDEXER_DID && !INDEXER_DID.startsWith("did:")) {
  console.warn(
    `[Notifications] INDEXER_DID does not look like a DID: "${INDEXER_DID}". JWTs will be rejected by the indexer.`,
  )
}

const UPSTREAM_TIMEOUT_MS = 15_000
const SERVICE_AUTH_TIMEOUT_MS = 5_000
const MAX_BODY_SIZE = 16 * 1024
const MAX_FIRST = 100
// Cap the aggregated recipient set. A user owns/admins few groups in
// practice; this bounds the indexer query and rejects pathological input.
const MAX_RECIPIENTS = 25

/** Allowlist of GraphQL operations we forward. The client sends only
 *  operationName + variables; the query string is held server-side.
 *  The indexer derives the acting DID from the JWT, so these queries
 *  don't take a `$did` variable. */
const OPERATIONS: Record<string, string> = {
  notifications: `
    query notifications($first: Int!, $after: String) {
      notifications(first: $first, after: $after) {
        edges {
          cursor
          node {
            id
            reason
            reasonSubject
            sortAt
            count
            latestRecordUri
            latestRecordCid
            latestAuthor
            isRead
          }
        }
        pageInfo { hasNextPage endCursor }
      }
    }`,
  unreadNotificationCount: `
    query unreadNotificationCount {
      unreadNotificationCount { count more }
    }`,
  updateNotificationsSeen: `
    mutation updateNotificationsSeen($seenAt: String) {
      updateNotificationsSeen(seenAt: $seenAt)
    }`,
}

/**
 * Aggregated query variants — used ONLY when the NOTIFICATIONS_AGGREGATION
 * flag is on AND the client supplied a non-empty `recipients` set. Held
 * apart from OPERATIONS so the default path's query stays byte-identical:
 * an indexer that doesn't yet understand `recipients` never receives the
 * argument. The node also selects the new `recipient` field so the client
 * can tag each row "via {group}". See
 * docs/org-identity/indexer-notifications-aggregation.md.
 */
const AGGREGATED_OPERATIONS: Record<string, string> = {
  notifications: `
    query notifications($first: Int!, $after: String, $recipients: [String!]) {
      notifications(first: $first, after: $after, recipients: $recipients) {
        edges {
          cursor
          node {
            id
            reason
            reasonSubject
            sortAt
            count
            latestRecordUri
            latestRecordCid
            latestAuthor
            isRead
            recipient
          }
        }
        pageInfo { hasNextPage endCursor }
      }
    }`,
  unreadNotificationCount: `
    query unreadNotificationCount($recipients: [String!]) {
      unreadNotificationCount(recipients: $recipients) { count more }
    }`,
}

type ClientVariables = {
  first?: unknown
  after?: unknown
  seenAt?: unknown
  recipients?: unknown
}

/**
 * Validate a client-supplied `recipients` list. Returns null (the arg is
 * dropped) when the flag is off, the input is malformed, or nothing
 * survives — so the default path never sends `recipients`. The indexer
 * re-authorizes every DID against its own role index; this is only shape +
 * bound validation (DID-looking strings, deduped, capped).
 */
function parseRecipients(raw: unknown): string[] | null {
  if (!NOTIFICATIONS_AGGREGATION_ENABLED) return null
  if (!Array.isArray(raw)) return null
  const out: string[] = []
  const seen = new Set<string>()
  for (const v of raw) {
    if (typeof v !== "string") continue
    if (!v.startsWith("did:") || v.length > 256) continue
    if (seen.has(v)) continue
    seen.add(v)
    out.push(v)
    if (out.length >= MAX_RECIPIENTS) break
  }
  return out.length > 0 ? out : null
}

/** Normalize client-supplied variables per-operation. */
function buildVariables(
  operationName: string,
  vars: ClientVariables,
): Record<string, unknown> | null {
  switch (operationName) {
    case "notifications": {
      const first = typeof vars.first === "number" && Number.isFinite(vars.first)
        ? Math.min(Math.max(1, Math.floor(vars.first)), MAX_FIRST)
        : 50
      const after =
        typeof vars.after === "string" && vars.after.length > 0 && vars.after.length <= 512
          ? vars.after
          : null
      const recipients = parseRecipients(vars.recipients)
      return recipients ? { first, after, recipients } : { first, after }
    }
    case "unreadNotificationCount": {
      const recipients = parseRecipients(vars.recipients)
      return recipients ? { recipients } : {}
    }
    case "updateNotificationsSeen": {
      let seenAt: string = new Date().toISOString()
      if (typeof vars.seenAt === "string" && Number.isFinite(Date.parse(vars.seenAt))) {
        seenAt = vars.seenAt
      }
      return { seenAt }
    }
    default:
      return null
  }
}

export async function POST(request: NextRequest) {
  const csrfError = checkCsrf(request)
  if (csrfError) return csrfError

  const sessionDid = await getSessionDid()
  if (!sessionDid) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  if (!INDEXER_DID) {
    return NextResponse.json(
      { error: "Notifications not configured" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    )
  }

  const contentLength = request.headers.get("content-length")
  if (contentLength && Number(contentLength) > MAX_BODY_SIZE) {
    return NextResponse.json({ error: "Request body too large" }, { status: 413 })
  }

  let parsed: { operationName?: unknown; variables?: unknown }
  try {
    const text = await request.text()
    if (text.length > MAX_BODY_SIZE) {
      return NextResponse.json({ error: "Request body too large" }, { status: 413 })
    }
    parsed = JSON.parse(text) as typeof parsed
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  if (typeof parsed.operationName !== "string") {
    return NextResponse.json({ error: "operationName is required" }, { status: 400 })
  }

  // OPERATIONS is the allowlist; the AGGREGATED_OPERATIONS variants share
  // the same names, so allowlisting against OPERATIONS covers both.
  if (!OPERATIONS[parsed.operationName]) {
    return NextResponse.json({ error: "Unknown operation" }, { status: 400 })
  }

  const clientVars = (parsed.variables ?? {}) as ClientVariables
  const variables = buildVariables(parsed.operationName, clientVars)
  if (!variables) {
    return NextResponse.json({ error: "Unknown operation" }, { status: 400 })
  }

  // Pick the aggregated variant only when `buildVariables` actually
  // produced a `recipients` arg (flag on + valid input). Otherwise the
  // default query goes out unchanged — the indexer never sees the new arg.
  const query =
    "recipients" in variables && AGGREGATED_OPERATIONS[parsed.operationName]
      ? AGGREGATED_OPERATIONS[parsed.operationName]
      : OPERATIONS[parsed.operationName]

  // Restore OAuth agent — mirror the XRPC proxy pattern. If restore
  // fails, the session is stale: delete it and return 401 so the
  // user can re-auth.
  let agent: Agent
  try {
    const client = await getOAuthClient()
    const oauthSession = await client.restore(sessionDid)
    agent = new Agent(oauthSession)
  } catch {
    await deleteSession()
    return NextResponse.json({ error: "Session expired" }, { status: 401 })
  }

  // Mint a per-request service-auth JWT. Fresh each time — the
  // indexer has a replay cache on jti, so caching would break.
  let jwt: string
  const saController = new AbortController()
  const saTimeoutId = setTimeout(() => saController.abort(), SERVICE_AUTH_TIMEOUT_MS)
  try {
    jwt = await getServiceAuthToken(agent, INDEXER_DID, SERVICE_AUTH_LXM, {
      signal: saController.signal,
    })
  } catch (err) {
    // PDS-side failure — session is still valid, but we can't get a
    // JWT right now. 502 signals a backend issue, not session expiry.
    console.warn(
      "[Notifications] getServiceAuth failed:",
      err instanceof Error ? err.message : err,
    )
    return NextResponse.json(
      { error: "Could not mint service-auth token" },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    )
  } finally {
    clearTimeout(saTimeoutId)
  }

  const upstreamController = new AbortController()
  const timeoutId = setTimeout(() => upstreamController.abort(), UPSTREAM_TIMEOUT_MS)
  const signal = AbortSignal.any([request.signal, upstreamController.signal])

  // Bypass the indexer's per-IP rate limiter (magic-indexer R-7) for
  // the app's own proxied traffic. Mirrors `resolve-did` / `/api/indexer`;
  // attached only when `INDEXER_RATELIMIT_BYPASS_KEY` is non-empty.
  const bypassKey = process.env.INDEXER_RATELIMIT_BYPASS_KEY
  const upstreamHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${jwt}`,
  }
  if (bypassKey) upstreamHeaders["X-RateLimit-Bypass"] = bypassKey

  try {
    const upstream = await fetch(`${INDEXER_URL_BASE}/notifications/graphql`, {
      method: "POST",
      headers: upstreamHeaders,
      body: JSON.stringify({ query, variables, operationName: parsed.operationName }),
      signal,
    })

    const responseBody = await upstream.text()

    // Upstream 401/403 mean the JWT was rejected by the indexer
    // (clock skew, key rotation, indexer misconfiguration) — not
    // that the user's session with our app is invalid. Map to 502
    // so the client treats it as a backend issue, not a signout.
    // Preserve 429 + Retry-After for rate limits.
    if (!upstream.ok) {
      console.warn(`[Notifications] upstream ${upstream.status}`)
      const clientStatus =
        upstream.status === 401 || upstream.status === 403 ? 502 : upstream.status
      const headers: Record<string, string> = { "Cache-Control": "no-store" }
      const retryAfter = upstream.headers.get("retry-after")
      if (retryAfter) headers["Retry-After"] = retryAfter
      return NextResponse.json(
        { error: `Notifications request failed: ${clientStatus}` },
        { status: clientStatus, headers },
      )
    }

    return new NextResponse(responseBody, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    })
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return NextResponse.json({ error: "Notifications request timed out" }, { status: 504 })
    }
    return NextResponse.json({ error: "Notifications request failed" }, { status: 502 })
  } finally {
    clearTimeout(timeoutId)
  }
}
