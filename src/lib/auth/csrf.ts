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
    const expectedOrigin = new URL(PUBLIC_URL).origin
    const requestOrigin = new URL(rawOrigin).origin

    if (requestOrigin !== expectedOrigin) {
      return NextResponse.json({ error: "Forbidden: invalid origin" }, { status: 403 })
    }
    return null
  } catch {
    return NextResponse.json({ error: "Forbidden: invalid origin" }, { status: 403 })
  }
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
