import { describe, it, expect } from "vitest"
import {
  buildEnforcedCsp,
  buildStrictCsp,
  frameAncestorsFor,
  generateNonce,
  reportingEndpointsHeader,
} from "@/lib/security/csp"

describe("buildEnforcedCsp", () => {
  // The exact policies next.config.ts sent before the builder existed.
  // The enforced policy must not change while the strict one is
  // report-only.
  it("matches the previous production policy", () => {
    expect(buildEnforcedCsp({ isDev: false, frameAncestors: "'none'" })).toBe(
      "default-src 'self'; script-src 'self' 'unsafe-inline' https://va.vercel-scripts.com https://vercel.live; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: blob: https:; connect-src 'self' https:; frame-src 'self' https://vercel.live https://www.youtube.com https://www.youtube-nocookie.com https://player.vimeo.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    )
  })

  it("matches the previous dev policy", () => {
    expect(buildEnforcedCsp({ isDev: true, frameAncestors: "*" })).toBe(
      "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://va.vercel-scripts.com https://vercel.live; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: blob: https:; connect-src 'self' https: ws: wss:; frame-src 'self' https://vercel.live https://www.youtube.com https://www.youtube-nocookie.com https://player.vimeo.com; frame-ancestors *; base-uri 'self'; form-action 'self'",
    )
  })
})

describe("buildStrictCsp", () => {
  const directives = (policy: string) =>
    Object.fromEntries(
      policy.split("; ").map((d) => {
        const [name, ...values] = d.split(" ")
        return [name, values]
      }),
    )

  it("trusts scripts by nonce + strict-dynamic, with CSP2 fallbacks", () => {
    const d = directives(
      buildStrictCsp({ nonce: "abc123", isDev: false, frameAncestors: "'none'" }),
    )
    expect(d["script-src"]).toEqual([
      "'nonce-abc123'",
      "'strict-dynamic'",
      "https:",
      "'unsafe-inline'",
    ])
    expect(d["object-src"]).toEqual(["'none'"])
    expect(d["frame-ancestors"]).toEqual(["'none'"])
    expect(d["report-uri"]).toEqual(["/api/csp-report"])
    expect(d["report-to"]).toEqual(["csp-endpoint"])
  })

  it("adds unsafe-eval and ws: only in dev", () => {
    const prod = directives(
      buildStrictCsp({ nonce: "n", isDev: false, frameAncestors: "'none'" }),
    )
    const dev = directives(
      buildStrictCsp({ nonce: "n", isDev: true, frameAncestors: "'none'" }),
    )
    expect(prod["script-src"]).not.toContain("'unsafe-eval'")
    expect(dev["script-src"]).toContain("'unsafe-eval'")
    expect(prod["connect-src"]).not.toContain("ws:")
    expect(dev["connect-src"]).toContain("ws:")
  })

  it("keeps the shared directives of the enforced policy", () => {
    const strict = directives(
      buildStrictCsp({ nonce: "n", isDev: false, frameAncestors: "*" }),
    )
    const enforced = directives(
      buildEnforcedCsp({ isDev: false, frameAncestors: "*" }),
    )
    for (const name of [
      "default-src",
      "style-src",
      "font-src",
      "img-src",
      "connect-src",
      "frame-src",
      "frame-ancestors",
      "base-uri",
      "form-action",
    ]) {
      expect(strict[name], name).toEqual(enforced[name])
    }
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
