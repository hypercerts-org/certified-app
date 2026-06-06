import { NextResponse, type NextRequest } from "next/server"
import {
  parsePastedAtUri,
  typeForCollection,
  recordUrl,
  profileUrl,
} from "@/lib/urls"

/**
 * pdsls.dev interop: when someone pastes an at-uri into the path —
 * `/at://did/collection/rkey`, `/at:/…`, or the host-safe `/at/…` form —
 * resolve it into the app's handle-forward scheme and 308 there. A record
 * collection maps to its friendly segment (`/{did}/activity|project/{rkey}`,
 * which then canonicalizes to the handle); any other collection (or a bare
 * repo) falls back to the owner's profile.
 *
 * Everything else passes straight through. The `/at` prefix check keeps the
 * per-request cost to a single string comparison.
 */
export function proxy(req: NextRequest): NextResponse {
  const { pathname } = req.nextUrl
  if (!pathname.startsWith("/at")) return NextResponse.next()

  const parsed = parsePastedAtUri(pathname)
  if (!parsed) return NextResponse.next()

  const type = typeForCollection(parsed.collection)
  const dest = type
    ? recordUrl(parsed.did, type, parsed.rkey)
    : profileUrl(parsed.did)

  const url = req.nextUrl.clone()
  url.pathname = dest
  return NextResponse.redirect(url, 308)
}

export const config = {
  // Run on page navigations only — skip Next internals, the API, and
  // static assets. The handler itself early-returns unless the path is an
  // at-uri, so this is just a coarse pre-filter.
  matcher: ["/((?!_next/static|_next/image|api/|favicon.ico).*)"],
}
