import { NextRequest, NextResponse } from "next/server"
import { getSessionDid } from "@/lib/auth/session"
import { enforceRateLimit, makeLimiter } from "@/lib/auth/rate-limit"
import { logSafe } from "@/lib/utils/log-safe"
import { normalizeSiteUrl } from "@/lib/look/site-design"
import { SiteCaptureError, captureSite } from "@/lib/look/site-capture"
import type { SiteCaptureResponse } from "@/lib/look/site-capture-types"

/**
 * `GET /api/looks/site-capture?url=<site>` — what a website looks like when
 * rendered: screenshots, logo, share image, the computed styles of its real
 * elements and its visible colours, for making a style from it (Settings →
 * Appearance). The sibling of /api/looks/site-design, which reads the CSS.
 *
 * Chromium runs in a throwaway Vercel Sandbox VM, never in this function
 * (src/lib/look/site-capture.ts). Signed-in only and rate-limited more
 * tightly than the digest, since each capture boots a VM. When screenshots
 * aren't set up (503), the browser makes the style from the digest alone.
 */

export const runtime = "nodejs"
export const maxDuration = 60

// Each capture boots a VM: 10 per 10 minutes.
const LIMITER = makeLimiter("site-capture", 10, 600)

function fail(error: string, status: number) {
  return NextResponse.json<SiteCaptureResponse>({ error }, { status })
}

export async function GET(request: NextRequest) {
  const did = await getSessionDid()
  if (!did) return fail("Sign in to make a style.", 401)

  const denied = await enforceRateLimit(LIMITER, did, "Too many websites in a short time. Try again in a few minutes.")
  if (denied) return denied

  const url = normalizeSiteUrl(request.nextUrl.searchParams.get("url"))
  if (!url) return fail("That doesn't look like a website address.", 400)

  try {
    const capture = await captureSite(url.toString())
    return NextResponse.json<SiteCaptureResponse>({ capture }, { headers: { "Cache-Control": "private, no-store" } })
  } catch (err) {
    if (err instanceof SiteCaptureError && err.code === "unavailable") return fail(err.message, 503)
    logSafe("[site-capture] capture failed", err)
    return fail("Couldn't take screenshots of that website.", 502)
  }
}
