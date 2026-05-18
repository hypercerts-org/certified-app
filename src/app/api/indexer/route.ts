import { NextRequest, NextResponse } from "next/server"
import { checkCsrf } from "@/lib/auth/csrf"
import { logSafe } from "@/lib/utils/log-safe"

/**
 * The upstream Magic Indexer GraphQL endpoint. Read on the server only.
 *
 * Resolution order:
 *   1. INDEXER_URL — preferred, server-only env var.
 *   2. NEXT_PUBLIC_INDEXER_URL — kept as a fallback so existing
 *      Vercel project configs continue to work without an env-var
 *      rename. Going forward this can drop the NEXT_PUBLIC_ prefix.
 *   3. The hardcoded dev instance, matching the previous client
 *      default in src/lib/atproto/indexer.ts.
 *
 * The path (`/graphql`) is included in the env value so we can point
 * at production instances that mount the schema under a different
 * path without a code change.
 */
const UPSTREAM_INDEXER_URL =
  process.env.INDEXER_URL ||
  process.env.NEXT_PUBLIC_INDEXER_URL ||
  "https://magic-indexer-dev.up.railway.app/graphql"

// Mirror the module-load warning the notifications route already has
// (src/app/api/notifications/route.ts:34) — without this a production
// deploy that forgets to set INDEXER_URL silently routes every feed
// query at the dev indexer, returning stale or inconsistent data.
if (
  process.env.NODE_ENV === "production" &&
  !process.env.INDEXER_URL &&
  !process.env.NEXT_PUBLIC_INDEXER_URL
) {
  console.warn(
    "[indexer] no INDEXER_URL set in production — falling back to the dev " +
      "instance. Set INDEXER_URL in the Vercel project env.",
  )
}

/** Hard cap on the upstream request — matches the indexer's typical
 *  warm-cache response time (~500ms) with generous headroom. */
const UPSTREAM_TIMEOUT_MS = 15_000

/** Maximum allowed request body size (100 KB). GraphQL queries for
 *  this endpoint are small; anything larger is likely abuse. */
const MAX_BODY_SIZE = 100 * 1024

/**
 * POST /api/indexer
 *
 * Server-side proxy in front of the Magic Indexer GraphQL endpoint.
 *
 * Why: when the browser fetches the indexer directly, every Vercel
 * preview / staging / custom domain has to be added to the
 * indexer's CORS allowlist (`ALLOWED_ORIGINS` env var on Magic
 * Indexer). Routing the request through this same-origin proxy
 * sidesteps CORS entirely — the browser only ever talks to its own
 * origin, and the server-to-server fetch downstream isn't subject
 * to CORS.
 *
 * The body is forwarded verbatim as `application/json` and the
 * upstream response is returned with its status code preserved so
 * the client hook (`fetchIndexerActivities`) can surface
 * GraphQL-level errors the same way it always has.
 */
export async function POST(request: NextRequest) {
  // Same-origin guard: this is a write-shaped (POST) endpoint that
  // forwards bandwidth and IP anonymization to an upstream service.
  // Without checkCsrf any origin could POST through us. (Reading the
  // feed unauthenticated is fine — that's why we don't require a
  // session DID — but the request must originate from this app.)
  const csrfError = checkCsrf(request)
  if (csrfError) return csrfError

  // Forward the raw body to keep the proxy schema-agnostic — we
  // don't validate the GraphQL query shape here, the upstream does.
  // Reading the body as text avoids re-serializing JSON.
  // Reject oversized payloads early via Content-Length, then enforce
  // the limit again after reading the body in case the header was
  // absent or spoofed.
  const contentLength = request.headers.get("content-length")
  if (contentLength && Number(contentLength) > MAX_BODY_SIZE) {
    return NextResponse.json(
      { error: "Request body too large" },
      { status: 413 }
    )
  }

  let body: string
  try {
    body = await request.text()
  } catch {
    return NextResponse.json(
      { error: "Failed to read request body" },
      { status: 400 }
    )
  }

  if (body.length > MAX_BODY_SIZE) {
    return NextResponse.json(
      { error: "Request body too large" },
      { status: 413 }
    )
  }

  // Block mutation operations. The indexer's public /graphql endpoint
  // is for reads; the notifications mutations live on a separate
  // /notifications/graphql endpoint reached via the
  // /api/notifications proxy with operation allowlisting. Without
  // this guard, an XSS payload (or any same-origin context) could
  // call arbitrary GraphQL operations through us.
  //
  // The detection trims leading whitespace + GraphQL comments before
  // scanning for the `mutation` keyword to defeat
  // `\n# comment\nmutation { … }` style smuggling.
  try {
    const parsed = JSON.parse(body) as { query?: unknown }
    if (typeof parsed.query === "string" && isLikelyMutation(parsed.query)) {
      return NextResponse.json(
        { error: "Mutations are not allowed through this proxy" },
        { status: 400 },
      )
    }
  } catch {
    // Not JSON — let the upstream return its native parse error. The
    // body-size cap already bounds the work.
  }

  // Inherit the client's abort signal where possible so a navigation
  // away cancels the upstream fetch instead of leaving it dangling,
  // and add a hard timeout in case the indexer hangs.
  const timeoutController = new AbortController()
  const timeoutId = setTimeout(
    () => timeoutController.abort(),
    UPSTREAM_TIMEOUT_MS
  )
  // Combine the request signal with the timeout signal so either
  // can cancel the upstream fetch.
  const signal = AbortSignal.any([request.signal, timeoutController.signal])

  try {
    const upstream = await fetch(UPSTREAM_INDEXER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      signal,
      // No credentials forwarded — the indexer's public /graphql
      // endpoint doesn't accept auth on this path anyway.
    })

    const responseBody = await upstream.text()
    return new NextResponse(responseBody, {
      status: upstream.status,
      headers: {
        "Content-Type":
          upstream.headers.get("content-type") || "application/json",
      },
    })
  } catch (err: unknown) {
    const error = err as { name?: string; message?: string }
    if (error?.name === "AbortError") {
      logSafe("[indexer] upstream timeout", err)
      return NextResponse.json(
        { error: "Indexer request timed out" },
        { status: 504 }
      )
    }
    logSafe("[indexer] upstream failed", err)
    return NextResponse.json(
      { error: "Indexer request failed" },
      { status: 502 }
    )
  } finally {
    clearTimeout(timeoutId)
  }
}

/** True when the GraphQL query string starts (ignoring leading whitespace
 *  and `#` line-comments) with the `mutation` keyword. */
function isLikelyMutation(query: string): boolean {
  // Strip leading whitespace and `# …\n` comments. Bounded loop in
  // case of pathological input (e.g. one-megabyte comment block —
  // already prevented by MAX_BODY_SIZE but belt + braces).
  let i = 0
  const n = query.length
  let guard = 0
  while (i < n && guard < 4096) {
    const ch = query.charCodeAt(i)
    if (ch === 32 || ch === 9 || ch === 10 || ch === 13) {
      i++
    } else if (ch === 35 /* # */) {
      while (i < n && query.charCodeAt(i) !== 10) i++
    } else {
      break
    }
    guard++
  }
  return query.slice(i, i + 8).toLowerCase().startsWith("mutation")
}
