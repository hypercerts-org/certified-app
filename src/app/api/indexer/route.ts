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
