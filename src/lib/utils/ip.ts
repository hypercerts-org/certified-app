import type { NextRequest } from "next/server"

/**
 * Resolve the client IP for rate-limiting purposes.
 *
 * Vercel-trusted source first: `x-real-ip` is set by the Vercel edge
 * to the actual connecting IP and is NOT client-controllable. The
 * leftmost X-Forwarded-For value IS client-controllable (any client
 * can prepend their own value before Vercel appends the edge IP), so
 * we never trust it. As a fallback we read the RIGHTMOST hop of XFF
 * — that's whichever proxy last added itself, which on Vercel is the
 * trusted edge. If both headers are absent we fall back to a
 * constant so the limiter still applies globally (defense in depth:
 * an IP-less request still consumes budget against the same bucket
 * as every other IP-less request).
 *
 * On localhost / non-Vercel environments both headers are usually
 * absent — the constant fallback applies, which is fine for dev. */
export function clientIp(request: NextRequest): string {
  const realIp = request.headers.get("x-real-ip")
  if (realIp && realIp.length > 0) return realIp

  const xff = request.headers.get("x-forwarded-for")
  if (xff) {
    const parts = xff
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean)
    if (parts.length > 0) return parts[parts.length - 1]
  }

  return "unknown"
}
