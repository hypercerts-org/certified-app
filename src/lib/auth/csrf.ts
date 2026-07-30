import { NextRequest, NextResponse } from "next/server"
import { ALLOWED_REQUEST_ORIGINS } from "@/lib/utils/config"

/**
 * Validates browser mutation requests against the app's configured origins.
 * The source must be both trusted and identical to the request destination;
 * configured Vercel branch and deployment hosts are not cross-origin peers.
 */
export function checkCsrf(request: NextRequest): NextResponse | null {
  const origin = request.headers.get("origin")
  const referer = request.headers.get("referer")

  // Explicitly reject "null" origin strings. Some browsers send the
  // literal string "null" for sandboxed iframes, redirected requests,
  // and file:// origins. Treating "null" as a valid origin would let
  // an attacker forge cross-origin POST requests from those contexts.
  if (origin === "null") {
    return NextResponse.json({ error: "Forbidden: null origin" }, { status: 403 })
  }

  // Deliberate divergence from the older "absent Origin is allowed"
  // behavior: browser-issued same-origin mutations carry Origin or Referer,
  // so fail closed when both are absent.
  if (!origin && !referer) {
    return NextResponse.json({ error: "Forbidden: missing origin" }, { status: 403 })
  }

  const incoming = origin
    ? parseOriginHeader(origin)
    : referer
      ? parseReferer(referer)
      : null

  if (!incoming) {
    return NextResponse.json({ error: "Forbidden: invalid origin" }, { status: 403 })
  }

  const destination = request.nextUrl
  const isSameDestination = incoming.origin === destination.origin

  if (
    isSameDestination &&
    (ALLOWED_REQUEST_ORIGINS.has(incoming.origin) ||
      isAllowedDevelopmentLoopback(incoming))
  ) {
    return null
  }

  return NextResponse.json({ error: "Forbidden: invalid origin" }, { status: 403 })
}

/** Origin headers contain only a scheme/host/port tuple, never a URL path. */
function parseOriginHeader(value: string): URL | null {
  try {
    const url = new URL(value)
    if (
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    ) {
      return null
    }
    return url
  } catch {
    return null
  }
}

/** Referer is a full page URL, so only its authenticated origin is retained. */
function parseReferer(value: string): URL | null {
  try {
    const url = new URL(value)
    if (url.username || url.password) return null
    return new URL(url.origin)
  } catch {
    return null
  }
}

// Dev convenience: PUBLIC_URL commonly pins to 127.0.0.1 for OAuth while a
// browser tab may use localhost. Accept the alternate loopback spelling only
// when one configured loopback origin has the same protocol and port. The
// caller already verified source === request destination.
function isAllowedDevelopmentLoopback(incoming: URL): boolean {
  if (process.env.NODE_ENV === "production" || !isLoopbackHost(incoming.hostname)) {
    return false
  }

  for (const allowedOrigin of ALLOWED_REQUEST_ORIGINS) {
    const allowed = new URL(allowedOrigin)
    if (
      allowed.protocol === incoming.protocol &&
      allowed.port === incoming.port &&
      isLoopbackHost(allowed.hostname)
    ) {
      return true
    }
  }

  return false
}

function isLoopbackHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]"
}
