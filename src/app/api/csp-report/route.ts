import { NextRequest, NextResponse } from "next/server"
import { enforceRateLimit, makeLimiter } from "@/lib/auth/rate-limit"
import { clientIp } from "@/lib/utils/ip"
import { parseCspReports } from "@/lib/security/csp-report"

/**
 * Receives Content-Security-Policy violation reports (TECH-803) and
 * writes one `[csp-report]` line per violation to the function logs.
 * Parsing and URL redaction live in `@/lib/security/csp-report`.
 */

// Reports arrive in bursts (one per blocked script per page view), so the
// budget is generous; it only stops a single client flooding the logs.
const LIMITER = makeLimiter("csp-report-ip", 120, 60)
const MAX_BODY_BYTES = 64 * 1024
const MAX_REPORTS = 20

export async function POST(req: NextRequest) {
  const denied = await enforceRateLimit(LIMITER, clientIp(req))
  if (denied) return denied

  const length = Number(req.headers.get("content-length") ?? 0)
  if (length > MAX_BODY_BYTES) {
    return new NextResponse(null, { status: 413 })
  }

  let raw: string
  try {
    raw = await req.text()
  } catch {
    return new NextResponse(null, { status: 400 })
  }
  if (raw.length > MAX_BODY_BYTES) {
    return new NextResponse(null, { status: 413 })
  }

  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    return new NextResponse(null, { status: 400 })
  }

  for (const violation of parseCspReports(body).slice(0, MAX_REPORTS)) {
    console.warn("[csp-report]", JSON.stringify(violation))
  }
  return new NextResponse(null, { status: 204 })
}
