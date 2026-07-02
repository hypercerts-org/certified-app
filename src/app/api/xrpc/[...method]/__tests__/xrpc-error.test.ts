import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Tests for the XRPC proxy's `xrpcError` helper — the trust boundary
 * that decides what upstream error text reaches the client.
 *
 * Mirrors the posture pinned by `extractRouteError` in
 * src/lib/utils/__tests__/api.test.ts: 5xx (and message-less) errors
 * collapse to a generic string, and 4xx messages are echoed but with
 * secrets redacted via `redactSecrets`. atproto error strings have been
 * observed to embed JWTs / DPoP proofs / Bearer tokens, so a raw 4xx
 * echo can surface secret-shaped fragments to the browser (risk-001).
 *
 * The route module pulls in server-only deps (OAuth client, session,
 * atproto Agent) at import time, so we mock those to a no-op shell —
 * none of them are touched by `xrpcError`, which is a pure function.
 */

vi.mock("@/lib/auth/oauth-client", () => ({ getOAuthClient: vi.fn() }))
vi.mock("@/lib/auth/session", () => ({
  getSessionDid: vi.fn(),
  deleteSession: vi.fn(),
}))
vi.mock("@/lib/auth/csrf", () => ({ checkCsrf: vi.fn() }))
vi.mock("@/lib/atproto/did", () => ({
  resolvePdsUrl: vi.fn(),
  invalidateDidDoc: vi.fn(),
}))
vi.mock("@/lib/auth/rate-limit", () => ({
  checkAndIncrementWriteRate: vi.fn(),
  RATE_LIMITED_WRITE_COLLECTIONS: {},
  makeLimiter: (name: string, max: number, windowSec: number) => ({
    name,
    max,
    windowSec,
  }),
  enforceRateLimit: vi.fn(async () => null),
}))
vi.mock("@/lib/utils/ip", () => ({ clientIp: () => "test-ip" }))
vi.mock("@atproto/api", () => ({ Agent: class {} }))

beforeEach(() => {
  // xrpcError logs a (redacted) line on every call; silence it here —
  // log redaction is covered in log-safe.test.ts.
  vi.spyOn(console, "error").mockImplementation(() => undefined)
})

describe("xrpcError", () => {
  it("redacts a bare Bearer token in an echoed 400 message", async () => {
    const { xrpcError } = await import("../route")
    const { status, message } = xrpcError({
      status: 400,
      message: "bad token Bearer eyJabc.def.ghi",
    })
    expect(status).toBe(400)
    expect(message).not.toContain("eyJabc.def.ghi")
    expect(message).toContain("<")
  })

  it("redacts a JWT-shaped fragment in an echoed 4xx message", async () => {
    const { xrpcError } = await import("../route")
    const { message } = xrpcError({
      status: 401,
      message: "decode failed for eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.sig",
    })
    expect(message).not.toContain("eyJhbGciOiJIUzI1NiJ9")
    expect(message).toContain("<jwt>")
  })

  it("still echoes a clean 4xx message", () => {
    return import("../route").then(({ xrpcError }) => {
      const { status, message } = xrpcError({
        status: 400,
        message: "repo, collection, and rkey are required",
      })
      expect(status).toBe(400)
      expect(message).toBe("repo, collection, and rkey are required")
    })
  })

  it("collapses 5xx to a generic message regardless of upstream text", async () => {
    const { xrpcError } = await import("../route")
    const { status, message } = xrpcError({
      status: 500,
      message: "secret-shaped Bearer eyJabc.def.ghi leaked",
    })
    expect(status).toBe(500)
    expect(message).toBe("Internal server error")
  })

  it("preserves the atproto discriminator on a redacted 4xx", async () => {
    const { xrpcError } = await import("../route")
    const { code, message } = xrpcError({
      status: 400,
      error: "InvalidSwap",
      message: "swap failed Bearer eyJabc.def.ghi",
    })
    expect(code).toBe("InvalidSwap")
    expect(message).not.toContain("eyJabc.def.ghi")
  })

  it("clamps out-of-range upstream statuses to 500 (quality-016)", async () => {
    const { xrpcError } = await import("../route")
    // An upstream status of 0, a negative number, a >599 code, or a
    // non-integer would throw a RangeError when passed straight to
    // NextResponse.json(..., { status }); collapse them to 500.
    expect(xrpcError({ status: 0 }).status).toBe(500)
    expect(xrpcError({ status: -1 }).status).toBe(500)
    expect(xrpcError({ status: 1000 }).status).toBe(500)
    expect(xrpcError({ status: 199 }).status).toBe(500)
    expect(xrpcError({ status: 600 }).status).toBe(500)
    expect(xrpcError({ status: 404.5 }).status).toBe(500)
    // In-range statuses pass through unchanged.
    expect(xrpcError({ status: 404, message: "nope" }).status).toBe(404)
    expect(xrpcError({ status: 599 }).status).toBe(599)
  })
})
