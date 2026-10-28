import { NextResponse, type NextRequest } from "next/server"
import {
  parsePastedAtUri,
  typeForCollection,
  recordUrl,
  profileUrl,
} from "@/lib/urls"
import {
  buildEnforcedCsp,
  buildStrictCsp,
  frameAncestorsFor,
  generateNonce,
  reportingEndpointsHeader,
} from "@/lib/security/csp"

/**
 * Two jobs, both on page navigations:
 *
 * 1. pdsls.dev interop: when someone pastes an at-uri into the path —
 *    `/at://did/collection/rkey`, `/at:/…`, or the host-safe `/at/…` form —
 *    resolve it into the app's handle-forward scheme and 308 there. A
 *    record collection maps to its friendly segment
 *    (`/{did}/activity|project/{rkey}`, which then canonicalizes to the
 *    handle); any other collection (or a bare repo) falls back to the
 *    owner's profile.
 *
 * 2. CSP (TECH-803): every other page request gets a fresh nonce, the
 *    enforced policy with that nonce, and the strict nonce-based policy as
 *    Content-Security-Policy-Report-Only. The enforced policy is set on the
 *    request too, because Next.js reads the nonce from there and stamps it
 *    on its own scripts; `x-nonce` hands it to the root layout for the
 *    scripts Next.js doesn't own (next-themes).
 */
export function proxy(req: NextRequest): NextResponse {
  const { pathname } = req.nextUrl
  if (!pathname.startsWith("/at")) return withStrictCsp(req)

  const parsed = parsePastedAtUri(pathname)
  if (!parsed) return withStrictCsp(req)

  const type = typeForCollection(parsed.collection)
  const dest = type
    ? recordUrl(parsed.did, type, parsed.rkey)
    : profileUrl(parsed.did)

  const url = req.nextUrl.clone()
  url.pathname = dest
  return NextResponse.redirect(url, 308)
}

function withStrictCsp(req: NextRequest): NextResponse {
  // `next/link` prefetches render no HTML, so they need no nonce.
  if (
    req.headers.has("next-router-prefetch") ||
    req.headers.get("purpose") === "prefetch"
  ) {
    return NextResponse.next()
  }

  const options = {
    nonce: generateNonce(),
    isDev: process.env.NODE_ENV !== "production",
    frameAncestors: frameAncestorsFor(req.nextUrl.pathname),
  }
  const enforced = buildEnforcedCsp(options)

  // Next.js takes the nonce from the request's `content-security-policy`
  // header. On Vercel the response CSP headers below also reach the
  // renderer as request headers, so both carry the same nonce.
  const requestHeaders = new Headers(req.headers)
  requestHeaders.set("x-nonce", options.nonce)
  requestHeaders.set("content-security-policy", enforced)

  const res = NextResponse.next({ request: { headers: requestHeaders } })
  res.headers.set("Content-Security-Policy", enforced)
  res.headers.set("Content-Security-Policy-Report-Only", buildStrictCsp(options))
  res.headers.set("Reporting-Endpoints", reportingEndpointsHeader())
  return res
}

export const config = {
  // Run on page navigations only — skip Next internals, the API, and
  // static assets.
  matcher: ["/((?!_next/static|_next/image|api/|favicon.ico).*)"],
}
