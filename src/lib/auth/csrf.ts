import { NextRequest, NextResponse } from "next/server"

const PUBLIC_URL = process.env.PUBLIC_URL || "http://localhost:3000"

/**
 * Validates the Origin header on POST requests to prevent CSRF.
 * Returns a 403 response if the origin does not match, or null if valid.
 */
export function checkCsrf(request: NextRequest): NextResponse | null {
  const origin = request.headers.get("origin")
  // If no Origin header (e.g. same-origin fetch without it), allow.
  // Browsers always send Origin on cross-origin POST requests.
  if (!origin) return null

  const expectedOrigin = new URL(PUBLIC_URL).origin
  const requestOrigin = new URL(origin).origin

  if (requestOrigin !== expectedOrigin) {
    return NextResponse.json({ error: "Forbidden: invalid origin" }, { status: 403 })
  }
  return null
}
