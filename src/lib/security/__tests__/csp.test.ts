import { describe, it, expect } from "vitest"
import {
  buildCsp,
  frameAncestorsFor,
  generateNonce,
  reportingEndpointsHeader,
} from "@/lib/security/csp"

describe("buildCsp", () => {
  // The previous allowlist policy, with script-src replaced by nonce +
  // 'strict-dynamic' (CSP2 fallbacks after it), object-src 'none', and
  // reporting. Every other directive is unchanged.
  it("is the strict nonce-based policy in production", () => {
    expect(
      buildCsp({ nonce: "N", isDev: false, frameAncestors: "'none'" }),
    ).toBe(
      "default-src 'self'; script-src 'nonce-N' 'strict-dynamic' https: 'unsafe-inline'; object-src 'none'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: blob: https:; connect-src 'self' https:; frame-src 'self' https://vercel.live https://www.youtube.com https://www.youtube-nocookie.com https://player.vimeo.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; report-uri /api/csp-report; report-to csp-endpoint",
    )
  })

  it("adds unsafe-eval and ws: only in dev", () => {
    expect(
      buildCsp({ nonce: "N", isDev: true, frameAncestors: "*" }),
    ).toBe(
      "default-src 'self'; script-src 'nonce-N' 'strict-dynamic' 'unsafe-eval' https: 'unsafe-inline'; object-src 'none'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: blob: https:; connect-src 'self' https: ws: wss:; frame-src 'self' https://vercel.live https://www.youtube.com https://www.youtube-nocookie.com https://player.vimeo.com; frame-ancestors *; base-uri 'self'; form-action 'self'; report-uri /api/csp-report; report-to csp-endpoint",
    )
  })
})

describe("frameAncestorsFor", () => {
  it("opens framing only for the /embed surface", () => {
    expect(frameAncestorsFor("/embed")).toBe("*")
    expect(frameAncestorsFor("/embed/board/abc")).toBe("*")
    expect(frameAncestorsFor("/embedded")).toBe("'none'")
    expect(frameAncestorsFor("/welcome")).toBe("'none'")
  })
})

describe("generateNonce", () => {
  it("returns a fresh base64 value of 128 bits", () => {
    const a = generateNonce()
    const b = generateNonce()
    expect(a).not.toBe(b)
    expect(a).toMatch(/^[A-Za-z0-9+/]{22}==$/)
  })
})

describe("reportingEndpointsHeader", () => {
  it("names the report-to group", () => {
    expect(reportingEndpointsHeader()).toBe('csp-endpoint="/api/csp-report"')
  })
})
