import { NextRequest, NextResponse } from "next/server"
import { PUBLIC_URL } from "@/lib/utils/config"

/**
 * Validates the Origin header on POST requests to prevent CSRF.
 * Returns a 403 response if the origin does not match, or null if valid.
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

  const rawOrigin = origin || (referer ? extractOrigin(referer) : null)

  if (!rawOrigin) {
    return NextResponse.json({ error: "Forbidden: missing origin" }, { status: 403 })
  }

  try {
    const expected = new URL(PUBLIC_URL)
    const incoming = new URL(rawOrigin)

    if (incoming.origin === expected.origin) return null

    // Dev convenience: PUBLIC_URL pins to one loopback form (the project
    // convention is 127.0.0.1 for OAuth + cookie reasons), but a browser
    // tab opened at http://localhost:3000 sends Origin: localhost — and
    // the strict match above 403s every same-origin POST. In
    // development only, treat 127.0.0.1 and localhost as the same origin
    // when protocol + port match. Production stays strict.
    if (
      process.env.NODE_ENV !== "production" &&
      incoming.protocol === expected.protocol &&
      incoming.port === expected.port &&
      isLoopbackHost(incoming.hostname) &&
      isLoopbackHost(expected.hostname)
    ) {
      return null
    }

    return NextResponse.json({ error: "Forbidden: invalid origin" }, { status: 403 })
  } catch {
    return NextResponse.json({ error: "Forbidden: invalid origin" }, { status: 403 })
  }
}

function isLoopbackHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]"
}

/** Safely extract the origin from a Referer header value. Returns null
 *  if the URL is malformed, preventing URL-constructor exceptions from
 *  leaking into the CSRF check. */
function extractOrigin(referer: string): string | null {
  try {
    return new URL(referer).origin
  } catch {
    return null
  }
}
