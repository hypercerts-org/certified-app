import { describe, it, expect } from "vitest"
import type { NextRequest } from "next/server"
import { clientIp } from "../ip"

/**
 * `clientIp` only ever calls `request.headers.get(...)`, so a plain
 * `Request` (which has a Headers instance) is structurally compatible.
 * We cast to NextRequest to match the production signature.
 */
function reqWithHeaders(headers: Record<string, string>): NextRequest {
  return new Request("http://localhost/api/x", { headers }) as NextRequest
}

describe("clientIp", () => {
  it("prefers the Vercel-trusted x-real-ip header", () => {
    const req = reqWithHeaders({
      "x-real-ip": "203.0.113.7",
      "x-forwarded-for": "198.51.100.1, 203.0.113.99",
    })
    expect(clientIp(req)).toBe("203.0.113.7")
  })

  it("falls back to the RIGHTMOST x-forwarded-for hop (trusted edge) when x-real-ip is absent", () => {
    // Leftmost is client-controllable; the rightmost hop is the trusted
    // proxy that last appended itself.
    const req = reqWithHeaders({
      "x-forwarded-for": "198.51.100.1, 192.0.2.5, 203.0.113.99",
    })
    expect(clientIp(req)).toBe("203.0.113.99")
  })

  it("trims whitespace around forwarded values", () => {
    const req = reqWithHeaders({
      "x-forwarded-for": "  198.51.100.1 ,  203.0.113.99  ",
    })
    expect(clientIp(req)).toBe("203.0.113.99")
  })

  it("returns the single forwarded value when there is only one hop", () => {
    const req = reqWithHeaders({ "x-forwarded-for": "203.0.113.7" })
    expect(clientIp(req)).toBe("203.0.113.7")
  })

  it("ignores empty x-real-ip and falls through to forwarded-for", () => {
    const req = reqWithHeaders({
      "x-real-ip": "",
      "x-forwarded-for": "203.0.113.42",
    })
    expect(clientIp(req)).toBe("203.0.113.42")
  })

  it("skips empty segments in x-forwarded-for", () => {
    const req = reqWithHeaders({ "x-forwarded-for": "203.0.113.7, , " })
    expect(clientIp(req)).toBe("203.0.113.7")
  })

  it("returns 'unknown' when both headers are absent", () => {
    const req = reqWithHeaders({})
    expect(clientIp(req)).toBe("unknown")
  })

  it("returns 'unknown' when x-forwarded-for has no usable values", () => {
    const req = reqWithHeaders({ "x-forwarded-for": " , , " })
    expect(clientIp(req)).toBe("unknown")
  })
})
